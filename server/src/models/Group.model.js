const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema(
  {
    groupCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    groupName: { type: String, required: true, trim: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    totalExpenses: { type: Number, default: 0 },
    avgPerPerson: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    // Lifecycle status shown in the personal area. A group starts 'active' and can
    // be moved to 'closed' by its admin only once every debt has been settled.
    status: { type: String, enum: ['active', 'closed'], default: 'active', index: true },
    closedAt: { type: Date },
  },
  { timestamps: true }
);

// A user cannot own two groups with the same name (case-insensitive).
groupSchema.index(
  { adminId: 1, groupName: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);

module.exports = mongoose.model('Group', groupSchema, 'Group');