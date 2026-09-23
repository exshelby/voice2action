import { randomUUID } from "node:crypto";

const RETRY_DELAYS_SECONDS = [60, 5 * 60, 15 * 60, 60 * 60];

export class NotificationDeliveryError extends Error {
  constructor(message, { retryable = true } = {}) {
    super(message);
    this.name = "NotificationDeliveryError";
    this.retryable = retryable;
  }
}

export function parseMaxAttempts(value) {
  const parsed = Number(value ?? 5);

  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 20) {
    throw new Error("NOTIFICATION_MAX_ATTEMPTS must be an integer from 1 to 20.");
  }

  return parsed;
}

export function retryDelaySeconds(attemptCount) {
  const index = Math.max(0, Math.min(attemptCount - 1, RETRY_DELAYS_SECONDS.length - 1));
  return RETRY_DELAYS_SECONDS[index];
}

export function notificationPayload(notification) {
  return {
    version: 1,
    eventId: `voice2action-notification-${notification.id}`,
    notificationReference: `NTF-${String(notification.id).padStart(6, "0")}`,
    eventType: notification.event_type,
    team: notification.team,
    subject: notification.subject,
    message: notification.message,
    ticket: {
      id: notification.ticket_id,
      reference: `TKT-${String(notification.ticket_number).padStart(6, "0")}`,
    },
    queuedAt: notification.created_at.toISOString(),
  };
}

export function createWebhookDeliverer({ url, token, fetchImpl = fetch, timeoutMs = 10_000 }) {
  let endpoint;

  try {
    endpoint = new URL(url);
  } catch {
    throw new Error("NOTIFICATION_WEBHOOK_URL must be a valid HTTP or HTTPS URL.");
  }

  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
    throw new Error("NOTIFICATION_WEBHOOK_URL must use HTTP or HTTPS.");
  }

  return async function deliverWebhook(notification) {
    let response;

    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `voice2action-notification-${notification.id}`,
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(notificationPayload(notification)),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new NotificationDeliveryError(`Webhook request failed: ${detail}`);
    }

    if (!response.ok) {
      const responseText = (await response.text()).trim().slice(0, 500);
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      const suffix = responseText ? `: ${responseText}` : "";
      throw new NotificationDeliveryError(
        `Webhook returned HTTP ${response.status}${suffix}`,
        { retryable },
      );
    }
  };
}

export async function recoverExpiredNotificationClaims(client, maxAttempts) {
  const expiredClaims = await client.query(
    `UPDATE notification
     SET status = CASE WHEN attempt_count >= $1 THEN 'FAILED'::notification_status
                       ELSE 'PENDING'::notification_status END,
         next_attempt_at = NOW(),
         delivery_claim_token = NULL,
         delivery_lease_expires_at = NULL,
         last_error = COALESCE(last_error, 'Delivery lease expired before completion.'),
         updated_at = NOW()
     WHERE status = 'SENDING'
       AND delivery_lease_expires_at <= NOW()`,
    [maxAttempts],
  );

  const exhaustedPending = await client.query(
    `UPDATE notification
     SET status = 'FAILED',
         last_error = COALESCE(last_error, 'Maximum delivery attempts reached.'),
         updated_at = NOW()
     WHERE status = 'PENDING'
       AND attempt_count >= $1`,
    [maxAttempts],
  );

  return { expiredClaims, exhaustedPending };
}

export async function claimNextNotification(client, maxAttempts, claimToken = randomUUID()) {
  const claimed = await client.query(
    `UPDATE notification
     SET status = 'SENDING',
         attempt_count = attempt_count + 1,
         delivery_claim_token = $1,
         delivery_lease_expires_at = NOW() + INTERVAL '5 minutes',
         last_error = NULL,
         updated_at = NOW()
     WHERE id = (
       SELECT id FROM notification
       WHERE status = 'PENDING'
         AND next_attempt_at <= NOW()
         AND attempt_count < $2
       ORDER BY next_attempt_at ASC, created_at ASC, id ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING id, ticket_id, team, event_type, subject, message,
               attempt_count, delivery_claim_token, created_at,
               (SELECT ticket_number FROM ticket WHERE ticket.id = notification.ticket_id) AS ticket_number`,
    [claimToken, maxAttempts],
  );

  return claimed.rows[0] ?? null;
}

export async function processNextNotification(client, deliver, { maxAttempts = 5 } = {}) {
  await recoverExpiredNotificationClaims(client, maxAttempts);
  const notification = await claimNextNotification(client, maxAttempts);

  if (!notification) {
    return { processed: false };
  }

  try {
    await deliver(notification);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const safeMessage = detail.slice(0, 1_000);
    const retryable = !(error instanceof NotificationDeliveryError) || error.retryable;
    const failedPermanently = !retryable || notification.attempt_count >= maxAttempts;
    const delaySeconds = retryDelaySeconds(notification.attempt_count);
    const saved = await client.query(
      `UPDATE notification
       SET status = $3::notification_status,
           next_attempt_at = NOW() + ($4 * INTERVAL '1 second'),
           delivery_claim_token = NULL,
           delivery_lease_expires_at = NULL,
           last_error = $5,
           updated_at = NOW()
       WHERE id = $1
         AND status = 'SENDING'
         AND delivery_claim_token = $2`,
      [
        notification.id,
        notification.delivery_claim_token,
        failedPermanently ? "FAILED" : "PENDING",
        failedPermanently ? 0 : delaySeconds,
        safeMessage,
      ],
    );

    if (saved.rowCount !== 1) {
      throw new Error("Notification claim changed before the delivery failure could be saved.");
    }

    return {
      processed: true,
      notification,
      status: failedPermanently ? "FAILED" : "PENDING",
      error: safeMessage,
      retryDelaySeconds: failedPermanently ? null : delaySeconds,
    };
  }

  const saved = await client.query(
    `UPDATE notification
     SET status = 'SENT',
         sent_at = NOW(),
         delivery_claim_token = NULL,
         delivery_lease_expires_at = NULL,
         last_error = NULL,
         updated_at = NOW()
     WHERE id = $1
       AND status = 'SENDING'
       AND delivery_claim_token = $2`,
    [notification.id, notification.delivery_claim_token],
  );

  if (saved.rowCount !== 1) {
    throw new Error("Notification claim changed before successful delivery could be recorded.");
  }

  return { processed: true, notification, status: "SENT" };
}
