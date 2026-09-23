import "dotenv/config";

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import {
  createWebhookDeliverer,
  parseMaxAttempts,
  processNextNotification,
} from "./notification-delivery.mjs";
import { formatNotificationNumber } from "./notification-store.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

async function main() {
  const mode = process.argv[2];

  if (mode !== "--once" && mode !== "--watch") {
    throw new Error("Use --once or --watch.");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }
  if (!process.env.NOTIFICATION_WEBHOOK_URL) {
    throw new Error("NOTIFICATION_WEBHOOK_URL is not configured; no alert was sent.");
  }

  const maxAttempts = parseMaxAttempts(process.env.NOTIFICATION_MAX_ATTEMPTS);
  const deliver = createWebhookDeliverer({
    url: process.env.NOTIFICATION_WEBHOOK_URL,
    token: process.env.NOTIFICATION_WEBHOOK_TOKEN,
  });
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    do {
      const result = await processNextNotification(client, deliver, { maxAttempts });

      if (!result.processed) {
        if (mode === "--once") console.log("No notification is ready for delivery.");
        if (mode === "--watch") {
          await new Promise((resolveSleep) => setTimeout(resolveSleep, 5_000));
        }
        continue;
      }

      const reference = formatNotificationNumber(result.notification.id);

      if (result.status === "SENT") {
        console.log(`Delivered ${reference}.`);
      } else if (result.status === "FAILED") {
        console.error(`${reference} reached a terminal delivery failure: ${result.error}`);
      } else {
        console.error(`${reference} delivery failed; retrying in ${result.retryDelaySeconds} seconds: ${result.error}`);
      }
    } while (mode === "--watch");
  } finally {
    await client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("Notification delivery worker could not start:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { main, projectRoot };
