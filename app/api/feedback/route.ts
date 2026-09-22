import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024;

const AUDIO_EXTENSIONS = new Map([
  ["audio/webm", "webm"],
  ["audio/ogg", "ogg"],
  ["audio/mp4", "m4a"],
  ["audio/mpeg", "mp3"],
  ["audio/wav", "wav"],
  ["audio/x-wav", "wav"],
]);

function errorResponse(message: string, status: number) {
  return Response.json(
    {
      error: message,
    },
    {
      status,
    },
  );
}

export async function POST(request: Request) {
  let storedFilePath: string | null = null;
  let feedbackCreated = false;

  try {
    const webhookUrl = process.env.N8N_WEBHOOK_URL;

    if (!webhookUrl) {
      console.error("N8N_WEBHOOK_URL is not configured.");

      return errorResponse("Feedback automation is not configured.", 503);
    }

    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      return errorResponse("An audio recording is required.", 400);
    }

    if (audio.size === 0) {
      return errorResponse("The audio recording is empty.", 400);
    }

    if (audio.size > MAX_AUDIO_SIZE_BYTES) {
      return errorResponse(
        "The audio recording must be smaller than 10 MB.",
        413,
      );
    }

    const mimeType = audio.type.split(";")[0].toLowerCase();
    const extension = AUDIO_EXTENSIONS.get(mimeType);

    if (!extension) {
      return errorResponse("This audio format is not supported.", 415);
    }

    const feedbackId = randomUUID();
    const audioObjectKey = `audio/${feedbackId}.${extension}`;

    storedFilePath = join(process.cwd(), "storage", audioObjectKey);

    await mkdir(dirname(storedFilePath), {
      recursive: true,
    });

    const audioBytes = Buffer.from(await audio.arrayBuffer());

    await writeFile(storedFilePath, audioBytes, {
      flag: "wx",
    });

    const feedback = await prisma.feedback.create({
      data: {
        id: feedbackId,
        audioObjectKey,
        mimeType,
        fileSizeBytes: audio.size,
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
      },
    });

    feedbackCreated = true;

    try {
      const webhookResponse = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          feedbackId: feedback.id,
          status: feedback.status,
          audioObjectKey,
          mimeType,
          fileSizeBytes: audio.size,
          receivedAt: feedback.createdAt,
        }),
        signal: AbortSignal.timeout(5_000),
      });

      if (!webhookResponse.ok) {
        throw new Error(
          `n8n webhook returned HTTP ${webhookResponse.status}.`,
        );
      }
    } catch (workflowError) {
      console.error("Feedback automation could not be started:", workflowError);

      await prisma.feedback
        .update({
          where: {
            id: feedback.id,
          },
          data: {
            status: "FAILED",
          },
        })
        .catch((statusError) => {
          console.error("Feedback status could not be updated:", statusError);
        });

      return Response.json(
        {
          error:
            "Your recording was saved, but automation could not be started.",
          feedbackId: feedback.id,
        },
        {
          status: 502,
        },
      );
    }

    try {
      await prisma.feedback.update({
        where: {
          id: feedback.id,
        },
        data: {
          transcriptionRequestedAt: new Date(),
        },
      });
    } catch (queueError) {
      console.error("Feedback could not be queued for transcription:", queueError);

      await prisma.feedback
        .update({
          where: {
            id: feedback.id,
          },
          data: {
            status: "FAILED",
            transcriptionError: "Could not queue local transcription.",
          },
        })
        .catch((statusError) => {
          console.error("Feedback status could not be updated:", statusError);
        });

      return Response.json(
        {
          error: "Your recording was saved, but transcription could not be queued.",
          feedbackId: feedback.id,
        },
        {
          status: 502,
        },
      );
    }

    return Response.json(
      {
        feedbackId: feedback.id,
        status: feedback.status,
        receivedAt: feedback.createdAt,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    if (storedFilePath && !feedbackCreated) {
      await unlink(storedFilePath).catch(() => undefined);
    }

    console.error("Feedback upload failed:", error);

    return errorResponse(
      "Your recording could not be submitted. Please try again.",
      500,
    );
  }
}
