/**
 * Thin wrapper around the Google Gemini REST API (generateContent).
 *
 * Config is read exclusively from process.env (never hardcoded):
 *   - GEMINI_API_KEY       (required) the API key.
 *   - GEMINI_MODEL         (optional) defaults to "gemini-2.5-flash".
 *   - GEMINI_BASE_URL      (optional) override for the API host.
 *   - GEMINI_TIMEOUT_MS    (optional) per-attempt timeout, default 20 000 ms.
 *   - GEMINI_TLS_INSECURE  (optional) disable TLS verification (dev only).
 */

// gemini-2.5-flash-lite is small, fast and cheap, and (unlike the 2.0 models)
// has free-tier quota available on this project — so it avoids the constant
// "quota exceeded" errors while keeping token usage low.
const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_TIMEOUT_MS = 20_000;
// Network retries (transport failures / timeouts): exponential back-off.
const MAX_NETWORK_RETRIES = 2;
// Rate-limit retries: retry once if Google's suggested wait is short.
const MAX_RATE_RETRIES = 1;
const MAX_RETRY_WAIT_MS = 6000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

// Diagnostic: confirm the key is present at module-load time so the cause of
// any failure is obvious in the server log from the very first request.
console.log(
  '[geminiClient] GEMINI_API_KEY loaded:',
  process.env.GEMINI_API_KEY
    ? `yes (${process.env.GEMINI_API_KEY.slice(0, 6)}…)`
    : 'NO – set GEMINI_API_KEY in .env'
);

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
    timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  };
};

/** Single fetch attempt with an AbortController timeout. */
const fetchOnce = async (url, requestBody, apiKey, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Calls Gemini's generateContent with automatic retries on network errors.
 * Retries only on transport failures (fetch throws); non-2xx HTTP responses
 * from Gemini are not retried because they indicate a bad key / quota issue.
 *
 * @param {Object}   opts
 * @param {string}   opts.systemInstruction  high-level role/behaviour prompt.
 * @param {Array}    opts.contents           the conversation turns.
 * @param {Array}    [opts.tools]            tool/function declarations.
 * @param {Object}   [opts.toolConfig]       function-calling mode config.
 * @returns {Promise<Array>} candidate content parts.
 */
const generateContent = async ({ systemInstruction, contents, tools, toolConfig }) => {
  const { apiKey, model, baseUrl, timeoutMs } = getConfig();
  const url = `${baseUrl}/models/${model}:generateContent`;

  const body = { contents };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  if (tools) body.tools = tools;
  if (toolConfig) body.toolConfig = toolConfig;

  let lastNetworkCause;
  let rateAttempt = 0;
  for (let attempt = 0; attempt <= MAX_NETWORK_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential back-off for network/transport errors: 1 s, then 2 s.
      await sleep(1000 * attempt);
      console.log(`[geminiClient] Network retry ${attempt}/${MAX_NETWORK_RETRIES}:`, lastNetworkCause?.message);
    }

    let response;
    try {
      response = await fetchOnce(url, body, apiKey, timeoutMs);
    } catch (cause) {
      lastNetworkCause = cause;
      const isTimeout = cause.name === 'AbortError';
      console.error(
        `[geminiClient] Attempt ${attempt + 1} failed (${isTimeout ? 'timeout' : 'network'}):`,
        cause.message
      );
      if (attempt === MAX_NETWORK_RETRIES) {
        const err = new Error(
          isTimeout
            ? `Gemini API timed out after ${timeoutMs} ms`
            : 'Could not reach the Gemini API'
        );
        err.status = 502;
        err.cause = cause;
        throw err;
      }
      continue;
    }

    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      const candidate = data.candidates && data.candidates[0];
      return (candidate && candidate.content && candidate.content.parts) || [];
    }

    // Rate limited: retry once if the suggested wait is short; otherwise surface
    // a clean QUOTA_EXCEEDED error so the chat layer can reply in the user's language.
    if (response.status === 429) {
      const waitMs = parseRetryDelayMs(data);
      if (rateAttempt < MAX_RATE_RETRIES && waitMs !== null && waitMs <= MAX_RETRY_WAIT_MS) {
        rateAttempt += 1;
        attempt -= 1; // don't burn a network retry slot
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
    console.error(`[geminiClient] Gemini HTTP ${response.status}:`, message);
    const err = new Error(message);
    err.status = 502;
    throw err;
  }
};

module.exports = { generateContent };
