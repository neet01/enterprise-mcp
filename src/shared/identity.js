import { getRequestContext } from './requestContext.js';

export function resolveUserContext(input = {}) {
  const requestContext = getRequestContext();

  return {
    userId: input.userId ?? requestContext.userId ?? null,
    userEmail: input.userEmail ?? requestContext.userEmail ?? null,
    entraObjectId: input.entraObjectId ?? requestContext.entraObjectId ?? null,
    jiraAccountId: input.jiraAccountId ?? null,
  };
}

export function buildSessionId(prefix, userContext) {
  const stableKey =
    userContext.userId ??
    userContext.entraObjectId ??
    userContext.userEmail ??
    'anonymous';

  return `${prefix}:${stableKey}`;
}

