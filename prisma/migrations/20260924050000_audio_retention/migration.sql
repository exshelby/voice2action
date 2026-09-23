ALTER TABLE "feedback"
ADD COLUMN "audio_deleted_at" TIMESTAMP(3);

CREATE INDEX "feedback_audio_deleted_at_idx"
ON "feedback"("audio_deleted_at");
