const { createGroup } = require('../services/group.service');

const create = async (req, res, next) => {
  try {
    const { groupName, memberIds } = req.validatedBody;
    const group = await createGroup(req.user._id, groupName, memberIds);
    res.status(201).json({ status: 'success', data: group });
  } catch (err) {
    next(err);
  }
};

module.exports = { create };
