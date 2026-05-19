import { Router } from "express";
import {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  refreshDeliveryOtp,
  updateOrderNotes,
} from "../modules/customer/controllers/customerOrderController";
import { authenticate, requireUserType } from "../middleware/auth";

const router = Router();

// All customer order routes require authentication
router.use(authenticate);

router.post("/", requireUserType("Customer", "Admin"), createOrder);
router.get("/", requireUserType("Customer", "Admin"), getMyOrders);
router.get("/:id", requireUserType("Customer", "Admin"), getOrderById);
router.post("/:id/cancel", requireUserType("Customer", "Admin"), cancelOrder);
router.post("/:id/refresh-otp", requireUserType("Customer"), refreshDeliveryOtp);
router.patch("/:id/notes", requireUserType("Customer", "Admin"), updateOrderNotes);

export default router;
