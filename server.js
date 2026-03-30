require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { startReminderCron } = require('./src/jobs/reminderJob');
const { startExpiryJob } = require('./src/jobs/expiryJob');

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();

  app.listen(PORT,'0.0.0.0', () => {
    console.log(`Hisab AI server running on port ${PORT} [${process.env.NODE_ENV}]`);
  });

  // Start scheduled jobs 
  startReminderCron();
  startExpiryJob();
};

start();

// Unhandled rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err.message);
  process.exit(1);
});
