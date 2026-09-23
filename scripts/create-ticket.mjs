import "dotenv/config";

import { stdin as input, stdout as output } from "node:process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";

import pg from "pg";

import { categoryLabel } from "./feedback-categories.mjs";
import { teamForCategory, teamLabel } from "./ticket-routing.mjs";
import { createTicket, formatTicketNumber, loadTicketSource } from "./ticket-store.mjs";

async function main() {
  const feedbackId = process.argv[2];

  if (!feedbackId) {
    throw new Error("Usage: npm run ticket:create -- <feedback ID>");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const source = await loadTicketSource(client, feedbackId);

    if (source.ticket_id) {
      console.log(`${formatTicketNumber(source.ticket_number)} already exists for this feedback. No duplicate was created.`);
      return;
    }
    if (
      !source.reviewed_at ||
      !source.reviewed_transcript ||
      !source.reviewed_category ||
      !source.reviewed_summary ||
      source.review_revision < 1
    ) {
      throw new Error("Human review must be completed before a ticket can be created.");
    }

    console.log("\nTicket to create:");
    console.log(`Feedback: ${feedbackId}`);
    console.log(`Title: ${source.reviewed_summary}`);
    console.log(`Category: ${categoryLabel(source.reviewed_category)}`);
    console.log(`Assigned team: ${teamLabel(teamForCategory(source.reviewed_category))}`);
    console.log(`Description: ${source.reviewed_transcript}`);
    console.log("Status: Open");
    console.log(`Source review revision: ${source.review_revision}`);

    const terminal = readline.createInterface({ input, output });

    try {
      const answer = (await terminal.question("Create this ticket? Type yes to confirm: ")).trim().toLowerCase();

      if (answer !== "yes") {
        console.log("No ticket was created.");
        return;
      }
    } finally {
      terminal.close();
    }

    const result = await createTicket(client, feedbackId);
    const reference = formatTicketNumber(result.ticket.ticket_number);

    if (result.created) {
      console.log(`${reference} created with status Open and assigned to ${teamLabel(result.ticket.assigned_team)}.`);
    } else {
      console.log(`${reference} already exists. No duplicate was created.`);
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("Ticket could not be created:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
