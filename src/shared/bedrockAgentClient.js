import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';

export class BedrockAgentClient {
  constructor({
    region,
    agentId,
    agentAliasId,
    client,
    enableTrace = false,
  }) {
    this.region = region;
    this.agentId = agentId;
    this.agentAliasId = agentAliasId;
    this.enableTrace = enableTrace;
    this.client =
      client ??
      new BedrockAgentRuntimeClient({
        region,
      });
  }

  isConfigured() {
    return Boolean(this.agentId && this.agentAliasId && this.region);
  }

  async invoke({
    inputText,
    sessionId,
    sessionAttributes,
    promptSessionAttributes,
  }) {
    if (!this.isConfigured()) {
      throw new Error('Bedrock agent is not configured');
    }

    const command = new InvokeAgentCommand({
      agentId: this.agentId,
      agentAliasId: this.agentAliasId,
      sessionId,
      inputText,
      enableTrace: this.enableTrace,
      sessionState:
        sessionAttributes || promptSessionAttributes
          ? {
              sessionAttributes,
              promptSessionAttributes,
            }
          : undefined,
    });

    const response = await this.client.send(command);
    const chunks = [];
    const traces = [];

    for await (const event of response.completion ?? []) {
      if (event.chunk?.bytes) {
        chunks.push(Buffer.from(event.chunk.bytes).toString('utf8'));
      }

      if (event.trace) {
        traces.push(event.trace);
      }
    }

    return {
      text: chunks.join(''),
      traces,
    };
  }
}

