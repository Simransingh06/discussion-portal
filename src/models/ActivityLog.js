// src/models/ActivityLog.js
// ─────────────────────────────────────────────────────────
// MongoDB schema for activity/audit logs
// Logs every significant action (login, post, ban, etc.)
// MongoDB is great here: high write volume, flexible schema
// ─────────────────────────────────────────────────────────
const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
  userId:   { type: String, index: true },  // Who did it
  action:   {
    type: String,
    required: true,
    enum: [
      'LOGIN', 'LOGOUT', 'REGISTER',
      'CREATE_THREAD', 'UPDATE_THREAD', 'DELETE_THREAD',
      'CREATE_COMMENT', 'UPDATE_COMMENT', 'DELETE_COMMENT',
      'UPVOTE_POST', 'UPVOTE_COMMENT',
      'BAN_USER', 'UNBAN_USER',
      'CHANGE_ROLE', 'UPDATE_PROFILE',
      'CREATE_CATEGORY', 'UPDATE_CATEGORY',
    ],
  },
  resource: { type: String },  // e.g. 'thread:abc123'
  metadata: { type: mongoose.Schema.Types.Mixed },  // Extra context
  ipAddress: { type: String },
  userAgent:  { type: String },
}, {
  timestamps: true,
});

// TTL index: auto-delete logs older than 90 days
ActivityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });
// Fast user history lookup
ActivityLogSchema.index({ userId: 1, createdAt: -1 });
// Fast action-based reporting
ActivityLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);
