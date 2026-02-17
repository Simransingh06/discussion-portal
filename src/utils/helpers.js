// src/utils/helpers.js
// ─────────────────────────────────────────────────────────
// Shared utility functions used across controllers
// ─────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const ActivityLog = require('../models/ActivityLog');

// ── JWT helpers ──────────────────────────────────────────

/**
 * Generate access token (short-lived, ~15min in production)
 * We use 7d here for convenience during dev — tighten in prod
 */
const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user.id, role: user.role, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// ── Slug helper ──────────────────────────────────────────

/**
 * Convert a title to a URL-safe slug
 * "Hello World! #1" → "hello-world-1-a3f7"
 * The random suffix prevents collisions for similar titles
 */
const slugify = (text) => {
  const base = text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')   // Remove non-word chars
    .replace(/[\s_-]+/g, '-')   // Spaces and underscores → hyphens
    .replace(/^-+|-+$/g, '');   // Trim leading/trailing hyphens

  const suffix = Math.random().toString(36).substring(2, 6);
  return `${base}-${suffix}`;
};

// ── Password helpers ─────────────────────────────────────

const hashPassword = (password) => bcrypt.hash(password, 12);
const comparePassword = (plain, hash) => bcrypt.compare(plain, hash);

// ── Pagination helper ────────────────────────────────────

/**
 * Parse and validate pagination query params
 * Returns safe values with defaults
 */
const getPagination = (query) => {
  const page  = Math.max(1, parseInt(query.page)  || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

/**
 * Format paginated response
 */
const paginatedResponse = (data, total, page, limit) => ({
  data,
  pagination: {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrev: page > 1,
  },
});

// ── Activity logger ──────────────────────────────────────

/**
 * Log user activity asynchronously (fire and forget)
 * Errors are swallowed — logging failures shouldn't break the app
 */
const logActivity = (userId, action, resource = null, metadata = {}, req = null) => {
  ActivityLog.create({
    userId,
    action,
    resource,
    metadata,
    ipAddress: req?.ip,
    userAgent: req?.headers['user-agent'],
  }).catch(err => console.error('Activity log error:', err.message));
};

// ── Response helpers ─────────────────────────────────────

const successResponse = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({ success: true, message, ...data });
};

const errorResponse = (res, message, statusCode = 400) => {
  return res.status(statusCode).json({ success: false, message });
};

module.exports = {
  generateAccessToken,
  slugify,
  hashPassword,
  comparePassword,
  getPagination,
  paginatedResponse,
  logActivity,
  successResponse,
  errorResponse,
};
