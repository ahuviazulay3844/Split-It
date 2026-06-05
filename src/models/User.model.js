const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
  firstName: String,
  familyName: String,
  email: String,
  password: { type: String, required: true },
  phone: String,
  role: { type: String, enum: ['Admin', 'Customer'] },
  bankName: String,
  accountNumber: String,
  bankBranch: String
});
module.exports = mongoose.model('User', userSchema);