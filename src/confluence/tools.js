import { z } from 'zod';
import { BedrockAgentClient } from '../shared/bedrockAgentClient.js';
import { requireDelegatedAuthHeader, getDelegatedAuthHeader } from '../shared/delegatedAuth.js';
import { resolveUserContext, buildSessionId } from '../shared/identity.js';
import { toolResponse } from '../shared/toolResponse.js';
import { ConfluenceClient } from './confluenceClient.js';
import { ConfluenceRetrievalClient } from './retrievalClient.js';
import { BedrockKnowledgeBaseRetrievalClient } from './bedrockKnowledgeBaseClient.js';

export function createConfluenceServices(config, overrides = {}) {
  return {
    confluenceClient: overrides.confluenceClient ?? new ConfluenceClient(config),
    retrievalClient:
      overrides.retrievalClient ??
      (config.knowledgeBaseId
        ? new BedrockKnowledgeBaseRetrievalClient(config)
        : new ConfluenceRetrievalClient(config)),
    agentClient:
      overrides.agentClient ??
      new BedrockAgentClient({
        region: config.awsRegion,
        agentId: config.bedrockAgentId,
        agentAliasId: config.bedrockAgentAliasId,
      }),
  };
}

export function registerConfluenceTools(
  server,
  config,
  services = createConfluenceServices(config),
) {
  server.tool(
    'confluence_search_pages',
    'Search the Confluence retrieval index directly for relevant pages and chunks.',
    {
      query: z.string().min(3),
      limit: z.number().int().min(1).max(20).default(8),
      spaceKey: z.string().optional(),
      labels: z.array(z.string()).optional(),
    },
    async ({ query, limit, spaceKey, labels }) => {
      const results = await services.retrievalClient.search({
        query,
        limit,
        spaceKey,
        labels,
      });

      return toolResponse({
        route: 'direct-retrieval',
        query,
        results,
      });
    },
  );

  server.tool(
    'confluence_get_page',
    'Fetch page metadata directly from the Confluence API.',
    {
      pageId: z.string().min(1),
    },
    async ({ pageId }) => {
      const authorization = resolveAuthorization(config);
      const page = await services.confluenceClient.getPage(pageId, authorization);

      return toolResponse({
        route: 'direct-api',
        authMode: authorization ? 'delegated-bearer' : 'configured-server-auth',
        page,
      });
    },
  );

  server.tool(
    'confluence_answer_question',
    'Search the Confluence retrieval index and ask a Bedrock agent to synthesize an answer with the retrieved context.',
    {
      question: z.string().min(3),
      limit: z.number().int().min(1).max(12).default(6),
      spaceKey: z.string().optional(),
      labels: z.array(z.string()).optional(),
    },
    async ({ question, limit, spaceKey, labels }) => {
      const userContext = resolveUserContext({});
      const results = await services.retrievalClient.search({
        query: question,
        limit,
        spaceKey,
        labels,
      });

      const sessionId = buildSessionId('confluence-answer', userContext);
      const inputText = [
        'Answer the user question using the supplied Confluence retrieval results.',
        `Question: ${question}`,
        '',
        'Retrieved context:',
        JSON.stringify(results, null, 2),
        '',
        'Return a concise answer and cite the page ids or urls you relied on.',
      ].join('\n');

      const answer = await services.agentClient.invoke({
        inputText,
        sessionId,
        sessionAttributes: {
          userEmail: userContext.userEmail ?? '',
          entraObjectId: userContext.entraObjectId ?? '',
        },
      });

      return toolResponse({
        route: 'bedrock-agent',
        authMode: resolveAuthorization(config) ? 'delegated-bearer' : 'configured-server-auth',
        sessionId,
        answer: answer.text,
        retrievalResults: results,
        traceCount: answer.traces.length,
      });
    },
  );
}

function resolveAuthorization(config) {
  if (config.requireDelegatedAuth) {
    return requireDelegatedAuthHeader('Confluence');
  }

  return getDelegatedAuthHeader();
}
