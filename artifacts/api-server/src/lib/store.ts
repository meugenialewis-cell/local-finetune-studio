import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface ModelState {
  id: string;
  name: string;
  family: string;
  parameterCount: string;
  sizeCategory: "small" | "medium" | "large";
  sizeGb: number;
  description: string;
  recommendedUse: string;
  memoryGuidance: string;
  architecture: "transformer" | "ssm" | "linear-attention" | "hybrid";
  fineTuneSupport: "supported" | "experimental" | "none";
  exportFormats: ("ollama" | "gguf")[];
  status: "not_downloaded" | "downloading" | "ready" | "failed";
  downloadProgress: number;
  error: string | null;
  repoId: string;
  localPath: string | null;
}

export interface DatasetRow {
  prompt: string;
  response: string;
}

export interface DatasetState {
  id: string;
  name: string;
  status: "validating" | "ready" | "invalid";
  rowCount: number;
  sizeBytes: number;
  createdAt: string;
  preview: DatasetRow[];
  error: string | null;
  filePath: string | null;
}

export interface JobState {
  id: string;
  name: string;
  modelId: string;
  modelName: string;
  datasetId: string;
  datasetName: string;
  presetId: string;
  presetName: string;
  status:
    | "queued"
    | "preparing"
    | "training"
    | "completed"
    | "failed"
    | "cancelled"
    | "exporting"
    | "exported";
  progress: number;
  currentEpoch: number;
  totalEpochs: number;
  loss: number | null;
  etaSeconds: number | null;
  statusMessage: string;
  error: string | null;
  simulated: boolean;
  createdAt: string;
  exportReady: boolean;
  exportFormat: "ollama" | "gguf" | null;
  exportPath: string | null;
  adapterPath: string | null;
  cancelRequested: boolean;
  logs: string[];
  lossHistory: number[];
}

export function pushJobLog(job: JobState, message: string) {
  job.logs.push(`[${new Date().toLocaleTimeString()}] ${message}`);
  if (job.logs.length > 200) job.logs.shift();
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface ChatSessionState {
  id: string;
  title: string;
  modelId: string;
  modelName: string;
  jobId: string | null;
  jobName: string | null;
  adapterPath: string | null;
  simulated: boolean;
  generating: boolean;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  error: string | null;
  transcriptPath: string;
}

export const DATA_DIR = path.join(process.cwd(), "storage");
export const DATASETS_DIR = path.join(DATA_DIR, "datasets");
export const MODELS_DIR = path.join(DATA_DIR, "models");
export const EXPORTS_DIR = path.join(DATA_DIR, "exports");
// NOTE: must not be a dot-prefixed directory — Express refuses to serve
// files whose path contains a dotfile segment via res.download().
export const TRANSCRIPTS_DIR = path.join(DATA_DIR, "transcripts");

for (const dir of [DATA_DIR, DATASETS_DIR, MODELS_DIR, EXPORTS_DIR, TRANSCRIPTS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

export const models = new Map<string, ModelState>();
export const datasets = new Map<string, DatasetState>();
export const jobs = new Map<string, JobState>();
export const chatSessions = new Map<string, ChatSessionState>();

export const modelEvents = new EventEmitter();
export const jobEvents = new EventEmitter();
export const chatEvents = new EventEmitter();

modelEvents.setMaxListeners(50);
jobEvents.setMaxListeners(50);
chatEvents.setMaxListeners(50);

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

export function emitModelUpdate(model: ModelState) {
  modelEvents.emit(model.id, model);
}

export function emitJobUpdate(job: JobState) {
  jobEvents.emit(job.id, job);
}

export function emitChatUpdate(session: ChatSessionState) {
  chatEvents.emit(session.id, session);
}
