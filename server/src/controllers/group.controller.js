const { createGroup, closeGroup, reopenGroup } = require('../services/group.service');

const create = async (req, res, next) => {
  try {
    const { groupName, memberIds } = req.validatedBody;
    const group = await createGroup(req.user._id, groupName, memberIds);
    res.status(201).json({ status: 'success', data: group });
  } catch (err) {
    next(err);
  }
};

const close = async (req, res, next) => {
  try {
    const group = await closeGroup(req.params.groupId, req.user._id);
    res.json({ status: 'success', data: group });
  } catch (err) {
    next(err);
  }
};

const reopen = async (req, res, next) => {
  try {
    const group = await reopenGroup(req.params.groupId, req.user._id);
    res.json({ status: 'success', data: group });
  } catch (err) {
    next(err);
  }
};

module.exports = { create, close, reopen };
