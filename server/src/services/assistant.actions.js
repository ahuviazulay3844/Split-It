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
 * Resolves one of the user's active groups from a (possibly fuzzy) name the
 * model extracted from chat. Exact case-insensitive match wins; otherwise a
 * single "contains" match is accepted. Ambiguity/no-match throws a clarifying
 * error so the assistant can ask the user to be more specific.
 */
const resolveGroup = async (userId, groupName) => {
  const groups = await getUserActiveGroups(userId);
  if (groups.length === 0) {
    throw clientError('You are not a member of any group yet. Create one first.');
  }
  if (!groupName) {
    if (groups.length === 1) return groups[0];
    throw clientError(
      `Which group? You belong to: ${groups.map((g) => g.groupName).join(', ')}.`
    );
  }

  const needle = groupName.trim().toLowerCase();
  const exact = groups.filter((g) => g.groupName.toLowerCase() === needle);
  if (exact.length === 1) return exact[0];

  const partial = groups.filter((g) => g.groupName.toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0];

  if (exact.length + partial.length === 0) {
    throw clientError(
      `No group named "${groupName}". Your groups: ${groups
        .map((g) => g.groupName)
        .join(', ')}.`
    );
  }
  throw clientError(
    `"${groupName}" matches more than one group: ${[...exact, ...partial]
      .map((g) => g.groupName)
      .join(', ')}. Please be more specific.`
  );
};

/**
 * Resolves a person the user referenced by name or email into a real user id.
 * Prefers an exact email match, then an exact full-name match, then a single
 * search hit. Anything ambiguous throws a clarifying error.
 */
const resolveUser = async (query, excludeUserId) => {
  const results = await searchUsers(query, excludeUserId);
  if (results.length === 0) {
    throw clientError(`No user found matching "${query}".`);
  }

  const needle = query.trim().toLowerCase();
  const byEmail = results.find((u) => u.email.toLowerCase() === needle);
  if (byEmail) return byEmail;

  const byName = results.filter((u) => fullName(u).toLowerCase() === needle);
  if (byName.length === 1) return byName[0];

  if (results.length === 1) return results[0];

  throw clientError(
    `"${query}" matches several people: ${results
      .map((u) => `${fullName(u)} (${u.email})`)
      .join('; ')}. Use a full name or email.`
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
    execute: async (userId, args = {}) => {
      const { groupName, members = [] } = args;
      if (!groupName) throw clientError('A group name is required to create a group.');
      if (!Array.isArray(members) || members.length === 0) {
        throw clientError('Add at least one other member to create a group.');
      }

      const resolved = [];
      for (const ref of members) {
        const user = await resolveUser(ref, userId);
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
          paidBy: {
            type: 'string',
            description:
              "Full name or email of the member who actually paid. Omit to default to the current user.",
          },
        },
        required: ['amount'],
      },
    },
    execute: async (userId, args = {}) => {
      const { groupName, amount, description, paidBy } = args;
      if (!(amount > 0)) throw clientError('Expense amount must be a positive number.');

      const group = await resolveGroup(userId, groupName);

      let payerId;
      if (paidBy) {
        const payer = await resolveUser(paidBy, null);
        payerId = String(payer._id);
      }

      // No `splits` => the expense service splits it equally among all active
      // members ("shared by everyone"), which is the common case.
      const { expense, summary } = await addExpense(userId, {
        groupId: String(group._id),
        amount,
        description,
        payerId,
      });

      return {
        expenseId: String(expense._id),
        groupId: String(group._id),
        groupName: group.groupName,
        amount: expense.amount,
        description: expense.description || description || null,
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
    execute: async (userId, args = {}) => {
      const { groupName, counterpart } = args;
      if (!counterpart) throw clientError('Tell me who the debt is with to settle it.');

      const group = await resolveGroup(userId, groupName);
      const other = await resolveUser(counterpart, userId);

      const overview = await getGroupOverview(String(group._id), userId);
      const uid = String(userId);
      const oid = String(other._id);
      const match = overview.settlements.find((s) => {
        const from = String(s.from._id);
        const to = String(s.to._id);
        return (from === uid && to === oid) || (from === oid && to === uid);
      });

      if (!match) {
        throw clientError(
          `There is no open debt between you and ${fullName(other)} in "${group.groupName}".`
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
    execute: async (userId) => {
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
    execute: async (userId, args = {}) => {
      const group = await resolveGroup(userId, args.groupName);
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
    execute: async (userId, args = {}) => {
      const group = await resolveGroup(userId, args.groupName);
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
const executeAction = async (name, userId, args) => {
  const action = actions[name];
  if (!action) throw clientError(`Unknown action "${name}".`, 400);
  return action.execute(userId, args || {});
};

module.exports = { actions, toolDeclarations, executeAction };
