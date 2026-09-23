CREATE TYPE "ticket_priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

ALTER TABLE "ticket"
ADD COLUMN "priority" "ticket_priority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN "response_due_at" TIMESTAMP(3),
ADD COLUMN "resolution_due_at" TIMESTAMP(3),
ADD COLUMN "responded_at" TIMESTAMP(3);

UPDATE "ticket"
SET
  "response_due_at" = "created_at" + INTERVAL '8 hours',
  "resolution_due_at" = "created_at" + INTERVAL '3 days';

ALTER TABLE "ticket"
ALTER COLUMN "response_due_at" SET NOT NULL,
ALTER COLUMN "resolution_due_at" SET NOT NULL;

CREATE INDEX "ticket_priority_idx" ON "ticket"("priority");
CREATE INDEX "ticket_response_due_at_idx" ON "ticket"("response_due_at");
CREATE INDEX "ticket_resolution_due_at_idx" ON "ticket"("resolution_due_at");

CREATE FUNCTION "apply_ticket_sla"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD."priority" IS DISTINCT FROM NEW."priority" THEN
    CASE NEW."priority"
      WHEN 'LOW' THEN
        NEW."response_due_at" := NEW."created_at" + INTERVAL '24 hours';
        NEW."resolution_due_at" := NEW."created_at" + INTERVAL '5 days';
      WHEN 'NORMAL' THEN
        NEW."response_due_at" := NEW."created_at" + INTERVAL '8 hours';
        NEW."resolution_due_at" := NEW."created_at" + INTERVAL '3 days';
      WHEN 'HIGH' THEN
        NEW."response_due_at" := NEW."created_at" + INTERVAL '2 hours';
        NEW."resolution_due_at" := NEW."created_at" + INTERVAL '24 hours';
      WHEN 'CRITICAL' THEN
        NEW."response_due_at" := NEW."created_at" + INTERVAL '30 minutes';
        NEW."resolution_due_at" := NEW."created_at" + INTERVAL '4 hours';
    END CASE;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD."status" = 'OPEN'
     AND NEW."status" <> 'OPEN'
     AND NEW."responded_at" IS NULL THEN
    NEW."responded_at" := CURRENT_TIMESTAMP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ticket_sla_trigger"
BEFORE INSERT OR UPDATE OF "priority", "status" ON "ticket"
FOR EACH ROW
EXECUTE FUNCTION "apply_ticket_sla"();

CREATE TABLE "ticket_priority_event" (
  "id" SERIAL NOT NULL,
  "ticket_id" UUID NOT NULL,
  "from_priority" "ticket_priority",
  "to_priority" "ticket_priority" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ticket_priority_event_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ticket_priority_event_changes_priority" CHECK (
    "from_priority" IS NULL OR "from_priority" <> "to_priority"
  )
);

CREATE INDEX "ticket_priority_event_ticket_id_created_at_idx"
ON "ticket_priority_event"("ticket_id", "created_at");

ALTER TABLE "ticket_priority_event"
ADD CONSTRAINT "ticket_priority_event_ticket_id_fkey"
FOREIGN KEY ("ticket_id") REFERENCES "ticket"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "ticket_priority_event" ("ticket_id", "from_priority", "to_priority", "created_at")
SELECT "id", NULL, "priority", CURRENT_TIMESTAMP
FROM "ticket";

CREATE FUNCTION "record_ticket_priority_event"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "ticket_priority_event" ("ticket_id", "from_priority", "to_priority")
    VALUES (NEW."id", NULL, NEW."priority");
  ELSIF OLD."priority" IS DISTINCT FROM NEW."priority" THEN
    INSERT INTO "ticket_priority_event" ("ticket_id", "from_priority", "to_priority")
    VALUES (NEW."id", OLD."priority", NEW."priority");
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ticket_priority_event_trigger"
AFTER INSERT OR UPDATE OF "priority" ON "ticket"
FOR EACH ROW
EXECUTE FUNCTION "record_ticket_priority_event"();
