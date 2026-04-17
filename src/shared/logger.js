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

export function logError(event, error, meta = {}) {
  log('error', event, {
    ...meta,
    error: error instanceof Error ? error.message : String(error),
  });
}

