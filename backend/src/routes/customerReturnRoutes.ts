import { Router } from "express";
import {
  createReturnRequest,
  getMyReturns,
  getMyReturnById,
} from "../modules/customer/controllers/customerReturnController";
import { authenticate, requireUserType } from "../middleware/auth";

const router = Router();

// Customer-facing returns. Nothing could create a Return before this. (#H-20)
router.use(authenticate);
router.use(requireUserType("Customer"));

router.post("/", createReturnRequest);
router.get("/", getMyReturns);
router.get("/:id", getMyReturnById);

export default router;
