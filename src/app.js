const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { globalLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const AppError = require('./utils/AppError');

const app = express();

// Security
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(globalLimiter);

// Parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', app: 'Hisab AI', timestamp: new Date() });
});

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/shops', require('./routes/shops'));
app.use('/shops/:shopId/customers', require('./routes/customers'));
app.use('/shops/:shopId/transactions', require('./routes/transactions'));
app.use('/shops/:shopId/reports', require('./routes/reports'));
app.use('/shops/:shopId/reminders', require('./routes/reminders'));
app.use('/payment', require('./routes/payment'));
app.use('/shops/:shopId/staff', require('./routes/staff'));
app.use('/shops/:shopId/export', require('./routes/export'));

// 404 handler
app.all('*', (req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} not found`, 404));
});

// Global error handler
app.use(errorHandler);

module.exports = app;
