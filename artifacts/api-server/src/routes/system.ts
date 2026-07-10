import { Router, type IRouter } from "express";
import { GetSystemStatusResponse } from "@workspace/api-zod";
import { getSystemStatus } from "../lib/systemCheck";

const router: IRouter = Router();

router.get("/system/status", (_req, res) => {
  const data = GetSystemStatusResponse.parse(getSystemStatus());
  res.json(data);
});

export default router;
