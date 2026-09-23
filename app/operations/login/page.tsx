import { redirect } from "next/navigation";

import { getCurrentOperationsOperator, requireLocalOperationsRequest } from "../security";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Operator sign in | Voice2Action",
  description: "Sign in to the local Voice2Action operations workspace.",
};

export default async function OperationsLoginPage() {
  await requireLocalOperationsRequest();

  if (await getCurrentOperationsOperator()) {
    redirect("/operations");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#0d172a] px-4 py-12 text-slate-950">
      <section className="w-full max-w-md rounded-3xl border border-slate-700 bg-white p-7 shadow-2xl sm:p-9">
        <div className="grid size-12 place-items-center rounded-2xl bg-indigo-600 text-lg font-black text-white">V</div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.24em] text-indigo-600">Local operations</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Operator sign in</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Use a local operator account. Sessions expire after eight hours and are stored as hashed tokens.
        </p>
        <LoginForm />
        <p className="mt-6 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500">
          Accounts are created from the local terminal; there is no public sign-up route.
        </p>
      </section>
    </main>
  );
}
