const mongoose = require('mongoose');
const groupSchema = new mongoose.Schema({
  groupCode: { type: String, required: true, unique: true },
  groupName: String,
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  totalExpenses: Number,
  avgPerPerson: Number,
  isActive: { type: Boolean, default: true }
});
module.exports = mongoose.model('Group', groupSchema ,'Group');