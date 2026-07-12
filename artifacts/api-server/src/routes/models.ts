import { Router, type IRouter } from "express";
import {
  ListModelsResponse,
  GetModelResponse,
  StartModelDownloadResponse,
} from "@workspace/api-zod";
import path from "path";
import { MODEL_CATALOG } from "../lib/catalog";
import { models, modelEvents, ModelState, MODELS_DIR, emitModelUpdate } from "../lib/store";
import { startSseHeartbeat } from "../lib/sseHeartbeat";
import { getSystemStatus } from "../lib/systemCheck";
import { simulateModelDownload } from "../lib/simulate";
import { runPythonScript } from "../lib/runner";

const router: IRouter = Router();

export function ensureSeeded() {
  if (models.size > 0) return;
  for (const m of MODEL_CATALOG) {
    models.set(m.id, {
      id: m.id,
      name: m.name,
      family: m.family,
      parameterCount: m.parameterCount,
      sizeCategory: m.sizeCategory,
      sizeGb: m.sizeGb,
      description: m.description,
      recommendedUse: m.recommendedUse,
      memoryGuidance: m.memoryGuidance,
      architecture: m.architecture,
      fineTuneSupport: m.fineTuneSupport,
      exportFormats: m.exportFormats,
      status: "not_downloaded",
      downloadProgress: 0,
      error: null,
      repoId: m.repoId,
      localPath: null,
    });
  }
}

function serialize(m: ModelState) {
  return {
    id: m.id,
    name: m.name,
    family: m.family,
    parameterCount: m.parameterCount,
    sizeCategory: m.sizeCategory,
    sizeGb: m.sizeGb,
    description: m.description,
    recommendedUse: m.recommendedUse,
    memoryGuidance: m.memoryGuidance,
    architecture: m.architecture,
    fineTuneSupport: m.fineTuneSupport,
    exportFormats: m.exportFormats,
    status: m.status,
    downloadProgress: m.downloadProgress,
    error: m.error,
  };
}

router.get("/models", (_req, res) => {
  ensureSeeded();
  const data = ListModelsResponse.parse([...models.values()].map(serialize));
  res.json(data);
});

router.get("/models/:modelId", (req, res) => {
  ensureSeeded();
  const model = models.get(req.params.modelId as string);
  if (!model) {
    res.status(404).json({ message: "Model not found" });
    return;
  }
  res.json(GetModelResponse.parse(serialize(model)));
});

router.post("/models/:modelId/download", (req, res) => {
  ensureSeeded();
  const model = models.get(req.params.modelId as string);
  if (!model) {
    res.status(404).json({ message: "Model not found" });
    return;
  }
  if (model.status === "downloading") {
    res.json(StartModelDownloadResponse.parse(serialize(model)));
    return;
  }

  model.status = "downloading";
  model.downloadProgress = 0;
  model.error = null;

  const status = getSystemStatus();
  if (status.trainingBackendReady) {
    // Real path: run on the user's own Mac with huggingface_hub installed.
    const destDir = path.join(MODELS_DIR, model.id);
    emitModelUpdate(model);
    runPythonScript(
      "download_model.py",
      [model.repoId, destDir],
      (event) => {
        if (event.type === "progress") {
          model.downloadProgress = Math.min(99, Math.round(Number(event.percent) || 0));
          emitModelUpdate(model);
        } else if (event.type === "done") {
          model.status = "ready";
          model.downloadProgress = 100;
          model.localPath = (event.path as string) ?? destDir;
          emitModelUpdate(model);
        } else if (event.type === "error") {
          model.status = "failed";
          model.error = (event.message as string) ?? "Model download failed.";
          emitModelUpdate(model);
        }
      },
      (code) => {
        if (model.status === "downloading") {
          model.status = "failed";
          model.error = model.error ?? `Download process exited unexpectedly (code ${code}).`;
          emitModelUpdate(model);
        }
      },
    );
  } else {
    // Simulated path: used whenever this isn't running on Apple Silicon with
    // MLX installed (e.g. this cloud preview), so the wizard stays fully
    // usable for prototyping without a real GPU.
    simulateModelDownload(model, () => {});
  }

  res.json(StartModelDownloadResponse.parse(serialize(model)));
});

router.get("/models/:modelId/download/events", (req, res) => {
  ensureSeeded();
  const modelId = req.params.modelId as string;
  const model = models.get(modelId);
  if (!model) {
    res.status(404).end();
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (m: ModelState) => {
    res.write(`data: ${JSON.stringify(serialize(m))}\n\n`);
  };
  send(model);
  const stopHeartbeat = startSseHeartbeat(res);

  const listener = (m: ModelState) => {
    send(m);
    if (m.status === "ready" || m.status === "failed") {
      cleanup();
    }
  };
  modelEvents.on(modelId, listener);

  const cleanup = () => {
    stopHeartbeat();
    modelEvents.off(modelId, listener);
    res.end();
  };
  req.on("close", cleanup);
});

export default router;
