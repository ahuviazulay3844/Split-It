const { settleDebt } = require('../services/settlement.service');
const { emitToGroup } = require('../socket');

const settle = async (req, res, next) => {
  try {
    const result = await settleDebt(req.user._id, req.validatedBody);
    emitToGroup(String(result.groupId), 'group:updated', {
      groupId: String(result.groupId),
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

module.exports = { settle };
