export const ASSIGNMENT_RULE_VERSION = 1;

const CATEGORY_TEAMS = Object.freeze({
  DELIVERY_DELAY: "LOGISTICS",
  DELIVERY_PROBLEM: "LOGISTICS",
  PRODUCT_QUALITY: "QUALITY",
  BILLING_PAYMENT: "FINANCE",
  CUSTOMER_SERVICE: "CUSTOMER_SUPPORT",
  APP_TECHNICAL: "TECHNICAL_SUPPORT",
  SUGGESTION: "CUSTOMER_EXPERIENCE",
  COMPLIMENT: "CUSTOMER_EXPERIENCE",
  OTHER: "GENERAL_SUPPORT",
});

const TEAM_LABELS = Object.freeze({
  LOGISTICS: "Logistics",
  QUALITY: "Quality",
  FINANCE: "Finance",
  CUSTOMER_SUPPORT: "Customer Support",
  TECHNICAL_SUPPORT: "Technical Support",
  CUSTOMER_EXPERIENCE: "Customer Experience",
  GENERAL_SUPPORT: "General Support",
});

export function teamForCategory(category) {
  const team = CATEGORY_TEAMS[category];

  if (!team) {
    throw new Error("The ticket category has no routing rule.");
  }

  return team;
}

export function teamLabel(team) {
  const label = TEAM_LABELS[team];

  if (!label) {
    throw new Error("The assigned team is invalid.");
  }

  return label;
}

export function routingRulesJson() {
  return JSON.stringify(CATEGORY_TEAMS);
}
