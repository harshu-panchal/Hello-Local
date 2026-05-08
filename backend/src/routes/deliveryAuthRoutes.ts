import { Router } from "express";
import * as deliveryAuthController from "../modules/delivery/controllers/deliveryAuthController";
import { otpRateLimiter, loginRateLimiter } from "../middleware/rateLimiter";

const router = Router();


// Send SMS OTP route
router.post("/send-sms-otp", otpRateLimiter, deliveryAuthController.sendSmsOtp);

// Verify SMS OTP and login route
router.post("/verify-sms-otp", loginRateLimiter, deliveryAuthController.verifySmsOtp);

// Register route
router.post("/register", deliveryAuthController.register);

// Check existence route (Support both correct spelling and common misspelling)
router.get("/check-existence", deliveryAuthController.checkExistence);
router.get("/check-existance", deliveryAuthController.checkExistence);




export default router;
