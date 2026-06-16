const { chat } = require('../services/assistant.service');
const { emitToGroup } = require('../socket');

/**
 * POST /api/assistant/chat
 * Thin handler: forwards the chat message to the assistant service, then (if the
 * recognised action mutated a group) broadcasts a refresh to that group's room.
 */
const handleChat = async (req, res, next) => {
  try {
    const { message, history } = req.validatedBody;
    const result = await chat(req.user._id, message, history);

    if (result.affectedGroupId) {
      emitToGroup(result.affectedGroupId, 'group:updated', {
        groupId: result.affectedGroupId,
      });
    }

    res.json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

module.exports = { handleChat };
