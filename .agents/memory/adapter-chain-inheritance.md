---
name: Adapter chain config inheritance
description: For continued/progressive fine-tune runs, inherit runtime config from what the parent actually ran with, not from the parent's declared preset.
---

Rule: any config that must stay compatible across a chain of continued runs (e.g. LoRA rank — the resumed adapter has fixed dimensions) must be persisted on each job at creation time and inherited from the parent job's *stored* value, never re-derived by looking up the parent's preset.

**Why:** A parent may itself have inherited a value different from its own preset's (generation 3+ in cross-preset chains). Re-deriving from the preset silently produces a mismatched adapter shape, which fails or misloads only on real hardware — the simulated path never catches it.

**How to apply:** When adding any new per-run training parameter that constrains continuation (rank, target modules, quantization), store the effective value on JobState, normalize old snapshots in persistence restore (fall back to preset lookup), and read the parent's stored field in the continuation path.
