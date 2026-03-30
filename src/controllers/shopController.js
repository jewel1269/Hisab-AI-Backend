const Shop = require('../models/Shop');
const Subscription = require('../models/Subscription');
const AppError = require('../utils/AppError');

const SHOP_LIMITS = { free: 1, pro: 1, business: 5 };

// GET /shops
exports.getShops = async (req, res, next) => {
  try {
    const shops = await Shop.find({ userId: req.user._id, isActive: true }).sort('-createdAt');
    res.status(200).json({ status: 'success', data: shops });
  } catch (err) {
    next(err);
  }
};

// POST /shops
exports.createShop = async (req, res, next) => {
  
  try {
    const plan = req.user.plan;
    const limit = SHOP_LIMITS[plan] || 1;
    const count = await Shop.countDocuments({ userId: req.user._id, isActive: true });
    if (count >= limit) {
      return next(new AppError(`Your ${plan} plan allows max ${limit} shop(s). Upgrade to add more.`, 403));
    }

    const { shopName, ownerName, address, category } = req.body;
    console.log(req.body);
    const shop = await Shop.create({
      userId: req.user._id,
      shopName,
      ownerName,
      address,
      category,
    });


    res.status(201).json({ status: 'success', data: shop });
  } catch (err) {
    next(err);
  }
};

// GET /shops/:shopId
exports.getShop = async (req, res, next) => {
  try {
    res.status(200).json({ status: 'success', data: req.shop });
  } catch (err) {
    next(err);
  }
};

// PUT /shops/:shopId
exports.updateShop = async (req, res, next) => {
  try {
    const allowed = ['shopName', 'ownerName', 'address', 'category', 'reminderSettings'];
    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const shop = await Shop.findByIdAndUpdate(req.shop._id, updates, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({ status: 'success', data: shop });
  } catch (err) {
    next(err);
  }
};

// DELETE /shops/:shopId
exports.deleteShop = async (req, res, next) => {
  try {
    await Shop.findByIdAndUpdate(req.shop._id, { isActive: false });
    res.status(200).json({ status: 'success', message: 'Shop deleted' });
  } catch (err) {
    next(err);
  }
};
