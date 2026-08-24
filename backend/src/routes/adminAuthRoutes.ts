import { Router } from "express";
import * as adminAuthController from "../modules/admin/controllers/adminAuthController";
import { otpRateLimiter, loginRateLimiter } from "../middleware/rateLimiter";

const router = Router();

// Send OTP route
router.post("/send-otp", otpRateLimiter, adminAuthController.sendOTP);

// Verify OTP and login route
router.post("/verify-otp", loginRateLimiter, adminAuthController.verifyOTP);

// The public admin existence lookup has been removed: there is no public admin
// signup, so it only enabled enumeration of admin accounts. The system-user
// screen now uses GET /admin/system-users/check-existence (Super Admin). (#M-05)

export default router;
