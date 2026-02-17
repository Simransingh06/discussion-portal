// src/routes/categoryRoutes.js
const express = require('express');
const router  = express.Router();

const { getCategories, getCategory, createCategory, updateCategory } = require('../controllers/categoryController');
const { authenticate, authorize } = require('../middleware/auth');
const { validate, schemas }       = require('../middleware/validate');

router.get('/',      getCategories);
router.get('/:slug', getCategory);

// Admin only
router.post('/',    authenticate, authorize('admin'), validate(schemas.createCategory), createCategory);
router.patch('/:id', authenticate, authorize('admin'), updateCategory);

module.exports = router;
