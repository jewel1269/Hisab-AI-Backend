const router = require('express').Router({ mergeParams: true });
const { body } = require('express-validator');
const ctrl = require('../controllers/staffController');
const { protect, ownShop, requirePlan } = require('../middleware/auth');
const validate = require('../middleware/validate');

router.use(protect, ownShop, requirePlan('business'));

router.get('/', ctrl.getStaff);
router.post(
  '/',
  [
    body('phone').matches(/^\+8801[0-9]{9}$/).withMessage('Invalid phone number'),
    body('name').notEmpty().withMessage('Name required'),
    body('role').optional().isIn(['viewer', 'editor']),
  ],
  validate,
  ctrl.addStaff
);
router.put('/:staffId', ctrl.updateStaff);
router.delete('/:staffId', ctrl.removeStaff);

module.exports = router;
