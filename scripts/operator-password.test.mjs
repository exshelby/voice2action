import assert from "node:assert/strict";
import test from "node:test";

import {
  hashOperatorPassword,
  isValidOperatorUsername,
  normalizeOperatorUsername,
  validateOperatorPassword,
  verifyOperatorPassword,
} from "../lib/operator-password.mjs";

test("operator usernames normalize to a constrained local identifier", () => {
  assert.equal(normalizeOperatorUsername("  Abel.Olaboye  "), "abel.olaboye");
  assert.equal(isValidOperatorUsername("abel.olaboye"), true);
  assert.equal(isValidOperatorUsername("No Spaces"), false);
  assert.equal(isValidOperatorUsername("ab"), false);
});

test("operator passwords require a meaningful minimum length", () => {
  assert.doesNotThrow(() => validateOperatorPassword("correct horse battery staple"));
  assert.throws(() => validateOperatorPassword("too-short"));
});

test("scrypt password hashes verify without storing the password", async () => {
  const password = "correct horse battery staple";
  const stored = await hashOperatorPassword(password);

  assert.match(stored, /^scrypt\$16384\$8\$1\$/);
  assert.equal(stored.includes(password), false);
  assert.equal(await verifyOperatorPassword(password, stored), true);
  assert.equal(await verifyOperatorPassword("different password", stored), false);
  assert.equal(await verifyOperatorPassword(password, "not-a-valid-hash"), false);
});
