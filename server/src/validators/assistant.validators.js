const { z } = require('zod');

// Upper bound on how many history turns a single request may carry. Configurable
// so long conversations are effectively unlimited; the cap only guards the
// payload/token size and never limits how many messages a user can send overall.
const MAX_HISTORY_TURNS = Number(process.env.ASSISTANT_MAX_HISTORY_TURNS) || 200;

// One prior turn of the conversation, used to give the model short-term context.
const historyTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().trim().min(1).max(2000),
});

const chatSchema = z.object({
  message: z
    .string({ required_error: 'A chat message is required' })
    .trim()
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message must be at most 2000 characters'),
  // Optional rolling history the client keeps for the conversation.
  history: z.array(historyTurnSchema).max(MAX_HISTORY_TURNS, 'Too many history turns').optional(),
});

module.exports = { chatSchema };
