#!/usr/bin/env python3
"""
Fuses a LoRA adapter into the base model and packages it so common local
tools can run it. Two-stage pipeline:

  Stage 1: mlx_lm.fuse merges the adapter into the base model and (for
           quantized bases) dequantizes to f16 safetensors.
  Stage 2: for GGUF-capable architectures, the vendored llama.cpp converter
           (scripts/vendor/convert_hf_to_gguf.py, pinned to match the pip
           package gguf==0.18.0) turns the fused model into model.gguf.
           Unlike mlx-lm's built-in --export-gguf (an early-2024 snapshot of
           llama.cpp's converter), it understands modern Llama configs:
           "llama3" rope scaling, tied word embeddings, and BPE tokenizers —
           so Llama 3.x models convert correctly.

Formats:
  gguf   -> a single model.gguf file (LM Studio, llama.cpp, Jan, Ollama).
  ollama -> for GGUF-capable model types: model.gguf + a Modelfile that
            points at it. For other architectures: a dequantized (f16)
            safetensors directory + a Modelfile pointing at the directory
            (requires a recent Ollama that can import safetensors weights).

The full output of both stages is written to export.log inside the output
directory, and failures surface the last meaningful lines of that output.

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
import os
import re
import subprocess
import sys

# Architectures our GGUF pipeline supports. The vendored llama.cpp converter
# supports many more, but these are the ones we have verified end to end.
# Keep in sync with catalog.ts exportFormats.
GGUF_MODEL_TYPES = {"llama", "mistral", "mixtral"}

VENDOR_CONVERTER = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "vendor", "convert_hf_to_gguf.py"
)

# Extra Python packages stage 2 needs beyond mlx-lm. gguf must stay at
# 0.18.0: it is the newest release that still supports Python 3.9 (the macOS
# system Python), and the vendored converter is pinned to the same version.
GGUF_DEPS_INSTALL_CMD = 'python3 -m pip install --user "gguf==0.18.0" torch sentencepiece'

# Output lines that are library noise or progress spam, never the reason a
# conversion failed. Mirrors STDERR_NOISE in src/lib/runner.ts.
NOISE_PATTERNS = [
    re.compile(r"NotOpenSSLWarning"),
    re.compile(r"DeprecationWarning"),
    re.compile(r"FutureWarning"),
    re.compile(r"UserWarning"),
    re.compile(r"^\s*warnings\.warn\b"),
    re.compile(r"\d+%\|"),  # tqdm progress bars
]


def emit(obj):
    print(json.dumps(obj), flush=True)


def read_model_config(model_dir):
    """Returns (model_type, is_quantized) from the model's config.json."""
    config_path = os.path.join(model_dir, "config.json")
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
    except (OSError, ValueError):
        return None, False
    quantized = bool(config.get("quantization") or config.get("quantization_config"))
    return config.get("model_type"), quantized


def dequantize_flag():
    """The fuse CLI flag was renamed from --de-quantize to --dequantize;
    detect which spelling this mlx-lm version understands."""
    try:
        help_out = subprocess.run(
            [sys.executable, "-m", "mlx_lm.fuse", "--help"],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if "--dequantize" in (help_out.stdout + help_out.stderr):
            return "--dequantize"
        if "--de-quantize" in (help_out.stdout + help_out.stderr):
            return "--de-quantize"
    except (OSError, subprocess.TimeoutExpired):
        pass
    return "--dequantize"


def is_noise(line):
    return any(p.search(line) for p in NOISE_PATTERNS)


def run_stage(cmd, log_path, stage_label, percent):
    """Runs a subprocess, appending all of its output to log_path and
    streaming lines as progress events. Returns (returncode, meaningful_tail)
    where meaningful_tail is the last few non-noise lines for error messages."""
    try:
        log = open(log_path, "a", encoding="utf-8")
    except OSError:
        log = None
    if log:
        log.write(f"\n===== {stage_label} =====\n$ {' '.join(cmd)}\n")
        log.flush()

    try:
        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1
        )
    except (OSError, FileNotFoundError) as exc:
        if log:
            log.write(f"Could not launch: {exc}\n")
            log.close()
        return 1, [f"Could not launch {stage_label}: {exc}"]

    meaningful_tail = []
    assert proc.stdout is not None
    for raw_line in proc.stdout:
        if log:
            log.write(raw_line)
        line = raw_line.strip()
        if not line:
            continue
        if not is_noise(line):
            meaningful_tail.append(line)
            meaningful_tail = meaningful_tail[-8:]
        emit({"type": "progress", "percent": percent, "message": line[:200]})
    returncode = proc.wait()
    if log:
        log.write(f"===== {stage_label} exited with code {returncode} =====\n")
        log.close()
    return returncode, meaningful_tail


def check_gguf_deps():
    """Returns a list of the extra packages stage 2 needs that are missing."""
    missing = []
    for module, package in (
        ("gguf", "gguf==0.18.0"),
        ("torch", "torch"),
        ("sentencepiece", "sentencepiece"),
    ):
        try:
            probe = subprocess.run(
                [sys.executable, "-c", f"import {module}"],
                capture_output=True,
                timeout=120,
            )
            if probe.returncode != 0:
                missing.append(package)
        except (OSError, subprocess.TimeoutExpired):
            missing.append(package)
    return missing


def write_modelfile(output_dir, target, note):
    modelfile_path = os.path.join(output_dir, "Modelfile")
    with open(modelfile_path, "w", encoding="utf-8") as f:
        f.write(f"FROM {target}\n")
        f.write("# Generated by Local Fine-Tuning Studio\n")
        f.write(f"# {note}\n")
        f.write("# To register with Ollama, run this in the unzipped folder:\n")
        f.write("#   ollama create my-fine-tuned-model -f Modelfile\n")


def cleanup_intermediate_weights(output_dir):
    """After a successful GGUF conversion the fused safetensors weights are
    redundant and large — remove them so downloads stay small."""
    for name in os.listdir(output_dir):
        if name.endswith(".safetensors") or name == "model.safetensors.index.json":
            try:
                os.remove(os.path.join(output_dir, name))
            except OSError:
                pass


def fail(message, code=1):
    emit({"type": "error", "message": message})
    sys.exit(code)


def main():
    if len(sys.argv) < 5:
        fail("Usage: export_model.py <model_dir> <adapter_dir> <output_dir> <format>")

    model_dir, adapter_dir, output_dir, fmt = sys.argv[1:5]

    try:
        import mlx_lm  # noqa: F401
    except ImportError:
        fail(
            "mlx-lm is not installed on this machine. Run: pip install mlx-lm (requires Apple Silicon)",
            2,
        )

    model_type, quantized = read_model_config(model_dir)
    gguf_capable = model_type in GGUF_MODEL_TYPES

    if fmt == "gguf" and not gguf_capable:
        fail(
            f"This model's architecture ({model_type or 'unknown'}) can't be converted to GGUF yet — "
            "this app currently supports GGUF conversion for the Llama, Mistral, and Mixtral families. "
            "Try the Ollama export format instead.",
            2,
        )

    use_gguf = gguf_capable  # both "gguf" and "ollama" produce a GGUF when possible

    if use_gguf:
        missing = check_gguf_deps()
        if missing:
            fail(
                "Creating a GGUF file needs a few extra Python packages that aren't installed yet "
                f"({', '.join(m.split('=')[0] for m in missing)}). "
                f"Run this in Terminal, then try the export again:  {GGUF_DEPS_INSTALL_CMD}  "
                "(Re-running the Start Fine-Tuning Studio script also installs them.)",
                2,
            )

    os.makedirs(output_dir, exist_ok=True)
    log_path = os.path.join(output_dir, "export.log")
    try:
        with open(log_path, "w", encoding="utf-8") as f:
            f.write("Local Fine-Tuning Studio export log\n")
    except OSError:
        pass

    # ---- Stage 1: fuse the adapter into the base model (f16 safetensors) ----
    cmd = [
        sys.executable,
        "-m",
        "mlx_lm.fuse",
        "--model",
        model_dir,
        "--adapter-path",
        adapter_dir,
        "--save-path",
        output_dir,
    ]
    if quantized:
        cmd.append(dequantize_flag())

    emit({"type": "progress", "percent": 15, "message": "Fusing your fine-tuned adapter into the base model"})

    returncode, tail = run_stage(cmd, log_path, "mlx_lm.fuse", 40)
    if returncode != 0:
        detail = " | ".join(tail[-4:]) if tail else "no output"
        fail(
            f"The fusing step failed (mlx_lm.fuse exited with code {returncode}). "
            f"Details: {detail[:500]} — full log: {log_path}",
            returncode or 1,
        )

    if not use_gguf:
        # Ollama format on a non-GGUF architecture: dequantized safetensors
        # directory + Modelfile pointing at the folder itself.
        write_modelfile(
            output_dir,
            ".",
            "Fine-tuned weights in safetensors format (needs a recent Ollama version).",
        )
        emit({"type": "progress", "percent": 95, "message": "Ollama Modelfile ready"})
        emit({"type": "done", "path": output_dir})
        return

    # ---- Stage 2: convert the fused model to GGUF with llama.cpp's converter ----
    gguf_path = os.path.join(output_dir, "model.gguf")
    emit({"type": "progress", "percent": 55, "message": "Converting to GGUF format"})

    convert_cmd = [
        sys.executable,
        VENDOR_CONVERTER,
        output_dir,
        "--outfile",
        gguf_path,
        "--outtype",
        "f16",
    ]
    returncode, tail = run_stage(convert_cmd, log_path, "convert_hf_to_gguf", 75)
    if returncode != 0 or not os.path.exists(gguf_path):
        detail = " | ".join(tail[-4:]) if tail else "no output"
        fail(
            f"The GGUF conversion step failed (converter exited with code {returncode}). "
            f"Details: {detail[:500]} — full log: {log_path}",
            returncode or 1,
        )

    cleanup_intermediate_weights(output_dir)

    if fmt == "gguf":
        emit({"type": "progress", "percent": 95, "message": "GGUF file ready"})
        emit({"type": "done", "path": gguf_path})
        return

    # Ollama format on a GGUF-capable model: Modelfile + model.gguf.
    write_modelfile(output_dir, "./model.gguf", "The fine-tuned model, as a single GGUF file.")
    emit({"type": "progress", "percent": 95, "message": "Ollama Modelfile ready"})
    emit({"type": "done", "path": output_dir})


if __name__ == "__main__":
    main()
