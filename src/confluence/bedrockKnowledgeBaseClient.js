import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';

export class BedrockKnowledgeBaseRetrievalClient {
  constructor(config, options = {}) {
    this.config = config;
    this.client =
      options.client ??
      new BedrockAgentRuntimeClient({
        region: config.awsRegion,
      });
  }

  isConfigured() {
    return Boolean(this.config.awsRegion && this.config.knowledgeBaseId);
  }

  async search({
    query,
    limit = 8,
    spaceKey,
    labels,
  }) {
    if (!this.isConfigured()) {
      throw new Error(
        'Confluence retrieval is not configured. Set CONFLUENCE_KNOWLEDGE_BASE_ID or CONFLUENCE_RETRIEVAL_BASE_URL.',
      );
    }

    const vectorSearchConfiguration = {
      numberOfResults: limit,
    };
    const filter = buildKnowledgeBaseFilter({ spaceKey, labels });

    if (this.config.knowledgeBaseSearchType) {
      vectorSearchConfiguration.overrideSearchType = this.config.knowledgeBaseSearchType;
    }

    if (filter) {
      vectorSearchConfiguration.filter = filter;
    }

    const response = await this.client.send(
      new RetrieveCommand({
        knowledgeBaseId: this.config.knowledgeBaseId,
        retrievalQuery: {
          type: 'TEXT',
          text: query,
        },
        retrievalConfiguration: {
          vectorSearchConfiguration,
        },
      }),
    );

    return {
      knowledgeBaseId: this.config.knowledgeBaseId,
      hits: (response.retrievalResults ?? []).map(normalizeRetrieveResult),
      nextToken: response.nextToken ?? null,
      guardrailAction: response.guardrailAction ?? 'NONE',
    };
  }
}

function buildKnowledgeBaseFilter({
  spaceKey,
  labels,
}) {
  const clauses = [];

  if (spaceKey) {
    clauses.push({
      equals: {
        key: 'spaceKey',
        value: spaceKey,
      },
    });
  }

  for (const label of labels ?? []) {
    clauses.push({
      orAll: [
        {
          listContains: {
            key: 'labels',
            value: label,
          },
        },
        {
          stringContains: {
            key: 'labels',
            value: label,
          },
        },
      ],
    });
  }

  if (clauses.length === 0) {
    return null;
  }

  if (clauses.length === 1) {
    return clauses[0];
  }

  return {
    andAll: clauses,
  };
}

function normalizeRetrieveResult(result) {
  const metadata = normalizeMetadata(result.metadata);
  const location = normalizeLocation(result.location);
  const content = normalizeContent(result.content);
  const url = location.url ?? firstString(metadata, ['url', 'sourceUrl']) ?? null;

  return {
    pageId:
      firstString(metadata, ['pageId', 'confluencePageId', 'id', 'documentId']) ??
      extractConfluencePageId(url),
    title: firstString(metadata, ['title', 'pageTitle', 'name']),
    url,
    score: result.score ?? null,
    contentType: content.type,
    excerpt: content.text ? content.text.slice(0, 500) : null,
    content,
    location,
    metadata,
  };
}

function normalizeContent(content) {
  if (!content) {
    return {
      type: null,
      text: null,
    };
  }

  return {
    type: content.type ?? null,
    text: content.text ?? null,
    row: content.row ?? null,
    byteContent: content.byteContent ?? null,
    audio: content.audio ?? null,
    video: content.video ?? null,
  };
}

function normalizeLocation(location) {
  if (!location) {
    return {
      type: null,
      url: null,
    };
  }

  return {
    type: location.type ?? null,
    url:
      location.confluenceLocation?.url ??
      location.webLocation?.url ??
      location.s3Location?.uri ??
      location.kendraDocumentLocation?.uri ??
      location.customDocumentLocation?.id ??
      null,
    raw: location,
  };
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, normalizeMetadataValue(value)]),
  );
}

function normalizeMetadataValue(value) {
  if (value == null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeMetadataValue);
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, normalizeMetadataValue(nestedValue)]),
    );
  }

  return value;
}

function firstString(metadata, keys) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return null;
}

function extractConfluencePageId(url) {
  if (!url) {
    return null;
  }

  const numericMatch = url.match(/\/pages\/(\d+)/);
  if (numericMatch) {
    return numericMatch[1];
  }

  const pageIdMatch = url.match(/[?&]pageId=(\d+)/i);
  return pageIdMatch ? pageIdMatch[1] : null;
}
