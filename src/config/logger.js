// src/config/logger.js
// ─────────────────────────────────────────────────────────
// Centralized logger using Winston
// Logs to console (dev) and files (production)
// ─────────────────────────────────────────────────────────
const winston = require('winston');

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),  // Print stack trace for errors
    logFormat
  ),
  transports: [
    // Console transport (colored in dev)
    new winston.transports.Console({
      format: combine(colorize(), logFormat)
    }),
    // File transport for errors only
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error'
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log'
    }),
  ],
});

module.exports = logger;
