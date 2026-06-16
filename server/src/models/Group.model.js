const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema(
  {
    groupCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    groupName: { type: String, required: true, trim: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    totalExpenses: { type: Number, default: 0 },
    avgPerPerson: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Group', groupSchema, 'Group');