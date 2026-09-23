CREATE TABLE "operator" (
  "id" UUID NOT NULL,
  "username" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "failed_login_count" INTEGER NOT NULL DEFAULT 0,
  "locked_until" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "operator_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operator_username_format" CHECK ("username" ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
  CONSTRAINT "operator_failed_login_count_nonnegative" CHECK ("failed_login_count" >= 0)
);

CREATE UNIQUE INDEX "operator_username_key" ON "operator"("username");

CREATE TABLE "operator_session" (
  "id" UUID NOT NULL,
  "operator_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "operator_session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operator_session_token_hash_key" ON "operator_session"("token_hash");
CREATE INDEX "operator_session_operator_id_expires_at_idx" ON "operator_session"("operator_id", "expires_at");
CREATE INDEX "operator_session_expires_at_idx" ON "operator_session"("expires_at");

ALTER TABLE "operator_session"
ADD CONSTRAINT "operator_session_operator_id_fkey"
FOREIGN KEY ("operator_id") REFERENCES "operator"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "feedback" ADD COLUMN "reviewed_by_id" UUID;
ALTER TABLE "ticket" ADD COLUMN "created_by_id" UUID, ADD COLUMN "assigned_by_id" UUID;
ALTER TABLE "ticket_priority_event" ADD COLUMN "operator_id" UUID;
ALTER TABLE "ticket_status_event" ADD COLUMN "operator_id" UUID;
ALTER TABLE "ticket_worklog" ADD COLUMN "operator_id" UUID;
ALTER TABLE "notification" ADD COLUMN "delivered_by_id" UUID;

CREATE INDEX "feedback_reviewed_by_id_idx" ON "feedback"("reviewed_by_id");
CREATE INDEX "ticket_created_by_id_idx" ON "ticket"("created_by_id");
CREATE INDEX "ticket_assigned_by_id_idx" ON "ticket"("assigned_by_id");
CREATE INDEX "ticket_priority_event_operator_id_idx" ON "ticket_priority_event"("operator_id");
CREATE INDEX "ticket_status_event_operator_id_idx" ON "ticket_status_event"("operator_id");
CREATE INDEX "ticket_worklog_operator_id_idx" ON "ticket_worklog"("operator_id");
CREATE INDEX "notification_delivered_by_id_idx" ON "notification"("delivered_by_id");

ALTER TABLE "feedback" ADD CONSTRAINT "feedback_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_priority_event" ADD CONSTRAINT "ticket_priority_event_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_status_event" ADD CONSTRAINT "ticket_status_event_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_worklog" ADD CONSTRAINT "ticket_worklog_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification" ADD CONSTRAINT "notification_delivered_by_id_fkey" FOREIGN KEY ("delivered_by_id") REFERENCES "operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "record_ticket_status_event"()
RETURNS TRIGGER AS $$
DECLARE
  actor_id UUID := NULLIF(current_setting('voice2action.operator_id', TRUE), '')::UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "ticket_status_event" ("ticket_id", "from_status", "to_status", "operator_id")
    VALUES (NEW."id", NULL, NEW."status", COALESCE(actor_id, NEW."created_by_id"));
  ELSIF OLD."status" IS DISTINCT FROM NEW."status" THEN
    INSERT INTO "ticket_status_event" ("ticket_id", "from_status", "to_status", "operator_id")
    VALUES (NEW."id", OLD."status", NEW."status", actor_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "record_ticket_priority_event"()
RETURNS TRIGGER AS $$
DECLARE
  actor_id UUID := NULLIF(current_setting('voice2action.operator_id', TRUE), '')::UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "ticket_priority_event" ("ticket_id", "from_priority", "to_priority", "operator_id")
    VALUES (NEW."id", NULL, NEW."priority", COALESCE(actor_id, NEW."created_by_id"));
  ELSIF OLD."priority" IS DISTINCT FROM NEW."priority" THEN
    INSERT INTO "ticket_priority_event" ("ticket_id", "from_priority", "to_priority", "operator_id")
    VALUES (NEW."id", OLD."priority", NEW."priority", actor_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
