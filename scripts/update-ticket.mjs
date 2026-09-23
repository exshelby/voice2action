import "dotenv/config";

import { stdin as input, stdout as output } from "node:process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";

import pg from "pg";

import {
  advanceTicketStatus,
  findTicket,
  formatTicketNumber,
  nextTicketStatus,
  ticketStatusLabel,
} from "./ticket-store.mjs";

async function main() {
  const reference = process.argv[2];

  if (!reference) {
    throw new Error("Usage: npm run ticket:update -- <ticket reference>");
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

    const nextStatus = nextTicketStatus(ticket.status);

    if (!nextStatus) {
      throw new Error(`${formatTicketNumber(ticket.ticket_number)} is already Closed and cannot advance further.`);
    }

    console.log("\nTicket status change:");
    console.log(`Ticket: ${formatTicketNumber(ticket.ticket_number)}`);
    console.log(`Title: ${ticket.title}`);
    console.log(`Current status: ${ticketStatusLabel(ticket.status)}`);
    console.log(`Next status: ${ticketStatusLabel(nextStatus)}`);

    const terminal = readline.createInterface({ input, output });

    try {
      const answer = (await terminal.question("Apply this status change? Type yes to confirm: ")).trim().toLowerCase();

      if (answer !== "yes") {
        console.log("The ticket was not changed.");
        return;
      }
    } finally {
      terminal.close();
    }

    const updated = await advanceTicketStatus(client, ticket);
    console.log(`${formatTicketNumber(updated.ticket_number)} is now ${ticketStatusLabel(updated.status)}.`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("Ticket status could not be updated:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
