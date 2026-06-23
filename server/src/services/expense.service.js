const mongoose = require('mongoose');

const Category = require('../models/Category.model');
const Expense = require('../models/Expense.model');
const Group = require('../models/Group.model');
const GroupMember = require('../models/GroupMember.model');
const Payment = require('../models/Payment.model');
const Settlement = require('../models/Settlement.model');
const { simplifyDebts } = require('../utils/debtSimplification');

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Resolves the category for an expense inside the active transaction:
 *  - If a categoryId is supplied, verifies it exists (400 otherwise).
 *  - If omitted, finds-or-creates the configurable default category so every
 *    expense always carries a category. Uses an upsert to stay atomic and
 *    collision-safe under the unique name index.
 */
const resolveCategoryId = async (categoryId, session) => {
  if (categoryId) {
    const exists = await Category.exists({ _id: categoryId }).session(session);
    if (!exists) {
      const err = new Error('Category not found');
      err.status = 400;
      throw err;
    }
    return categoryId;
  }

  const defaultName = process.env.DEFAULT_CATEGORY_NAME || 'General';
  const category = await Category.findOneAndUpdate(
    { name: defaultName },
    { $setOnInsert: { name: defaultName } },
    { new: true, upsert: true, session, collation: { locale: 'en', strength: 2 } }
  );
  return category._id;
};

/**
 * Recomputes the entire financial state of a group from its expenses, inside the
 * given transaction session:
 *   1. Net balance per active member (paid − fair share).
 *   2. Confirmed payments applied on top, so already-settled debts stay settled
 *      across recalculations.
 *   3. Group totals (totalExpenses, avgPerPerson).
 *   4. The simplified settlement graph (shortest set of transfers) for whatever
 *      debt remains. Settled settlement records are preserved as immutable history.
 * Balances and settlements are persisted so reads stay cheap.
 */
const recalculateGroup = async (groupId, session) => {
  const [expenses, members, payments] = await Promise.all([
    Expense.find({ groupId }).session(session).lean(),
    GroupMember.find({ groupId, status: 'Active' }).session(session).lean(),
    Payment.find({ groupId, isConfirmed: true }).session(session).lean(),
  ]);

  const balances = new Map(members.map((m) => [String(m.userId), 0]));
  let totalExpenses = 0;

  for (const exp of expenses) {
    // Prefer the per-participant shares stored on the expense (supports unequal
    // splits). Fall back to an equal split for legacy expenses saved without them.
    let shares;
    if (Array.isArray(exp.splits) && exp.splits.length > 0) {
      shares = exp.splits.map((s) => ({ userId: String(s.userId), share: s.share }));
    } else {
      const participants = (exp.participants || []).map(String);
      if (participants.length === 0) continue;
      const equalShare = exp.amount / participants.length;
      shares = participants.map((userId) => ({ userId, share: equalShare }));
    }

    totalExpenses += exp.amount;

    const payer = String(exp.payerId);
    balances.set(payer, (balances.get(payer) || 0) + exp.amount);
    for (const { userId, share } of shares) {
      balances.set(userId, (balances.get(userId) || 0) - share);
    }
  }

  // Apply confirmed payments: a payment (from → to) means the debtor already paid
  // the creditor, so it shrinks both sides toward zero. Only adjust when both
  // parties are still active members so the active-member graph stays balanced.
  for (const p of payments) {
    const from = String(p.fromUserId);
    const to = String(p.toUserId);
    if (!balances.has(from) || !balances.has(to)) continue;
    balances.set(from, balances.get(from) + p.amount);
    balances.set(to, balances.get(to) - p.amount);
  }

  const memberCount = members.length;
  const avgPerPerson = memberCount > 0 ? totalExpenses / memberCount : 0;

  await Group.updateOne(
    { _id: groupId },
    { $set: { totalExpenses: round2(totalExpenses), avgPerPerson: round2(avgPerPerson) } },
    { session }
  );

  if (members.length > 0) {
    const memberOps = members.map((m) => ({
      updateOne: {
        filter: { _id: m._id },
        update: { $set: { balance: round2(balances.get(String(m.userId)) || 0) } },
      },
    }));
    await GroupMember.bulkWrite(memberOps, { session });
  }

  const balanceList = members.map((m) => ({
    userId: String(m.userId),
    amount: balances.get(String(m.userId)) || 0,
  }));
  const settlements = simplifyDebts(balanceList);

  // Only the open (recomputable) edges are replaced; settled settlements are
  // immutable history and must survive recalculation.
  await Settlement.deleteMany({ groupId, isSettled: false }, { session });
  if (settlements.length > 0) {
    await Settlement.insertMany(
      settlements.map((s) => ({
        groupId,
        fromUserId: s.fromUserId,
        toUserId: s.toUserId,
        amount: s.amount,
        isSettled: false,
      })),
      { session }
    );
  }

  return {
    totalExpenses: round2(totalExpenses),
    avgPerPerson: round2(avgPerPerson),
    transfersCount: settlements.length,
  };
};

/**
 * Adds an expense and atomically recalculates balances + the simplified debt
 * graph for the group. Everything happens in a single transaction so balances
 * are never left inconsistent with the expense list.
 */
const addExpense = async (
  requesterId,
  { groupId, amount, description, categoryId, payerId, date, splits }
) => {
  if (!mongoose.isValidObjectId(groupId)) {
    const err = new Error('Invalid group id');
    err.status = 400;
    throw err;
  }

  const payer = payerId || requesterId;

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const group = await Group.findById(groupId).session(session).lean();
    if (!group || !group.isActive) {
      const err = new Error('Group not found or inactive');
      err.status = 404;
      throw err;
    }

    const members = await GroupMember.find({ groupId, status: 'Active' }).session(session).lean();
    const memberIds = new Set(members.map((m) => String(m.userId)));

    if (!memberIds.has(String(requesterId))) {
      const err = new Error('You are not a member of this group');
      err.status = 403;
      throw err;
    }
    if (!memberIds.has(String(payer))) {
      const err = new Error('Payer must be an active member of the group');
      err.status = 400;
      throw err;
    }

    // --- הנה השינוי כאן ---
    let expenseSplits;
    let splitType;
    // נשתמש בכל חברי הקבוצה כברירת מחדל, ללא קשר אם שלחו splits או לא
    const participants = members.map((m) => m.userId);

    if (splits && splits.length > 0) {
      // אם שלחו splits ספציפיים, נוודא שהם חברים בקבוצה
      for (const s of splits) {
        if (!memberIds.has(String(s.userId))) {
          const err = new Error('Every split participant must be an active member of the group');
          err.status = 400;
          throw err;
        }
      }
      expenseSplits = splits.map((s) => ({ userId: s.userId, share: round2(s.amount) }));
      splitType = 'custom';
    } else {
      // חלוקה אוטומטית שווה בשווה לכל חברי הקבוצה.
      // כדי להימנע משגיאות עיגול בנקודה הצפה, עובדים באגורות (מספרים שלמים):
      // ממירים לאגורות, מחלקים בחלוקה שלמה, ומפזרים את השארית אגורה-אגורה.
      const amountInAgorot = Math.round(amount * 100);
      const count = participants.length;
      const baseShare = Math.floor(amountInAgorot / count);
      let remainder = amountInAgorot % count;

      expenseSplits = participants.map((userId) => {
        const shareInAgorot = baseShare + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder -= 1;
        return { userId, share: shareInAgorot / 100 };
      });
      splitType = 'equal';
    }
    // --- סוף השינוי ---

    const resolvedCategoryId = await resolveCategoryId(categoryId, session);

    const [expense] = await Expense.create(
      [
        {
          groupId,
          payerId: payer,
          amount,
          description,
          categoryId: resolvedCategoryId,
          splitType,
          participants,
          splits: expenseSplits,
          date: date || new Date(),
        },
      ],
      { session }
    );

    const summary = await recalculateGroup(groupId, session);

    await session.commitTransaction();
    return { expense, summary };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};
/**
 * Lists a group's expenses (newest first) for an active member.
 */
const listGroupExpenses = async (groupId, userId) => {
  if (!mongoose.isValidObjectId(groupId)) {
    const err = new Error('Invalid group id');
    err.status = 400;
    throw err;
  }

  const membership = await GroupMember.findOne({ groupId, userId, status: 'Active' }).lean();
  if (!membership) {
    const err = new Error('You are not a member of this group');
    err.status = 403;
    throw err;
  }

  const expenses = await Expense.find({ groupId })
    .populate('payerId', 'firstName familyName email')
    .populate('categoryId', 'name')
    .sort({ date: -1 })
    .lean();

  return expenses;
};

module.exports = { addExpense, listGroupExpenses, recalculateGroup };
