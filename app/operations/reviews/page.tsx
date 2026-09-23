import Link from "next/link";

import { prisma } from "@/lib/prisma";

import { requireOperationsOperator } from "../security";

export const metadata = {
  title: "Human review queue | Voice2Action",
  description: "Review locally transcribed and classified customer feedback before ticket creation.",
};

const CATEGORY_LABELS: Record<string, string> = {
  DELIVERY_DELAY: "Delivery delay",
  DELIVERY_PROBLEM: "Delivery problem",
  PRODUCT_QUALITY: "Product quality",
  BILLING_PAYMENT: "Billing or payment",
  CUSTOMER_SERVICE: "Customer service",
  APP_TECHNICAL: "App or technical",
  SUGGESTION: "Suggestion",
  COMPLIMENT: "Compliment",
  OTHER: "Other / needs review",
};

const dateFormatter = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireOperationsOperator();

  const rawSearchParams = await searchParams;
  const reviewSaved = firstSearchValue(rawSearchParams.saved) === "1";

  const [awaitingReview, readyForTicket, awaitingCount, readyCount, flaggedCount] = await Promise.all([
    prisma.feedback.findMany({
      where: {
        originalTranscript: { not: null },
        reviewedAt: null,
      },
      select: {
        id: true,
        createdAt: true,
        transcribedAt: true,
        originalTranscript: true,
        classificationCategory: true,
        classificationSummary: true,
        classificationScore: true,
        classificationNeedsReview: true,
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    }),
    prisma.feedback.findMany({
      where: {
        reviewedAt: { not: null },
        ticket: null,
      },
      select: {
        id: true,
        reviewedAt: true,
        reviewedCategory: true,
        reviewedSummary: true,
        reviewRevision: true,
      },
      orderBy: { reviewedAt: "asc" },
      take: 20,
    }),
    prisma.feedback.count({
      where: { originalTranscript: { not: null }, reviewedAt: null },
    }),
    prisma.feedback.count({
      where: { reviewedAt: { not: null }, ticket: null },
    }),
    prisma.feedback.count({
      where: {
        originalTranscript: { not: null },
        reviewedAt: null,
        classificationNeedsReview: true,
      },
    }),
  ]);

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <header className="border-b border-slate-800 bg-[#0d172a] text-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link href="/operations" className="text-sm font-semibold text-indigo-300 transition hover:text-white">
              ← Back to operations
            </Link>
            <Link
              href="/feedback"
              className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold transition hover:border-indigo-400"
            >
              Capture feedback
            </Link>
          </div>

          <div className="mt-8 max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-violet-300">Human review inbox</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Verify the machine result before it becomes work.
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
              Correct wording, category, and the short description while the original transcript and classification stay unchanged for audit.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {reviewSaved ? (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800">
            Human review saved. The original model output was not changed.
          </div>
        ) : null}

        <section aria-label="Review summary" className="grid gap-4 sm:grid-cols-3">
          <MetricCard label="Awaiting review" value={awaitingCount} helper="Transcribed feedback" accent="violet" />
          <MetricCard label="Model flagged" value={flaggedCount} helper="Needs closer attention" accent="amber" />
          <MetricCard label="Ready for ticket" value={readyCount} helper="Reviewed, not ticketed" accent="emerald" />
        </section>

        <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-600">Review next</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight">Awaiting human review</h2>
              </div>
              <span className="text-sm text-slate-500">Oldest first · showing up to 50</span>
            </div>

            <div className="space-y-4">
              {awaitingReview.length === 0 ? (
                <EmptyState
                  title="Review queue is clear"
                  body="New transcribed feedback will appear here before ticket creation."
                />
              ) : (
                awaitingReview.map((feedback) => (
                  <article key={feedback.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-violet-700">{feedback.id}</span>
                          {feedback.classificationNeedsReview ? (
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-800">
                              Model flagged
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mt-3 text-lg font-bold text-slate-950">
                          {feedback.classificationSummary ?? "Feedback awaiting a short description"}
                        </h3>
                        <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
                          {feedback.originalTranscript}
                        </p>
                      </div>

                      <div className="shrink-0 rounded-xl bg-slate-50 px-4 py-3 text-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Model category</p>
                        <p className="mt-1 font-bold text-slate-800">
                          {feedback.classificationCategory
                            ? CATEGORY_LABELS[feedback.classificationCategory] ?? feedback.classificationCategory
                            : "Not classified"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {feedback.classificationScore === null
                            ? "No match score"
                            : `${Math.round(feedback.classificationScore * 100)}% local match`}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                      <p className="text-xs text-slate-500">
                        Received {dateFormatter.format(feedback.createdAt)}
                        {feedback.transcribedAt ? ` · transcribed ${dateFormatter.format(feedback.transcribedAt)}` : ""}
                      </p>
                      <Link
                        href={`/operations/reviews/${feedback.id}`}
                        className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-700"
                      >
                        Review feedback
                      </Link>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <aside>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 xl:sticky xl:top-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">Next stage</p>
                  <h2 className="mt-1 text-xl font-bold">Ready for ticket</h2>
                </div>
                <span className="grid size-9 place-items-center rounded-full bg-emerald-50 text-sm font-black text-emerald-700">
                  {readyCount}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                These reviews are complete and waiting for ticket creation.
              </p>

              <div className="mt-5 space-y-3">
                {readyForTicket.length === 0 ? (
                  <EmptyState title="Nothing waiting" body="Saved reviews without tickets will appear here." compact />
                ) : (
                  readyForTicket.map((feedback) => (
                    <article key={feedback.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <span className="font-mono text-[11px] font-bold text-emerald-700">{feedback.id}</span>
                      <h3 className="mt-2 text-sm font-bold leading-5 text-slate-900">
                        {feedback.reviewedSummary ?? "Reviewed feedback"}
                      </h3>
                      <p className="mt-2 text-xs text-slate-500">
                        {feedback.reviewedCategory
                          ? CATEGORY_LABELS[feedback.reviewedCategory] ?? feedback.reviewedCategory
                          : "Category unavailable"}
                        {feedback.reviewedAt ? ` · ${dateFormatter.format(feedback.reviewedAt)}` : ""}
                      </p>
                      <Link
                        href={`/operations/reviews/${feedback.id}`}
                        className="mt-3 inline-flex text-xs font-bold text-indigo-600 hover:text-indigo-800"
                      >
                        Inspect and create from revision {feedback.reviewRevision} →
                      </Link>
                    </article>
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  helper,
  accent,
}: {
  label: string;
  value: number;
  helper: string;
  accent: "violet" | "amber" | "emerald";
}) {
  const accentStyles = {
    violet: "bg-violet-500",
    amber: "bg-amber-500",
    emerald: "bg-emerald-500",
  };

  return (
    <article className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className={`absolute inset-y-0 left-0 w-1 ${accentStyles[accent]}`} />
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{helper}</p>
    </article>
  );
}

function EmptyState({
  title,
  body,
  compact = false,
}: {
  title: string;
  body: string;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-dashed border-slate-300 bg-white text-center ${compact ? "p-6" : "p-10"}`}>
      <p className="font-bold text-slate-700">{title}</p>
      <p className="mt-2 text-sm text-slate-500">{body}</p>
    </div>
  );
}
