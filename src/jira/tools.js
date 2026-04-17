import { z } from 'zod';
import { BedrockAgentClient } from '../shared/bedrockAgentClient.js';
import { requireDelegatedAuthHeader, getDelegatedAuthHeader } from '../shared/delegatedAuth.js';
import { resolveUserContext, buildSessionId } from '../shared/identity.js';
import { toolResponse } from '../shared/toolResponse.js';
import { JiraClient } from './jiraClient.js';

export function createJiraServices(config, overrides = {}) {
  return {
    jiraClient: overrides.jiraClient ?? new JiraClient(config),
    agentClient:
      overrides.agentClient ??
      new BedrockAgentClient({
        region: config.awsRegion,
        agentId: config.bedrockAgentId,
        agentAliasId: config.bedrockAgentAliasId,
      }),
  };
}

export function registerJiraTools(server, config, services = createJiraServices(config)) {
  server.tool(
    'jira_list_my_tickets',
    'List Jira tickets assigned to the current user using the direct Jira API path.',
    {
      userEmail: z.string().email().optional(),
      jiraAccountId: z.string().optional(),
      entraObjectId: z.string().optional(),
      projectKey: z.string().optional(),
      openOnly: z.boolean().default(true),
      limit: z.number().int().min(1).max(100).default(20),
    },
    async (args) => {
      const userContext = resolveUserContext(args);
      const authorization = resolveAuthorization(config);
      const result = await services.jiraClient.listTicketsForUser({
        userContext,
        authorization,
        projectKey: args.projectKey,
        openOnly: args.openOnly,
        limit: args.limit,
      });

      return toolResponse({
        route: 'direct-api',
        authMode: authorization ? 'delegated-bearer' : 'configured-server-auth',
        userContext,
        ...result,
      });
    },
  );

  server.tool(
    'jira_get_issue',
    'Fetch a single Jira issue directly from the Jira API.',
    {
      issueKey: z.string().min(2),
    },
    async ({ issueKey }) => {
      const authorization = resolveAuthorization(config);
      const issue = await services.jiraClient.getIssue(issueKey, authorization);

      return toolResponse({
        route: 'direct-api',
        authMode: authorization ? 'delegated-bearer' : 'configured-server-auth',
        issue,
      });
    },
  );

  server.tool(
    'jira_search_issues',
    'Run a direct Jira JQL search for deterministic issue retrieval.',
    {
      jql: z.string().min(3),
      limit: z.number().int().min(1).max(100).default(20),
    },
    async ({ jql, limit }) => {
      const authorization = resolveAuthorization(config);
      const result = await services.jiraClient.searchIssues({ jql, authorization, limit });

      return toolResponse({
        route: 'direct-api',
        authMode: authorization ? 'delegated-bearer' : 'configured-server-auth',
        jql,
        ...result,
      });
    },
  );

  server.tool(
    'jira_prioritize_user_tickets',
    'List the current user tickets directly from Jira, then ask a Bedrock agent to prioritize and analyze them.',
    {
      userEmail: z.string().email().optional(),
      jiraAccountId: z.string().optional(),
      entraObjectId: z.string().optional(),
      projectKey: z.string().optional(),
      openOnly: z.boolean().default(true),
      limit: z.number().int().min(1).max(50).default(10),
      analysisGoal: z
        .string()
        .default('Prioritize these tickets by urgency, risk, and recommended next action.'),
    },
    async (args) => {
      const userContext = resolveUserContext(args);
      const authorization = resolveAuthorization(config);
      const result = await services.jiraClient.listTicketsForUser({
        userContext,
        authorization,
        projectKey: args.projectKey,
        openOnly: args.openOnly,
        limit: args.limit,
      });

      const sessionId = buildSessionId('jira-priority', userContext);
      const inputText = buildPriorityPrompt(result.issues, args.analysisGoal, userContext);
      const analysis = await services.agentClient.invoke({
        inputText,
        sessionId,
        sessionAttributes: {
          userEmail: userContext.userEmail ?? '',
          entraObjectId: userContext.entraObjectId ?? '',
        },
      });

      return toolResponse({
        route: 'bedrock-agent',
        authMode: authorization ? 'delegated-bearer' : 'configured-server-auth',
        sessionId,
        userContext,
        tickets: result.issues,
        total: result.total,
        analysis: analysis.text,
        traceCount: analysis.traces.length,
      });
    },
  );
}

function resolveAuthorization(config) {
  if (config.requireDelegatedAuth) {
    return requireDelegatedAuthHeader('Jira');
  }

  return getDelegatedAuthHeader();
}

function buildPriorityPrompt(issues, analysisGoal, userContext) {
  return [
    'You are analyzing Jira work items for an enterprise user.',
    `User email: ${userContext.userEmail ?? 'unknown'}`,
    `User Entra object ID: ${userContext.entraObjectId ?? 'unknown'}`,
    '',
    'Goal:',
    analysisGoal,
    '',
    'Tickets:',
    JSON.stringify(issues, null, 2),
    '',
    'Return a concise priority analysis with the following sections:',
    '1. Highest priority tickets',
    '2. Why they rank highest',
    '3. Recommended next actions',
    '4. Risks or blockers',
  ].join('\n');
}
