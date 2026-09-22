import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { saveReview, validateReview } from "./review-feedback.mjs";

test("review validation accepts a correction and trims whitespace", () => {
  const id = randomUUID();
  assert.deepEqual(
    validateReview(id, {
      transcript: "  I got the package, but it was damaged.  ",
      category: "DELIVERY_PROBLEM",
      summary: " Damaged package received. ",
    }),
    {
      transcript: "I got the package, but it was damaged.",
      category: "DELIVERY_PROBLEM",
      summary: "Damaged package received.",
    },
  );
});

test("review validation rejects unknown categories and empty wording", () => {
  const id = randomUUID();
  assert.throws(() => validateReview(id, { transcript: "", category: "OTHER", summary: "A summary" }));
  assert.throws(() => validateReview(id, { transcript: "Text", category: "INVENTED", summary: "A summary" }));
  assert.throws(() => validateReview(id, { transcript: "Text", category: "OTHER", summary: "x".repeat(301) }));
});

test("saving a review leaves original transcript and model fields unchanged", async () => {
  const id = randomUUID();
  const client = {
    async query(sql, params) {
      assert.match(sql, /reviewed_transcript = \$2/);
      assert.match(sql, /review_revision = review_revision \+ 1/);
      assert.doesNotMatch(sql, /SET original_transcript =/);
      assert.doesNotMatch(sql, /SET classification_category =/);
      assert.deepEqual(params, [id, "It was damaged.", "DELIVERY_PROBLEM", "Damaged package received.", 0]);
      return { rowCount: 1, rows: [{ review_revision: 1, reviewed_at: new Date() }] };
    },
  };

  const saved = await saveReview(client, id, {
    transcript: "It was damaged.",
    category: "DELIVERY_PROBLEM",
    summary: "Damaged package received.",
  }, 0);

  assert.equal(saved.review_revision, 1);
});

test("a concurrent review change is not silently overwritten", async () => {
  const id = randomUUID();
  const client = { async query() { return { rowCount: 0, rows: [] }; } };

  await assert.rejects(
    saveReview(client, id, {
      transcript: "It was damaged.",
      category: "DELIVERY_PROBLEM",
      summary: "Damaged package received.",
    }, 0),
    /changed while you were reviewing/,
  );
});
