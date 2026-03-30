const StaffAccount = require('../models/StaffAccount');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { sendSMS } = require('../services/smsService');

const MAX_STAFF = 3;

// GET /shops/:shopId/staff
exports.getStaff = async (req, res, next) => {
  try {
    const staff = await StaffAccount.find({ shopId: req.shop._id, isActive: true })
      .populate('staffUserId', 'phone lastLoginAt')
      .sort('-createdAt');
    res.status(200).json({ status: 'success', data: staff });
  } catch (err) {
    next(err);
  }
};

// POST /shops/:shopId/staff
exports.addStaff = async (req, res, next) => {
  try {
    if (!req.isShopOwner) return next(new AppError('Only shop owner can add staff', 403));

    const count = await StaffAccount.countDocuments({ shopId: req.shop._id, isActive: true });
    if (count >= MAX_STAFF) {
      return next(new AppError(`Business plan allows max ${MAX_STAFF} staff accounts`, 403));
    }

    const { phone, name, role = 'editor' } = req.body;
    console.log(req.shop._id, req.user?._id)

    if (phone === req.user.phone) {
      return next(new AppError('Cannot add yourself as staff', 400));
    }

    // Duplicate check
    const existing = await StaffAccount.findOne({ shopId: req.shop._id, phone, isActive: true });
    if (existing) return next(new AppError('This number is already a staff member', 400));

    // Link to existing Hisab AI user if they have one
    const existingUser = await User.findOne({ phone });

     

    const staff = await StaffAccount.create({
      shopId: req.shop._id,
      ownerId: req.user._id,         
      staffUserId: existingUser?._id || null,
      phone,
      name,
      role,
      status: existingUser ? 'active' : 'invited',
      acceptedAt: existingUser ? new Date() : null,
    });

    

    // SMS invite
    const roleLabel = role === 'editor' ? 'স্টাফ' : 'দর্শক';
    const msg = `${req.shop.shopName} আপনাকে Hisab AI তে ${roleLabel} হিসেবে যোগ করেছে। ${phone} নম্বর দিয়ে লগইন করুন।`;
    await sendSMS(phone, msg).catch(() => {}); // non-blocking

    res.status(201).json({ status: 'success', data: staff });
  } catch (err) {
    next(err);
  }
};

// PUT /shops/:shopId/staff/:staffId
exports.updateStaff = async (req, res, next) => {
  try {
    if (!req.isShopOwner) return next(new AppError('Only shop owner can update staff', 403));

    const staff = await StaffAccount.findOne({ _id: req.params.staffId, shopId: req.shop._id });
    if (!staff) return next(new AppError('Staff not found', 404));

    if (req.body.role) staff.role = req.body.role;
    if (req.body.name) staff.name = req.body.name;
    if (req.body.status) staff.status = req.body.status;
    await staff.save();

    res.status(200).json({ status: 'success', data: staff });
  } catch (err) {
    next(err);
  }
};

// DELETE /shops/:shopId/staff/:staffId
exports.removeStaff = async (req, res, next) => {
  try {
    if (!req.isShopOwner) return next(new AppError('Only shop owner can remove staff', 403));

    const staff = await StaffAccount.findOne({ _id: req.params.staffId, shopId: req.shop._id });
    if (!staff) return next(new AppError('Staff not found', 404));

    staff.isActive = false;
    await staff.save();

    res.status(200).json({ status: 'success', message: 'Staff removed' });
  } catch (err) {
    next(err);
  }
};

// PUT /shops/:shopId/staff/:staffId
