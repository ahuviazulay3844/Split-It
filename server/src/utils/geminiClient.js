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

// gemini-2.5-flash-lite is small, fast and cheap, and (unlike the 2.0 models)
// has free-tier quota available on this project — so it avoids the constant
// "quota exceeded" errors while keeping token usage low.
const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// On a 429 we retry once if Google's suggested wait is short; longer waits are
// surfaced to the caller (so the UI never hangs for half a minute).
const MAX_RETRIES = 1;
const MAX_RETRY_WAIT_MS = 6000;

/** Pulls the suggested retry delay (ms) out of Gemini's 429 error payload. */
const parseRetryDelayMs = (data) => {
  const details = (data && data.error && data.error.details) || [];
  const retryInfo = details.find((d) => String(d['@type'] || '').includes('RetryInfo'));
  const raw = retryInfo && retryInfo.retryDelay; // e.g. "38s" or "1.5s"
  if (!raw) return null;
  const seconds = parseFloat(String(raw).replace('s', ''));
  return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : null;
};

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

  for (let attempt = 0; ; attempt += 1) {
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

    if (response.ok) {
      const candidate = data.candidates && data.candidates[0];
      return (candidate && candidate.content && candidate.content.parts) || [];
    }

    // Rate limited: retry once if the suggested wait is short; otherwise give a
    // clean, friendly error instead of Google's long English quota dump.
    if (response.status === 429) {
      const waitMs = parseRetryDelayMs(data);
      if (attempt < MAX_RETRIES && waitMs !== null && waitMs <= MAX_RETRY_WAIT_MS) {
        await sleep(waitMs);
        continue;
      }
      const err = new Error('QUOTA_EXCEEDED');
      err.status = 429;
      err.retryAfterMs = waitMs || null;
      throw err;
    }

    const message =
      (data && data.error && data.error.message) || `Gemini request failed (${response.status})`;
    const err = new Error(message);
    // Treat other upstream failures as a 502 so we never report Gemini's own 4xx
    // (bad key, etc.) as if it were the client's fault.
    err.status = 502;
    throw err;
  }
};

module.exports = { generateContent };
