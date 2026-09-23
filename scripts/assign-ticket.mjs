import "dotenv/config";

import { stdin as input, stdout as output } from "node:process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";

import pg from "pg";

import { categoryLabel } from "./feedback-categories.mjs";
import { teamForCategory, teamLabel } from "./ticket-routing.mjs";
import { assignTicket, findTicket, formatTicketNumber } from "./ticket-store.mjs";

async function main() {
  const reference = process.argv[2];

  if (!reference) {
    throw new Error("Usage: npm run ticket:assign -- <ticket reference>");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const ticket = await findTicket(client, reference);

    if (!ticket) {
      throw new Error("Ticket not found.");
    }

    const ticketReference = formatTicketNumber(ticket.ticket_number);

    if (ticket.assigned_team) {
      console.log(`${ticketReference} is already assigned to ${teamLabel(ticket.assigned_team)}. No change was made.`);
      return;
    }

    const team = teamForCategory(ticket.category);

    console.log("\nTicket assignment:");
    console.log(`Ticket: ${ticketReference}`);
    console.log(`Title: ${ticket.title}`);
    console.log(`Category: ${categoryLabel(ticket.category)}`);
    console.log(`Recommended team: ${teamLabel(team)}`);

    const terminal = readline.createInterface({ input, output });

    try {
      const answer = (await terminal.question("Assign this ticket? Type yes to confirm: ")).trim().toLowerCase();

      if (answer !== "yes") {
        console.log("The ticket was not assigned.");
        return;
      }
    } finally {
      terminal.close();
    }

    const result = await assignTicket(client, ticket);
    console.log(`${ticketReference} assigned to ${teamLabel(result.ticket.assigned_team)}.`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("Ticket could not be assigned:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
