const mongoose = require('mongoose');
const { randomBytes } = require('crypto');

const Group = require('../models/Group.model');
const GroupMember = require('../models/GroupMember.model');
const User = require('../models/User.model');

/**
 * Generates a unique 8-character hex group code (e.g. "A3F2BC01").
 * Retries on the rare collision before starting the transaction.
 */
const generateGroupCode = async () => {
  let code;
  let exists;
  do {
    code = randomBytes(4).toString('hex').toUpperCase();
    exists = await Group.exists({ groupCode: code });
  } while (exists);
  return code;
};

// Escapes user input before it is used inside a RegExp, preventing ReDoS / injection.
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Creates a group atomically:
 *  1. Creates the Group document.
 *  2. Creates a GroupMember entry for the admin and each selected member.
 *  3. Pushes the new group's _id into joinedGroups for every participant.
 * All three steps run inside a single MongoDB transaction.
 */
const createGroup = async (adminId, groupName, memberIds = []) => {
  const uniqueMemberIds = [
    ...new Set(
      memberIds
        .map((id) => id.toString())
        .filter((id) => id !== adminId.toString())
    ),
  ];

  // --- Business rules enforced BEFORE opening the transaction ---

  // A group must have at least 2 members (the admin + at least one other).
  if (uniqueMemberIds.length < 1) {
    const err = new Error('A group must have at least 2 members');
    err.status = 400;
    throw err;
  }

  // Group names are unique per owner (case-insensitive) among active groups.
  const duplicate = await Group.exists({
    adminId,
    groupName: new RegExp(`^${escapeRegex(groupName)}$`, 'i'),
    isActive: true,
  });
  if (duplicate) {
    const err = new Error('You already have a group with this name');
    err.status = 409;
    throw err;
  }

  const groupCode = await generateGroupCode();

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (uniqueMemberIds.length > 0) {
      const foundUsers = await User.find({ _id: { $in: uniqueMemberIds } })
        .select('_id')
        .session(session)
        .lean();

      if (foundUsers.length !== uniqueMemberIds.length) {
        const err = new Error('One or more selected users do not exist');
        err.status = 400;
        throw err;
      }
    }

    const [group] = await Group.create(
      [{ groupCode, groupName, adminId, totalExpenses: 0, avgPerPerson: 0, isActive: true }],
      { session }
    );

    const allParticipantIds = [adminId.toString(), ...uniqueMemberIds];

    const memberDocs = allParticipantIds.map((userId) => ({
      groupId: group._id,
      userId,
      roleInGroup: userId === adminId.toString() ? 'Admin' : 'Member',
      balance: 0,
      status: 'Active',
    }));

    await GroupMember.insertMany(memberDocs, { session });

    await User.updateMany(
      { _id: { $in: allParticipantIds } },
      { $addToSet: { joinedGroups: group._id } },
      { session }
    );

    await session.commitTransaction();
    return group;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

/**
 * Returns all active groups the user is an active member of.
 * Enriches each group with the user's role and balance from GroupMember.
 */
const getUserActiveGroups = async (userId) => {
  try {
    const memberships = await GroupMember.find({ userId, status: 'Active' })
      .populate({
        path: 'groupId',
        match: { isActive: true },
        select: 'groupCode groupName adminId totalExpenses avgPerPerson createdAt',
        populate: { path: 'adminId', select: 'firstName familyName email' },
      })
      .lean();

    return memberships
      .filter((m) => m.groupId !== null)
      .map((m) => ({
        ...m.groupId,
        membershipId: m._id,
        roleInGroup: m.roleInGroup,
        balance: m.balance,
      }));
  } catch (err) {
    throw err;
  }
};

module.exports = { createGroup, getUserActiveGroups };
