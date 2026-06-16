/**
 * Thin wrapper around the Google Gemini REST API (generateContent).
 *
 * It is deliberately transport-only: it knows nothing about SplitIt's domain.
 * The assistant service supplies the system instruction, the conversation
 * `contents`, and the `tools` (function declarations); this module just signs
 * the request with GEMINI_API_KEY and normalises the response into the first
 * candidate's parts.
 *
 * Config is read exclusively from process.env (never hardcoded):
 *   - GEMINI_API_KEY   (required) the API key.
 *   - GEMINI_MODEL     (optional) defaults to "gemini-2.0-flash".
 *   - GEMINI_BASE_URL  (optional) override for the API host.
 */

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// Corporate proxies/antivirus sometimes break Gemini TLS. Opt-in via env (dev only).
if (process.env.GEMINI_TLS_INSECURE === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const getConfig = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error('Gemini is not configured: missing GEMINI_API_KEY');
    err.status = 503;
    throw err;
  }
  return {
    apiKey,
    model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
    baseUrl: process.env.GEMINI_BASE_URL || DEFAULT_BASE_URL,
  };
};

/**
 * Calls Gemini's generateContent once and returns the raw parts of the first
 * candidate (an array of objects that may carry `text` and/or `functionCall`).
 *
 * @param {Object}   opts
 * @param {string}   opts.systemInstruction  high-level role/behaviour prompt.
 * @param {Array}    opts.contents           the conversation turns.
 * @param {Array}    [opts.tools]            tool/function declarations.
 * @param {Object}   [opts.toolConfig]       function-calling mode config.
 * @returns {Promise<Array>} candidate content parts.
 */
const generateContent = async ({ systemInstruction, contents, tools, toolConfig }) => {
  const { apiKey, model, baseUrl } = getConfig();
  const url = `${baseUrl}/models/${model}:generateContent`;

  const body = { contents };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  if (tools) body.tools = tools;
  if (toolConfig) body.toolConfig = toolConfig;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    const err = new Error('Could not reach the Gemini API');
    err.status = 502;
    err.cause = cause;
    throw err;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      (data && data.error && data.error.message) || `Gemini request failed (${response.status})`;
    const err = new Error(message);
    // Treat any upstream failure as a 502 so we never report Gemini's own 4xx
    // (bad key, quota, etc.) as if it were the client's fault.
    err.status = 502;
    throw err;
  }

  const candidate = data.candidates && data.candidates[0];
  const parts = (candidate && candidate.content && candidate.content.parts) || [];
  return parts;
};

module.exports = { generateContent };
