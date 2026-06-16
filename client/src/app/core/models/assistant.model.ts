/**
 * Client-side types for the AI assistant chat.
 * Mirror the server contract from server/src/services/assistant.service.js.
 */

export type ChatRole = 'user' | 'assistant';

/** A single rendered turn in the chat panel. */
export interface ChatMessage {
  role: ChatRole;
  text: string;
  pending?: boolean;
}

/** The action the model recognised and the server executed. */
export interface ChatAction {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

/** Payload returned by the server for one processed message. */
export interface ChatResult {
  reply: string;
  action: ChatAction | null;
  affectedGroupId: string | null;
}

/** One prior turn sent back to the server for short-term context. */
export interface ChatHistoryTurn {
  role: ChatRole;
  text: string;
}
