"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

import { requireOperationsOperator, withOperatorContext } from "../security";
import { ASSIGNMENT_RULE_VERSION, routingRulesJson } from "./ticket-routing";

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
  const operator = await requireOperationsOperator();

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
      reviewedById: operator.id,
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

export async function createTicketFromReviewDashboard(formData: FormData) {
  const operator = await requireOperationsOperator();

  const feedbackId = String(formData.get("feedbackId") ?? "");
  const expectedRevision = Number(formData.get("expectedRevision"));
  const confirmed = formData.get("confirmed") === "yes";

  if (!UUID_PATTERN.test(feedbackId)) {
    throw new Error("A valid feedback ID is required.");
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw new Error("A completed review revision is required.");
  }
  if (!confirmed) {
    throw new Error("Confirm ticket creation before continuing.");
  }

  const ticketId = randomUUID();
  const rules = routingRulesJson();
  const created = await withOperatorContext(operator.id, (transaction) =>
    transaction.$queryRaw<Array<{ ticket_number: number }>>`
      INSERT INTO ticket (
        id, feedback_id, title, description, category,
        source_review_revision, source_reviewed_at, status,
        assigned_team, assignment_rule_version, assigned_at,
        created_by_id, assigned_by_id, updated_at
      )
      SELECT ${ticketId}::uuid, id, reviewed_summary, reviewed_transcript, reviewed_category,
             review_revision, reviewed_at, 'OPEN',
             jsonb_extract_path_text(${rules}::jsonb, reviewed_category)::ticket_team,
             ${ASSIGNMENT_RULE_VERSION}, NOW(),
             ${operator.id}::uuid, ${operator.id}::uuid, NOW()
      FROM feedback
      WHERE id = ${feedbackId}::uuid
        AND review_revision = ${expectedRevision}
        AND reviewed_at IS NOT NULL
        AND reviewed_transcript IS NOT NULL
        AND reviewed_category IS NOT NULL
        AND reviewed_summary IS NOT NULL
        AND jsonb_exists(${rules}::jsonb, reviewed_category)
      ON CONFLICT (feedback_id) DO NOTHING
      RETURNING ticket_number
    `);

  let ticketNumber: number | undefined = created[0]?.ticket_number;

  if (!ticketNumber) {
    const existing = await prisma.ticket.findUnique({
      where: { feedbackId },
      select: { ticketNumber: true },
    });

    ticketNumber = existing?.ticketNumber;
  }

  if (!ticketNumber) {
    throw new Error(
      "This review changed or is incomplete. Return to the review queue, inspect the latest version, and try again.",
    );
  }

  revalidatePath("/operations/reviews");
  revalidatePath(`/operations/reviews/${feedbackId}`);
  revalidatePath("/operations");
  revalidatePath("/operations/analytics");
  revalidatePath(`/operations/tickets/${ticketNumber}`);
  redirect(`/operations/tickets/${ticketNumber}`);
}
