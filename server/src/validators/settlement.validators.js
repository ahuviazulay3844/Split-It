const { z } = require('zod');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

// Settle a single edge of the simplified debt graph by its Settlement id.
const settleSchema = z.object({
  settlementId: z.string().regex(objectIdRegex, 'Invalid settlement id'),
});

module.exports = { settleSchema };
