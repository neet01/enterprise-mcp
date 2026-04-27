export function log(level, event, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...meta,
  };

  console.log(JSON.stringify(entry));
}

export function logInfo(event, meta) {
  log('info', event, meta);
}

export function logDebug(event, meta) {
  log('debug', event, meta);
}

export function logError(event, error, meta = {}) {
  log('error', event, {
    ...meta,
    error: error instanceof Error ? error.message : String(error),
  });
}

export function summarizeForLog(value, maxLength = 800) {
  if (value == null) {
    return value;
  }

  if (typeof value === 'string') {
    return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => summarizeForLog(item, Math.max(120, maxLength / 4)));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value).slice(0, 20).map(([key, entryValue]) => [
      key,
      summarizeForLog(entryValue, Math.max(120, maxLength / 4)),
    ]);
    return Object.fromEntries(entries);
  }

  return value;
}
