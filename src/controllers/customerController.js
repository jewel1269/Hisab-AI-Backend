const Customer = require('../models/Customer');
const AppError = require('../utils/AppError');
const { paginate, paginatedResponse } = require('../utils/pagination');
const { createAuditLog } = require('../middleware/auditLogger');

const CUSTOMER_LIMITS = { free: 10, pro: Infinity, business: Infinity };

// GET /shops/:shopId/customers
exports.getCustomers = async (req, res, next) => {
  try {
    const { page, limit, skip } = paginate(null, req.query);
    const { search, sortBy = 'totalDue' } = req.query;

    const filter = { shopId: req.shop._id, isActive: true };
    if (search) filter.$text = { $search: search };

    const sortMap = {
      totalDue: { totalDue: -1 },
      name: { name: 1 },
      lastTransaction: { lastTransactionAt: -1 },
    };
    const sort = sortMap[sortBy] || { totalDue: -1 };

    const [customers, total] = await Promise.all([
      Customer.find(filter).sort(sort).skip(skip).limit(limit),
      Customer.countDocuments(filter),
    ]);

    res.status(200).json({
      status: 'success',
      ...paginatedResponse(customers, total, page, limit),
    });
  } catch (err) {
    next(err);
  }
};

// POST /shops/:shopId/customers
exports.createCustomer = async (req, res, next) => {
  try {
    const plan = req.user.plan;
    const limit = CUSTOMER_LIMITS[plan];
    if (limit !== Infinity) {
      const count = await Customer.countDocuments({ shopId: req.shop._id, isActive: true });
      if (count >= limit) {
        return next(new AppError(`Free plan allows max ${limit} customers. Upgrade to Pro.`, 403));
      }
    }

    const { name, phone, address } = req.body;
    const customer = await Customer.create({
      shopId: req.shop._id,
      userId: req.user._id,
      name,
      phone: phone || null,
      address: address || null,
    });

    await createAuditLog({
      userId: req.user._id,
      tableName: 'customers',
      recordId: customer._id,
      action: 'create',
      newData: customer.toObject(),
      ip: req.ip,
    });

    res.status(201).json({ status: 'success', data: customer });
  } catch (err) {
    next(err);
  }
};

// GET /shops/:shopId/customers/:customerId
exports.getCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({
      _id: req.params.customerId,
      shopId: req.shop._id,
      isActive: true,
    });
    if (!customer) return next(new AppError('Customer not found', 404));

    res.status(200).json({ status: 'success', data: customer });
  } catch (err) {
    next(err);
  }
};

// PUT /shops/:shopId/customers/:customerId
exports.updateCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({
      _id: req.params.customerId,
      shopId: req.shop._id,
    });
    if (!customer) return next(new AppError('Customer not found', 404));

    const oldData = customer.toObject();
    const allowed = ['name', 'phone', 'address'];
    allowed.forEach((f) => { if (req.body[f] !== undefined) customer[f] = req.body[f]; });
    await customer.save();

    await createAuditLog({
      userId: req.user._id,
      tableName: 'customers',
      recordId: customer._id,
      action: 'update',
      oldData,
      newData: customer.toObject(),
      ip: req.ip,
    });

    res.status(200).json({ status: 'success', data: customer });
  } catch (err) {
    next(err);
  }
};

// DELETE /shops/:shopId/customers/:customerId
exports.deleteCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({
      _id: req.params.customerId,
      shopId: req.shop._id,
    });
    if (!customer) return next(new AppError('Customer not found', 404));

    await createAuditLog({
      userId: req.user._id,
      tableName: 'customers',
      recordId: customer._id,
      action: 'delete',
      oldData: customer.toObject(),
      ip: req.ip,
    });

    customer.isActive = false;
    await customer.save();

    res.status(200).json({ status: 'success', message: 'Customer deleted' });
  } catch (err) {
    next(err);
  }
};
