import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  assertRetentionConfirmation,
  audioPathForRetention,
  DEFAULT_AUDIO_RETENTION_DAYS,
  parseRetentionDays,
  retentionCutoff,
} from "../lib/data-retention.mjs";

test("audio retention defaults to 90 days and accepts bounded whole days", () => {
  assert.equal(parseRetentionDays(), DEFAULT_AUDIO_RETENTION_DAYS);
  assert.equal(parseRetentionDays("30"), 30);
  assert.throws(() => parseRetentionDays("0"), /whole number/);
  assert.throws(() => parseRetentionDays("1.5"), /whole number/);
  assert.throws(() => parseRetentionDays("3651"), /whole number/);
});

test("retention cutoff is calculated from the supplied clock", () => {
  assert.equal(
    retentionCutoff(2, new Date("2026-09-23T12:00:00.000Z")).toISOString(),
    "2026-09-21T12:00:00.000Z",
  );
});

test("retention audio paths stay inside storage/audio and match the record", () => {
  const id = randomUUID();
  assert.match(audioPathForRetention("C:/project", id, `audio/${id}.webm`), /\.webm$/);
  assert.throws(() => audioPathForRetention("C:/project", id, "../private.txt"));
  assert.throws(() => audioPathForRetention("C:/project", id, `audio/${randomUUID()}.wav`));
});

test("permanent retention runs require the exact confirmation phrase", () => {
  assert.doesNotThrow(() => assertRetentionConfirmation(false));
  assert.throws(() => assertRetentionConfirmation(true, "yes"), /Permanent deletion/);
  assert.doesNotThrow(() => assertRetentionConfirmation(true, "DELETE-ELIGIBLE-AUDIO"));
});
