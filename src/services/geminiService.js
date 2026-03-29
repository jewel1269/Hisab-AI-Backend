const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `You are a financial transaction parser for a Bangladeshi shop ledger app called Hisab AI.
Extract customer name, amount in BDT, and transaction type from the given Bangla sentence.
Return ONLY valid JSON. No explanation, no markdown, no extra text.

Rules:
- type must be "due" if customer took credit/বাকি, "payment" if customer paid/দিয়েছে
- amount must be a number (convert Bangla words: পাঁচশো=500, হাজার=1000, দুইশো=200, etc.)
- customer_name should be extracted as-is (Bangla or English)
- note should be a short description in Bangla
- If amount or type is ambiguous, set "ambiguous": true

Examples:
Input: "করিম আজকে ৫০০ টাকা বাকি নিয়েছে"
Output: {"customer_name":"করিম","amount":500,"type":"due","note":"বাকি নিয়েছে","ambiguous":false}

Input: "রহিম দুইশো টাকা দিয়েছে"
Output: {"customer_name":"রহিম","amount":200,"type":"payment","note":"টাকা পরিশোধ করেছে","ambiguous":false}

Input: "সালাম পাঁচ হাজার টাকা বাকি"
Output: {"customer_name":"সালাম","amount":5000,"type":"due","note":"বাকি","ambiguous":false}`;

const parseVoiceText = async (banglaText) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: banglaText }] }],
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 200,
      },
    });

    const raw = result.response.text().trim();

    // Strip any accidental markdown fences
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // Validate required fields
    if (!parsed.customer_name || !parsed.amount || !parsed.type) {
      return { success: false, error: 'Incomplete parse result', raw };
    }
    if (!['due', 'payment'].includes(parsed.type)) {
      return { success: false, error: 'Invalid transaction type', raw };
    }

    return {
      success: true,
      data: {
        customerName: parsed.customer_name,
        amount: Number(parsed.amount),
        type: parsed.type,
        note: parsed.note || null,
        ambiguous: parsed.ambiguous || false,
      },
    };
  } catch (err) {
    console.error('Gemini parse error:', err.message);
    return { success: false, error: err.message };
  }
};

module.exports = { parseVoiceText };
