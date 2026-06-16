const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const { chat } = require('./services/assistant.service');

let _io = null;

/**
 * Authenticates a socket from its handshake. The client connects with
 *   io(url, { auth: { token: '<jwt>' } })
 * and we verify the same JWT used by the REST auth middleware, attaching the
 * decoded user to socket.user. Connections without a valid token are rejected.
 */
const authenticateSocket = (socket, next) => {
  try {
    const token =
      (socket.handshake.auth && socket.handshake.auth.token) ||
      (socket.handshake.headers && socket.handshake.headers.authorization || '').replace(
        /^Bearer\s+/i,
        ''
      );

    if (!token) return next(new Error('Authentication required'));

    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch (err) {
    return next(new Error('Invalid or expired token'));
  }
};

/**
 * Initialises Socket.io on the given HTTP server.
 * Clients join a room per group so we can broadcast targeted updates, and each
 * authenticated socket can talk to the AI assistant in real time.
 * Call this once from app.js before server.listen().
 */
const init = (httpServer) => {
  _io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  _io.use(authenticateSocket);

  _io.on('connection', (socket) => {
    socket.on('join:group', (groupId) => {
      if (groupId) socket.join(`group:${groupId}`);
    });
    socket.on('leave:group', (groupId) => {
      if (groupId) socket.leave(`group:${groupId}`);
    });

    // Real-time AI chat. The client emits:
    //   socket.emit('chat:message', { message, history }, ack?)
    // and receives 'chat:response' (and 'chat:error' on failure). When the
    // recognised action mutates a group, that group's room is refreshed.
    socket.on('chat:message', async (payload = {}, ack) => {
      try {
        const message = typeof payload === 'string' ? payload : payload.message;
        const history = (payload && payload.history) || [];
        if (!message || !String(message).trim()) {
          throw new Error('Message cannot be empty');
        }

        const result = await chat(socket.user._id, String(message), history);

        if (result.affectedGroupId) {
          emitToGroup(result.affectedGroupId, 'group:updated', {
            groupId: result.affectedGroupId,
          });
        }

        socket.emit('chat:response', result);
        if (typeof ack === 'function') ack({ status: 'success', data: result });
      } catch (err) {
        const message = err.message || 'Assistant failed to process the message';
        socket.emit('chat:error', { message });
        if (typeof ack === 'function') ack({ status: 'error', message });
      }
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
