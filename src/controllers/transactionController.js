const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Customer = require('../models/Customer');
const AppError = require('../utils/AppError');
const { paginate, paginatedResponse } = require('../utils/pagination');
const { createAuditLog } = require('../middleware/auditLogger');
const { transcribeAudio } = require('../services/voiceService');
const { parseVoiceText } = require('../services/geminiService');

// Atomic helper: create transaction + update customer.totalDue
const createTransactionAtomic = async (session, { customerId, shopId, userId, type, amount, note, voiceInput }) => {
  const customer = await Customer.findById(customerId).session(session);
  if (!customer || !customer.isActive) throw new AppError('Customer not found', 404);

  const delta = type === 'due' ? amount : -amount;
  const newBalance = Math.max(0, customer.totalDue + delta);

  const [transaction] = await Transaction.create(
    [{ customerId, shopId, userId, type, amount, note, voiceInput, balanceAfter: newBalance }],
    { session }
  );

  await Customer.findByIdAndUpdate(
    customerId,
    { totalDue: newBalance, lastTransactionAt: new Date() },
    { session }
  );

  return transaction;
};

// GET /shops/:shopId/transactions
exports.getTransactions = async (req, res, next) => {
  try {
    const { page, limit, skip } = paginate(null, req.query);
    const { customerId, type, from, to } = req.query;

    const filter = { shopId: req.shop._id };
    if (customerId) filter.customerId = customerId;
    if (type) filter.type = type;
    if (from || to) {
      filter.transactionDate = {};
      if (from) filter.transactionDate.$gte = new Date(from);
      if (to) filter.transactionDate.$lte = new Date(to);
    }

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .populate('customerId', 'name phone')
        .sort({ transactionDate: -1 })
        .skip(skip)
        .limit(limit),
      Transaction.countDocuments(filter),
    ]);

    res.status(200).json({
      status: 'success',
      ...paginatedResponse(transactions, total, page, limit),
    });
  } catch (err) {
    next(err);
  }
};

// POST /shops/:shopId/transactions
exports.createTransaction = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { customerId, type, amount, note, transactionDate } = req.body;
    console.log(req.body)

    const transaction = await createTransactionAtomic(session, {
      customerId,
      shopId: req.shop._id,
      userId: req.user._id,
      type,
      amount: Number(amount),
      note,
      voiceInput: { parsedBy: 'manual' },
    });

    if (transactionDate) {
      transaction.transactionDate = new Date(transactionDate);
      await transaction.save({ session });
    }

    await session.commitTransaction();

    await createAuditLog({
      userId: req.user._id,
      tableName: 'transactions',
      recordId: transaction._id,
      action: 'create',
      newData: transaction.toObject(),
      ip: req.ip,
    });

    res.status(201).json({ status: 'success', data: transaction });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

// POST /shops/:shopId/transactions/voice
exports.createVoiceTransaction = async (req, res, next) => {
  try {
    // Step 1: Get audio buffer from multipart upload
    if (!req.file) return next(new AppError('Audio file required', 400));

    const audioBuffer = req.file.buffer;
    const mimeType = req.file.mimetype;

    // Step 2: Google STT — audio → Bangla text
    const sttResult = await transcribeAudio(audioBuffer, mimeType);
    if (!sttResult.success) {
      return res.status(422).json({
        status: 'fail',
        step: 'stt',
        message: 'Could not understand audio. Please try again.',
        error: sttResult.error,
      });
    }

    // Step 3: Gemini NLP — Bangla text → structured data
    const parseResult = await parseVoiceText(sttResult.transcript);
    if (!parseResult.success) {
      return res.status(422).json({
        status: 'fail',
        step: 'parse',
        message: 'Could not parse transaction. Please enter manually.',
        transcript: sttResult.transcript,
        error: parseResult.error,
      });
    }

    const { customerName, amount, type, note, ambiguous } = parseResult.data;

    // Step 4: Find or suggest customer
    const customerMatch = await Customer.findOne({
      shopId: req.shop._id,
      name: new RegExp(customerName, 'i'),
      isActive: true,
    });

    // Return parsed result to app for confirmation (not saved yet)
    res.status(200).json({
      status: 'success',
      requiresConfirmation: true,
      ambiguous,
      transcript: sttResult.transcript,
      parsed: {
        customerName,
        amount,
        type,
        note,
      },
      customerMatch: customerMatch
        ? { id: customerMatch._id, name: customerMatch.name, totalDue: customerMatch.totalDue }
        : null,
    });
  } catch (err) {
    next(err);
  }
};

// POST /shops/:shopId/transactions/voice/confirm
exports.confirmVoiceTransaction = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { customerId, type, amount, note, transcript } = req.body;

    const transaction = await createTransactionAtomic(session, {
      customerId,
      shopId: req.shop._id,
      userId: req.user._id,
      type,
      amount: Number(amount),
      note,
      voiceInput: { rawText: transcript, parsedBy: 'voice' },
    });

    await session.commitTransaction();
    res.status(201).json({ status: 'success', data: transaction });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

// PUT /shops/:shopId/transactions/:id
exports.updateTransaction = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      shopId: req.shop._id,
    }).session(session);

    if (!transaction) return next(new AppError('Transaction not found', 404));

    // 24-hour edit window
    const hoursDiff = (new Date() - transaction.createdAt) / (1000 * 60 * 60);
    if (hoursDiff > 24) return next(new AppError('Transactions can only be edited within 24 hours', 403));

    const oldData = transaction.toObject();
    const oldAmount = transaction.amount;
    const oldType = transaction.type;

    // Reverse old effect, apply new
    const { amount, note, transactionDate } = req.body;
    const newAmount = amount ? Number(amount) : oldAmount;

    // Recalculate customer balance
    const customer = await Customer.findById(transaction.customerId).session(session);
    const oldDelta = oldType === 'due' ? oldAmount : -oldAmount;
    const newDelta = oldType === 'due' ? newAmount : -newAmount;
    const newBalance = Math.max(0, customer.totalDue - oldDelta + newDelta);

    transaction.amount = newAmount;
    if (note !== undefined) transaction.note = note;
    if (transactionDate) transaction.transactionDate = new Date(transactionDate);
    transaction.balanceAfter = newBalance;
    await transaction.save({ session });

    await Customer.findByIdAndUpdate(transaction.customerId, { totalDue: newBalance }, { session });
    await session.commitTransaction();

    await createAuditLog({
      userId: req.user._id,
      tableName: 'transactions',
      recordId: transaction._id,
      action: 'update',
      oldData,
      newData: transaction.toObject(),
      ip: req.ip,
    });

    res.status(200).json({ status: 'success', data: transaction });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

// DELETE /shops/:shopId/transactions/:id
exports.deleteTransaction = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      shopId: req.shop._id,
    }).session(session);

    if (!transaction) return next(new AppError('Transaction not found', 404));

    // Reverse customer balance
    const delta = transaction.type === 'due' ? transaction.amount : -transaction.amount;
    await Customer.findByIdAndUpdate(
      transaction.customerId,
      { $inc: { totalDue: -delta } },
      { session }
    );

    transaction.isDeleted = true;
    transaction.deletedAt = new Date();
    await transaction.save({ session });

    await session.commitTransaction();

    await createAuditLog({
      userId: req.user._id,
      tableName: 'transactions',
      recordId: transaction._id,
      action: 'delete',
      oldData: transaction.toObject(),
      ip: req.ip,
    });

    res.status(200).json({ status: 'success', message: 'Transaction deleted' });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};
