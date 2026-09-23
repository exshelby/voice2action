CREATE TYPE "operator_account_event_type" AS ENUM (
  'CREATED',
  'ACCOUNT_UPDATED',
  'SESSIONS_REVOKED'
);

CREATE TABLE "operator_account_event" (
  "id" BIGSERIAL PRIMARY KEY,
  "actor_operator_id" UUID NOT NULL,
  "target_operator_id" UUID NOT NULL,
  "event_type" "operator_account_event_type" NOT NULL,
  "before_role" "operator_role",
  "after_role" "operator_role",
  "before_active" BOOLEAN,
  "after_active" BOOLEAN,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operator_account_event_actor_operator_id_fkey"
    FOREIGN KEY ("actor_operator_id") REFERENCES "operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "operator_account_event_target_operator_id_fkey"
    FOREIGN KEY ("target_operator_id") REFERENCES "operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "operator_account_event_target_operator_id_created_at_idx"
ON "operator_account_event"("target_operator_id", "created_at");

CREATE INDEX "operator_account_event_actor_operator_id_created_at_idx"
ON "operator_account_event"("actor_operator_id", "created_at");
