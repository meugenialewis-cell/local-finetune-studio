# Local Fine-Tuning Studio

A no-code app for downloading small AI models, fine-tuning them on the user's own example conversations, chatting with the result, and exporting it — designed to run for real on the user's Mac (Apple Silicon + MLX) while running in simulation mode on Replit.

## Run & Operate

- Workflows: `artifacts/finetune-studio: web` (Vite frontend) and `artifacts/api-server: API Server` (Express, `/api` via localhost:80)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Local Mac run: `bash setup.sh` (or double-click `Start Fine-Tuning Studio.command`) — builds everything and serves frontend + API from one port (default 3939)
- No database and no required env vars. `PORT`/`BASE_PATH` are set by Replit workflows and fall back to local defaults when unset.

## Stack

- pnpm workspaces, Node.js 24 (20+ locally), TypeScript 5.9
- Frontend: React 19 + Vite 7 + Tailwind 4 + shadcn/radix, wouter, TanStack Query
- API: Express 5, bundled with esbuild (`build.mjs` → `dist/index.mjs`)
- API codegen: Orval from OpenAPI spec (`lib/api-spec`), Zod validation
- Training/chat/export: Python scripts in `artifacts/api-server/scripts/` using MLX (`mlx-lm`) on Apple Silicon; simulation fallback otherwise

## Where things live

- `artifacts/finetune-studio/` — frontend (pages in `src/pages`, SSE helper in `src/lib/sse.ts`)
- `artifacts/api-server/src/routes/` — API routes (`models`, `datasets`, `jobs`, `chat`, `presets`, `system/status`, `healthz`)
- `artifacts/api-server/src/lib/` — store, persistence, runner (real vs simulated), systemCheck, SSE heartbeat
- `artifacts/api-server/scripts/` — `download_model.py`, `train.py`, `chat.py`, `export_model.py`
- `artifacts/api-server/storage/` — all persisted data (gitignored): `state/` JSON registries, `transcripts/` JSONL chats, `datasets/`, `models/`, `exports/`
- `setup.sh` + `Start Fine-Tuning Studio.command` — Mac one-click installer/launcher
- `README.md` — non-coder install instructions (GitHub: meugenialewis-cell/local-finetune-studio)

## Architecture decisions

- No database: state is persisted as JSON/JSONL files under `artifacts/api-server/storage/` so the app is fully self-contained on a Mac.
- Real vs simulated execution is decided at runtime by hardware check (Apple Silicon + importable `mlx_lm`), not a flag — see `systemCheck.ts` and the runner.
- The API server serves the built frontend (`../finetune-studio/dist/public`, override with `STATIC_DIR`) with an SPA fallback when the build exists, so local runs need only one port. On Replit this is inert since only `/api` is routed to it.
- SSE endpoints send a `ping` heartbeat every 15s (`sseHeartbeat.ts`); the frontend auto-reconnects with backoff + stall watchdog (`src/lib/sse.ts`).
- `pnpm-workspace.yaml` deliberately KEEPS darwin binary packages (esbuild/rollup/lightningcss/tailwind oxide) so `pnpm install` works on Macs — do not re-add darwin exclusions.

## Product

- Model catalog (mlx-community 4-bit models sized for 128GB Macs), guided download with progress
- Dataset upload + memory curation, one-click retrain
- Fine-tuning jobs with live progress (SSE), presets
- Chat with base vs fine-tuned model, transcripts persisted
- Export fine-tuned models (GGUF/Ollama)

## User preferences

- User is a non-coder: all user-facing text (UI, README, launcher output) must be plain, friendly language with no jargon.

## Gotchas

- Vite/api-server `PORT` and `BASE_PATH` have local fallbacks but Replit workflows always set them — don't remove the fallbacks (local Mac runs depend on them).
- The frontend calls the API with same-origin relative `/api/...` paths — keep it that way; it's what makes single-port local serving work.
- Storage paths are relative to the api-server's cwd — always start the server from `artifacts/api-server/`.
- Don't store user-servable files under dot-prefixed directories (Express blocks dotfile path segments).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
