import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analysesRouter from "./analyses";
import githubRouter from "./github";
import toolsRouter from "./tools";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analysesRouter);
router.use(githubRouter);
router.use(toolsRouter);

export default router;
