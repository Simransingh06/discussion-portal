// src/middleware/rateLimiter.js
// ─────────────────────────────────────────────────────────
// Rate limiting to prevent abuse and DDoS
// Different limits for different route types
// ─────────────────────────────────────────────────────────
const rateLimit = require('express-rate-limit');

// Standard API limiter — 100 requests per 15 minutes
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,  // Return rate limit info in headers
  legacyHeaders:   false,
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
  },
});

// Strict limiter for auth routes (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 10,                     // Only 10 login attempts per window
  message: {
    success: false,
    message: 'Too many login attempts. Please try again in 15 minutes.',
  },
});

// More lenient for read-heavy endpoints
const readLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 200,             // 200 reads/min (views, searches)
  message: {
    success: false,
    message: 'Too many requests.',
  },
});

module.exports = { apiLimiter, authLimiter, readLimiter };
