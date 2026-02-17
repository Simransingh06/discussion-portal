// src/controllers/categoryController.js
// ─────────────────────────────────────────────────────────
// CRUD for discussion categories (PostgreSQL)
// ─────────────────────────────────────────────────────────
const { query } = require('../config/postgres');
const { slugify, logActivity, successResponse } = require('../utils/helpers');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// ── GET /api/categories ──────────────────────────────────
const getCategories = asyncHandler(async (req, res) => {
  // Get categories + thread count in one query using LEFT JOIN + COUNT
  const result = await query(`
    SELECT
      c.id,
      c.name,
      c.slug,
      c.description,
      c.status,
      c.created_at,
      COUNT(t.id)::INTEGER AS thread_count
    FROM categories c
    LEFT JOIN threads t ON t.category_id = c.id
    WHERE c.status = 'active'
    GROUP BY c.id
    ORDER BY c.name ASC
  `);
  return successResponse(res, { categories: result.rows });
});

// ── GET /api/categories/:slug ────────────────────────────
const getCategory = asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT id, name, slug, description, status, created_at
     FROM categories WHERE slug = $1`,
    [req.params.slug]
  );
  if (!result.rows[0]) throw new AppError('Category not found.', 404);
  return successResponse(res, { category: result.rows[0] });
});

// ── POST /api/categories ─────────────────────────────────
// Admin only
const createCategory = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  const slug = slugify(name);

  const result = await query(
    `INSERT INTO categories (name, slug, description, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, slug, description, status, created_at`,
    [name, slug, description || null, req.user.id]
  );

  logActivity(req.user.id, 'CREATE_CATEGORY', `category:${result.rows[0].id}`, { name }, req);

  return successResponse(res, { category: result.rows[0] }, 'Category created', 201);
});

// ── PATCH /api/categories/:id ────────────────────────────
// Admin only
const updateCategory = asyncHandler(async (req, res) => {
  const { name, description, status } = req.body;

  const result = await query(
    `UPDATE categories
     SET name        = COALESCE($1, name),
         description = COALESCE($2, description),
         status      = COALESCE($3, status)
     WHERE id = $4
     RETURNING id, name, slug, description, status`,
    [name, description, status, req.params.id]
  );

  if (!result.rows[0]) throw new AppError('Category not found.', 404);

  logActivity(req.user.id, 'UPDATE_CATEGORY', `category:${req.params.id}`, req.body, req);

  return successResponse(res, { category: result.rows[0] }, 'Category updated');
});

module.exports = { getCategories, getCategory, createCategory, updateCategory };
