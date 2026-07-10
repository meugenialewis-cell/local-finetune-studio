---
name: Real vs simulated backend execution
description: How to structure code that must run real subprocesses on capable hardware but gracefully simulate elsewhere.
---

When a task requires "do the real thing when the environment supports it, otherwise simulate it realistically," gate the branch on an explicit runtime capability check (e.g. detected hardware/OS, a required binary present, a feature flag computed from `os.arch()`/`os.platform()`), not on incidental state like "is this field null" or "did a previous step set a path."

**Why:** Early implementations of this pattern only ever exercised the simulated path because the real-path branch was gated on data that was never populated by the same code (chicken-and-egg), so real execution silently never triggered even on capable hardware. Code review caught this because behavior looked identical in every environment.

**How to apply:** Compute the capability flag once in a dedicated system-check module, thread it through every entry point that can go real-or-simulated (e.g. download, train, export), and always keep the simulate.ts-style fallback as a fully independent, non-degraded path — not a stub. When adding a new field to support this (e.g. structured logs, loss history for a chart), update both the real path and the simulated path so downstream UI can't tell which one ran except via an explicit "simulated" indicator.
