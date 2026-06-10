const mongoose = require('mongoose');

// Per-participant owed amount for a single expense. Lets one expense be split
// unequally (e.g. A owes 70, B owes 30 on a 100 bill) instead of always evenly.
const splitSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    share: { type: Number, required: true, min: [0, 'Share cannot be negative'] },
  },
  { _id: false }
);

const expenseSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    payerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: [0.01, 'Amount must be greater than 0'] },
    description: { type: String, trim: true, maxlength: 200 },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    splitType: { type: String, enum: ['equal', 'custom'], default: 'equal' },
    // Snapshot of who shared this expense at the time it was created,
    // so historical balances stay correct even if membership changes later.
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    // Exact amount each participant owes for this expense. The sum always equals
    // `amount`; for an equal split every share is amount / participants.length.
    splits: { type: [splitSchema], default: [] },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

expenseSchema.index({ groupId: 1, date: -1 });

module.exports = mongoose.model('Expense', expenseSchema, 'Expenses');
