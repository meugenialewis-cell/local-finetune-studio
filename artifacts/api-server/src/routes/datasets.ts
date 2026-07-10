import { Router, type IRouter } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import {
  ListDatasetsResponse,
  GetDatasetResponse,
  UploadDatasetResponse,
} from "@workspace/api-zod";
import { datasets, newId, DatasetState, DATASETS_DIR } from "../lib/store";
import { parseDataset } from "../lib/datasetParser";

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
