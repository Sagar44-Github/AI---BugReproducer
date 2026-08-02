import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analysesRouter from "./analyses";
import githubRouter from "./github";
import toolsRouter from "./tools";
import projectsRouter from "./projects";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analysesRouter);
router.use(githubRouter);
router.use(toolsRouter);
router.use(projectsRouter);
router.use(settingsRouter);

export default router;
