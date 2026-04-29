/**
 * Gemini API client for AI-generated report commentary.
 * Uses Google Generative Language REST API (no SDK required).
 *
 * https://ai.google.dev/gemini-api/docs/text-generation
 */
import axios from 'axios';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export async function generateInsight(prompt: string, opts?: { maxTokens?: number }): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return '(Gemini disabled: GEMINI_API_KEY not set)';
  }

  try {
    const res = await axios.post(
      `${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`,
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: opts?.maxTokens ?? 800,
        },
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      }
    );
    const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof text === 'string' ? text.trim() : '(Gemini returned no text)';
  } catch (err: any) {
    console.warn('[gemini] generateInsight error:', err?.response?.data || err?.message);
    return `(Gemini error: ${err?.message || 'unknown'})`;
  }
}

/**
 * Generate marketing-report commentary given a structured payload.
 * The payload is JSON-serialized and shown to Gemini with strong instructions
 * to produce a concise plain-English summary.
 */
export async function generateMarketingInsight(payload: {
  date_range: { from: string; to: string };
  totals: any;
  channels: any;
  meta_lanes?: any;
  google?: any;
  top_ads?: any;
  notes?: string;
}): Promise<string> {
  const prompt = `You are a senior performance-marketing analyst for MiM Essay (an MBA admissions consultancy). \
Below is JSON data for a Volume + Quality report. Produce a concise commentary (5-10 bullets, no fluff). \
Focus on: (1) overall CPL/CPQL trend, (2) which Meta lane is winning vs killing budget, (3) Google Ads contribution, \
(4) top winner ads to scale and worst ads to kill (use kill matrix: CPL > 1103, Good% < 5%), \
(5) any organic channel surprises. Use ₹ for currency. Be specific with numbers — do NOT hallucinate.\n\n\
DATA:\n${JSON.stringify(payload, null, 2)}\n\n\
Output as plain markdown bullets only.`;
  return generateInsight(prompt, { maxTokens: 600 });
}
