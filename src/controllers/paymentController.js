const { createPayment, executePayment } = require('../services/bkashService');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const dayjs = require('dayjs');

// Annual = 10 months price (2 months free)
const PLAN_PRICES = {
  pro:      { monthly: 199,  annual: 199 * 10 },   // 1990 (save 398)
  business: { monthly: 399,  annual: 399 * 10 },   // 3990 (save 798)
};

// How long each billing cycle adds
const BILLING_DURATION = {
  monthly: { amount: 1, unit: 'month' },
  annual:  { amount: 1, unit: 'year'  },
};

// POST /payment/bkash/init
exports.initPayment = async (req, res, next) => {
  try {
    const { plan, billingCycle = 'monthly' } = req.body;
    if (!PLAN_PRICES[plan]) return next(new AppError('Invalid plan', 400));

    const amount = PLAN_PRICES[plan][billingCycle];
    const callbackURL = `${process.env.FRONTEND_URL}/payment/bkash/callback`;

    const result = await createPayment({
      amount,
      payerReference: req.user.phone,
      callbackURL,
    });
    if (!result.success) return next(new AppError(result.error, 502));

    await Subscription.create({
      userId: req.user._id,
      plan,
      billingCycle,
      amount,
      status: 'pending',
      bkashPaymentId: result.paymentID,
    });

    res.status(200).json({
      status: 'success',
      paymentID: result.paymentID,
      bkashURL: result.bkashURL,
      amount,
      savings: billingCycle === 'annual' ? PLAN_PRICES[plan].monthly * 12 - amount : 0,
    });
  } catch (err) {
    next(err);
  }
};

// POST /payment/bkash/verify
exports.verifyPayment = async (req, res, next) => {
  try {
    const { paymentID } = req.body;
    if (!paymentID) return next(new AppError('paymentID required', 400));

    const result = await executePayment(paymentID);
    if (!result.success) {
      await Subscription.findOneAndUpdate(
        { bkashPaymentId: paymentID },
        { status: 'cancelled', failReason: result.statusMessage }
      );
      return next(new AppError(result.statusMessage || 'Payment failed', 402));
    }

    const subscription = await Subscription.findOne({ bkashPaymentId: paymentID });
    if (!subscription) return next(new AppError('Subscription record not found', 404));

    // Renewal: extend from current expiry if still active, else from now
    const user = await User.findById(subscription.userId);
    const currentExpiry = user.planExpiresAt && dayjs(user.planExpiresAt).isAfter(dayjs())
      ? dayjs(user.planExpiresAt)
      : dayjs();

    const { amount, unit } = BILLING_DURATION[subscription.billingCycle];
    const newExpiry = currentExpiry.add(amount, unit);

    // Expire old active subscription for same plan (if any)
    await Subscription.updateMany(
      { userId: subscription.userId, status: 'active', _id: { $ne: subscription._id } },
      { status: 'expired' }
    );

    subscription.status = 'active';
    subscription.bkashTxnId = result.trxID;
    subscription.startsAt = new Date();
    subscription.expiresAt = newExpiry.toDate();
    subscription.smsUsedThisMonth = 0;
    subscription.smsResetAt = new Date();
    await subscription.save();

    await User.findByIdAndUpdate(subscription.userId, {
      plan: subscription.plan,
      planExpiresAt: newExpiry.toDate(),
    });

    res.status(200).json({
      status: 'success',
      message: `${subscription.plan} plan activated!`,
      plan: subscription.plan,
      expiresAt: newExpiry.toDate(),
      trxID: result.trxID,
    });
  } catch (err) {
    next(err);
  }
};

// GET /payment/subscription  — current plan status
exports.getCurrentSubscription = async (req, res, next) => {
  try {
    const user = req.user;
    const activePlan = user.plan;

    const subscription = await Subscription.findOne({
      userId: user._id,
      status: 'active',
    }).sort('-createdAt');
    console.log(subscription)

    const smsUsed = subscription?.smsUsedThisMonth || 0;
    const smsLimit = activePlan === 'pro' ? 50 : activePlan === 'business' ? null : 0;

    res.status(200).json({
      status: 'success',
      data: {
        plan: activePlan,
        planExpiresAt: user.planExpiresAt,
        isExpired: user.plan !== 'free' && activePlan === 'free',
        billingCycle: subscription?.billingCycle || null,
        sms: {
          used: smsUsed,
          limit: smsLimit,
          remaining: smsLimit === null ? null : Math.max(0, smsLimit - smsUsed),
        },
        prices: PLAN_PRICES,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /payment/history
exports.getPaymentHistory = async (req, res, next) => {
  try {
    const subscriptions = await Subscription.find({ userId: req.user._id }).sort('-createdAt');
    res.status(200).json({ status: 'success', data: subscriptions });
  } catch (err) {
    next(err);
  }
};
