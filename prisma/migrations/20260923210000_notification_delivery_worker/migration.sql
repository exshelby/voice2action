ALTER TABLE "notification"
ADD COLUMN "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "delivery_claim_token" UUID,
ADD COLUMN "delivery_lease_expires_at" TIMESTAMP(3);

UPDATE "notification"
SET
  "status" = 'PENDING',
  "next_attempt_at" = CURRENT_TIMESTAMP,
  "last_error" = COALESCE("last_error", 'Recovered an unfinished pre-worker delivery attempt.'),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'SENDING';

DROP INDEX "notification_status_created_at_idx";

CREATE INDEX "notification_status_next_attempt_at_created_at_idx"
ON "notification"("status", "next_attempt_at", "created_at");

ALTER TABLE "notification"
ADD CONSTRAINT "notification_delivery_claim_state" CHECK (
  (
    "status" = 'SENDING'
    AND "delivery_claim_token" IS NOT NULL
    AND "delivery_lease_expires_at" IS NOT NULL
  )
  OR
  (
    "status" <> 'SENDING'
    AND "delivery_claim_token" IS NULL
    AND "delivery_lease_expires_at" IS NULL
  )
);
