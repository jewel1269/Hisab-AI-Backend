const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
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
    },
    type: {
      type: String,
      enum: ['due', 'payment'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [1, 'Amount must be at least 1'],
    },
    note: {
      type: String,
      trim: true,
      default: null,
    },
    // Voice input metadata
    voiceInput: {
      rawText: { type: String, default: null },      // Bangla STT output
      audioUrl: { type: String, default: null },      // stored audio file
      parsedBy: { type: String, enum: ['manual', 'voice'], default: 'manual' },
    },
    // Running balance snapshot (denormalized for performance)
    balanceAfter: {
      type: Number,
      default: 0,
    },
    // Editable within 24 hours
    transactionDate: {
      type: Date,
      default: Date.now,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

transactionSchema.index({ customerId: 1, transactionDate: -1 });
transactionSchema.index({ shopId: 1, transactionDate: -1 });
transactionSchema.index({ shopId: 1, type: 1, transactionDate: -1 });

// Virtual: is editable (within 24 hours)
transactionSchema.virtual('isEditable').get(function () {
  const now = new Date();
  const diff = now - this.createdAt;
  return diff < 24 * 60 * 60 * 1000;
});

// Soft delete support
transactionSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

module.exports = mongoose.model('Transaction', transactionSchema);
