import { randomUUID } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function formatTicketNumber(ticketNumber) {
  if (!Number.isSafeInteger(ticketNumber) || ticketNumber < 1) {
    throw new Error("The ticket number is invalid.");
  }

  return `TKT-${String(ticketNumber).padStart(6, "0")}`;
}

export async function loadTicketSource(client, feedbackId) {
  if (!UUID_PATTERN.test(feedbackId)) {
    throw new Error("A valid feedback ID is required.");
  }

  const result = await client.query(
    `SELECT f.id, f.reviewed_transcript, f.reviewed_category,
            f.reviewed_summary, f.reviewed_at, f.review_revision,
            t.id AS ticket_id, t.ticket_number, t.status AS ticket_status
     FROM feedback f
     LEFT JOIN ticket t ON t.feedback_id = f.id
     WHERE f.id = $1`,
    [feedbackId],
  );
  const source = result.rows[0];

  if (!source) {
    throw new Error("Feedback not found.");
  }

  return source;
}

export async function createTicket(client, feedbackId, ticketId = randomUUID()) {
  if (!UUID_PATTERN.test(feedbackId) || !UUID_PATTERN.test(ticketId)) {
    throw new Error("A valid feedback ID and ticket ID are required.");
  }

  const inserted = await client.query(
    `INSERT INTO ticket (
       id, feedback_id, title, description, category,
       source_review_revision, source_reviewed_at, status, updated_at
     )
     SELECT $2, id, reviewed_summary, reviewed_transcript, reviewed_category,
            review_revision, reviewed_at, 'OPEN', NOW()
     FROM feedback
     WHERE id = $1
       AND reviewed_at IS NOT NULL
       AND reviewed_transcript IS NOT NULL
       AND reviewed_category IS NOT NULL
       AND reviewed_summary IS NOT NULL
       AND review_revision > 0
     ON CONFLICT (feedback_id) DO NOTHING
     RETURNING id, ticket_number, feedback_id, title, description,
               category, source_review_revision, source_reviewed_at,
               status, created_at, updated_at`,
    [feedbackId, ticketId],
  );

  if (inserted.rowCount === 1) {
    return { created: true, ticket: inserted.rows[0] };
  }

  const source = await loadTicketSource(client, feedbackId);

  if (source.ticket_id) {
    const existing = await client.query(
      `SELECT id, ticket_number, feedback_id, title, description,
              category, source_review_revision, source_reviewed_at,
              status, created_at, updated_at
       FROM ticket WHERE id = $1`,
      [source.ticket_id],
    );
    return { created: false, ticket: existing.rows[0] };
  }

  throw new Error("Human review must be completed before a ticket can be created.");
}

export async function findTicket(client, reference) {
  const numberMatch = /^(?:TKT-)?0*([1-9][0-9]*)$/i.exec(reference);
  let result;

  if (numberMatch) {
    const ticketNumber = Number(numberMatch[1]);

    if (!Number.isSafeInteger(ticketNumber)) {
      throw new Error("The ticket number is too large.");
    }

    result = await client.query(
      `SELECT id, ticket_number, feedback_id, title, description,
              category, source_review_revision, source_reviewed_at,
              status, created_at, updated_at
       FROM ticket WHERE ticket_number = $1`,
      [ticketNumber],
    );
  } else if (UUID_PATTERN.test(reference)) {
    result = await client.query(
      `SELECT id, ticket_number, feedback_id, title, description,
              category, source_review_revision, source_reviewed_at,
              status, created_at, updated_at
       FROM ticket WHERE id = $1 OR feedback_id = $1`,
      [reference],
    );
  } else {
    throw new Error("Use a reference such as TKT-000001 or a feedback ID.");
  }

  return result.rows[0] ?? null;
}
