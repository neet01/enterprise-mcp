import { requestJson } from '../shared/http.js';

export class ConfluenceClient {
  constructor(config) {
    this.config = config;
  }

  async getPage(pageId, authorization) {
    const response = await requestJson(this.pageUrl(pageId), {
      method: 'GET',
      headers: this.authHeaders(authorization),
      timeoutMs: this.config.timeoutMs,
    });

    return this.normalizePage(response);
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

  pageUrl(pageId) {
    if (this.config.apiBaseUrl.includes('/rest/api')) {
      return `${this.config.apiBaseUrl}/content/${encodeURIComponent(pageId)}?expand=version,space`;
    }

    return `${this.config.apiBaseUrl}/api/v2/pages/${encodeURIComponent(pageId)}`;
  }

  normalizePage(response) {
    return {
      id: response.id,
      title: response.title,
      spaceId: response.spaceId ?? response.space?.id ?? response.space?.key ?? null,
      status: response.status ?? response.currentStatus ?? null,
      createdAt: response.createdAt ?? response.version?.when ?? null,
      version: response.version?.number ?? null,
      links: response._links ?? null,
    };
  }
}
