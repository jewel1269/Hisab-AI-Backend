const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^\+8801[0-9]{9}$/, 'Invalid Bangladeshi phone number'],
    },
    name: {
      type: String,
      trim: true,
    },
    plan: {
      type: String,
      enum: ['free', 'pro', 'business'],
      default: 'free',
    },
    planExpiresAt: {
      type: Date,
      default: null,
    },
    operator: {
      type: String,
      enum: ['grameenphone', 'robi', 'banglalink', 'teletalk', 'unknown'],
      default: 'unknown',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    // OTP fields (temp, cleared after verify)
    otp: {
      code: String,
      expiresAt: Date,
      attempts: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

// Virtuals
userSchema.virtual('isPlanActive').get(function () {
  if (this.plan === 'free') return true;
  return this.planExpiresAt && this.planExpiresAt > new Date();
});

userSchema.virtual('activePlan').get(function () {
  if (this.plan !== 'free' && (!this.planExpiresAt || this.planExpiresAt <= new Date())) {
    return 'free';
  }
  return this.plan;
});

// Clear OTP after verify
userSchema.methods.clearOTP = function () {
  this.otp = { code: undefined, expiresAt: undefined, attempts: 0 };
};

// Detect operator from phone number
userSchema.statics.detectOperator = function (phone) {
  const num = phone.replace('+880', '0');
  if (/^017|^013/.test(num)) return 'grameenphone';
  if (/^018|^016/.test(num)) return 'robi';
  if (/^019|^014/.test(num)) return 'banglalink';
  if (/^015/.test(num)) return 'teletalk';
  return 'unknown';
};

module.exports = mongoose.model('User', userSchema);
