/**
 * Action catalog for the AI assistant.
 *
 * This is the single source of truth that "coordinates" SplitIt's real
 * operations with the Gemini model. Every entry has two halves:
 *
 *   1. `declaration` — a Gemini functionDeclaration (name + natural-language
 *      description + JSON-schema parameters). This is what the model reads to
 *      decide, on its own, which action a free-text chat message maps to and
 *      what arguments to extract from it.
 *
 *   2. `execute(userId, args)` — the server-side handler that turns the model's
 *      chosen action + arguments into a real change by delegating to the
 *      existing domain services. It never touches req/res and always returns
 *      plain data (or throws an error carrying a `status`).
 *
 * Adding a new capability to the assistant is just adding a new entry here.
 */

const { createGroup, getUserActiveGroups } = require('./group.service');
const { addExpense, listGroupExpenses } = require('./expense.service');
const { settleDebt } = require('./settlement.service');
const { getDashboard } = require('./dashboard.service');
const { getGroupOverview } = require('./balance.service');
const { searchUsers } = require('./user.service');

const fullName = (u) => `${u.firstName} ${u.familyName}`.trim();

const clientError = (message, status = 400) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

/**
 * A message meant to be shown to the user as a normal, conversational assistant
 * reply (a confirmation question, a clarification, or a soft validation note) —
 * NOT as an error. The assistant service detects `assistantReply` and returns
 * `err.message` verbatim while stopping the action from running.
 */
const assistantAsk = (message) => {
  const err = new Error(message);
  err.assistantReply = true;
  return err;
};

/**
 * Normalises a name for tolerant matching: lowercase, trim, collapse spaces,
 * strip Hebrew niqqud/punctuation, and unify final-form Hebrew letters
 * (ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ) so typos like "דנה"/"דנא" still line up.
 */
const normalize = (str = '') =>
  str
    .toString()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0591-\u05C7]/g, '') // Hebrew niqqud / cantillation
    .replace(/[ךםןףץ]/g, (c) => ({ ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' }[c]))
    .replace(/[^\p{L}\p{N}\s@.]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Strips a single leading Hebrew one-letter prefix particle (ה/ו/ב/כ/ל/מ/ש —
 * "the/and/in/as/to/from/that") from the FIRST word, so a name the user wrote
 * with an attached preposition ("בדירה בתל אביב") still matches the stored group
 * ("דירה בתל אביב"). Only applied when something remains after stripping.
 */
const stripHePrefix = (str = '') => {
  const stripped = str.replace(/^[הובכלמש]/, '');
  return stripped.length >= 2 ? stripped : str;
};

/** Classic Levenshtein edit distance between two strings. */
const editDistance = (a, b) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const curr = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
};

/**
 * True when `candidate` is "close enough" to `needle` to count as the same name
 * despite a small spelling mistake. Tolerance scales with length: short names
 * allow 1 typo, longer names allow up to ~25% of their characters.
 */
const isFuzzyMatch = (needle, candidate) => {
  const a = normalize(needle);
  const b = normalize(candidate);
  if (!a || !b) return false;
  if (a === b || b.includes(a) || a.includes(b)) return true;
  const tolerance = Math.max(1, Math.floor(Math.max(a.length, b.length) * 0.25));
  return editDistance(a, b) <= tolerance;
};

/**
 * Resolves one of the user's active groups from a name the model extracted from
 * chat, using a three-step "soft validation" flow (messages in the user's
 * language via `ctx.he`):
 *
 *   Step A — Perfect match: an exact (normalised, case-insensitive) match
 *            continues immediately, no questions asked.
 *   Step B — High-confidence match: when there is no exact match but exactly ONE
 *            close (fuzzy) candidate, the agent acts autonomously and USES it —
 *            no "is that what you meant?" round-trip.
 *   Step C — Genuine ambiguity: only when several candidates match, or none do,
 *            it stops, lists the available groups, and asks the user to pick.
 */
const resolveGroup = async (userId, groupName, ctx = {}) => {
  const he = !!ctx.he;
  const groups = await getUserActiveGroups(userId);
  const allNames = () => groups.map((g) => g.groupName).join(', ');

  if (groups.length === 0) {
    throw assistantAsk(
      he
        ? 'עדיין אין לך קבוצות. אפשר ליצור קבוצה חדשה קודם.'
        : "You don't have any groups yet. Create one first."
    );
  }

  // No name supplied: only safe to proceed when there is exactly one group.
  if (!groupName) {
    if (groups.length === 1) return groups[0];
    throw assistantAsk(
      he
        ? `לאיזו קבוצה התכוונת? הקבוצות שלך: ${allNames()}.`
        : `Which group did you mean? Your groups: ${allNames()}.`
    );
  }

  const needle = normalize(groupName);
  const baseNeedle = stripHePrefix(needle);

  // STEP A — perfect match: continue immediately, without questions. Tolerant of
  // a leading Hebrew preposition on either side (e.g. "בדירה" === "דירה").
  const exact = groups.filter((g) => {
    const n = normalize(g.groupName);
    return n === needle || stripHePrefix(n) === baseNeedle;
  });
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    const names = exact.map((g) => g.groupName).join(', ');
    throw assistantAsk(
      he
        ? `יש לך כמה קבוצות עם השם הזה: ${names}. אפשר לדייק?`
        : `You have several groups with that exact name: ${names}. Please be more specific.`
    );
  }

  // No exact match — gather close (fuzzy) candidates.
  const fuzzy = groups.filter((g) => isFuzzyMatch(groupName, g.groupName));

  // STEP B — exactly one strong candidate: act autonomously and use it (no
  // confirmation round-trip). This is the "high-confidence => just do it" path.
  if (fuzzy.length === 1) {
    return fuzzy[0];
  }

  // STEP B2 — if the user supplied a manager/admin name instead of a group name,
  // resolve it from the active groups' admin names.
  const adminMatches = groups.filter((g) => {
    if (!g.adminId) return false;
    const adminName = fullName(g.adminId);
    return (
      isFuzzyMatch(groupName, adminName) ||
      isFuzzyMatch(groupName, g.adminId.firstName) ||
      isFuzzyMatch(groupName, g.adminId.familyName)
    );
  });
  if (adminMatches.length === 1) {
    return adminMatches[0];
  }
  if (adminMatches.length > 1) {
    const names = adminMatches
      .map((g) => `${g.groupName} (admin: ${fullName(g.adminId)})`)
      .join(', ');
    throw assistantAsk(
      he
        ? `יש כמה קבוצות עם שם מנהל זהה או דומה: ${names}. לאיזו התכוונת?`
        : `I found several groups whose manager matches that name: ${names}. Which one did you mean?`
    );
  }

  // STEP C — several candidates: list them and ask the user to pick.
  if (fuzzy.length > 1) {
    const names = fuzzy.map((g) => g.groupName).join(', ');
    throw assistantAsk(
      he
        ? `מצאתי כמה קבוצות דומות: ${names}. לאיזו התכוונת?`
        : `I found several similar groups: ${names}. Which one did you mean?`
    );
  }

  // STEP C — nothing matched: show what the user does have.
  throw assistantAsk(
    he
      ? `לא מצאתי קבוצה בשם "${groupName}". הקבוצות שלך: ${allNames()}.`
      : `I couldn't find a group named "${groupName}". Your groups: ${allNames()}.`
  );
};

/**
 * Resolves a person the user referenced by name or email into a real user id.
 * Prefers an exact email match, then an exact full-name match, then a single
 * search hit. Anything ambiguous throws a clarifying error.
 */
const resolveUser = async (query, excludeUserId, ctx = {}) => {
  const he = !!ctx.he;

  // Search the full query first; if a typo means it returns nothing, broaden the
  // net by searching each word separately (e.g. a correct surname can surface the
  // person even when the first name was misspelled) and de-duplicate the hits.
  let results = await searchUsers(query, excludeUserId);
  if (results.length === 0) {
    const tokens = query.split(/\s+/).filter((t) => t.trim().length >= 2);
    const seen = new Set();
    results = [];
    for (const token of tokens) {
      const hits = await searchUsers(token, excludeUserId);
      for (const u of hits) {
        if (!seen.has(String(u._id))) {
          seen.add(String(u._id));
          results.push(u);
        }
      }
    }
  }

  if (results.length === 0) {
    throw assistantAsk(
      he ? `לא מצאתי משתמש בשם "${query}".` : `I couldn't find anyone named "${query}".`
    );
  }

  const needle = normalize(query);

  // Exact email wins.
  const byEmail = results.find((u) => normalize(u.email) === needle);
  if (byEmail) return byEmail;

  // Exact (normalised) full-name match.
  const byName = results.filter((u) => normalize(fullName(u)) === needle);
  if (byName.length === 1) return byName[0];

  // A single search hit is good enough.
  if (results.length === 1) return results[0];

  // Fuzzy match against full name or first name to absorb small typos.
  const fuzzy = results.filter(
    (u) => isFuzzyMatch(query, fullName(u)) || isFuzzyMatch(query, u.firstName)
  );
  if (fuzzy.length === 1) return fuzzy[0];

  const people = results.map((u) => `${fullName(u)} (${u.email})`).join('; ');
  throw assistantAsk(
    he
      ? `"${query}" מתאים לכמה אנשים: ${people}. אפשר לכתוב שם מלא או אימייל?`
      : `"${query}" matches several people: ${people}. Please use a full name or email.`
  );
};

const actions = {
  create_group: {
    declaration: {
      name: 'create_group',
      description:
        'Create a brand new expense-sharing group owned by the current user and add other people to it. Use this when the user wants to start, open, or create a new group with some members.',
      parameters: {
        type: 'object',
        properties: {
          groupName: {
            type: 'string',
            description: 'The name for the new group, e.g. "Trip to Eilat" or "Apartment 4".',
          },
          members: {
            type: 'array',
            items: { type: 'string' },
            description:
              "Full names or email addresses of the OTHER people to add (do not include the current user; they are added automatically as admin). At least one is required.",
          },
        },
        required: ['groupName', 'members'],
      },
    },
    execute: async (userId, args = {}, ctx = {}) => {
      const he = !!ctx.he;
      const { groupName, members = [] } = args;
      if (!groupName) {
        throw assistantAsk(he ? 'איך לקרוא לקבוצה החדשה?' : 'What should the new group be called?');
      }
      if (!Array.isArray(members) || members.length === 0) {
        throw assistantAsk(
          he
            ? 'את מי להוסיף לקבוצה? צריך לפחות חבר/ה אחד/ת נוסף/ת.'
            : 'Who should I add to the group? At least one other person is required.'
        );
      }

      const resolved = [];
      for (const ref of members) {
        const user = await resolveUser(ref, userId, ctx);
        resolved.push(user);
      }
      const memberIds = [...new Set(resolved.map((u) => String(u._id)))];

      const group = await createGroup(userId, groupName, memberIds);
      return {
        groupId: String(group._id),
        groupName: group.groupName,
        groupCode: group.groupCode,
        members: resolved.map(fullName),
        affectedGroupId: String(group._id),
      };
    },
  },

  add_expense: {
    declaration: {
      name: 'add_expense',
      description:
        'Add a new expense to one of the current user\'s existing groups and split it among members. Use this whenever the user mentions spending or paying money that should be shared (e.g. "food expense for 50 NIS shared by everyone").',
      parameters: {
        type: 'object',
        properties: {
          groupName: {
            type: 'string',
            description:
              'Name of the existing group to add the expense to. Omit only if the user clearly has just one group.',
          },
          amount: {
            type: 'number',
            description: 'The total expense amount as a positive number, e.g. 50.',
          },
          description: {
            type: 'string',
            description: 'Short description of the expense, e.g. "Food", "Groceries", "Taxi".',
          },
          category: {
            type: 'string',
            description:
              'The expense category, inferred SEMANTICALLY from the message meaning (do not ask the user). Use a short label in the user\'s language, e.g. "אוכל"/"Food", "תחבורה"/"Transport", "בילוי"/"Entertainment", "דיור"/"Housing". The server matches it case-insensitively and creates it if new.',
          },
          participants: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Names or emails of the members who should share this expense. If provided, split the expense only among these members instead of everyone in the group.',
          },
          paidBy: {
            type: 'string',
            description:
              "Full name or email of the member who actually paid. Omit to default to the current user.",
          },
        },
        required: ['amount'],
      },
    },
    execute: async (userId, args = {}, ctx = {}) => {
      const he = !!ctx.he;
      const { groupName, amount, description, paidBy, category, participants } = args;
      if (!(amount > 0)) {
        throw assistantAsk(
          he ? 'מה סכום ההוצאה?' : 'What is the amount of the expense?'
        );
      }

      const group = await resolveGroup(userId, groupName, ctx);

      let payerId;
      if (paidBy) {
        const payer = await resolveUser(paidBy, null, ctx);
        payerId = String(payer._id);
      }

      let splits;
      if (Array.isArray(participants) && participants.length > 0) {
        const resolved = [];
        for (const ref of participants) {
          const user = await resolveUser(ref, null, ctx);
          resolved.push(user);
        }
        const uniqueIds = [...new Set(resolved.map((u) => String(u._id)))];
        if (uniqueIds.length === 0) {
          throw assistantAsk(
            he
              ? 'על מי לחלק את ההוצאה? כתוב לפחות שם אחד של חבר/ה בקבוצה.'
              : 'Who should share this expense? Please provide at least one group member.'
          );
        }
        const amountInAgorot = Math.round(amount * 100);
        const baseShare = Math.floor(amountInAgorot / uniqueIds.length);
        let remainder = amountInAgorot % uniqueIds.length;
        splits = uniqueIds.map((userId) => {
          const shareInAgorot = baseShare + (remainder > 0 ? 1 : 0);
          if (remainder > 0) remainder -= 1;
          return { userId, amount: shareInAgorot / 100 };
        });
      }

      // No `splits` => the expense service splits it equally among all active
      // members ("shared by everyone"), which is the common case. The category
      // name is resolved (find-or-create, case-insensitive) inside the service
      // transaction, so it never needs a separate request.
      const { expense, summary } = await addExpense(userId, {
        groupId: String(group._id),
        amount,
        description,
        payerId,
        categoryName: category,
        splits,
      });

      return {
        expenseId: String(expense._id),
        groupId: String(group._id),
        groupName: group.groupName,
        amount: expense.amount,
        description: expense.description || description || null,
        category: (category && String(category).trim()) || null,
        splitType: expense.splitType,
        groupTotalExpenses: summary.totalExpenses,
        avgPerPerson: summary.avgPerPerson,
        affectedGroupId: String(group._id),
      };
    },
  },

  settle_debt: {
    declaration: {
      name: 'settle_debt',
      description:
        'Mark a debt between the current user and another member of a group as paid/settled. Use when the user says they paid someone back or someone paid them.',
      parameters: {
        type: 'object',
        properties: {
          groupName: { type: 'string', description: 'Name of the group the debt belongs to.' },
          counterpart: {
            type: 'string',
            description: 'Full name or email of the other person in the debt.',
          },
        },
        required: ['counterpart'],
      },
    },
    execute: async (userId, args = {}, ctx = {}) => {
      const he = !!ctx.he;
      const { groupName, counterpart } = args;
      if (!counterpart) {
        throw assistantAsk(
          he ? 'עם מי החוב שתרצה/י לסגור?' : 'Who is the debt with?'
        );
      }

      const group = await resolveGroup(userId, groupName, ctx);
      const other = await resolveUser(counterpart, userId, ctx);

      const overview = await getGroupOverview(String(group._id), userId);
      const uid = String(userId);
      const oid = String(other._id);
      const match = overview.settlements.find((s) => {
        const from = String(s.from._id);
        const to = String(s.to._id);
        return (from === uid && to === oid) || (from === oid && to === uid);
      });

      if (!match) {
        throw assistantAsk(
          he
            ? `אין חוב פתוח בינך לבין ${fullName(other)} בקבוצה "${group.groupName}".`
            : `There is no open debt between you and ${fullName(other)} in "${group.groupName}".`
        );
      }

      const result = await settleDebt(userId, { settlementId: String(match.settlementId) });
      return {
        settlementId: String(result.settlementId),
        groupId: String(group._id),
        groupName: group.groupName,
        counterpart: fullName(other),
        amount: result.amount,
        affectedGroupId: String(group._id),
      };
    },
  },

  list_groups: {
    declaration: {
      name: 'list_groups',
      description:
        "List the current user's groups together with their overall balance and pending debts. Use for questions like 'what groups am I in' or 'how much do I owe overall'.",
      parameters: { type: 'object', properties: {} },
    },
    execute: async (userId, _args = {}, _ctx = {}) => {
      const dashboard = await getDashboard(userId);
      return {
        groupCount: dashboard.groupCount,
        netBalance: dashboard.netBalance,
        groups: dashboard.groups.map((g) => ({
          groupName: g.groupName,
          balance: g.balance,
          role: g.roleInGroup,
        })),
        totalIOwe: dashboard.pendingSettlements.totalIOwe,
        totalOwedToMe: dashboard.pendingSettlements.totalOwedToMe,
      };
    },
  },

  list_expenses: {
    declaration: {
      name: 'list_expenses',
      description:
        'List the recent expenses of one of the user\'s groups. Use for "show expenses in <group>" type requests.',
      parameters: {
        type: 'object',
        properties: {
          groupName: { type: 'string', description: 'Name of the group to list expenses for.' },
        },
      },
    },
    execute: async (userId, args = {}, ctx = {}) => {
      const group = await resolveGroup(userId, args.groupName, ctx);
      const expenses = await listGroupExpenses(String(group._id), userId);
      return {
        groupName: group.groupName,
        count: expenses.length,
        expenses: expenses.slice(0, 15).map((e) => ({
          amount: e.amount,
          description: e.description || null,
          category: e.categoryId && e.categoryId.name,
          paidBy: e.payerId ? `${e.payerId.firstName} ${e.payerId.familyName}` : null,
          date: e.date,
        })),
      };
    },
  },

  get_group_overview: {
    declaration: {
      name: 'get_group_overview',
      description:
        'Get a full balance overview of one group: each member\'s balance and who owes whom. Use for "who owes who in <group>" or "show balances".',
      parameters: {
        type: 'object',
        properties: {
          groupName: { type: 'string', description: 'Name of the group to summarise.' },
        },
      },
    },
    execute: async (userId, args = {}, ctx = {}) => {
      const group = await resolveGroup(userId, args.groupName, ctx);
      const overview = await getGroupOverview(String(group._id), userId);
      return {
        groupName: overview.group.groupName,
        totalExpenses: overview.group.totalExpenses,
        avgPerPerson: overview.group.avgPerPerson,
        memberCount: overview.group.memberCount,
        members: overview.members.map((m) => ({
          name: `${m.user.firstName} ${m.user.familyName}`,
          balance: m.balance,
        })),
        transfers: overview.settlements.map((s) => ({
          from: `${s.from.firstName} ${s.from.familyName}`,
          to: `${s.to.firstName} ${s.to.familyName}`,
          amount: s.amount,
        })),
      };
    },
  },
};

// Tool list in the exact shape Gemini expects: a single tool exposing all
// function declarations.
const toolDeclarations = [
  { functionDeclarations: Object.values(actions).map((a) => a.declaration) },
];

/**
 * Executes a model-selected action by name. Throws a 400 if the model invents
 * an unknown action (defensive — the model is constrained to the declarations).
 */
const executeAction = async (name, userId, args, ctx = {}) => {
  const action = actions[name];
  if (!action) throw clientError(`פעולה לא מוכרת: "${name}".`, 400);
  return action.execute(userId, args || {}, ctx);
};

module.exports = { actions, toolDeclarations, executeAction };
