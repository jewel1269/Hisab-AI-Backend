const Customer = require('../models/Customer');
const Transaction = require('../models/Transaction');
const AppError = require('../utils/AppError');
const dayjs = require('dayjs');

// GET /shops/:shopId/export/full
// Returns complete data dump as JSON (for cloud backup / data portability)
exports.fullExport = async (req, res, next) => {
  try {
    const plan = req.user.plan;

    // Free: only last 7 days
    // Pro: last 1 year
    // Business: all time
    const cutoffDays = { free: 7, pro: 365, business: Infinity };
    const days = cutoffDays[plan];
    const fromDate = days === Infinity ? null : dayjs().subtract(days, 'day').toDate();

    const customerFilter = { shopId: req.shop._id, isActive: true };
    const txFilter = { shopId: req.shop._id };
    if (fromDate) txFilter.transactionDate = { $gte: fromDate };

    const [customers, transactions] = await Promise.all([
      Customer.find(customerFilter).lean(),
      Transaction.find(txFilter).lean(),
    ]);

    const exportData = {
      exportedAt: new Date(),
      shop: {
        id: req.shop._id,
        name: req.shop.shopName,
        owner: req.shop.ownerName,
        category: req.shop.category,
      },
      plan,
      backupPeriod: fromDate ? `Last ${days} days` : 'All time',
      summary: {
        totalCustomers: customers.length,
        totalTransactions: transactions.length,
      },
      customers,
      transactions,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=hisab-backup-${req.shop._id}-${dayjs().format('YYYY-MM-DD')}.json`
    );
    res.send(JSON.stringify(exportData, null, 2));
  } catch (err) {
    next(err);
  }
};

// GET /shops/:shopId/export/customers-csv
// Export customer list with totals as CSV
exports.customersCSV = async (req, res, next) => {
  try {
    const customers = await Customer.find({ shopId: req.shop._id, isActive: true })
      .sort({ totalDue: -1 })
      .lean();

    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = ['Name', 'Phone', 'Address', 'Total Due (BDT)', 'Last Transaction', 'Added On'];
    const rows = customers.map((c) => [
      c.name,
      c.phone || '',
      c.address || '',
      c.totalDue,
      c.lastTransactionAt ? dayjs(c.lastTransactionAt).format('DD/MM/YYYY') : '',
      dayjs(c.createdAt).format('DD/MM/YYYY'),
    ]);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=customers-${req.shop._id}.csv`);

    const lines = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))];
    res.send('\uFEFF' + lines.join('\n'));
  } catch (err) {
    next(err);
  }
};
