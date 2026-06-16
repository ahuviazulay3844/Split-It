/**
 * AI assistant service.
 *
 * Turns a free-text chat message into a real SplitIt action by:
 *   1. Sending the message (plus any prior chat history) to Gemini together
 *      with the full action catalog as tool/function declarations.
 *   2. Letting the model decide, on its own, which action the message maps to
 *      and extract the arguments — or reply in plain text when no action fits
 *      or when it needs clarification.
 *   3. Executing the chosen action against the real domain services.
 *   4. Feeding the execution result back to Gemini so it phrases a final,
 *      human-friendly confirmation ("the title with the data").
 *
 * It never touches req/res; it takes plain args and returns plain data.
 */

const { generateContent } = require('../utils/geminiClient');
const { toolDeclarations, executeAction } = require('./assistant.actions');

const SYSTEM_INSTRUCTION = `You are SplitIt's in-app assistant. SplitIt lets people share group expenses and settle debts.
The user talks to you in natural language (Hebrew or English). Decide which single action best matches their message and call the matching function with arguments you extract from the text.

Rules:
- Prefer calling a function over chatting whenever the message clearly maps to an action (creating a group, adding an expense, settling a debt, listing groups/expenses, showing balances).
- "shared by everyone" / "split equally" / no split detail => just call add_expense with the amount and description; the server splits it equally among all members.
- Amounts may be written with currency words like "NIS"/"shekel"/"₪"; extract only the number.
- Never invent group names, member names, or amounts. If a required detail is missing or ambiguous, do NOT call a function — instead reply briefly asking the user for that one missing detail.
- Keep any text replies short and friendly.`;

/**
 * Reformats stored chat history into Gemini `contents`. Only plain-text turns
 * are kept (tool turns are reconstructed per request), so history stays small.
 */
const historyToContents = (history = []) =>
  history
    .filter((m) => m && typeof m.text === 'string' && m.text.trim())
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }],
    }));

const firstFunctionCall = (parts) => {
  const part = parts.find((p) => p.functionCall && p.functionCall.name);
  return part ? part.functionCall : null;
};

const joinText = (parts) =>
  parts
    .filter((p) => typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .trim();

/**
 * Asks Gemini to phrase the final confirmation after an action ran. Falls back
 * to a deterministic line if the second round fails for any reason, so a
 * successful action is never reported as a failure.
 */
const summarizeResult = async (contents, functionCall, result) => {
  const fallback = `Done: ${functionCall.name.replace(/_/g, ' ')}.`;
  try {
    const followUp = [
      ...contents,
      { role: 'model', parts: [{ functionCall }] },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: functionCall.name,
              response: { result },
            },
          },
        ],
      },
    ];

    const parts = await generateContent({
      systemInstruction: SYSTEM_INSTRUCTION,
      contents: followUp,
      tools: toolDeclarations,
    });
    return joinText(parts) || fallback;
  } catch (err) {
    return fallback;
  }
};

/**
 * Main entry point. Processes one chat message for one authenticated user.
 *
 * @param {string} userId   the authenticated user's id.
 * @param {string} message  the user's chat message.
 * @param {Array}  history  prior turns: [{ role:'user'|'assistant', text }].
 * @returns {Promise<{reply:string, action:Object|null, affectedGroupId:string|null}>}
 */
const chat = async (userId, message, history = []) => {
  const contents = [...historyToContents(history), { role: 'user', parts: [{ text: message }] }];

  const parts = await generateContent({
    systemInstruction: SYSTEM_INSTRUCTION,
    contents,
    tools: toolDeclarations,
  });

  const functionCall = firstFunctionCall(parts);

  // No action recognised: the model is asking a question or chatting.
  if (!functionCall) {
    return {
      reply: joinText(parts) || "I'm not sure what to do with that. Can you rephrase?",
      action: null,
      affectedGroupId: null,
    };
  }

  const args = functionCall.args || {};
  const result = await executeAction(functionCall.name, userId, args);
  const reply = await summarizeResult(contents, functionCall, result);

  return {
    reply,
    action: { name: functionCall.name, args, result },
    affectedGroupId: result.affectedGroupId || null,
  };
};

module.exports = { chat };
