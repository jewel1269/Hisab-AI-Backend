const mongoose = require('mongoose');

const staffAccountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: true,
      index: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['viewer', 'editor'],
      default: 'editor',
      // viewer: read-only, editor: can add transactions
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastAccessAt: {
      type: Date,
      default: null,
    },
    // The staff member's own User _id (set when they first login with their phone)
    staffUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

staffAccountSchema.index({ shopId: 1, phone: 1 }, { unique: true });

module.exports = mongoose.model('StaffAccount', staffAccountSchema);
