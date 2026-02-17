// src/middleware/auth.js
// ─────────────────────────────────────────────────────────
// Authentication & Authorization middleware
//
// HOW JWT WORKS HERE:
// 1. Login → server signs a JWT with user's id + role
// 2. Client stores the JWT and sends it in every request
//    via the Authorization header: "Bearer <token>"
// 3. This middleware verifies the token signature
// 4. If valid → attach user info to req.user and call next()
// ─────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');
const { query } = require('../config/postgres');

/**
 * authenticate — verifies JWT token
 * Attach this to any route that requires a logged-in user
 */
const authenticate = async (req, res, next) => {
  try {
    // 1. Extract token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
    }

    const token = authHeader.split(' ')[1];

    // 2. Verify JWT signature and expiry
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token expired.' });
      }
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }

    // 3. Check user still exists and isn't banned
    const result = await query(
      `SELECT id, username, email, role, is_active, is_banned
       FROM users WHERE id = $1`,
      [decoded.id]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    if (!user.is_active) {
      return res.status(401).json({ success: false, message: 'Account deactivated.' });
    }

    if (user.is_banned) {
      return res.status(403).json({ success: false, message: 'Account banned.' });
    }

    // 4. Attach user to request — available in all downstream handlers
    req.user = user;
    next();

  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ success: false, message: 'Authentication error.' });
  }
};

// ── Role-Based Access Control (RBAC) ────────────────────
// Role hierarchy: admin > moderator > user
const ROLE_HIERARCHY = { user: 1, moderator: 2, admin: 3 };

/**
 * authorize(...roles) — restricts access to specific roles
 * Usage: router.delete('/thread/:id', authenticate, authorize('admin', 'moderator'), handler)
 *
 * @param {...string} roles - Allowed roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }

    const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const requiredLevel = Math.min(...roles.map(r => ROLE_HIERARCHY[r] || 0));

    if (userLevel < requiredLevel) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}.`,
      });
    }

    next();
  };
};

/**
 * optionalAuth — attaches user if token present, continues if not
 * Useful for public routes that show extra info to logged-in users
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await query(
      `SELECT id, username, email, role, is_active, is_banned FROM users WHERE id = $1`,
      [decoded.id]
    );

    req.user = result.rows[0] || null;
    next();
  } catch {
    req.user = null;
    next();
  }
};

module.exports = { authenticate, authorize, optionalAuth };
