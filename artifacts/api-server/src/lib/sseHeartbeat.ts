import type { Response } from "express";

const HEARTBEAT_INTERVAL_MS = 15000;

/**
 * Sends a named `ping` event every 15s on an open SSE stream.
 *
 * Proxies between the browser and this server can hold a client connection
 * open even after the upstream dies, so the client can't rely on error
 * events alone to detect a dead stream. The client watches for these pings
 * and forces a reconnect when they stop arriving.
 *
 * Named events don't trigger `onmessage`, so data handling is unaffected.
 * Returns a stop function — call it when the stream closes.
 */
export function startSseHeartbeat(res: Response): () => void {
  const timer = setInterval(() => {
    res.write(`event: ping\ndata: {}\n\n`);
  }, HEARTBEAT_INTERVAL_MS);
  return () => clearInterval(timer);
}
