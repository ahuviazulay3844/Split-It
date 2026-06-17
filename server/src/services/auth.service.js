const jwt = require('jsonwebtoken');

const User = require('../models/User.model');

// Builds a signed JWT carrying the minimal identity claims.
const signToken = (user) => {
  return jwt.sign(
    { _id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// Strips secrets so a user object is safe to return in a response.
const toSafeUser = (user) => ({
  _id: user._id,
  firstName: user.firstName,
  familyName: user.familyName,
  email: user.email,
  phone: user.phone,
  role: user.role,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

/**
 * Registers a new user.
 * Rejects duplicate emails, lets the model's pre-save hook hash the password,
 * and returns a signed token plus the safe user fields (never the hash).
 */
const register = async ({ firstName, familyName, email, password, phone }) => {
  try {
    const existing = await User.exists({ email });
    if (existing) {
      const err = new Error('Email is already registered');
      err.status = 409;
      throw err;
    }

    const user = await User.create({ firstName, familyName, email, password, phone });
    const token = signToken(user);
    return { token, user: toSafeUser(user) };
  } catch (err) {
    throw err;
  }
};

/**
 * Authenticates a user by email and password.
 * Explicitly selects the hashed password (the schema hides it by default),
 * verifies it via the model's comparePassword method, and returns a token.
 * Uses a single generic error to avoid leaking which credential was wrong.
 */
const login = async ({ email, password }) => {
  try {
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      const err = new Error('No account found with this email');
      err.status = 404;
      throw err;
    }

    if (!(await user.comparePassword(password))) {
      const err = new Error('Incorrect password');
      err.status = 401;
      throw err;
    }
    
    const token = signToken(user);
    return { token, user: toSafeUser(user) };
  } catch (err) {
    throw err;
  }
};

module.exports = { register, login };
