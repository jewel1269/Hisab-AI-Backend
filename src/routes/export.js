const router = require('express').Router({ mergeParams: true });
const ctrl = require('../controllers/exportController');
const { protect, ownShop } = require('../middleware/auth');

router.use(protect, ownShop);

router.get('/full', ctrl.fullExport);
router.get('/customers-csv', ctrl.customersCSV);

module.exports = router;
