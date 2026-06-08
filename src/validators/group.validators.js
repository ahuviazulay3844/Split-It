const { z } = require('zod');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const createGroupSchema = z.object({
  groupName: z
    .string({ required_error: 'Group name is required' })
    .trim()
    .min(2, 'Group name must be at least 2 characters')
    .max(100, 'Group name must be at most 100 characters'),
  memberIds: z
    .array(z.string().regex(objectIdRegex, 'Invalid user ID format'))
    .default([]),
});

module.exports = { createGroupSchema };
