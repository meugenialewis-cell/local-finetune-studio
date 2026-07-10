import { useEffect, useState } from "react";
import { getStreamModelDownloadEventsUrl, getStreamJobEventsUrl } from "@workspace/api-client-react";
import type { Model, TrainingJob } from "@workspace/api-client-react";

export function useModelDownloadSSE(modelId: string | undefined) {
  const [model, setModel] = useState<Partial<Model>>({});

  useEffect(() => {
    if (!modelId) return;

    const url = getStreamModelDownloadEventsUrl(modelId);
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setModel(data);
      } catch (e) {
        console.error("Failed to parse SSE event", e);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [modelId]);

  return model;
}

export function useJobEventsSSE(jobId: string | undefined) {
  const [job, setJob] = useState<Partial<TrainingJob>>({});

  useEffect(() => {
    if (!jobId) return;

    const url = getStreamJobEventsUrl(jobId);
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setJob(data);
      } catch (e) {
        console.error("Failed to parse SSE event", e);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [jobId]);

  return job;
}
