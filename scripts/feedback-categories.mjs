export const CATEGORY_OPTIONS = Object.freeze([
  ["DELIVERY_DELAY", "Delivery delay"],
  ["DELIVERY_PROBLEM", "Delivery problem"],
  ["PRODUCT_QUALITY", "Product quality"],
  ["BILLING_PAYMENT", "Billing or payment"],
  ["CUSTOMER_SERVICE", "Customer service"],
  ["APP_TECHNICAL", "App or technical"],
  ["SUGGESTION", "Suggestion"],
  ["COMPLIMENT", "Compliment"],
  ["OTHER", "Other / needs review"],
]);

export const CATEGORY_CODES = new Set(CATEGORY_OPTIONS.map(([code]) => code));

export function categoryLabel(code) {
  return CATEGORY_OPTIONS.find(([value]) => value === code)?.[1] ?? code;
}
