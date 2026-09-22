import "dotenv/config";

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { CATEGORY_CODES } from "./feedback-categories.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const classifierScript = resolve(projectRoot, "scripts", "local_classify.py");
const defaultPython = resolve(
  projectRoot,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function classifyTranscript(transcript) {
  const python = process.env.CLASSIFY_PYTHON ||
    (existsSync(defaultPython) ? defaultPython : "python");

  const output = await new Promise((resolveOutput, rejectOutput) => {
    const child = spawn(python, [classifierScript], {
      cwd: projectRoot,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 30_000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdin.on("error", () => undefined);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 1_000_000) child.kill();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 1_000_000) child.kill();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectOutput(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        rejectOutput(new Error(stderr.trim().slice(0, 500) || "The local classifier failed."));
      } else {
        resolveOutput(stdout);
      }
    });
    child.stdin.end(transcript);
  });

  const result = JSON.parse(output);

  if (
    !CATEGORY_CODES.has(result.category) ||
    typeof result.summary !== "string" ||
    !result.summary.trim() ||
    result.summary.length > 300 ||
    typeof result.score !== "number" ||
    !Number.isFinite(result.score) ||
    result.score < 0 ||
    result.score > 1 ||
    typeof result.needsReview !== "boolean" ||
    result.model !== "local-tfidf-v1"
  ) {
    throw new Error("The local classifier returned an invalid result.");
  }

  return result;
}

export async function processNextClassification(client, classify = classifyTranscript, feedbackId = null) {
  const claimed = await client.query(
    `UPDATE feedback
     SET classification_started_at = NOW(), classification_error = NULL, updated_at = NOW()
     WHERE id = (
       SELECT id FROM feedback
       WHERE status = 'PROCESSED'
         AND original_transcript IS NOT NULL
         AND classification_category IS NULL
         AND (classification_error IS NULL OR $1::uuid IS NOT NULL)
         AND (classification_started_at IS NULL OR classification_started_at < NOW() - INTERVAL '30 minutes')
         AND ($1::uuid IS NULL OR id = $1::uuid)
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING id, original_transcript`,
    [feedbackId],
  );
  const feedback = claimed.rows[0];

  if (!feedback) return false;

  try {
    const result = await classify(feedback.original_transcript);

    if (
      !CATEGORY_CODES.has(result.category) ||
      typeof result.summary !== "string" ||
      !result.summary.trim() ||
      typeof result.score !== "number" ||
      !Number.isFinite(result.score) ||
      result.score < 0 ||
      result.score > 1 ||
      typeof result.needsReview !== "boolean" ||
      result.model !== "local-tfidf-v1"
    ) {
      throw new Error("The local classifier returned an invalid result.");
    }

    const saved = await client.query(
      `UPDATE feedback
       SET classification_category = $2, classification_summary = $3,
           classification_score = $4, classification_needs_review = $5,
           classification_model = $6, classified_at = NOW(),
           classification_started_at = NULL, classification_error = NULL,
           updated_at = NOW()
       WHERE id = $1 AND classification_started_at IS NOT NULL
         AND classification_category IS NULL`,
      [feedback.id, result.category, result.summary.trim(), result.score, result.needsReview, result.model],
    );

    if (saved.rowCount !== 1) {
      throw new Error("Feedback changed before its category could be saved.");
    }

    console.log(`Classified feedback ${feedback.id}: ${result.category}${result.needsReview ? " (review needed)" : ""}.`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const safeMessage = detail.slice(0, 500);

    await client.query(
      `UPDATE feedback
       SET classification_started_at = NULL, classification_error = $2, updated_at = NOW()
       WHERE id = $1 AND classification_category IS NULL`,
      [feedback.id, safeMessage],
    );
    console.error(`Classification failed for ${feedback.id}: ${safeMessage}`);
  }

  return true;
}

async function main() {
  const mode = process.argv[2];
  const feedbackId = process.argv[3] || null;

  if (mode !== "--once" && mode !== "--watch") {
    throw new Error("Use --once or --watch.");
  }
  if (feedbackId && (mode !== "--once" || !UUID_PATTERN.test(feedbackId))) {
    throw new Error("An optional feedback ID can only be used with --once.");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    do {
      const processed = await processNextClassification(client, classifyTranscript, feedbackId);

      if (!processed && mode === "--once") {
        console.log("No matching transcript is waiting for classification.");
      }
      if (mode === "--watch" && !processed) {
        await new Promise((resolveSleep) => setTimeout(resolveSleep, 5_000));
      }
    } while (mode === "--watch");
  } finally {
    await client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("Classification worker could not start:", error);
    process.exitCode = 1;
  });
}
