import api, { removeAuthToken } from '../config';
import { setSession } from '../session';
const handleApiError = (error: any) => {
  // Preserve HTTP status, response and friendly network messages for the UI.
  throw error;
};

export interface SendOTPResponse {
  success: boolean;
  message: string;
  sessionId?: string;
}

export interface VerifyOTPResponse {
  success: boolean;
  message: string;
  data: {
    token: string;
    user: {
      id: string;
      name: string;
      mobile: string;
      email: string;
      city: string;
      status: string;
    };
  };
}

export interface RegisterData {
  registrationToken: string;
  name: string;
  mobile: string;
  email: string;
  dateOfBirth?: string;
  password: string;
  address: string;
  city: string;
  pincode?: string;
  accountName?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  bonusType?: string;
  drivingLicense?: string;
  nationalIdentityCard?: string;
}

export interface RegisterResponse {
  success: boolean;
  message: string;
  data?: {
    token?: string;
    user?: {
      id: string;
      name: string;
      mobile: string;
      email: string;
      city: string;
      status: string;
    };
  };
}

// Send SMS OTP
export const sendOTP = async (mobile: string): Promise<SendOTPResponse> => {
  try {
    const response = await api.post('/auth/delivery/send-sms-otp', { mobile });
    return response.data;
  } catch (error) {
    return handleApiError(error);
  }
};

// Verify SMS OTP
export const verifyOTP = async (
  mobile: string,
  otp: string,
  sessionId?: string
): Promise<VerifyOTPResponse> => {
  try {
    const response = await api.post('/auth/delivery/verify-sms-otp', {
      mobile,
      otp,
      sessionId,
    });

    if (response.data.success && response.data.data?.token) {
      setSession(response.data.data.token, { ...response.data.data.user, userType: 'Delivery' }, 'delivery');
    }

    return response.data;
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * Register new delivery partner
 */
export const register = async (data: RegisterData): Promise<RegisterResponse> => {
  try {
    const response = await api.post<RegisterResponse>('/auth/delivery/register', data);
    return response.data;
  } catch (error) {
    return handleApiError(error);
  }
};

export const sendSignupOTP = async (mobile: string): Promise<{ success: boolean; sessionId: string; message?: string }> => {
  const response = await api.post('/auth/delivery/send-signup-otp', { mobile });
  return response.data;
};
export const verifySignupOTP = async (mobile: string, otp: string, sessionId: string): Promise<{ success: boolean; data: { registrationToken: string } }> => {
  const response = await api.post('/auth/delivery/verify-signup-otp', { mobile, otp, sessionId });
  return response.data;
};

/**
 * Logout delivery partner
 */
export const logout = (): void => {
  removeAuthToken();
};

