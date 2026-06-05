import { Router } from "express";
import * as sellerAuthController from "../modules/seller/controllers/sellerAuthController";
import * as sellerNotificationController from "../modules/seller/controllers/sellerNotificationController";
import { otpRateLimiter, loginRateLimiter } from "../middleware/rateLimiter";
import { authenticate } from "../middleware/auth";

const router = Router();

// Send OTP route
router.post("/send-otp", otpRateLimiter, sellerAuthController.sendOTP);

// Verify OTP and login route
router.post("/verify-otp", loginRateLimiter, sellerAuthController.verifyOTP);

// Register route
router.post("/register", sellerAuthController.register);

// Check existence route
router.get("/check-existence", sellerAuthController.checkExistence);

// Profile routes (protected)
router.get("/profile", authenticate, sellerAuthController.getProfile);
router.put("/profile", authenticate, sellerAuthController.updateProfile);
router.put("/toggle-shop-status", authenticate, sellerAuthController.toggleShopStatus);

// Notification routes (protected)
router.get("/notifications", authenticate, sellerNotificationController.getNotifications);
router.patch("/notifications/read-all", authenticate, sellerNotificationController.markAllAsRead);
router.patch("/notifications/:id/read", authenticate, sellerNotificationController.markAsRead);

export default router;
