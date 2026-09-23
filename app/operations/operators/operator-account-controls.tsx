"use client";

import { useActionState } from "react";

import {
  revokeOperatorSessions,
  updateOperatorAccount,
  type OperatorManagementState,
} from "./actions";

const initialState: OperatorManagementState = { revision: 0 };

type OperatorAccountControlsProps = {
  operator: {
    id: string;
    role: "OPERATOR" | "MANAGER" | "ADMIN";
    active: boolean;
    activeSessionCount: number;
  };
  isCurrentOperator: boolean;
};

function ActionMessage({ state }: { state: OperatorManagementState }) {
  if (state.error) {
    return <p role="alert" className="mt-3 text-xs font-semibold text-rose-700">{state.error}</p>;
  }
  if (state.success) {
    return <p role="status" className="mt-3 text-xs font-semibold text-emerald-700">{state.success}</p>;
  }
  return null;
}

export function OperatorAccountControls({ operator, isCurrentOperator }: OperatorAccountControlsProps) {
  const [updateState, updateAction, updatePending] = useActionState(updateOperatorAccount, initialState);
  const [revokeState, revokeAction, revokePending] = useActionState(revokeOperatorSessions, initialState);

  if (isCurrentOperator) {
    return (
      <p className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs font-semibold leading-5 text-indigo-800">
        This is your current account. Use another Administrator account to change its access, or use Sign out to end this session.
      </p>
    );
  }

  return (
    <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 lg:grid-cols-[1fr_auto]">
      <form action={updateAction} className="space-y-3">
        <input type="hidden" name="operatorId" value={operator.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
            Role
            <select
              name="role"
              defaultValue={operator.role}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-800"
            >
              <option value="OPERATOR">Operator</option>
              <option value="MANAGER">Manager</option>
              <option value="ADMIN">Administrator</option>
            </select>
          </label>
          <label className="flex items-center gap-2 self-end rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              name="active"
              value="yes"
              defaultChecked={operator.active}
              className="size-4 rounded border-slate-300 accent-emerald-600"
            />
            Account active
          </label>
        </div>
        <label className="flex items-start gap-2 text-xs text-slate-600">
          <input type="checkbox" name="confirmed" value="yes" required className="mt-0.5 size-4 rounded border-slate-300 accent-indigo-600" />
          Confirm this role and account-status change
        </label>
        <button
          type="submit"
          disabled={updatePending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-700 disabled:cursor-wait disabled:bg-slate-400"
        >
          {updatePending ? "Saving…" : "Save permissions"}
        </button>
        <ActionMessage state={updateState} />
      </form>

      <form action={revokeAction} className="border-t border-slate-100 pt-4 lg:w-48 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
        <input type="hidden" name="operatorId" value={operator.id} />
        <p className="text-xs leading-5 text-slate-500">
          Immediately end {operator.activeSessionCount} active {operator.activeSessionCount === 1 ? "session" : "sessions"}.
        </p>
        <label className="mt-2 flex items-start gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            name="confirmed"
            value="yes"
            required
            disabled={operator.activeSessionCount === 0}
            className="mt-0.5 size-4 rounded border-slate-300 accent-rose-600"
          />
          Confirm revocation
        </label>
        <button
          type="submit"
          disabled={revokePending || operator.activeSessionCount === 0}
          className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
        >
          {revokePending ? "Revoking…" : "Revoke sessions"}
        </button>
        <ActionMessage state={revokeState} />
      </form>
    </div>
  );
}
