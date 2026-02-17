// src/config/mongodb.js
// ─────────────────────────────────────────────────────────
// MongoDB connection via Mongoose
// Used for: discussion posts, comments, activity logs
// (documents with variable structure → perfect for MongoDB)
// ─────────────────────────────────────────────────────────
const mongoose = require('mongoose');
require('dotenv').config();

const connectMongoDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // These options reduce deprecation warnings
      serverSelectionTimeoutMS: 5000, // Fail fast if unreachable
      socketTimeoutMS: 45000,
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1); // Exit — app can't run without DB
  }
};

// Graceful shutdown
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected');
});

module.exports = connectMongoDB;
