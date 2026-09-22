import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import test from "node:test";

import { audioPathFor, processNextFeedback } from "./transcribe-feedback.mjs";

test("audio paths are limited to the matching feedback ID", () => {
  const id = randomUUID();

  assert.match(audioPathFor(id, `audio/${id}.webm`), /\.webm$/);
  assert.throws(() => audioPathFor(id, "../private.txt"));
  assert.throws(() => audioPathFor(id, `audio/${randomUUID()}.webm`));
});

test("a queued recording saves its transcript without touching the audio", async () => {
  const id = randomUUID();
  const audioPath = audioPathFor(id, `audio/${id}.webm`);
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      return queries.length === 1
        ? { rows: [{ id, audio_object_key: `audio/${id}.webm` }] }
        : { rowCount: 1 };
    },
  };

  await mkdir(dirname(audioPath), { recursive: true });
  await writeFile(audioPath, "fixture", { flag: "wx" });

  try {
    assert.equal(
      await processNextFeedback(client, async () => "My delivery was late."),
      true,
    );
    assert.match(queries[0].sql, /transcription_requested_at IS NOT NULL/);
    assert.match(queries[1].sql, /original_transcript = \$2/);
    assert.deepEqual(queries[1].params, [id, "My delivery was late."]);
  } finally {
    await unlink(audioPath);
  }
});

test("a failed transcription leaves an error on its feedback row", async () => {
  const id = randomUUID();
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      return queries.length === 1
        ? { rows: [{ id, audio_object_key: `audio/${id}.webm` }] }
        : { rowCount: 1 };
    },
  };

  assert.equal(await processNextFeedback(client), true);
  assert.match(queries[1].sql, /status = 'FAILED'/);
  assert.deepEqual(queries[1].params, [id, "The stored audio file is missing."]);
});
