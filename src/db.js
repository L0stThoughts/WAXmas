// src/db.js
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'chat.db');
const db = new Database(dbPath);

// Existing tables ...
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    isPublic INTEGER DEFAULT 1,
    profanityFilterOn INTEGER DEFAULT 0,
    ownerId TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS allowed_users (
    roomId TEXT NOT NULL,
    userId TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    filteredOut INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL,
    chatRoomId TEXT NOT NULL,
    userId TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS banned_users (
    roomId TEXT NOT NULL,
    userId TEXT NOT NULL
  );

  -- NEW TABLE: joined_rooms
  CREATE TABLE IF NOT EXISTS joined_rooms (
    userId TEXT,
    roomId TEXT
  );
`);

module.exports = db;
