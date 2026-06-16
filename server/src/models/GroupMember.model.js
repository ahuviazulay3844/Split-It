const mongoose = require('mongoose');

const groupMemberSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    personalCode: String,
    roleInGroup: { type: String, enum: ['Admin', 'Member'], required: true },
    balance: { type: Number, default: 0 },
    isGet: { type: Boolean, default: false },
    isPaid: { type: Boolean, default: false },
    status: { type: String, enum: ['Active', 'Settled'], default: 'Active' },
  },
  { timestamps: true }
);

groupMemberSchema.index({ groupId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('GroupMember', groupMemberSchema, 'GroupMember');