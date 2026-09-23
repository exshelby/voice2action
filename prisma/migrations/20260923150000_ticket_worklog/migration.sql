CREATE TYPE "ticket_worklog_type" AS ENUM ('INVESTIGATION', 'RESOLUTION');

CREATE TABLE "ticket_worklog" (
  "id" SERIAL NOT NULL,
  "ticket_id" UUID NOT NULL,
  "type" "ticket_worklog_type" NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ticket_worklog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ticket_worklog_body_length" CHECK (char_length(btrim("body")) BETWEEN 1 AND 5000)
);

CREATE INDEX "ticket_worklog_ticket_id_created_at_idx"
ON "ticket_worklog"("ticket_id", "created_at");

ALTER TABLE "ticket_worklog"
ADD CONSTRAINT "ticket_worklog_ticket_id_fkey"
FOREIGN KEY ("ticket_id") REFERENCES "ticket"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
