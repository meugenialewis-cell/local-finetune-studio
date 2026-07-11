import {
  ModelState,
  JobState,
  ChatSessionState,
  emitModelUpdate,
  emitJobUpdate,
  emitChatUpdate,
  jobs,
  pushJobLog,
} from "./store";

// Prepare-phase timers are kept out of the JobState objects themselves so
// job state stays plain JSON-serializable data (it gets persisted to disk).
const prepareTimeouts = new Map<string, NodeJS.Timeout>();

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
  pushJobLog(job, "Preparing dataset and loading base model (simulated)");
  emitJobUpdate(job);

  const totalEpochs = job.totalEpochs;
  const stepsPerEpoch = 10;
  const totalSteps = totalEpochs * stepsPerEpoch;
  let step = 0;
  let loss = 2.4;

  const prepareTimeout = setTimeout(() => {
    prepareTimeouts.delete(job.id);
    if (job.cancelRequested) {
      job.status = "cancelled";
      job.statusMessage = "Training was cancelled";
      pushJobLog(job, "Training cancelled by user");
      emitJobUpdate(job);
      return;
    }
    job.status = "training";
    job.statusMessage = `Training epoch 1 of ${totalEpochs}`;
    pushJobLog(job, `Started training (simulated), ${totalEpochs} epoch(s) planned`);
    emitJobUpdate(job);

    const interval = setInterval(() => {
      if (job.cancelRequested) {
        clearInterval(interval);
        job.status = "cancelled";
        job.statusMessage = "Training was cancelled";
        pushJobLog(job, "Training cancelled by user");
        emitJobUpdate(job);
        return;
      }

      step++;
      loss = Math.max(0.15, loss - Math.random() * 0.12 - 0.02);
      job.loss = Math.round(loss * 1000) / 1000;
      job.lossHistory.push(job.loss);
      job.currentEpoch = Math.min(totalEpochs, Math.ceil(step / stepsPerEpoch));
      job.progress = Math.min(99, Math.round((step / totalSteps) * 100));
      job.etaSeconds = Math.max(0, Math.round(((totalSteps - step) * 900) / 1000));
      job.statusMessage = `Training epoch ${job.currentEpoch} of ${totalEpochs}`;
      if (step % stepsPerEpoch === 0 || step === totalSteps) {
        pushJobLog(job, `Epoch ${job.currentEpoch}/${totalEpochs} — loss ${job.loss.toFixed(3)}`);
      }
      emitJobUpdate(job);

      if (step >= totalSteps) {
        clearInterval(interval);
        job.status = "completed";
        job.progress = 100;
        job.etaSeconds = 0;
        job.statusMessage = "Training complete";
        job.adapterPath = `simulated://${job.id}/adapter`;
        pushJobLog(job, "Training complete");
        emitJobUpdate(job);
      }
    }, 900);
  }, 1200);

  prepareTimeouts.set(job.id, prepareTimeout);
}

export function simulateExport(job: JobState, format: "ollama" | "gguf") {
  job.status = "exporting";
  job.exportFormat = format;
  job.statusMessage = `Packaging your model as ${format === "ollama" ? "an Ollama model" : "a GGUF file"}`;
  job.progress = 0;
  pushJobLog(job, `Starting export as ${format.toUpperCase()} (simulated)`);
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
      pushJobLog(job, "Export ready to download");
      emitJobUpdate(job);
    }
  }, 500);
}

export function findJob(id: string): JobState | undefined {
  return jobs.get(id);
}

const SIMULATED_REPLY_TEMPLATES = [
  (modelName: string, userMessage: string) =>
    `This is a simulated reply — you're in the cloud preview, so ${modelName} isn't actually running. When you start this app on your own Mac, this exact conversation flow runs real inference instead.\n\nThat said, everything else here is real: your message ("${truncate(userMessage, 80)}") is being saved to this session's transcript on disk, and you can curate it into a training dataset from the Transcripts panel.`,
  (modelName: string, userMessage: string) =>
    `Simulated response from ${modelName}. Real generation needs Apple Silicon with MLX installed, which this cloud preview doesn't have.\n\nYour side of the conversation still counts, though — "${truncate(userMessage, 80)}" is now part of this transcript, and transcripts are the raw material for the memory-to-dataset loop.`,
  (modelName: string, userMessage: string) =>
    `(${modelName}, simulated) I can't genuinely think about "${truncate(userMessage, 80)}" from inside the cloud preview — but on your Mac I would. The full pipeline you're testing right now — chat, auto-saved transcript, curation into a dataset, fine-tune — works identically with real replies once you run the app locally.`,
];

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

/**
 * Streams a clearly-labeled fake assistant reply word by word, mirroring the
 * shape of real token streaming so the chat UI behaves identically in the
 * cloud preview and on the user's Mac.
 */
export function simulateChatReply(session: ChatSessionState, onDone: () => void) {
  const lastUser = [...session.messages].reverse().find((m) => m.role === "user");
  const template =
    SIMULATED_REPLY_TEMPLATES[session.messages.length % SIMULATED_REPLY_TEMPLATES.length]!;
  const fullText = template(session.modelName, lastUser?.content ?? "");
  const words = fullText.split(/(?<=\s)/);

  const assistantMessage = {
    role: "assistant" as const,
    content: "",
    timestamp: new Date().toISOString(),
  };
  session.messages.push(assistantMessage);

  let i = 0;
  const interval = setInterval(() => {
    // Stop if the session was deleted mid-generation.
    if (!session.generating) {
      clearInterval(interval);
      return;
    }
    assistantMessage.content += words[i] ?? "";
    i++;
    emitChatUpdate(session);
    if (i >= words.length) {
      clearInterval(interval);
      session.generating = false;
      session.updatedAt = new Date().toISOString();
      emitChatUpdate(session);
      onDone();
    }
  }, 40);
}
