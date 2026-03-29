const router = require('express').Router({ mergeParams: true });
const { body } = require('express-validator');
const multer = require('multer');
const ctrl = require('../controllers/transactionController');
const { protect, ownShop, requirePlan } = require('../middleware/auth');
const { voiceLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');

// Audio stored in memory (max 5MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) cb(null, true);
    else cb(new Error('Only audio files allowed'), false);
  },
});

router.use(protect, ownShop);

router.get('/', ctrl.getTransactions);

router.post(
  '/',
  [
    body('customerId').notEmpty().withMessage('customerId required'),
    body('type').isIn(['due', 'payment']).withMessage('type must be due or payment'),
    body('amount').isFloat({ min: 1 }).withMessage('amount must be positive'),
  ],
  validate,
  ctrl.createTransaction
);

// Voice: parse only (returns parsed result, not saved)
router.post(
  '/voice',
  voiceLimiter,
  requirePlan('pro', 'business'),
  upload.single('audio'),
  ctrl.createVoiceTransaction
);

// Voice: confirm + save
router.post(
  '/voice/confirm',
  requirePlan('pro', 'business'),
  [
    body('customerId').notEmpty().withMessage('customerId required'),
    body('type').isIn(['due', 'payment']).withMessage('type required'),
    body('amount').isFloat({ min: 1 }).withMessage('amount required'),
  ],
  validate,
  ctrl.confirmVoiceTransaction
);

router.put('/:id', ctrl.updateTransaction);
router.delete('/:id', ctrl.deleteTransaction);

module.exports = router;
