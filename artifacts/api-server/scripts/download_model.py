#!/usr/bin/env python3
"""
Downloads a base model's weights from Hugging Face Hub onto this machine.

Usage: python3 download_model.py <repo_id> <dest_dir>

Emits one JSON object per line to stdout describing progress, e.g.:
  {"type": "progress", "percent": 42.0, "message": "Downloading model.safetensors"}
  {"type": "done", "path": "/abs/path/to/dest_dir"}
  {"type": "error", "message": "human readable error"}

This script only truly downloads model weights when run on the user's own
machine with `huggingface_hub` installed (see requirements.txt). The Node
backend falls back to a simulated download when this script or its
dependencies are unavailable (e.g. inside this cloud workspace).
"""
import json
import sys


def emit(obj):
    print(json.dumps(obj), flush=True)


def main():
    if len(sys.argv) < 3:
        emit({"type": "error", "message": "Usage: download_model.py <repo_id> <dest_dir>"})
        sys.exit(1)

    repo_id, dest_dir = sys.argv[1], sys.argv[2]

    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        emit({
            "type": "error",
            "message": "huggingface_hub is not installed on this machine. Run: pip install huggingface_hub",
        })
        sys.exit(2)

    try:
        emit({"type": "progress", "percent": 1, "message": f"Starting download of {repo_id}"})
        path = snapshot_download(repo_id=repo_id, local_dir=dest_dir)
        emit({"type": "done", "path": path})
    except Exception as exc:  # noqa: BLE001
        emit({"type": "error", "message": str(exc)})
        sys.exit(1)


if __name__ == "__main__":
    main()
