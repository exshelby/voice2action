ALTER TABLE "feedback"
ADD COLUMN "reviewed_transcript" TEXT,
ADD COLUMN "reviewed_category" TEXT,
ADD COLUMN "reviewed_summary" TEXT,
ADD COLUMN "reviewed_at" TIMESTAMP(3),
ADD COLUMN "review_revision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "feedback"
ADD CONSTRAINT "feedback_review_complete" CHECK (
  ("reviewed_at" IS NULL AND "reviewed_transcript" IS NULL AND "reviewed_category" IS NULL AND "reviewed_summary" IS NULL)
  OR
  ("reviewed_at" IS NOT NULL AND "reviewed_transcript" IS NOT NULL AND "reviewed_category" IS NOT NULL AND "reviewed_summary" IS NOT NULL)
);

ALTER TABLE "feedback"
ADD CONSTRAINT "feedback_reviewed_category_valid" CHECK (
  "reviewed_category" IS NULL OR "reviewed_category" IN (
    'DELIVERY_DELAY', 'DELIVERY_PROBLEM', 'PRODUCT_QUALITY',
    'BILLING_PAYMENT', 'CUSTOMER_SERVICE', 'APP_TECHNICAL',
    'SUGGESTION', 'COMPLIMENT', 'OTHER'
  )
);
