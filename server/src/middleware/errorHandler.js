// Centralized error handler. Must stay registered LAST in app.js.
// Normalizes known fault types (Mongoose, JWT, duplicate keys) into clean,
// non-leaky JSON responses and only logs stack traces for real 5xx faults.
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Internal server error';

  if (err.name === 'ValidationError') {
    // Mongoose schema validation
    status = 400;
    message = Object.values(err.errors || {})
      .map((e) => e.message)
      .join(', ') || 'Validation failed';
  } else if (err.name === 'CastError') {
    // Malformed ObjectId / type cast
    status = 400;
    message = `Invalid value for ${err.path}`;
  } else if (err.code === 11000) {
    // Duplicate unique key
    status = 409;
    const field = Object.keys(err.keyValue || {})[0];
    message = field ? `A record with this ${field} already exists` : 'Duplicate value';
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    status = 401;
    message = 'Invalid or expired token';
  }

  if (status >= 500) {
    console.error(`[${new Date().toISOString()}] ${err.stack || err.message}`);
  }

  res.status(status).json({ status: 'error', message });
};

module.exports = errorHandler;
