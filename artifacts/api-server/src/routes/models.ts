import { Router, type IRouter } from "express";
import {
  ListModelsResponse,
  GetModelResponse,
  StartModelDownloadResponse,
} from "@workspace/api-zod";
import { MODEL_CATALOG } from "../lib/catalog";
import { models, modelEvents, ModelState } from "../lib/store";
import { getSystemStatus } from "../lib/systemCheck";
import { simulateModelDownload } from "../lib/simulate";

const router: IRouter = Router();

function ensureSeeded() {
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
  // Real downloads require huggingface_hub + network access from the user's
  // own Mac; we always simulate here for a consistent, fast prototyping
  // experience, and clearly label simulated jobs via system status.
  void status;
  simulateModelDownload(model, () => {});

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

  const listener = (m: ModelState) => {
    send(m);
    if (m.status === "ready" || m.status === "failed") {
      cleanup();
    }
  };
  modelEvents.on(modelId, listener);

  const cleanup = () => {
    modelEvents.off(modelId, listener);
    res.end();
  };
  req.on("close", cleanup);
});

export default router;
