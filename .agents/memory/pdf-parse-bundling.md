---
name: pdf-parse esbuild bundling
description: pdf-parse/pdf.js breaks when bundled by esbuild — externalize it in the api-server build
---

Rule: never let esbuild bundle `pdf-parse` into the api-server dist — keep it in the `external` list in the artifact's `build.mjs`.

**Why:** Two distinct failures occurred when it was bundled:
1. Startup crash `ReferenceError: DOMMatrix is not defined` — pdf.js polyfills DOMMatrix/ImageData/Path2D via an optional require of `@napi-rs/canvas`, which the bundle can't resolve.
2. Even after fixing that, request-time failure `Setting up fake worker failed: Cannot find module '.../dist/pdf.worker.mjs'` — pdf.js dynamically imports its worker file relative to itself, which resolves to `dist/` when bundled.

Externalizing `pdf-parse` fixes both: it loads from `node_modules`, where pdfjs-dist's own optional `@napi-rs/canvas` dependency and worker file resolve correctly. No direct `@napi-rs/canvas` dependency is needed (a direct install was tried and later removed as dead weight).

**How to apply:** Any time a new package that wraps pdf.js (or similar worker/dynamic-import-based libs) is added to the api-server, add it to `external` in `artifacts/api-server/build.mjs` and verify with a real request after a workflow restart — a standalone `node -e` test against `node_modules` will pass even when the bundled server fails.

Related: `express.json` body limit was raised to 10mb in app.ts because converted documents POST large row arrays to /datasets/from-rows (default 100kb caused 413s with HTML error bodies).
