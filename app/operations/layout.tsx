import type { ReactNode } from "react";

import { operatorRoleLabel } from "@/lib/operator-roles.mjs";

import { logoutOperator } from "./auth-actions";
import { getCurrentOperationsOperator, requireLocalOperationsRequest } from "./security";

export default async function OperationsLayout({ children }: { children: ReactNode }) {
  await requireLocalOperationsRequest();
  const operator = await getCurrentOperationsOperator();

  return (
    <>
      {operator ? (
        <div className="sticky top-0 z-50 border-b border-slate-700 bg-slate-950 px-4 py-2 text-white shadow-sm">
          <div className="mx-auto flex max-w-7xl items-center justify-end gap-3 text-xs">
            <span className="text-slate-400">Signed in as</span>
            <span className="font-bold">{operator.displayName}</span>
            <span className="text-slate-500">@{operator.username}</span>
            <span className="rounded-full border border-indigo-400/30 bg-indigo-400/10 px-2 py-1 font-bold text-indigo-200">
              {operatorRoleLabel(operator.role)}
            </span>
            <form action={logoutOperator}>
              <button type="submit" className="rounded-lg border border-slate-700 px-3 py-1.5 font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
      {children}
    </>
  );
}
