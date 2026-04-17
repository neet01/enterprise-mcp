import { requestJson } from '../shared/http.js';

export class ConfluenceRetrievalClient {
  constructor(config) {
    this.config = config;
  }

  async search({
    query,
    limit = 8,
    spaceKey,
    labels,
  }) {
    return requestJson(`${this.config.retrievalBaseUrl}/search`, {
      method: 'POST',
      timeoutMs: this.config.timeoutMs,
      body: {
        query,
        limit,
        spaceKey,
        labels,
      },
    });
  }
}

