// src/controllers/authController.js
// ─────────────────────────────────────────────────────────
// Handles: register, login, logout, me
// ─────────────────────────────────────────────────────────
const { query } = require('../config/postgres');
const {
  hashPassword, comparePassword,
  generateAccessToken, logActivity,
  successResponse, errorResponse,
} = require('../utils/helpers');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// ── POST /api/auth/register ──────────────────────────────
const register = asyncHandler(async (req, res) => {
  const { username, email, password, bio } = req.body;

  // Check for duplicates (handled by DB unique constraints too,
  // but this gives a friendlier error message)
  const existing = await query(
    `SELECT id FROM users WHERE email = $1 OR username = $2 LIMIT 1`,
    [email, username]
  );
  if (existing.rows.length > 0) {
    throw new AppError('Email or username already taken.', 409);
  }

  const hashedPassword = await hashPassword(password);

  const result = await query(
    `INSERT INTO users (username, email, password, bio)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, email, role, bio, created_at`,
    [username, email, hashedPassword, bio || null]
  );

  const user = result.rows[0];
  const token = generateAccessToken(user);

  logActivity(user.id, 'REGISTER', null, {}, req);

  return successResponse(res, { token, user }, 'Registration successful', 201);
});

// ── POST /api/auth/login ─────────────────────────────────
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Fetch user + check active
  const result = await query(
    `SELECT id, username, email, password, role, is_active, is_banned, bio
     FROM users WHERE email = $1`,
    [email]
  );
  const user = result.rows[0];

  if (!user) {
    // Don't reveal whether email exists (security best practice)
    throw new AppError('Invalid email or password.', 401);
  }

  if (!user.is_active) {
    throw new AppError('Account deactivated. Contact support.', 401);
  }

  if (user.is_banned) {
    throw new AppError('Account banned. Contact support.', 403);
  }

  const passwordMatch = await comparePassword(password, user.password);
  if (!passwordMatch) {
    throw new AppError('Invalid email or password.', 401);
  }

  const token = generateAccessToken(user);

  // Remove password from response
  delete user.password;

  logActivity(user.id, 'LOGIN', null, { email }, req);

  return successResponse(res, { token, user }, 'Login successful');
});

// ── GET /api/auth/me ─────────────────────────────────────
const getMe = asyncHandler(async (req, res) => {
  // req.user already set by authenticate middleware
  const result = await query(
    `SELECT id, username, email, role, bio, avatar_url, is_active, created_at, updated_at
     FROM users WHERE id = $1`,
    [req.user.id]
  );
  return successResponse(res, { user: result.rows[0] }, 'Profile fetched');
});

// ── PATCH /api/auth/profile ──────────────────────────────
const updateProfile = asyncHandler(async (req, res) => {
  const { bio, username } = req.body;
  const userId = req.user.id;

  // Check username conflict
  if (username && username !== req.user.username) {
    const conflict = await query(
      `SELECT id FROM users WHERE username = $1 AND id != $2`,
      [username, userId]
    );
    if (conflict.rows.length > 0) {
      throw new AppError('Username already taken.', 409);
    }
  }

  const result = await query(
    `UPDATE users
     SET bio = COALESCE($1, bio),
         username = COALESCE($2, username)
     WHERE id = $3
     RETURNING id, username, email, role, bio, avatar_url, updated_at`,
    [bio, username, userId]
  );

  logActivity(userId, 'UPDATE_PROFILE', `user:${userId}`, {}, req);

  return successResponse(res, { user: result.rows[0] }, 'Profile updated');
});

module.exports = { register, login, getMe, updateProfile };
