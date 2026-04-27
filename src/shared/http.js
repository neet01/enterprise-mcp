import { logDebug, logError, summarizeForLog } from './logger.js';

export async function requestJson(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 15000,
    debug = false,
    logLabel = 'http_request',
    logMeta = {},
  } = options;
  const startedAt = Date.now();
  const requestMeta = {
    ...logMeta,
    method,
    url,
    timeoutMs,
    hasAuthorization: typeof headers.authorization === 'string',
    body: body == null ? null : summarizeForLog(body),
  };

  if (debug) {
    logDebug(`${logLabel}_started`, requestMeta);
  }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        ...headers,
        ...(body != null ? { 'content-type': 'application/json' } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });

    const text = await response.text();
    const data = text ? safeParse(text) : null;
    const responseMeta = {
      ...requestMeta,
      durationMs: Date.now() - startedAt,
      status: response.status,
      ok: response.ok,
      response: summarizeForLog(data ?? text),
    };

    if (debug) {
      logDebug(`${logLabel}_completed`, responseMeta);
    }

    if (!response.ok) {
      const error = new Error(`Request failed with status ${response.status}`);
      error.status = response.status;
      error.response = data ?? text;
      throw error;
    }

    return data;
  } catch (error) {
    logError(`${logLabel}_failed`, error, {
      ...requestMeta,
      durationMs: Date.now() - startedAt,
      status: error?.status ?? null,
      response: summarizeForLog(error?.response ?? null),
    });
    throw error;
  }
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
