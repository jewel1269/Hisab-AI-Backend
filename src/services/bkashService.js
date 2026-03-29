const axios = require('axios');

const BASE_URL = process.env.BKASH_BASE_URL;

let bkashToken = null;
let tokenExpiry = null;

const getHeaders = (token = null) => ({
  'Content-Type': 'application/json',
  Accept: 'application/json',
  username: process.env.BKASH_USERNAME,
  password: process.env.BKASH_PASSWORD,
  ...(token && { Authorization: token }),
});

// Grant token (cached, refresh before expiry)
const grantToken = async () => {
  if (bkashToken && tokenExpiry && new Date() < tokenExpiry) return bkashToken;

  const response = await axios.post(
    `${BASE_URL}/tokenized/checkout/token/grant`,
    {
      app_key: process.env.BKASH_APP_KEY,
      app_secret: process.env.BKASH_APP_SECRET,
    },
    { headers: getHeaders() }
  );

  bkashToken = response.data.id_token;
  // bKash tokens expire in 3600s, refresh at 3500s
  tokenExpiry = new Date(Date.now() + 3500 * 1000);
  return bkashToken;
};

// Create payment session
const createPayment = async ({ amount, payerReference, callbackURL }) => {
  try {
    const token = await grantToken();
    const response = await axios.post(
      `${BASE_URL}/tokenized/checkout/create`,
      {
        mode: '0011', // tokenized checkout
        payerReference,
        callbackURL,
        amount: amount.toString(),
        currency: 'BDT',
        intent: 'sale',
        merchantInvoiceNumber: `HISAB_${Date.now()}`,
      },
      { headers: getHeaders(token) }
    );

    return {
      success: true,
      paymentID: response.data.paymentID,
      bkashURL: response.data.bkashURL,
      raw: response.data,
    };
  } catch (err) {
    console.error('bKash create error:', err.response?.data || err.message);
    return { success: false, error: err.response?.data?.statusMessage || err.message };
  }
};

// Execute payment after user approval
const executePayment = async (paymentID) => {
  try {
    const token = await grantToken();
    const response = await axios.post(
      `${BASE_URL}/tokenized/checkout/execute`,
      { paymentID },
      { headers: getHeaders(token) }
    );

    const data = response.data;
    return {
      success: data.statusCode === '0000',
      trxID: data.trxID,
      paymentID: data.paymentID,
      amount: data.amount,
      statusMessage: data.statusMessage,
      raw: data,
    };
  } catch (err) {
    console.error('bKash execute error:', err.response?.data || err.message);
    return { success: false, error: err.response?.data?.statusMessage || err.message };
  }
};

// Query payment status
const queryPayment = async (paymentID) => {
  try {
    const token = await grantToken();
    const response = await axios.post(
      `${BASE_URL}/tokenized/checkout/payment/status`,
      { paymentID },
      { headers: getHeaders(token) }
    );
    return { success: true, data: response.data };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

module.exports = { createPayment, executePayment, queryPayment };
