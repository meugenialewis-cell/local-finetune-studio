import { Router, type IRouter } from "express";
import fs from "fs";
import {
  ListJobsResponse,
  GetJobResponse,
  CreateJobResponse,
  CancelJobResponse,
  ExportJobResponse,
  ExportJobBody,
} from "@workspace/api-zod";
import { jobs, models, datasets, newId, JobState, jobEvents, EXPORTS_DIR } from "../lib/store";
import { PRESET_CATALOG } from "../lib/catalog";
import { simulateTraining, simulateExport } from "../lib/simulate";
import path from "path";

const router: IRouter = Router();

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
  const { name, modelId, datasetId, presetId } = req.body ?? {};

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
    cancelRequested: false,
  };
  jobs.set(id, job);

  simulateTraining(job);

  res.status(201).json(CreateJobResponse.parse(serialize(job)));
});

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

  const terminal = ["completed", "failed", "cancelled", "exported"];
  const listener = (j: JobState) => {
    send(j);
    if (terminal.includes(j.status)) {
      cleanup();
    }
  };
  jobEvents.on(jobId, listener);

  const cleanup = () => {
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

  simulateExport(job, parsed.data.format);
  res.json(ExportJobResponse.parse(serialize(job)));
});

router.get("/jobs/:jobId/export/download", (req, res) => {
  const job = jobs.get(req.params.jobId as string);
  if (!job || !job.exportReady) {
    res.status(404).json({ message: "No export is ready for this job yet." });
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
