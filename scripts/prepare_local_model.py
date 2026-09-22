"""Download model files once; no customer recording is read by this script."""

import argparse
from pathlib import Path

from faster_whisper import WhisperModel


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="base")
    args = parser.parse_args()

    model_cache = Path(__file__).resolve().parents[1] / "storage" / "models"
    WhisperModel(
        args.model,
        device="cpu",
        compute_type="int8",
        download_root=str(model_cache),
    )
    print(f"Local model '{args.model}' is ready.")


if __name__ == "__main__":
    main()
