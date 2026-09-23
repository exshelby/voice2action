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
