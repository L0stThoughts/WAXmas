// src/routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { v4: uuidv4 } = require('uuid');

/**
 * POST /api/chat/create
 * Body: { name, isPublic, profanityFilterOn }
 */
router.post('/create', (req, res) => {
  const { name, isPublic = true, profanityFilterOn = false } = req.body;
  if (!name) {
    return res.status(400).json({ message: 'Room name is required' });
  }

  const roomId = uuidv4();
  const ownerId = req.user.userId;

  db.prepare(`
    INSERT INTO chat_rooms (id, name, isPublic, profanityFilterOn, ownerId)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    roomId,
    name,
    isPublic ? 1 : 0,
    profanityFilterOn ? 1 : 0,
    ownerId
  );

  res.json({ roomId, name, isPublic, profanityFilterOn, ownerId });
});

/**
 * POST /api/chat/allow
 * Body: { roomId, userId }
 * Allows userId into private room
 */
router.post('/allow', (req, res) => {
  const { roomId, userId } = req.body;
  if (!roomId || !userId) {
    return res.status(400).json({ message: 'roomId and userId required' });
  }

  const room = db.prepare(`SELECT * FROM chat_rooms WHERE id = ?`).get(roomId);
  if (!room) {
    return res.status(404).json({ message: 'Room not found' });
  }
  if (room.ownerId !== req.user.userId) {
    return res.status(403).json({ message: 'Only the owner can allow users' });
  }
  if (room.isPublic === 1) {
    return res.status(400).json({ message: 'Room is public, no need to allow' });
  }

  db.prepare(`
    INSERT INTO allowed_users (roomId, userId) VALUES (?, ?)
  `).run(roomId, userId);

  res.json({ success: true, roomId, userId });
});

module.exports = router;
