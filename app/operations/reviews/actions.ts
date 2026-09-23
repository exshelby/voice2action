"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

import { requireLocalOperationsRequest } from "../security";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CATEGORY_VALUES = new Set([
  "DELIVERY_DELAY",
  "DELIVERY_PROBLEM",
  "PRODUCT_QUALITY",
  "BILLING_PAYMENT",
  "CUSTOMER_SERVICE",
  "APP_TECHNICAL",
  "SUGGESTION",
  "COMPLIMENT",
  "OTHER",
]);

function cleanText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export async function saveFeedbackReviewFromDashboard(formData: FormData) {
  await requireLocalOperationsRequest();

  const feedbackId = String(formData.get("feedbackId") ?? "");
  const transcript = cleanText(formData.get("transcript"));
  const category = String(formData.get("category") ?? "");
  const summary = cleanText(formData.get("summary"));
  const expectedRevision = Number(formData.get("expectedRevision"));
  const confirmed = formData.get("confirmed") === "yes";

  if (!UUID_PATTERN.test(feedbackId)) {
    throw new Error("A valid feedback ID is required.");
  }
  if (!transcript || transcript.length > 20_000) {
    throw new Error("Corrected wording must be between 1 and 20,000 characters.");
  }
  if (!CATEGORY_VALUES.has(category)) {
    throw new Error("Choose a valid feedback category.");
  }
  if (!summary || summary.length > 300) {
    throw new Error("Short description must be between 1 and 300 characters.");
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error("The review revision is invalid.");
  }
  if (!confirmed) {
    throw new Error("Confirm the human review before saving it.");
  }

  const updated = await prisma.feedback.updateMany({
    where: {
      id: feedbackId,
      reviewRevision: expectedRevision,
      originalTranscript: { not: null },
      ticket: null,
    },
    data: {
      reviewedTranscript: transcript,
      reviewedCategory: category,
      reviewedSummary: summary,
      reviewedAt: new Date(),
      reviewRevision: { increment: 1 },
    },
  });

  if (updated.count !== 1) {
    throw new Error(
      "This feedback changed or already became a ticket while you were reviewing it. Return to the review queue and try again.",
    );
  }

  revalidatePath("/operations/reviews");
  revalidatePath(`/operations/reviews/${feedbackId}`);
  revalidatePath("/operations");
  redirect("/operations/reviews?saved=1");
}
