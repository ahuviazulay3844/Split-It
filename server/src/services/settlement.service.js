const mongoose = require('mongoose');

const GroupMember = require('../models/GroupMember.model');
const Payment = require('../models/Payment.model');
const Settlement = require('../models/Settlement.model');

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Settles one debt edge atomically. In a single transaction it:
 *   1. Marks the Settlement as settled.
 *   2. Moves both participants' net balances toward zero (payer += amount,
 *      recipient −= amount).
 *   3. Records a confirmed Payment for the audit trail.
 * Any failure aborts the whole operation, so balances can never drift out of
 * sync with the settlement state.
 *
 * Only a participant of the debt (payer or recipient) may settle it.
 */
const settleDebt = async (requesterId, { settlementId }) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const settlement = await Settlement.findById(settlementId).session(session);
    if (!settlement) {
      const err = new Error('Settlement not found');
      err.status = 404;
      throw err;
    }
    if (settlement.isSettled) {
      const err = new Error('This debt is already settled');
      err.status = 409;
      throw err;
    }

    const { groupId, fromUserId, toUserId, amount } = settlement;

    const requester = String(requesterId);
    if (requester !== String(fromUserId) && requester !== String(toUserId)) {
      const err = new Error('Only a participant of this debt can settle it');
      err.status = 403;
      throw err;
    }

    const [from, to] = await Promise.all([
      GroupMember.findOne({ groupId, userId: fromUserId, status: 'Active' }).session(session),
      GroupMember.findOne({ groupId, userId: toUserId, status: 'Active' }).session(session),
    ]);

    if (!from || !to) {
      const err = new Error('Both participants must be active members of the group');
      err.status = 400;
      throw err;
    }

    settlement.isSettled = true;
    await settlement.save({ session });

    // Payer's debt shrinks (balance up); recipient's credit shrinks (balance down).
    from.balance = round2(from.balance + amount);
    to.balance = round2(to.balance - amount);
    await Promise.all([from.save({ session }), to.save({ session })]);

    const [payment] = await Payment.create(
      [{ groupId, fromUserId, toUserId, amount, isConfirmed: true }],
      { session }
    );

    await session.commitTransaction();
    return {
      settlementId: settlement._id,
      groupId,
      fromUserId,
      toUserId,
      amount,
      paymentId: payment._id,
    };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

module.exports = { settleDebt };
