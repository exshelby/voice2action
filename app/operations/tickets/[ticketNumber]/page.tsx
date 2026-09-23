import Link from "next/link";
import { notFound } from "next/navigation";

import {
  NotificationStatus,
  TicketPriority,
  TicketStatus,
  TicketTeam,
  TicketWorklogType,
  type NotificationStatus as NotificationStatusValue,
  type TicketPriority as TicketPriorityValue,
  type TicketStatus as TicketStatusValue,
  type TicketTeam as TicketTeamValue,
  type TicketWorklogType as TicketWorklogTypeValue,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import {
  addTicketWorklogFromDashboard,
  advanceTicketFromDashboard,
  changeTicketPriorityFromDashboard,
  markNotificationDeliveredFromDashboard,
  reassignTicketFromDashboard,
} from "../../actions";
import { requireLocalOperationsRequest } from "../../security";

export const metadata = {
  title: "Ticket details | Voice2Action",
  description: "Review and manage one locally processed Voice2Action ticket.",
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

const PRIORITY_OPTIONS: TicketPriorityValue[] = Object.values(TicketPriority);

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

const TEAM_OPTIONS: TicketTeamValue[] = Object.values(TicketTeam);

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

const WORKLOG_TYPE_LABELS: Record<TicketWorklogTypeValue, string> = {
  INVESTIGATION: "Investigation",
  RESOLUTION: "Resolution",
};

const WORKLOG_TYPE_STYLES: Record<TicketWorklogTypeValue, string> = {
  INVESTIGATION: "bg-blue-100 text-blue-700",
  RESOLUTION: "bg-emerald-100 text-emerald-700",
};

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

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ ticketNumber: string }>;
}) {
  await requireLocalOperationsRequest();

  const { ticketNumber: ticketNumberParam } = await params;

  if (!/^[1-9]\d*$/.test(ticketNumberParam)) {
    notFound();
  }

  const ticketNumber = Number(ticketNumberParam);

  if (!Number.isSafeInteger(ticketNumber)) {
    notFound();
  }

  const ticket = await prisma.ticket.findUnique({
    where: { ticketNumber },
    include: {
      feedback: {
        select: {
          id: true,
          originalTranscript: true,
          classificationCategory: true,
          classificationSummary: true,
          classificationScore: true,
          reviewedTranscript: true,
          reviewedCategory: true,
          reviewedSummary: true,
          reviewedAt: true,
          reviewRevision: true,
        },
      },
      notifications: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
      statusEvents: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
      priorityEvents: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
      worklogs: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
    },
  });

  if (!ticket) {
    notFound();
  }

  const reference = ticketReference(ticket.ticketNumber);
  const nextLabel = nextStatusLabel(ticket.status);
  const hasResolutionNote = ticket.worklogs.some((entry) => entry.type === TicketWorklogType.RESOLUTION);
  const resolutionNoteRequired = ticket.status === TicketStatus.IN_PROGRESS && !hasResolutionNote;
  const now = new Date();
  const responseOverdue = ticket.status === TicketStatus.OPEN && ticket.responseDueAt < now;
  const resolutionOverdue = ticket.status === TicketStatus.IN_PROGRESS && ticket.resolutionDueAt < now;

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <header className="border-b border-slate-800 bg-[#0d172a] text-white">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
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
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm font-bold text-indigo-300">{reference}</span>
                <span className={`rounded-full border px-3 py-1 text-xs font-bold ${STATUS_STYLES[ticket.status]}`}>
                  {STATUS_LABELS[ticket.status]}
                </span>
                <span className={`rounded-full border px-3 py-1 text-xs font-bold ${PRIORITY_STYLES[ticket.priority]}`}>
                  {PRIORITY_LABELS[ticket.priority]} priority
                </span>
              </div>
              <h1 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">{ticket.title}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">{ticket.description}</p>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-800/70 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Current owner</p>
              <p className="mt-1 text-lg font-bold">
                {ticket.assignedTeam ? TEAM_LABELS[ticket.assignedTeam] : "Unassigned"}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Work log</p>
                <h2 className="mt-1 text-xl font-bold">Investigation and resolution</h2>
              </div>
              <span className="grid size-9 place-items-center rounded-full bg-blue-50 text-sm font-black text-blue-700">
                {ticket.worklogs.length}
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {ticket.worklogs.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                  No work has been recorded yet. Add an investigation note to begin the audit trail.
                </p>
              ) : (
                ticket.worklogs.map((entry) => (
                  <article key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${WORKLOG_TYPE_STYLES[entry.type]}`}>
                        {WORKLOG_TYPE_LABELS[entry.type]}
                      </span>
                      <time className="text-xs font-semibold text-slate-500" dateTime={entry.createdAt.toISOString()}>
                        {dateFormatter.format(entry.createdAt)}
                      </time>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{entry.body}</p>
                  </article>
                ))
              )}
            </div>

            {ticket.status !== TicketStatus.CLOSED ? (
              <form action={addTicketWorklogFromDashboard} className="mt-5 space-y-4 border-t border-slate-200 pt-5">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <label className="block text-sm font-semibold text-slate-700">
                  Entry type
                  <select
                    name="type"
                    required
                    defaultValue={TicketWorklogType.INVESTIGATION}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value={TicketWorklogType.INVESTIGATION}>Investigation</option>
                    <option value={TicketWorklogType.RESOLUTION}>Resolution</option>
                  </select>
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Operator note
                  <textarea
                    name="body"
                    required
                    minLength={1}
                    maxLength={5000}
                    rows={4}
                    placeholder="Record what was checked, found, or done."
                    className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                <label className="flex items-start gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    name="confirmed"
                    value="yes"
                    required
                    className="mt-0.5 size-4 rounded border-slate-300 accent-blue-600"
                  />
                  Confirm this permanent work-log entry
                </label>
                <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700">
                  Add work-log entry
                </button>
              </form>
            ) : (
              <p className="mt-5 border-t border-slate-200 pt-5 text-sm font-semibold text-slate-500">
                The work log is read-only because this ticket is closed.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">Ticket record</p>
            <h2 className="mt-1 text-xl font-bold">Operational details</h2>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <Detail label="Category" value={CATEGORY_LABELS[ticket.category] ?? ticket.category} />
              <Detail label="Feedback ID" value={ticket.feedback.id} mono />
              <Detail label="Created" value={dateFormatter.format(ticket.createdAt)} />
              <Detail label="Last updated" value={dateFormatter.format(ticket.updatedAt)} />
              <Detail label="Response deadline" value={dateFormatter.format(ticket.responseDueAt)} />
              <Detail label="Resolution deadline" value={dateFormatter.format(ticket.resolutionDueAt)} />
              <Detail
                label="First response recorded"
                value={ticket.respondedAt
                  ? dateFormatter.format(ticket.respondedAt)
                  : ticket.status === TicketStatus.OPEN
                    ? "Not yet responded"
                    : "Not captured before SLA tracking"}
              />
              <Detail label="Reviewed" value={dateFormatter.format(ticket.sourceReviewedAt)} />
              <Detail label="Review revision" value={String(ticket.sourceReviewRevision)} />
              <Detail
                label="Assigned"
                value={ticket.assignedAt ? dateFormatter.format(ticket.assignedAt) : "Not assigned"}
              />
              <Detail
                label="Assignment source"
                value={ticket.assignmentRuleVersion ? `Rule set v${ticket.assignmentRuleVersion}` : "Manual assignment"}
              />
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-600">Audit trail</p>
            <h2 className="mt-1 text-xl font-bold">Transcript and human review</h2>
            <div className="mt-5 space-y-5">
              <TextBlock label="Original transcript" value={ticket.feedback.originalTranscript} />
              <TextBlock label="Reviewed transcript" value={ticket.feedback.reviewedTranscript} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Detail
                  label="Model category"
                  value={ticket.feedback.classificationCategory ? CATEGORY_LABELS[ticket.feedback.classificationCategory] ?? ticket.feedback.classificationCategory : "Not available"}
                />
                <Detail
                  label="Reviewed category"
                  value={ticket.feedback.reviewedCategory ? CATEGORY_LABELS[ticket.feedback.reviewedCategory] ?? ticket.feedback.reviewedCategory : "Not available"}
                />
                <Detail
                  label="Model confidence"
                  value={ticket.feedback.classificationScore === null ? "Not available" : `${Math.round(ticket.feedback.classificationScore * 100)}%`}
                />
                <Detail
                  label="Review saved"
                  value={ticket.feedback.reviewedAt ? dateFormatter.format(ticket.feedback.reviewedAt) : "Not available"}
                />
              </div>
              <TextBlock label="Model summary" value={ticket.feedback.classificationSummary} />
              <TextBlock label="Reviewed summary" value={ticket.feedback.reviewedSummary} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">Notification history</p>
                <h2 className="mt-1 text-xl font-bold">Team alerts</h2>
              </div>
              <span className="grid size-9 place-items-center rounded-full bg-emerald-50 text-sm font-black text-emerald-700">
                {ticket.notifications.length}
              </span>
            </div>

            <div className="mt-5 space-y-4">
              {ticket.notifications.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                  This ticket has no notifications.
                </p>
              ) : (
                ticket.notifications.map((notification) => (
                  <article key={notification.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="font-mono text-xs font-bold text-emerald-700">
                        {notificationReference(notification.id)}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${NOTIFICATION_STYLES[notification.status]}`}>
                        {NOTIFICATION_LABELS[notification.status]}
                      </span>
                    </div>
                    <h3 className="mt-3 text-sm font-bold text-slate-900">{notification.subject}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{notification.message}</p>
                    <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                      <div><dt className="inline">Team: </dt><dd className="inline font-semibold">{TEAM_LABELS[notification.team]}</dd></div>
                      <div><dt className="inline">Attempts: </dt><dd className="inline font-semibold">{notification.attemptCount}</dd></div>
                      <div><dt className="inline">Queued: </dt><dd className="inline font-semibold">{dateFormatter.format(notification.createdAt)}</dd></div>
                    </dl>

                    {notification.status === NotificationStatus.PENDING ? (
                      <form action={markNotificationDeliveredFromDashboard} className="mt-4 border-t border-slate-200 pt-4">
                        <input type="hidden" name="notificationId" value={notification.id} />
                        <label className="flex items-start gap-2 text-sm text-slate-600">
                          <input
                            type="checkbox"
                            name="confirmed"
                            value="yes"
                            required
                            className="mt-0.5 size-4 rounded border-slate-300 accent-emerald-600"
                          />
                          Confirm the team received this alert
                        </label>
                        <button type="submit" className="mt-3 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700">
                          Mark as delivered
                        </button>
                      </form>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-600">Priority &amp; SLA</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Service commitment</h2>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${PRIORITY_STYLES[ticket.priority]}`}>
                {PRIORITY_LABELS[ticket.priority]}
              </span>
            </div>

            <dl className="mt-4 space-y-3">
              <div className={`rounded-xl p-3 ${responseOverdue ? "bg-rose-50" : "bg-slate-50"}`}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Response due</dt>
                <dd className={`mt-1 text-sm font-bold ${responseOverdue ? "text-rose-700" : "text-slate-800"}`}>
                  {dateFormatter.format(ticket.responseDueAt)}
                </dd>
                <p className="mt-1 text-xs text-slate-500">
                  {ticket.respondedAt
                    ? `Responded ${dateFormatter.format(ticket.respondedAt)}`
                    : responseOverdue
                      ? "Overdue — response has not been recorded"
                      : ticket.status === TicketStatus.OPEN
                        ? "Awaiting first response"
                        : "Response time was not captured"}
                </p>
              </div>
              <div className={`rounded-xl p-3 ${resolutionOverdue ? "bg-rose-50" : "bg-slate-50"}`}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Resolution due</dt>
                <dd className={`mt-1 text-sm font-bold ${resolutionOverdue ? "text-rose-700" : "text-slate-800"}`}>
                  {dateFormatter.format(ticket.resolutionDueAt)}
                </dd>
                <p className="mt-1 text-xs text-slate-500">
                  {resolutionOverdue
                    ? "Overdue — resolution is still in progress"
                    : ticket.status === TicketStatus.RESOLVED || ticket.status === TicketStatus.CLOSED
                      ? "Resolution stage completed"
                      : "Within the current service window"}
                </p>
              </div>
            </dl>

            <p className="mt-4 text-xs leading-5 text-slate-500">
              Escalating priority recalculates both deadlines from the original ticket creation time.
            </p>

            <div className="mt-5 border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-800">Priority history</h3>
                <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">
                  {ticket.priorityEvents.length}
                </span>
              </div>
              <ol className="mt-3 space-y-3">
                {ticket.priorityEvents.map((event) => (
                  <li key={event.id} className="border-l-2 border-rose-200 pl-3">
                    <p className="text-xs font-semibold text-slate-700">
                      {event.fromPriority
                        ? `${PRIORITY_LABELS[event.fromPriority]} → ${PRIORITY_LABELS[event.toPriority]}`
                        : `History began at ${PRIORITY_LABELS[event.toPriority]}`}
                    </p>
                    <time className="mt-1 block text-[11px] text-slate-500" dateTime={event.createdAt.toISOString()}>
                      {dateFormatter.format(event.createdAt)}
                    </time>
                  </li>
                ))}
              </ol>
            </div>

            {ticket.status !== TicketStatus.CLOSED ? (
              <form action={changeTicketPriorityFromDashboard} className="mt-5 space-y-4 border-t border-slate-100 pt-5">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <label className="block text-sm font-semibold text-slate-700">
                  Ticket priority
                  <select
                    name="priority"
                    required
                    defaultValue={ticket.priority}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                  >
                    {PRIORITY_OPTIONS.map((priority) => (
                      <option key={priority} value={priority}>{PRIORITY_LABELS[priority]}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-start gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    name="confirmed"
                    value="yes"
                    required
                    className="mt-0.5 size-4 rounded border-slate-300 accent-rose-600"
                  />
                  Confirm this priority and deadline change
                </label>
                <button type="submit" className="w-full rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-rose-700">
                  Save priority
                </button>
              </form>
            ) : (
              <p className="mt-5 border-t border-slate-100 pt-5 text-sm font-semibold text-slate-500">
                Priority is read-only because this ticket is closed.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">Lifecycle</p>
            <h2 className="mt-1 text-lg font-bold">Ticket status</h2>
            <StatusTrack status={ticket.status} />

            <div className="mt-5 border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-800">Recorded history</h3>
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
                  {ticket.statusEvents.length}
                </span>
              </div>
              <ol className="mt-3 space-y-3">
                {ticket.statusEvents.map((event) => (
                  <li key={event.id} className="border-l-2 border-indigo-200 pl-3">
                    <p className="text-xs font-semibold text-slate-700">
                      {event.fromStatus
                        ? `${STATUS_LABELS[event.fromStatus]} → ${STATUS_LABELS[event.toStatus]}`
                        : `History began at ${STATUS_LABELS[event.toStatus]}`}
                    </p>
                    <time className="mt-1 block text-[11px] text-slate-500" dateTime={event.createdAt.toISOString()}>
                      {dateFormatter.format(event.createdAt)}
                    </time>
                  </li>
                ))}
              </ol>
            </div>

            {nextLabel ? (
              <form action={advanceTicketFromDashboard} className="mt-5 space-y-3 border-t border-slate-100 pt-5">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <label className="flex items-start gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    name="confirmed"
                    value="yes"
                    required
                    disabled={resolutionNoteRequired}
                    className="mt-0.5 size-4 rounded border-slate-300 accent-indigo-600"
                  />
                  Confirm this one-step status change
                </label>
                <button
                  type="submit"
                  disabled={resolutionNoteRequired}
                  className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                >
                  Move to {nextLabel}
                </button>
                {resolutionNoteRequired ? (
                  <p className="text-xs leading-5 text-amber-700">
                    A resolution note is required before this ticket can move to Resolved.
                  </p>
                ) : null}
              </form>
            ) : (
              <p className="mt-5 border-t border-slate-100 pt-5 text-sm font-semibold text-emerald-700">
                This ticket is complete and closed.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-600">Ownership</p>
            <h2 className="mt-1 text-lg font-bold">Reassign team</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Manual reassignment resets the team alert to pending for the new owner.
            </p>

            <form action={reassignTicketFromDashboard} className="mt-4 space-y-4">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <label className="block text-sm font-semibold text-slate-700">
                Operational team
                <select
                  name="team"
                  required
                  defaultValue={ticket.assignedTeam ?? ""}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="" disabled>Select a team</option>
                  {TEAM_OPTIONS.map((team) => (
                    <option key={team} value={team}>{TEAM_LABELS[team]}</option>
                  ))}
                </select>
              </label>

              <label className="flex items-start gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  name="confirmed"
                  value="yes"
                  required
                  className="mt-0.5 size-4 rounded border-slate-300 accent-fuchsia-600"
                />
                Confirm this team assignment
              </label>

              <button type="submit" className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-700">
                Save team assignment
              </button>
            </form>
          </section>
        </aside>
      </div>
    </main>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`mt-1 break-words text-sm font-semibold text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
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

function StatusTrack({ status }: { status: TicketStatusValue }) {
  const currentIndex = STATUS_STEPS.indexOf(status);

  return (
    <ol aria-label="Ticket progress" className="mt-5 space-y-3">
      {STATUS_STEPS.map((step, index) => {
        const reached = index <= currentIndex;

        return (
          <li key={step} className="flex items-center gap-3">
            <span className={`size-3 rounded-full ${reached ? "bg-indigo-500" : "bg-slate-200"}`} />
            <span className={`text-sm font-semibold ${reached ? "text-indigo-700" : "text-slate-400"}`}>
              {STATUS_LABELS[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
