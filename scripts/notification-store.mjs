export function formatNotificationNumber(notificationId) {
  if (!Number.isSafeInteger(notificationId) || notificationId < 1) {
    throw new Error("The notification number is invalid.");
  }

  return `NTF-${String(notificationId).padStart(6, "0")}`;
}

export async function loadPendingNotifications(client) {
  const result = await client.query(
    `SELECT n.id, n.ticket_id, n.team, n.event_type, n.subject,
            n.message, n.status, n.attempt_count, n.created_at,
            t.ticket_number
     FROM notification n
     JOIN ticket t ON t.id = n.ticket_id
     WHERE n.status = 'PENDING'
     ORDER BY n.created_at ASC, n.id ASC
     LIMIT 100`,
  );

  return result.rows;
}
