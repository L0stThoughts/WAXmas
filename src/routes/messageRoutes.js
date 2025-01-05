// src/routes/messageRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * GET /api/messages
 * All messages
 */
router.get('/', (req, res) => {
  const messages = db.prepare(`
    SELECT * FROM messages
    ORDER BY createdAt ASC
  `).all();
  res.json(messages);
});

/**
 * GET /api/messages/user/:userId
 */
router.get('/user/:userId', (req, res) => {
  const { userId } = req.params;
  const msgs = db.prepare(`
    SELECT * FROM messages
    WHERE userId = ?
    ORDER BY createdAt ASC
  `).all(userId);
  res.json(msgs);
});

/**
 * GET /api/messages/room/:roomId
 */
router.get('/room/:roomId', (req, res) => {
  const { roomId } = req.params;
  const msgs = db.prepare(`
    SELECT * FROM messages
    WHERE chatRoomId = ?
    ORDER BY createdAt ASC
  `).all(roomId);
  res.json(msgs);
});

/**
 * GET /api/messages/search?word=someWord
 */
router.get('/search', (req, res) => {
  const { word } = req.query;
  if (!word) {
    return res.status(400).json({ message: 'Query param "word" is required' });
  }

  const pattern = `%${word.toLowerCase()}%`;
  const msgs = db.prepare(`
    SELECT * FROM messages
    WHERE LOWER(text) LIKE ?
    ORDER BY createdAt ASC
  `).all(pattern);
  res.json(msgs);
});

module.exports = router;
