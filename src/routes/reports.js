const router = require('express').Router({ mergeParams: true });
const ctrl = require('../controllers/reportController');
const { protect, ownShop, requirePlan } = require('../middleware/auth');

router.use(protect, ownShop);

router.get('/dashboard', ctrl.getDashboard);
router.get('/monthly', ctrl.getMonthlyReport);
router.get('/customer/:customerId', ctrl.getCustomerReport);
router.post('/export', requirePlan('pro', 'business'), ctrl.exportReport);

module.exports = router;
