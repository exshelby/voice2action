import "dotenv/config";

import pg from "pg";

import { categoryLabel } from "./feedback-categories.mjs";

const feedbackId = process.argv[2];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (!feedbackId || !UUID_PATTERN.test(feedbackId)) {
  console.error("Usage: npm run transcribe:show -- <feedback ID>");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not configured.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  const result = await client.query(
    `SELECT status, original_transcript, transcribed_at, transcription_error,
            classification_category, classification_summary, classification_score,
            classification_needs_review, classified_at, classification_error,
            reviewed_transcript, reviewed_category, reviewed_summary, reviewed_at
     FROM feedback WHERE id = $1`,
    [feedbackId],
  );
  const feedback = result.rows[0];

  if (!feedback) {
    console.error("Feedback not found.");
    process.exitCode = 1;
  } else {
    console.log(`Status: ${feedback.status}`);
    console.log(`Transcript: ${feedback.original_transcript ?? "(not ready)"}`);

    if (feedback.transcribed_at) {
      console.log(`Transcribed at: ${feedback.transcribed_at.toISOString()}`);
    }

    if (feedback.transcription_error) {
      console.log(`Error: ${feedback.transcription_error}`);
    }

    if (feedback.classification_category) {
      console.log(`Model category: ${categoryLabel(feedback.classification_category)}`);
      console.log(`Model short description: ${feedback.classification_summary}`);
      console.log(`Model flagged for review: ${feedback.classification_needs_review ? "yes" : "no"}`);
      console.log(`Local match score: ${feedback.classification_score} (not a probability)`);
      console.log(`Classified at: ${feedback.classified_at.toISOString()}`);
    } else if (feedback.classification_error) {
      console.log(`Classification error: ${feedback.classification_error}`);
    } else if (feedback.original_transcript) {
      console.log("Classification: waiting for local classifier");
    }

    if (feedback.reviewed_at) {
      console.log(`Human review: complete at ${feedback.reviewed_at.toISOString()}`);
      console.log(`Corrected wording: ${feedback.reviewed_transcript}`);
      console.log(`Reviewed category: ${categoryLabel(feedback.reviewed_category)}`);
      console.log(`Reviewed short description: ${feedback.reviewed_summary}`);
    } else if (feedback.original_transcript) {
      console.log("Human review: pending (required before ticket creation)");
    }
  }
} catch (error) {
  console.error("Could not read feedback:", error);
  process.exitCode = 1;
} finally {
  await client.end();
}
