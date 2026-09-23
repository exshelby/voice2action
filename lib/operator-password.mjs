import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 32;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;

export function normalizeOperatorUsername(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidOperatorUsername(value) {
  return USERNAME_PATTERN.test(value);
}

export function validateOperatorPassword(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > 200) {
    throw new Error("Password must contain between 12 and 200 characters.");
  }
}

async function derive(password, salt, n, r, p) {
  return scrypt(password, salt, KEY_LENGTH, {
    N: n,
    r,
    p,
    maxmem: SCRYPT_MAX_MEMORY,
  });
}

export async function hashOperatorPassword(password) {
  validateOperatorPassword(password);
  const salt = randomBytes(16);
  const derived = await derive(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);

  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export async function verifyOperatorPassword(password, storedHash) {
  const [algorithm, rawN, rawR, rawP, rawSalt, rawDerived, ...extra] = String(storedHash).split("$");
  const n = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);

  if (
    algorithm !== "scrypt" ||
    extra.length > 0 ||
    !Number.isSafeInteger(n) || n !== SCRYPT_N ||
    !Number.isSafeInteger(r) || r !== SCRYPT_R ||
    !Number.isSafeInteger(p) || p !== SCRYPT_P ||
    !rawSalt || !rawDerived
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(rawSalt, "base64url");
    const expected = Buffer.from(rawDerived, "base64url");
    const actual = await derive(password, salt, n, r, p);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
