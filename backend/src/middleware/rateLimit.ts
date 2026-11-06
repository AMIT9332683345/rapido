import rateLimit from 'express-rate-limit';

const message = {
  error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down and retry shortly.' },
};

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Try again in 15 minutes.' },
  },
});

export const bookingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many ride requests. Please wait a moment.' },
  },
});

export const geoLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
});
