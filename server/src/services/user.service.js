const User = require('../models/User.model');

/**
 * Search users by partial match on firstName, familyName, or email.
 * Excludes the requesting user from results.
 * Returns only safe fields (no password).
 */
const searchUsers = async (query, excludeUserId) => {
  try {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const term = query.trim();
    const regex = new RegExp(term, 'i');

    const filter = {
      $or: [
        { firstName: regex },
        { familyName: regex },
        { email: regex },
        {
          $expr: {
            $regexMatch: {
              input: { $concat: ['$firstName', ' ', '$familyName'] },
              regex: term,
              options: 'i',
            },
          },
        },
      ],
    };

    if (excludeUserId) {
      filter._id = { $ne: excludeUserId };
    }

    const users = await User.find(filter)
      .select('_id firstName familyName email')
      .limit(20)
      .lean();

    return users;
  } catch (err) {
    throw err;
  }
};

module.exports = { searchUsers };
