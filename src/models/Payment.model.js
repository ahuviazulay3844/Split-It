const mongoose = require('mongoose');
const paymentSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  amount: Number,
  isConfirmed: { type: Boolean, default: false }
});
module.exports = mongoose.model('Payment', paymentSchema);