"use server";

import { redirect } from "next/navigation";

import {
  hashOperatorPassword,
  isValidOperatorUsername,
  normalizeOperatorUsername,
  verifyOperatorPassword,
} from "@/lib/operator-password.mjs";
import { prisma } from "@/lib/prisma";

import {
  createOperationsSession,
  deleteOperationsSession,
  requireLocalOperationsRequest,
} from "./security";

const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const dummyHash = hashOperatorPassword("voice2action timing-safe dummy password");

export type LoginState = { error?: string };

async function recordFailedLogin(operatorId: string, attemptedAt: Date) {
  await prisma.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<Array<{
      failed_login_count: number;
      locked_until: Date | null;
    }>>`
      SELECT failed_login_count, locked_until
      FROM operator
      WHERE id = ${operatorId}::uuid AND active = TRUE
      FOR UPDATE
    `;
    const current = rows[0];

    if (!current || (current.locked_until && current.locked_until > attemptedAt)) {
      return;
    }

    const priorFailures = current.locked_until && current.locked_until <= attemptedAt
      ? 0
      : current.failed_login_count;
    const failedLoginCount = priorFailures + 1;

    await transaction.operator.update({
      where: { id: operatorId },
      data: {
        failedLoginCount,
        lockedUntil: failedLoginCount >= MAX_FAILED_LOGINS
          ? new Date(attemptedAt.getTime() + LOCK_DURATION_MS)
          : null,
      },
    });
  });
}

export async function loginOperator(_state: LoginState, formData: FormData): Promise<LoginState> {
  await requireLocalOperationsRequest();

  const username = normalizeOperatorUsername(formData.get("username"));
  const password = String(formData.get("password") ?? "");
  const genericError = "Invalid username or password, or the account is temporarily locked.";

  if (!isValidOperatorUsername(username) || password.length < 1 || password.length > 200) {
    await verifyOperatorPassword(password, await dummyHash);
    return { error: genericError };
  }

  const operator = await prisma.operator.findUnique({ where: { username } });
  const passwordMatches = await verifyOperatorPassword(
    password,
    operator?.passwordHash ?? await dummyHash,
  );
  const now = new Date();
  const locked = Boolean(operator?.lockedUntil && operator.lockedUntil > now);

  if (!operator || !operator.active || locked || !passwordMatches) {
    if (operator?.active && !locked) {
      await recordFailedLogin(operator.id, now);
    }

    return { error: genericError };
  }

  await prisma.operator.update({
    where: { id: operator.id },
    data: { failedLoginCount: 0, lockedUntil: null },
  });
  await createOperationsSession(operator.id);
  redirect("/operations");
}

export async function logoutOperator() {
  await requireLocalOperationsRequest();
  await deleteOperationsSession();
  redirect("/operations/login");
}
