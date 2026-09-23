import Link from "next/link";
import type { ReactNode } from "react";

import {
  NotificationStatus,
  OperatorRole,
  TicketPriority,
  TicketStatus,
  TicketTeam,
  type NotificationStatus as NotificationStatusValue,
  type Prisma,
  type TicketPriority as TicketPriorityValue,
  type TicketStatus as TicketStatusValue,
  type TicketTeam as TicketTeamValue,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { hasMinimumOperatorRole } from "@/lib/operator-roles.mjs";

import { advanceTicketFromDashboard } from "./actions";
import { requireOperationsOperator } from "./security";

export const metadata = {
  title: "Operations dashboard | Voice2Action",
  description: "Track locally processed customer feedback and team notifications.",
};

const STATUS_STEPS: TicketStatusValue[] = [
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

const STATUS_STYLES: Record<TicketStatusValue, string> = {
  OPEN: "border-amber-200 bg-amber-50 text-amber-700",
  IN_PROGRESS: "border-blue-200 bg-blue-50 text-blue-700",
  RESOLVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  CLOSED: "border-slate-200 bg-slate-100 text-slate-600",
};

const PRIORITY_LABELS: Record<TicketPriorityValue, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  CRITICAL: "Critical",
};

const PRIORITY_STYLES: Record<TicketPriorityValue, string> = {
  LOW: "border-slate-200 bg-slate-50 text-slate-600",
  NORMAL: "border-indigo-200 bg-indigo-50 text-indigo-700",
  HIGH: "border-amber-200 bg-amber-50 text-amber-700",
  CRITICAL: "border-rose-200 bg-rose-50 text-rose-700",
};

const NOTIFICATION_LABELS: Record<NotificationStatusValue, string> = {
  PENDING: "Pending",
  SENDING: "Sending",
  SENT: "Delivered",
  FAILED: "Failed",
};

const NOTIFICATION_STYLES: Record<NotificationStatusValue, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  SENDING: "bg-blue-100 text-blue-700",
  SENT: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-rose-100 text-rose-700",
};

const TEAM_LABELS: Record<TicketTeamValue, string> = {
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

const STATUS_VALUES = new Set<TicketStatusValue>(Object.values(TicketStatus));
const PRIORITY_VALUES = new Set<TicketPriorityValue>(Object.values(TicketPriority));
const TEAM_VALUES = new Set<TicketTeamValue>(Object.values(TicketTeam));
const CATEGORY_VALUES = new Set(Object.keys(CATEGORY_LABELS));

const dateFormatter = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

function ticketReference(ticketNumber: number) {
  return `TKT-${String(ticketNumber).padStart(6, "0")}`;
}

function notificationReference(notificationId: number) {
  return `NTF-${String(notificationId).padStart(6, "0")}`;
}

function nextStatusLabel(status: TicketStatusValue) {
  const index = STATUS_STEPS.indexOf(status);
  const next = STATUS_STEPS[index + 1];
  return next ? STATUS_LABELS[next] : null;
}

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function ticketNumberFromSearch(query: string) {
  const match = query.match(/^(?:TKT-)?0*([1-9]\d*)$/i);

  if (!match) {
    return null;
  }

  const ticketNumber = Number(match[1]);
  return Number.isSafeInteger(ticketNumber) ? ticketNumber : null;
}

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const operator = await requireOperationsOperator();

  const rawSearchParams = await searchParams;
  const accessDenied = firstSearchValue(rawSearchParams.access) === "denied";
  const canViewAnalytics = hasMinimumOperatorRole(operator.role, OperatorRole.MANAGER);
  const query = firstSearchValue(rawSearchParams.q).trim().slice(0, 100);
  const requestedStatus = firstSearchValue(rawSearchParams.status);
  const requestedTeam = firstSearchValue(rawSearchParams.team);
  const requestedCategory = firstSearchValue(rawSearchParams.category);
  const requestedPriority = firstSearchValue(rawSearchParams.priority);
  const requestedSla = firstSearchValue(rawSearchParams.sla);
  const status = STATUS_VALUES.has(requestedStatus as TicketStatusValue)
    ? (requestedStatus as TicketStatusValue)
    : null;
  const team = TEAM_VALUES.has(requestedTeam as TicketTeamValue)
    ? (requestedTeam as TicketTeamValue)
    : null;
  const category = CATEGORY_VALUES.has(requestedCategory) ? requestedCategory : null;
  const priority = PRIORITY_VALUES.has(requestedPriority as TicketPriorityValue)
    ? (requestedPriority as TicketPriorityValue)
    : null;
  const sla = requestedSla === "OVERDUE" ? requestedSla : null;
  const now = new Date();
  const searchedTicketNumber = ticketNumberFromSearch(query);
  const searchConditions: Prisma.TicketWhereInput[] = query
    ? [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        ...(searchedTicketNumber === null ? [] : [{ ticketNumber: searchedTicketNumber }]),
      ]
    : [];
  const ticketWhere: Prisma.TicketWhereInput = {
    ...(status ? { status } : {}),
    ...(team ? { assignedTeam: team } : {}),
    ...(category ? { category } : {}),
    ...(priority ? { priority } : {}),
    ...((sla === "OVERDUE" || searchConditions.length)
      ? {
          AND: [
            ...(sla === "OVERDUE"
              ? [{
                  OR: [
                    { status: TicketStatus.OPEN, responseDueAt: { lt: now } },
                    { status: TicketStatus.IN_PROGRESS, resolutionDueAt: { lt: now } },
                  ],
                }]
              : []),
            ...(searchConditions.length ? [{ OR: searchConditions }] : []),
          ],
        }
      : {}),
  };
  const activeFilterCount = [query, status, team, category, priority, sla].filter(Boolean).length;

  const [
    tickets,
    matchingTicketCount,
    queueNotifications,
    statusGroups,
    overdueTicketCount,
    notificationStatusGroups,
  ] = await Promise.all([
    prisma.ticket.findMany({
      where: ticketWhere,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.ticket.count({ where: ticketWhere }),
    prisma.notification.findMany({
      where: {
        status: {
          in: [NotificationStatus.PENDING, NotificationStatus.SENDING, NotificationStatus.FAILED],
        },
      },
      include: { ticket: { select: { ticketNumber: true } } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 20,
    }),
    prisma.ticket.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.ticket.count({
      where: {
        OR: [
          { status: TicketStatus.OPEN, responseDueAt: { lt: now } },
          { status: TicketStatus.IN_PROGRESS, resolutionDueAt: { lt: now } },
        ],
      },
    }),
    prisma.notification.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const statusCounts = Object.fromEntries(
    statusGroups.map((group) => [group.status, group._count._all]),
  ) as Partial<Record<TicketStatusValue, number>>;
  const totalTickets = statusGroups.reduce((total, group) => total + group._count._all, 0);
  const notificationStatusCounts = Object.fromEntries(
    notificationStatusGroups.map((group) => [group.status, group._count._all]),
  ) as Partial<Record<NotificationStatusValue, number>>;
  const queuedAlertCount =
    (notificationStatusCounts.PENDING ?? 0) +
    (notificationStatusCounts.SENDING ?? 0) +
    (notificationStatusCounts.FAILED ?? 0);

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <header className="border-b border-slate-800 bg-[#0d172a] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-indigo-500 text-lg font-black shadow-lg shadow-indigo-950/30">
              V
            </span>
            <span>
              <span className="block text-sm font-bold tracking-wide">Voice2Action</span>
              <span className="block text-xs text-slate-400">Operations workspace</span>
            </span>
          </Link>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href="/operations/reviews"
              className="rounded-xl border border-violet-400/40 bg-violet-400/10 px-4 py-2.5 text-sm font-semibold text-violet-100 transition hover:border-violet-300 hover:bg-violet-400/20"
            >
              Review inbox
            </Link>
            {canViewAnalytics ? (
              <Link
                href="/operations/analytics"
                className="rounded-xl border border-indigo-400/40 bg-indigo-400/10 px-4 py-2.5 text-sm font-semibold text-indigo-100 transition hover:border-indigo-300 hover:bg-indigo-400/20"
              >
                View analytics
              </Link>
            ) : null}
            <Link
              href="/feedback"
              className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold transition hover:border-indigo-400 hover:bg-slate-700"
            >
              Capture feedback
            </Link>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-indigo-300">Local operations</p>
              <h1 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">
                Every customer voice, turned into accountable work.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Review team ownership, follow each ticket through resolution, and keep pending alerts visible.
              </p>
            </div>

            <div className="flex w-fit items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-300">
              <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]" />
              Live from local PostgreSQL
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {accessDenied ? (
          <div role="alert" className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-900">
            Manager permission is required to view operations analytics.
          </div>
        ) : null}
        <section aria-label="Ticket summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Total tickets" value={totalTickets} helper="All recorded work" accent="indigo" />
          <MetricCard label="Open" value={statusCounts.OPEN ?? 0} helper="Waiting to start" accent="amber" />
          <MetricCard label="In progress" value={statusCounts.IN_PROGRESS ?? 0} helper="Being investigated" accent="blue" />
          <MetricCard label="Overdue" value={overdueTicketCount} helper="Needs SLA attention" accent="rose" />
          <MetricCard
            label="Alert queue"
            value={queuedAlertCount}
            helper={`${notificationStatusCounts.FAILED ?? 0} failed deliveries`}
            accent="emerald"
          />
        </section>

        <section aria-labelledby="ticket-filters-heading" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">Find operational work</p>
              <h2 id="ticket-filters-heading" className="mt-1 text-xl font-bold">Search and filter tickets</h2>
            </div>
            {activeFilterCount > 0 ? (
              <Link href="/operations" className="text-sm font-bold text-indigo-600 hover:text-indigo-800">
                Clear {activeFilterCount} {activeFilterCount === 1 ? "filter" : "filters"}
              </Link>
            ) : null}
          </div>

          <form action="/operations" method="get" className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4 xl:items-end">
            <label className="block text-sm font-semibold text-slate-700">
              Search
              <input
                type="search"
                name="q"
                defaultValue={query}
                maxLength={100}
                placeholder="Title, description, or TKT-000001"
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </label>

            <FilterSelect name="status" label="Status" allLabel="All statuses" value={status ?? ""}>
              {STATUS_STEPS.map((option) => (
                <option key={option} value={option}>{STATUS_LABELS[option]}</option>
              ))}
            </FilterSelect>

            <FilterSelect name="team" label="Team" value={team ?? ""}>
              {Object.values(TicketTeam).map((option) => (
                <option key={option} value={option}>{TEAM_LABELS[option]}</option>
              ))}
            </FilterSelect>

            <FilterSelect name="category" label="Category" allLabel="All categories" value={category ?? ""}>
              {Object.entries(CATEGORY_LABELS).map(([option, label]) => (
                <option key={option} value={option}>{label}</option>
              ))}
            </FilterSelect>

            <FilterSelect name="priority" label="Priority" allLabel="All priorities" value={priority ?? ""}>
              {Object.values(TicketPriority).map((option) => (
                <option key={option} value={option}>{PRIORITY_LABELS[option]}</option>
              ))}
            </FilterSelect>

            <FilterSelect name="sla" label="SLA" allLabel="All SLA states" value={sla ?? ""}>
              <option value="OVERDUE">Overdue only</option>
            </FilterSelect>

            <button type="submit" className="h-[42px] rounded-xl bg-slate-900 px-5 text-sm font-bold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
              Apply filters
            </button>
          </form>
        </section>

        <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">Ticket pipeline</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight">Recent tickets</h2>
              </div>
              <span className="text-sm text-slate-500">
                {matchingTicketCount} {matchingTicketCount === 1 ? "match" : "matches"} · showing up to 50
              </span>
            </div>

            <div className="space-y-5">
              {tickets.length === 0 ? (
                <EmptyState
                  title={activeFilterCount > 0 ? "No matching tickets" : "No tickets yet"}
                  body={activeFilterCount > 0 ? "Try clearing or changing the current filters." : "Reviewed feedback will appear here after ticket creation."}
                />
              ) : (
                tickets.map((ticket) => {
                  const nextLabel = nextStatusLabel(ticket.status);
                  const activeDeadline = ticket.status === TicketStatus.OPEN
                    ? { label: "Response due", value: ticket.responseDueAt }
                    : ticket.status === TicketStatus.IN_PROGRESS
                      ? { label: "Resolution due", value: ticket.resolutionDueAt }
                      : null;
                  const isOverdue = activeDeadline ? activeDeadline.value < now : false;

                  return (
                    <article key={ticket.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="p-5 sm:p-6">
                        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-bold text-indigo-600">
                                {ticketReference(ticket.ticketNumber)}
                              </span>
                              <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[ticket.status]}`}>
                                {STATUS_LABELS[ticket.status]}
                              </span>
                              <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${PRIORITY_STYLES[ticket.priority]}`}>
                                {PRIORITY_LABELS[ticket.priority]}
                              </span>
                            </div>
                            <h3 className="mt-3 text-xl font-bold tracking-tight text-slate-950">{ticket.title}</h3>
                            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{ticket.description}</p>
                          </div>

                          <div className="shrink-0 rounded-xl bg-slate-50 px-4 py-3 text-sm">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Assigned team</p>
                            <p className="mt-1 font-bold text-slate-800">
                              {ticket.assignedTeam ? TEAM_LABELS[ticket.assignedTeam] : "Unassigned"}
                            </p>
                          </div>
                        </div>

                        <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-3 border-t border-slate-100 pt-5 text-sm">
                          <div>
                            <dt className="text-xs text-slate-400">Category</dt>
                            <dd className="mt-1 font-semibold text-slate-700">{CATEGORY_LABELS[ticket.category] ?? ticket.category}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-400">Created</dt>
                            <dd className="mt-1 font-semibold text-slate-700">{dateFormatter.format(ticket.createdAt)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-400">Last updated</dt>
                            <dd className="mt-1 font-semibold text-slate-700">{dateFormatter.format(ticket.updatedAt)}</dd>
                          </div>
                          {activeDeadline ? (
                            <div>
                              <dt className="text-xs text-slate-400">{activeDeadline.label}</dt>
                              <dd className={`mt-1 font-semibold ${isOverdue ? "text-rose-700" : "text-slate-700"}`}>
                                {dateFormatter.format(activeDeadline.value)}{isOverdue ? " · Overdue" : ""}
                              </dd>
                            </div>
                          ) : null}
                        </dl>

                        <Link
                          href={`/operations/tickets/${ticket.ticketNumber}`}
                          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
                        >
                          Open full ticket <span aria-hidden="true">→</span>
                        </Link>
                      </div>

                      <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-5 sm:px-6">
                        <StatusTrack status={ticket.status} />

                        {nextLabel ? (
                          <form action={advanceTicketFromDashboard} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <input type="hidden" name="ticketId" value={ticket.id} />
                            <label className="flex items-center gap-2 text-sm text-slate-600">
                              <input
                                type="checkbox"
                                name="confirmed"
                                value="yes"
                                required
                                className="size-4 rounded border-slate-300 accent-indigo-600"
                              />
                              Confirm this one-step status change
                            </label>
                            <button
                              type="submit"
                              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                            >
                              Move to {nextLabel}
                            </button>
                          </form>
                        ) : (
                          <p className="mt-5 text-sm font-semibold text-emerald-700">This ticket is complete and closed.</p>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <aside>
            <div className="sticky top-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">Notification outbox</p>
                  <h2 className="mt-1 text-xl font-bold">Delivery queue</h2>
                </div>
                <span className="grid size-9 place-items-center rounded-full bg-emerald-50 text-sm font-black text-emerald-700">
                  {queuedAlertCount}
                </span>
              </div>

              <p className="mt-3 text-sm leading-6 text-slate-500">
                The webhook worker leases each alert and retries temporary delivery failures safely.
              </p>

              <div className="mt-5 space-y-3">
                {queueNotifications.length === 0 ? (
                  <EmptyState title="Queue is clear" body="There are no alerts waiting for delivery attention." compact />
                ) : (
                  queueNotifications.map((notification) => (
                    <article key={notification.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-xs font-bold text-emerald-700">
                          {notificationReference(notification.id)}
                        </span>
                        <span className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${NOTIFICATION_STYLES[notification.status]}`}>
                          {notification.status === NotificationStatus.PENDING && notification.attemptCount > 0
                            ? "Retry scheduled"
                            : NOTIFICATION_LABELS[notification.status]}
                        </span>
                      </div>
                      <h3 className="mt-3 text-sm font-bold leading-5 text-slate-900">{notification.subject}</h3>
                      <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">{notification.message}</p>
                      {notification.lastError ? (
                        <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-2 text-xs leading-5 text-rose-700">
                          {notification.lastError}
                        </p>
                      ) : null}
                      {notification.status === NotificationStatus.PENDING && notification.attemptCount > 0 ? (
                        <p className="mt-2 text-xs font-semibold text-amber-700">
                          Next retry: {dateFormatter.format(notification.nextAttemptAt)}
                        </p>
                      ) : null}
                      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                        <span>
                          {TEAM_LABELS[notification.team]} · {notification.attemptCount} {notification.attemptCount === 1 ? "attempt" : "attempts"}
                        </span>
                        <Link
                          href={`/operations/tickets/${notification.ticket.ticketNumber}`}
                          className="font-semibold text-indigo-600 hover:text-indigo-800"
                        >
                          {ticketReference(notification.ticket.ticketNumber)}
                        </Link>
                      </div>
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

function FilterSelect({
  name,
  label,
  allLabel,
  value,
  children,
}: {
  name: string;
  label: string;
  allLabel?: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <select
        name={name}
        defaultValue={value}
        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      >
        <option value="">{allLabel ?? `All ${label.toLowerCase()}s`}</option>
        {children}
      </select>
    </label>
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
  accent: "indigo" | "amber" | "blue" | "rose" | "emerald";
}) {
  const accentStyles = {
    indigo: "bg-indigo-500",
    amber: "bg-amber-500",
    blue: "bg-blue-500",
    rose: "bg-rose-500",
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

function StatusTrack({ status }: { status: TicketStatusValue }) {
  const currentIndex = STATUS_STEPS.indexOf(status);

  return (
    <ol aria-label="Ticket progress" className="grid grid-cols-4 gap-2">
      {STATUS_STEPS.map((step, index) => {
        const reached = index <= currentIndex;

        return (
          <li key={step} className="min-w-0">
            <div className={`h-1.5 rounded-full ${reached ? "bg-indigo-500" : "bg-slate-200"}`} />
            <p className={`mt-2 truncate text-[11px] font-semibold sm:text-xs ${reached ? "text-indigo-700" : "text-slate-400"}`}>
              {STATUS_LABELS[step]}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function EmptyState({ title, body, compact = false }: { title: string; body: string; compact?: boolean }) {
  return (
    <div className={`rounded-2xl border border-dashed border-slate-300 bg-white text-center ${compact ? "p-6" : "p-10"}`}>
      <p className="font-bold text-slate-700">{title}</p>
      <p className="mt-2 text-sm text-slate-500">{body}</p>
    </div>
  );
}
