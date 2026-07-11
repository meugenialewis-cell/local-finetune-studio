#!/usr/bin/env python3
"""
Generates a streaming chat reply from a local MLX model, optionally with a
LoRA adapter applied on top (a completed fine-tune from this app).

Usage: python3 chat.py <model_dir> <messages_json_path> [adapter_dir]

<messages_json_path> is a JSON file containing the conversation so far:
  [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}, ...]

Emits one JSON object per line to stdout:
  {"type": "token", "text": "..."}     - one streamed chunk of the reply
  {"type": "done", "text": "..."}      - full reply text
  {"type": "error", "message": "..."}  - human readable error

Real generation only runs on Apple Silicon with `mlx-lm` installed. The Node
backend simulates this script's output shape when MLX is unavailable, so the
chat UI is fully usable for prototyping in the cloud workspace.
"""
import json
import sys


def emit(obj):
    print(json.dumps(obj), flush=True)


def main():
    if len(sys.argv) < 3:
        emit({"type": "error", "message": "Usage: chat.py <model_dir> <messages_json_path> [adapter_dir]"})
        sys.exit(1)

    model_dir = sys.argv[1]
    messages_path = sys.argv[2]
    adapter_dir = sys.argv[3] if len(sys.argv) > 3 else None

    try:
        from mlx_lm import load, stream_generate
    except ImportError:
        emit({
            "type": "error",
            "message": "mlx-lm is not installed on this machine. Run: pip install mlx-lm (requires Apple Silicon)",
        })
        sys.exit(2)

    try:
        with open(messages_path, "r", encoding="utf-8") as f:
            messages = json.load(f)
    except Exception as exc:
        emit({"type": "error", "message": f"Could not read the conversation: {exc}"})
        sys.exit(2)

    try:
        if adapter_dir:
            model, tokenizer = load(model_dir, adapter_path=adapter_dir)
        else:
            model, tokenizer = load(model_dir)
    except Exception as exc:
        emit({"type": "error", "message": f"Could not load the model: {exc}"})
        sys.exit(2)

    # Prefer the model's own chat template; fall back to a plain role-tagged
    # prompt for models whose tokenizer doesn't ship one.
    try:
        prompt = tokenizer.apply_chat_template(messages, add_generation_prompt=True)
    except Exception:
        prompt = "\n".join(f"{m.get('role', 'user')}: {m.get('content', '')}" for m in messages)
        prompt += "\nassistant:"

    full_parts = []
    try:
        for response in stream_generate(model, tokenizer, prompt, max_tokens=1024):
            # Newer mlx-lm yields GenerationResponse objects with a .text
            # attribute; older versions yield plain strings.
            text = getattr(response, "text", None)
            if text is None:
                text = str(response)
            if not text:
                continue
            full_parts.append(text)
            emit({"type": "token", "text": text})
    except Exception as exc:
        emit({"type": "error", "message": f"Generation failed: {exc}"})
        sys.exit(2)

    emit({"type": "done", "text": "".join(full_parts)})


if __name__ == "__main__":
    main()
