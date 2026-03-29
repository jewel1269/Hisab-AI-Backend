const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

router.use(protect);

router.post(
  '/bkash/init',
  [
    body('plan').isIn(['pro', 'business']).withMessage('Invalid plan'),
    body('billingCycle').optional().isIn(['monthly', 'annual']),
  ],
  validate,
  ctrl.initPayment
);

router.post(
  '/bkash/verify',
  [body('paymentID').notEmpty().withMessage('paymentID required')],
  validate,
  ctrl.verifyPayment
);

router.get('/subscription', ctrl.getCurrentSubscription);
router.get('/history', ctrl.getPaymentHistory);

module.exports = router;
