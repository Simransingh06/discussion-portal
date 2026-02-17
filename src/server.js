// src/server.js
// ─────────────────────────────────────────────────────────
// Main entry point for the Discussion Portal API
//
// STARTUP SEQUENCE:
// 1. Load environment variables
// 2. Connect to MongoDB
// 3. Configure Express app
// 4. Register routes
// 5. Register error handlers
// 6. Listen on PORT
// ─────────────────────────────────────────────────────────
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const path       = require('path');
const fs         = require('fs');

const connectMongoDB = require('./config/mongodb');
const logger         = require('./config/logger');
const { errorHandler } = require('./middleware/errorHandler');
const { apiLimiter }   = require('./middleware/rateLimiter');

// Route imports
const authRoutes     = require('./routes/authRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const threadRoutes   = require('./routes/threadRoutes');
const adminRoutes    = require('./routes/adminRoutes');

// ── Create logs directory if it doesn't exist ────────────
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

// ── Initialize Express ───────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 5000;

// ── Security Middleware ──────────────────────────────────
// helmet: sets security-related HTTP headers
app.use(helmet());

// CORS: allow cross-origin requests (configure origins in production!)
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body Parsing ─────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Request Logging ──────────────────────────────────────
// 'dev' format in dev, 'combined' in production
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Global Rate Limiter ──────────────────────────────────
app.use('/api/', apiLimiter);

// ── Health Check ─────────────────────────────────────────
// Used by load balancers and Docker health checks
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: process.env.NODE_ENV,
  });
});

// ── API Routes ───────────────────────────────────────────
// All REST API routes under /api/v1
app.use('/api/v1/auth',       authRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/threads',    threadRoutes);
app.use('/api/v1/admin',      adminRoutes);

// ── API Info ─────────────────────────────────────────────
app.get('/api/v1', (req, res) => {
  res.json({
    name:    'Discussion Portal API',
    version: '1.0.0',
    endpoints: {
      auth:       '/api/v1/auth',
      categories: '/api/v1/categories',
      threads:    '/api/v1/threads',
      admin:      '/api/v1/admin',
    },
  });
});

// ── 404 Handler ──────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found.`,
  });
});

// ── Global Error Handler ─────────────────────────────────
// Must be LAST middleware registered
app.use(errorHandler);

// ── Start Server ─────────────────────────────────────────
const startServer = async () => {
  try {
    // Connect to MongoDB first
    await connectMongoDB();

    // PostgreSQL pool connects lazily (on first query)
    // but we import it to trigger the connect event log
    require('./config/postgres');

    app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV}]`);
      logger.info(`📍 API base: http://localhost:${PORT}/api/v1`);
      logger.info(`❤️  Health: http://localhost:${PORT}/health`);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// ── Graceful Shutdown ────────────────────────────────────
// Handles CTRL+C and Docker stop signals
const gracefulShutdown = async (signal) => {
  logger.info(`\n${signal} received. Shutting down gracefully...`);
  const mongoose = require('mongoose');
  const { pool }  = require('./config/postgres');
  await Promise.all([
    mongoose.connection.close(),
    pool.end(),
  ]);
  logger.info('All connections closed. Goodbye!');
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

startServer();

module.exports = app;
