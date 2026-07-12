---
name: E2E outage/chaos testing recipe
description: How to reliably test backend-drop recovery in the browser without breaking the environment
---

Recipe that finally worked for testing "backend dies mid-stream" UI recovery:

1. **Freeze, don't kill:** `kill -STOP` / `kill -CONT` on the server pids simulates an unresponsive backend with zero restart orchestration — no rebuild, no port conflicts, no workflow-failed state. Killing requires someone to restart it, and nothing survives to do that (see below).
2. **Deterministic sync:** timing the outage blindly fails — the test browser boots on its own schedule (1–2 min) and TCP connection counting on the port is too noisy (user's preview pane polls the same API). Winning approach: a temporary one-line server log (`fs.appendFileSync('/tmp/...', sessionId)`) on SSE connect; orchestrator polls the file for the exact test session, then freezes ~15s later. Remove the line after.
3. **Run orchestrator + test concurrently** in one code_execution call (`Promise.all` style: async orchestration IIFE + `await runTest`).

**Environment constraints learned:**
- Detached processes (`setsid nohup ... &`) die when the bash tool session ends — bash cannot leave anything running.
- `kill -9`-ing or spawning node servers from the code_execution notebook has crashed the notebook worker (likely OOM alongside Playwright + rebuilds). STOP/CONT from the notebook is safe.
- The platform sometimes auto-restarts a killed workflow, but timing is unreliable — never depend on it mid-test.
- Filter pids by `/proc/$pid/cwd` before killing/stopping; bare `pgrep` patterns can match unrelated infrastructure processes.
- Bash `case` patterns inside `$( )` command substitution are a syntax error — use `if echo | grep -q` instead.
