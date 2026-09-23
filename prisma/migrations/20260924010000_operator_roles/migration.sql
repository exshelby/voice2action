CREATE TYPE "operator_role" AS ENUM ('OPERATOR', 'MANAGER', 'ADMIN');

ALTER TABLE "operator"
ADD COLUMN "role" "operator_role" NOT NULL DEFAULT 'OPERATOR';

-- Preserve access for local accounts that existed before role enforcement.
UPDATE "operator"
SET "role" = 'ADMIN';
