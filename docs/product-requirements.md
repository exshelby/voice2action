# Voice2Action Product Requirements

## Product purpose

Voice2Action turns spoken customer feedback into structured operational work that a business can investigate and resolve.

The finished product will capture voice feedback, transcribe it, classify it, create a ticket, assign the ticket, track its resolution, and show recurring operational problems.

## Target users

### Customer

A person who wants to report a complaint, compliment, or suggestion by speaking.

### Operations team

The people responsible for reviewing, assigning, investigating, and resolving customer feedback.

### Manager

A person who needs to see trends, urgent complaints, unresolved tickets, and recurring problems.

## Phase 1 user story

As a customer, I want to record and submit voice feedback so that the business can receive and process my message.

## Phase 1 must include

- A customer feedback page at `/feedback`.
- A button that requests microphone permission.
- Start-recording and stop-recording controls.
- A visible recording state.
- Audio playback before submission.
- A button for deleting and recording again.
- A submit button.
- Validation that prevents empty submissions.
- A unique feedback ID.
- Audio storage.
- A PostgreSQL feedback record with the status `RECEIVED`.
- An event sent to an n8n webhook.
- A clear success or failure message.
- Basic error logging.

## Not included in Phase 1

The following features will be added later:

- Speech-to-text.
- AI classification.
- Sentiment analysis.
- Urgency detection.
- Ticket creation.
- Team routing.
- Email or chat notifications.
- Customer accounts.
- Operations dashboard.
- Recurring-issue detection.
- WhatsApp integration.

## Phase 2: first slice — transcription

The next milestone is to turn a submitted voice recording into text while retaining the original audio and original transcript for review. A successful run links the transcript to the same feedback ID, records when transcription finished, and makes failures visible without deleting the customer's recording. Transcription runs with a local CPU model; no customer audio is sent to a hosted speech-to-text API. Classification, tickets, and routing follow after this transcription path works end to end.

## Phase 2: second slice — local categorization

After transcription, save a first-pass issue category and a short description linked to the same feedback ID. Preserve the customer's original words, mark ambiguous cases for human review, and keep classification failures separate from transcription failures. The initial English-only classifier runs entirely locally and is trained on synthetic examples. Its short description is extractive, not generative. Ticket creation and routing are not part of this slice.

## Phase 2: third slice — human correction

Before creating a ticket, a local operator reviews the transcript, category, and short description. The operator can correct the words and category while the original model output remains available for comparison. The reviewed values are saved separately, with a review timestamp. Automated confidence does not waive human review. This slice does not expose recordings or transcripts through a public operations page.

## Phase 2: fourth slice — review-gated ticket creation

An operator can preview and explicitly confirm a ticket created from human-reviewed feedback. The ticket begins as `OPEN` and stores a snapshot of the reviewed title, description, category, review timestamp, and review revision. Feedback without a completed human review cannot create a ticket. A database uniqueness rule ensures that one feedback record cannot create duplicate tickets. Assignment, notifications, resolution workflow, and an operations dashboard are not included in this slice.

## Phase 2: fifth slice — local ticket status workflow

An operator can explicitly confirm moving a local ticket through `OPEN`, `IN_PROGRESS`, `RESOLVED`, and `CLOSED`, one step at a time. A stale update must not overwrite a status changed by another operator. This slice does not include assignment, notifications, reopening closed tickets, or an operations dashboard.

## Phase 2: sixth slice — rule-based team assignment

Each reviewed category maps to one operational team under a versioned local rule set. New tickets store their assigned team during creation, while an operator can preview and confirm assignment for older unassigned tickets. The assignment timestamp and rule version make the decision auditable. Unknown categories must not be silently routed. This slice does not send notifications or support manual reassignment.

## Phase 2: seventh slice — local notification outbox

Assigning a ticket creates exactly one pending notification for its team in the same database transaction. Existing assigned tickets receive a backfilled notification. An operator can list pending notifications locally without marking them as delivered. The queue stores delivery state, attempt count, failure details, and sent time for a future email or chat sender. This slice does not contact an external service.

## Phase 2: eighth slice — local operations dashboard

A local operator can see ticket totals, recent ticket details, team assignments, lifecycle progress, and pending notification messages in one browser screen. The operator can explicitly confirm a one-step status advance. The server must re-read ticket state and prevent stale updates. Database access remains server-side, and the page is limited to localhost. Authentication, public deployment, filters, pagination, and manual reassignment remain future work.

## Phase 2: ninth slice — ticket detail and manual operations controls

A local operator can open a complete ticket record, compare the original model output with the saved human review, inspect notification history, and explicitly reassign the ticket to another operational team. Reassignment records a manual assignment, refreshes the existing assignment notification for the new owner, and prevents stale ownership updates. An operator can also confirm that a pending local notification was delivered. These controls remain restricted to localhost and do not contact an external email or chat service.

## Phase 2: tenth slice — dashboard search and filters

A local operator can search tickets by readable ticket reference, title, or description and narrow the result set by status, assigned team, and category. Filters are represented in the URL so the same local view can be refreshed or bookmarked. The server validates query values before building the database query, shows the number of matching tickets, and provides an explicit way to clear all active filters. Global summary totals and the notification outbox remain visible while the ticket list is filtered.

## Phase 2: eleventh slice — local operations analytics

A local manager can view lifecycle totals, ownership distribution, category mix, completion rate, and aging buckets for active tickets. The analytics page detects a recurring issue only after at least two tickets within 30 days share the same normalized title and category. Analytics reads at most the 500 most recent tickets, stays restricted to localhost, and uses server-rendered summaries without exposing raw database access to the browser. The initial recurring detector is deterministic and intentionally conservative; semantic similarity and scheduled reporting remain future work.

## Phase 2: twelfth slice — browser-based human review inbox

A local operator can see transcribed feedback that still needs human review and open a browser form to correct the wording, category, and short description. The original transcript and classifier output remain read-only, while corrected values are stored in the existing reviewed fields with an incremented revision. A stale form cannot overwrite a newer review, and browser editing is locked after a ticket snapshots the review. The inbox also shows reviewed feedback that is ready for ticket creation. The review workspace remains restricted to localhost; ticket creation continues as a separate explicitly confirmed step.

## Phase 2: thirteenth slice — browser ticket creation

After inspecting a completed review, a local operator can explicitly confirm creating its ticket in the browser. One conditional database statement snapshots the exact submitted review revision, applies the versioned category-to-team rule, and begins the ticket as `OPEN`. The existing assignment trigger queues the team notification in the same transaction. Concurrent or repeated submissions return the single existing ticket instead of creating duplicates. The action remains restricted to localhost and redirects to the full ticket record after success.

## Phase 2: fourteenth slice — auditable ticket work log

A local operator can append investigation and resolution notes to an active ticket from its detail page. Entries are timestamped, typed, and immutable through the interface so the ticket retains a chronological operational record. Closed tickets are read-only. An in-progress ticket cannot move to `RESOLVED` until at least one resolution note exists, and status advancement keeps its existing stale-update protection. Authentication, named operator identities, attachments, editing, and reopening remain future work.

## Phase 2: fifteenth slice — immutable ticket status history

Every ticket status is recorded as an immutable timestamped event, regardless of whether the change comes from the browser, terminal workflow, or future automation. A database trigger records ticket creation and each real status transition while ignoring updates that do not change status. Existing tickets receive a baseline event for the status observed when tracking begins; the system does not invent timestamps for earlier transitions. The ticket detail page presents the recorded history beside the lifecycle controls.

## Phase 2: sixteenth slice — ticket priority and SLA tracking

Every ticket has a triage priority and deterministic response and resolution deadlines. Low, normal, high, and critical priorities map to 24-hour/5-day, 8-hour/3-day, 2-hour/24-hour, and 30-minute/4-hour service windows. Deadlines are calculated from the original ticket creation time, so escalating priority never grants extra time. The first departure from `OPEN` records the observed response time, while the operations dashboard and analytics surface active overdue work. Operators can filter by priority or overdue state, explicitly confirm priority changes, and inspect an immutable priority history. Existing tickets begin with a normal-priority baseline; the system does not invent earlier priority changes or response timestamps.

## Phase 2: seventeenth slice — webhook notification delivery worker

An explicitly configured local worker can deliver queued team notifications to one HTTP or HTTPS webhook. The webhook receives a versioned JSON payload, a stable event ID, and an idempotency header so the receiving system can suppress duplicates. Workers claim one eligible row with a five-minute lease and `SKIP LOCKED`, preventing simultaneous workers from sending the same claim. Successful delivery records `SENT`; temporary network, throttling, and server failures return the alert to `PENDING` with bounded exponential backoff; invalid requests and exhausted retries become `FAILED`. Expired leases are recovered automatically. The dashboard surfaces pending, sending, retrying, and failed alerts. Delivery remains disabled until a webhook URL is deliberately configured, and this slice does not provision an email, chat, or n8n destination.

## Phase 2: eighteenth slice — local operator authentication and attribution

The browser operations workspace requires a locally provisioned operator account. There is no public registration route. Passwords use a memory-hard scrypt hash, successful sign-in issues an opaque database-backed session, and repeated failures temporarily lock the account. Every operations page and Server Action verifies both the localhost boundary and the current session. Reviews, browser-created tickets, manual assignment, work-log entries, priority and status transitions, and manual notification confirmation record the responsible operator without rewriting older history. Pre-authentication and terminal automation records remain explicitly identifiable as system activity. Sessions expire after eight hours and a new login revokes that operator's existing sessions. This slice remains a development safeguard rather than production identity: roles, MFA, recovery, TLS, and deployment-grade proxy hardening are future work.

## Phase 1 success test

Phase 1 is complete when:

1. A customer opens the feedback page.
2. The customer records a real voice message.
3. The customer plays the recording back.
4. The customer submits the recording.
5. The audio file reaches storage.
6. A feedback record is created in PostgreSQL.
7. n8n receives the feedback ID.
8. The customer receives a success message.
9. An empty or invalid recording fails safely.

## Privacy principles

- Use synthetic or anonymized customer information during development.
- Do not collect personal information that the system does not need.
- Never commit passwords or API keys to GitHub.
- Keep API keys in environment files.
- Store the original transcript for auditing when transcription is added.
- Add an audio-retention and deletion process before production use.
