const mongoose = require('mongoose');

const Group = require('../models/Group.model');
const GroupMember = require('../models/GroupMember.model');
const Settlement = require('../models/Settlement.model');

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Verifies the user is an active member of the group and returns the membership.
 * Throws 400 on a malformed id and 403 if the user does not belong to the group.
 */
const assertActiveMember = async (groupId, userId) => {
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
  return membership;
};

/**
 * Personal snapshot for one member: "who do I owe" and "who owes me", with exact
 * amounts, derived from the group's simplified settlement graph.
 */
const getPersonalBalances = async (groupId, userId) => {
  const membership = await assertActiveMember(groupId, userId);

  const settlements = await Settlement.find({ groupId, isSettled: false })
    .populate('fromUserId', 'firstName familyName email')
    .populate('toUserId', 'firstName familyName email')
    .lean();

  const uid = String(userId);

  const iOwe = settlements
    .filter((s) => String(s.fromUserId._id) === uid)
    .map((s) => ({ settlementId: s._id, to: s.toUserId, amount: s.amount }));

  const owedToMe = settlements
    .filter((s) => String(s.toUserId._id) === uid)
    .map((s) => ({ settlementId: s._id, from: s.fromUserId, amount: s.amount }));

  return {
    net: membership.balance,
    totalIOwe: round2(iOwe.reduce((sum, x) => sum + x.amount, 0)),
    totalOwedToMe: round2(owedToMe.reduce((sum, x) => sum + x.amount, 0)),
    iOwe,
    owedToMe,
  };
};

/**
 * Full group overview (for the manager / any member): group totals, every
 * member's net balance, and the complete simplified transfer plan.
 */
const getGroupOverview = async (groupId, userId) => {
  await assertActiveMember(groupId, userId);

  const [group, members, settlements] = await Promise.all([
    Group.findById(groupId).populate('adminId', 'firstName familyName email').lean(),
    GroupMember.find({ groupId, status: 'Active' })
      .populate('userId', 'firstName familyName email')
      .lean(),
    Settlement.find({ groupId, isSettled: false })
      .populate('fromUserId', 'firstName familyName email')
      .populate('toUserId', 'firstName familyName email')
      .lean(),
  ]);

  if (!group) {
    const err = new Error('Group not found');
    err.status = 404;
    throw err;
  }

  return {
    group: {
      _id: group._id,
      groupName: group.groupName,
      groupCode: group.groupCode,
      admin: group.adminId,
      totalExpenses: group.totalExpenses,
      avgPerPerson: group.avgPerPerson,
      memberCount: members.length,
      status: group.status || 'active',
      closedAt: group.closedAt || null,
    },
    members: members.map((m) => ({
      user: m.userId,
      roleInGroup: m.roleInGroup,
      balance: m.balance,
      status: m.status,
    })),
    settlements: settlements.map((s) => ({
      settlementId: s._id,
      from: s.fromUserId,
      to: s.toUserId,
      amount: s.amount,
    })),
  };
};

module.exports = { getPersonalBalances, getGroupOverview };
