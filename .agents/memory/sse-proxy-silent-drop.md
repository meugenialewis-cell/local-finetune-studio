---
name: SSE through Replit proxy drops silently
description: Why SSE streams need server heartbeats + client stall watchdog in this app
---

The outer Replit domain proxy (https://$REPLIT_DEV_DOMAIN) holds browser SSE connections open after the backend dies — EventSource never fires onerror. The internal chain (localhost:80) propagates the close immediately, so curl tests pass while real browsers freeze.

**Why:** Verified by killing the API server with a curl stream open on each path: internal curl exited in ~1s, external curl stayed connected 20s+.

**How to apply:** Any live-stream feature must keep both halves: server sends a named `ping` SSE event every 15s (see api-server `sseHeartbeat.ts`), client treats >40s of silence as a dead stream and force-reconnects (see finetune-studio `sse.ts` stall watchdog). Named events don't trigger `onmessage`, so pings are additive and protocol-compatible. Don't remove either side — onerror alone is not sufficient in production-like paths.
