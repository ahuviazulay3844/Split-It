const mongoose = require('mongoose');
const expenseSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
  payerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  amount: Number,
  description: String,
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  date: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Expense', expenseSchema, 'Expenses');