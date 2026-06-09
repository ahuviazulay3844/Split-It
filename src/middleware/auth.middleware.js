const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  try {
    //to get the token from the header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const err = new Error('Authentication required');
      err.status = 401;
      return next(err);
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    err.status = 401;
    err.message = 'Invalid or expired token';
    return next(err);
  }
};

module.exports = authMiddleware;
