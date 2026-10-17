import { Request, Response } from 'express';
import Seller from '../../../models/Seller';
import Delivery from '../../../models/Delivery';
import { sendSignupOtp, verifySignupOtp } from '../../../services/otpService';
import { issueSignupProof } from '../../../services/signupService';
import { asyncHandler } from '../../../utils/asyncHandler';

export function signupOtpHandlers(role: 'Seller' | 'Delivery') {
  return {
    send: asyncHandler(async (req: Request, res: Response) => {
      const { mobile } = req.body;
      if (typeof mobile !== 'string' || !/^[6-9]\d{9}$/.test(mobile)) {
        return res.status(400).json({ success: false, message: 'Valid 10-digit mobile number is required' });
      }
      const Model = role === 'Seller' ? Seller : Delivery;
      if (await (Model as any).exists({ mobile })) {
        return res.status(409).json({ success: false, message: 'This mobile number is already registered. Please log in.' });
      }
      const result = await sendSignupOtp(mobile, role);
      return res.json(result);
    }),
    verify: asyncHandler(async (req: Request, res: Response) => {
      const { mobile, otp, sessionId } = req.body;
      if (typeof mobile !== 'string' || !/^[6-9]\d{9}$/.test(mobile) ||
          typeof otp !== 'string' || !/^\d{4}$/.test(otp) || typeof sessionId !== 'string' || !sessionId) {
        return res.status(400).json({ success: false, message: 'Mobile, 4-digit OTP and session ID are required' });
      }
      if (!await verifySignupOtp(mobile, otp, role, sessionId)) {
        return res.status(401).json({ success: false, message: 'Invalid or expired OTP. Please request a new code.' });
      }
      return res.json({ success: true, data: { registrationToken: await issueSignupProof(mobile, role) } });
    }),
  };
}
