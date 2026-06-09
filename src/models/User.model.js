const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    familyName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    phone: { type: String, trim: true },
    role: { type: String, enum: ['Admin', 'Customer'], default: 'Customer' },
    bankName: String,
    accountNumber: String,
    bankBranch: String,
    joinedGroups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Group' }],
  },
  { timestamps: true }
);

// Hash the password before persisting, but only when it has been set/changed.
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
  } catch (err) {
    return next(err);
  }
});

// Compares a plaintext candidate against this user's stored hash.
userSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema, 'User');