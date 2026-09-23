CREATE TYPE "ticket_status" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

CREATE TABLE "ticket" (
  "id" UUID NOT NULL,
  "ticket_number" SERIAL NOT NULL,
  "feedback_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "source_review_revision" INTEGER NOT NULL,
  "source_reviewed_at" TIMESTAMP(3) NOT NULL,
  "status" "ticket_status" NOT NULL DEFAULT 'OPEN',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ticket_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ticket_title_length" CHECK (char_length("title") BETWEEN 1 AND 300),
  CONSTRAINT "ticket_description_length" CHECK (char_length("description") BETWEEN 1 AND 20000),
  CONSTRAINT "ticket_review_revision_positive" CHECK ("source_review_revision" > 0),
  CONSTRAINT "ticket_category_valid" CHECK ("category" IN (
    'DELIVERY_DELAY', 'DELIVERY_PROBLEM', 'PRODUCT_QUALITY',
    'BILLING_PAYMENT', 'CUSTOMER_SERVICE', 'APP_TECHNICAL',
    'SUGGESTION', 'COMPLIMENT', 'OTHER'
  ))
);

CREATE UNIQUE INDEX "ticket_ticket_number_key" ON "ticket"("ticket_number");
CREATE UNIQUE INDEX "ticket_feedback_id_key" ON "ticket"("feedback_id");
CREATE INDEX "ticket_status_idx" ON "ticket"("status");
CREATE INDEX "ticket_created_at_idx" ON "ticket"("created_at");

ALTER TABLE "ticket"
ADD CONSTRAINT "ticket_feedback_id_fkey"
FOREIGN KEY ("feedback_id") REFERENCES "feedback"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
