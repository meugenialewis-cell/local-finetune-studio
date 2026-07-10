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
}

export const DATA_DIR = path.join(process.cwd(), "storage");
export const DATASETS_DIR = path.join(DATA_DIR, "datasets");
export const MODELS_DIR = path.join(DATA_DIR, "models");
export const EXPORTS_DIR = path.join(DATA_DIR, "exports");

for (const dir of [DATA_DIR, DATASETS_DIR, MODELS_DIR, EXPORTS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

export const models = new Map<string, ModelState>();
export const datasets = new Map<string, DatasetState>();
export const jobs = new Map<string, JobState>();

export const modelEvents = new EventEmitter();
export const jobEvents = new EventEmitter();

modelEvents.setMaxListeners(50);
jobEvents.setMaxListeners(50);

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

export function emitModelUpdate(model: ModelState) {
  modelEvents.emit(model.id, model);
}

export function emitJobUpdate(job: JobState) {
  jobEvents.emit(job.id, job);
}
