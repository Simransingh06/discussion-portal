// src/controllers/threadController.js
// ─────────────────────────────────────────────────────────
// Handles threaded discussions
// Thread metadata → PostgreSQL (fast sorting, filtering)
// Thread content  → MongoDB (flexible, nested)
//
// This split is the key architectural decision:
// PostgreSQL handles "which threads" (listing, searching)
// MongoDB handles "what's in the thread" (posts, comments)
// ─────────────────────────────────────────────────────────
const { query, getClient } = require('../config/postgres');
const Post = require('../models/Post');
const {
  slugify, logActivity,
  getPagination, paginatedResponse,
  successResponse,
} = require('../utils/helpers');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// ── GET /api/threads ─────────────────────────────────────
// List threads with filters: categoryId, search, sort
const getThreads = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const { categoryId, search, sort = 'activity' } = req.query;

  // Build WHERE clause dynamically
  const conditions = [];
  const params = [];
  let paramIdx = 1;

  if (categoryId) {
    conditions.push(`t.category_id = $${paramIdx++}`);
    params.push(categoryId);
  }

  // Full-text search using PostgreSQL GIN index (fast!)
  if (search) {
    conditions.push(`to_tsvector('english', t.title) @@ plainto_tsquery('english', $${paramIdx++})`);
    params.push(search);
  }

  const whereClause = conditions.length > 0
    ? 'WHERE ' + conditions.join(' AND ')
    : '';

  // Sort options
  const sortMap = {
    activity: 't.is_pinned DESC, t.last_reply_at DESC NULLS LAST',
    newest:   't.is_pinned DESC, t.created_at DESC',
    popular:  't.is_pinned DESC, t.view_count DESC',
    replies:  't.is_pinned DESC, t.reply_count DESC',
  };
  const orderBy = sortMap[sort] || sortMap.activity;

  // Main query: get threads with author info
  // Uses indexed columns → fast retrieval
  const threadsQuery = `
    SELECT
      t.id, t.title, t.slug, t.category_id,
      t.is_pinned, t.is_locked,
      t.view_count, t.reply_count,
      t.last_reply_at, t.created_at,
      u.id   AS author_id,
      u.username AS author_username,
      c.name AS category_name,
      c.slug AS category_slug
    FROM threads t
    JOIN users      u ON u.id = t.author_id
    JOIN categories c ON c.id = t.category_id
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `;

  // Count query (for pagination)
  const countQuery = `
    SELECT COUNT(*)::INTEGER AS total
    FROM threads t ${whereClause}
  `;

  const [threadsResult, countResult] = await Promise.all([
    query(threadsQuery, [...params, limit, offset]),
    query(countQuery, params),
  ]);

  return successResponse(res, paginatedResponse(
    threadsResult.rows,
    countResult.rows[0].total,
    page,
    limit
  ));
});

// ── GET /api/threads/:slug ───────────────────────────────
const getThread = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  // Fetch thread metadata from PostgreSQL
  const threadResult = await query(
    `SELECT
       t.*, u.username AS author_username, u.id AS author_id,
       c.name AS category_name, c.slug AS category_slug
     FROM threads t
     JOIN users u      ON u.id = t.author_id
     JOIN categories c ON c.id = t.category_id
     WHERE t.slug = $1`,
    [slug]
  );

  const thread = threadResult.rows[0];
  if (!thread) throw new AppError('Thread not found.', 404);

  // Increment view count (non-blocking — fire and forget)
  query(`UPDATE threads SET view_count = view_count + 1 WHERE id = $1`, [thread.id]);

  // Fetch post content from MongoDB
  const post = await Post.findOne({ threadId: thread.id })
    .select('-__v');

  if (!post) throw new AppError('Thread content not found.', 404);

  return successResponse(res, { thread, post });
});

// ── POST /api/threads ────────────────────────────────────
const createThread = asyncHandler(async (req, res) => {
  const { title, content, categoryId, tags } = req.body;
  const authorId = req.user.id;

  // Verify category exists
  const catResult = await query(
    `SELECT id FROM categories WHERE id = $1 AND status = 'active'`,
    [categoryId]
  );
  if (!catResult.rows[0]) throw new AppError('Category not found or inactive.', 404);

  // Use a PostgreSQL transaction for atomicity
  // If MongoDB insert fails → rollback PostgreSQL insert
  const client = await getClient();
  let thread;

  try {
    await client.query('BEGIN');

    // 1. Insert thread metadata into PostgreSQL
    const threadResult = await client.query(
      `INSERT INTO threads (title, slug, category_id, author_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, slug, category_id, author_id, created_at`,
      [title, slugify(title), categoryId, authorId]
    );
    thread = threadResult.rows[0];

    // 2. Insert post content into MongoDB
    await Post.create({
      threadId: thread.id,
      originalPost: {
        authorId,
        authorUsername: req.user.username,
        content,
      },
      tags: tags || [],
    });

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    // Clean up MongoDB if it was created
    await Post.deleteOne({ threadId: thread?.id }).catch(() => {});
    throw err;
  } finally {
    client.release(); // ALWAYS release client back to pool
  }

  logActivity(authorId, 'CREATE_THREAD', `thread:${thread.id}`, { title }, req);

  return successResponse(res, { thread }, 'Thread created', 201);
});

// ── PATCH /api/threads/:id ───────────────────────────────
const updateThread = asyncHandler(async (req, res) => {
  const { title, content, tags } = req.body;
  const { id } = req.params;

  // Fetch thread to check ownership
  const threadResult = await query(
    `SELECT id, author_id, title FROM threads WHERE id = $1`,
    [id]
  );
  const thread = threadResult.rows[0];
  if (!thread) throw new AppError('Thread not found.', 404);

  // Only author, moderator, or admin can edit
  const isOwner = thread.author_id === req.user.id;
  const isMod   = ['moderator', 'admin'].includes(req.user.role);
  if (!isOwner && !isMod) throw new AppError('Permission denied.', 403);

  // Update thread title in PostgreSQL
  if (title) {
    await query(
      `UPDATE threads SET title = $1 WHERE id = $2`,
      [title, id]
    );
  }

  // Update content in MongoDB
  const updateFields = {};
  if (content) {
    updateFields['originalPost.content'] = content;
    updateFields['originalPost.isEdited'] = true;
    updateFields['originalPost.editedAt'] = new Date();
  }
  if (tags) updateFields.tags = tags;

  const post = await Post.findOneAndUpdate(
    { threadId: id },
    { $set: updateFields },
    { new: true }
  );

  logActivity(req.user.id, 'UPDATE_THREAD', `thread:${id}`, {}, req);

  return successResponse(res, {
    thread: { ...thread, title: title || thread.title },
    post,
  }, 'Thread updated');
});

// ── DELETE /api/threads/:id ──────────────────────────────
// Moderator/Admin only
const deleteThread = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const threadResult = await query(`SELECT id FROM threads WHERE id = $1`, [id]);
  if (!threadResult.rows[0]) throw new AppError('Thread not found.', 404);

  // PostgreSQL CASCADE will handle any FK constraints
  await query(`DELETE FROM threads WHERE id = $1`, [id]);
  await Post.deleteOne({ threadId: id });

  logActivity(req.user.id, 'DELETE_THREAD', `thread:${id}`, {}, req);

  return successResponse(res, {}, 'Thread deleted');
});

// ── PATCH /api/threads/:id/pin ───────────────────────────
// Admin/Moderator only
const pinThread = asyncHandler(async (req, res) => {
  const result = await query(
    `UPDATE threads SET is_pinned = NOT is_pinned WHERE id = $1 RETURNING id, is_pinned`,
    [req.params.id]
  );
  if (!result.rows[0]) throw new AppError('Thread not found.', 404);
  const { is_pinned } = result.rows[0];
  return successResponse(res, { is_pinned }, `Thread ${is_pinned ? 'pinned' : 'unpinned'}`);
});

// ── PATCH /api/threads/:id/lock ──────────────────────────
// Admin/Moderator only
const lockThread = asyncHandler(async (req, res) => {
  const result = await query(
    `UPDATE threads SET is_locked = NOT is_locked WHERE id = $1 RETURNING id, is_locked`,
    [req.params.id]
  );
  if (!result.rows[0]) throw new AppError('Thread not found.', 404);
  const { is_locked } = result.rows[0];
  return successResponse(res, { is_locked }, `Thread ${is_locked ? 'locked' : 'unlocked'}`);
});

module.exports = {
  getThreads, getThread, createThread,
  updateThread, deleteThread,
  pinThread, lockThread,
};
