const { settleDebt } = require('../services/settlement.service');

const settle = async (req, res, next) => {
  try {
    const result = await settleDebt(req.user._id, req.validatedBody);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

module.exports = { settle };
