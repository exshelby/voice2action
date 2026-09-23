import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createTicket, findTicket, formatTicketNumber } from "./ticket-store.mjs";

test("ticket numbers have a readable reference", () => {
  assert.equal(formatTicketNumber(1), "TKT-000001");
  assert.equal(formatTicketNumber(1234567), "TKT-1234567");
  assert.throws(() => formatTicketNumber(0));
});

test("ticket creation copies only human-reviewed fields", async () => {
  const feedbackId = randomUUID();
  const ticketId = randomUUID();
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      return {
        rowCount: 1,
        rows: [{
          id: ticketId,
          ticket_number: 1,
          feedback_id: feedbackId,
          title: "Package arrived damaged.",
          description: "I got the package, but it was damaged.",
          category: "DELIVERY_PROBLEM",
          source_review_revision: 1,
          status: "OPEN",
        }],
      };
    },
  };

  const result = await createTicket(client, feedbackId, ticketId);

  assert.equal(result.created, true);
  assert.match(queries[0].sql, /reviewed_summary, reviewed_transcript, reviewed_category/);
  assert.match(queries[0].sql, /reviewed_at IS NOT NULL/);
  assert.match(queries[0].sql, /ON CONFLICT \(feedback_id\) DO NOTHING/);
  assert.deepEqual(queries[0].params, [feedbackId, ticketId]);
});

test("a second request returns the existing ticket instead of duplicating it", async () => {
  const feedbackId = randomUUID();
  const ticketId = randomUUID();
  const existingTicketId = randomUUID();
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);

      if (queries.length === 1) return { rowCount: 0, rows: [] };
      if (queries.length === 2) {
        return { rows: [{ id: feedbackId, ticket_id: existingTicketId, ticket_number: 7, ticket_status: "OPEN" }] };
      }
      return { rows: [{ id: existingTicketId, ticket_number: 7, feedback_id: feedbackId, status: "OPEN" }] };
    },
  };

  const result = await createTicket(client, feedbackId, ticketId);

  assert.equal(result.created, false);
  assert.equal(result.ticket.ticket_number, 7);
  assert.equal(queries.length, 3);
});

test("unreviewed feedback cannot create a ticket", async () => {
  const feedbackId = randomUUID();
  const client = {
    calls: 0,
    async query() {
      this.calls += 1;
      if (this.calls === 1) return { rowCount: 0, rows: [] };
      return { rows: [{ id: feedbackId, ticket_id: null, reviewed_at: null }] };
    },
  };

  await assert.rejects(createTicket(client, feedbackId, randomUUID()), /Human review must be completed/);
});

test("tickets can be found by readable reference", async () => {
  const client = {
    async query(sql, params) {
      assert.match(sql, /ticket_number = \$1/);
      assert.deepEqual(params, [12]);
      return { rows: [{ ticket_number: 12 }] };
    },
  };

  const ticket = await findTicket(client, "TKT-000012");
  assert.equal(ticket.ticket_number, 12);
});
