import fs from "fs";
import path from "path";
import {
  DATA_DIR,
  models,
  datasets,
  jobs,
  ModelState,
  DatasetState,
  JobState,
  persistHooks,
  pushJobLog,
} from "./store";
import { ensureSeeded } from "../routes/models";
import { PRESET_CATALOG } from "./catalog";
import { logger } from "./logger";

// Registry snapshots live alongside the other durable data (transcripts,
// dataset files, model weights) so a plain server restart never loses the
// user's models, datasets, or training history.
export const STATE_DIR = path.join(DATA_DIR, "state");
fs.mkdirSync(STATE_DIR, { recursive: true });

type Kind = "models" | "datasets" | "jobs";

const FILES: Record<Kind, string> = {
  models: path.join(STATE_DIR, "models.json"),
  datasets: path.join(STATE_DIR, "datasets.json"),
  jobs: path.join(STATE_DIR, "jobs.json"),
};

function snapshot(kind: Kind): string {
  const map = kind === "models" ? models : kind === "datasets" ? datasets : jobs;
  // Drop underscore-prefixed keys so internal runtime fields (timers, etc.)
  // can never make state objects non-serializable or pollute the snapshots.
  return JSON.stringify(
    [...map.values()],
    (key, value) => (key.startsWith("_") ? undefined : value),
    2,
  );
}

function writeAtomic(kind: Kind): void {
  const file = FILES[kind];
  const tmp = `${file}.tmp`;
  try {
    fs.writeFileSync(tmp, snapshot(kind));
    fs.renameSync(tmp, file);
  } catch (err) {
    logger.error({ err, kind }, "Failed to persist registry state");
  }
}

const pending = new Map<Kind, NodeJS.Timeout>();

/**
 * Schedules a debounced write of one registry to disk. Progress events fire
 * many times per second during downloads/training, so writes are coalesced.
 */
function schedulePersist(kind: Kind): void {
  if (pending.has(kind)) return;
  const timer = setTimeout(() => {
    pending.delete(kind);
    writeAtomic(kind);
  }, 300);
  // Don't let a pending persist keep the process alive on its own.
  timer.unref?.();
  pending.set(kind, timer);
}

export function persistModels(): void {
  schedulePersist("models");
}
export function persistDatasets(): void {
  schedulePersist("datasets");
}
export function persistJobs(): void {
  schedulePersist("jobs");
}

/** Synchronously flushes any pending writes — used on shutdown. */
export function flushAllSync(): void {
  for (const [kind, timer] of pending) {
    clearTimeout(timer);
    pending.delete(kind);
    writeAtomic(kind);
  }
}

function readSnapshot<T>(kind: Kind): T[] {
  try {
    const raw = fs.readFileSync(FILES[kind], "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function isRealPath(p: string | null | undefined): p is string {
  return typeof p === "string" && p.length > 0 && !p.startsWith("simulated://");
}

/** A real path must still exist on disk; simulated:// paths are always "there". */
function pathStillExists(p: string | null | undefined): boolean {
  if (!p) return false;
  if (!isRealPath(p)) return true;
  return fs.existsSync(p);
}

function restoreModels(): void {
  ensureSeeded();
  for (const saved of readSnapshot<ModelState>("models")) {
    const model = models.get(saved?.id);
    // Skip snapshot entries for models that no longer exist in the catalog —
    // catalog metadata (names, sizes, descriptions) always comes from code.
    if (!model) continue;

    if (saved.status === "ready") {
      if (pathStillExists(saved.localPath)) {
        model.status = "ready";
        model.downloadProgress = 100;
        model.localPath = saved.localPath;
        model.error = null;
      } else {
        // Weights were deleted from disk — honestly report "not downloaded".
        model.status = "not_downloaded";
        model.downloadProgress = 0;
        model.localPath = null;
        model.error = null;
      }
    } else if (saved.status === "downloading") {
      model.status = "failed";
      model.downloadProgress = 0;
      model.localPath = null;
      model.error = "This download was interrupted when the app was restarted. Start it again.";
    } else if (saved.status === "failed") {
      model.status = "failed";
      model.downloadProgress = 0;
      model.error = saved.error ?? "The last download attempt failed.";
    }
  }
}

function restoreDatasets(): void {
  for (const saved of readSnapshot<DatasetState>("datasets")) {
    if (!saved?.id) continue;
    const dataset: DatasetState = { ...saved };
    if (dataset.status === "ready" && !pathStillExists(dataset.filePath)) {
      dataset.status = "invalid";
      dataset.error =
        "This dataset's file is missing from disk. Delete it and re-upload or re-create it.";
      dataset.filePath = null;
    }
    datasets.set(dataset.id, dataset);
  }
}

function restoreJobs(): void {
  for (const saved of readSnapshot<JobState>("jobs")) {
    if (!saved?.id) continue;
    const job: JobState = {
      ...saved,
      logs: Array.isArray(saved.logs) ? saved.logs : [],
      lossHistory: Array.isArray(saved.lossHistory) ? saved.lossHistory : [],
      cancelRequested: false,
      // Jobs persisted before progressive fine-tuning existed lack these.
      parentJobId: saved.parentJobId ?? null,
      parentJobName: saved.parentJobName ?? null,
      loraRank:
        typeof saved.loraRank === "number"
          ? saved.loraRank
          : (PRESET_CATALOG.find((p) => p.id === saved.presetId)?.loraRank ?? 8),
    };

    if (["queued", "preparing", "training"].includes(job.status)) {
      job.status = "failed";
      job.error = "Training was interrupted when the app was restarted. Start a new run to continue.";
      job.statusMessage = "Interrupted by restart";
      job.etaSeconds = null;
      pushJobLog(job, "Training was interrupted by an app restart");
    } else if (job.status === "exporting") {
      job.status = "completed";
      job.error = "The export was interrupted when the app was restarted — you can export again.";
      job.statusMessage = "Export interrupted — try again";
      job.exportReady = false;
      job.exportPath = null;
      pushJobLog(job, "Export was interrupted by an app restart");
    }

    if (job.adapterPath && !pathStillExists(job.adapterPath)) {
      job.adapterPath = null;
      pushJobLog(job, "The fine-tuned adapter files for this job are missing from disk");
    }
    if (job.exportReady && !pathStillExists(job.exportPath)) {
      job.exportReady = false;
      job.exportPath = null;
    }

    jobs.set(job.id, job);
  }
}

let loaded = false;

/**
 * Rebuilds the in-memory model/dataset/job registries from disk snapshots,
 * reconciling each entry against the actual files it points at, then wires
 * up change hooks so every future update is persisted automatically.
 */
export function loadPersistedState(): void {
  if (loaded) return;
  loaded = true;

  restoreModels();
  restoreDatasets();
  restoreJobs();

  persistHooks.models = persistModels;
  persistHooks.jobs = persistJobs;
  persistHooks.datasets = persistDatasets;

  // Write reconciled state back immediately so interrupted-run markers and
  // missing-file downgrades survive even if nothing else changes before the
  // next shutdown.
  writeAtomic("models");
  writeAtomic("datasets");
  writeAtomic("jobs");

  let shuttingDown = false;
  const onSignal = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    flushAllSync();
    process.exit(signal === "SIGINT" ? 130 : 143);
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);
  process.on("exit", () => flushAllSync());

  logger.info(
    { models: models.size, datasets: datasets.size, jobs: jobs.size },
    "Restored persisted registries from disk",
  );
}
