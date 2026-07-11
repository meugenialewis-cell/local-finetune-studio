import { Router, type IRouter } from "express";
import healthRouter from "./health";
import systemRouter from "./system";
import modelsRouter from "./models";
import datasetsRouter from "./datasets";
import presetsRouter from "./presets";
import jobsRouter from "./jobs";
import chatRouter from "./chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(systemRouter);
router.use(modelsRouter);
router.use(datasetsRouter);
router.use(presetsRouter);
router.use(jobsRouter);
router.use(chatRouter);

export default router;
