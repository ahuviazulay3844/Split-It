const { getDashboard } = require('../services/dashboard.service');

const get = async (req, res, next) => {
  try {
    const dashboard = await getDashboard(req.user._id);
    res.json({ status: 'success', data: dashboard });
  } catch (err) {
    next(err);
  }
};

module.exports = { get };
