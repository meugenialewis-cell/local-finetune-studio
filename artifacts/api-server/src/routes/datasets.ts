import { Router, type IRouter } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import {
  ListDatasetsResponse,
  GetDatasetResponse,
  UploadDatasetResponse,
  CreateDatasetFromTranscriptsBody,
  CreateDatasetFromTranscriptsResponse,
} from "@workspace/api-zod";
import { datasets, chatSessions, newId, DatasetState, DatasetRow, ChatMessage, DATASETS_DIR } from "../lib/store";
import { parseDataset } from "../lib/datasetParser";
import { loadTranscriptsFromDisk } from "../lib/transcripts";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const router: IRouter = Router();

function serialize(d: DatasetState) {
  return {
    id: d.id,
    name: d.name,
    status: d.status,
    rowCount: d.rowCount,
    sizeBytes: d.sizeBytes,
    createdAt: d.createdAt,
    preview: d.preview,
    error: d.error,
  };
}

router.get("/datasets", (_req, res) => {
  const data = ListDatasetsResponse.parse([...datasets.values()].map(serialize));
  res.json(data);
});

router.get("/datasets/:datasetId", (req, res) => {
  const dataset = datasets.get(req.params.datasetId as string);
  if (!dataset) {
    res.status(404).json({ message: "Dataset not found" });
    return;
  }
  res.json(GetDatasetResponse.parse(serialize(dataset)));
});

router.post("/datasets", upload.single("file"), (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ message: "No file was uploaded. Please choose a .csv or .jsonl file." });
    return;
  }

  const id = newId("ds");
  const name = (req.body?.name as string) || file.originalname;
  const { rows, error } = parseDataset(file.originalname, file.buffer);

  let filePath: string | null = null;
  if (!error) {
    filePath = path.join(DATASETS_DIR, `${id}.jsonl`);
    fs.writeFileSync(filePath, rows.map((r) => JSON.stringify(r)).join("\n"));
  }

  const dataset: DatasetState = {
    id,
    name,
    status: error ? "invalid" : "ready",
    rowCount: rows.length,
    sizeBytes: file.size,
    createdAt: new Date().toISOString(),
    preview: rows.slice(0, 10),
    error,
    filePath,
  };
  datasets.set(id, dataset);

  res.status(201).json(UploadDatasetResponse.parse(serialize(dataset)));
});

interface Exchange {
  prompt: string;
  response: string;
}

/**
 * Pairs each user message with the assistant reply that followed it.
 * Unanswered user messages (e.g. the reply failed) are skipped.
 */
export function extractExchanges(messages: ChatMessage[]): Exchange[] {
  const exchanges: Exchange[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;
    if (msg.role !== "user") continue;
    const next = messages[i + 1];
    if (next && next.role === "assistant" && next.content.trim().length > 0) {
      exchanges.push({ prompt: msg.content, response: next.content });
    }
  }
  return exchanges;
}

function frameAsMemory(exchange: Exchange, dateStr: string): DatasetRow {
  return {
    prompt:
      `[Memory from ${dateStr}] You are recalling an experience from one of your own past conversations. ` +
      `At the time, someone said to you: "${exchange.prompt}"\n` +
      `Drawing on that remembered experience, this is how you responded:`,
    response: exchange.response,
  };
}

router.post("/datasets/from-transcripts", (req, res) => {
  loadTranscriptsFromDisk();

  const parsed = CreateDatasetFromTranscriptsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request. Pick at least one conversation and give the dataset a name." });
    return;
  }
  const { name, memoryFraming, selections } = parsed.data;
  if (!name.trim()) {
    res.status(400).json({ message: "Please give your dataset a name." });
    return;
  }
  if (selections.length === 0) {
    res.status(400).json({ message: "Select at least one conversation to include." });
    return;
  }

  const rows: DatasetRow[] = [];
  for (const sel of selections) {
    const session = chatSessions.get(sel.sessionId);
    if (!session) {
      res.status(400).json({ message: "One of the selected conversations no longer exists. Refresh and try again." });
      return;
    }
    const exchanges = extractExchanges(session.messages);
    const dateStr = new Date(session.createdAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    for (const idx of sel.exchangeIndices) {
      const exchange = exchanges[idx];
      if (!exchange) continue;
      rows.push(memoryFraming ? frameAsMemory(exchange, dateStr) : { prompt: exchange.prompt, response: exchange.response });
    }
  }

  if (rows.length === 0) {
    res.status(400).json({ message: "None of the kept exchanges had a completed reply, so there's nothing to train on yet." });
    return;
  }

  const id = newId("ds");
  const filePath = path.join(DATASETS_DIR, `${id}.jsonl`);
  const contents = rows.map((r) => JSON.stringify(r)).join("\n");
  fs.writeFileSync(filePath, contents);

  const dataset: DatasetState = {
    id,
    name: name.trim(),
    status: "ready",
    rowCount: rows.length,
    sizeBytes: Buffer.byteLength(contents, "utf-8"),
    createdAt: new Date().toISOString(),
    preview: rows.slice(0, 10),
    error: null,
    filePath,
  };
  datasets.set(id, dataset);

  res.status(201).json(CreateDatasetFromTranscriptsResponse.parse(serialize(dataset)));
});

router.delete("/datasets/:datasetId", (req, res) => {
  const id = req.params.datasetId as string;
  const dataset = datasets.get(id);
  if (!dataset) {
    res.status(404).json({ message: "Dataset not found" });
    return;
  }
  if (dataset.filePath && fs.existsSync(dataset.filePath)) {
    fs.unlinkSync(dataset.filePath);
  }
  datasets.delete(id);
  res.status(204).end();
});

export default router;
