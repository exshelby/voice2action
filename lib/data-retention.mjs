import { resolve, sep } from "node:path";

export const DEFAULT_AUDIO_RETENTION_DAYS = 90;
export const RETENTION_CONFIRMATION = "DELETE-ELIGIBLE-AUDIO";

const AUDIO_KEY_PATTERN = /^audio\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(webm|ogg|m4a|mp3|wav)$/;

export function parseRetentionDays(value) {
  if (value === undefined) return DEFAULT_AUDIO_RETENTION_DAYS;

  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw new Error("Retention days must be a whole number from 1 to 3650.");
  }

  return days;
}

export function retentionCutoff(days, now = new Date()) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function audioPathForRetention(projectRoot, feedbackId, audioObjectKey) {
  const match = AUDIO_KEY_PATTERN.exec(audioObjectKey);
  if (!match || match[1] !== feedbackId) {
    throw new Error("The stored audio key is invalid or does not match its feedback record.");
  }

  const audioRoot = resolve(projectRoot, "storage", "audio");
  const audioPath = resolve(audioRoot, `${match[1]}.${match[2]}`);
  if (!audioPath.startsWith(`${audioRoot}${sep}`)) {
    throw new Error("The stored audio path leaves the audio directory.");
  }

  return audioPath;
}

export function assertRetentionConfirmation(apply, confirmation) {
  if (apply && confirmation !== RETENTION_CONFIRMATION) {
    throw new Error(
      `Permanent deletion requires --confirm ${RETENTION_CONFIRMATION}. Run without --apply for a dry run.`,
    );
  }
}
