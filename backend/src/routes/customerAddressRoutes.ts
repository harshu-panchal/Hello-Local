import { Router } from "express";
import { addAddress, getMyAddresses, updateAddress, deleteAddress } from "../modules/customer/controllers/customerAddressController";
import { authenticate, requireUserType } from "../middleware/auth";

const router = Router();

router.use(authenticate, requireUserType("Customer"));

router.post("/", addAddress);
router.get("/", getMyAddresses);
router.put("/:id", updateAddress);
router.delete("/:id", deleteAddress);

export default router;
