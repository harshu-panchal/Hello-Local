import { Router } from "express";
import * as customerController from "../modules/customer/controllers/customerController";
import { authenticate, requireUserType } from "../middleware/auth";

const router = Router();

// Protect all customer routes: require both authentication and Customer userType
router.use(authenticate, requireUserType("Customer"));

// Get customer profile (protected route)
router.get("/profile", customerController.getProfile);

// Update customer profile (protected route)
router.put("/profile", customerController.updateProfile);

// Update customer location (protected route)
router.post("/location", customerController.updateLocation);

// Get customer location (protected route)
router.get("/location", customerController.getLocation);

export default router;
