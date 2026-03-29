const AuditLog = require('../models/AuditLog');

const createAuditLog = async ({ userId, tableName, recordId, action, oldData, newData, ip }) => {
  try {
    await AuditLog.create({ userId, tableName, recordId, action, oldData, newData, ip });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
};

module.exports = { createAuditLog };
