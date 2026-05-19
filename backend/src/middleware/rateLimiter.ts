import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Rate limiter for OTP requests.
 * Production: 5 requests per 15 minutes per mobile number.
 * Development: 50 requests per 15 minutes (relaxed for testing).
 */
export const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 50 : 5,
  message: {
    success: false,
    message: 'Too many OTP requests. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => req.method === 'OPTIONS',
  keyGenerator: (req: Request) => {
    // Key by mobile number for per-user limiting, fallback to IP
    if (req.body?.mobile) {
      return `otp:${req.body.mobile}`;
    }
    return `otp:ip:${req.ip || 'unknown'}`;
  },
});

/**
 * Rate limiter for login/auth attempts.
 * Production: 10 attempts per 15 minutes per IP.
 * Development: 100 attempts per 15 minutes (relaxed for testing).
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 100 : 10,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => req.method === 'OPTIONS',
});

/**
 * General API rate limiter — broad protection against abuse.
 * Production: 200 requests per minute per IP.
 * Development: unlimited.
 */
export const generalRateLimiter = isDev
  ? (_req: Request, _res: Response, next: NextFunction) => next()
  : rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 200,
      message: {
        success: false,
        message: 'Too many requests. Please slow down.',
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req: Request) => req.method === 'OPTIONS',
    });


