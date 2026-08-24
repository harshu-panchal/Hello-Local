import { Request, Response } from "express";
import Delivery from "../../../models/Delivery";
import {
  sendSmsOtp as sendSmsOtpService,
  verifySmsOtp as verifySmsOtpService,
} from "../../../services/otpService";
import { generateToken } from "../../../services/jwtService";
import { asyncHandler } from "../../../utils/asyncHandler";
// import { uploadDocument } from "../../../services/uploadService"; // File does not exist

/**
 * Send SMS OTP to delivery mobile number
 */
export const sendSmsOtp = asyncHandler(async (req: Request, res: Response) => {
  const { mobile } = req.body;

  if (!mobile || !/^[0-9]{10}$/.test(mobile)) {
    return res.status(400).json({
      success: false,
      message: "Valid 10-digit mobile number is required",
    });
  }

  // Identical response whether or not the account exists, so the endpoint
  // cannot be used to enumerate registered couriers. A sessionId is always
  // returned so the client flow is unchanged. (#M-03)
  const GENERIC = "If an account exists for this number, an OTP has been sent.";
  // Check if delivery partner exists with this mobile
  const delivery = await Delivery.findOne({ mobile });

  if (!delivery) {
    return res.status(200).json({
      success: true,
      message: GENERIC,
      sessionId: `DB_VERIFIED_${mobile}`,
    });
  }

  const result = await sendSmsOtpService(mobile, "Delivery");

  return res.status(200).json({
    success: true,
    message: GENERIC,
    sessionId: result.sessionId,
  });
});

/**
 * Verify SMS OTP and login delivery partner
 */
export const verifySmsOtp = asyncHandler(
  async (req: Request, res: Response) => {
    const { mobile, otp, sessionId } = req.body;

    if (!mobile || !/^[0-9]{10}$/.test(mobile)) {
      return res.status(400).json({
        success: false,
        message: "Valid 10-digit mobile number is required",
      });
    }

    if (!otp || !/^[0-9]{4}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "Valid 4-digit OTP is required",
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Session ID is required",
      });
    }

    // Verify SMS OTP
    const isValid = await verifySmsOtpService(
      sessionId,
      otp,
      mobile,
      "Delivery",
    );

    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    // Find delivery partner. Accounts are only ever created through the register
    // flow (which starts them Inactive, pending admin approval); the
    // auto-provisioning backdoor for a hardcoded mobile has been removed. (#C-09)
    const delivery = await Delivery.findOne({ mobile }).select("-password");

    if (!delivery) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    // Inactive couriers are pending approval (or suspended) and must not
    // obtain a token — courier tokens can read orders and move COD money. (#H-17)
    if (delivery.status !== "Active") {
      return res.status(403).json({
        success: false,
        message:
          "Your delivery partner account is not active yet. Please wait for admin approval.",
      });
    }

    // Generate JWT token
    const token = generateToken(delivery._id.toString(), "Delivery");

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        token,
        user: {
          id: delivery._id,
          name: delivery.name,
          mobile: delivery.mobile,
          email: delivery.email,
          city: delivery.city,
          status: delivery.status,
        },
      },
    });
  },
);

/**
 * Register new delivery partner
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const {
    name,
    mobile,
    email,
    dateOfBirth,
    password,
    address,
    city,
    pincode,
    accountName,
    bankName,
    accountNumber,
    ifscCode,
    bonusType,
    drivingLicense,
    nationalIdentityCard,
  } = req.body;

  // Validation
  if (!name || !mobile || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "Name, mobile, email, and password are required",
    });
  }

  if (!/^[0-9]{10}$/.test(mobile)) {
    return res.status(400).json({
      success: false,
      message: "Valid 10-digit mobile number is required",
    });
  }

  console.log(`Registration attempt for: Mobile: ${mobile}, Email: ${email}`);

  // Check if delivery partner already exists
  const existingByMobile = await Delivery.findOne({ mobile });
  if (existingByMobile) {
    return res.status(409).json({
      success: false,
      message: "A delivery partner is already registered with this mobile number",
    });
  }

  const existingByEmail = await Delivery.findOne({ email });
  if (existingByEmail) {
    return res.status(409).json({
      success: false,
      message: "A delivery partner is already registered with this email address",
    });
  }

  // Create new delivery partner
  await Delivery.create({
    name,
    mobile,
    email,
    dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
    password,
    address,
    city,
    pincode,
    accountName,
    bankName,
    accountNumber,
    ifscCode,
    bonusType,
    drivingLicense,
    nationalIdentityCard,
    status: "Inactive", // New delivery partners start as Inactive
    balance: 0,
    cashCollected: 0,
  } as any);

  // Generate token (Optional: usually registration doesn't login immediately if approval needed, but for seamless UX we can)
  // However, FE Flow: Register -> OTP -> Login. So we return success, then FE calls sendSmsOtp.

  return res.status(201).json({
    success: true,
    message: "Delivery partner registered successfully.",
    // No token returned here, flow continues to OTP
  });
});

/**
 * Get current delivery partner profile
 */
export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  // @ts-ignore - req.user is added by middleware
  const userId = (req.user as any).userId;

  if (!userId) {
    return res
      .status(401)
      .json({ success: false, message: "User not authenticated" });
  }

  const delivery = await Delivery.findById(userId).select("-password");

  if (!delivery) {
    return res.status(404).json({
      success: false,
      message: "Delivery partner not found",
    });
  }

  return res.status(200).json({
    success: true,
    data: delivery,
  });
});

/**
 * Check if delivery partner already exists
 */
export const checkExistence = asyncHandler(async (req: Request, res: Response) => {
  console.log(`[DeliveryAuth] checkExistence called with:`, req.query);
  const { mobile, email } = req.query;

  if (!mobile && !email) {
    return res.status(400).json({
      success: false,
      message: "Mobile or email is required",
    });
  }

  const query: any = {};
  if (mobile) query.mobile = mobile;
  if (email) query.email = email;

  // Signup duplicate check. Returns a bare boolean and does not echo which
  // field matched, and the route is rate limited. (#M-05)
  const or: any[] = [];
  if (mobile) or.push({ mobile });
  if (email) or.push({ email });

  const exists = await Delivery.exists({ $or: or });

  return res.status(200).json({
    success: true,
    exists: Boolean(exists),
    message: exists
      ? "An account is already registered with these details"
      : undefined,
  });
});


