const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');

router.post(
  '/register',
  authLimiter,
  [body('phone').matches(/^\+8801[0-9]{9}$/).withMessage('Invalid Bangladeshi phone number')],
  validate,
  ctrl.register
);


router.get(
  '/me',
  ctrl.getProfile
);

router.post(
  '/verify-otp',
  authLimiter,
  [
    body('phone').matches(/^\+8801[0-9]{9}$/).withMessage('Invalid phone'),
    body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
  ],
  validate,
  ctrl.verifyOTP
);

router.post('/refresh', ctrl.refreshToken);

router.put(
  '/profile',
  protect,
  [body('name').notEmpty().withMessage('Name required')],
  validate,
  ctrl.updateProfile
);

router.delete('/account', protect, ctrl.deleteAccount);

module.exports = router;
