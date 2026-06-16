const mongoose = require('mongoose');

const GroupMember = require('../models/GroupMember.model');

/**
 * Gatekeeper for group-scoped routes.
 * Confirms the authenticated user is an Active member of req.params.groupId
 * before any controller runs. Attaches the membership to req.membership so
 * downstream handlers can reuse it without re-querying.
 *
 * Requires authMiddleware to have set req.user first.
 */
const authGroup = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user && req.user._id;

    if (!mongoose.isValidObjectId(groupId)) {
      const err = new Error('Invalid group id');
      err.status = 400;
      throw err;
    }

    const membership = await GroupMember.findOne({
      groupId,
      userId,
      status: 'Active',
    }).lean();

    if (!membership) {
      const err = new Error('You are not a member of this group');
      err.status = 403;
      throw err;
    }

    req.membership = membership;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = authGroup;
