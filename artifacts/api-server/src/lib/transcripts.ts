import fs from "fs";
import path from "path";
import {
  ChatMessage,
  ChatSessionState,
  chatSessions,
  TRANSCRIPTS_DIR,
} from "./store";

interface TranscriptMetaLine {
  type: "meta";
  id: string;
  title: string;
  modelId: string;
  modelName: string;
  jobId: string | null;
  jobName: string | null;
  adapterPath?: string | null;
  simulated: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TranscriptMessageLine {
  type: "message";
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

/**
 * Writes a chat session to its JSONL transcript file on disk. The first line
 * is a metadata object; every following line is one message. Transcripts are
 * the durable record of a conversation — they survive server restarts and are
 * what gets curated into training datasets later.
 */
export function writeTranscript(session: ChatSessionState): void {
  const meta: TranscriptMetaLine = {
    type: "meta",
    id: session.id,
    title: session.title,
    modelId: session.modelId,
    modelName: session.modelName,
    jobId: session.jobId,
    jobName: session.jobName,
    adapterPath: session.adapterPath,
    simulated: session.simulated,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
  const lines = [JSON.stringify(meta)];
  for (const m of session.messages) {
    const line: TranscriptMessageLine = {
      type: "message",
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    };
    lines.push(JSON.stringify(line));
  }
  fs.writeFileSync(session.transcriptPath, lines.join("\n") + "\n");
}

let loaded = false;

/**
 * Rebuilds the in-memory chat session map from transcript files on disk, so
 * saved conversations survive server restarts. Sessions rehydrated this way
 * are never mid-generation.
 */
export function loadTranscriptsFromDisk(): void {
  if (loaded) return;
  loaded = true;

  let files: string[];
  try {
    files = fs.readdirSync(TRANSCRIPTS_DIR).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return;
  }

  for (const file of files) {
    const filePath = path.join(TRANSCRIPTS_DIR, file);
    try {
      const lines = fs
        .readFileSync(filePath, "utf-8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      if (lines.length === 0) continue;

      const meta = JSON.parse(lines[0]!) as TranscriptMetaLine;
      if (meta.type !== "meta" || !meta.id) continue;

      const messages: ChatMessage[] = [];
      for (const line of lines.slice(1)) {
        const parsed = JSON.parse(line) as TranscriptMessageLine;
        if (parsed.type !== "message") continue;
        messages.push({ role: parsed.role, content: parsed.content, timestamp: parsed.timestamp });
      }

      if (!chatSessions.has(meta.id)) {
        chatSessions.set(meta.id, {
          id: meta.id,
          title: meta.title || "Chat",
          modelId: meta.modelId,
          modelName: meta.modelName,
          jobId: meta.jobId ?? null,
          jobName: meta.jobName ?? null,
          adapterPath: meta.adapterPath ?? null,
          simulated: meta.simulated ?? true,
          generating: false,
          createdAt: meta.createdAt,
          updatedAt: meta.updatedAt,
          messages,
          error: null,
          transcriptPath: filePath,
        });
      }
    } catch {
      // Skip unreadable/corrupt transcript files rather than failing startup.
    }
  }
}
