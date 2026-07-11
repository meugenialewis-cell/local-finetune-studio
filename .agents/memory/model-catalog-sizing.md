---
name: Model catalog sizing for local Mac fine-tuning
description: Which model families realistically fit for on-device LoRA fine-tuning on a 128GB Apple Silicon Mac, and repo-id conventions.
---

The base-model catalog lists 4-bit MLX models from the `mlx-community` HuggingFace org (repo ids like `mlx-community/<Model>-4bit`), sized so they fit for local LoRA fine-tuning on a 128GB Apple Silicon Mac.

**Kimi caveat:** Nearly all Kimi models are far too large for any Mac. Kimi K2 (Instruct/Thinking) is a ~1T-param MoE, ~578GB even at 4-bit — impossible on 128GB. Local-trainable Kimis: `mlx-community/Kimi-Dev-72B-4bit` (72B dense, ~40GB, Qwen2-architecture under the hood) and `mlx-community/Kimi-Linear-48B-A3B-Instruct-4bit` (~27.6GB, `kimi_linear` hybrid). Be explicit that the flagship K2 won't fit.

**Hybrid (transformer + fast-weights) options verified July 2026:** all resolve on HF with mlx-lm-supported model_types — Qwen3-Next-80B-A3B-Instruct-4bit (44.9GB, `qwen3_next`), Kimi-Linear-48B-A3B-Instruct-4bit (27.6GB, `kimi_linear`), granite-4.0-h-small-4bit (18.1GB, `granitemoehybrid`), Falcon-H1-7B-Instruct-4bit (4.3GB, `falcon_h1`). Gotchas: `mlx-community/Falcon-H1-34B-Instruct-4bit` is NOT publicly accessible (HF API auth error); Zamba2 and Nemotron-H have no mlx-community conversions; LFM2 is conv-based, not truly fast-weights.

**Why:** A user asked to add Gemma and Kimi. Gemma 2 (2B/9B) fit easily; Kimi required flagging that only the 72B dev variant is feasible.

**How to apply:** Before adding any new model to `artifacts/api-server/src/lib/catalog.ts`, verify the exact `mlx-community/...-4bit` repo id resolves (HTTP 200 on `https://huggingface.co/api/models/<repo>`) and that the 4-bit size fits in 128GB with training headroom (dense params × ~0.5GB/B for 4-bit, plus optimizer/activations).
