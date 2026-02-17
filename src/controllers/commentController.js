// src/controllers/commentController.js
// ─────────────────────────────────────────────────────────
// Handles nested comments for threads
// All stored in MongoDB Post.comments array
// PostgreSQL threads.reply_count is kept in sync
// ─────────────────────────────────────────────────────────
const { query } = require('../config/postgres');
const Post = require('../models/Post');
const { logActivity, successResponse } = require('../utils/helpers');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// ── POST /api/threads/:threadId/comments ─────────────────
const createComment = asyncHandler(async (req, res) => {
  const { content, parentCommentId } = req.body;
  const { threadId } = req.params;

  // Check thread exists and isn't locked
  const threadResult = await query(
    `SELECT id, is_locked FROM threads WHERE id = $1`,
    [threadId]
  );
  const thread = threadResult.rows[0];
  if (!thread) throw new AppError('Thread not found.', 404);
  if (thread.is_locked) throw new AppError('Thread is locked. No new replies allowed.', 403);

  // If replying to a comment, validate parent exists
  if (parentCommentId) {
    const post = await Post.findOne({
      threadId,
      'comments._id': parentCommentId,
    });
    if (!post) throw new AppError('Parent comment not found.', 404);
  }

  // Add comment to MongoDB post
  const newComment = {
    authorId:        req.user.id,
    authorUsername:  req.user.username,
    content,
    parentCommentId: parentCommentId || null,
  };

  const post = await Post.findOneAndUpdate(
    { threadId },
    { $push: { comments: newComment } },
    { new: true }
  );

  if (!post) throw new AppError('Thread content not found.', 404);

  // Get the newly added comment (last in array)
  const comment = post.comments[post.comments.length - 1];

  // Update reply count + last reply info in PostgreSQL
  await query(
    `UPDATE threads
     SET reply_count   = reply_count + 1,
         last_reply_at = NOW(),
         last_reply_by = $1
     WHERE id = $2`,
    [req.user.id, threadId]
  );

  logActivity(req.user.id, 'CREATE_COMMENT', `thread:${threadId}`, {}, req);

  return successResponse(res, { comment }, 'Comment added', 201);
});

// ── PATCH /api/threads/:threadId/comments/:commentId ─────
const updateComment = asyncHandler(async (req, res) => {
  const { content } = req.body;
  const { threadId, commentId } = req.params;

  // Find the post and the specific comment in one query
  const post = await Post.findOne({ threadId });
  if (!post) throw new AppError('Thread not found.', 404);

  const comment = post.comments.id(commentId);
  if (!comment || comment.isDeleted) throw new AppError('Comment not found.', 404);

  // Only author or moderator/admin can edit
  const isOwner = comment.authorId === req.user.id;
  const isMod   = ['moderator', 'admin'].includes(req.user.role);
  if (!isOwner && !isMod) throw new AppError('Permission denied.', 403);

  comment.content  = content;
  comment.isEdited = true;
  comment.editedAt = new Date();

  await post.save();

  logActivity(req.user.id, 'UPDATE_COMMENT', `thread:${threadId}:comment:${commentId}`, {}, req);

  return successResponse(res, { comment }, 'Comment updated');
});

// ── DELETE /api/threads/:threadId/comments/:commentId ────
const deleteComment = asyncHandler(async (req, res) => {
  const { threadId, commentId } = req.params;

  const post = await Post.findOne({ threadId });
  if (!post) throw new AppError('Thread not found.', 404);

  const comment = post.comments.id(commentId);
  if (!comment || comment.isDeleted) throw new AppError('Comment not found.', 404);

  const isOwner = comment.authorId === req.user.id;
  const isMod   = ['moderator', 'admin'].includes(req.user.role);
  if (!isOwner && !isMod) throw new AppError('Permission denied.', 403);

  // Soft delete — keeps comment in place for threaded context
  // Replies to deleted comments remain visible
  comment.isDeleted = true;
  comment.deletedAt = new Date();
  comment.content   = '[deleted]';

  await post.save();

  // Decrement reply count
  await query(
    `UPDATE threads SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = $1`,
    [threadId]
  );

  logActivity(req.user.id, 'DELETE_COMMENT', `thread:${threadId}:comment:${commentId}`, {}, req);

  return successResponse(res, {}, 'Comment deleted');
});

// ── POST /api/threads/:threadId/upvote ───────────────────
const upvoteThread = asyncHandler(async (req, res) => {
  const { threadId } = req.params;
  const userId = req.user.id;

  const post = await Post.findOne({ threadId });
  if (!post) throw new AppError('Thread not found.', 404);

  await post.toggleUpvote(userId);

  logActivity(userId, 'UPVOTE_POST', `thread:${threadId}`, {}, req);

  return successResponse(res, {
    upvotes: post.originalPost.upvotes,
    upvoted: post.originalPost.upvotedBy.includes(userId),
  }, 'Vote recorded');
});

// ── POST /api/threads/:threadId/comments/:commentId/upvote
const upvoteComment = asyncHandler(async (req, res) => {
  const { threadId, commentId } = req.params;
  const userId = req.user.id;

  const post = await Post.findOne({ threadId });
  if (!post) throw new AppError('Thread not found.', 404);

  const comment = post.comments.id(commentId);
  if (!comment || comment.isDeleted) throw new AppError('Comment not found.', 404);

  // Toggle upvote
  const idx = comment.upvotedBy.indexOf(userId);
  if (idx === -1) {
    comment.upvotedBy.push(userId);
    comment.upvotes += 1;
  } else {
    comment.upvotedBy.splice(idx, 1);
    comment.upvotes -= 1;
  }

  await post.save();

  logActivity(userId, 'UPVOTE_COMMENT', `comment:${commentId}`, {}, req);

  return successResponse(res, {
    upvotes: comment.upvotes,
    upvoted: comment.upvotedBy.includes(userId),
  }, 'Vote recorded');
});

module.exports = {
  createComment, updateComment, deleteComment,
  upvoteThread, upvoteComment,
};
