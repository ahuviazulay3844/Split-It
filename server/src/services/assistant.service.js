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
Read the user's message and, when it clearly maps to one action, call that function with arguments you extract from the text.

LANGUAGE:
- Always reply in the SAME language the user wrote in (Hebrew or English), in a short, warm tone.

ACT ONLY WHEN THE DATA IS CLEAR (autonomy):
- Only call a function when the intent AND the required details are unambiguous.
- Never guess or invent a group name, a person, or an amount. If the group/person is unclear or a required detail is missing, do NOT call a function — ask ONE short, focused question instead.

CONFIRMATIONS:
- The server may reply that it found a similar group and ask "Is that what you meant?". If the user then confirms (e.g. "yes", "yep", "כן", "נכון", "בדיוק"), call the SAME action again using the EXACT group name the server suggested, together with the details from the earlier message (amount, description, etc.).
- Pass names roughly as the user wrote them; the server matches small typos and asks for confirmation when needed.

HINTS:
- "שווה בשווה" / "משותף לכולם" / "split equally" / no split detail => just call add_expense with the amount (and description); the server splits equally among all members.
- Amounts may include currency words ("ש"ח", "שקל", "NIS", "₪") — extract only the number.`;

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

const isHebrew = (text) => /[\u0590-\u05FF]/.test(text || '');

/** Friendly "too many requests right now" message in the user's language. */
const busyMessage = (message, retryAfterMs) => {
  const secs = retryAfterMs ? Math.ceil(retryAfterMs / 1000) : null;
  if (isHebrew(message)) {
    return secs
      ? `אני קצת עמוס כרגע 🙏 נסו שוב בעוד כ-${secs} שניות.`
      : 'אני קצת עמוס כרגע 🙏 נסו שוב בעוד רגע.';
  }
  return secs
    ? `I'm a bit busy right now 🙏 please try again in ~${secs}s.`
    : "I'm a bit busy right now 🙏 please try again in a moment.";
};

const ils = (n) => `₪${Number(n || 0).toFixed(2)}`;

/**
 * Builds the final confirmation in the user's language (Hebrew or English),
 * deterministically, from the action result.
 *
 * This deliberately uses NO extra Gemini call: the whole chat costs exactly one
 * API request (the action-recognition call), which halves quota usage and means
 * the confirmation never fails on a rate limit. Language follows the user's input.
 */
const summarizeResult = (name, result = {}, message) => {
  const he = isHebrew(message);
  switch (name) {
    case 'create_group':
      return he
        ? `הקבוצה "${result.groupName}" נוצרה! 🎉 חברים: ${
            (result.members || []).join(', ') || '—'
          }. קוד הצטרפות: ${result.groupCode}.`
        : `Group "${result.groupName}" created! 🎉 Members: ${
            (result.members || []).join(', ') || '—'
          }. Join code: ${result.groupCode}.`;
    case 'add_expense':
      return he
        ? `נוספה הוצאה של ${ils(result.amount)}${
            result.description ? ` (${result.description})` : ''
          } בקבוצה "${result.groupName}", מחולק שווה בשווה. סך ההוצאות בקבוצה: ${ils(
            result.groupTotalExpenses
          )}.`
        : `Added an expense of ${ils(result.amount)}${
            result.description ? ` (${result.description})` : ''
          } in "${result.groupName}", split equally. Group total: ${ils(
            result.groupTotalExpenses
          )}.`;
    case 'settle_debt':
      return he
        ? `סגרתי את החוב מול ${result.counterpart} בקבוצה "${result.groupName}" על סך ${ils(
            result.amount
          )}. ✅`
        : `Settled the debt with ${result.counterpart} in "${result.groupName}" for ${ils(
            result.amount
          )}. ✅`;
    case 'list_groups': {
      if (!result.groupCount) {
        return he
          ? 'אין לך עדיין קבוצות, אבל אפשר לפתוח אחת בקלות! 😊'
          : "You don't have any groups yet — easy to create one! 😊";
      }
      const lines = (result.groups || [])
        .map((groupItem) => `• ${groupItem.groupName}: ${ils(groupItem.balance)}`)
        .join('\n');
      return he
        ? `יש לך ${result.groupCount} קבוצות. מאזן נטו: ${ils(result.netBalance)}.\n${lines}`
        : `You have ${result.groupCount} groups. Net balance: ${ils(
            result.netBalance
          )}.\n${lines}`;
    }
    case 'list_expenses': {
      if (!result.count) {
        return he
          ? `אין הוצאות בקבוצה "${result.groupName}" עדיין.`
          : `No expenses in "${result.groupName}" yet.`;
      }
      const lines = (result.expenses || [])
        .slice(0, 10)
        .map((e) => `• ${ils(e.amount)}${e.description ? ` — ${e.description}` : ''}`)
        .join('\n');
      return he
        ? `ההוצאות האחרונות בקבוצה "${result.groupName}":\n${lines}`
        : `Recent expenses in "${result.groupName}":\n${lines}`;
    }
    case 'get_group_overview': {
      const transfers = (result.transfers || [])
        .map((t) => `• ${t.from} → ${t.to}: ${ils(t.amount)}`)
        .join('\n');
      if (he) {
        const head = `סקירת "${result.groupName}" — סה"כ הוצאות ${ils(result.totalExpenses)}, ${
          result.memberCount
        } חברים.`;
        return transfers ? `${head}\nמי חייב למי:\n${transfers}` : `${head}\nכולם מאוזנים! 🎯`;
      }
      const head = `Overview of "${result.groupName}" — total ${ils(result.totalExpenses)}, ${
        result.memberCount
      } members.`;
      return transfers ? `${head}\nWho owes whom:\n${transfers}` : `${head}\nEveryone is settled! 🎯`;
    }
    default:
      return he ? 'בוצע ✓' : 'Done ✓';
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

  let parts;
  try {
    parts = await generateContent({
      systemInstruction: SYSTEM_INSTRUCTION,
      contents,
      tools: toolDeclarations,
    });
  } catch (err) {
    // Out of free-tier quota: degrade to a friendly "busy" reply instead of an
    // error, so the chat never shows Google's raw quota dump.
    if (err.status === 429) {
      return { reply: busyMessage(message, err.retryAfterMs), action: null, affectedGroupId: null };
    }
    throw err;
  }

  const functionCall = firstFunctionCall(parts);

  // No action recognised: the model is asking a question or chatting.
  if (!functionCall) {
    return {
      reply:
        joinText(parts) ||
        (/[\u0590-\u05FF]/.test(message || '')
          ? 'לא הבנתי בדיוק מה לעשות. אפשר לנסח קצת אחרת?'
          : "I'm not sure what to do with that. Can you rephrase?"),
      action: null,
      affectedGroupId: null,
    };
  }

  const args = functionCall.args || {};

  let result;
  try {
    result = await executeAction(functionCall.name, userId, args, { he: isHebrew(message) });
  } catch (err) {
    // Soft validation: confirmation questions and clarifications are not errors —
    // they are conversational replies (already in the user's language). Return
    // them as a normal reply so the chat can continue (and no action runs).
    if (err.assistantReply) {
      return { reply: err.message, action: null, affectedGroupId: null };
    }
    throw err;
  }

  const reply = summarizeResult(functionCall.name, result, message);

  return {
    reply,
    action: { name: functionCall.name, args, result },
    affectedGroupId: result.affectedGroupId || null,
  };
};

module.exports = { chat, SYSTEM_INSTRUCTION };
