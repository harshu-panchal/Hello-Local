import { Router } from "express";
import * as sellerAuthController from "../modules/seller/controllers/sellerAuthController";
import * as sellerNotificationController from "../modules/seller/controllers/sellerNotificationController";
import { otpRateLimiter, loginRateLimiter } from "../middleware/rateLimiter";
import { authenticate, requireUserType } from "../middleware/auth";
import { signupOtpHandlers } from '../modules/auth/controllers/onboardingController';

const router = Router();
const signup = signupOtpHandlers('Seller');
router.post('/send-signup-otp', otpRateLimiter, signup.send);
router.post('/verify-signup-otp', loginRateLimiter, signup.verify);

// Send OTP route
router.post("/send-otp", otpRateLimiter, sellerAuthController.sendOTP);

// Verify OTP and login route
router.post("/verify-otp", loginRateLimiter, sellerAuthController.verifyOTP);

// Register route
router.post("/register", loginRateLimiter, sellerAuthController.register);

// Check existence route
router.get("/check-existence", loginRateLimiter, sellerAuthController.checkExistence);

// Profile routes (protected)
router.get("/profile", authenticate, requireUserType('Seller'), sellerAuthController.getProfile);
router.put("/profile", authenticate, requireUserType('Seller'), sellerAuthController.updateProfile);
router.put("/toggle-shop-status", authenticate, requireUserType('Seller'), sellerAuthController.toggleShopStatus);

// Notification routes (protected)
router.get("/notifications", authenticate, requireUserType('Seller'), sellerNotificationController.getNotifications);
router.patch("/notifications/read-all", authenticate, requireUserType('Seller'), sellerNotificationController.markAllAsRead);
router.patch("/notifications/:id/read", authenticate, requireUserType('Seller'), sellerNotificationController.markAsRead);

export default router;
