import { randomUUID } from "node:crypto";

import { ASSIGNMENT_RULE_VERSION, routingRulesJson, teamForCategory } from "./ticket-routing.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NEXT_TICKET_STATUS = new Map([
  ["OPEN", "IN_PROGRESS"],
  ["IN_PROGRESS", "RESOLVED"],
  ["RESOLVED", "CLOSED"],
]);

const TICKET_STATUS_LABELS = new Map([
  ["OPEN", "Open"],
  ["IN_PROGRESS", "In Progress"],
  ["RESOLVED", "Resolved"],
  ["CLOSED", "Closed"],
]);

export function ticketStatusLabel(status) {
  const label = TICKET_STATUS_LABELS.get(status);

  if (!label) {
    throw new Error("The ticket status is invalid.");
  }

  return label;
}

export function nextTicketStatus(status) {
  if (!TICKET_STATUS_LABELS.has(status)) {
    throw new Error("The ticket status is invalid.");
  }

  return NEXT_TICKET_STATUS.get(status) ?? null;
}

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
            t.id AS ticket_id, t.ticket_number, t.status AS ticket_status,
            t.assigned_team AS ticket_assigned_team
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
       source_review_revision, source_reviewed_at, status,
       assigned_team, assignment_rule_version, assigned_at, updated_at
     )
     SELECT $2, id, reviewed_summary, reviewed_transcript, reviewed_category,
            review_revision, reviewed_at, 'OPEN',
            ($3::jsonb ->> reviewed_category)::ticket_team, $4, NOW(), NOW()
     FROM feedback
     WHERE id = $1
       AND reviewed_at IS NOT NULL
       AND reviewed_transcript IS NOT NULL
       AND reviewed_category IS NOT NULL
       AND reviewed_summary IS NOT NULL
       AND review_revision > 0
       AND $3::jsonb ? reviewed_category
     ON CONFLICT (feedback_id) DO NOTHING
     RETURNING id, ticket_number, feedback_id, title, description,
               category, source_review_revision, source_reviewed_at,
               status, assigned_team, assignment_rule_version, assigned_at,
               created_at, updated_at`,
    [feedbackId, ticketId, routingRulesJson(), ASSIGNMENT_RULE_VERSION],
  );

  if (inserted.rowCount === 1) {
    return { created: true, ticket: inserted.rows[0] };
  }

  const source = await loadTicketSource(client, feedbackId);

  if (source.ticket_id) {
    const existing = await client.query(
      `SELECT id, ticket_number, feedback_id, title, description,
              category, source_review_revision, source_reviewed_at,
              status, assigned_team, assignment_rule_version, assigned_at,
              created_at, updated_at
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
              status, assigned_team, assignment_rule_version, assigned_at,
              created_at, updated_at
       FROM ticket WHERE ticket_number = $1`,
      [ticketNumber],
    );
  } else if (UUID_PATTERN.test(reference)) {
    result = await client.query(
      `SELECT id, ticket_number, feedback_id, title, description,
              category, source_review_revision, source_reviewed_at,
              status, assigned_team, assignment_rule_version, assigned_at,
              created_at, updated_at
       FROM ticket WHERE id = $1 OR feedback_id = $1`,
      [reference],
    );
  } else {
    throw new Error("Use a reference such as TKT-000001 or a feedback ID.");
  }

  return result.rows[0] ?? null;
}

export async function advanceTicketStatus(client, ticket) {
  const nextStatus = nextTicketStatus(ticket.status);

  if (!nextStatus) {
    throw new Error("This ticket is already Closed and cannot advance further.");
  }

  const updated = await client.query(
    `UPDATE ticket
     SET status = $2, updated_at = NOW()
     WHERE id = $1 AND status = $3
     RETURNING id, ticket_number, feedback_id, title, description,
               category, source_review_revision, source_reviewed_at,
               status, assigned_team, assignment_rule_version, assigned_at,
               created_at, updated_at`,
    [ticket.id, nextStatus, ticket.status],
  );

  if (updated.rowCount !== 1) {
    throw new Error("This ticket changed while you were updating it. Run the command again to see its latest status.");
  }

  return updated.rows[0];
}

export async function assignTicket(client, ticket) {
  if (ticket.assigned_team) {
    return { assigned: false, ticket };
  }

  const team = teamForCategory(ticket.category);
  const updated = await client.query(
    `UPDATE ticket
     SET assigned_team = $2, assignment_rule_version = $3,
         assigned_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND assigned_team IS NULL
     RETURNING id, ticket_number, feedback_id, title, description,
               category, source_review_revision, source_reviewed_at,
               status, assigned_team, assignment_rule_version, assigned_at,
               created_at, updated_at`,
    [ticket.id, team, ASSIGNMENT_RULE_VERSION],
  );

  if (updated.rowCount !== 1) {
    throw new Error("This ticket changed while you were assigning it. Run the command again to see its latest team.");
  }

  return { assigned: true, ticket: updated.rows[0] };
}
