import test from 'node:test';
import assert from 'node:assert/strict';
import { BedrockKnowledgeBaseRetrievalClient } from '../src/confluence/bedrockKnowledgeBaseClient.js';

test('BedrockKnowledgeBaseRetrievalClient queries Bedrock KB and normalizes results', async () => {
  let capturedInput;

  const client = new BedrockKnowledgeBaseRetrievalClient(
    {
      awsRegion: 'us-gov-west-1',
      knowledgeBaseId: 'kb-123',
      knowledgeBaseSearchType: 'HYBRID',
    },
    {
      client: {
        async send(command) {
          capturedInput = command.input;

          return {
            retrievalResults: [
              {
                content: {
                  type: 'TEXT',
                  text: 'Launch checklist for release train alpha',
                },
                location: {
                  type: 'CONFLUENCE',
                  confluenceLocation: {
                    url: 'https://confluence.example.com/pages/123456/Launch+Checklist',
                  },
                },
                score: 0.98,
                metadata: {
                  title: 'Launch Checklist',
                  spaceKey: 'ENG',
                  labels: ['runbook', 'launch'],
                },
              },
            ],
          };
        },
      },
    },
  );

  const result = await client.search({
    query: 'launch checklist',
    limit: 4,
    spaceKey: 'ENG',
    labels: ['runbook'],
  });

  assert.equal(capturedInput.knowledgeBaseId, 'kb-123');
  assert.equal(capturedInput.retrievalQuery.text, 'launch checklist');
  assert.equal(
    capturedInput.retrievalConfiguration.vectorSearchConfiguration.numberOfResults,
    4,
  );
  assert.equal(
    capturedInput.retrievalConfiguration.vectorSearchConfiguration.overrideSearchType,
    'HYBRID',
  );
  assert.ok(capturedInput.retrievalConfiguration.vectorSearchConfiguration.filter);

  assert.equal(result.knowledgeBaseId, 'kb-123');
  assert.equal(result.hits[0].pageId, '123456');
  assert.equal(result.hits[0].title, 'Launch Checklist');
  assert.equal(
    result.hits[0].url,
    'https://confluence.example.com/pages/123456/Launch+Checklist',
  );
  assert.match(result.hits[0].excerpt, /Launch checklist/);
});

test('BedrockKnowledgeBaseRetrievalClient throws when KB config is missing', async () => {
  const client = new BedrockKnowledgeBaseRetrievalClient(
    {
      awsRegion: 'us-gov-west-1',
      knowledgeBaseId: '',
      knowledgeBaseSearchType: '',
    },
    {
      client: {
        async send() {
          throw new Error('should not be called');
        },
      },
    },
  );

  await assert.rejects(
    () => client.search({ query: 'runbook' }),
    /Confluence retrieval is not configured/,
  );
});
