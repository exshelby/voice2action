"""Transcribe one local audio file and write only JSON to stdout."""

import argparse
import json
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio", type=Path)
    parser.add_argument("--model", default="base")
    parser.add_argument("--model-cache", type=Path, required=True)
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel

        model = WhisperModel(
            args.model,
            device="cpu",
            compute_type="int8",
            download_root=str(args.model_cache),
            local_files_only=True,
        )
        segments, _ = model.transcribe(str(args.audio), beam_size=5)
        transcript = " ".join(
            segment.text.strip() for segment in segments if segment.text.strip()
        ).strip()

        if not transcript:
            raise ValueError("No speech was detected in the recording.")

        print(json.dumps({"transcript": transcript}, ensure_ascii=False))
        return 0
    except Exception as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
