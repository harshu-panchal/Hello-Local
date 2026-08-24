import api, { setAuthToken, removeAuthToken } from '../config';
import { setStoredUser } from '../session';

export interface SendOTPResponse {
  success: boolean;
  message: string;
}

export interface VerifyOTPResponse {
  success: boolean;
  message: string;
  data: {
    token: string;
    user: {
      id: string;
      firstName: string;
      lastName: string;
      mobile: string;
      email: string;
      role: string;
    };
  };
}

/**
 * Send OTP to admin mobile number
 */
export const sendOTP = async (mobile: string): Promise<SendOTPResponse> => {
  const response = await api.post<SendOTPResponse>('/auth/admin/send-otp', { mobile });
  return response.data;
};

/**
 * Verify OTP and login admin
 */
export const verifyOTP = async (mobile: string, otp: string): Promise<VerifyOTPResponse> => {
  const response = await api.post<VerifyOTPResponse>('/auth/admin/verify-otp', { mobile, otp });

  if (response.data.success && response.data.data.token) {
    setAuthToken(response.data.data.token);
    setStoredUser(response.data.data.user, 'admin');
  }

  return response.data;
};

/**
 * Logout admin
 */
export const logout = (): void => {
  removeAuthToken();
};

export interface AdminProfileResponse {
  success: boolean;
  message?: string;
  data: {
    _id: string;
    name: string;
    email: string;
    mobile: string;
    profileImage?: string;
    role: string;
  };
}


