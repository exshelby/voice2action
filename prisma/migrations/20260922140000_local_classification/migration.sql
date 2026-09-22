ALTER TABLE "feedback"
ADD COLUMN "classification_started_at" TIMESTAMP(3),
ADD COLUMN "classification_category" TEXT,
ADD COLUMN "classification_summary" TEXT,
ADD COLUMN "classification_score" DOUBLE PRECISION,
ADD COLUMN "classification_needs_review" BOOLEAN,
ADD COLUMN "classification_model" TEXT,
ADD COLUMN "classified_at" TIMESTAMP(3),
ADD COLUMN "classification_error" TEXT;

CREATE INDEX "feedback_classification_queue_idx"
ON "feedback" ("created_at")
WHERE "status" = 'PROCESSED'
  AND "original_transcript" IS NOT NULL
  AND "classification_category" IS NULL
  AND "classification_error" IS NULL;
