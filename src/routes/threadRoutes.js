// src/routes/threadRoutes.js
const express = require('express');
const router  = express.Router();

const {
  getThreads, getThread, createThread,
  updateThread, deleteThread,
  pinThread, lockThread,
} = require('../controllers/threadController');

const {
  createComment, updateComment, deleteComment,
  upvoteThread, upvoteComment,
} = require('../controllers/commentController');

const { authenticate, authorize, optionalAuth } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

// ── Thread Routes ──────────────────────────────────────────────────────────
router.get('/',     optionalAuth, getThreads);               // List (public, auth optional)
router.get('/:slug', optionalAuth, getThread);               // Single thread (public)

router.post('/',    authenticate, validate(schemas.createThread),  createThread);   // Create (auth)
router.patch('/:id', authenticate, validate(schemas.updateThread), updateThread);   // Edit (owner/mod)
router.delete('/:id', authenticate, authorize('moderator', 'admin'), deleteThread); // Delete (mod+)

// Moderation
router.patch('/:id/pin',  authenticate, authorize('moderator', 'admin'), pinThread);
router.patch('/:id/lock', authenticate, authorize('moderator', 'admin'), lockThread);

// ── Comment Routes (nested under thread) ────────────────────────────────────
router.post('/:threadId/comments',
  authenticate,
  validate(schemas.createComment),
  createComment
);

router.patch('/:threadId/comments/:commentId',
  authenticate,
  validate(schemas.updateComment),
  updateComment
);

router.delete('/:threadId/comments/:commentId',
  authenticate,
  deleteComment
);

// ── Voting Routes ────────────────────────────────────────────────────────────
router.post('/:threadId/upvote', authenticate, upvoteThread);
router.post('/:threadId/comments/:commentId/upvote', authenticate, upvoteComment);

module.exports = router;
