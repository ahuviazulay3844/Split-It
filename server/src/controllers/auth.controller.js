const { register, login } = require('../services/auth.service');

const registerUser = async (req, res, next) => {
  try {
    const result = await register(req.validatedBody);
    res.status(201).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

const loginUser = async (req, res, next) => {
  try {
    const result = await login(req.validatedBody);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

module.exports = { registerUser, loginUser };
