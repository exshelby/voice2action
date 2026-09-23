export function assertSafeOperatorAccountTransition({
  actorId,
  targetId,
  currentRole,
  currentActive,
  nextRole,
  nextActive,
  activeAdministratorCount,
}) {
  const removesAdministratorAccess = currentRole === "ADMIN" && currentActive && (
    nextRole !== "ADMIN" || !nextActive
  );

  if (actorId === targetId && removesAdministratorAccess) {
    throw new Error("You cannot remove your own Administrator access.");
  }

  if (removesAdministratorAccess && activeAdministratorCount <= 1) {
    throw new Error("At least one active Administrator account must remain.");
  }
}

export function assertCanRevokeOperatorSessions(actorId, targetId) {
  if (actorId === targetId) {
    throw new Error("Use Sign out instead of revoking your own sessions.");
  }
}
