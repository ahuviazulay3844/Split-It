const { createGroup, getUserActiveGroups } = require('../services/group.service');

const create = async (req, res, next) => {
  try {
    const { groupName, memberIds } = req.validatedBody;
    const group = await createGroup(req.user._id, groupName, memberIds);
    res.status(201).json({ status: 'success', data: group });
  } catch (err) {
    next(err);
  }
};

const getMyGroups = async (req, res, next) => {
  try {
    const groups = await getUserActiveGroups(req.user._id);
    res.json({ status: 'success', data: groups });
  } catch (err) {
    next(err);
  }
};

module.exports = { create, getMyGroups };
