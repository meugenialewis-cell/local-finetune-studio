#!/usr/bin/env python3
"""
Runs a real LoRA fine-tune of a local MLX model against a JSONL dataset by
invoking mlx-lm's stable, public `mlx_lm.lora` CLI (the same command
documented at https://github.com/ml-explore/mlx-examples for LoRA training).
We shell out to the CLI rather than importing internal training functions
because mlx-lm's Python training API has changed across releases, while the
CLI's flags and stdout format have stayed stable.

Usage: python3 train.py <model_dir> <dataset_jsonl> <output_dir> <epochs> <learning_rate> <lora_rank> [resume_adapter_file]

The optional resume_adapter_file is a path to a previous run's
adapters.safetensors; when given, training continues from those weights
(mlx_lm.lora's resume_adapter_file option) instead of starting fresh.

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
import os
import re
import shutil
import subprocess
import sys


def emit(obj):
    print(json.dumps(obj), flush=True)


ITER_RE = re.compile(
    r"Iter\s+(\d+):\s*(?:Val loss|Train loss)\s+([0-9.]+)", re.IGNORECASE
)


def build_lora_dataset(dataset_jsonl: str, data_dir: str) -> None:
    """mlx_lm.lora expects a directory containing train.jsonl / valid.jsonl,
    each line shaped like {"prompt": ..., "completion": ...}. Our uploaded
    dataset is already {"prompt": ..., "response": ...} per line, so we
    just rename the field and carve off a small validation slice."""
    os.makedirs(data_dir, exist_ok=True)
    rows = []
    with open(dataset_jsonl, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            rows.append({"prompt": row.get("prompt", ""), "completion": row.get("response", "")})

    if not rows:
        raise ValueError("Dataset is empty after parsing.")

    val_count = max(1, min(len(rows) // 10, 20)) if len(rows) > 1 else 1
    valid_rows = rows[:val_count] if len(rows) > val_count else rows
    train_rows = rows if len(rows) <= val_count else rows[val_count:]

    with open(os.path.join(data_dir, "train.jsonl"), "w", encoding="utf-8") as f:
        for row in train_rows:
            f.write(json.dumps(row) + "\n")
    with open(os.path.join(data_dir, "valid.jsonl"), "w", encoding="utf-8") as f:
        for row in valid_rows:
            f.write(json.dumps(row) + "\n")


def main():
    if len(sys.argv) < 7:
        emit({"type": "error", "message": "Usage: train.py <model_dir> <dataset_jsonl> <output_dir> <epochs> <learning_rate> <lora_rank>"})
        sys.exit(1)

    model_dir, dataset_path, output_dir, epochs_str, learning_rate, lora_rank = sys.argv[1:7]
    resume_adapter_file = sys.argv[7] if len(sys.argv) > 7 else None

    if resume_adapter_file and not os.path.isfile(resume_adapter_file):
        emit({
            "type": "error",
            "message": "The previous run's adapter file is missing from disk, so this run can't continue from it.",
        })
        sys.exit(2)

    try:
        import mlx_lm  # noqa: F401
    except ImportError:
        emit({
            "type": "error",
            "message": "mlx-lm is not installed on this machine. Run: pip install mlx-lm (requires Apple Silicon)",
        })
        sys.exit(2)

    try:
        epochs = max(1, int(float(epochs_str)))
    except ValueError:
        epochs = 1

    data_dir = os.path.join(output_dir, "_data")
    try:
        build_lora_dataset(dataset_path, data_dir)
    except Exception as exc:
        emit({"type": "error", "message": f"Could not prepare your dataset for training: {exc}"})
        sys.exit(2)

    os.makedirs(output_dir, exist_ok=True)

    try:
        rank = max(1, int(float(lora_rank)))
    except ValueError:
        rank = 8

    # Rough number of training steps: mlx_lm.lora counts optimizer iterations,
    # not epochs, so we approximate iters-per-epoch from dataset size with a
    # small fixed batch size and multiply by the requested epoch count.
    try:
        with open(os.path.join(data_dir, "train.jsonl"), "r", encoding="utf-8") as f:
            train_size = sum(1 for _ in f)
    except OSError:
        train_size = 1
    batch_size = 1
    iters = max(10, (train_size // batch_size) * epochs)

    # mlx_lm.lora's LoRA rank/alpha/dropout are only configurable via a YAML
    # config file (`-c`), not plain CLI flags, so we write one here to make
    # the preset's lora_rank actually take effect.
    config_path = os.path.join(output_dir, "_lora_config.yaml")
    with open(config_path, "w", encoding="utf-8") as f:
        f.write(f"model: \"{model_dir}\"\n")
        f.write("train: true\n")
        f.write(f"data: \"{data_dir}\"\n")
        f.write(f"iters: {iters}\n")
        f.write(f"learning_rate: {learning_rate}\n")
        f.write(f"batch_size: {batch_size}\n")
        f.write(f"adapter_path: \"{output_dir}\"\n")
        if resume_adapter_file:
            f.write(f"resume_adapter_file: \"{resume_adapter_file}\"\n")
        f.write("steps_per_report: 1\n")
        f.write(f"save_every: {max(10, iters // 5)}\n")
        f.write("lora_parameters:\n")
        f.write(f"  rank: {rank}\n")
        f.write("  alpha: " + str(rank * 2) + "\n")
        f.write("  dropout: 0.0\n")
        f.write("  scale: 10.0\n")

    cmd = [sys.executable, "-m", "mlx_lm.lora", "--config", config_path]

    start_message = (
        f"Continuing training from the previous run's adapter (LoRA rank {rank})"
        if resume_adapter_file
        else f"Starting mlx_lm.lora training process (LoRA rank {rank})"
    )
    emit({"type": "progress", "percent": 5, "message": start_message})

    try:
        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1
        )
    except FileNotFoundError as exc:
        emit({"type": "error", "message": f"Could not launch mlx_lm.lora: {exc}"})
        sys.exit(2)

    last_loss = None
    assert proc.stdout is not None
    for raw_line in proc.stdout:
        line = raw_line.strip()
        if not line:
            continue
        match = ITER_RE.search(line)
        if match:
            iter_num = int(match.group(1))
            loss = float(match.group(2))
            last_loss = loss
            percent = min(99, 5 + int((iter_num / iters) * 94))
            emit({
                "type": "progress",
                "percent": percent,
                "epoch": min(epochs, 1 + (iter_num // max(1, iters // epochs))),
                "totalEpochs": epochs,
                "loss": loss,
                "message": f"Training step {iter_num}/{iters} — loss {loss:.3f}",
            })
        else:
            # Surface other informative mlx_lm output (e.g. warnings) as progress
            # messages without a loss value, so users see the process is alive.
            if line and not line.startswith("Loading"):
                emit({"type": "progress", "percent": None, "message": line[:200]})

    returncode = proc.wait()

    shutil.rmtree(data_dir, ignore_errors=True)
    try:
        os.remove(config_path)
    except OSError:
        pass

    if returncode is not None and returncode < 0:
        # Negative return code means the process was terminated by a signal,
        # i.e. the user cancelled training from the app.
        emit({"type": "error", "message": "Training was cancelled."})
        sys.exit(1)

    if returncode != 0:
        emit({
            "type": "error",
            "message": f"mlx_lm.lora exited with an error (code {returncode}). Check that your mlx-lm version supports these flags.",
        })
        sys.exit(returncode)

    emit({"type": "done", "adapterDir": output_dir, "loss": last_loss})


if __name__ == "__main__":
    main()
