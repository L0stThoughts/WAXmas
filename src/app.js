require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const path = require("path");
const cookieParser = require("cookie-parser");
const cookie = require("cookie");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");

const db = require("./db");
const authMiddleware = require("./middleware/authMiddleware");
const authRoutes = require("./routes/authRoutes");
const chatRoutes = require("./routes/chatRoutes");
const messageRoutes = require("./routes/messageRoutes");
const profanityService = require("./services/profanityService");

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Body + cookie parser
app.use(express.json());
app.use(cookieParser());

// Serve frontend
app.use(express.static(path.join(__dirname, "..", "public")));

// REST
app.use("/api/auth", authRoutes);
app.use("/api/chat", authMiddleware, chatRoutes);
app.use("/api/messages", authMiddleware, messageRoutes);

// Socket.IO cookie-based auth
io.use((socket, next) => {
  const cookieHeader = socket.handshake.headers.cookie;
  if (!cookieHeader) {
    return next(new Error("No cookie in handshake"));
  }
  const parsed = cookie.parse(cookieHeader);
  const token = parsed.token;
  if (!token) {
    return next(new Error("No token cookie"));
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "mySuperSecret"
    );
    socket.user = decoded; // { userId, username, iat, exp }
    next();
  } catch (err) {
    next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.user.username);
  const userId = socket.user.userId;

  // 1. Look up which rooms they were in
  const joinedRooms = db
    .prepare(
      `
      SELECT roomId FROM joined_rooms WHERE userId = ?
    `
    )
    .all(userId);

  joinedRooms.forEach(({ roomId }) => {
    // 2. Check if user is banned from that room
    const banned = db
      .prepare(
        `
        SELECT 1 FROM banned_users WHERE roomId = ? AND userId = ?
      `
      )
      .get(roomId, userId);
    if (banned) {
      // If they're banned, remove from joined_rooms so we don't keep joining them
      db.prepare(
        `
          DELETE FROM joined_rooms WHERE userId = ? AND roomId = ?
        `
      ).run(userId, roomId);
    } else {
      // 3. Rejoin them to the room
      socket.join(roomId);

      // 4. Emit 'joinedRoom' so the front end updates its UI
      socket.emit("joinedRoom", { roomId });

      // 5. Optionally re-send the room's message history too
      const msgs = db
        .prepare(
          `
          SELECT * FROM messages
          WHERE chatRoomId = ?
          ORDER BY createdAt ASC
        `
        )
        .all(roomId);
      socket.emit("roomHistory", { roomId, messages: msgs });

      console.log(`Rejoined user ${userId} to room ${roomId} after F5/refresh`);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.user.username);
    // We do NOT remove them from joined_rooms on normal disconnect,
    // so if they refresh (F5) they'll get back to the same rooms.
  });

  // JOIN ROOM
  socket.on("joinRoom", ({ roomId }) => {
    try {
      // Banned check
      const banned = db
        .prepare(
          `
        SELECT 1 FROM banned_users
        WHERE roomId = ? AND userId = ?
      `
        )
        .get(roomId, userId);
      if (banned) {
        return socket.emit("error", "You are banned from this room");
      }

      // Check room
      const room = db
        .prepare(`SELECT * FROM chat_rooms WHERE id = ?`)
        .get(roomId);
      if (!room) {
        return socket.emit("error", "Room does not exist");
      }

      // Private check
      if (room.isPublic === 0 && room.ownerId !== userId) {
        const allowed = db
          .prepare(
            `
          SELECT 1 FROM allowed_users
          WHERE roomId = ? AND userId = ?
        `
          )
          .get(roomId, userId);
        if (!allowed) {
          return socket.emit("error", "No access to this private room");
        }
      }

      // Insert into joined_rooms if not already
      db.prepare(
        `
        INSERT INTO joined_rooms (userId, roomId)
        VALUES (?, ?)
      `
      ).run(userId, roomId);

      socket.join(roomId);
      socket.emit("joinedRoom", { roomId });

      // Send existing message history
      const msgs = db
        .prepare(
          `
        SELECT * FROM messages
        WHERE chatRoomId = ?
        ORDER BY createdAt ASC
      `
        )
        .all(roomId);
      socket.emit("roomHistory", { roomId, messages: msgs });
    } catch (err) {
      socket.emit("error", err.message);
    }
  });

  // LEAVE ROOM
  socket.on("leaveRoom", ({ roomId }) => {
    try {
      if (!socket.rooms.has(roomId)) {
        return socket.emit("error", "You are not in this room");
      }

      // Remove from joined_rooms
      db.prepare(
        `
        DELETE FROM joined_rooms
        WHERE userId = ? AND roomId = ?
      `
      ).run(userId, roomId);

      socket.leave(roomId);
      socket.emit("leftRoom", { roomId });
    } catch (err) {
      socket.emit("error", err.message);
    }
  });

  // CHAT MESSAGE
  socket.on("chatMessage", async ({ roomId, text }) => {
    try {
      // Banned check
      const banned = db
        .prepare(
          `
        SELECT 1 FROM banned_users
        WHERE roomId = ? AND userId = ?
      `
        )
        .get(roomId, userId);
      if (banned) {
        return socket.emit("error", "You are banned from this room");
      }

      // Check room
      const room = db
        .prepare(`SELECT * FROM chat_rooms WHERE id = ?`)
        .get(roomId);
      if (!room) {
        return socket.emit("error", "Room does not exist");
      }

      let filteredOut = 0;
      let finalText = text;

      // If filter is on, but user is not owner => check profanity
      const isOwner = room.ownerId === userId;
      if (room.profanityFilterOn === 1 && !isOwner) {
        const result = await profanityService.checkAndCleanText(text);
        if (!result.isClean) {
          filteredOut = 1;
          // Notify owner
          io.to(room.ownerId).emit("profanityAlert", {
            offenderId: userId,
            originalText: text,
            roomId,
          });
        }
        finalText = result.cleanedText;
      }

      // Insert message
      const msgId = uuidv4();
      const createdAt = new Date().toISOString();
      db.prepare(
        `
        INSERT INTO messages (id, text, filteredOut, createdAt, chatRoomId, userId)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(msgId, finalText, filteredOut, createdAt, roomId, userId);

      // Broadcast to the room
      io.to(roomId).emit("message", {
        user: socket.user.username,
        userId,
        text: finalText,
        filteredOut,
        createdAt,
      });
    } catch (err) {
      socket.emit("error", err.message);
    }
  });

  // BAN USER
  socket.on("banUser", ({ roomId, userId: targetUserId }) => {
    try {
      // Check if caller is owner
      const room = db
        .prepare(`SELECT * FROM chat_rooms WHERE id = ?`)
        .get(roomId);
      if (!room) {
        return socket.emit("error", "Room does not exist");
      }
      if (room.ownerId !== userId) {
        return socket.emit("error", "You are not the owner of this room");
      }

      // Insert into banned_users
      db.prepare(
        `
        INSERT INTO banned_users (roomId, userId)
        VALUES (?, ?)
      `
      ).run(roomId, targetUserId);

      // If private, remove from allowed_users
      if (room.isPublic === 0) {
        db.prepare(
          `
          DELETE FROM allowed_users
          WHERE roomId = ? AND userId = ?
        `
        ).run(roomId, targetUserId);
      }

      // Also remove from joined_rooms
      db.prepare(
        `
        DELETE FROM joined_rooms
        WHERE userId = ? AND roomId = ?
      `
      ).run(targetUserId, roomId);

      // Kick them out of the socket.io room if they have an active socket in it
      // We'll loop through all sockets to see if the target user is connected
      // Alternatively, if you maintain a userId->socket map, you can do it that way
      for (const [sid, s] of io.sockets.sockets) {
        if (s.user?.userId === targetUserId && s.rooms.has(roomId)) {
          s.leave(roomId);
          s.emit("banned", {
            roomId,
            message: "You have been banned from this room",
          });
        }
      }

      socket.emit("banSuccess", { userId: targetUserId });
    } catch (err) {
      socket.emit("error", err.message);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
