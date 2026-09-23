import assert from "node:assert/strict";
import test from "node:test";

import {
  assertMinimumOperatorRole,
  hasMinimumOperatorRole,
  isOperatorRole,
  normalizeOperatorRole,
  operatorRoleLabel,
} from "../lib/operator-roles.mjs";

test("operator roles normalize and validate CLI input", () => {
  assert.equal(normalizeOperatorRole(" manager "), "MANAGER");
  assert.equal(isOperatorRole("admin"), true);
  assert.equal(isOperatorRole("owner"), false);
});

test("operator role hierarchy grants only equal or higher access", () => {
  assert.equal(hasMinimumOperatorRole("OPERATOR", "OPERATOR"), true);
  assert.equal(hasMinimumOperatorRole("OPERATOR", "MANAGER"), false);
  assert.equal(hasMinimumOperatorRole("MANAGER", "OPERATOR"), true);
  assert.equal(hasMinimumOperatorRole("MANAGER", "ADMIN"), false);
  assert.equal(hasMinimumOperatorRole("ADMIN", "MANAGER"), true);
});

test("role labels are human-readable and assertions fail closed", () => {
  assert.equal(operatorRoleLabel("ADMIN"), "Administrator");
  assert.equal(operatorRoleLabel("invalid"), "Unknown role");
  assert.throws(
    () => assertMinimumOperatorRole("OPERATOR", "MANAGER"),
    /does not permit this action/,
  );
  assert.doesNotThrow(() => assertMinimumOperatorRole("ADMIN", "MANAGER"));
});
