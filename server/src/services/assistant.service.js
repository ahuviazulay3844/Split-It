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

const SYSTEM_INSTRUCTION = `You are SplitIt's in-app assistant — an AUTONOMOUS agent. SplitIt lets people share group expenses and settle debts.
Your job: read the user's message together with the whole conversation so far and, whenever the intent maps to an action, CALL that function with the arguments you infer. Strongly prefer acting over asking.

LANGUAGE:
- Always reply in the SAME language the user wrote in (Hebrew or English), in a short, warm tone.

AUTONOMY — ACT, DON'T INTERROGATE:
- When the amount, the target group, and the category are present OR can be inferred with high confidence from the message + recent conversation, perform the action DIRECTLY.
- Do NOT ask "are you sure?" and do NOT ask the user to confirm details you can reasonably infer.
- Ask ONE short question ONLY when a required detail is genuinely missing and cannot be inferred (e.g. an expense with no amount at all), or when the target is truly ambiguous between several real options.

CONTEXT INFERENCE (infer the group from the conversation, not just the last line):
- Location/activity hints map to the matching group. Examples: "אני בים המלח" → the group about a Dead Sea / vacation trip; "בסופר" / "at the supermarket" → the relevant household/shared group; "בטיול" → the trip group. Use group names, people, and places mentioned earlier in the chat.
- If the context metadata says the user is viewing a specific group page, treat THAT group as the target by default.
- Only when nothing in the conversation points to a group AND there is more than one candidate should you ask which group.

CASE-INSENSITIVE, TOLERANT MATCHING:
- Group-name matching is CASE-INSENSITIVE and tolerant of spelling and Hebrew-prefix differences. Pass the name roughly as the user wrote it (any casing) and let the server match it. If exactly one group clearly fits, use it without asking.

AUTOMATIC CATEGORIZATION (semantic — never ask):
- For every expense, infer a category from the MEANING of the text and pass it as the \`category\` argument. Do NOT ask the user for a category.
- Guidance (Hebrew examples; use an English label for English messages): מסעדה/אוכל/סופר/קפה → "אוכל"; מונית/דלק/רכבת/אוטובוס/חניה → "תחבורה"; סרט/בר/הופעה/משחק → "בילוי"; שכירות/חשמל/מים/ארנונה → "דיור"; קניות/בגדים → "קניות". If nothing fits, use a short sensible label like "כללי"/"General".

EXPENSE SPLITTING:
- "שווה בשווה" / "משותף לכולם" / "split equally" / no split detail => call add_expense with the amount (+ description + inferred category); the server splits equally among all members.
- Amounts may include currency words ("ש"ח", "שקל", "NIS", "₪") — extract only the number.

CONFIRMATIONS (only when the server explicitly asks):
- If the server replies that it found a similar group and asks "Is that what you meant?", and the user then confirms (e.g. "yes", "yep", "כן", "נכון", "בדיוק"), call the SAME action again using the EXACT group name the server suggested, together with the details from the earlier message (amount, description, category, etc.).`;

// How many prior turns to keep as context. Configurable so the conversation is
// effectively unlimited; a large default keeps long chats coherent while still
// protecting the token budget. Set ASSISTANT_HISTORY_TURNS=0 to keep ALL turns.
const HISTORY_TURNS = (() => {
  const raw = process.env.ASSISTANT_HISTORY_TURNS;
  if (raw === undefined || raw === '') return 50;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 50;
})();

// Smart-retry knobs for transient Gemini "busy"/"rate" responses (not daily quota).
const ASSISTANT_MAX_RETRIES = Number(process.env.ASSISTANT_MAX_RETRIES) || 2;
const ASSISTANT_MAX_RETRY_WAIT_MS = Number(process.env.ASSISTANT_MAX_RETRY_WAIT_MS) || 4000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

/** User-facing message when Gemini is unavailable (quota / rate / overload). */
const busyMessage = (message, err = {}) => {
  const he = isHebrew(message);
  const kind = err.quotaKind || 'rate';
  const secs = err.retryAfterMs ? Math.ceil(err.retryAfterMs / 1000) : null;

  if (kind === 'daily') {
    return he
      ? 'הגעת למכסה היומית של Gemini בחינם (כ־20 בקשות ביום למודל). המכסה מתאפסת בחצות לפי שעון קליפורניה. נסו מחר, או צרו מפתח API חדש ב-AI Studio / הפעילו חיוב.'
      : 'You hit the free Gemini daily quota (~20 requests/day per model). It resets at midnight Pacific Time. Try again tomorrow, or create a new API key in AI Studio / enable billing.';
  }

  if (kind === 'busy') {
    return he
      ? secs
        ? `השירות של Google עמוס כרגע. נסו שוב בעוד כ-${secs} שניות.`
        : 'השירות של Google עמוס כרגע. נסו שוב בעוד רגע.'
      : secs
        ? `Google's service is busy right now. Please try again in ~${secs}s.`
        : "Google's service is busy right now. Please try again in a moment.";
  }

  // Per-minute rate limit — short wait actually helps here.
  return he
    ? secs
      ? `יותר מדי בקשות ברגע זה. נסו שוב בעוד כ-${secs} שניות.`
      : 'יותר מדי בקשות ברגע זה. נסו שוב בעוד רגע.'
    : secs
      ? `Too many requests right now. Please try again in ~${secs}s.`
      : 'Too many requests right now. Please try again in a moment.';
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
          }${result.category ? ` · קטגוריה: ${result.category}` : ''} בקבוצה "${
            result.groupName
          }", מחולק שווה בשווה. סך ההוצאות בקבוצה: ${ils(result.groupTotalExpenses)}.`
        : `Added an expense of ${ils(result.amount)}${
            result.description ? ` (${result.description})` : ''
          }${result.category ? ` · category: ${result.category}` : ''} in "${
            result.groupName
          }", split equally. Group total: ${ils(result.groupTotalExpenses)}.`;
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
 * Calls Gemini with a smart, bounded retry so a busy/overloaded server doesn't
 * kill the conversation. Transient 429s ('busy' / per-minute 'rate') are retried
 * a few times, honouring the server-suggested wait (capped). A 'daily' quota hit
 * is NOT retried (waiting can't reset it) and is re-thrown immediately so the
 * caller can degrade to a friendly message. Non-429 errors bubble up unchanged.
 */
const generateWithRetry = async (payload) => {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await generateContent(payload);
    } catch (err) {
      const retryable = err.status === 429 && err.quotaKind !== 'daily';
      if (!retryable || attempt >= ASSISTANT_MAX_RETRIES) {
        throw err;
      }
      // Wait what the server asked for (or a short default), capped so a single
      // chat never blocks for long. Sleeping past the client-side cooldown also
      // lets the next generateContent proceed.
      const wait = Math.min(err.retryAfterMs || 1000, ASSISTANT_MAX_RETRY_WAIT_MS);
      attempt += 1;
      await sleep(wait);
    }
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
  // The conversation length itself is unlimited; we only bound how many prior
  // turns we resend as context (0 = keep all). This protects the token budget
  // without ever capping how many messages a user can send.
  const recentHistory = HISTORY_TURNS > 0 ? history.slice(-HISTORY_TURNS) : history;
  const contents = [...historyToContents(recentHistory), { role: 'user', parts: [{ text: message }] }];

  let parts;
  try {
    parts = await generateWithRetry({
      systemInstruction: SYSTEM_INSTRUCTION,
      contents,
      tools: toolDeclarations,
    });
  } catch (err) {
    // Every attempt hit a rate/busy/quota wall: degrade to a friendly "busy"
    // reply instead of crashing the conversation with a raw quota dump.
    if (err.status === 429) {
      return { reply: busyMessage(message, err), action: null, affectedGroupId: null };
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
