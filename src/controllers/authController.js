const User = require('../models/User');
const { generateOTP, getOTPExpiry, isOTPValid } = require('../utils/otp');
const { signToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { sendSMS } = require('../services/smsService');
const AppError = require('../utils/AppError');

const MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '3');

// POST /auth/register
exports.register = async (req, res, next) => {
  try {
    const { phone } = req.body;

    let user = await User.findOne({ phone });
    if (!user) {
      user = await User.create({
        phone,
        operator: User.detectOperator(phone),
      });
    }

    // Rate limit OTP resend
    if (user.otp?.expiresAt && new Date() < new Date(user.otp.expiresAt)) {
      return next(new AppError('OTP already sent. Wait before requesting again.', 429));
    }

    const otp = generateOTP();
    user.otp = { code: otp, expiresAt: getOTPExpiry(), attempts: 0 };
    await user.save();

    const message = `আপনার Hisab AI OTP: ${otp}। এটি ${process.env.OTP_EXPIRES_MINUTES || 5} মিনিটের জন্য বৈধ।`;
    await sendSMS(phone, message);

    res.status(200).json({
      status: 'success',
      message: 'OTP sent successfully',
      // Only expose in dev
      ...(process.env.NODE_ENV === 'development' && { otp }),
    });
  } catch (err) {
    next(err);
  }
};

// POST /auth/verify-otp
exports.verifyOTP = async (req, res, next) => {
  try {
    const { phone, otp } = req.body;

    const user = await User.findOne({ phone });
    if (!user) return next(new AppError('User not found', 404));

    if (!user.otp?.code) return next(new AppError('No OTP requested', 400));

    if (user.otp.attempts >= MAX_ATTEMPTS) {
      return next(new AppError('Too many attempts. Request a new OTP.', 429));
    }

    if (!isOTPValid(user)) {
      return next(new AppError('OTP expired', 400));
    }

    if (user.otp.code !== otp) {
      user.otp.attempts += 1;
      await user.save();
      return next(new AppError(`Invalid OTP. ${MAX_ATTEMPTS - user.otp.attempts} attempts remaining.`, 400));
    }

    // Success
    user.clearOTP();
    user.lastLoginAt = new Date();
    await user.save();

    const token = signToken(user._id);
    const refreshToken = signRefreshToken(user._id);

    res.status(200).json({
      status: 'success',
      token,
      refreshToken,
      user: {
        id: user._id,
        phone: user.phone,
        name: user.name,
        plan: user.plan,
        isNewUser: !user.name,
      },
    });
  } catch (err) {
    next(err);
  }
};

// POST /auth/refresh
exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return next(new AppError('Refresh token required', 400));

    const decoded = verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) return next(new AppError('Invalid refresh token', 401));

    const newToken = signToken(user._id);

    res.status(200).json({
      status: 'success',
      token: newToken,
    });
  } catch (err) {
    next(new AppError('Invalid or expired refresh token', 401));
  }
};

// PUT /auth/profile  (complete profile setup)
exports.updateProfile = async (req, res, next) => {
  try {
    const { name } = req.body;
    req.user.name = name;
    await req.user.save();

    res.status(200).json({
      status: 'success',
      user: { id: req.user._id, phone: req.user.phone, name: req.user.name, plan: req.user.plan },
    });
  } catch (err) {
    next(err);
  }
};

// DELETE /auth/account
exports.deleteAccount = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { isActive: false });
    res.status(200).json({ status: 'success', message: 'Account deactivated' });
  } catch (err) {
    next(err);
  }
};
