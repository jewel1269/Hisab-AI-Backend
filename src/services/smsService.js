const axios = require('axios');

const buildMessage = (template, shopName, amount) => {
  return template
    .replace('{shopName}', shopName)
    .replace('{amount}', amount.toLocaleString('bn-BD'));
};

const sendSMS = async (phone, message) => {
  try {
    const params = {
      api_token: process.env.SSL_WIRELESS_API_KEY,
      sid: process.env.SSL_WIRELESS_SID,
      msisdn: phone.replace('+', ''),
      smstext: message,
      csmsid: `HISAB_${Date.now()}`,
    };

    const response = await axios.get(process.env.SSL_WIRELESS_BASE_URL, { params });

    return {
      success: response.data?.status === 'ACCEPTED',
      raw: response.data,
    };
  } catch (err) {
    console.error('SMS send failed:', err.message);
    return { success: false, raw: null, error: err.message };
  }
};

// Send with retry (up to 3 attempts)
const sendSMSWithRetry = async (phone, message, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    const result = await sendSMS(phone, message);
    if (result.success) return result;
    await new Promise((r) => setTimeout(r, 2000 * (i + 1))); // exponential backoff
  }
  return { success: false, error: 'Max retries exceeded' };
};

module.exports = { sendSMS, sendSMSWithRetry, buildMessage };
