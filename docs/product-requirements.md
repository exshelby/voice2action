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