import "dotenv/config";

import { stdin as input, stdout as output } from "node:process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";

import pg from "pg";

import { CATEGORY_CODES, CATEGORY_OPTIONS, categoryLabel } from "./feedback-categories.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanText(value) {
  return value.replace(/\s+/g, " ").trim();
}

export function validateReview(feedbackId, { transcript, category, summary }) {
  if (!UUID_PATTERN.test(feedbackId)) {
    throw new Error("A valid feedback ID is required.");
  }

  const cleanedTranscript = typeof transcript === "string" ? cleanText(transcript) : "";
  const cleanedSummary = typeof summary === "string" ? cleanText(summary) : "";

  if (!cleanedTranscript || cleanedTranscript.length > 20_000) {
    throw new Error("Corrected wording must be between 1 and 20,000 characters.");
  }
  if (!CATEGORY_CODES.has(category)) {
    throw new Error("Choose one of the listed categories.");
  }
  if (!cleanedSummary || cleanedSummary.length > 300) {
    throw new Error("Short description must be between 1 and 300 characters.");
  }

  return { transcript: cleanedTranscript, category, summary: cleanedSummary };
}

export async function saveReview(client, feedbackId, review, expectedRevision) {
  const checked = validateReview(feedbackId, review);

  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error("The review revision is invalid.");
  }

  const saved = await client.query(
    `UPDATE feedback
     SET reviewed_transcript = $2, reviewed_category = $3,
         reviewed_summary = $4, reviewed_at = NOW(),
         review_revision = review_revision + 1, updated_at = NOW()
     WHERE id = $1 AND review_revision = $5
       AND original_transcript IS NOT NULL
     RETURNING review_revision, reviewed_at`,
    [feedbackId, checked.transcript, checked.category, checked.summary, expectedRevision],
  );

  if (saved.rowCount !== 1) {
    throw new Error("This feedback changed while you were reviewing it. Run the command again to see the latest version.");
  }

  return saved.rows[0];
}

async function askCategory(terminal, defaultCategory) {
  console.log("\nChoose the category:");
  CATEGORY_OPTIONS.forEach(([code, label], index) => {
    console.log(`${index + 1}. ${label}${code === defaultCategory ? " (current)" : ""}`);
  });

  while (true) {
    const answer = (await terminal.question("Category number (Enter keeps current): ")).trim();

    if (!answer) return defaultCategory;

    const number = Number(answer);

    if (Number.isInteger(number) && number >= 1 && number <= CATEGORY_OPTIONS.length) {
      return CATEGORY_OPTIONS[number - 1][0];
    }

    console.log("Please enter a number from the list, or press Enter.");
  }
}

async function main() {
  const feedbackId = process.argv[2];

  if (!feedbackId || !UUID_PATTERN.test(feedbackId)) {
    throw new Error("Usage: npm run review:feedback -- <feedback ID>");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const found = await client.query(
      `SELECT original_transcript, classification_category, classification_summary,
              classification_needs_review, reviewed_transcript, reviewed_category,
              reviewed_summary, reviewed_at, review_revision
       FROM feedback WHERE id = $1`,
      [feedbackId],
    );
    const feedback = found.rows[0];

    if (!feedback) {
      throw new Error("Feedback not found.");
    }
    if (!feedback.original_transcript) {
      throw new Error("This feedback has no transcript yet. Wait for transcription before reviewing it.");
    }

    const currentTranscript = feedback.reviewed_transcript ?? feedback.original_transcript;
    const currentCategory = feedback.reviewed_category ?? feedback.classification_category ?? "OTHER";
    const currentSummary = feedback.reviewed_summary ?? feedback.classification_summary ?? currentTranscript;

    console.log(`\nFeedback ${feedbackId}`);
    console.log(`Original model transcript: ${feedback.original_transcript}`);
    console.log(`Model category: ${categoryLabel(feedback.classification_category ?? "OTHER")}`);
    console.log(`Model description: ${feedback.classification_summary ?? "(none)"}`);
    console.log(`Previously reviewed: ${feedback.reviewed_at ? "yes" : "no"}`);
    console.log("\nThe original model result will remain unchanged. You are saving a separate human review.");

    const terminal = readline.createInterface({ input, output });

    try {
      console.log(`\nCurrent wording: ${currentTranscript}`);
      const wordingAnswer = await terminal.question("Corrected wording (type the full sentence, or Enter to keep it): ");
      const transcript = cleanText(wordingAnswer) || currentTranscript;
      const category = await askCategory(terminal, currentCategory);
      const suggestedSummary = cleanText(wordingAnswer) ? transcript : currentSummary;

      console.log(`\nSuggested short description: ${suggestedSummary}`);
      const summaryAnswer = await terminal.question("Short description (type a replacement, or Enter to keep it): ");
      const summary = cleanText(summaryAnswer) || suggestedSummary;
      const checked = validateReview(feedbackId, { transcript, category, summary });

      console.log("\nReview to save:");
      console.log(`Corrected wording: ${checked.transcript}`);
      console.log(`Category: ${categoryLabel(checked.category)}`);
      console.log(`Short description: ${checked.summary}`);

      const answer = (await terminal.question("Save this review? Type yes to confirm: ")).trim().toLowerCase();

      if (answer !== "yes") {
        console.log("No review was saved.");
        return;
      }

      await saveReview(client, feedbackId, checked, feedback.review_revision);
      console.log(`Human review saved for ${feedbackId}. The original model result is unchanged.`);
    } finally {
      terminal.close();
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("Review could not be saved:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
