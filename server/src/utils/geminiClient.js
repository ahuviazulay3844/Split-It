/**
 * Google Gemini REST client (generateContent).
 *
 * Config (process.env only):
 *   GEMINI_API_KEY          required
 *   GEMINI_MODEL            primary model (default: gemini-2.5-flash-lite)
 *   GEMINI_FALLBACK_MODELS  comma-separated fallbacks when primary is limited
 *   GEMINI_BASE_URL         optional API host (default: v1beta)
 *   GEMINI_TIMEOUT_MS       per-attempt timeout (default 20000)
 *   GEMINI_TLS_INSECURE     dev-only TLS bypass
 */

const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const DEFAULT_FALLBACKS = ['gemini-2.0-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_TIMEOUT_MS = 20_000;

const MAX_NETWORK_RETRIES = 2;
const MAX_RATE_RETRIES = 1;
const MAX_RETRY_WAIT_MS = 8000;

// After a daily-quota hit, skip all Gemini calls for this long (avoids "wait…wait…wait" loops).
const DAILY_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (process.env.GEMINI_TLS_INSECURE === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

console.log(
  '[geminiClient] GEMINI_API_KEY loaded:',
  process.env.GEMINI_API_KEY
    ? `yes (${process.env.GEMINI_API_KEY.slice(0, 6)}…)`
    : 'NO – set GEMINI_API_KEY in .env'
);

/** In-memory cooldown so repeated chat messages don't hammer a dead quota. */
let quotaCooldown = null;

const getConfig = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error('Gemini is not configured: missing GEMINI_API_KEY');
    err.status = 503;
    throw err;
  }

  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS || DEFAULT_FALLBACKS.join(','))
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  const primary = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const models = [...new Set([primary, ...fallbacks])];

  return {
    apiKey,
    models,
    baseUrl: process.env.GEMINI_BASE_URL || DEFAULT_BASE_URL,
    timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  };
};

const parseRetryDelayMs = (data) => {
  const details = (data && data.error && data.error.details) || [];
  const retryInfo = details.find((d) => String(d['@type'] || '').includes('RetryInfo'));
  const raw = retryInfo && retryInfo.retryDelay;
  if (!raw) return null;
  const seconds = parseFloat(String(raw).replace('s', ''));
  return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : null;
};

/** Distinguish daily quota (waiting won't help) from per-minute rate limits. */
const classifyQuotaError = (data, httpStatus) => {
  const message = String((data && data.error && data.error.message) || '');
  const details = (data && data.error && data.error.details) || [];
  const quotaFailure = details.find((d) => String(d['@type'] || '').includes('QuotaFailure'));
  const quotaIds = (quotaFailure?.violations || []).map((v) => v.quotaId || '');

  const isDaily =
    quotaIds.some((id) => /PerDay/i.test(id)) ||
    /per day|daily quota|requests per day/i.test(message);
  const isPerMinute =
    quotaIds.some((id) => /PerMinute/i.test(id)) ||
    /per minute|RPM/i.test(message);

  if (isDaily) return { kind: 'daily', retryAfterMs: null };
  if (httpStatus === 503 || /high demand/i.test(message)) {
    return { kind: 'busy', retryAfterMs: parseRetryDelayMs(data) };
  }
  if (isPerMinute) return { kind: 'rate', retryAfterMs: parseRetryDelayMs(data) };
  return { kind: 'rate', retryAfterMs: parseRetryDelayMs(data) };
};

const throwQuotaError = (classification) => {
  const err = new Error('QUOTA_EXCEEDED');
  err.status = 429;
  err.quotaKind = classification.kind;
  err.retryAfterMs = classification.retryAfterMs;
  throw err;
};

const checkCooldown = () => {
  if (!quotaCooldown) return;
  if (Date.now() >= quotaCooldown.until) {
    quotaCooldown = null;
    return;
  }
  const err = new Error('QUOTA_EXCEEDED');
  err.status = 429;
  err.quotaKind = quotaCooldown.kind;
  err.retryAfterMs = quotaCooldown.until - Date.now();
  err.cached = true;
  throw err;
};

const setCooldown = (classification) => {
  if (classification.kind === 'daily') {
    quotaCooldown = { kind: 'daily', until: Date.now() + DAILY_COOLDOWN_MS };
    return;
  }
  const wait = classification.retryAfterMs || 30_000;
  quotaCooldown = { kind: classification.kind, until: Date.now() + wait };
};

const clearCooldown = () => {
  quotaCooldown = null;
};

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

const callModel = async ({ apiKey, baseUrl, timeoutMs, model, body }) => {
  const url = `${baseUrl}/models/${model}:generateContent`;
  let lastNetworkCause;
  let rateAttempt = 0;

  for (let attempt = 0; attempt <= MAX_NETWORK_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(1000 * attempt);
      console.log(
        `[geminiClient] Network retry ${attempt}/${MAX_NETWORK_RETRIES} (${model}):`,
        lastNetworkCause?.message
      );
    }

    let response;
    try {
      response = await fetchOnce(url, body, apiKey, timeoutMs);
    } catch (cause) {
      lastNetworkCause = cause;
      const isTimeout = cause.name === 'AbortError';
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

    if (response.status === 429) {
      const classification = classifyQuotaError(data, response.status);
      // Daily quota: never sleep/retry — waiting does not reset the daily limit.
      if (classification.kind === 'daily') {
        setCooldown(classification);
        throwQuotaError(classification);
      }
      const waitMs = classification.retryAfterMs;
      if (
        rateAttempt < MAX_RATE_RETRIES &&
        waitMs !== null &&
        waitMs <= MAX_RETRY_WAIT_MS
      ) {
        rateAttempt += 1;
        attempt -= 1;
        await sleep(waitMs);
        continue;
      }
      setCooldown(classification);
      throwQuotaError(classification);
    }

    if (response.status === 503) {
      const classification = classifyQuotaError(data, response.status);
      return { overload: true, classification };
    }

    const message =
      (data && data.error && data.error.message) || `Gemini request failed (${response.status})`;
    console.error(`[geminiClient] Gemini HTTP ${response.status} (${model}):`, message);
    const err = new Error(message);
    err.status = 502;
    throw err;
  }

  return [];
};

/**
 * Calls Gemini generateContent. Tries fallback models on overload; uses a
 * server-side cooldown so quota errors don't repeat on every chat message.
 */
const generateContent = async ({ systemInstruction, contents, tools, toolConfig }) => {
  checkCooldown();

  const { apiKey, models, baseUrl, timeoutMs } = getConfig();

  const body = { contents };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  if (tools) body.tools = tools;
  if (toolConfig) body.toolConfig = toolConfig;

  let lastClassification = { kind: 'rate', retryAfterMs: null };

  for (const model of models) {
    const result = await callModel({ apiKey, baseUrl, timeoutMs, model, body });

    if (result && result.overload) {
      lastClassification = result.classification;
      continue; // try next model
    }

    clearCooldown();
    return result;
  }

  setCooldown(lastClassification);
  throwQuotaError(lastClassification);
};

module.exports = { generateContent, classifyQuotaError };
