import { Router } from "express";
import { healthController } from "../controllers/health.controller.js";

const router = Router();

// Liveness probe
router.get("/health", healthController.getHealth);

// Readiness probe
router.get("/ready", healthController.getReadiness);

export const healthRoutes = router;
