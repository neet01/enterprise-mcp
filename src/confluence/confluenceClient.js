import { requestJson } from '../shared/http.js';

export class ConfluenceClient {
  constructor(config) {
    this.config = config;
  }

  async getPage(pageId, authorization) {
    const response = await requestJson(
      `${this.config.apiBaseUrl}/api/v2/pages/${encodeURIComponent(pageId)}`,
      {
        method: 'GET',
        headers: this.authHeaders(authorization),
        timeoutMs: this.config.timeoutMs,
      },
    );

    return {
      id: response.id,
      title: response.title,
      spaceId: response.spaceId ?? null,
      status: response.status ?? null,
      createdAt: response.createdAt ?? null,
      version: response.version?.number ?? null,
      links: response._links ?? null,
    };
  }

  authHeaders(delegatedAuthorization) {
    if (delegatedAuthorization) {
      return {
        authorization: delegatedAuthorization,
        accept: 'application/json',
      };
    }

    if (this.config.authMode === 'bearer') {
      return {
        authorization: `Bearer ${this.config.bearerToken}`,
        accept: 'application/json',
      };
    }

    const basicValue = Buffer.from(
      `${this.config.basicEmail}:${this.config.basicToken}`,
      'utf8',
    ).toString('base64');

    return {
      authorization: `Basic ${basicValue}`,
      accept: 'application/json',
    };
  }
}
