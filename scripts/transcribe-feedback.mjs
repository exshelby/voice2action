import "dotenv/config";

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import pg from "pg";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const storageRoot = resolve(projectRoot, "storage");
const modelCache = resolve(storageRoot, "models");
const transcriberScript = resolve(projectRoot, "scripts", "local_transcribe.py");
const defaultPython = resolve(
  projectRoot,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const AUDIO_KEY_PATTERN = /^audio\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(webm|ogg|m4a|mp3|wav)$/;

export function audioPathFor(feedbackId, audioObjectKey) {
  const match = AUDIO_KEY_PATTERN.exec(audioObjectKey);

  if (!match || match[1] !== feedbackId) {
    throw new Error("The stored audio key is invalid for this feedback ID.");
  }

  return resolve(storageRoot, "audio", `${match[1]}.${match[2]}`);
}

export async function transcribeAudio(audioPath) {
  const python = process.env.TRANSCRIBE_PYTHON ||
    (existsSync(defaultPython) ? defaultPython : "python");
  const model = process.env.WHISPER_MODEL || "base";
  const { stdout } = await execFileAsync(
    python,
    [transcriberScript, audioPath, "--model", model, "--model-cache", modelCache],
    {
      cwd: projectRoot,
      timeout: 30 * 60 * 1000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, HF_HUB_OFFLINE: "1" },
    },
  );
  const result = JSON.parse(stdout);

  if (typeof result.transcript !== "string" || !result.transcript.trim()) {
    throw new Error("The local model returned an empty transcript.");
  }

  return result.transcript.trim();
}

export async function processNextFeedback(client, transcribe = transcribeAudio) {
  const claimed = await client.query(`
    UPDATE feedback
    SET status = 'PROCESSING', transcription_error = NULL, updated_at = NOW()
    WHERE id = (
      SELECT id FROM feedback
      WHERE status = 'RECEIVED'
        AND transcription_requested_at IS NOT NULL
        AND original_transcript IS NULL
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, audio_object_key
  `);

  const feedback = claimed.rows[0];

  if (!feedback) {
    return false;
  }

  try {
    const audioPath = audioPathFor(feedback.id, feedback.audio_object_key);

    if (!existsSync(audioPath)) {
      throw new Error("The stored audio file is missing.");
    }

    const transcript = await transcribe(audioPath);

    if (typeof transcript !== "string" || !transcript.trim()) {
      throw new Error("The local model returned an empty transcript.");
    }

    const saved = await client.query(
      `UPDATE feedback
       SET original_transcript = $2, transcribed_at = NOW(),
           transcription_error = NULL, status = 'PROCESSED', updated_at = NOW()
       WHERE id = $1 AND status = 'PROCESSING'`,
      [feedback.id, transcript.trim()],
    );

    if (saved.rowCount !== 1) {
      throw new Error("Feedback changed status before the transcript could be saved.");
    }

    console.log(`Transcribed feedback ${feedback.id}.`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const safeMessage = detail.slice(0, 500);

    await client.query(
      `UPDATE feedback
       SET status = 'FAILED', transcription_error = $2, updated_at = NOW()
       WHERE id = $1 AND status = 'PROCESSING'`,
      [feedback.id, safeMessage],
    );
    console.error(`Transcription failed for ${feedback.id}: ${safeMessage}`);
  }

  return true;
}

async function main() {
  const mode = process.argv[2];

  if (mode !== "--once" && mode !== "--watch") {
    throw new Error("Use --once or --watch.");
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    do {
      const processed = await processNextFeedback(client);

      if (!processed && mode === "--once") {
        console.log("No feedback is waiting for transcription.");
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
    console.error("Transcription worker could not start:", error);
    process.exitCode = 1;
  });
}
