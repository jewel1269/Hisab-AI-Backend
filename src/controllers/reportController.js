const Transaction = require('../models/Transaction');
const Customer = require('../models/Customer');
const AppError = require('../utils/AppError');
const dayjs = require('dayjs');
const PDFDocument = require('pdfkit');


// GET /shops/:shopId/reports/monthly?year=2026&month=3
exports.getMonthlyReport = async (req, res, next) => {
  try {
    const year = parseInt(req.query.year) || dayjs().year();
    const month = parseInt(req.query.month) || dayjs().month() + 1;

    const from = dayjs(`${year}-${month}-01`).startOf('month').toDate();
    const to = dayjs(`${year}-${month}-01`).endOf('month').toDate();

    const [summary] = await Transaction.aggregate([
      {
        $match: {
          shopId: req.shop._id,
          transactionDate: { $gte: from, $lte: to },
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: null,
          dues: {
            $sum: { $cond: [{ $eq: ['$_id', 'due'] }, '$total', 0] },
          },
          payments: {
            $sum: { $cond: [{ $eq: ['$_id', 'payment'] }, '$total', 0] },
          },
          dueCount: {
            $sum: { $cond: [{ $eq: ['$_id', 'due'] }, '$count', 0] },
          },
          paymentCount: {
            $sum: { $cond: [{ $eq: ['$_id', 'payment'] }, '$count', 0] },
          },
        },
      },
    ]);

    const dues = summary?.dues || 0;
    const payments = summary?.payments || 0;

    // Top 5 customers by outstanding due
    const topCustomers = await Customer.find({ shopId: req.shop._id, isActive: true, totalDue: { $gt: 0 } })
      .sort({ totalDue: -1 })
      .limit(5)
      .select('name phone totalDue lastTransactionAt');

    // Total outstanding (all time)
    const totalOutstanding = await Customer.aggregate([
      { $match: { shopId: req.shop._id, isActive: true } },
      { $group: { _id: null, total: { $sum: '$totalDue' } } },
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        period: { year, month, from, to },
        thisMonth: {
          duesAdded: dues,
          paymentsCollected: payments,
          netChange: dues - payments,
          dueTransactionCount: summary?.dueCount || 0,
          paymentTransactionCount: summary?.paymentCount || 0,
        },
        totalOutstanding: totalOutstanding[0]?.total || 0,
        topCustomers,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /shops/:shopId/reports/customer/:customerId
exports.getCustomerReport = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({
      _id: req.params.customerId,
      shopId: req.shop._id,
    });
    if (!customer) return next(new AppError('Customer not found', 404));

    const transactions = await Transaction.find({
      customerId: customer._id,
      shopId: req.shop._id,
    }).sort({ transactionDate: -1 }).limit(100);

    const summary = transactions.reduce(
      (acc, t) => {
        if (t.type === 'due') acc.totalDue += t.amount;
        else acc.totalPaid += t.amount;
        return acc;
      },
      { totalDue: 0, totalPaid: 0 }
    );

    res.status(200).json({
      status: 'success',
      data: { customer, summary, transactions },
    });
  } catch (err) {
    next(err);
  }
};

// POST /shops/:shopId/reports/export
exports.exportReport = async (req, res, next) => {
  try {
    const { format = 'pdf', year, month } = req.body;

    const from = dayjs(`${year}-${month}-01`).startOf('month').toDate();
    const to = dayjs(`${year}-${month}-01`).endOf('month').toDate();

    const transactions = await Transaction.find({
      shopId: req.shop._id,
      transactionDate: { $gte: from, $lte: to },
    })
      .populate('customerId', 'name phone')
      .sort({ transactionDate: -1 });

    if (format === 'csv') {
      const rows = transactions.map((t) => ({
        Date: dayjs(t.transactionDate).format('DD/MM/YYYY'),
        Customer: t.customerId?.name || 'N/A',
        Phone: t.customerId?.phone || '',
        Type: t.type === 'due' ? 'বাকি' : 'পরিশোধ',
        Amount: t.amount,
        Note: t.note || '',
        'Balance After': t.balanceAfter,
      }));

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=hisab-${year}-${month}.csv`);

      const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const headers = Object.keys(rows[0] || {}).map(escape).join(',');
      const lines = rows.map((r) => Object.values(r).map(escape).join(','));
      // BOM prefix so Excel opens UTF-8 (Bangla) correctly
      return res.send('\uFEFF' + [headers, ...lines].join('\n'));
    }

    // PDF export
    const doc = new PDFDocument({ margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=hisab-${year}-${month}.pdf`);
    doc.pipe(res);

    doc.fontSize(18).text(`${req.shop.shopName} — মাসিক রিপোর্ট`, { align: 'center' });
    doc.fontSize(12).text(`${month}/${year}`, { align: 'center' });
    doc.moveDown();

    let totalDue = 0;
    let totalPayment = 0;

    transactions.forEach((t) => {
      const date = dayjs(t.transactionDate).format('DD/MM/YYYY');
      const customer = t.customerId?.name || 'N/A';
      const typeLabel = t.type === 'due' ? '[বাকি]' : '[পরিশোধ]';
      doc.fontSize(10).text(`${date}  ${customer}  ${typeLabel}  ৳${t.amount}`);
      if (t.type === 'due') totalDue += t.amount;
      else totalPayment += t.amount;
    });

    doc.moveDown();
    doc.fontSize(12).text(`মোট বাকি: ৳${totalDue}`);
    doc.text(`মোট আদায়: ৳${totalPayment}`);
    doc.text(`নেট: ৳${totalDue - totalPayment}`);
    doc.end();
  } catch (err) {
    next(err);
  }
};

// GET /shops/:shopId/reports/dashboard
exports.getDashboard = async (req, res, next) => {
  try {
    const today = dayjs().startOf('day').toDate();
    const weekStart = dayjs().startOf('week').toDate();
    const monthStart = dayjs().startOf('month').toDate();

    const [totalOutstanding, monthlyStats, recentTransactions, activeCustomers] = await Promise.all([
      Customer.aggregate([
        { $match: { shopId: req.shop._id, isActive: true } },
        { $group: { _id: null, total: { $sum: '$totalDue' }, count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        { $match: { shopId: req.shop._id, transactionDate: { $gte: monthStart }, isDeleted: false } },
        {
          $group: {
            _id: '$type',
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]),
      Transaction.find({ shopId: req.shop._id })
        .populate('customerId', 'name')
        .sort({ createdAt: -1 })
        .limit(5),
      Customer.countDocuments({ shopId: req.shop._id, isActive: true, totalDue: { $gt: 0 } }),
    ]);

    const monthly = monthlyStats.reduce((acc, s) => {
      acc[s._id] = { total: s.total, count: s.count };
      return acc;
    }, {});

    res.status(200).json({
      status: 'success',
      data: {
        totalOutstanding: totalOutstanding[0]?.total || 0,
        totalCustomers: totalOutstanding[0]?.count || 0,
        activeCustomersWithDue: activeCustomers,
        thisMonth: {
          duesAdded: monthly.due?.total || 0,
          paymentsCollected: monthly.payment?.total || 0,
        },
        recentTransactions,
      },
    });
  } catch (err) {
    next(err);
  }
};
