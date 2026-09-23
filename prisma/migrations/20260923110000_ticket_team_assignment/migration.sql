CREATE TYPE "ticket_team" AS ENUM (
  'LOGISTICS',
  'QUALITY',
  'FINANCE',
  'CUSTOMER_SUPPORT',
  'TECHNICAL_SUPPORT',
  'CUSTOMER_EXPERIENCE',
  'GENERAL_SUPPORT'
);

ALTER TABLE "ticket"
ADD COLUMN "assigned_team" "ticket_team",
ADD COLUMN "assignment_rule_version" INTEGER,
ADD COLUMN "assigned_at" TIMESTAMP(3),
ADD CONSTRAINT "ticket_assignment_complete" CHECK (
  ("assigned_team" IS NULL AND "assignment_rule_version" IS NULL AND "assigned_at" IS NULL)
  OR
  ("assigned_team" IS NOT NULL AND "assignment_rule_version" IS NOT NULL AND "assigned_at" IS NOT NULL)
),
ADD CONSTRAINT "ticket_assignment_rule_version_positive" CHECK (
  "assignment_rule_version" IS NULL OR "assignment_rule_version" > 0
);

CREATE INDEX "ticket_assigned_team_idx" ON "ticket"("assigned_team");
