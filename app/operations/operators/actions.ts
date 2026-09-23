"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import {
  OperatorAccountEventType,
  OperatorRole,
  type OperatorRole as OperatorRoleValue,
  type Prisma,
} from "@/generated/prisma/client";
import {
  assertCanRevokeOperatorSessions,
  assertSafeOperatorAccountTransition,
} from "@/lib/operator-account-policy.mjs";
import {
  hashOperatorPassword,
  isValidOperatorUsername,
  normalizeOperatorUsername,
  validateOperatorPassword,
} from "@/lib/operator-password.mjs";
import { isOperatorRole, normalizeOperatorRole } from "@/lib/operator-roles.mjs";
import { prisma } from "@/lib/prisma";

import { requireOperationsRole } from "../security";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OperatorManagementState = {
  error?: string;
  success?: string;
  revision: number;
};

type LockedOperator = {
  id: string;
  username: string;
  role: OperatorRoleValue;
  active: boolean;
};

function cleanDisplayName(value: FormDataEntryValue | null) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function state(error?: string, success?: string): OperatorManagementState {
  return { error, success, revision: Date.now() };
}

const SAFE_OPERATOR_ERRORS = new Set([
  "Administrator permission is required for account management.",
  "At least one active Administrator account must remain.",
  "Choose a different role or account status before saving.",
  "Operator account not found.",
  "Password must contain between 12 and 200 characters.",
  "Use Sign out instead of revoking your own sessions.",
  "You cannot remove your own Administrator access.",
]);

function expectedError(error: unknown) {
  if (error instanceof Error && SAFE_OPERATOR_ERRORS.has(error.message)) {
    return error.message;
  }

  return "The operator account could not be updated.";
}

async function lockOperatorAdministration(transaction: Prisma.TransactionClient) {
  await transaction.$queryRaw<Array<{ locked: boolean }>>`
    WITH administration_lock AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(hashtext('voice2action.operator-administration'))
    )
    SELECT TRUE AS locked
    FROM administration_lock
  `;
}

async function lockActingAdministrator(transaction: Prisma.TransactionClient, operatorId: string) {
  const rows = await transaction.$queryRaw<LockedOperator[]>`
    SELECT id, username, role, active
    FROM operator
    WHERE id = ${operatorId}::uuid
    FOR UPDATE
  `;
  const operator = rows[0];

  if (!operator || !operator.active || operator.role !== OperatorRole.ADMIN) {
    throw new Error("Administrator permission is required for account management.");
  }

  return operator;
}

export async function createOperatorAccount(
  _previousState: OperatorManagementState,
  formData: FormData,
): Promise<OperatorManagementState> {
  const actor = await requireOperationsRole(OperatorRole.ADMIN);
  const username = normalizeOperatorUsername(formData.get("username"));
  const displayName = cleanDisplayName(formData.get("displayName"));
  const password = String(formData.get("password") ?? "");
  const passwordConfirmation = String(formData.get("passwordConfirmation") ?? "");
  const requestedRole = normalizeOperatorRole(formData.get("role"));
  const confirmed = formData.get("confirmed") === "yes";

  if (!isValidOperatorUsername(username)) {
    return state("Username must be 3-64 lowercase letters, numbers, dots, underscores, or hyphens.");
  }
  if (displayName.length < 2 || displayName.length > 100) {
    return state("Display name must contain between 2 and 100 characters.");
  }
  if (!isOperatorRole(requestedRole) || requestedRole === OperatorRole.ADMIN) {
    return state("New browser-created accounts must start as Operator or Manager.");
  }
  if (password !== passwordConfirmation) {
    return state("Passwords did not match.");
  }
  if (!confirmed) {
    return state("Confirm creation of this local operator account.");
  }

  try {
    validateOperatorPassword(password);
    const passwordHash = await hashOperatorPassword(password);
    const operatorId = randomUUID();
    const role = requestedRole as OperatorRoleValue;

    await prisma.$transaction(async (transaction) => {
      await lockOperatorAdministration(transaction);
      await lockActingAdministrator(transaction, actor.id);
      await transaction.operator.create({
        data: { id: operatorId, username, displayName, passwordHash, role },
      });
      await transaction.operatorAccountEvent.create({
        data: {
          actorOperatorId: actor.id,
          targetOperatorId: operatorId,
          eventType: OperatorAccountEventType.CREATED,
          afterRole: role,
          afterActive: true,
        },
      });
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return state(`Username ${username} already exists.`);
    }
    return state(expectedError(error));
  }

  revalidatePath("/operations/operators");
  return state(undefined, `Created ${displayName} (@${username}).`);
}

export async function updateOperatorAccount(
  _previousState: OperatorManagementState,
  formData: FormData,
): Promise<OperatorManagementState> {
  const actor = await requireOperationsRole(OperatorRole.ADMIN);
  const targetOperatorId = String(formData.get("operatorId") ?? "");
  const requestedRole = normalizeOperatorRole(formData.get("role"));
  const nextActive = formData.get("active") === "yes";
  const confirmed = formData.get("confirmed") === "yes";

  if (!UUID_PATTERN.test(targetOperatorId)) {
    return state("A valid operator ID is required.");
  }
  if (!isOperatorRole(requestedRole)) {
    return state("Choose a valid operator role.");
  }
  if (!confirmed) {
    return state("Confirm the role and account-status change.");
  }

  try {
    await prisma.$transaction(async (transaction) => {
      await lockOperatorAdministration(transaction);
      await lockActingAdministrator(transaction, actor.id);
      const rows = await transaction.$queryRaw<LockedOperator[]>`
        SELECT id, username, role, active
        FROM operator
        WHERE id = ${targetOperatorId}::uuid
        FOR UPDATE
      `;
      const target = rows[0];

      if (!target) {
        throw new Error("Operator account not found.");
      }

      const activeAdministrators = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM operator
        WHERE role = 'ADMIN'::operator_role AND active = TRUE
        ORDER BY id
        FOR UPDATE
      `;
      const nextRole = requestedRole as OperatorRoleValue;

      assertSafeOperatorAccountTransition({
        actorId: actor.id,
        targetId: target.id,
        currentRole: target.role,
        currentActive: target.active,
        nextRole,
        nextActive,
        activeAdministratorCount: activeAdministrators.length,
      });

      if (target.role === nextRole && target.active === nextActive) {
        throw new Error("Choose a different role or account status before saving.");
      }

      await transaction.operator.update({
        where: { id: target.id },
        data: {
          role: nextRole,
          active: nextActive,
          failedLoginCount: nextActive && !target.active ? 0 : undefined,
          lockedUntil: nextActive && !target.active ? null : undefined,
        },
      });

      if (!nextActive) {
        await transaction.operatorSession.deleteMany({ where: { operatorId: target.id } });
      }

      await transaction.operatorAccountEvent.create({
        data: {
          actorOperatorId: actor.id,
          targetOperatorId: target.id,
          eventType: OperatorAccountEventType.ACCOUNT_UPDATED,
          beforeRole: target.role,
          afterRole: nextRole,
          beforeActive: target.active,
          afterActive: nextActive,
        },
      });
    });
  } catch (error) {
    return state(expectedError(error));
  }

  revalidatePath("/operations/operators");
  return state(undefined, "Operator permissions updated.");
}

export async function revokeOperatorSessions(
  _previousState: OperatorManagementState,
  formData: FormData,
): Promise<OperatorManagementState> {
  const actor = await requireOperationsRole(OperatorRole.ADMIN);
  const targetOperatorId = String(formData.get("operatorId") ?? "");
  const confirmed = formData.get("confirmed") === "yes";

  if (!UUID_PATTERN.test(targetOperatorId)) {
    return state("A valid operator ID is required.");
  }
  if (!confirmed) {
    return state("Confirm revocation of this operator's active sessions.");
  }

  try {
    const revoked = await prisma.$transaction(async (transaction) => {
      await lockOperatorAdministration(transaction);
      await lockActingAdministrator(transaction, actor.id);
      assertCanRevokeOperatorSessions(actor.id, targetOperatorId);
      const target = await transaction.operator.findUnique({
        where: { id: targetOperatorId },
        select: { id: true },
      });

      if (!target) {
        throw new Error("Operator account not found.");
      }

      const deleted = await transaction.operatorSession.deleteMany({
        where: { operatorId: target.id },
      });
      await transaction.operatorAccountEvent.create({
        data: {
          actorOperatorId: actor.id,
          targetOperatorId: target.id,
          eventType: OperatorAccountEventType.SESSIONS_REVOKED,
        },
      });
      return deleted.count;
    });

    revalidatePath("/operations/operators");
    return state(undefined, revoked === 1 ? "Revoked 1 session." : `Revoked ${revoked} sessions.`);
  } catch (error) {
    return state(expectedError(error));
  }
}
