import { ModelState, JobState, emitModelUpdate, emitJobUpdate, jobs } from "./store";

export function simulateModelDownload(model: ModelState, onDone: () => void) {
  model.status = "downloading";
  model.downloadProgress = 0;
  emitModelUpdate(model);

  const totalSteps = 20;
  let step = 0;
  const interval = setInterval(() => {
    step++;
    model.downloadProgress = Math.min(100, Math.round((step / totalSteps) * 100));
    emitModelUpdate(model);
    if (step >= totalSteps) {
      clearInterval(interval);
      model.status = "ready";
      model.downloadProgress = 100;
      model.localPath = `simulated://${model.id}`;
      emitModelUpdate(model);
      onDone();
    }
  }, 350);
}

export function simulateTraining(job: JobState) {
  job.status = "preparing";
  job.statusMessage = "Preparing your dataset and loading the base model";
  job.progress = 2;
  emitJobUpdate(job);

  const totalEpochs = job.totalEpochs;
  const stepsPerEpoch = 10;
  const totalSteps = totalEpochs * stepsPerEpoch;
  let step = 0;
  let loss = 2.4;

  const prepareTimeout = setTimeout(() => {
    if (job.cancelRequested) return;
    job.status = "training";
    job.statusMessage = `Training epoch 1 of ${totalEpochs}`;
    emitJobUpdate(job);

    const interval = setInterval(() => {
      if (job.cancelRequested) {
        clearInterval(interval);
        job.status = "cancelled";
        job.statusMessage = "Training was cancelled";
        emitJobUpdate(job);
        return;
      }

      step++;
      loss = Math.max(0.15, loss - Math.random() * 0.12 - 0.02);
      job.loss = Math.round(loss * 1000) / 1000;
      job.currentEpoch = Math.min(totalEpochs, Math.ceil(step / stepsPerEpoch));
      job.progress = Math.min(99, Math.round((step / totalSteps) * 100));
      job.etaSeconds = Math.max(0, Math.round(((totalSteps - step) * 900) / 1000));
      job.statusMessage = `Training epoch ${job.currentEpoch} of ${totalEpochs}`;
      emitJobUpdate(job);

      if (step >= totalSteps) {
        clearInterval(interval);
        job.status = "completed";
        job.progress = 100;
        job.etaSeconds = 0;
        job.statusMessage = "Training complete";
        job.adapterPath = `simulated://${job.id}/adapter`;
        emitJobUpdate(job);
      }
    }, 900);
  }, 1200);

  (job as JobState & { _prepareTimeout?: NodeJS.Timeout })._prepareTimeout = prepareTimeout;
}

export function simulateExport(job: JobState, format: "ollama" | "gguf") {
  job.status = "exporting";
  job.exportFormat = format;
  job.statusMessage = `Packaging your model as ${format === "ollama" ? "an Ollama model" : "a GGUF file"}`;
  job.progress = 0;
  emitJobUpdate(job);

  let step = 0;
  const interval = setInterval(() => {
    step++;
    job.progress = Math.min(99, step * 20);
    emitJobUpdate(job);
    if (step >= 5) {
      clearInterval(interval);
      job.status = "exported";
      job.progress = 100;
      job.exportReady = true;
      job.exportPath = `simulated://${job.id}/export.${format === "gguf" ? "gguf" : "ollama"}`;
      job.statusMessage = "Export ready to download";
      emitJobUpdate(job);
    }
  }, 500);
}

export function findJob(id: string): JobState | undefined {
  return jobs.get(id);
}
