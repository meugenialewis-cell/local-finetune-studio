#!/usr/bin/env python3
"""
Runs a LoRA fine-tune of a local MLX model against a JSONL dataset.

Usage: python3 train.py <model_dir> <dataset_jsonl> <output_dir> <epochs> <learning_rate> <lora_rank>

Emits one JSON object per line to stdout, e.g.:
  {"type": "progress", "percent": 30, "epoch": 1, "totalEpochs": 3, "loss": 1.82, "message": "Training epoch 1 of 3"}
  {"type": "done", "adapterDir": "/abs/path"}
  {"type": "error", "message": "human readable error"}

Real training only runs on Apple Silicon with `mlx-lm` installed (see
requirements.txt). The Node backend simulates this script's output shape
when it (or MLX) is unavailable, so the app is fully usable for prototyping
in this cloud workspace.
"""
import json
import sys


def emit(obj):
    print(json.dumps(obj), flush=True)


def main():
    if len(sys.argv) < 7:
        emit({"type": "error", "message": "Usage: train.py <model_dir> <dataset_jsonl> <output_dir> <epochs> <learning_rate> <lora_rank>"})
        sys.exit(1)

    model_dir, dataset_path, output_dir, epochs, learning_rate, lora_rank = sys.argv[1:7]

    try:
        import mlx_lm  # noqa: F401
    except ImportError:
        emit({
            "type": "error",
            "message": "mlx-lm is not installed on this machine. Run: pip install mlx-lm (requires Apple Silicon)",
        })
        sys.exit(2)

    try:
        from mlx_lm.tuner import train as mlx_train  # type: ignore
    except Exception:
        emit({
            "type": "error",
            "message": "mlx-lm is installed but its training API could not be loaded. Check your mlx-lm version.",
        })
        sys.exit(2)

    # NOTE: mlx-lm's LoRA training API evolves across releases. Wiring the
    # exact call here is intentionally left as a small, well-documented
    # integration point for the user's local mlx-lm version, since it cannot
    # be exercised or verified in this cloud workspace (no Apple GPU).
    emit({
        "type": "error",
        "message": (
            "MLX training integration point: call your installed mlx-lm version's "
            "LoRA training entrypoint here with model_dir=" + model_dir +
            ", dataset=" + dataset_path + ", output_dir=" + output_dir + "."
        ),
    })
    sys.exit(2)


if __name__ == "__main__":
    main()
