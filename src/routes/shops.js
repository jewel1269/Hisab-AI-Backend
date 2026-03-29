const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/shopController');
const { protect, ownShop } = require('../middleware/auth');
const validate = require('../middleware/validate');

router.use(protect);

router.get('/', ctrl.getShops);
router.post(
  '/',
  [
    body('shopName').notEmpty().withMessage('Shop name required'),
    body('ownerName').notEmpty().withMessage('Owner name required'),
    body('category').optional().isIn(['grocery', 'clothing', 'pharmacy', 'electronics', 'food', 'other']),
  ],
  validate,
  ctrl.createShop
);

router.get('/:shopId', ownShop, ctrl.getShop);
router.put('/:shopId', ownShop, ctrl.updateShop);
router.delete('/:shopId', ownShop, ctrl.deleteShop);

module.exports = router;
