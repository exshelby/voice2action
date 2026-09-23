import Link from "next/link";

import {
  TicketStatus,
  type TicketStatus as TicketStatusValue,
  type TicketTeam,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import { requireLocalOperationsRequest } from "../security";

export const metadata = {
  title: "Operations analytics | Voice2Action",
  description: "Review local ticket workload, aging, and recurring issue signals.",
};

const STATUS_ORDER: TicketStatusValue[] = [
  TicketStatus.OPEN,
  TicketStatus.IN_PROGRESS,
  TicketStatus.RESOLVED,
  TicketStatus.CLOSED,
];

const STATUS_LABELS: Record<TicketStatusValue, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const TEAM_LABELS: Record<TicketTeam, string> = {
  LOGISTICS: "Logistics",
  QUALITY: "Quality",
  FINANCE: "Finance",
  CUSTOMER_SUPPORT: "Customer Support",
  TECHNICAL_SUPPORT: "Technical Support",
  CUSTOMER_EXPERIENCE: "Customer Experience",
  GENERAL_SUPPORT: "General Support",
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

const DAY_MS = 24 * 60 * 60 * 1000;
const ANALYTICS_LIMIT = 500;

function countValues(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function normalizeIssueTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ticketAgeDays(createdAt: Date, now: Date) {
  return Math.max(0, (now.getTime() - createdAt.getTime()) / DAY_MS);
}

export default async function OperationsAnalyticsPage() {
  await requireLocalOperationsRequest();

  const tickets = await prisma.ticket.findMany({
    select: {
      ticketNumber: true,
      title: true,
      category: true,
      status: true,
      assignedTeam: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: ANALYTICS_LIMIT,
  });

  const now = new Date();
  const recurringCutoff = new Date(now.getTime() - 30 * DAY_MS);
  const activeTickets = tickets.filter(
    (ticket) => ticket.status === TicketStatus.OPEN || ticket.status === TicketStatus.IN_PROGRESS,
  );
  const completedTickets = tickets.filter(
    (ticket) => ticket.status === TicketStatus.RESOLVED || ticket.status === TicketStatus.CLOSED,
  );
  const statusCounts = countValues(tickets.map((ticket) => ticket.status));
  const categoryCounts = countValues(tickets.map((ticket) => ticket.category));
  const teamCounts = countValues(tickets.map((ticket) => ticket.assignedTeam ?? "UNASSIGNED"));

  const agingBuckets = [
    { label: "Under 1 day", count: 0 },
    { label: "1–3 days", count: 0 },
    { label: "4–7 days", count: 0 },
    { label: "8+ days", count: 0 },
  ];

  for (const ticket of activeTickets) {
    const age = ticketAgeDays(ticket.createdAt, now);

    if (age < 1) agingBuckets[0].count += 1;
    else if (age < 4) agingBuckets[1].count += 1;
    else if (age < 8) agingBuckets[2].count += 1;
    else agingBuckets[3].count += 1;
  }

  const oldestActiveAge = activeTickets.reduce(
    (oldest, ticket) => Math.max(oldest, ticketAgeDays(ticket.createdAt, now)),
    0,
  );
  const recurringGroups = new Map<
    string,
    { category: string; count: number; newestTicketNumber: number; title: string }
  >();

  for (const ticket of tickets) {
    if (ticket.createdAt < recurringCutoff) continue;

    const normalizedTitle = normalizeIssueTitle(ticket.title);
    if (!normalizedTitle) continue;

    const key = `${ticket.category}:${normalizedTitle}`;
    const current = recurringGroups.get(key);

    if (current) {
      current.count += 1;
      current.newestTicketNumber = Math.max(current.newestTicketNumber, ticket.ticketNumber);
    } else {
      recurringGroups.set(key, {
        category: ticket.category,
        count: 1,
        newestTicketNumber: ticket.ticketNumber,
        title: ticket.title,
      });
    }
  }

  const recurringIssues = [...recurringGroups.values()]
    .filter((issue) => issue.count >= 2)
    .sort((a, b) => b.count - a.count || b.newestTicketNumber - a.newestTicketNumber)
    .slice(0, 10);

  const categoryRows = Object.entries(categoryCounts)
    .map(([category, count]) => ({ label: CATEGORY_LABELS[category] ?? category, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const teamRows = Object.entries(teamCounts)
    .map(([team, count]) => ({
      label: team === "UNASSIGNED" ? "Unassigned" : TEAM_LABELS[team as TicketTeam],
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const completionRate = tickets.length === 0 ? 0 : Math.round((completedTickets.length / tickets.length) * 100);

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <header className="border-b border-slate-800 bg-[#0d172a] text-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link href="/operations" className="text-sm font-semibold text-indigo-300 transition hover:text-white">
              ← Back to operations
            </Link>
            <Link href="/feedback" className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold">
              Capture feedback
            </Link>
          </div>

          <div className="mt-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-indigo-300">Local analytics</p>
              <h1 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">
                See the workload behind every customer voice.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Monitor ownership, lifecycle health, ticket age, and repeated issue patterns from local PostgreSQL data.
              </p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-3 text-xs leading-5 text-slate-300">
              Analyzing the latest {Math.min(tickets.length, ANALYTICS_LIMIT)} {tickets.length === 1 ? "ticket" : "tickets"}
              <span className="block text-slate-500">Recurring window: 30 days · threshold: 2</span>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section aria-label="Analytics summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Tickets analyzed" value={String(tickets.length)} helper={`Up to ${ANALYTICS_LIMIT} recent tickets`} accent="indigo" />
          <MetricCard label="Active workload" value={String(activeTickets.length)} helper="Open or in progress" accent="amber" />
          <MetricCard label="Completion rate" value={`${completionRate}%`} helper="Resolved or closed" accent="emerald" />
          <MetricCard
            label="Oldest active"
            value={activeTickets.length === 0 ? "—" : oldestActiveAge < 1 ? "<1 day" : `${Math.floor(oldestActiveAge)}d`}
            helper={activeTickets.length === 0 ? "No active tickets" : "Time since ticket creation"}
            accent="rose"
          />
        </section>

        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          <AnalyticsCard eyebrow="Lifecycle" title="Ticket status">
            <BarList
              rows={STATUS_ORDER.map((status) => ({
                label: STATUS_LABELS[status],
                count: statusCounts[status] ?? 0,
              }))}
              color="bg-indigo-500"
            />
          </AnalyticsCard>

          <AnalyticsCard eyebrow="Service health" title="Active ticket aging">
            {activeTickets.length === 0 ? (
              <EmptyState title="No active workload" body="All analyzed tickets are resolved or closed." />
            ) : (
              <BarList rows={agingBuckets} color="bg-amber-500" />
            )}
          </AnalyticsCard>

          <AnalyticsCard eyebrow="Issue mix" title="Tickets by category">
            {categoryRows.length === 0 ? (
              <EmptyState title="No category data" body="Categorized tickets will appear here." />
            ) : (
              <BarList rows={categoryRows} color="bg-violet-500" />
            )}
          </AnalyticsCard>

          <AnalyticsCard eyebrow="Ownership" title="Tickets by team">
            {teamRows.length === 0 ? (
              <EmptyState title="No ownership data" body="Assigned tickets will appear here." />
            ) : (
              <BarList rows={teamRows} color="bg-cyan-500" />
            )}
          </AnalyticsCard>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-600">Recurring signals</p>
              <h2 className="mt-1 text-xl font-bold">Repeated issues in the last 30 days</h2>
            </div>
            <span className="text-sm text-slate-500">Same normalized title and category</span>
          </div>

          {recurringIssues.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title="No recurring issue detected yet"
                body="A pattern appears here after at least two recent tickets share the same normalized title and category."
              />
            </div>
          ) : (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {recurringIssues.map((issue) => (
                <article key={`${issue.category}:${normalizeIssueTitle(issue.title)}`} className="rounded-xl border border-rose-100 bg-rose-50/60 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-rose-600">
                        {CATEGORY_LABELS[issue.category] ?? issue.category}
                      </p>
                      <h3 className="mt-2 font-bold text-slate-900">{issue.title}</h3>
                    </div>
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-600 text-sm font-black text-white">
                      {issue.count}
                    </span>
                  </div>
                  <Link
                    href={`/operations?q=${encodeURIComponent(issue.title)}`}
                    className="mt-4 inline-flex text-sm font-bold text-rose-700 hover:text-rose-900"
                  >
                    View matching tickets →
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>
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
  value: string;
  helper: string;
  accent: "indigo" | "amber" | "emerald" | "rose";
}) {
  const accentStyles = {
    indigo: "bg-indigo-500",
    amber: "bg-amber-500",
    emerald: "bg-emerald-500",
    rose: "bg-rose-500",
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

function AnalyticsCard({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-bold">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function BarList({ rows, color }: { rows: Array<{ label: string; count: number }>; color: string }) {
  const maximum = Math.max(...rows.map((row) => row.count), 1);

  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="font-semibold text-slate-700">{row.label}</span>
            <span className="font-mono text-xs font-bold text-slate-500">{row.count}</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${color}`}
              style={{ width: row.count === 0 ? "0%" : `${Math.max(8, (row.count / maximum) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-7 text-center">
      <p className="font-bold text-slate-700">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{body}</p>
    </div>
  );
}
