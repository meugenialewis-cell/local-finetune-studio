---
name: E2E tests and server state
description: Testing-subagent runs can coincide with API server restarts; test plans should self-provision state via [API] steps rather than shell pre-seeding.
---

The api-server now persists models/datasets/jobs registries to disk (storage/state/*.json) and restores them on boot, so a plain restart no longer wipes state. However, restore reconciliation downgrades anything mid-flight (downloads, running jobs) to failed/interrupted, and dev-environment cleanups sometimes wipe the state files deliberately.

**Why:** A UI test once failed with "No downloaded models yet" because state pre-seeded via curl was lost before the testing subagent ran.

**How to apply:** Keep test plans self-sufficient: include an `[API]` setup step (e.g. POST /api/models/:id/download and poll until ready) instead of assuming shell pre-seeding survives. To fully reset dev state, delete storage/state/*.json AND hard-kill the server (SIGKILL) before restarting — a graceful restart flushes in-memory state back to disk on SIGTERM, recreating the files. Beware: `pkill -f "api-server"` also matches your own shell command line.
