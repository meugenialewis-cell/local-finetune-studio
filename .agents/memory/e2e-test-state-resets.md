---
name: E2E tests vs in-memory server state
description: Playwright testing subagent runs can coincide with API server restarts, wiping in-memory state; test plans must self-provision via API steps.
---

The api-server keeps models/datasets/jobs registries in memory (only files like transcripts/datasets JSONL persist on disk). Workflow restarts — including ones that happen around testing-subagent runs — reset that state.

**Why:** A UI test failed with "No downloaded models yet" because the model readied via curl before the test was wiped by a restart between setup and the test run.

**How to apply:** Never pre-seed in-memory state from the shell and assume it survives until a testing-subagent run. Put an `[API]` setup step in the test plan itself (e.g. POST /api/models/:id/download and poll until ready) so the test is self-sufficient.
