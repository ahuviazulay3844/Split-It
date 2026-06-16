const Settlement = require('../models/Settlement.model');
const { getUserActiveGroups } = require('./group.service');

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Builds a unified dashboard for one user in a single efficient pass:
 *  - every active group they belong to (enriched with their role + balance),
 *  - their net balance across all groups,
 *  - a summary of their pending (unsettled) settlements.
 *
 * Reads only; never touches req/res. Returns a plain aggregated object.
 */
const getDashboard = async (userId) => {
  // Reuse the single source of truth for "user's active groups".
  const groups = await getUserActiveGroups(userId);
  const groupIds = groups.map((g) => g._id);

  const netBalance = round2(groups.reduce((sum, g) => sum + (g.balance || 0), 0));

  // One query for every unsettled edge that involves the user in their groups.
  const settlements = groupIds.length
    ? await Settlement.find({
        groupId: { $in: groupIds },
        isSettled: false,
        $or: [{ fromUserId: userId }, { toUserId: userId }],
      })
        .populate('fromUserId', 'firstName familyName email')
        .populate('toUserId', 'firstName familyName email')
        .lean()
    : [];

  const uid = String(userId);

  const iOwe = settlements
    .filter((s) => String(s.fromUserId._id) === uid)
    .map((s) => ({ groupId: s.groupId, to: s.toUserId, amount: s.amount }));

  const owedToMe = settlements
    .filter((s) => String(s.toUserId._id) === uid)
    .map((s) => ({ groupId: s.groupId, from: s.fromUserId, amount: s.amount }));

  const totalIOwe = round2(iOwe.reduce((sum, x) => sum + x.amount, 0));
  const totalOwedToMe = round2(owedToMe.reduce((sum, x) => sum + x.amount, 0));

  return {
    groupCount: groups.length,
    netBalance,
    groups,
    pendingSettlements: {
      count: settlements.length,
      totalIOwe,
      totalOwedToMe,
      iOwe,
      owedToMe,
    },
  };
};

module.exports = { getDashboard };
