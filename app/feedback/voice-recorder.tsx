"use client";

import { useEffect, useRef, useState } from "react";

type RecorderStatus =
  | "idle"
  | "requesting"
  | "recording"
  | "stopping"
  | "recorded";

type Recording = {
  blob: Blob;
  url: string;
};

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export default function VoiceRecorder() {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [recording, setRecording] = useState<Recording | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;

      if (recorder && recorder.state !== "inactive") {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.stop();
      }

      stopStream(streamRef.current);

      if (recordingUrlRef.current) {
        URL.revokeObjectURL(recordingUrlRef.current);
      }
    };
  }, []);

  async function startRecording() {
    setErrorMessage(null);
    setStatus("requesting");

    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setErrorMessage("Audio recording is not supported by this browser.");
      setStatus("idle");
      return;
    }

    if (recordingUrlRef.current) {
      URL.revokeObjectURL(recordingUrlRef.current);
      recordingUrlRef.current = null;
      setRecording(null);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      const recorder = new MediaRecorder(stream);

      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });

        stopStream(stream);
        streamRef.current = null;
        mediaRecorderRef.current = null;

        if (blob.size === 0) {
          setErrorMessage("The recording was empty. Please try again.");
          setStatus("idle");
          return;
        }

        const url = URL.createObjectURL(blob);

        recordingUrlRef.current = url;
        setRecording({ blob, url });
        setStatus("recorded");
      };

      recorder.start();
      setStatus("recording");
    } catch (error) {
      stopStream(streamRef.current);
      streamRef.current = null;
      mediaRecorderRef.current = null;

      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setErrorMessage(
          "Microphone permission was denied. Please allow microphone access and try again.",
        );
      } else if (
        error instanceof DOMException &&
        error.name === "NotFoundError"
      ) {
        setErrorMessage("No microphone was found on this device.");
      } else {
        setErrorMessage("The microphone could not be started. Please try again.");
      }

      setStatus("idle");
    }
  }

  function stopRecording() {
  const recorder = mediaRecorderRef.current;

  if (recorder?.state === "recording") {
    setStatus("stopping");
    recorder.stop();
  }
}

function deleteRecording() {
  if (recordingUrlRef.current) {
    URL.revokeObjectURL(recordingUrlRef.current);
    recordingUrlRef.current = null;
  }

  setRecording(null);
  setErrorMessage(null);
  setStatus("idle");
}

  const isRecording = status === "recording";
  const isBusy = status === "requesting" || status === "stopping";

  let buttonLabel = "Start recording";

  if (status === "requesting") {
    buttonLabel = "Requesting microphone…";
  } else if (status === "recording") {
    buttonLabel = "Stop recording";
  } else if (status === "stopping") {
    buttonLabel = "Preparing playback…";
  } else if (status === "recorded") {
    buttonLabel = "Record again";
  }

  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
      <div
        className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl ${
          isRecording ? "animate-pulse bg-red-100" : "bg-indigo-100"
        }`}
        aria-hidden="true"
      >
        🎙️
      </div>

      <h2 className="mt-5 text-xl font-semibold">
        {isRecording ? "Recording in progress" : "Record your message"}
      </h2>

      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">
        {isRecording
          ? "Speak clearly, then press stop when you are finished."
          : "Find a quiet place and speak clearly. You can listen before submitting."}
      </p>

      <button
        type="button"
        onClick={isRecording ? stopRecording : startRecording}
        disabled={isBusy}
        className={`mt-6 rounded-full px-6 py-3 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
          isRecording
            ? "bg-red-600 hover:bg-red-700"
            : "bg-indigo-600 hover:bg-indigo-700"
        }`}
      >
        {buttonLabel}
      </button>

      {recording && (
  <div className="mt-6">
    <p className="mb-3 text-sm font-medium text-slate-700">
      Listen to your recording:
    </p>

    <audio
      controls
      src={recording.url}
      className="mx-auto w-full max-w-md"
    />

    <button
      type="button"
      onClick={deleteRecording}
      className="mt-4 text-sm font-semibold text-red-600 underline decoration-red-200 underline-offset-4 hover:text-red-700"
    >
      Delete recording
    </button>
  </div>
)}
      {errorMessage && (
        <p
          role="alert"
          className="mx-auto mt-5 max-w-md rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}