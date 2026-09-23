CREATE TABLE "ticket_status_event" (
  "id" SERIAL NOT NULL,
  "ticket_id" UUID NOT NULL,
  "from_status" "ticket_status",
  "to_status" "ticket_status" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ticket_status_event_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ticket_status_event_transition_changes_status" CHECK (
    "from_status" IS NULL OR "from_status" <> "to_status"
  )
);

CREATE INDEX "ticket_status_event_ticket_id_created_at_idx"
ON "ticket_status_event"("ticket_id", "created_at");

ALTER TABLE "ticket_status_event"
ADD CONSTRAINT "ticket_status_event_ticket_id_fkey"
FOREIGN KEY ("ticket_id") REFERENCES "ticket"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "ticket_status_event" ("ticket_id", "from_status", "to_status", "created_at")
SELECT "id", NULL, "status", CURRENT_TIMESTAMP
FROM "ticket";

CREATE FUNCTION "record_ticket_status_event"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "ticket_status_event" ("ticket_id", "from_status", "to_status")
    VALUES (NEW."id", NULL, NEW."status");
  ELSIF OLD."status" IS DISTINCT FROM NEW."status" THEN
    INSERT INTO "ticket_status_event" ("ticket_id", "from_status", "to_status")
    VALUES (NEW."id", OLD."status", NEW."status");
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ticket_status_event_trigger"
AFTER INSERT OR UPDATE OF "status" ON "ticket"
FOR EACH ROW
EXECUTE FUNCTION "record_ticket_status_event"();
