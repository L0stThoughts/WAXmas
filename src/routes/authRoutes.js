// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const authMiddleware = require('../middleware/authMiddleware');

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || 'mySuperSecret';
const COOKIE_MAX_AGE = 24 * 60 * 60 * 1000; // 1 day in ms

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password required' });
  }

  // Check if username exists
  const existingUser = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
  if (existingUser) {
    return res.status(400).json({ message: 'Username already taken' });
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const userId = uuidv4();

  // Insert user
  db.prepare(`
    INSERT INTO users (id, username, passwordHash)
    VALUES (?, ?, ?)
  `).run(userId, username, passwordHash);

  return res.status(201).json({ message: 'User registered successfully' });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password required' });
  }

  const user = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  // Check password
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  // Generate JWT
  const token = jwt.sign(
    { userId: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: '1d' }
  );

  // Set HTTP-only cookie
  res.cookie('token', token, {
    httpOnly: true,
    secure: false,       
    sameSite: 'strict',  
    maxAge: COOKIE_MAX_AGE
  });

  return res.json({
    message: 'Logged in successfully (cookie set)',
    username: user.username
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  return res.json({ message: 'Logged out, cookie cleared.' });
});

// GET /api/auth/me (check who is logged in, if any)
router.get('/me', authMiddleware, (req, res) => {
  res.json({ userId: req.user.userId, username: req.user.username });
});

module.exports = router;
