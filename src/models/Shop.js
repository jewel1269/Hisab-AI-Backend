const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    shopName: {
      type: String,
      required: true,
      trim: true,
    },
    ownerName: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      enum: ['grocery', 'clothing', 'pharmacy', 'electronics', 'food', 'other'],
      default: 'other',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // SMS reminder settings
    reminderSettings: {
      enabled: { type: Boolean, default: true },
      dueDaysThreshold: { type: Number, default: 7 },
      sendHour: { type: Number, default: 10 }, // 10 AM Bangladesh time
      maxPerWeek: { type: Number, default: 1 },
      template: {
        type: String,
        default:
          '{shopName} থেকে জানানো হচ্ছে, আপনার ৳{amount} বাকি রয়েছে। দয়া করে শীঘ্রই পরিশোধ করুন।',
      },
    },
  },
  { timestamps: true }
);

// Index: one user can have multiple shops but business plan limits it
shopSchema.index({ userId: 1, isActive: 1 });

module.exports = mongoose.model('Shop', shopSchema);
