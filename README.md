# Voice2Action

Voice2Action is an AI-powered customer complaint management system that turns spoken customer feedback into structured operational action.

## The problem

Customers often find it easier to explain a problem by speaking than by completing a long form. However, an audio recording alone does not help a business assign, investigate, and resolve the problem.

Voice2Action will transform a customer recording into a structured feedback record and an actionable ticket.

## Planned workflow

Customer voice recording \
→ Speech-to-text \
→ AI classification \
→ Human review and correction \
→ Ticket creation \
→ Team assignment \
→ Notification \
→ Human investigation \
→ Resolution \
→ Analytics and recurring-issue detection

## Phase 1 goal

The first milestone is one real voice recording successfully moving from the customer webpage into storage and a database record.

## Planned technology

- Next.js and React
- TypeScript
- Tailwind CSS
- PostgreSQL
- Prisma
- n8n
- Local speech-to-text model (Faster-Whisper)
- Structured AI classification
- Metabase
- Docker

## Project status

Phase 1 capture and n8n receipt are working. Phase 2 now has local transcription, first-pass local categorization, human correction, review-gated local ticket creation, rule-based team assignment, a durable notification outbox with an optional webhook delivery worker, a local ticket status workflow, and authenticated operator attribution.

The local operations dashboard is available at `http://localhost:3000/operations` while `npm run dev` is running. It shows ticket totals, recent tickets, assigned teams, status progress, SLA deadlines, and pending notification messages. Search by ticket reference or wording, or filter the list by status, team, category, priority, and overdue state. Open `/operations/analytics` for lifecycle, priority, team, category, aging, SLA, and conservative 30-day recurring-issue summaries. Open `/operations/reviews` to review transcribed feedback in the browser while preserving the original model output, then explicitly confirm ticket creation from the saved review. Status changes advance one step at a time, require checking a confirmation box, and are recorded automatically in an immutable history. Open a ticket to view its full transcript and review audit trail, append permanent investigation or resolution notes, change its priority or assigned team, or confirm that a pending local notification was delivered. Priority changes recalculate response and resolution deadlines from the original creation time and are recorded in an immutable history. A resolution note is required before an in-progress ticket can move to Resolved. Manual reassignment refreshes the existing assignment notification for the new team. New browser actions record the signed-in operator, while historical and terminal-created records remain labeled `System / pre-auth`.

## Local operator sign-in

Apply the latest migration, then create the first local operator from an interactive terminal. The password is hidden while you type and must contain 12 to 200 characters.

```powershell
npx prisma migrate deploy
npm run operator:create -- abel "Abel Olaboye" ADMIN
```

Start the app with `npm run dev`, then open `http://localhost:3000/operations`. Unauthenticated requests are redirected to `/operations/login`. The optional final account argument is `OPERATOR`, `MANAGER`, or `ADMIN`; it defaults to `OPERATOR`. Operators can review feedback, create tickets, add work logs, advance status, and confirm notification delivery. Managers can also change priority, reassign tickets, and open analytics. Administrators have all manager capabilities and can be used for locally provisioning trusted accounts. Accounts that existed when the role migration was first applied are promoted to Administrator so the existing local owner is not locked out.

Passwords are stored with scrypt hashes; browser sessions use random tokens whose SHA-256 hashes are stored in PostgreSQL. A session lasts eight hours, and a new login revokes that operator's earlier sessions. Five consecutive failed attempts lock the account for 15 minutes. Role checks run independently in every mutating Server Action; hiding an unavailable control is only a usability aid.

This authentication is deliberately local-only. The cookie is restricted to `/operations`, is HTTP-only and SameSite Strict, but is not marked Secure because the documented development URL uses plain HTTP. The localhost restriction is still enforced. Do not expose this build to the internet: it has no TLS termination, MFA, password recovery, centralized rate limiting, or hardened reverse-proxy trust policy.

## Local transcription setup (Windows)

Keep PostgreSQL and n8n running as in Phase 1. Python 3.9+ is required. Faster-Whisper includes audio decoding, so a separate FFmpeg installation is not needed.

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-transcription.txt
.\.venv\Scripts\python.exe scripts\prepare_local_model.py --model base
npx prisma migrate deploy
npm run transcribe:watch
```

Use the Python version installed on your computer in place of `-3.13` if necessary. Keep `transcribe:watch` running in its own terminal while submitting test recordings. `npm run transcribe:once` processes just one waiting recording. The preparation step downloads model files to `storage/models` once; it does not read or upload customer recordings. Transcription uses those files without network access. The default is the multilingual `base` model; to try `small`, first prepare it with `--model small`, then set `WHISPER_MODEL=small` in `.env`. The larger model uses more memory and processing time.

The worker changes a feedback row from `RECEIVED` to `PROCESSING`, then to `PROCESSED` when it saves `original_transcript` and `transcribed_at`. If it fails, it sets `FAILED` and stores `transcription_error`; the original recording remains in storage. Do not run transcription on real customer recordings until your privacy and retention rules are ready.

After a test submission, use its reference ID to see the result in your local terminal:

```powershell
npm run transcribe:show -- <feedback ID>
```

## Local classification (Phase 2 first pass)

The classifier uses a small TF-IDF model built from synthetic examples in `scripts/local_classify.py`. It runs on your computer without another download or hosted AI service. Its short description is extracted from the customer's words; it does not invent details. It is English-only and recognizes delivery delays/problems, product quality, billing/payment, customer service, app/technical issues, suggestions, and compliments. Unclear results are saved as `OTHER` and marked `Needs review`. This is a starting point, not a substitute for human review.

After applying the latest database migration with `npx prisma migrate deploy`, classify one existing transcribed message by its reference ID:

```powershell
npm run classify:once -- <feedback ID>
npm run transcribe:show -- <feedback ID>
```

Running `classify:once` with a specific ID also retries a previous classification error for that feedback. The watch worker does not silently retry failed rows.

To classify new transcripts automatically, leave `npm run classify:watch` running in a separate terminal alongside `npm run transcribe:watch`. Classification does not overwrite the original transcript. If the local classifier fails, it stores `classification_error` and leaves the transcript available. The local match score is a similarity measure, not a calibrated probability. No ticket is created at this stage.

## Local human review before tickets

Machine transcription and classification can be wrong. Every feedback record must be reviewed by a person before future ticket creation, even when the model does not flag it. After applying the latest migration, open a free terminal and run:

```powershell
npm run review:feedback -- <feedback ID>
```

The command shows the model's original transcript, category, and short description. Type the full corrected wording, choose a category number, and confirm the short description. Press Enter at a prompt to keep the displayed default. Nothing is saved until you type `yes` at the final confirmation. The original transcript and model classification remain unchanged; corrected wording, reviewed category, reviewed short description, and review time are stored separately. Use `npm run transcribe:show -- <feedback ID>` to compare the original and reviewed versions. This initial review tool runs only in a local terminal; no public review webpage is available yet.

## Review-gated local tickets

A ticket can be created only after human review is complete. The ticket copies the reviewed short description, corrected wording, category, review timestamp, and review revision so its source is auditable. One feedback ID can create only one ticket; running the command again returns the existing ticket instead of creating a duplicate.

```powershell
npm run ticket:create -- <feedback ID>
npm run ticket:assign -- TKT-000001
npm run ticket:show -- TKT-000001
npm run ticket:update -- TKT-000001
npm run notification:list
```

The create command previews the ticket and requires typing `yes`. New tickets start with status `Open` and are assigned automatically from their reviewed category. Use `ticket:assign` for an older unassigned ticket; it previews the rule-based recommendation and requires confirmation. Delivery issues route to Logistics, product quality to Quality, billing to Finance, customer service to Customer Support, app issues to Technical Support, suggestions and compliments to Customer Experience, and unclear cases to General Support. Team assignment atomically creates one pending notification in a local database outbox. `notification:list` shows up to 100 pending messages without marking them as sent. Each confirmed `ticket:update` run advances exactly one step: `Open` → `In Progress` → `Resolved` → `Closed`. This prevents accidentally skipping a stage. Closed tickets cannot advance further.

## Optional webhook notification delivery

Notification delivery is disabled by default. To opt in, set `NOTIFICATION_WEBHOOK_URL` to an HTTP or HTTPS endpoint in `.env`. You may also set `NOTIFICATION_WEBHOOK_TOKEN` for Bearer authentication and `NOTIFICATION_MAX_ATTEMPTS` from 1 to 20; the default is 5. Apply the latest migration, then run one delivery attempt or keep the worker polling:

```powershell
npx prisma migrate deploy
npm run notification:deliver:once
npm run notification:deliver:watch
```

The worker claims one due message at a time with a five-minute lease, sends JSON with a stable event ID and `Idempotency-Key` header, and records the result. Retryable failures use bounded delays of 1, 5, 15, and then 60 minutes. A message becomes `Failed` after the configured attempt limit or immediately after a non-retryable response. Because network acknowledgements can be lost, receivers should deduplicate by the event ID or idempotency key. No destination is provisioned and no webhook is contacted unless you explicitly configure the URL and run the worker.
