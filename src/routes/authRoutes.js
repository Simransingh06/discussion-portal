// src/routes/authRoutes.js
const express = require('express');
const router  = express.Router();

const { register, login, getMe, updateProfile } = require('../controllers/authController');
const { authenticate }            = require('../middleware/auth');
const { validate, schemas }       = require('../middleware/validate');
const { authLimiter }             = require('../middleware/rateLimiter');

// Public routes (with auth rate limiting)
router.post('/register', authLimiter, validate(schemas.register), register);
router.post('/login',    authLimiter, validate(schemas.login),    login);

// Protected routes
router.get('/me',     authenticate, getMe);
router.patch('/profile', authenticate, validate(schemas.updateProfile), updateProfile);

module.exports = router;
