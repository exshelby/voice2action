import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center bg-[#0d172a] px-4 py-16 text-white sm:px-6">
      <div className="mx-auto w-full max-w-5xl">
        <p className="text-sm font-bold uppercase tracking-[0.28em] text-indigo-300">Voice2Action</p>
        <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-tight sm:text-6xl">
          Customer voices become clear, trackable action.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
          Record feedback, process it locally, route the resulting ticket, and follow the work through resolution.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <Link
            href="/feedback"
            className="group rounded-2xl border border-indigo-400/30 bg-indigo-500 p-6 shadow-xl shadow-indigo-950/30 transition hover:-translate-y-0.5 hover:bg-indigo-400"
          >
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-100">Customer experience</span>
            <span className="mt-3 block text-2xl font-bold">Share voice feedback</span>
            <span className="mt-2 block text-sm leading-6 text-indigo-100">Record and submit a short customer message.</span>
            <span className="mt-6 block text-sm font-bold">Open recorder →</span>
          </Link>

          <Link
            href="/operations"
            className="group rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-emerald-400/60 hover:bg-slate-700"
          >
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Local team workspace</span>
            <span className="mt-3 block text-2xl font-bold">Open operations</span>
            <span className="mt-2 block text-sm leading-6 text-slate-300">Track tickets, ownership, status, and pending alerts.</span>
            <span className="mt-6 block text-sm font-bold text-emerald-300">View dashboard →</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
