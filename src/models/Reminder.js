const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema(
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
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['auto', 'manual'],
      default: 'auto',
    },
    channel: {
      type: String,
      enum: ['sms', 'whatsapp'],
      default: 'sms',
    },
    message: {
      type: String,
      required: true,
    },
    amountAtSend: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed', 'skipped'],
      default: 'pending',
    },
    scheduledAt: {
      type: Date,
      required: true,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    failReason: {
      type: String,
      default: null,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    smsResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

reminderSchema.index({ status: 1, scheduledAt: 1 });
reminderSchema.index({ customerId: 1, sentAt: -1 });

module.exports = mongoose.model('Reminder', reminderSchema);
