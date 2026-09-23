import "dotenv/config";

import pg from "pg";

import { categoryLabel } from "./feedback-categories.mjs";
import { findTicket, formatTicketNumber } from "./ticket-store.mjs";

const reference = process.argv[2];

if (!reference) {
  console.error("Usage: npm run ticket:show -- <ticket or feedback reference>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not configured.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  const ticket = await findTicket(client, reference);

  if (!ticket) {
    console.error("Ticket not found.");
    process.exitCode = 1;
  } else {
    console.log(`Ticket: ${formatTicketNumber(ticket.ticket_number)}`);
    console.log(`Status: ${ticket.status.replaceAll("_", " ").toLowerCase()}`);
    console.log(`Title: ${ticket.title}`);
    console.log(`Category: ${categoryLabel(ticket.category)}`);
    console.log(`Description: ${ticket.description}`);
    console.log(`Feedback: ${ticket.feedback_id}`);
    console.log(`Source review revision: ${ticket.source_review_revision}`);
    console.log(`Created at: ${ticket.created_at.toISOString()}`);
  }
} catch (error) {
  console.error("Could not read ticket:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end();
}
