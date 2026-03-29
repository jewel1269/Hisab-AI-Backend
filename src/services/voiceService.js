const axios = require('axios');
const fs = require('fs');
const { GoogleAuth } = require('google-auth-library');

let authClient = null;

const getAuthToken = async () => {
  if (!authClient) {
    authClient = new GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }
  const client = await authClient.getClient();
  const token = await client.getAccessToken();
  return token.token;
};

const transcribeAudio = async (audioBuffer, mimeType = 'audio/webm') => {
  try {
    const token = await getAuthToken();
    const audioBase64 = audioBuffer.toString('base64');

    // Map MIME type to Google STT encoding
    const encodingMap = {
      'audio/webm': 'WEBM_OPUS',
      'audio/ogg': 'OGG_OPUS',
      'audio/wav': 'LINEAR16',
      'audio/mp4': 'MP4',
      'audio/flac': 'FLAC',
    };
    const encoding = encodingMap[mimeType] || 'WEBM_OPUS';

    const requestBody = {
      config: {
        encoding,
        sampleRateHertz: 16000,
        languageCode: 'bn-BD',
        alternativeLanguageCodes: ['bn-IN'],
        enableAutomaticPunctuation: false,
        model: 'default',
        useEnhanced: false,
      },
      audio: {
        content: audioBase64,
      },
    };

    const response = await axios.post(
      'https://speech.googleapis.com/v1/speech:recognize',
      requestBody,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const results = response.data?.results;
    if (!results || results.length === 0) {
      return { success: false, error: 'No speech detected' };
    }

    const transcript = results
      .map((r) => r.alternatives[0]?.transcript || '')
      .join(' ')
      .trim();

    const confidence = results[0]?.alternatives[0]?.confidence || 0;

    return {
      success: true,
      transcript,
      confidence,
      raw: response.data,
    };
  } catch (err) {
    console.error('STT error:', err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.error?.message || err.message,
    };
  }
};

module.exports = { transcribeAudio };
