// src/middleware/validate.js
// ─────────────────────────────────────────────────────────
// Request validation using Joi schema library
//
// WHY VALIDATE AT THE MIDDLEWARE LEVEL?
// • Reject bad requests before they hit DB (saves resources)
// • Centralized validation = no duplication across controllers
// • Clear, schema-based rules = easy to audit and update
// ─────────────────────────────────────────────────────────
const Joi = require('joi');

/**
 * validate(schema) — middleware factory
 * Creates a middleware that validates req.body against a Joi schema
 *
 * @param {Joi.Schema} schema
 */
const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,    // Return all errors, not just the first
    stripUnknown: true,   // Remove unexpected fields (security!)
  });

  if (error) {
    const errors = error.details.map(d => ({
      field: d.path.join('.'),
      message: d.message.replace(/['"]/g, ''),
    }));
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  // Replace req.body with validated + sanitized value
  req.body = value;
  next();
};

// ── Schemas ──────────────────────────────────────────────

const schemas = {
  // Auth
  register: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    email:    Joi.string().email().required(),
    password: Joi.string().min(8).max(100).required()
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .message('Password must contain uppercase, lowercase, and a number'),
    bio:      Joi.string().max(500).optional(),
  }),

  login: Joi.object({
    email:    Joi.string().email().required(),
    password: Joi.string().required(),
  }),

  // Categories
  createCategory: Joi.object({
    name:        Joi.string().min(3).max(100).required(),
    description: Joi.string().max(500).optional(),
  }),

  // Threads
  createThread: Joi.object({
    title:      Joi.string().min(5).max(500).required(),
    content:    Joi.string().min(10).max(50000).required(),
    categoryId: Joi.string().uuid().required(),
    tags:       Joi.array().items(Joi.string().max(30)).max(5).optional(),
  }),

  updateThread: Joi.object({
    title:   Joi.string().min(5).max(500).optional(),
    content: Joi.string().min(10).max(50000).optional(),
    tags:    Joi.array().items(Joi.string().max(30)).max(5).optional(),
  }).min(1),  // At least one field required

  // Comments
  createComment: Joi.object({
    content:         Joi.string().min(1).max(5000).required(),
    parentCommentId: Joi.string().optional().allow(null),
  }),

  updateComment: Joi.object({
    content: Joi.string().min(1).max(5000).required(),
  }),

  // User management (admin)
  banUser: Joi.object({
    reason:    Joi.string().min(5).max(500).required(),
    expiresAt: Joi.date().greater('now').optional().allow(null),
  }),

  changeRole: Joi.object({
    role: Joi.string().valid('user', 'moderator', 'admin').required(),
  }),

  updateProfile: Joi.object({
    bio:      Joi.string().max(500).optional().allow(''),
    username: Joi.string().alphanum().min(3).max(30).optional(),
  }).min(1),
};

// Export both the factory and schemas
module.exports = { validate, schemas };
