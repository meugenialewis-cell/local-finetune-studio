import { Router, type IRouter } from "express";
import { ListPresetsResponse } from "@workspace/api-zod";
import { PRESET_CATALOG } from "../lib/catalog";

const router: IRouter = Router();

router.get("/presets", (_req, res) => {
  const data = ListPresetsResponse.parse(PRESET_CATALOG);
  res.json(data);
});

export default router;
