import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCanRevokeOperatorSessions,
  assertSafeOperatorAccountTransition,
} from "../lib/operator-account-policy.mjs";

const baseTransition = {
  actorId: "admin-1",
  targetId: "admin-2",
  currentRole: "ADMIN",
  currentActive: true,
  nextRole: "MANAGER",
  nextActive: true,
  activeAdministratorCount: 2,
};

test("an administrator can demote another administrator when one remains", () => {
  assert.doesNotThrow(() => assertSafeOperatorAccountTransition(baseTransition));
});

test("the final active administrator cannot be demoted or deactivated", () => {
  assert.throws(
    () => assertSafeOperatorAccountTransition({ ...baseTransition, activeAdministratorCount: 1 }),
    /At least one active Administrator account must remain/,
  );
  assert.throws(
    () => assertSafeOperatorAccountTransition({
      ...baseTransition,
      nextRole: "ADMIN",
      nextActive: false,
      activeAdministratorCount: 1,
    }),
    /At least one active Administrator account must remain/,
  );
});

test("administrators cannot remove their own access", () => {
  assert.throws(
    () => assertSafeOperatorAccountTransition({ ...baseTransition, targetId: "admin-1" }),
    /cannot remove your own Administrator access/,
  );
});

test("routine updates do not trigger the final-administrator safeguard", () => {
  assert.doesNotThrow(() => assertSafeOperatorAccountTransition({
    ...baseTransition,
    currentRole: "MANAGER",
    nextRole: "OPERATOR",
    activeAdministratorCount: 1,
  }));
});

test("administrators must sign out instead of revoking their own session", () => {
  assert.throws(
    () => assertCanRevokeOperatorSessions("admin-1", "admin-1"),
    /Use Sign out/,
  );
  assert.doesNotThrow(() => assertCanRevokeOperatorSessions("admin-1", "operator-1"));
});
