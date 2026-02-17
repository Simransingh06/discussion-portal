// src/routes/adminRoutes.js
// ALL routes here require: authenticated + admin role
const express = require('express');
const router  = express.Router();

const {
  getUsers, getUserById,
  banUser, unbanUser, changeRole,
  getDashboardStats, getActivityLog,
} = require('../controllers/adminController');

const { authenticate, authorize } = require('../middleware/auth');
const { validate, schemas }       = require('../middleware/validate');

// Apply auth + admin role to all routes in this router
router.use(authenticate, authorize('admin'));

// Dashboard
router.get('/stats',    getDashboardStats);
router.get('/activity', getActivityLog);

// User management
router.get('/users',            getUsers);
router.get('/users/:userId',    getUserById);
router.post('/users/:userId/ban',   validate(schemas.banUser),    banUser);
router.post('/users/:userId/unban', unbanUser);
router.patch('/users/:userId/role', validate(schemas.changeRole), changeRole);

module.exports = router;
