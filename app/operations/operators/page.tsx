import Link from "next/link";
import { redirect } from "next/navigation";

import {
  OperatorAccountEventType,
  OperatorRole,
  type OperatorRole as OperatorRoleValue,
} from "@/generated/prisma/client";
import { operatorRoleLabel } from "@/lib/operator-roles.mjs";
import { prisma } from "@/lib/prisma";

import { requireOperationsOperator } from "../security";
import { CreateOperatorForm } from "./create-operator-form";
import { OperatorAccountControls } from "./operator-account-controls";

export const metadata = {
  title: "Operator management | Voice2Action",
  description: "Manage local Voice2Action operator accounts and permissions.",
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

const ROLE_STYLES: Record<OperatorRoleValue, string> = {
  OPERATOR: "border-slate-200 bg-slate-100 text-slate-700",
  MANAGER: "border-blue-200 bg-blue-50 text-blue-700",
  ADMIN: "border-violet-200 bg-violet-50 text-violet-700",
};

const EVENT_LABELS = {
  [OperatorAccountEventType.CREATED]: "Created account",
  [OperatorAccountEventType.ACCOUNT_UPDATED]: "Updated permissions",
  [OperatorAccountEventType.SESSIONS_REVOKED]: "Revoked sessions",
};

export default async function OperatorManagementPage() {
  const currentOperator = await requireOperationsOperator();

  if (currentOperator.role !== OperatorRole.ADMIN) {
    redirect("/operations?access=administrator");
  }

  const now = new Date();
  const [operators, events] = await Promise.all([
    prisma.operator.findMany({
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        active: true,
        failedLoginCount: true,
        lockedUntil: true,
        createdAt: true,
        sessions: {
          where: { expiresAt: { gt: now } },
          select: { id: true },
        },
      },
      orderBy: [{ active: "desc" }, { role: "desc" }, { username: "asc" }],
    }),
    prisma.operatorAccountEvent.findMany({
      include: {
        actor: { select: { displayName: true, username: true } },
        target: { select: { displayName: true, username: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    }),
  ]);

  const activeCount = operators.filter((operator) => operator.active).length;
  const administratorCount = operators.filter(
    (operator) => operator.active && operator.role === OperatorRole.ADMIN,
  ).length;
  const activeSessionCount = operators.reduce(
    (count, operator) => count + operator.sessions.length,
    0,
  );

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <header className="border-b border-slate-800 bg-[#0d172a] text-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Link href="/operations" className="text-sm font-semibold text-indigo-300 transition hover:text-white">
            ← Back to operations
          </Link>
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.24em] text-violet-300">Administrator workspace</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Operator accounts and access</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
            Provision local staff, apply least-privilege roles, end active sessions, and retain an immutable account-change history.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-7 px-4 py-8 sm:px-6 lg:px-8">
        <section aria-label="Account summary" className="grid gap-4 sm:grid-cols-3">
          <Metric label="Active accounts" value={activeCount} detail={`${operators.length} total`} />
          <Metric label="Administrators" value={administratorCount} detail="At least one required" />
          <Metric label="Active sessions" value={activeSessionCount} detail="Unexpired browser sessions" />
        </section>

        <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">Access directory</p>
                <h2 className="mt-1 text-xl font-bold">Local operator accounts</h2>
              </div>
              <p className="text-sm text-slate-500">{operators.length} {operators.length === 1 ? "account" : "accounts"}</p>
            </div>

            <div className="mt-5 space-y-4">
              {operators.map((operator) => {
                const isCurrentOperator = operator.id === currentOperator.id;
                const currentlyLocked = Boolean(operator.lockedUntil && operator.lockedUntil > now);

                return (
                  <article key={operator.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-slate-900">{operator.displayName}</h3>
                          {isCurrentOperator ? (
                            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-700">You</span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-slate-500">@{operator.username}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${ROLE_STYLES[operator.role]}`}>
                          {operatorRoleLabel(operator.role)}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${operator.active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-500"}`}>
                          {operator.active ? "Active" : "Inactive"}
                        </span>
                        {currentlyLocked ? (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">Locked</span>
                        ) : null}
                      </div>
                    </div>
                    <dl className="mt-4 grid gap-3 text-xs text-slate-500 sm:grid-cols-3">
                      <div><dt className="font-bold uppercase tracking-wide text-slate-400">Created</dt><dd className="mt-1">{dateFormatter.format(operator.createdAt)}</dd></div>
                      <div><dt className="font-bold uppercase tracking-wide text-slate-400">Sessions</dt><dd className="mt-1">{operator.sessions.length} active</dd></div>
                      <div><dt className="font-bold uppercase tracking-wide text-slate-400">Failed logins</dt><dd className="mt-1">{operator.failedLoginCount}</dd></div>
                    </dl>
                    <OperatorAccountControls
                      operator={{
                        id: operator.id,
                        role: operator.role,
                        active: operator.active,
                        activeSessionCount: operator.sessions.length,
                      }}
                      isCurrentOperator={isCurrentOperator}
                    />
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="space-y-7">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">Provision access</p>
              <h2 className="mt-1 text-lg font-bold">Create local account</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                New accounts start as Operator or Manager. Promote a trusted account separately if another Administrator is required.
              </p>
              <CreateOperatorForm />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-600">Security history</p>
                  <h2 className="mt-1 text-lg font-bold">Recent changes</h2>
                </div>
                <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700">{events.length}</span>
              </div>
              <ol className="mt-4 space-y-4">
                {events.length ? events.map((event) => (
                  <li key={String(event.id)} className="border-l-2 border-violet-200 pl-3">
                    <p className="text-sm font-bold text-slate-800">{EVENT_LABELS[event.eventType]}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {event.actor.displayName} (@{event.actor.username}) → {event.target.displayName} (@{event.target.username})
                    </p>
                    {event.beforeRole && event.afterRole ? (
                      <p className="mt-1 text-xs text-slate-500">
                        {operatorRoleLabel(event.beforeRole)} / {event.beforeActive ? "active" : "inactive"} → {operatorRoleLabel(event.afterRole)} / {event.afterActive ? "active" : "inactive"}
                      </p>
                    ) : event.afterRole ? (
                      <p className="mt-1 text-xs text-slate-500">Started as {operatorRoleLabel(event.afterRole)}</p>
                    ) : null}
                    <time className="mt-1 block text-[11px] text-slate-400" dateTime={event.createdAt.toISOString()}>
                      {dateFormatter.format(event.createdAt)}
                    </time>
                  </li>
                )) : (
                  <li className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No browser account changes have been recorded yet.</li>
                )}
              </ol>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </article>
  );
}
