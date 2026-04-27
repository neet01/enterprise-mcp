import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const storage = new AsyncLocalStorage();

export function buildRequestContext(req) {
  const headers = Object.fromEntries(
    Object.entries(req.headers).map(([key, value]) => [key.toLowerCase(), value]),
  );

  return {
    headers,
    requestId: headerValue(headers['x-request-id']) ?? randomUUID(),
    userId: headerValue(headers['x-user-id']),
    userEmail: headerValue(headers['x-user-email']),
    entraObjectId: headerValue(headers['x-entra-object-id']),
    authorization: headerValue(headers.authorization),
  };
}

export function withRequestContext(context, fn) {
  return storage.run(context, fn);
}

export function getRequestContext() {
  return storage.getStore() ?? {};
}

export function summarizeRequestContext(context = {}) {
  return {
    requestId: context.requestId ?? null,
    userId: context.userId ?? null,
    userEmail: context.userEmail ?? null,
    entraObjectId: context.entraObjectId ?? null,
    hasAuthorization: typeof context.authorization === 'string',
  };
}

function headerValue(value) {
  return Array.isArray(value) ? value[0] : value;
}
