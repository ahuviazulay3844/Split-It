const { z } = require('zod');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

// One participant's owed amount when the caller wants an unequal (custom) split.
const splitSchema = z.object({
  userId: z.string().regex(objectIdRegex, 'Invalid user id in splits'),
  amount: z.coerce
    .number({ invalid_type_error: 'Split amount must be a number' })
    .nonnegative('Split amount cannot be negative')
    .finite('Split amount must be a finite number'),
});

const createExpenseSchema = z
  .object({
    groupId: z.string().regex(objectIdRegex, 'Invalid group id'),
    amount: z.coerce
      .number({ invalid_type_error: 'Amount must be a number' })
      .positive('Amount must be greater than 0')
      .finite('Amount must be a finite number'),
    description: z.string().trim().max(200, 'Description must be at most 200 characters').optional(),
    categoryId: z.string().regex(objectIdRegex, 'Invalid category id').optional(),
    // Optional: the member who actually paid. Defaults to the requesting user.
    payerId: z.string().regex(objectIdRegex, 'Invalid payer id').optional(),
    // Optional unequal split. When omitted the expense is split equally among all
    // active members. When provided, the per-user amounts must add up to `amount`.
    splits: z.array(splitSchema).min(1, 'Splits must contain at least one participant').optional(),
    date: z.coerce.date().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.splits) return;

    const ids = data.splits.map((s) => s.userId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A participant appears more than once in splits',
        path: ['splits'],
      });
    }

    // Compare in integer cents so floating-point noise never fails a valid split.
    const sumCents = data.splits.reduce((sum, s) => sum + Math.round(s.amount * 100), 0);
    if (sumCents !== Math.round(data.amount * 100)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Split amounts must add up to the total expense amount',
        path: ['splits'],
      });
    }
  });

module.exports = { createExpenseSchema };
