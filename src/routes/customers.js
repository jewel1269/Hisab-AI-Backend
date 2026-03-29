const router = require('express').Router({ mergeParams: true });
const { body } = require('express-validator');
const ctrl = require('../controllers/customerController');
const { protect, ownShop } = require('../middleware/auth');
const validate = require('../middleware/validate');

router.use(protect, ownShop);

router.get('/', ctrl.getCustomers);
router.post(
  '/',
  [body('name').notEmpty().withMessage('Customer name required')],
  validate,
  ctrl.createCustomer
);
router.get('/:customerId', ctrl.getCustomer);
router.put('/:customerId', ctrl.updateCustomer);
router.delete('/:customerId', ctrl.deleteCustomer);

module.exports = router;
