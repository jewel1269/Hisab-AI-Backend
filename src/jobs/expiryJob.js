const cron = require('node-cron');
const User = require('../models/User');
const Subscription = require('../models/Subscription');

const runExpiryJob = async () => {
  console.log(`[ExpiryJob] Starting at ${new Date().toISOString()}`);
  try {
    const now = new Date();

    // 1. Find users whose paid plan has expired in DB but plan field still shows pro/business
    const expiredUsers = await User.find({
      plan: { $in: ['pro', 'business'] },
      planExpiresAt: { $lte: now },
    });

    if (expiredUsers.length === 0) {
      console.log('[ExpiryJob] No expired plans found.');
      return;
    }

    const expiredIds = expiredUsers.map((u) => u._id);

    // 2. Downgrade users to free in DB
    await User.updateMany(
      { _id: { $in: expiredIds } },
      { $set: { plan: 'free' } }
    );

    // 3. Mark their active subscriptions as expired
    await Subscription.updateMany(
      { userId: { $in: expiredIds }, status: 'active' },
      { $set: { status: 'expired' } }
    );

    console.log(`[ExpiryJob] Downgraded ${expiredUsers.length} user(s) to free plan.`);
  } catch (err) {
    console.error('[ExpiryJob] Error:', err.message);
  }
};

// Run daily at midnight Bangladesh time (UTC+6 = 18:00 UTC)
const startExpiryJob = () => {
  cron.schedule('0 18 * * *', runExpiryJob, { timezone: 'Asia/Dhaka' });
  console.log('[ExpiryJob] Scheduled daily at 00:00 BDT');
};

module.exports = { startExpiryJob, runExpiryJob };
