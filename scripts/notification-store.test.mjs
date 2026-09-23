import assert from "node:assert/strict";
import test from "node:test";

import { formatNotificationNumber, loadPendingNotifications } from "./notification-store.mjs";

test("notification numbers have a readable reference", () => {
  assert.equal(formatNotificationNumber(1), "NTF-000001");
  assert.equal(formatNotificationNumber(1234567), "NTF-1234567");
  assert.throws(() => formatNotificationNumber(0));
});

test("the local queue returns only pending notifications in order", async () => {
  const client = {
    async query(sql) {
      assert.match(sql, /WHERE n.status = 'PENDING'/);
      assert.match(sql, /ORDER BY n.created_at ASC, n.id ASC/);
      return {
        rows: [{ id: 1, ticket_number: 1, team: "LOGISTICS", status: "PENDING" }],
      };
    },
  };

  const notifications = await loadPendingNotifications(client);

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].team, "LOGISTICS");
});
