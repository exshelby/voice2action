export const ASSIGNMENT_RULE_VERSION = 1;

export const CATEGORY_TEAMS = {
  DELIVERY_DELAY: "LOGISTICS",
  DELIVERY_PROBLEM: "LOGISTICS",
  PRODUCT_QUALITY: "QUALITY",
  BILLING_PAYMENT: "FINANCE",
  CUSTOMER_SERVICE: "CUSTOMER_SUPPORT",
  APP_TECHNICAL: "TECHNICAL_SUPPORT",
  SUGGESTION: "CUSTOMER_EXPERIENCE",
  COMPLIMENT: "CUSTOMER_EXPERIENCE",
  OTHER: "GENERAL_SUPPORT",
} as const;

export const TEAM_LABELS: Record<(typeof CATEGORY_TEAMS)[keyof typeof CATEGORY_TEAMS], string> = {
  LOGISTICS: "Logistics",
  QUALITY: "Quality",
  FINANCE: "Finance",
  CUSTOMER_SUPPORT: "Customer Support",
  TECHNICAL_SUPPORT: "Technical Support",
  CUSTOMER_EXPERIENCE: "Customer Experience",
  GENERAL_SUPPORT: "General Support",
};

export function teamForReviewCategory(category: string) {
  return CATEGORY_TEAMS[category as keyof typeof CATEGORY_TEAMS] ?? null;
}

export function routingRulesJson() {
  return JSON.stringify(CATEGORY_TEAMS);
}
