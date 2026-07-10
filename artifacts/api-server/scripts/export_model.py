#!/usr/bin/env python3
"""
Fuses a LoRA adapter into the base model and converts it to a format that can
be run locally with common tools (Ollama or a raw GGUF file).

Usage: python3 export_model.py <model_dir> <adapter_dir> <output_dir> <format>
  <format> is "ollama" or "gguf"

Emits one JSON object per line to stdout, e.g.:
  {"type": "progress", "percent": 50, "message": "Fusing adapter into base model"}
  {"type": "done", "path": "/abs/path/to/export"}
  {"type": "error", "message": "human readable error"}

Real export only runs on Apple Silicon with `mlx-lm` installed. The Node
backend simulates this script's output shape when it is unavailable.
"""
import json
import sys


def emit(obj):
    print(json.dumps(obj), flush=True)


def main():
    if len(sys.argv) < 5:
        emit({"type": "error", "message": "Usage: export_model.py <model_dir> <adapter_dir> <output_dir> <format>"})
        sys.exit(1)

    model_dir, adapter_dir, output_dir, fmt = sys.argv[1:5]

    try:
        import mlx_lm  # noqa: F401
    except ImportError:
        emit({
            "type": "error",
            "message": "mlx-lm is not installed on this machine. Run: pip install mlx-lm (requires Apple Silicon)",
        })
        sys.exit(2)

    emit({
        "type": "error",
        "message": (
            "MLX export integration point: call mlx_lm.fuse to merge the adapter at "
            + adapter_dir + " into " + model_dir + ", then convert to " + fmt +
            " and write it to " + output_dir + "."
        ),
    })
    sys.exit(2)


if __name__ == "__main__":
    main()
