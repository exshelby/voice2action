import VoiceRecorder from "./voice-recorder";

export const metadata = {
  title: "Share feedback | Voice2Action",
  description: "Record and submit customer feedback.",
};

export default function FeedbackPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
            Voice2Action
          </p>

          <h1 className="mt-3 text-4xl font-bold tracking-tight">
            Tell us what happened
          </h1>

          <p className="mt-4 text-lg leading-8 text-slate-600">
            Record a short voice message. We will turn it into clear,
            actionable feedback for the right team.
          </p>
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <VoiceRecorder />

          <p className="mt-6 text-center text-xs leading-5 text-slate-500">
            Your recording will only be used to understand and resolve your
            feedback.
          </p>
        </section>
      </div>
    </main>
  );
}