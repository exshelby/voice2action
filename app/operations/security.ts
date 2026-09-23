import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE = "voice2action_operator_session";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const LOCAL_HOST_PATTERNS = [
  /^localhost(?::\d+)?$/i,
  /^127\.0\.0\.1(?::\d+)?$/,
  /^\[::1\](?::\d+)?$/,
  /^::1$/,
];

export type OperationsOperator = {
  id: string;
  username: string;
  displayName: string;
};

function sessionTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function requireLocalOperationsRequest() {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || requestHeaders.get("host") || "";

  if (!LOCAL_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
    throw new Error("The operations dashboard is available only through localhost.");
  }
}

export const getCurrentOperationsOperator = cache(async (): Promise<OperationsOperator | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token || token.length < 32 || token.length > 200) {
    return null;
  }

  const session = await prisma.operatorSession.findUnique({
    where: { tokenHash: sessionTokenHash(token) },
    select: {
      expiresAt: true,
      operator: {
        select: { id: true, username: true, displayName: true, active: true },
      },
    },
  });

  if (!session || session.expiresAt <= new Date() || !session.operator.active) {
    return null;
  }

  return {
    id: session.operator.id,
    username: session.operator.username,
    displayName: session.operator.displayName,
  };
});

export async function requireOperationsOperator() {
  await requireLocalOperationsRequest();
  const operator = await getCurrentOperationsOperator();

  if (!operator) {
    redirect("/operations/login");
  }

  return operator;
}

export async function createOperationsSession(operatorId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.$transaction([
    prisma.operatorSession.deleteMany({ where: { operatorId } }),
    prisma.operatorSession.create({
      data: { operatorId, tokenHash: sessionTokenHash(token), expiresAt },
    }),
  ]);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    path: "/operations",
    expires: expiresAt,
  });
}

export async function deleteOperationsSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await prisma.operatorSession.deleteMany({
      where: { tokenHash: sessionTokenHash(token) },
    });
  }

  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    path: "/operations",
    maxAge: 0,
  });
}

export async function withOperatorContext<T>(
  operatorId: string,
  callback: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT set_config('voice2action.operator_id', ${operatorId}, TRUE)`;
    return callback(transaction);
  });
}
