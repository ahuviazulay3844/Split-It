const mongoose = require('mongoose');
const groupMemberSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  personalCode: String,
  roleInGroup: { type: String, enum: ['Admin', 'Member'] },
  balance: { type: Number, default: 0 },
  isGet: Boolean,
  isPaid: Boolean,
  status: { type: String, enum: ['Active', 'Settled'] }
});
module.exports = mongoose.model('GroupMember', groupMemberSchema ,'GroupMember');