-- AlterTable
ALTER TABLE "feedback" ADD COLUMN     "original_transcript" TEXT,
ADD COLUMN     "transcribed_at" TIMESTAMP(3);
