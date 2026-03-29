const cron = require('node-cron');
const dayjs = require('dayjs');
const Customer = require('../models/Customer');
const Shop = require('../models/Shop');
const Reminder = require('../models/Reminder');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const { sendSMSWithRetry, buildMessage } = require('../services/smsService');

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const runReminderJob = async () => {
  console.log(`[ReminderJob] Starting at ${new Date().toISOString()}`);

  try {
    // Get all active shops with reminders enabled
    const shops = await Shop.find({ isActive: true, 'reminderSettings.enabled': true });

    for (const shop of shops) {
      const user = await User.findById(shop.userId);
      if (!user || !user.isActive) continue;

      // Only pro/business can send auto reminders
      const plan = user.activePlan;
      if (plan === 'free') continue;

      // Check SMS quota for pro plan (50/month)
      let smsUsed = 0;
      if (plan === 'pro') {
        const sub = await Subscription.findOne({ userId: user._id, status: 'active' });
        if (sub) {
          const resetNeeded = !sub.smsResetAt || dayjs().isAfter(dayjs(sub.smsResetAt).add(1, 'month'));
          if (resetNeeded) {
            sub.smsUsedThisMonth = 0;
            sub.smsResetAt = new Date();
            await sub.save();
          }
          smsUsed = sub.smsUsedThisMonth;
          if (smsUsed >= 50) continue; // quota exhausted
        }
      }

      const dueDaysThreshold = shop.reminderSettings.dueDaysThreshold || 7;
      const cutoffDate = dayjs().subtract(dueDaysThreshold, 'day').toDate();

      // Find customers with due + no recent reminder
      const customers = await Customer.find({
        shopId: shop._id,
        isActive: true,
        totalDue: { $gt: 0 },
        phone: { $ne: null },
        lastTransactionAt: { $lte: cutoffDate },
        $or: [
          { lastReminderSentAt: null },
          { lastReminderSentAt: { $lte: new Date(Date.now() - ONE_WEEK_MS) } },
        ],
      });

      for (const customer of customers) {
        const message = buildMessage(
          shop.reminderSettings.template,
          shop.shopName,
          customer.totalDue
        );

        const reminder = await Reminder.create({
          customerId: customer._id,
          shopId: shop._id,
          userId: shop.userId,
          type: 'auto',
          channel: 'sms',
          message,
          amountAtSend: customer.totalDue,
          status: 'pending',
          scheduledAt: new Date(),
        });

        const smsResult = await sendSMSWithRetry(customer.phone, message);

        reminder.status = smsResult.success ? 'sent' : 'failed';
        reminder.sentAt = smsResult.success ? new Date() : null;
        reminder.failReason = smsResult.success ? null : smsResult.error;
        reminder.smsResponse = smsResult.raw;
        await reminder.save();

        if (smsResult.success) {
          await Customer.findByIdAndUpdate(customer._id, {
            lastReminderSentAt: new Date(),
            $inc: { reminderCount: 1 },
          });

          // Increment SMS usage for pro plan
          if (plan === 'pro') {
            await Subscription.findOneAndUpdate(
              { userId: user._id, status: 'active' },
              { $inc: { smsUsedThisMonth: 1 } }
            );
          }
        }

        console.log(`[ReminderJob] ${shop.shopName} → ${customer.name}: ${smsResult.success ? 'sent' : 'failed'}`);
      }
    }

    console.log('[ReminderJob] Done');
  } catch (err) {
    console.error('[ReminderJob] Error:', err.message);
  }
};

// Schedule: every day at 10:00 AM Bangladesh time (UTC+6 = 04:00 UTC)
const startReminderCron = () => {
  cron.schedule('0 4 * * *', runReminderJob, {
    timezone: 'Asia/Dhaka',
  });
  console.log('[ReminderJob] Scheduled daily at 10:00 AM BDT');
};

module.exports = { startReminderCron, runReminderJob };
