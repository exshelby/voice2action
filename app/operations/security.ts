import "server-only";

import { headers } from "next/headers";

const LOCAL_HOST_PATTERNS = [
  /^localhost(?::\d+)?$/i,
  /^127\.0\.0\.1(?::\d+)?$/,
  /^\[::1\](?::\d+)?$/,
  /^::1$/,
];

export async function requireLocalOperationsRequest() {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || requestHeaders.get("host") || "";

  if (!LOCAL_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
    throw new Error("The operations dashboard is available only through localhost.");
  }
}
