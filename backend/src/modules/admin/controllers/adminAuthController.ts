import { Request, Response } from "express";
import Admin from "../../../models/Admin";
import {
  sendOTP as sendOTPService,
  verifyOTP as verifyOTPService,
} from "../../../services/otpService";
import { generateToken } from "../../../services/jwtService";
import { asyncHandler } from "../../../utils/asyncHandler";

/**
 * Send OTP to admin mobile number
 */
export const sendOTP = asyncHandler(async (req: Request, res: Response) => {
  const { mobile } = req.body;

  if (!mobile || !/^[0-9]{10}$/.test(mobile)) {
    return res.status(400).json({
      success: false,
      message: "Valid 10-digit mobile number is required",
    });
  }

  // Look the admin up, but do NOT reveal whether one exists: a distinct 404
  // let anyone enumerate valid admin mobile numbers. The response is identical
  // either way and an OTP is only actually dispatched to a real account. (#M-03)
  const admin = await Admin.findOne({ mobile });

  const GENERIC = "If an account exists for this number, an OTP has been sent.";

  if (!admin || admin.status !== "Active") {
    return res.status(200).json({ success: true, message: GENERIC });
  }

  await sendOTPService(mobile, "Admin", true);

  return res.status(200).json({ success: true, message: GENERIC });
});

/**
 * Verify OTP and login admin
 */
export const verifyOTP = asyncHandler(async (req: Request, res: Response) => {
  const { mobile, otp } = req.body;

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

  // Verify OTP
  const isValid = await verifyOTPService(mobile, otp, "Admin");
  if (!isValid) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired OTP",
    });
  }

  // Find admin
  const admin = await Admin.findOne({ mobile }).select("-password");

  if (!admin) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired OTP",
    });
  }

  // A suspended admin holds a valid record but must not receive a token. (#H-17)
  if (admin.status !== "Active") {
    return res.status(403).json({
      success: false,
      message: "This admin account has been deactivated. Contact a Super Admin.",
    });
  }

  // Generate JWT token
  const token = generateToken(admin._id.toString(), "Admin", admin.role);

  return res.status(200).json({
    success: true,
    message: "Login successful",
    data: {
      token,
      user: {
        id: admin._id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        mobile: admin.mobile,
        email: admin.email,
        role: admin.role,
      },
    },
  });
});

/**
 * Admin existence lookup.
 *
 * There is no public admin signup, so this endpoint had no legitimate caller
 * and served only to enumerate admin accounts. It now requires an authenticated
 * Super Admin (enforced on the route) and is used by the system-user screen to
 * warn about duplicates before submitting. (#M-05)
 */
export const checkExistence = asyncHandler(async (req: Request, res: Response) => {
  const { mobile, email } = req.query;

  if (!mobile && !email) {
    return res.status(400).json({
      success: false,
      message: "Mobile or email is required",
    });
  }

  const or: any[] = [];
  if (mobile) or.push({ mobile });
  if (email) or.push({ email });

  const exists = await Admin.exists({ $or: or });

  return res.status(200).json({ success: true, exists: Boolean(exists) });
});
