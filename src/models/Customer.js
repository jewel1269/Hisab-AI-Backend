const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    address: {
      type: String,
      trim: true,
      default: null,
    },
    totalDue: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastTransactionAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Reminder tracking
    lastReminderSentAt: {
      type: Date,
      default: null,
    },
    reminderCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Compound index for search within a shop
customerSchema.index({ shopId: 1, name: 'text' });
customerSchema.index({ shopId: 1, totalDue: -1 });
customerSchema.index({ shopId: 1, lastTransactionAt: -1 });

// Virtual: due status for color indicator
customerSchema.virtual('dueStatus').get(function () {
  if (this.totalDue === 0) return 'green';
  if (this.totalDue < 500) return 'yellow';
  return 'red';
});

module.exports = mongoose.model('Customer', customerSchema);
