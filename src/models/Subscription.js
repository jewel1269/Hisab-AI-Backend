const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    plan: {
      type: String,
      enum: ['pro', 'business'],
      required: true,
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'annual'],
      default: 'monthly',
    },
    amount: {
      type: Number,
      required: true, // in BDT
    },
    currency: {
      type: String,
      default: 'BDT',
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'expired', 'cancelled', 'refunded'],
      default: 'pending',
    },
    // bKash payment details
    bkashTxnId: {
      type: String,
      default: null,
      index: true,
    },
    bkashPaymentId: {
      type: String,
      default: null,
    },
    paymentMethod: {
      type: String,
      enum: ['bkash', 'nagad', 'manual'],
      default: 'bkash',
    },
    startsAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    // SMS usage tracking
    smsUsedThisMonth: {
      type: Number,
      default: 0,
    },
    smsResetAt: {
      type: Date,
      default: null,
    },
    failReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Plan limits
subscriptionSchema.statics.PLAN_LIMITS = {
  free: {
    customers: 10,
    voiceInput: false,
    smsPerMonth: 0,
    cloudBackupDays: 7,
    shops: 1,
    staffAccounts: 0,
  },
  pro: {
    customers: Infinity,
    voiceInput: true,
    smsPerMonth: 50,
    cloudBackupDays: 365,
    shops: 1,
    staffAccounts: 0,
  },
  business: {
    customers: Infinity,
    voiceInput: true,
    smsPerMonth: Infinity,
    cloudBackupDays: Infinity,
    shops: 5,
    staffAccounts: 3,
  },
};

module.exports = mongoose.model('Subscription', subscriptionSchema);
