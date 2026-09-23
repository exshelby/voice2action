"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  createOperatorAccount,
  type OperatorManagementState,
} from "./actions";

const initialState: OperatorManagementState = { revision: 0 };

export function CreateOperatorForm() {
  const [state, action, pending] = useActionState(createOperatorAccount, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.revision, state.success]);

  return (
    <form ref={formRef} action={action} className="mt-5 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-slate-700">
          Username
          <input
            name="username"
            type="text"
            required
            minLength={3}
            maxLength={64}
            autoComplete="off"
            placeholder="jane.doe"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Display name
          <input
            name="displayName"
            type="text"
            required
            minLength={2}
            maxLength={100}
            autoComplete="off"
            placeholder="Jane Doe"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </label>
      </div>
      <label className="block text-sm font-semibold text-slate-700">
        Starting role
        <select
          name="role"
          defaultValue="OPERATOR"
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        >
          <option value="OPERATOR">Operator</option>
          <option value="MANAGER">Manager</option>
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-slate-700">
          Temporary password
          <input
            name="password"
            type="password"
            required
            minLength={12}
            maxLength={200}
            autoComplete="new-password"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Confirm password
          <input
            name="passwordConfirmation"
            type="password"
            required
            minLength={12}
            maxLength={200}
            autoComplete="new-password"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          name="confirmed"
          value="yes"
          required
          className="mt-0.5 size-4 rounded border-slate-300 accent-indigo-600"
        />
        Confirm this local account and securely share its temporary password outside Voice2Action.
      </label>
      {state.error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {state.success}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-wait disabled:bg-indigo-300"
      >
        {pending ? "Creating account…" : "Create operator account"}
      </button>
    </form>
  );
}
