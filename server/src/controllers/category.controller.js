const { listCategories } = require('../services/category.service');

const list = async (req, res, next) => {
  try {
    const categories = await listCategories();
    res.json({ status: 'success', data: categories });
  } catch (err) {
    next(err);
  }
};

module.exports = { list };
