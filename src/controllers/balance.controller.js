const { getPersonalBalances, getGroupOverview } = require('../services/balance.service');

const getMyBalance = async (req, res, next) => {
  try {
    const data = await getPersonalBalances(req.params.groupId, req.user._id);
    res.json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

const getOverview = async (req, res, next) => {
  try {
    const data = await getGroupOverview(req.params.groupId, req.user._id);
    res.json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getMyBalance, getOverview };
