const rateLimit = require('express-rate-limit');

const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: { status: 'fail', message: 'Too many requests, slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10,
  message: { status: 'fail', message: 'Too many auth attempts, try later.' },
});

const voiceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { status: 'fail', message: 'Voice request limit reached.' },
});

module.exports = { globalLimiter, authLimiter, voiceLimiter };
