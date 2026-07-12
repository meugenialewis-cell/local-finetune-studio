import { useEffect, useRef, useState } from "react";
import {
  getStreamModelDownloadEventsUrl,
  getStreamJobEventsUrl,
  getStreamChatEventsUrl,
} from "@workspace/api-client-react";
import type { Model, TrainingJob, ChatSession } from "@workspace/api-client-react";

export type SSEConnectionStatus = "connecting" | "open" | "reconnecting" | "done";

const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 15000;

/**
 * Shared SSE hook with automatic reconnect.
 *
 * Every server stream sends a full-state snapshot as its first event, so a
 * reconnect automatically resyncs the view — no incremental catch-up needed.
 *
 * If `isTerminal` reports that the latest snapshot is a final state (the
 * server closes the stream right after sending it), we stop reconnecting.
 * Otherwise a dropped connection is retried with exponential backoff until
 * the component unmounts.
 */
function useReconnectingSSE<T>(
  url: string | undefined | null,
  isTerminal?: (data: T) => boolean,
): { data: Partial<T>; connectionStatus: SSEConnectionStatus } {
  const [data, setData] = useState<Partial<T>>({});
  const [connectionStatus, setConnectionStatus] = useState<SSEConnectionStatus>("connecting");

  // Keep the latest predicate without retriggering the effect.
  const isTerminalRef = useRef(isTerminal);
  isTerminalRef.current = isTerminal;

  useEffect(() => {
    setData({});
    setConnectionStatus("connecting");
    if (!url) return;

    let disposed = false;
    let eventSource: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let reachedTerminal = false;

    const connect = () => {
      if (disposed) return;
      eventSource = new EventSource(url);

      eventSource.onopen = () => {
        if (disposed) return;
        attempt = 0;
        setConnectionStatus("open");
      };

      eventSource.onmessage = (event) => {
        if (disposed) return;
        try {
          const parsed = JSON.parse(event.data) as T;
          setData(parsed);
          if (isTerminalRef.current?.(parsed)) {
            reachedTerminal = true;
            setConnectionStatus("done");
            eventSource?.close();
          }
        } catch (e) {
          console.error("Failed to parse SSE event", e);
        }
      };

      eventSource.onerror = () => {
        eventSource?.close();
        if (disposed || reachedTerminal) return;
        setConnectionStatus("reconnecting");
        const backoff = Math.min(INITIAL_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
        const jitter = Math.random() * 300;
        attempt += 1;
        retryTimer = setTimeout(connect, backoff + jitter);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      eventSource?.close();
    };
  }, [url]);

  return { data, connectionStatus };
}

const isModelStreamDone = (m: Model) => m.status === "ready" || m.status === "failed";

const JOB_TERMINAL_STATUSES = ["completed", "failed", "cancelled", "exported"];
const isJobStreamDone = (j: TrainingJob) => JOB_TERMINAL_STATUSES.includes(j.status);

export function useModelDownloadSSE(modelId: string | undefined) {
  const url = modelId ? getStreamModelDownloadEventsUrl(modelId) : null;
  return useReconnectingSSE<Model>(url, isModelStreamDone);
}

export function useChatSessionSSE(sessionId: string | undefined | null) {
  const url = sessionId ? getStreamChatEventsUrl(sessionId) : null;
  // Chat streams have no terminal state — keep reconnecting until unmount.
  return useReconnectingSSE<ChatSession>(url);
}

export function useJobEventsSSE(jobId: string | undefined) {
  const url = jobId ? getStreamJobEventsUrl(jobId) : null;
  return useReconnectingSSE<TrainingJob>(url, isJobStreamDone);
}
