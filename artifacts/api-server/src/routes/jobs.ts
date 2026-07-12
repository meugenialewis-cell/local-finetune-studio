import { Router, type IRouter } from "express";
import fs from "fs";
import { execFileSync } from "child_process";
import {
  ListJobsResponse,
  GetJobResponse,
  CreateJobResponse,
  CancelJobResponse,
  ExportJobResponse,
  ExportJobBody,
} from "@workspace/api-zod";
import { jobs, models, datasets, newId, JobState, jobEvents, EXPORTS_DIR, MODELS_DIR, emitJobUpdate, persistHooks } from "../lib/store";
import { startSseHeartbeat } from "../lib/sseHeartbeat";
import { PRESET_CATALOG } from "../lib/catalog";
import { simulateTraining, simulateExport } from "../lib/simulate";
import { getSystemStatus } from "../lib/systemCheck";
import { runPythonScript } from "../lib/runner";
import path from "path";

const router: IRouter = Router();

const runningProcesses = new Map<string, ReturnType<typeof runPythonScript>>();

function serialize(j: JobState) {
  return {
    id: j.id,
    name: j.name,
    modelId: j.modelId,
    modelName: j.modelName,
    datasetId: j.datasetId,
    datasetName: j.datasetName,
    presetId: j.presetId,
    presetName: j.presetName,
    status: j.status,
    progress: j.progress,
    currentEpoch: j.currentEpoch,
    totalEpochs: j.totalEpochs,
    loss: j.loss,
    etaSeconds: j.etaSeconds,
    statusMessage: j.statusMessage,
    error: j.error,
    simulated: j.simulated,
    createdAt: j.createdAt,
    exportReady: j.exportReady,
    exportFormat: j.exportFormat,
    parentJobId: j.parentJobId ?? null,
    parentJobName: j.parentJobName ?? null,
    logs: j.logs,
    lossHistory: j.lossHistory,
  };
}

router.get("/jobs", (_req, res) => {
  const list = [...jobs.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  res.json(ListJobsResponse.parse(list.map(serialize)));
});

router.get("/jobs/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId as string);
  if (!job) {
    res.status(404).json({ message: "Job not found" });
    return;
  }
  res.json(GetJobResponse.parse(serialize(job)));
});

router.post("/jobs", (req, res) => {
  const { name, modelId, datasetId, presetId, parentJobId } = req.body ?? {};

  const model = models.get(modelId);
  const dataset = datasets.get(datasetId);
  const preset = PRESET_CATALOG.find((p) => p.id === presetId);

  if (!model) {
    res.status(400).json({ message: "Please choose a valid base model." });
    return;
  }
  if (model.status !== "ready") {
    res.status(400).json({ message: "This model hasn't finished downloading yet." });
    return;
  }
  if (model.fineTuneSupport === "none") {
    res.status(400).json({
      message: `${model.name} can be downloaded and chatted with, but its architecture doesn't support LoRA fine-tuning yet. Please pick a different base model.`,
    });
    return;
  }
  if (!dataset) {
    res.status(400).json({ message: "Please choose a valid dataset." });
    return;
  }
  if (dataset.status !== "ready") {
    res.status(400).json({ message: "This dataset isn't ready to use. Please fix or re-upload it." });
    return;
  }
  if (!preset) {
    res.status(400).json({ message: "Please choose a valid training preset." });
    return;
  }

  const systemStatus = getSystemStatus();

  // Progressive fine-tuning: optionally continue from a previous run's adapter.
  let parentJob: JobState | null = null;
  let resumeAdapterFile: string | null = null;
  if (parentJobId) {
    const parent = jobs.get(parentJobId);
    if (!parent) {
      res.status(400).json({ message: "The previous run you chose to continue from no longer exists." });
      return;
    }
    if (parent.status !== "completed" && parent.status !== "exported") {
      res.status(400).json({ message: `"${parent.name}" hasn't finished training yet, so it can't be continued from.` });
      return;
    }
    if (parent.modelId !== model.id) {
      res.status(400).json({
        message: `"${parent.name}" was trained on ${parent.modelName}, so a run that continues from it must use ${parent.modelName} as its base model.`,
      });
      return;
    }
    if (!parent.adapterPath) {
      res.status(400).json({
        message: `The adapter files from "${parent.name}" are missing from disk, so it can't be continued from. Start a fresh run instead.`,
      });
      return;
    }
    if (systemStatus.trainingBackendReady) {
      if (parent.adapterPath.startsWith("simulated://")) {
        res.status(400).json({
          message: `"${parent.name}" was a simulated run from the cloud preview, so there are no real adapter weights to continue from. Start a fresh run instead.`,
        });
        return;
      }
      const adapterFile = path.join(parent.adapterPath, "adapters.safetensors");
      if (!fs.existsSync(adapterFile)) {
        res.status(400).json({
          message: `The adapter weights from "${parent.name}" are missing from disk, so it can't be continued from. Start a fresh run instead.`,
        });
        return;
      }
      resumeAdapterFile = adapterFile;
    }
    parentJob = parent;
  }

  const id = newId("job");
  const job: JobState = {
    id,
    name: name || `${model.name} + ${dataset.name}`,
    modelId: model.id,
    modelName: model.name,
    datasetId: dataset.id,
    datasetName: dataset.name,
    presetId: preset.id,
    presetName: preset.name,
    status: "queued",
    progress: 0,
    currentEpoch: 0,
    totalEpochs: preset.epochs,
    loss: null,
    etaSeconds: null,
    statusMessage: "Queued",
    error: null,
    simulated: true,
    createdAt: new Date().toISOString(),
    exportReady: false,
    exportFormat: null,
    exportPath: null,
    adapterPath: null,
    loraRank: preset.loraRank,
    parentJobId: parentJob?.id ?? null,
    parentJobName: parentJob?.name ?? null,
    cancelRequested: false,
    logs: [],
    lossHistory: [],
  };

  job.simulated = !systemStatus.trainingBackendReady;
  if (model.fineTuneSupport === "experimental") {
    job.logs.push(
      `[${new Date().toLocaleTimeString()}] Note: ${model.name} uses a fast-weights architecture — LoRA fine-tuning for it is experimental, so keep an eye on the loss curve.`,
    );
  }

  // When continuing a run, the LoRA rank must match the rank the parent
  // actually trained with (the resumed weights have fixed dimensions). Use the
  // rank persisted on the parent job — the parent may itself have inherited a
  // rank different from its own preset's.
  let effectiveLoraRank = preset.loraRank;
  if (parentJob) {
    const parentRank =
      typeof parentJob.loraRank === "number"
        ? parentJob.loraRank
        : (PRESET_CATALOG.find((p) => p.id === parentJob.presetId)?.loraRank ?? preset.loraRank);
    effectiveLoraRank = parentRank;
    job.loraRank = effectiveLoraRank;
    if (parentRank !== preset.loraRank) {
      job.logs.push(
        `[${new Date().toLocaleTimeString()}] Using LoRA rank ${effectiveLoraRank} to match "${parentJob.name}" — a continued run must keep the same adapter shape as the run it builds on.`,
      );
    }
    job.logs.push(
      `[${new Date().toLocaleTimeString()}] Continuing from "${parentJob.name}" — starting weights come from that run's adapter instead of the plain base model.`,
    );
  }

  jobs.set(id, job);
  persistHooks.jobs?.();

  if (systemStatus.trainingBackendReady && model.localPath && dataset.filePath) {
    runRealTraining(job, model.localPath, dataset.filePath, preset, effectiveLoraRank, resumeAdapterFile);
  } else {
    simulateTraining(job);
  }

  res.status(201).json(CreateJobResponse.parse(serialize(job)));
});

function runRealTraining(
  job: JobState,
  modelDir: string,
  datasetPath: string,
  preset: (typeof PRESET_CATALOG)[number],
  loraRank: number,
  resumeAdapterFile: string | null,
) {
  job.status = "preparing";
  job.statusMessage = resumeAdapterFile
    ? "Preparing your dataset and loading the previous run's adapter"
    : "Preparing your dataset and loading the base model";
  job.progress = 2;
  job.logs.push(`[${new Date().toLocaleTimeString()}] ${job.statusMessage}`);
  emitJobUpdate(job);

  const outputDir = path.join(MODELS_DIR, `${job.id}-adapter`);

  const args = [modelDir, datasetPath, outputDir, String(preset.epochs), String(preset.learningRate), String(loraRank)];
  if (resumeAdapterFile) args.push(resumeAdapterFile);

  const child = runPythonScript(
    "train.py",
    args,
    (event) => {
      if (event.type === "progress") {
        job.status = "training";
        if (event.percent !== null && event.percent !== undefined) {
          job.progress = Math.min(99, Math.round(Number(event.percent) || job.progress));
        }
        if (typeof event.epoch === "number") job.currentEpoch = event.epoch;
        if (typeof event.totalEpochs === "number") job.totalEpochs = event.totalEpochs;
        if (typeof event.loss === "number") {
          job.loss = event.loss;
          job.lossHistory.push(event.loss);
        }
        job.statusMessage = (event.message as string) || job.statusMessage;
        job.logs.push(`[${new Date().toLocaleTimeString()}] ${job.statusMessage}`);
        emitJobUpdate(job);
      } else if (event.type === "done") {
        job.status = "completed";
        job.progress = 100;
        job.etaSeconds = 0;
        job.statusMessage = "Training complete";
        job.adapterPath = (event.adapterDir as string) ?? outputDir;
        job.logs.push(`[${new Date().toLocaleTimeString()}] Training complete`);
        emitJobUpdate(job);
      } else if (event.type === "error") {
        if (job.cancelRequested) {
          job.status = "cancelled";
          job.statusMessage = "Training cancelled";
          job.logs.push(`[${new Date().toLocaleTimeString()}] Training cancelled`);
        } else {
          job.status = "failed";
          job.error = (event.message as string) ?? "Training failed on your Mac.";
          job.statusMessage = "Training failed";
          job.logs.push(`[${new Date().toLocaleTimeString()}] ${job.error}`);
        }
        emitJobUpdate(job);
      }
    },
    (code) => {
      runningProcesses.delete(job.id);
      if (job.status === "preparing" || job.status === "training") {
        if (job.cancelRequested) {
          job.status = "cancelled";
          job.statusMessage = "Training cancelled";
          job.logs.push(`[${new Date().toLocaleTimeString()}] Training cancelled`);
        } else {
          job.status = "failed";
          job.error = job.error ?? `Training process exited unexpectedly (code ${code}).`;
        }
        emitJobUpdate(job);
      }
    },
  );
  runningProcesses.set(job.id, child);
}

router.post("/jobs/:jobId/cancel", (req, res) => {
  const job = jobs.get(req.params.jobId as string);
  if (!job) {
    res.status(404).json({ message: "Job not found" });
    return;
  }
  if (["completed", "failed", "cancelled", "exported"].includes(job.status)) {
    res.json(CancelJobResponse.parse(serialize(job)));
    return;
  }
  job.cancelRequested = true;
  const child = runningProcesses.get(job.id);
  if (child) {
    job.logs.push(`[${new Date().toLocaleTimeString()}] Cancelling — stopping local training process`);
    child.kill("SIGTERM");
  } else {
    // No real process running (simulated job) — simulate.ts's own loop
    // checks cancelRequested and will transition the job to cancelled.
  }
  res.json(CancelJobResponse.parse(serialize(job)));
});

router.get("/jobs/:jobId/events", (req, res) => {
  const jobId = req.params.jobId as string;
  const job = jobs.get(jobId);
  if (!job) {
    res.status(404).end();
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (j: JobState) => {
    res.write(`data: ${JSON.stringify(serialize(j))}\n\n`);
  };
  send(job);
  const stopHeartbeat = startSseHeartbeat(res);

  const terminal = ["completed", "failed", "cancelled", "exported"];
  const listener = (j: JobState) => {
    send(j);
    if (terminal.includes(j.status)) {
      cleanup();
    }
  };
  jobEvents.on(jobId, listener);

  const cleanup = () => {
    stopHeartbeat();
    jobEvents.off(jobId, listener);
    res.end();
  };
  req.on("close", cleanup);
});

router.post("/jobs/:jobId/export", (req, res) => {
  const job = jobs.get(req.params.jobId as string);
  if (!job) {
    res.status(404).json({ message: "Job not found" });
    return;
  }
  if (job.status !== "completed" && job.status !== "exported") {
    res.status(400).json({ message: "This job hasn't finished training yet, so there's nothing to export." });
    return;
  }
  const parsed = ExportJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Please choose an export format: "ollama" or "gguf".' });
    return;
  }

  const model = models.get(job.modelId);
  if (model && !model.exportFormats.includes(parsed.data.format)) {
    res.status(400).json({
      message:
        model.exportFormats.length === 0
          ? `${model.name} uses a fast-weights architecture that GGUF/Ollama packaging doesn't support yet. Your fine-tuned adapter is still saved and runs with MLX on your Mac.`
          : `${model.name} can't be exported as ${parsed.data.format.toUpperCase()}. Available formats: ${model.exportFormats.join(", ").toUpperCase()}.`,
    });
    return;
  }

  const systemStatus = getSystemStatus();
  // A fresh export attempt clears any error and stale artifact from a previous attempt.
  job.error = null;
  job.exportReady = false;
  job.exportPath = null;
  if (systemStatus.trainingBackendReady && job.adapterPath && !job.adapterPath.startsWith("simulated://")) {
    runRealExport(job, model?.localPath ?? "", job.adapterPath, parsed.data.format);
  } else {
    simulateExport(job, parsed.data.format);
  }
  res.json(ExportJobResponse.parse(serialize(job)));
});

function runRealExport(job: JobState, modelDir: string, adapterDir: string, format: "ollama" | "gguf") {
  job.status = "exporting";
  job.exportFormat = format;
  job.progress = 0;
  job.statusMessage = `Packaging your model as ${format === "ollama" ? "an Ollama model" : "a GGUF file"}`;
  job.logs.push(`[${new Date().toLocaleTimeString()}] Starting export as ${format.toUpperCase()}`);
  emitJobUpdate(job);

  const outputDir = path.join(EXPORTS_DIR, job.id);

  runPythonScript(
    "export_model.py",
    [modelDir, adapterDir, outputDir, format],
    (event) => {
      if (event.type === "progress") {
        job.progress = Math.min(99, Math.round(Number(event.percent) || job.progress));
        job.statusMessage = (event.message as string) || job.statusMessage;
        job.logs.push(`[${new Date().toLocaleTimeString()}] ${job.statusMessage}`);
        emitJobUpdate(job);
      } else if (event.type === "done") {
        job.status = "exported";
        job.progress = 100;
        job.exportReady = true;
        job.exportPath = (event.path as string) ?? outputDir;
        job.statusMessage = "Export ready to download";
        job.logs.push(`[${new Date().toLocaleTimeString()}] Export ready to download`);
        emitJobUpdate(job);
      } else if (event.type === "error") {
        job.status = "completed";
        job.error = (event.message as string) || "Export failed on your Mac.";
        job.statusMessage = "Export failed — you can try again";
        job.logs.push(`[${new Date().toLocaleTimeString()}] ${job.error}`);
        emitJobUpdate(job);
      }
    },
    (code) => {
      if (job.status === "exporting") {
        job.status = "completed";
        job.error = job.error ?? `Export process exited unexpectedly (code ${code}).`;
        job.statusMessage = "Export failed — you can try again";
        emitJobUpdate(job);
      }
    },
  );
}

router.get("/jobs/:jobId/export/download", (req, res) => {
  const job = jobs.get(req.params.jobId as string);
  if (!job || !job.exportReady) {
    res.status(404).json({ message: "No export is ready for this job yet." });
    return;
  }

  // Real export path: job.exportPath was produced by export_model.py (a
  // model.gguf file, or a directory containing the fused model + Modelfile).
  if (job.exportPath && !job.simulated && fs.existsSync(job.exportPath)) {
    const stat = fs.statSync(job.exportPath);
    if (stat.isDirectory()) {
      // Zip the export directory on the fly so the user gets a single download.
      const zipPath = path.join(EXPORTS_DIR, `${job.id}.zip`);
      try {
        execFileSync("zip", ["-r", "-q", zipPath, "."], { cwd: job.exportPath });
      } catch (err) {
        res.status(500).json({ message: `Could not package your export for download: ${(err as Error).message}` });
        return;
      }
      res.download(zipPath, `${job.name.replace(/[^a-z0-9-_]+/gi, "_")}-${job.exportFormat}.zip`);
      return;
    }
    res.download(job.exportPath, path.basename(job.exportPath));
    return;
  }

  const ext = job.exportFormat === "gguf" ? "gguf" : "modelfile";
  const filePath = path.join(EXPORTS_DIR, `${job.id}.${ext}`);
  const contents =
    job.exportFormat === "gguf"
      ? `# Simulated GGUF export placeholder for job ${job.id}\n# Run this app on your Mac to produce a real GGUF file.\n`
      : `FROM ./${job.modelName}\n# Simulated Ollama Modelfile for job ${job.id}\n# Run this app on your Mac to produce a real fine-tuned model.\n`;
  fs.writeFileSync(filePath, contents);

  res.download(filePath, path.basename(filePath));
});

export default router;
