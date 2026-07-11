import { Router, type IRouter } from "express";
import fs from "fs";
import os from "os";
import path from "path";
import {
  ListChatSessionsResponse,
  GetChatSessionResponse,
  CreateChatSessionResponse,
  SendChatMessageResponse,
} from "@workspace/api-zod";
import {
  chatSessions,
  chatEvents,
  models,
  jobs,
  newId,
  ChatSessionState,
  ChatMessage,
  TRANSCRIPTS_DIR,
  emitChatUpdate,
} from "../lib/store";
import { getSystemStatus } from "../lib/systemCheck";
import { simulateChatReply } from "../lib/simulate";
import { runPythonScript } from "../lib/runner";
import { writeTranscript, loadTranscriptsFromDisk } from "../lib/transcripts";
import { ensureSeeded } from "./models";

const router: IRouter = Router();

// Saved transcripts survive server restarts.
loadTranscriptsFromDisk();

const runningChats = new Map<string, ReturnType<typeof runPythonScript>>();

function serialize(s: ChatSessionState, includeMessages: boolean) {
  return {
    id: s.id,
    title: s.title,
    modelId: s.modelId,
    modelName: s.modelName,
    jobId: s.jobId,
    jobName: s.jobName,
    simulated: s.simulated,
    generating: s.generating,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    messageCount: s.messages.length,
    messages: includeMessages ? s.messages : [],
    error: s.error,
  };
}

function isRealPath(p: string | null): p is string {
  return !!p && !p.startsWith("simulated://");
}

router.get("/chat/sessions", (_req, res) => {
  const list = [...chatSessions.values()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  res.json(ListChatSessionsResponse.parse(list.map((s) => serialize(s, false))));
});

router.get("/chat/sessions/:sessionId", (req, res) => {
  const session = chatSessions.get(req.params.sessionId as string);
  if (!session) {
    res.status(404).json({ message: "Chat session not found" });
    return;
  }
  res.json(GetChatSessionResponse.parse(serialize(session, true)));
});

router.post("/chat/sessions", (req, res) => {
  ensureSeeded();
  const { modelId, jobId } = req.body ?? {};

  const model = models.get(modelId);
  if (!model) {
    res.status(400).json({ message: "Please choose a valid model to chat with." });
    return;
  }
  if (model.status !== "ready") {
    res.status(400).json({ message: `${model.name} hasn't finished downloading yet. Download it first, then start a chat.` });
    return;
  }

  let job = null;
  if (jobId) {
    job = jobs.get(jobId);
    if (!job) {
      res.status(400).json({ message: "That fine-tuning job no longer exists." });
      return;
    }
    if (job.modelId !== model.id) {
      res.status(400).json({ message: `That fine-tune was trained on ${job.modelName}, not ${model.name}. Pick a fine-tune of the same base model.` });
      return;
    }
    if (job.status !== "completed" && job.status !== "exported") {
      res.status(400).json({ message: "That fine-tuning job hasn't finished training yet." });
      return;
    }
  }

  const status = getSystemStatus();
  const realModel = status.trainingBackendReady && isRealPath(model.localPath);
  const realAdapter = !job || isRealPath(job.adapterPath);
  const simulated = !(realModel && realAdapter);

  const id = newId("chat");
  const now = new Date().toISOString();
  const session: ChatSessionState = {
    id,
    title: "New chat",
    modelId: model.id,
    modelName: model.name,
    jobId: job?.id ?? null,
    jobName: job?.name ?? null,
    adapterPath: job?.adapterPath ?? null,
    simulated,
    generating: false,
    createdAt: now,
    updatedAt: now,
    messages: [],
    error: null,
    transcriptPath: path.join(TRANSCRIPTS_DIR, `${id}.jsonl`),
  };
  chatSessions.set(id, session);
  writeTranscript(session);

  res.status(201).json(CreateChatSessionResponse.parse(serialize(session, true)));
});

router.delete("/chat/sessions/:sessionId", (req, res) => {
  const id = req.params.sessionId as string;
  const session = chatSessions.get(id);
  if (!session) {
    res.status(404).json({ message: "Chat session not found" });
    return;
  }
  session.generating = false;
  const child = runningChats.get(id);
  if (child) {
    child.kill("SIGTERM");
    runningChats.delete(id);
  }
  if (fs.existsSync(session.transcriptPath)) {
    fs.unlinkSync(session.transcriptPath);
  }
  chatSessions.delete(id);
  res.status(204).end();
});

router.post("/chat/sessions/:sessionId/messages", (req, res) => {
  const session = chatSessions.get(req.params.sessionId as string);
  if (!session) {
    res.status(404).json({ message: "Chat session not found" });
    return;
  }
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!content) {
    res.status(400).json({ message: "Please type a message first." });
    return;
  }
  if (session.generating) {
    res.status(400).json({ message: "The model is still replying. Wait for it to finish before sending another message." });
    return;
  }

  const userMessage: ChatMessage = {
    role: "user",
    content,
    timestamp: new Date().toISOString(),
  };
  session.messages.push(userMessage);
  if (session.messages.filter((m) => m.role === "user").length === 1) {
    const clean = content.replace(/\s+/g, " ").trim();
    session.title = clean.length > 60 ? clean.slice(0, 60) + "…" : clean;
  }
  session.error = null;
  session.generating = true;
  session.updatedAt = new Date().toISOString();
  writeTranscript(session);
  emitChatUpdate(session);

  startReply(session);

  res.status(202).json(SendChatMessageResponse.parse(serialize(session, true)));
});

function startReply(session: ChatSessionState) {
  // Sessions rehydrated from older transcripts may be missing their adapter
  // path — re-resolve it from the job if it's still around.
  if (session.jobId && !session.adapterPath) {
    const job = jobs.get(session.jobId);
    if (job?.adapterPath) session.adapterPath = job.adapterPath;
  }
  const model = models.get(session.modelId);
  const status = getSystemStatus();
  const realModel = status.trainingBackendReady && isRealPath(model?.localPath ?? null);
  const realAdapter = !session.jobId || isRealPath(session.adapterPath);

  if (realModel && realAdapter && model) {
    runRealReply(session, model.localPath as string);
  } else {
    session.simulated = true;
    simulateChatReply(session, () => writeTranscript(session));
  }
}

function runRealReply(session: ChatSessionState, modelDir: string) {
  const messagesFile = path.join(os.tmpdir(), `chat-${session.id}-${Date.now()}.json`);
  fs.writeFileSync(
    messagesFile,
    JSON.stringify(session.messages.map((m) => ({ role: m.role, content: m.content }))),
  );

  const assistantMessage: ChatMessage = {
    role: "assistant",
    content: "",
    timestamp: new Date().toISOString(),
  };
  session.messages.push(assistantMessage);

  const args = [modelDir, messagesFile];
  if (session.adapterPath) args.push(session.adapterPath);

  const child = runPythonScript(
    "chat.py",
    args,
    (event) => {
      if (event.type === "token") {
        assistantMessage.content += String(event.text ?? "");
        emitChatUpdate(session);
      } else if (event.type === "done") {
        if (typeof event.text === "string" && event.text.length > 0) {
          assistantMessage.content = event.text;
        }
      } else if (event.type === "error") {
        session.error = String(event.message ?? "Reply generation failed on your Mac.");
      }
    },
    (code) => {
      runningChats.delete(session.id);
      fs.unlink(messagesFile, () => {});
      // If the session was deleted mid-generation, don't resurrect its
      // transcript file or emit updates for it.
      if (!chatSessions.has(session.id)) return;
      if (!session.error && assistantMessage.content.length === 0) {
        session.error = `The model process exited unexpectedly (code ${code}).`;
      }
      if (session.error && assistantMessage.content.length === 0) {
        // Drop the empty assistant placeholder so the transcript stays clean.
        const last = session.messages[session.messages.length - 1];
        if (last === assistantMessage) session.messages.pop();
      }
      session.generating = false;
      session.updatedAt = new Date().toISOString();
      writeTranscript(session);
      emitChatUpdate(session);
    },
  );
  runningChats.set(session.id, child);
}

router.get("/chat/sessions/:sessionId/events", (req, res) => {
  const sessionId = req.params.sessionId as string;
  const session = chatSessions.get(sessionId);
  if (!session) {
    res.status(404).end();
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (s: ChatSessionState) => {
    res.write(`data: ${JSON.stringify(serialize(s, true))}\n\n`);
  };
  send(session);

  const listener = (s: ChatSessionState) => {
    send(s);
  };
  chatEvents.on(sessionId, listener);

  req.on("close", () => {
    chatEvents.off(sessionId, listener);
    res.end();
  });
});

router.get("/chat/sessions/:sessionId/download", (req, res) => {
  const session = chatSessions.get(req.params.sessionId as string);
  if (!session) {
    res.status(404).json({ message: "Chat session not found" });
    return;
  }
  if (!fs.existsSync(session.transcriptPath)) {
    writeTranscript(session);
  }
  const safeName = session.title.replace(/[^a-z0-9-_ ]+/gi, "").trim().replace(/\s+/g, "_") || "chat";
  res.download(session.transcriptPath, `${safeName}.jsonl`);
});

export default router;
