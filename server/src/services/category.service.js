const Category = require('../models/Category.model');

/** Returns every expense category, sorted for display in pickers. */
const listCategories = async () => {
  try {
    return await Category.find()
      .select('_id name')
      .sort({ name: 1 })
      .collation({ locale: 'he', strength: 1 })
      .lean();
  } catch (err) {
    throw err;
  }
};

module.exports = { listCategories };
