import assert from "node:assert/strict";
import test from "node:test";

import {
  NotificationDeliveryError,
  claimNextNotification,
  createWebhookDeliverer,
  notificationPayload,
  parseMaxAttempts,
  processNextNotification,
  recoverExpiredNotificationClaims,
  retryDelaySeconds,
} from "./notification-delivery.mjs";

const queuedNotification = {
  id: 7,
  ticket_id: "18b722a4-bfd6-478f-a18f-b60c60ca7843",
  ticket_number: 12,
  team: "LOGISTICS",
  event_type: "TICKET_ASSIGNED",
  subject: "A ticket needs attention",
  message: "Please investigate this ticket.",
  attempt_count: 1,
  delivery_claim_token: "a3263ee2-ffb6-4513-96dc-5e9914d85791",
  created_at: new Date("2026-09-23T10:00:00.000Z"),
};

test("worker settings enforce bounded retries", () => {
  assert.equal(parseMaxAttempts(undefined), 5);
  assert.equal(parseMaxAttempts("8"), 8);
  assert.throws(() => parseMaxAttempts("0"));
  assert.throws(() => parseMaxAttempts("many"));
  assert.deepEqual([1, 2, 3, 4, 8].map(retryDelaySeconds), [60, 300, 900, 3600, 3600]);
});

test("webhook payload has stable notification and ticket references", () => {
  assert.deepEqual(notificationPayload(queuedNotification), {
    version: 1,
    eventId: "voice2action-notification-7",
    notificationReference: "NTF-000007",
    eventType: "TICKET_ASSIGNED",
    team: "LOGISTICS",
    subject: "A ticket needs attention",
    message: "Please investigate this ticket.",
    ticket: {
      id: queuedNotification.ticket_id,
      reference: "TKT-000012",
    },
    queuedAt: "2026-09-23T10:00:00.000Z",
  });
});

test("webhook delivery sends JSON with an idempotency key", async () => {
  let request;
  const deliver = createWebhookDeliverer({
    url: "https://notifications.example.test/team",
    token: "test-token",
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return { ok: true, status: 202 };
    },
  });

  await deliver(queuedNotification);

  assert.equal(request.url, "https://notifications.example.test/team");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["idempotency-key"], "voice2action-notification-7");
  assert.equal(request.options.headers.authorization, "Bearer test-token");
  assert.equal(JSON.parse(request.options.body).notificationReference, "NTF-000007");
});

test("HTTP client errors are terminal while server errors are retryable", async () => {
  const clientErrorDeliverer = createWebhookDeliverer({
    url: "https://notifications.example.test/team",
    fetchImpl: async () => ({ ok: false, status: 400, text: async () => "invalid team" }),
  });
  const serverErrorDeliverer = createWebhookDeliverer({
    url: "https://notifications.example.test/team",
    fetchImpl: async () => ({ ok: false, status: 503, text: async () => "unavailable" }),
  });

  await assert.rejects(clientErrorDeliverer(queuedNotification), (error) => {
    assert.equal(error.retryable, false);
    return true;
  });
  await assert.rejects(serverErrorDeliverer(queuedNotification), (error) => {
    assert.equal(error.retryable, true);
    return true;
  });
});

test("claiming uses a lease and skips rows claimed by another worker", async () => {
  const client = {
    async query(sql, values) {
      assert.match(sql, /FOR UPDATE SKIP LOCKED/);
      assert.match(sql, /delivery_lease_expires_at = NOW\(\) \+ INTERVAL '5 minutes'/);
      assert.deepEqual(values, [queuedNotification.delivery_claim_token, 5]);
      return { rows: [queuedNotification] };
    },
  };

  const claimed = await claimNextNotification(client, 5, queuedNotification.delivery_claim_token);
  assert.equal(claimed.id, 7);
});

test("recovery fails pending alerts that already exhausted the configured limit", async () => {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rowCount: 0, rows: [] };
    },
  };

  await recoverExpiredNotificationClaims(client, 3);

  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /delivery_lease_expires_at <= NOW\(\)/);
  assert.match(calls[1].sql, /status = 'PENDING'/);
  assert.match(calls[1].sql, /attempt_count >= \$1/);
  assert.deepEqual(calls[1].values, [3]);
});

test("a successful delivery is conditionally recorded as sent", async () => {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/RETURNING id, ticket_id/.test(sql)) return { rows: [queuedNotification] };
      return { rows: [], rowCount: 1 };
    },
  };
  let deliveredId;

  const result = await processNextNotification(
    client,
    async (notification) => { deliveredId = notification.id; },
    { maxAttempts: 5 },
  );

  assert.equal(deliveredId, 7);
  assert.equal(result.status, "SENT");
  assert.match(calls.at(-1).sql, /status = 'SENT'/);
  assert.match(calls.at(-1).sql, /delivery_claim_token = \$2/);
});

test("a transient failure returns the notification to pending with backoff", async () => {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/RETURNING id, ticket_id/.test(sql)) return { rows: [queuedNotification] };
      return { rows: [], rowCount: 1 };
    },
  };

  const result = await processNextNotification(
    client,
    async () => { throw new NotificationDeliveryError("temporary outage"); },
    { maxAttempts: 5 },
  );

  assert.equal(result.status, "PENDING");
  assert.equal(result.retryDelaySeconds, 60);
  assert.equal(calls.at(-1).values[2], "PENDING");
  assert.equal(calls.at(-1).values[3], 60);
});

test("a permanent failure is not retried", async () => {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/RETURNING id, ticket_id/.test(sql)) return { rows: [queuedNotification] };
      return { rows: [], rowCount: 1 };
    },
  };

  const result = await processNextNotification(
    client,
    async () => {
      throw new NotificationDeliveryError("bad destination", { retryable: false });
    },
    { maxAttempts: 5 },
  );

  assert.equal(result.status, "FAILED");
  assert.equal(result.retryDelaySeconds, null);
  assert.equal(calls.at(-1).values[2], "FAILED");
});
