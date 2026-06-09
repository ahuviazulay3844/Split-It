const { z } = require('zod');

const registerSchema = z.object({
  firstName: z
    .string({ required_error: 'First name is required' })
    .trim()
    .min(2, 'First name must be at least 2 characters')
    .max(50, 'First name must be at most 50 characters'),
  familyName: z
    .string({ required_error: 'Family name is required' })
    .trim()
    .min(2, 'Family name must be at least 2 characters')
    .max(50, 'Family name must be at most 50 characters'),
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .toLowerCase()
    .email('Invalid email address'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
  phone: z.string().trim().optional(),
});

const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .toLowerCase()
    .email('Invalid email address'),
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
});

module.exports = { registerSchema, loginSchema };
