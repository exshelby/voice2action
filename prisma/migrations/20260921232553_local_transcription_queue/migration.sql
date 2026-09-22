-- AlterTable
ALTER TABLE "feedback" ADD COLUMN     "transcription_error" TEXT,
ADD COLUMN     "transcription_requested_at" TIMESTAMP(3);
