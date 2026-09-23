"use client";

import { useActionState } from "react";

import { loginOperator, type LoginState } from "../auth-actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginOperator, initialState);

  return (
    <form action={action} className="mt-7 space-y-5">
      <label className="block text-sm font-semibold text-slate-700">
        Username
        <input
          name="username"
          type="text"
          required
          autoComplete="username"
          minLength={3}
          maxLength={64}
          autoFocus
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
      </label>
      <label className="block text-sm font-semibold text-slate-700">
        Password
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          maxLength={200}
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
      </label>
      {state.error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-wait disabled:bg-indigo-300"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
