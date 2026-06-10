const mongoose = require('mongoose');

/**
 * A Settlement is one edge of the simplified debt graph: "fromUser pays toUser
 * `amount`". The full set of unsettled settlements for a group is the shortest
 * (least-transfers) way to clear everyone's debts. It is recomputed atomically
 * every time an expense is added.
 */
const settlementSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0 },
    isSettled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

settlementSchema.index({ groupId: 1, isSettled: 1 });
settlementSchema.index({ groupId: 1, fromUserId: 1 });
settlementSchema.index({ groupId: 1, toUserId: 1 });

module.exports = mongoose.model('Settlement', settlementSchema, 'Settlement');
