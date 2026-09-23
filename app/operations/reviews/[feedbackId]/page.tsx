import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";

import { requireOperationsOperator } from "../../security";
import { createTicketFromReviewDashboard, saveFeedbackReviewFromDashboard } from "../actions";
import { TEAM_LABELS, teamForReviewCategory } from "../ticket-routing";

export const metadata = {
  title: "Review feedback | Voice2Action",
  description: "Correct a local transcript and classification while preserving the original model output.",
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CATEGORY_OPTIONS = [
  ["DELIVERY_DELAY", "Delivery delay"],
  ["DELIVERY_PROBLEM", "Delivery problem"],
  ["PRODUCT_QUALITY", "Product quality"],
  ["BILLING_PAYMENT", "Billing or payment"],
  ["CUSTOMER_SERVICE", "Customer service"],
  ["APP_TECHNICAL", "App or technical"],
  ["SUGGESTION", "Suggestion"],
  ["COMPLIMENT", "Compliment"],
  ["OTHER", "Other / needs review"],
] as const;

const CATEGORY_LABELS = Object.fromEntries(CATEGORY_OPTIONS) as Record<string, string>;

const dateFormatter = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

function ticketReference(ticketNumber: number) {
  return `TKT-${String(ticketNumber).padStart(6, "0")}`;
}

export default async function ReviewFeedbackPage({
  params,
}: {
  params: Promise<{ feedbackId: string }>;
}) {
  await requireOperationsOperator();

  const { feedbackId } = await params;

  if (!UUID_PATTERN.test(feedbackId)) {
    notFound();
  }

  const feedback = await prisma.feedback.findUnique({
    where: { id: feedbackId },
    select: {
      id: true,
      createdAt: true,
      transcribedAt: true,
      originalTranscript: true,
      classificationCategory: true,
      classificationSummary: true,
      classificationScore: true,
      classificationNeedsReview: true,
      classificationModel: true,
      classifiedAt: true,
      reviewedTranscript: true,
      reviewedCategory: true,
      reviewedSummary: true,
      reviewedAt: true,
      reviewedBy: { select: { displayName: true, username: true } },
      reviewRevision: true,
      ticket: {
        select: { ticketNumber: true },
      },
    },
  });

  if (!feedback || !feedback.originalTranscript) {
    notFound();
  }

  const currentTranscript = feedback.reviewedTranscript ?? feedback.originalTranscript;
  const currentCategory = feedback.reviewedCategory ?? feedback.classificationCategory ?? "OTHER";
  const currentSummary =
    feedback.reviewedSummary ?? feedback.classificationSummary ?? feedback.originalTranscript.slice(0, 300);
  const ticketNumber = feedback.ticket?.ticketNumber ?? null;
  const recommendedTeam = feedback.reviewedCategory
    ? teamForReviewCategory(feedback.reviewedCategory)
    : null;
  const reviewReady = Boolean(
    feedback.reviewedAt &&
      feedback.reviewedTranscript &&
      feedback.reviewedCategory &&
      feedback.reviewedSummary &&
      feedback.reviewRevision > 0 &&
      recommendedTeam,
  );

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <header className="border-b border-slate-800 bg-[#0d172a] text-white">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link href="/operations/reviews" className="text-sm font-semibold text-violet-300 transition hover:text-white">
              ← Back to review queue
            </Link>
            <span className="font-mono text-xs font-bold text-slate-400">{feedback.id}</span>
          </div>

          <div className="mt-8 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-violet-400/15 px-3 py-1 text-xs font-bold text-violet-200">
                Review revision {feedback.reviewRevision}
              </span>
              {feedback.classificationNeedsReview ? (
                <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-bold text-amber-200">
                  Model flagged for attention
                </span>
              ) : null}
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Human review</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
              Compare the machine result with the recording transcript, then save a separate corrected version for ticket creation.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Original model output</p>
            <h2 className="mt-1 text-xl font-bold">Read-only audit record</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Saving a review never overwrites these fields.
            </p>

            <div className="mt-5 space-y-5">
              <TextBlock label="Original transcript" value={feedback.originalTranscript} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Detail
                  label="Model category"
                  value={feedback.classificationCategory
                    ? CATEGORY_LABELS[feedback.classificationCategory] ?? feedback.classificationCategory
                    : "Not classified"}
                />
                <Detail
                  label="Local match score"
                  value={feedback.classificationScore === null
                    ? "Not available"
                    : `${Math.round(feedback.classificationScore * 100)}%`}
                />
                <Detail label="Model version" value={feedback.classificationModel ?? "Not available"} />
                <Detail
                  label="Classified"
                  value={feedback.classifiedAt ? dateFormatter.format(feedback.classifiedAt) : "Not available"}
                />
              </div>
              <TextBlock label="Model short description" value={feedback.classificationSummary} />
            </div>
          </section>

          {ticketNumber ? (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm sm:p-6">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Review locked</p>
              <h2 className="mt-1 text-xl font-bold text-emerald-950">A ticket already uses this review.</h2>
              <p className="mt-2 text-sm leading-6 text-emerald-800">
                The saved ticket is an auditable snapshot, so this browser form no longer edits its source review.
              </p>
              <Link
                href={`/operations/tickets/${ticketNumber}`}
                className="mt-4 inline-flex rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800"
              >
                Open {ticketReference(ticketNumber)}
              </Link>
            </section>
          ) : (
            <>
              <section className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm sm:p-6">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-600">Human correction</p>
                <h2 className="mt-1 text-xl font-bold">Review before ticket creation</h2>

                <form action={saveFeedbackReviewFromDashboard} className="mt-6 space-y-5">
                  <input type="hidden" name="feedbackId" value={feedback.id} />
                  <input type="hidden" name="expectedRevision" value={feedback.reviewRevision} />

                  <label className="block text-sm font-semibold text-slate-700">
                    Corrected wording
                    <textarea
                      name="transcript"
                      required
                      maxLength={20_000}
                      rows={7}
                      defaultValue={currentTranscript}
                      className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                    />
                  </label>

                  <label className="block text-sm font-semibold text-slate-700">
                    Reviewed category
                    <select
                      name="category"
                      required
                      defaultValue={currentCategory}
                      className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                    >
                      {CATEGORY_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-sm font-semibold text-slate-700">
                    Short description
                    <input
                      type="text"
                      name="summary"
                      required
                      maxLength={300}
                      defaultValue={currentSummary}
                      className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                    />
                  </label>

                  <label className="flex items-start gap-2 rounded-xl bg-violet-50 p-4 text-sm text-violet-950">
                    <input
                      type="checkbox"
                      name="confirmed"
                      value="yes"
                      required
                      className="mt-0.5 size-4 rounded border-violet-300 accent-violet-600"
                    />
                    I compared this correction with the original transcript and confirm it is ready for ticket creation.
                  </label>

                  <button
                    type="submit"
                    className="w-full rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
                  >
                    Save human review
                  </button>
                </form>
              </section>

              {reviewReady && recommendedTeam ? (
                <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm sm:p-6">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Ticket preview</p>
                  <h2 className="mt-1 text-xl font-bold text-emerald-950">Create operational work</h2>
                  <p className="mt-2 text-sm leading-6 text-emerald-800">
                    This uses the saved review below. Save any edits above before creating the ticket.
                  </p>

                  <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                    <Detail label="Title" value={feedback.reviewedSummary ?? ""} />
                    <Detail label="Category" value={CATEGORY_LABELS[feedback.reviewedCategory ?? ""] ?? ""} />
                    <Detail label="Assigned team" value={TEAM_LABELS[recommendedTeam]} />
                    <Detail label="Starting status" value="Open" />
                    <Detail label="Source revision" value={String(feedback.reviewRevision)} />
                  </dl>

                  <form action={createTicketFromReviewDashboard} className="mt-5 border-t border-emerald-200 pt-5">
                    <input type="hidden" name="feedbackId" value={feedback.id} />
                    <input type="hidden" name="expectedRevision" value={feedback.reviewRevision} />
                    <label className="flex items-start gap-2 text-sm text-emerald-950">
                      <input
                        type="checkbox"
                        name="confirmed"
                        value="yes"
                        required
                        className="mt-0.5 size-4 rounded border-emerald-300 accent-emerald-700"
                      />
                      Create one ticket from review revision {feedback.reviewRevision} and notify {TEAM_LABELS[recommendedTeam]}.
                    </label>
                    <button
                      type="submit"
                      className="mt-4 w-full rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2"
                    >
                      Create ticket
                    </button>
                  </form>
                </section>
              ) : null}
            </>
          )}
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">Feedback record</p>
            <h2 className="mt-1 text-lg font-bold">Processing details</h2>
            <dl className="mt-5 space-y-3">
              <Detail label="Received" value={dateFormatter.format(feedback.createdAt)} />
              <Detail
                label="Transcribed"
                value={feedback.transcribedAt ? dateFormatter.format(feedback.transcribedAt) : "Not available"}
              />
              <Detail
                label="Last reviewed"
                value={feedback.reviewedAt ? dateFormatter.format(feedback.reviewedAt) : "Not reviewed yet"}
              />
              <Detail
                label="Reviewed by"
                value={!feedback.reviewedAt
                  ? "Not reviewed yet"
                  : feedback.reviewedBy
                    ? `${feedback.reviewedBy.displayName} (@${feedback.reviewedBy.username})`
                    : "System / pre-auth"}
              />
              <Detail label="Review revision" value={String(feedback.reviewRevision)} />
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">Safety rules</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <li>Original transcript and model fields remain unchanged.</li>
              <li>The revision number blocks stale browser updates.</li>
              <li>A review is locked once a ticket snapshots it.</li>
              <li>This workspace accepts localhost requests only.</li>
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-slate-800">{value}</dd>
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">{value ?? "Not available"}</p>
    </div>
  );
}
