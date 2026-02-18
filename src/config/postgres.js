// src/config/postgres.js
// ─────────────────────────────────────────────────────────
// PostgreSQL connection pool using pg-pool
// Pools reuse connections → better performance under load
// ─────────────────────────────────────────────────────────
const { Pool } = require('pg');
require('dotenv').config();
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })
  : new Pool({
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT) || 5432,
      database: process.env.PG_DATABASE || 'discussion_portal',
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

// Test connection on startup
pool.on('connect', () => {
  console.log('✅ PostgreSQL pool connected');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error:', err.message);
});

/**
 * Helper: run a query with automatic connection management
 * @param {string} text  - SQL query string
 * @param {Array}  params - Query parameters (prevents SQL injection)
 */
const query = (text, params) => pool.query(text, params);

/**
 * Helper: get a dedicated client for transactions
 * ALWAYS call client.release() in a finally block!
 */
const getClient = () => pool.connect();

module.exports = { query, getClient, pool };
