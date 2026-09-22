import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { classifyTranscript, processNextClassification } from "./classify-feedback.mjs";

test("the local classifier returns a category and extractive summary", async () => {
  const result = await classifyTranscript("Hai, my delivery was late.");

  assert.equal(result.category, "DELIVERY_DELAY");
  assert.equal(result.summary, "My delivery was late.");
  assert.equal(result.needsReview, false);
});

test("a transcript saves classification without overwriting the original", async () => {
  const id = randomUUID();
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      return queries.length === 1
        ? { rows: [{ id, original_transcript: "My delivery was late." }] }
        : { rowCount: 1 };
    },
  };

  assert.equal(
    await processNextClassification(client, async () => ({
      category: "DELIVERY_DELAY",
      summary: "My delivery was late.",
      score: 0.667,
      needsReview: false,
      model: "local-tfidf-v1",
    }), id),
    true,
  );
  assert.match(queries[0].sql, /FOR UPDATE SKIP LOCKED/);
  assert.deepEqual(queries[0].params, [id]);
  assert.match(queries[1].sql, /classification_category = \$2/);
  assert.doesNotMatch(queries[1].sql, /original_transcript =/);
  assert.deepEqual(queries[1].params, [id, "DELIVERY_DELAY", "My delivery was late.", 0.667, false, "local-tfidf-v1"]);
});

test("classifier failure is visible without losing the transcript", async () => {
  const id = randomUUID();
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      return queries.length === 1
        ? { rows: [{ id, original_transcript: "My delivery was late." }] }
        : { rowCount: 1 };
    },
  };

  assert.equal(
    await processNextClassification(client, async () => {
      throw new Error("model unavailable");
    }),
    true,
  );
  assert.match(queries[1].sql, /classification_error = \$2/);
  assert.doesNotMatch(queries[1].sql, /original_transcript =/);
  assert.deepEqual(queries[1].params, [id, "model unavailable"]);
});
