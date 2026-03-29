const Reminder = require('../models/Reminder');
const Customer = require('../models/Customer');
const Subscription = require('../models/Subscription');
const AppError = require('../utils/AppError');
const { sendSMSWithRetry, buildMessage } = require('../services/smsService');
const dayjs = require('dayjs');

const checkSMSQuota = async (userId, plan) => {
  if (plan === 'business') return { allowed: true };
  if (plan === 'free') return { allowed: false, reason: 'SMS reminders require Pro or Business plan' };

  // Pro: 50/month
  const sub = await Subscription.findOne({ userId, status: 'active' });
  if (!sub) return { allowed: false, reason: 'No active subscription found' };

  const resetNeeded = !sub.smsResetAt || dayjs().isAfter(dayjs(sub.smsResetAt).add(1, 'month'));
  if (resetNeeded) {
    sub.smsUsedThisMonth = 0;
    sub.smsResetAt = new Date();
    await sub.save();
  }

  if (sub.smsUsedThisMonth >= 50) {
    return { allowed: false, reason: `Monthly SMS limit reached (50/month on Pro). Resets next month.` };
  }

  return { allowed: true, sub };
};

const incrementSMSUsage = async (userId) => {
  await Subscription.findOneAndUpdate(
    { userId, status: 'active' },
    { $inc: { smsUsedThisMonth: 1 } }
  );
};

// POST /shops/:shopId/reminders/send/:customerId
exports.sendManualReminder = async (req, res, next) => {
  try {
    const { channel = 'sms' } = req.body;
    const plan = req.user.activePlan;

    const customer = await Customer.findOne({
      _id: req.params.customerId,
      shopId: req.shop._id,
      isActive: true,
    });
    if (!customer) return next(new AppError('Customer not found', 404));
    if (!customer.phone) return next(new AppError('Customer has no phone number', 400));
    if (customer.totalDue <= 0) return next(new AppError('Customer has no outstanding due', 400));

    const message = buildMessage(
      req.shop.reminderSettings.template,
      req.shop.shopName,
      customer.totalDue
    );

    // WhatsApp — no SMS quota needed
    if (channel === 'whatsapp') {
      const waLink = `https://wa.me/${customer.phone.replace('+', '')}?text=${encodeURIComponent(message)}`;
      return res.status(200).json({ status: 'success', channel: 'whatsapp', waLink, message });
    }

    // SMS quota check
    const quota = await checkSMSQuota(req.user._id, plan);
    if (!quota.allowed) return next(new AppError(quota.reason, 403));

    const smsResult = await sendSMSWithRetry(customer.phone, message);

    const reminder = await Reminder.create({
      customerId: customer._id,
      shopId: req.shop._id,
      userId: req.user._id,
      type: 'manual',
      channel: 'sms',
      message,
      amountAtSend: customer.totalDue,
      status: smsResult.success ? 'sent' : 'failed',
      scheduledAt: new Date(),
      sentAt: smsResult.success ? new Date() : null,
      failReason: smsResult.success ? null : smsResult.error,
      smsResponse: smsResult.raw,
    });

    if (smsResult.success) {
      await Customer.findByIdAndUpdate(customer._id, {
        lastReminderSentAt: new Date(),
        $inc: { reminderCount: 1 },
      });
      if (plan === 'pro') await incrementSMSUsage(req.user._id);
    }

    res.status(200).json({
      status: smsResult.success ? 'success' : 'fail',
      message: smsResult.success ? 'Reminder sent' : 'SMS failed',
      data: reminder,
      ...(plan === 'pro' && quota.sub && {
        smsRemaining: 50 - quota.sub.smsUsedThisMonth - 1,
      }),
    });
  } catch (err) {
    next(err);
  }
};

// GET /shops/:shopId/reminders
exports.getReminderHistory = async (req, res, next) => {
  try {
    const { customerId } = req.query;
    const filter = { shopId: req.shop._id };
    if (customerId) filter.customerId = customerId;

    const reminders = await Reminder.find(filter)
      .populate('customerId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({ status: 'success', data: reminders });
  } catch (err) {
    next(err);
  }
};

// GET /reminders/pending  (used by cron job)
exports.getPendingReminders = async (req, res, next) => {
  try {
    const pending = await Reminder.find({
      status: 'pending',
      scheduledAt: { $lte: new Date() },
    }).populate('customerId shopId');

    res.status(200).json({ status: 'success', data: pending });
  } catch (err) {
    next(err);
  }
};
