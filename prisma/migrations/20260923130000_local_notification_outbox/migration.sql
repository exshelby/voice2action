CREATE TYPE "notification_type" AS ENUM ('TICKET_ASSIGNED');
CREATE TYPE "notification_status" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

CREATE TABLE "notification" (
  "id" SERIAL NOT NULL,
  "ticket_id" UUID NOT NULL,
  "team" "ticket_team" NOT NULL,
  "event_type" "notification_type" NOT NULL,
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" "notification_status" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "sent_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_attempt_count_nonnegative" CHECK ("attempt_count" >= 0),
  CONSTRAINT "notification_subject_length" CHECK (char_length("subject") BETWEEN 1 AND 500),
  CONSTRAINT "notification_message_length" CHECK (char_length("message") BETWEEN 1 AND 20000),
  CONSTRAINT "notification_sent_state" CHECK (
    ("status" = 'SENT' AND "sent_at" IS NOT NULL)
    OR
    ("status" <> 'SENT' AND "sent_at" IS NULL)
  )
);

CREATE UNIQUE INDEX "notification_ticket_id_event_type_key"
ON "notification"("ticket_id", "event_type");
CREATE INDEX "notification_status_created_at_idx"
ON "notification"("status", "created_at");
CREATE INDEX "notification_team_status_idx"
ON "notification"("team", "status");

ALTER TABLE "notification"
ADD CONSTRAINT "notification_ticket_id_fkey"
FOREIGN KEY ("ticket_id") REFERENCES "ticket"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "queue_ticket_assignment_notification"()
RETURNS TRIGGER AS $$
DECLARE
  should_queue BOOLEAN := FALSE;
BEGIN
  IF NEW."assigned_team" IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      should_queue := TRUE;
    ELSIF OLD."assigned_team" IS DISTINCT FROM NEW."assigned_team" THEN
      should_queue := TRUE;
    END IF;
  END IF;

  IF should_queue THEN
    INSERT INTO "notification" (
      "ticket_id", "team", "event_type", "subject", "message", "updated_at"
    )
    VALUES (
      NEW."id",
      NEW."assigned_team",
      'TICKET_ASSIGNED',
      'New ticket TKT-' || lpad(NEW."ticket_number"::text, 6, '0') || ': ' || NEW."title",
      'TKT-' || lpad(NEW."ticket_number"::text, 6, '0') || ' was assigned to your team. ' || NEW."description",
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("ticket_id", "event_type") DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ticket_assignment_notification_trigger"
AFTER INSERT OR UPDATE OF "assigned_team" ON "ticket"
FOR EACH ROW
EXECUTE FUNCTION "queue_ticket_assignment_notification"();

INSERT INTO "notification" (
  "ticket_id", "team", "event_type", "subject", "message", "updated_at"
)
SELECT
  "id",
  "assigned_team",
  'TICKET_ASSIGNED',
  'New ticket TKT-' || lpad("ticket_number"::text, 6, '0') || ': ' || "title",
  'TKT-' || lpad("ticket_number"::text, 6, '0') || ' was assigned to your team. ' || "description",
  CURRENT_TIMESTAMP
FROM "ticket"
WHERE "assigned_team" IS NOT NULL
ON CONFLICT ("ticket_id", "event_type") DO NOTHING;
