// src/controllers/adminController.js
// ─────────────────────────────────────────────────────────
// Admin-only operations: user management, banning, roles
// All routes protected by authenticate + authorize('admin')
// ─────────────────────────────────────────────────────────
const { query } = require('../config/postgres');
const ActivityLog = require('../models/ActivityLog');
const { logActivity, getPagination, paginatedResponse, successResponse } = require('../utils/helpers');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// ── GET /api/admin/users ─────────────────────────────────
const getUsers = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const { role, search, banned } = req.query;

  const conditions = [];
  const params = [];
  let i = 1;

  if (role) {
    conditions.push(`role = $${i++}`);
    params.push(role);
  }
  if (banned !== undefined) {
    conditions.push(`is_banned = $${i++}`);
    params.push(banned === 'true');
  }
  if (search) {
    conditions.push(`(username ILIKE $${i} OR email ILIKE $${i})`);
    params.push(`%${search}%`);
    i++;
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const [usersResult, countResult] = await Promise.all([
    query(
      `SELECT id, username, email, role, is_active, is_banned, ban_reason, created_at
       FROM users ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*)::INTEGER AS total FROM users ${where}`, params),
  ]);

  return successResponse(res, paginatedResponse(
    usersResult.rows,
    countResult.rows[0].total,
    page, limit
  ));
});

// ── GET /api/admin/users/:userId ─────────────────────────
const getUserById = asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT id, username, email, role, bio, is_active, is_banned, ban_reason, created_at
     FROM users WHERE id = $1`,
    [req.params.userId]
  );
  if (!result.rows[0]) throw new AppError('User not found.', 404);
  return successResponse(res, { user: result.rows[0] });
});

// ── POST /api/admin/users/:userId/ban ────────────────────
const banUser = asyncHandler(async (req, res) => {
  const { reason, expiresAt } = req.body;
  const { userId } = req.params;

  // Can't ban another admin
  const targetResult = await query(`SELECT id, role FROM users WHERE id = $1`, [userId]);
  const target = targetResult.rows[0];
  if (!target) throw new AppError('User not found.', 404);
  if (target.role === 'admin') throw new AppError('Cannot ban an admin.', 403);

  // Update user ban status
  await query(
    `UPDATE users SET is_banned = true, ban_reason = $1 WHERE id = $2`,
    [reason, userId]
  );

  // Record ban in ban history
  await query(
    `INSERT INTO user_bans (user_id, banned_by, reason, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, req.user.id, reason, expiresAt || null]
  );

  logActivity(req.user.id, 'BAN_USER', `user:${userId}`, { reason, expiresAt }, req);

  return successResponse(res, {}, 'User banned');
});

// ── POST /api/admin/users/:userId/unban ──────────────────
const unbanUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const result = await query(
    `UPDATE users SET is_banned = false, ban_reason = NULL WHERE id = $1 RETURNING id`,
    [userId]
  );
  if (!result.rows[0]) throw new AppError('User not found.', 404);

  logActivity(req.user.id, 'UNBAN_USER', `user:${userId}`, {}, req);

  return successResponse(res, {}, 'User unbanned');
});

// ── PATCH /api/admin/users/:userId/role ──────────────────
const changeRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  const { userId } = req.params;

  // Prevent self-demotion
  if (userId === req.user.id) throw new AppError("Can't change your own role.", 400);

  const result = await query(
    `UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, role`,
    [role, userId]
  );
  if (!result.rows[0]) throw new AppError('User not found.', 404);

  logActivity(req.user.id, 'CHANGE_ROLE', `user:${userId}`, { role }, req);

  return successResponse(res, { user: result.rows[0] }, 'Role updated');
});

// ── GET /api/admin/stats ─────────────────────────────────
const getDashboardStats = asyncHandler(async (req, res) => {
  const [usersResult, threadsResult, activityResult] = await Promise.all([
    query(`SELECT COUNT(*)::INTEGER AS total, COUNT(*) FILTER (WHERE is_banned) AS banned FROM users`),
    query(`SELECT COUNT(*)::INTEGER AS total, SUM(reply_count)::INTEGER AS total_replies FROM threads`),
    ActivityLog.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } },
      { $group: { _id: '$action', count: { $sum: 1 } } },
    ]),
  ]);

  return successResponse(res, {
    stats: {
      users:   usersResult.rows[0],
      threads: threadsResult.rows[0],
      activityLast24h: activityResult,
    },
  });
});

// ── GET /api/admin/activity ──────────────────────────────
const getActivityLog = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const { userId, action } = req.query;

  const filter = {};
  if (userId) filter.userId = userId;
  if (action) filter.action = action;

  const [logs, total] = await Promise.all([
    ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit),
    ActivityLog.countDocuments(filter),
  ]);

  return successResponse(res, paginatedResponse(logs, total, page, limit));
});

module.exports = {
  getUsers, getUserById,
  banUser, unbanUser, changeRole,
  getDashboardStats, getActivityLog,
};
