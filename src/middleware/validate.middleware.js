const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const issues = result.error.issues || result.error.errors || [];

    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: issues.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
  }
  req.validatedBody = result.data;
  next();
};

module.exports = validate;
