// src/userSockets.js

// Map: userId -> Set of socketIds
const userSocketsMap = new Map();

/**
 * Add a socket ID to the user's set.
 * Call this in io.on('connection') with the userId + socketId.
 */
function addSocket(userId, socketId) {
  if (!userSocketsMap.has(userId)) {
    userSocketsMap.set(userId, new Set());
  }
  userSocketsMap.get(userId).add(socketId);
}

/**
 * Remove a socket ID. If the user has no sockets left, remove the user from the map.
 */
function removeSocket(userId, socketId) {
  const setOfSockets = userSocketsMap.get(userId);
  if (setOfSockets) {
    setOfSockets.delete(socketId);
    if (setOfSockets.size === 0) {
      userSocketsMap.delete(userId);
    }
  }
}

/**
 * Get all socket IDs for a given userId (or undefined if none).
 */
function getSocketIds(userId) {
  return userSocketsMap.get(userId);
}

module.exports = {
  addSocket,
  removeSocket,
  getSocketIds
};
