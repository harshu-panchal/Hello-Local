import { Router } from "express";
import {
  getOrders,
  getOrderById,
  updateOrderStatus,
} from "../modules/seller/controllers/orderController";
import {
  getPOSProducts,
  createOfflineSale,
  cancelOfflineSale,
  getSellerBills,
  getBillById,
} from "../modules/seller/controllers/posController";
import { authenticate, requireUserType } from "../middleware/auth";

const router = Router();

// All routes require authentication and seller user type
router.use(authenticate);
router.use(requireUserType("Seller"));

// POS Product Search for Barcode/Cashier billing
router.get("/pos/products", getPOSProducts);

// Create Offline Sale & Generate Bill
router.post("/offline", createOfflineSale);

// Cancel Offline Sale & Restore Stock
router.post("/offline/:id/cancel", cancelOfflineSale);

// Get Seller Bills & Invoices
router.get("/bills", getSellerBills);

// Get Specific Bill Details
router.get("/bills/:id", getBillById);

// Get seller's orders with filters
router.get("/", getOrders);

// Get order by ID
router.get("/:id", getOrderById);

// Update order status
router.patch("/:id/status", updateOrderStatus);

export default router;
