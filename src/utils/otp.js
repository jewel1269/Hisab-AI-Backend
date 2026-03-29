const crypto = require('crypto');

const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

const getOTPExpiry = () => {
  const minutes = parseInt(process.env.OTP_EXPIRES_MINUTES || '5');
  return new Date(Date.now() + minutes * 60 * 1000);
};

const isOTPValid = (user) => {
  if (!user.otp?.code || !user.otp?.expiresAt) return false;
  return new Date() < new Date(user.otp.expiresAt);
};

const isOTPExpired = (user) => {
  if (!user.otp?.expiresAt) return true;
  return new Date() > new Date(user.otp.expiresAt);
};

module.exports = { generateOTP, getOTPExpiry, isOTPValid, isOTPExpired };
