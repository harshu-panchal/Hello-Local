import { Router } from "express";
import { getHomemadeHub } from "../modules/customer/controllers/customerHomemadeController";

const router = Router();

// Public routes for homemade hub
router.get("/hub", getHomemadeHub);

export default router;
