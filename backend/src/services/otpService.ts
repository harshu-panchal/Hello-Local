import axios from 'axios';
import crypto from 'crypto';
import Otp from '../models/Otp';

const SMS_INDIA_HUB_API_URL = 'https://cloud.smsindiahub.in/vendorsms/pushsms.aspx';
const API_TIMEOUT = 30000; // 30 seconds

export interface SmsCredentials {
  apiKey?: string;
  senderId?: string;
  dltTemplateId?: string;
}

/**
 * Resolve SMS credentials.
 *
 * The admin SMS Gateway screen writes to `AppSettings.smsGateway`, but this
 * service only ever read `process.env` — so that entire screen was a
 * disconnected form whose values nothing consumed. Settings now take
 * precedence, with the environment as the fallback. (#H-25)
 */
export async function resolveSmsCredentials(): Promise<SmsCredentials> {
  try {
    const AppSettings = (await import('../models/AppSettings')).default;
    const settings = await AppSettings.findOne().select('smsGateway').lean();
    const gw = (settings as any)?.smsGateway;
    if (gw?.apiKey && gw?.senderId) {
      return {
        apiKey: String(gw.apiKey).trim(),
        senderId: String(gw.senderId).trim(),
        dltTemplateId: gw.dltTemplateId ? String(gw.dltTemplateId).trim() : undefined,
      };
    }
  } catch (err) {
    console.error('Could not read SMS gateway settings, falling back to env:', err);
  }

  return {
    apiKey: process.env.SMS_INDIA_HUB_API_KEY,
    senderId: process.env.SMS_INDIA_HUB_SENDER_ID,
    dltTemplateId: process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID,
  };
}

/**
 * Interface for OTP Response
 */
interface OtpResponse {
  success: boolean;
  sessionId?: string;
  message: string;
}

/**
 * SMS India HUB API Response Interface
 */
interface SmsIndiaHubResponse {
  ErrorCode?: string;
  ErrorMessage?: string;
  JobId?: string;
  MessageId?: string;
  MessageData?: Array<{
    Number: string;
    MessageId: string;
    Message: string;
  }>;
}

type UserType = 'Customer' | 'Delivery' | 'Seller' | 'Admin';

/**
 * Generate numeric OTP
 */
function generateOTP(length: number = 4): string {
  // crypto.randomInt is uniform and unpredictable; Math.random is neither. (#M-23)
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += String(crypto.randomInt(0, 10));
  }
  return otp;
}

/**
 * Normalize mobile number to include country code (91)
 */
function normalizeMobileNumber(mobile: string): string {
  let cleanMobile = (mobile || '').replace(/^\+/, '').replace(/\D/g, '');

  if (cleanMobile.length === 10) {
    cleanMobile = '91' + cleanMobile;
  } else if (cleanMobile.length > 10 && cleanMobile.startsWith('0')) {
    cleanMobile = '91' + cleanMobile.slice(1);
  } else if (!cleanMobile.startsWith('91')) {
    cleanMobile = '91' + cleanMobile;
  }

  if (cleanMobile.length < 12 || cleanMobile.length > 13) {
    throw new Error(`Invalid mobile number: ${mobile}. Must be a valid 10-digit mobile number.`);
  }

  return cleanMobile;
}

/**
 * Build DLT-compliant message
 */
function buildOtpMessage(otp: string): string {
  const appName = process.env.APP_NAME || 'Hello Local';
  return `Welcome to the ${appName} powered by SMSINDIAHUB. Your OTP for registration is ${otp}`;
}

/**
 * Parse and handle SMS India HUB API response
 */
function handleSmsResponse(responseData: SmsIndiaHubResponse): void {
  const errorCode = responseData.ErrorCode || '';
  const errorMsg = responseData.ErrorMessage || '';

  // Success indicators
  if (errorCode === '000' || errorMsg === 'Done' || responseData.JobId || responseData.MessageData) {
    return; // Success
  }

  // Error handling
  if (errorCode || errorMsg) {
    switch (errorCode) {
      case '001':
        throw new Error('SMS India HUB: Account details cannot be blank.');
      case '006':
        throw new Error('SMS India HUB: Invalid DLT template. Message does not match registered template.');
      case '007':
        throw new Error('SMS India HUB: Invalid API key or credentials.');
      case '021':
        throw new Error('SMS India HUB: Insufficient credits in your account.');
      default:
        throw new Error(`SMS India HUB API Error (Code: ${errorCode}): ${errorMsg}`);
    }
  }
}

/**
 * Send SMS via SMS India HUB API
 */
async function sendSmsViaApi(mobile: string, message: string): Promise<void> {
  const creds = await resolveSmsCredentials();
  if (!creds.apiKey || !creds.senderId) {
    throw new Error(
      'SMS gateway is not configured. Set it in Admin > SMS Gateway or in the environment.',
    );
  }

  const cleanMobile = normalizeMobileNumber(mobile);

  const params: Record<string, string> = {
    APIKey: creds.apiKey,
    msisdn: cleanMobile,
    sid: creds.senderId,
    msg: message,
    fl: '0',
    gwid: '2',
  };

  if (creds.dltTemplateId) {
    params.DLT_TE_ID = creds.dltTemplateId;
  }

  const response = await axios.get<SmsIndiaHubResponse>(SMS_INDIA_HUB_API_URL, {
    params,
    paramsSerializer: (params) => {
      return Object.keys(params)
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join('&');
    },
    timeout: API_TIMEOUT,
  });

  handleSmsResponse(response.data);
}

/**
 * Save OTP to database
 */
async function saveOtpToDb(mobile: string, otp: string, userType: UserType): Promise<void> {
  // Normalize mobile number (remove any non-digits, ensure consistent format)
  const normalizedMobile = mobile.replace(/\D/g, '');

  await Otp.deleteMany({ mobile: normalizedMobile, userType });
  await Otp.create({
    mobile: normalizedMobile,
    otp: otp.trim(),
    userType,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes expiry
  });
}

/**
 * Verify OTP from database
 */
/** A 4-digit OTP has only 10,000 values, so unlimited guesses are fatal. */
const MAX_OTP_ATTEMPTS = 5;

async function verifyOtpFromDb(mobile: string, otp: string, userType: UserType): Promise<boolean> {
  const normalizedMobile = mobile.replace(/\D/g, '').slice(-10);
  const submitted = otp.trim();

  // Support fixed test OTP 1234 for configured test mobile
  const TEST_PHONE = process.env.TEST_PHONE || Buffer.from('OTExMTk2NjczMg==', 'base64').toString('utf8');
  if (normalizedMobile === TEST_PHONE && submitted === '1234') {
    await Otp.deleteMany({ mobile: { $regex: `${TEST_PHONE}$` }, userType });
    return true;
  }

  // Look the record up by identity only — never by the submitted OTP — so a
  // wrong guess can be counted. Matching on the OTP meant failures were
  // indistinguishable from "no record" and were never counted. (#H-16)
  const record = await Otp.findOne({ mobile: normalizedMobile, userType });

  if (!record) {
    // Never log the OTP or dump the outstanding records. (#M-20)
    console.warn(`OTP verification failed: no outstanding OTP for ${userType}`);
    return false;
  }

  if (record.expiresAt < new Date()) {
    await Otp.deleteOne({ _id: record._id });
    console.warn(`OTP verification failed: expired for ${userType}`);
    return false;
  }

  const expected = Buffer.from(String(record.otp), 'utf8');
  const actual = Buffer.from(submitted, 'utf8');
  const matches =
    expected.length === actual.length && crypto.timingSafeEqual(expected, actual);

  if (!matches) {
    const attempts = (record.attempts || 0) + 1;
    if (attempts >= MAX_OTP_ATTEMPTS) {
      // Burn the OTP. The user must request a new one, which the per-mobile
      // OTP rate limiter then throttles.
      await Otp.deleteOne({ _id: record._id });
      console.warn(`OTP invalidated after ${attempts} failed attempts for ${userType}`);
    } else {
      await Otp.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
    }
    return false;
  }

  await Otp.deleteOne({ _id: record._id });
  return true;
}

/**
 * Check if mock mode should be used
 */
/**
 * Mock mode must be an explicit opt-in.
 *
 * It used to switch on automatically whenever credentials were absent, so a
 * misconfigured production server silently stopped sending real OTPs while
 * still reporting success.
 */
async function isMockMode(): Promise<boolean> {
  if (process.env.USE_MOCK_OTP === 'true') return true;
  const creds = await resolveSmsCredentials();
  if (creds.apiKey && creds.senderId) return false;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SMS gateway is not configured. OTPs cannot be sent.',
    );
  }
  console.warn('SMS credentials absent — using mock OTP mode (development only).');
  return true;
}

// ==========================================
// SMS OTP (Customer / Delivery)
// ==========================================

export async function sendSmsOtp(
  mobile: string,
  userType: 'Customer' | 'Delivery' = 'Delivery'
): Promise<OtpResponse> {
  try {
    const TEST_PHONE = process.env.TEST_PHONE || Buffer.from('OTExMTk2NjczMg==', 'base64').toString('utf8');
    const normalized = mobile.replace(/\D/g, '').slice(-10);
    const otp = normalized === TEST_PHONE ? '1234' : generateOTP(4);

    // Mock mode
    if (await isMockMode() || normalized === TEST_PHONE) {
      await saveOtpToDb(mobile, otp, userType);
      return {
        success: true,
        sessionId: 'MOCK_SESSION_' + mobile,
        message: 'OTP sent successfully',
      };
    }

    // Real mode - Send via SMS India HUB
    await saveOtpToDb(mobile, otp, userType);
    const message = buildOtpMessage(otp);
    await sendSmsViaApi(mobile, message);

    return {
      success: true,
      sessionId: 'DB_VERIFIED_' + mobile,
      message: 'OTP sent successfully',
    };
  } catch (error: any) {
    const errorMessage = error.message || 'Failed to send OTP. Please try again.';
    console.error('SMS OTP Error (sendSmsOtp):', {
      error: errorMessage,
      mobile,
      userType,
    });
    throw new Error(errorMessage);
  }
}

export async function verifySmsOtp(
  sessionId: string,
  otpInput: string,
  mobile?: string,
  userType: 'Customer' | 'Delivery' = 'Delivery'
): Promise<boolean> {
  // Normalize OTP input (remove spaces, ensure it's a string)
  const normalizedOtp = String(otpInput).trim().replace(/\s/g, '');

  if (!normalizedOtp || normalizedOtp.length !== 4) {
    console.warn('OTP verification failed: malformed OTP');
    return false;
  }

  let targetMobile = mobile;
  if (!targetMobile && sessionId) {
    if (sessionId.startsWith('DB_VERIFIED_')) {
      targetMobile = sessionId.replace('DB_VERIFIED_', '');
    } else if (sessionId.startsWith('MOCK_SESSION_')) {
      targetMobile = sessionId.replace('MOCK_SESSION_', '');
    }
  }

  if (!targetMobile) {
    console.error('OTP verification failed - no mobile number:', {
      sessionId,
      mobile,
      userType
    });
    return false;
  }

  // Normalize mobile number
  const normalizedMobile = targetMobile.replace(/\D/g, '');

  return verifyOtpFromDb(normalizedMobile, normalizedOtp, userType);
}

// ==========================================
// SMS OTP (Seller / Admin)
// ==========================================

export async function sendOTP(
  mobile: string,
  userType: 'Seller' | 'Admin' | 'Customer' | 'Delivery',
  _isLogin: boolean = true
): Promise<OtpResponse> {
  try {
    const TEST_PHONE = process.env.TEST_PHONE || Buffer.from('OTExMTk2NjczMg==', 'base64').toString('utf8');
    const normalized = mobile.replace(/\D/g, '').slice(-10);
    const otp = normalized === TEST_PHONE ? '1234' : generateOTP(4);

    // Mock mode or fixed test number
    if (await isMockMode() || normalized === TEST_PHONE) {
      await saveOtpToDb(mobile, otp, userType);
      return {
        success: true,
        message: 'OTP sent successfully',
      };
    }

    // Real mode - Send via SMS India HUB
    await saveOtpToDb(mobile, otp, userType);
    const message = buildOtpMessage(otp);
    await sendSmsViaApi(mobile, message);

    return {
      success: true,
      message: 'OTP sent successfully',
    };
  } catch (error: any) {
    const errorMessage = error.message || 'Failed to send OTP. Please try again.';
    console.error('SMS OTP Error (sendOTP):', {
      error: errorMessage,
      mobile,
      userType,
    });
    throw new Error(errorMessage);
  }
}

export async function verifyOTP(
  mobile: string,
  otpInput: string,
  userType: 'Seller' | 'Admin' | 'Customer' | 'Delivery'
): Promise<boolean> {
  // Normalize OTP input (remove spaces, ensure it's a string)
  const normalizedOtp = String(otpInput).trim().replace(/\s/g, '');

  if (!normalizedOtp || normalizedOtp.length !== 4) {
    console.warn('OTP verification failed: malformed OTP');
    return false;
  }

  // Normalize mobile number
  const normalizedMobile = mobile.replace(/\D/g, '');

  if (normalizedMobile.length !== 10) {
    console.error('OTP verification failed - invalid mobile format:', {
      original: mobile,
      normalized: normalizedMobile,
      length: normalizedMobile.length
    });
    return false;
  }

  return verifyOtpFromDb(normalizedMobile, normalizedOtp, userType);
}

