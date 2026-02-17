// src/middleware/errorHandler.js
// ─────────────────────────────────────────────────────────
// Global error handling middleware
// Express catches errors passed via next(err)
// This catches them all in one place
// ─────────────────────────────────────────────────────────
const logger = require('../config/logger');

/**
 * Custom error class for known API errors
 * throw new AppError('Not found', 404) anywhere in the app
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;  // Distinguishes from programming errors
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error handler — must be registered LAST in Express
 * Receives errors via next(err)
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // ── Handle known error types ──────────────────────────

  // PostgreSQL unique violation
  if (err.code === '23505') {
    statusCode = 409;
    message = 'Resource already exists.';
  }

  // PostgreSQL foreign key violation
  if (err.code === '23503') {
    statusCode = 400;
    message = 'Referenced resource not found.';
  }

  // PostgreSQL check constraint violation
  if (err.code === '23514') {
    statusCode = 400;
    message = 'Invalid data provided.';
  }

  // MongoDB validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map(e => e.message).join(', ');
  }

  // MongoDB cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format.';
  }

  // JWT errors (shouldn't reach here but just in case)
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token.';
  }

  // Log server errors (not client errors)
  if (statusCode >= 500) {
    logger.error(`[${req.method}] ${req.path} → ${statusCode}: ${err.message}`, {
      stack: err.stack,
      body: req.body,
    });
  }

  res.status(statusCode).json({
    success: false,
    message,
    // Only show stack trace in development
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

/**
 * asyncHandler — wraps async route handlers to auto-catch errors
 * Avoids try/catch in every controller
 *
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { errorHandler, AppError, asyncHandler };
