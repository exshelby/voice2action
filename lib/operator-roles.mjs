export const OPERATOR_ROLES = Object.freeze(["OPERATOR", "MANAGER", "ADMIN"]);

const ROLE_RANK = Object.freeze({
  OPERATOR: 1,
  MANAGER: 2,
  ADMIN: 3,
});

const ROLE_LABEL = Object.freeze({
  OPERATOR: "Operator",
  MANAGER: "Manager",
  ADMIN: "Administrator",
});

export function normalizeOperatorRole(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function isOperatorRole(value) {
  return Object.hasOwn(ROLE_RANK, normalizeOperatorRole(value));
}

export function operatorRoleLabel(value) {
  const role = normalizeOperatorRole(value);
  return ROLE_LABEL[role] ?? "Unknown role";
}

export function hasMinimumOperatorRole(actualRole, minimumRole) {
  const actual = normalizeOperatorRole(actualRole);
  const minimum = normalizeOperatorRole(minimumRole);
  return (ROLE_RANK[actual] ?? 0) >= (ROLE_RANK[minimum] ?? Number.POSITIVE_INFINITY);
}

export function assertMinimumOperatorRole(actualRole, minimumRole) {
  if (!hasMinimumOperatorRole(actualRole, minimumRole)) {
    throw new Error("Your operator role does not permit this action.");
  }
}
