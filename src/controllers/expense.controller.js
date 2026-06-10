const { addExpense, listGroupExpenses } = require('../services/expense.service');

const create = async (req, res, next) => {
  try {
    const result = await addExpense(req.user._id, req.validatedBody);
    res.status(201).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const list = async (req, res, next) => {
  try {
    const expenses = await listGroupExpenses(req.params.groupId, req.user._id);
    res.json({ status: 'success', data: expenses });
  } catch (err) {
    next(err);
  }
};

module.exports = { create, list };
