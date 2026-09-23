# Voice2Action Operations Runbook

This runbook covers the local deployment. It does not make the application safe for public internet exposure.

## Release gate

Before accepting a release:

1. Confirm the working tree contains only the intended changes.
2. Run `npx prisma migrate deploy` against the intended local database.
3. Run `npm run verify`.
4. Start the production build with `npm start` and run `npm run smoke:local` in another terminal.
5. Complete one manual synthetic-data journey: record, submit, transcribe, classify, review, create a ticket, add a work note, advance status, and confirm that analytics and history are correct.
6. Create and verify a backup before upgrading an existing installation.

GitHub Actions repeats migrations, unit tests, lint, type checking, the production build, and HTTP smoke checks with a fresh PostgreSQL service on every push and pull request.

## Backup

PostgreSQL and Docker must be running. Create a backup:

```powershell
npm run backup:local
```

The command creates `backups/voice2action-<timestamp>` containing:

- `database.dump`, a PostgreSQL custom-format archive;
- `audio/`, a copy of stored customer recordings;
- `manifest.json`, with the size and SHA-256 hash of every backed-up file.

An `INCOMPLETE` file means the backup failed and must not be used. Verify a completed backup before moving it:

```powershell
npm run backup:verify -- backups/voice2action-<timestamp>
```

Verification recalculates every checksum and asks `pg_restore` to parse the archive in list-only mode. Store a verified copy on encrypted media outside this computer. Protect it like the live system: it contains transcripts, password hashes, operational history, and customer recordings.

## Restore drill

Practice restores into a disposable database, never directly over the only live database. Stop application workers first and take a fresh safety backup. The following outline uses `voice2action_restore_test`; substitute the configured PostgreSQL user if needed:

```powershell
docker compose exec -T postgres createdb --username voice2action voice2action_restore_test
Get-Content -AsByteStream backups/voice2action-<timestamp>/database.dump | docker compose exec -T postgres pg_restore --username voice2action --dbname voice2action_restore_test --no-owner --no-privileges
docker compose exec -T postgres psql --username voice2action --dbname voice2action_restore_test --command "SELECT COUNT(*) FROM feedback;"
docker compose exec -T postgres dropdb --username voice2action voice2action_restore_test
```

Copy the backed-up `audio` directory into `storage/audio` only after confirming that its manifest still verifies. A real recovery should be rehearsed before relying on the system for important data.

## Audio retention

The default policy makes audio eligible 90 days after the ticket's immutable `CLOSED` event. It does not delete transcripts, tickets, work logs, or audit history. Preview first:

```powershell
npm run retention:audio -- --days 90
```

Review every listed ticket. Only then apply the deletion:

```powershell
npm run retention:audio -- --days 90 --apply --confirm DELETE-ELIGIBLE-AUDIO
```

The command processes at most 500 recordings per run and stores `audio_deleted_at` on the feedback record. Take and verify a backup before the first applied retention run. Permanent deletion is not recoverable without that backup.

## Routine cadence

- Every change: rely on CI and review its result before merging or releasing.
- Before each upgrade: create and verify a fresh backup.
- Weekly: create a verified backup and move it to encrypted separate storage.
- Monthly: perform a restore drill into a disposable database.
- Monthly: preview the retention report; apply it only under the approved business policy.
- Daily while in use: check failed notifications, failed transcription/classification rows, overdue tickets, and available disk space.

## Incident response

If data looks wrong, stop the application and workers without deleting files or database volumes. Preserve logs, create a backup if the database is readable, record the time and actions taken, and restore only into a separate database until the cause is understood. Rotate the n8n encryption key, webhook token, database password, and operator credentials if secret exposure is suspected.

## Still required before public deployment

- TLS termination and a deliberately configured trusted proxy policy.
- Secure cookies and deployment-grade session controls.
- MFA, password recovery, and an appropriate identity provider.
- Centralized rate limiting, logs, metrics, alerting, and secret management.
- A selected and tested notification destination.
- A written privacy policy, legal retention approval, and named backup owner.
