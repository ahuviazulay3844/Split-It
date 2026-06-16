const { Server } = require('socket.io');

let _io = null;

/**
 * Initialises Socket.io on the given HTTP server.
 * Clients join a room per group so we can broadcast targeted updates.
 * Call this once from app.js before server.listen().
 */
const init = (httpServer) => {
  _io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  _io.on('connection', (socket) => {
    socket.on('join:group', (groupId) => {
      if (groupId) socket.join(`group:${groupId}`);
    });
    socket.on('leave:group', (groupId) => {
      if (groupId) socket.leave(`group:${groupId}`);
    });
  });
};

/**
 * Broadcasts an event to every client in a group's room.
 * Safe to call even before init() — the emit is a no-op when io is null.
 */
const emitToGroup = (groupId, event, data) => {
  if (_io) _io.to(`group:${groupId}`).emit(event, data);
};

module.exports = { init, emitToGroup };
