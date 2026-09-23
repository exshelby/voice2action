import "dotenv/config";

import { randomUUID } from "node:crypto";
import { rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

import pg from "pg";

import {
  assertRetentionConfirmation,
  audioPathForRetention,
  parseRetentionDays,
  retentionCutoff,
} from "../lib/data-retention.mjs";

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const apply = process.argv.includes("--apply");
const days = parseRetentionDays(argumentValue("--days"));
assertRetentionConfirmation(apply, argumentValue("--confirm"));

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured.");
}

const projectRoot = resolve(import.meta.dirname, "..");
const cutoff = retentionCutoff(days);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function restoreAfterDeleteFailure(candidate, quarantinePath, deletedAt, cause) {
  const failures = [];

  try {
    await client.query(
      `UPDATE feedback
       SET audio_deleted_at = NULL, updated_at = NOW()
       WHERE id = $1 AND audio_deleted_at = $2`,
      [candidate.id, deletedAt],
    );
  } catch (error) {
    failures.push(`database compensation failed: ${error.message}`);
  }

  try {
    await rename(quarantinePath, candidate.audioPath);
  } catch (error) {
    failures.push(`file restoration failed: ${error.message}`);
  }

  const suffix = failures.length === 0 ? "The record and file were restored." : failures.join("; ");
  throw new Error(`Could not delete audio for ${candidate.id}: ${cause.message}. ${suffix}`);
}

async function retireCandidate(candidate) {
  let quarantinePath = null;

  try {
    quarantinePath = `${candidate.audioPath}.retention-${randomUUID()}`;
    await rename(candidate.audioPath, quarantinePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    quarantinePath = null;
  }

  const result = await client.query(
    `UPDATE feedback
     SET audio_deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND audio_deleted_at IS NULL
     RETURNING audio_deleted_at`,
    [candidate.id],
  );

  if (result.rowCount !== 1) {
    if (quarantinePath) await rename(quarantinePath, candidate.audioPath);
    return false;
  }

  if (quarantinePath) {
    try {
      await unlink(quarantinePath);
    } catch (error) {
      await restoreAfterDeleteFailure(
        candidate,
        quarantinePath,
        result.rows[0].audio_deleted_at,
        error,
      );
    }
  }

  return true;
}

try {
  await client.connect();

  const result = await client.query(
    `SELECT
       f.id::text,
       f.audio_object_key,
       t.ticket_number,
       closed.closed_at
     FROM feedback AS f
     INNER JOIN ticket AS t ON t.feedback_id = f.id
     INNER JOIN LATERAL (
       SELECT MAX(created_at) AS closed_at
       FROM ticket_status_event
       WHERE ticket_id = t.id AND to_status = 'CLOSED'
     ) AS closed ON closed.closed_at IS NOT NULL
     WHERE t.status = 'CLOSED'
       AND f.audio_deleted_at IS NULL
       AND closed.closed_at < $1
     ORDER BY closed.closed_at ASC, f.id ASC
     LIMIT 500`,
    [cutoff],
  );

  const candidates = result.rows.map((row) => ({
    id: row.id,
    ticketNumber: row.ticket_number,
    closedAt: row.closed_at,
    audioPath: audioPathForRetention(projectRoot, row.id, row.audio_object_key),
  }));

  console.log(
    `${candidates.length} recording(s) are eligible: closed before ${cutoff.toISOString()} (${days}-day policy).`,
  );

  for (const candidate of candidates) {
    console.log(
      `${apply ? "Deleting" : "Would delete"} TKT-${String(candidate.ticketNumber).padStart(6, "0")} ` +
        `closed ${new Date(candidate.closedAt).toISOString()} — ${candidate.audioPath}`,
    );
  }

  if (!apply) {
    console.log(
      "Dry run only. To apply, repeat with --apply --confirm DELETE-ELIGIBLE-AUDIO.",
    );
  } else {
    let retired = 0;
    for (const candidate of candidates) {
      if (await retireCandidate(candidate)) retired += 1;
    }
    console.log(`Permanently retired ${retired} recording(s).`);
  }
} finally {
  await client.end().catch(() => undefined);
}
