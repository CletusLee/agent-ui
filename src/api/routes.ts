export const APIRoutes = {
  GetAgents: (agentOSUrl: string) => `${agentOSUrl}/agents`,
  GetAgentDetails: (agentOSUrl: string, agentId: string) =>
    `${agentOSUrl}/agents/${encodeURIComponent(agentId)}`,
  GetFactoryAgentDefinition: (agentOSUrl: string, agentId: string) =>
    `${agentOSUrl}/factory/agents/${encodeURIComponent(agentId)}`,
  AgentRun: (agentOSUrl: string) => `${agentOSUrl}/agents/{agent_id}/runs`,
  Status: (agentOSUrl: string) => `${agentOSUrl}/health`,
  GetSessions: (agentOSUrl: string) => `${agentOSUrl}/sessions`,
  GetSession: (agentOSUrl: string, sessionId: string) =>
    `${agentOSUrl}/sessions/${sessionId}/runs`,

  DeleteSession: (agentOSUrl: string, sessionId: string) =>
    `${agentOSUrl}/sessions/${sessionId}`,

  GetTeams: (agentOSUrl: string) => `${agentOSUrl}/teams`,
  GetTeamDetails: (agentOSUrl: string, teamId: string) =>
    `${agentOSUrl}/teams/${encodeURIComponent(teamId)}`,
  GetFactoryTeamDefinition: (agentOSUrl: string, teamId: string) =>
    `${agentOSUrl}/factory/teams/${encodeURIComponent(teamId)}`,
  GetWorkflows: (agentOSUrl: string) => `${agentOSUrl}/workflows`,
  GetWorkflowDefinition: (agentOSUrl: string, workflowId: string) =>
    `${agentOSUrl}/factory/workflows/${encodeURIComponent(workflowId)}`,
  GetFactoryRevision: (agentOSUrl: string) => `${agentOSUrl}/factory/revision`,
  TeamRun: (agentOSUrl: string, teamId: string) =>
    `${agentOSUrl}/teams/${teamId}/runs`,
  DeleteTeamSession: (agentOSUrl: string, teamId: string, sessionId: string) =>
    `${agentOSUrl}/v1//teams/${teamId}/sessions/${sessionId}`
}
