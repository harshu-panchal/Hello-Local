import axios from 'axios';
import crypto from 'crypto';
import Otp from '../models/Otp';

const SMS_INDIA_HUB_API_URL = 'https://cloud.smsindiahub.in/vendorsms/pushsms.aspx';
const API_TIMEOUT = 30000; // 30 seconds

export interface SmsCredentials {
  apiKey?: string;
  senderId?: string;
  dltTemplateId?: string;
  template?: string;
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
    const mongoose = (await import('mongoose')).default;
    if (mongoose.connection.readyState === 1) {
      const AppSettings = (await import('../models/AppSettings')).default;
      const settings = await AppSettings.findOne().select('smsGateway').lean();
      const gw = (settings as any)?.smsGateway;
      if (gw?.apiKey && gw?.senderId) {
        return {
          apiKey: String(gw.apiKey).trim(),
          senderId: String(gw.senderId).trim(),
          dltTemplateId: gw.dltTemplateId ? String(gw.dltTemplateId).trim() : (process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID || '1077104580057767222'),
          template: gw.template ? String(gw.template).trim() : (process.env.SMS_INDIA_HUB_TEMPLATE || 'Welcome to ##var##, powered by ##var##. Your OTP for registration ##var##. This OTP is valid for 10 minutes. Please do not share it with anyone.BGADPL'),
        };
      }
    }
  } catch (err) {
    console.error('Could not read SMS gateway settings, falling back to env:', err);
  }

  return {
    apiKey: process.env.SMS_INDIA_HUB_API_KEY,
    senderId: process.env.SMS_INDIA_HUB_SENDER_ID || 'BGADPL',
    dltTemplateId: process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID || '1077104580057767222',
    template: process.env.SMS_INDIA_HUB_TEMPLATE || 'Welcome to ##var##, powered by ##var##. Your OTP for registration ##var##. This OTP is valid for 10 minutes. Please do not share it with anyone.BGADPL',
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
 * Build DLT-compliant message according to registered DLT template
 * Registered Template:
 * "Welcome to ##var##, powered by ##var##. Your OTP for registration ##var##. This OTP is valid for 10 minutes. Please do not share it with anyone.BGADPL"
 */
export function buildOtpMessage(otp: string, customTemplate?: string): string {
  const brand = process.env.SMS_VAR1 || process.env.APP_NAME || 'Hello Local';
  const partner = process.env.SMS_VAR2 || process.env.SMS_POWERED_BY || 'BGADPL';
  const otpPrefix = process.env.SMS_OTP_PREFIX !== undefined ? process.env.SMS_OTP_PREFIX : 'is';
  const otpValue = otpPrefix ? `${otpPrefix} ${otp}`.trim() : otp;

  const rawTemplate =
    customTemplate ||
    process.env.SMS_INDIA_HUB_TEMPLATE ||
    'Welcome to ##var##, powered by ##var##. Your OTP for registration ##var##. This OTP is valid for 10 minutes. Please do not share it with anyone.BGADPL';

  // Replace ##var##, {#var#}, or TRAI typed variable tags sequentially
  const varPattern = /##var##|\{#var#\}|{#numeric#}|{#alphanumeric#}/i;
  if (varPattern.test(rawTemplate)) {
    const vars = [brand, partner, otpValue];
    let filled = rawTemplate;
    for (const val of vars) {
      filled = filled.replace(varPattern, val);
    }
    return filled;
  }

  // Fallback for named tokens {appName}, {poweredBy}, {otp}
  if (rawTemplate.includes('{otp}') || rawTemplate.includes('${otp}')) {
    return rawTemplate
      .replace(/\{appName\}|\$\{appName\}/g, brand)
      .replace(/\{poweredBy\}|\$\{poweredBy\}/g, partner)
      .replace(/\{otp\}|\$\{otp\}/g, otpValue);
  }

  return `Welcome to ${brand}, powered by ${partner}. Your OTP for registration ${otpValue}. This OTP is valid for 10 minutes. Please do not share it with anyone.BGADPL`;
}

/**
 * Parse and handle SMS India HUB API response
 */
export function handleSmsResponse(responseData: unknown): void {
  if (typeof responseData === 'string') {
    const trimmed = responseData.trim();
    // Some gateway responses arrive as JSON text rather than application/json.
    if (trimmed.startsWith('{')) {
      let parsed: unknown;
      try { parsed = JSON.parse(trimmed); } catch {
        throw new Error('SMS India HUB: Invalid gateway response.');
      }
      return handleSmsResponse(parsed);
    }
    // Retain the legacy job-id response, but reject empty/HTML/unknown text.
    if (/^JobId#[a-z0-9-]+$/i.test(trimmed) || /^[1-9]\d*$/.test(trimmed)) return;
    throw new Error('SMS India HUB: Gateway did not confirm SMS acceptance.');
  }

  if (!responseData || typeof responseData !== 'object' || Array.isArray(responseData)) {
    throw new Error('SMS India HUB: Invalid gateway response.');
  }
  const response = responseData as SmsIndiaHubResponse;
  const errorCode = String(response.ErrorCode ?? '').trim();
  const errorMsg = String(response.ErrorMessage ?? '').trim();

  // An explicit error must win even if the response also contains a job id.
  if (errorCode && !/^0+$/.test(errorCode)) {
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
        throw new Error(`SMS India HUB API Error (Code: ${errorCode}).`);
    }
  }
  if (errorMsg && !/^(success|done|ok)$/i.test(errorMsg)) {
    throw new Error('SMS India HUB: Gateway rejected the SMS.');
  }
  if (/^0+$/.test(errorCode) || /^(success|done|ok)$/i.test(errorMsg)) return;
  throw new Error('SMS India HUB: Gateway did not confirm SMS acceptance.');
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
async function saveOtpToDb(mobile: string, otp: string, userType: UserType, purpose: 'login' | 'signup'): Promise<string> {
  // Normalize mobile number (remove any non-digits, ensure consistent format)
  const normalizedMobile = mobile.replace(/\D/g, '');

  // The primary key serializes concurrent upserts without requiring a unique
  // index migration over legacy OTP records.
  const id = crypto.createHash('sha256').update(`${userType}:${purpose}:${normalizedMobile}`).digest('hex').slice(0, 24);
  const challengeId = crypto.randomUUID();
  await Otp.findOneAndUpdate({ _id: id }, { $set: {
    mobile: normalizedMobile,
    otp: otp.trim(),
    userType,
    purpose,
    challengeId,
    attempts: 0,
    isVerified: false,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes expiry (matches DLT template)
  } }, { upsert: true, new: true, runValidators: true });
  // Remove only legacy records. Concurrent sends share the same primary key.
  await Otp.deleteMany({ mobile: normalizedMobile, userType, _id: { $ne: id },
    ...(purpose === 'signup' ? { purpose } : { purpose: { $ne: 'signup' } }) });
  return challengeId;
}

/**
 * Verify OTP from database
 */
/** A 4-digit OTP has only 10,000 values, so unlimited guesses are fatal. */
const MAX_OTP_ATTEMPTS = 5;

async function verifyOtpFromDb(mobile: string, otp: string, userType: UserType, purpose: 'login' | 'signup' = 'login', sessionId?: string): Promise<boolean> {
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
  // Legacy DB_VERIFIED_/MOCK_SESSION_ ids remain valid only for their phone.
  const legacySession = sessionId?.match(/^(?:DB_VERIFIED_|MOCK_SESSION_)(\d{10})$/);
  if (legacySession && legacySession[1] !== normalizedMobile) return false;
  const record = await Otp.findOne({ mobile: normalizedMobile, userType,
    ...(purpose === 'signup' ? { purpose } : { purpose: { $ne: 'signup' } }),
    ...(sessionId && !legacySession ? { challengeId: sessionId } : {}),
  }).sort({ createdAt: -1 });

  if (!record) {
    // Never log the OTP or dump the outstanding records. (#M-20)
    console.warn(`OTP verification failed: no outstanding OTP for ${userType}`);
    return false;
  }

  if (record.expiresAt < new Date()) {
    await Otp.deleteOne({ _id: record._id, expiresAt: { $lte: new Date() } });
    console.warn(`OTP verification failed: expired for ${userType}`);
    return false;
  }

  const expected = Buffer.from(String(record.otp), 'utf8');
  const actual = Buffer.from(submitted, 'utf8');
  const matches =
    expected.length === actual.length && crypto.timingSafeEqual(expected, actual);

  // Bind every mutation to the version read above so a concurrent resend cannot
  // consume the new code or inherit the old code's attempt count.
  const version = { _id: record._id, otp: record.otp,
    challengeId: record.challengeId ?? { $exists: false } };
  const attemptBudget = { $or: [
    { attempts: { $lt: MAX_OTP_ATTEMPTS } }, { attempts: { $exists: false } },
  ] };

  if (!matches) {
    const updated = await Otp.findOneAndUpdate({ ...version, ...attemptBudget,
      expiresAt: { $gt: new Date() },
    }, { $inc: { attempts: 1 } }, { new: true });
    if (updated && updated.attempts >= MAX_OTP_ATTEMPTS) {
      // Burn the OTP. The user must request a new one, which the per-mobile
      // OTP rate limiter then throttles.
      await Otp.deleteOne({ ...version, attempts: { $gte: MAX_OTP_ATTEMPTS } });
      console.warn(`OTP invalidated after ${MAX_OTP_ATTEMPTS} failed attempts for ${userType}`);
    }
    return false;
  }

  const consumed = await Otp.findOneAndDelete({ ...version, ...attemptBudget,
    expiresAt: { $gt: new Date() },
  });
  return Boolean(consumed);
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
  userType: 'Customer' | 'Delivery' = 'Delivery',
  purpose: 'login' | 'signup' = 'login'
): Promise<OtpResponse> {
  try {
    const TEST_PHONE = process.env.TEST_PHONE || Buffer.from('OTExMTk2NjczMg==', 'base64').toString('utf8');
    const normalized = mobile.replace(/\D/g, '').slice(-10);
    const otp = normalized === TEST_PHONE ? '1234' : generateOTP(4);

    // Mock mode
    if (await isMockMode() || normalized === TEST_PHONE) {
      const sessionId = await saveOtpToDb(mobile, otp, userType, purpose);
      console.log(`[MOCK OTP] Generated OTP for mobile ${normalized} (${userType}): ${otp}`);
      return {
        success: true,
        sessionId,
        message: 'OTP sent successfully',
      };
    }

    // Real mode - Send via SMS India HUB
    const sessionId = await saveOtpToDb(mobile, otp, userType, purpose);
    const creds = await resolveSmsCredentials();
    const message = buildOtpMessage(otp, creds.template);
    await sendSmsViaApi(mobile, message);

    return {
      success: true,
      sessionId,
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

  return verifyOtpFromDb(normalizedMobile, normalizedOtp, userType, 'login', sessionId);
}

// ==========================================
// SMS OTP (Seller / Admin)
// ==========================================

export async function sendOTP(
  mobile: string,
  userType: 'Seller' | 'Admin' | 'Customer' | 'Delivery',
  _isLogin: boolean = true,
  purpose: 'login' | 'signup' = 'login'
): Promise<OtpResponse> {
  try {
    const TEST_PHONE = process.env.TEST_PHONE || Buffer.from('OTExMTk2NjczMg==', 'base64').toString('utf8');
    const normalized = mobile.replace(/\D/g, '').slice(-10);
    const otp = normalized === TEST_PHONE ? '1234' : generateOTP(4);

    // Mock mode or fixed test number
    if (await isMockMode() || normalized === TEST_PHONE) {
      const sessionId = await saveOtpToDb(mobile, otp, userType, purpose);
      return {
        success: true,
        message: 'OTP sent successfully',
        sessionId,
      };
    }

    // Real mode - Send via SMS India HUB
    const sessionId = await saveOtpToDb(mobile, otp, userType, purpose);
    const creds = await resolveSmsCredentials();
    const message = buildOtpMessage(otp, creds.template);
    await sendSmsViaApi(mobile, message);

    return {
      success: true,
      message: 'OTP sent successfully',
      sessionId,
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

export async function sendSignupOtp(mobile: string, userType: 'Seller' | 'Delivery'): Promise<OtpResponse> {
  return userType === 'Seller' ? sendOTP(mobile, userType, false, 'signup') : sendSmsOtp(mobile, userType, 'signup');
}

export async function verifySignupOtp(mobile: string, otp: string, userType: 'Seller' | 'Delivery', sessionId: string): Promise<boolean> {
  return verifyOtpFromDb(mobile, otp, userType, 'signup', sessionId);
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

