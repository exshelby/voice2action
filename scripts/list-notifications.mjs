import "dotenv/config";

import pg from "pg";

import { formatNotificationNumber, loadPendingNotifications } from "./notification-store.mjs";
import { teamLabel } from "./ticket-routing.mjs";
import { formatTicketNumber } from "./ticket-store.mjs";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not configured.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  const notifications = await loadPendingNotifications(client);

  if (notifications.length === 0) {
    console.log("There are no pending team notifications.");
  } else {
    console.log(`Pending team notifications: ${notifications.length}`);

    notifications.forEach((notification) => {
      console.log("\n---");
      console.log(`Notification: ${formatNotificationNumber(notification.id)}`);
      console.log(`Team: ${teamLabel(notification.team)}`);
      console.log(`Ticket: ${formatTicketNumber(notification.ticket_number)}`);
      console.log(`Subject: ${notification.subject}`);
      console.log(`Message: ${notification.message}`);
      console.log(`Queued at: ${notification.created_at.toISOString()}`);
    });
  }
} catch (error) {
  console.error("Could not read notifications:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end();
}
