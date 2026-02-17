// src/models/Post.js
// ─────────────────────────────────────────────────────────
// MongoDB schema for Posts and nested Comments
//
// WHY MONGODB FOR POSTS?
// • Posts have variable-length content (rich text, attachments)
// • Comments nest deeply — MongoDB handles this naturally
// • High write throughput → MongoDB's document model wins
// • No need for JOINs — entire discussion in one document
// ─────────────────────────────────────────────────────────
const mongoose = require('mongoose');

// ── Comment Sub-Schema ──────────────────────────────────
// Embedded inside Post → one DB read = full discussion
const CommentSchema = new mongoose.Schema({
  authorId: {
    type: String,      // UUID from PostgreSQL users table
    required: true,
    index: true,
  },
  authorUsername: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
    maxlength: [5000, 'Comment too long'],
  },
  parentCommentId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,     // null = top-level comment
  },
  isEdited: { type: Boolean, default: false },
  editedAt: { type: Date },
  isDeleted: { type: Boolean, default: false },  // Soft delete
  deletedAt: { type: Date },
  upvotes: { type: Number, default: 0 },
  upvotedBy: [{ type: String }],  // Array of user UUIDs
  attachments: [{
    url: String,
    filename: String,
    mimetype: String,
  }],
}, {
  timestamps: true,  // Adds createdAt, updatedAt automatically
  _id: true,
});

// ── Post Schema ─────────────────────────────────────────
const PostSchema = new mongoose.Schema({
  threadId: {
    type: String,       // UUID from PostgreSQL threads table
    required: true,
    index: true,
  },
  // Original post (thread starter)
  originalPost: {
    authorId:       { type: String, required: true },
    authorUsername: { type: String, required: true },
    content:        { type: String, required: true, maxlength: [50000, 'Post too long'] },
    isEdited:       { type: Boolean, default: false },
    editedAt:       { type: Date },
    attachments: [{
      url:      String,
      filename: String,
      mimetype: String,
    }],
    upvotes:   { type: Number, default: 0 },
    upvotedBy: [{ type: String }],
  },

  // All comments (flat array — faster queries than nested)
  // Use parentCommentId to reconstruct tree in frontend
  comments: [CommentSchema],

  // Metadata
  isLocked:  { type: Boolean, default: false },
  viewCount: { type: Number, default: 0 },
  tags:      [{ type: String, lowercase: true, trim: true }],
}, {
  timestamps: true,
  // Virtual: computed fields not stored in DB
  toJSON:   { virtuals: true },
  toObject: { virtuals: true },
});

// ── INDEXES ─────────────────────────────────────────────
// Fast lookup by thread
PostSchema.index({ threadId: 1 });
// Sort by activity
PostSchema.index({ updatedAt: -1 });
// Text search on post content
PostSchema.index({ 'originalPost.content': 'text', tags: 'text' });
// Compound: thread + time (most common query)
PostSchema.index({ threadId: 1, createdAt: -1 });

// ── VIRTUAL: comment count ──────────────────────────────
PostSchema.virtual('commentCount').get(function () {
  return this.comments.filter(c => !c.isDeleted).length;
});

// ── METHODS ─────────────────────────────────────────────
// Add a comment to this post
PostSchema.methods.addComment = function (commentData) {
  this.comments.push(commentData);
  return this.save();
};

// Soft-delete a comment (keep for thread integrity)
PostSchema.methods.softDeleteComment = function (commentId) {
  const comment = this.comments.id(commentId);
  if (!comment) throw new Error('Comment not found');
  comment.isDeleted = true;
  comment.deletedAt = new Date();
  comment.content = '[deleted]';
  return this.save();
};

// Upvote the original post
PostSchema.methods.toggleUpvote = function (userId) {
  const idx = this.originalPost.upvotedBy.indexOf(userId);
  if (idx === -1) {
    this.originalPost.upvotedBy.push(userId);
    this.originalPost.upvotes += 1;
  } else {
    this.originalPost.upvotedBy.splice(idx, 1);
    this.originalPost.upvotes -= 1;
  }
  return this.save();
};

module.exports = mongoose.model('Post', PostSchema);
