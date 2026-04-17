import { getRequestContext } from './requestContext.js';

export function getDelegatedAuthHeader() {
  const requestContext = getRequestContext();
  const authorization = requestContext.authorization;

  if (!authorization || typeof authorization !== 'string') {
    return null;
  }

  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  return authorization;
}

export function requireDelegatedAuthHeader(serviceName) {
  const authorization = getDelegatedAuthHeader();

  if (!authorization) {
    throw new Error(
      `${serviceName} requires a delegated bearer token from LibreChat MCP OAuth. Reconnect this MCP server in LibreChat and try again.`,
    );
  }

  return authorization;
}

