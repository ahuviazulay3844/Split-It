const { searchUsers } = require('../services/user.service');

const search = async (req, res, next) => {
  try {
    const { q } = req.query;
    const users = await searchUsers(q, req.user._id);
    res.json({ status: 'success', data: users });
  } catch (err) {
    next(err);
  }
};

module.exports = { search };
