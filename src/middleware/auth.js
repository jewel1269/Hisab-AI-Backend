const { verifyToken } = require('../utils/jwt');
const User = require('../models/User');
const AppError = require('../utils/AppError');

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('Authentication required', 401));
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    const user = await User.findById(decoded.id).select('-otp');
    if (!user) return next(new AppError('User not found', 401));
    if (!user.isActive) return next(new AppError('Account deactivated', 401));

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Token expired, please login again', 401));
    }
    return next(new AppError('Invalid token', 401));
  }
};

// Check plan access
const requirePlan = (...plans) => {
  return (req, res, next) => {
    const userPlan = req.user.plan;
    if (!plans.includes(userPlan)) {
      return next(
        new AppError(`This feature requires: ${plans.join(' or ')} plan`, 403)
      );
    }
    next();
  };
};

// Verify shop belongs to user (or user is staff of that shop)
const ownShop = async (req, res, next) => {
  try {
  const Shop = require('../models/Shop');
  const StaffAccount = require('../models/StaffAccount');

  const shopId = req.params.shopId || req.body.shopId || req.query.shopId;
  if (!shopId) return next(new AppError('shopId required', 400));

  // Owner check
  const shop = await Shop.findOne({ _id: shopId, isActive: true });
  if (!shop) return next(new AppError('Shop not found', 404));

  if (shop.userId.equals(req.user._id)) {
    req.shop = shop;
    req.isShopOwner = true;
    return next();
  }

  // Staff check
  const staffRecord = await StaffAccount.findOne({
    shopId,
    staffUserId: req.user._id,
    isActive: true,
  });

  if (!staffRecord) {
    return next(new AppError('Shop not found or access denied', 403));
  }

  req.shop = shop;
  req.isShopOwner = false;
  req.staffRole = staffRecord.role;

  // Viewers cannot mutate data
  if (req.method !== 'GET' && staffRecord.role === 'viewer') {
    return next(new AppError('Viewer staff cannot modify data', 403));
  }

  next();
  } catch (err) {
    next(err);
  }
};

module.exports = { protect, requirePlan, ownShop };
