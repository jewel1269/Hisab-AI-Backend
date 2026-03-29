const router = require('express').Router({ mergeParams: true });
const ctrl = require('../controllers/reminderController');
const { protect, ownShop, requirePlan } = require('../middleware/auth');

router.use(protect, ownShop);

router.get('/', ctrl.getReminderHistory);
router.post('/send/:customerId', requirePlan('pro', 'business'), ctrl.sendManualReminder);

module.exports = router;
