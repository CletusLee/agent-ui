import { toast } from 'sonner'

import { APIRoutes } from './routes'

import {
  AgentDetails,
  AgentRuntimeDetails,
  FactoryAgentDefinition,
  FactoryRevision,
  FactoryTeamDefinition,
  Sessions,
  TeamDetails,
  TeamRuntimeDetails,
  WorkflowDefinition,
  WorkflowSummary
} from '@/types/os'

// Helper function to create headers with optional auth token
const createHeaders = (authToken?: string): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  }

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }

  return headers
}

const fetchDetails = async <T>(
  url: string,
  authToken: string | undefined,
  signal: AbortSignal | undefined,
  label: string
): Promise<T> => {
  const response = await fetch(url, {
    method: 'GET',
    headers: createHeaders(authToken),
    signal
  })

  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? `${label} was not found in this AgentOS.`
        : `Failed to load ${label.toLowerCase()} (${response.status})`
    )
  }

  return response.json()
}

export const getAgentRuntimeDetailsAPI = (
  endpoint: string,
  agentId: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<AgentRuntimeDetails> =>
  fetchDetails(
    APIRoutes.GetAgentDetails(endpoint, agentId),
    authToken,
    signal,
    'Agent runtime details'
  )

export const getFactoryAgentDefinitionAPI = (
  endpoint: string,
  agentId: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<FactoryAgentDefinition> =>
  fetchDetails(
    APIRoutes.GetFactoryAgentDefinition(endpoint, agentId),
    authToken,
    signal,
    'Factory Agent definition'
  )

export const getTeamRuntimeDetailsAPI = (
  endpoint: string,
  teamId: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<TeamRuntimeDetails> =>
  fetchDetails(
    APIRoutes.GetTeamDetails(endpoint, teamId),
    authToken,
    signal,
    'Team runtime details'
  )

export const getFactoryTeamDefinitionAPI = (
  endpoint: string,
  teamId: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<FactoryTeamDefinition> =>
  fetchDetails(
    APIRoutes.GetFactoryTeamDefinition(endpoint, teamId),
    authToken,
    signal,
    'Factory Team definition'
  )

export const getAgentsAPI = async (
  endpoint: string,
  authToken?: string
): Promise<AgentDetails[]> => {
  const url = APIRoutes.GetAgents(endpoint)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: createHeaders(authToken)
    })
    if (!response.ok) {
      toast.error(`Failed to fetch  agents: ${response.statusText}`)
      return []
    }
    const data = await response.json()
    return data
  } catch {
    toast.error('Error fetching  agents')
    return []
  }
}

export const getStatusAPI = async (
  base: string,
  authToken?: string
): Promise<number> => {
  const response = await fetch(APIRoutes.Status(base), {
    method: 'GET',
    headers: createHeaders(authToken)
  })
  return response.status
}

export const getAllSessionsAPI = async (
  base: string,
  type: 'agent' | 'team',
  componentId: string,
  dbId: string,
  authToken?: string
): Promise<Sessions | { data: [] }> => {
  try {
    const url = new URL(APIRoutes.GetSessions(base))
    url.searchParams.set('type', type)
    url.searchParams.set('component_id', componentId)
    url.searchParams.set('db_id', dbId)

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: createHeaders(authToken)
    })

    if (!response.ok) {
      if (response.status === 404) {
        return { data: [] }
      }
      throw new Error(`Failed to fetch sessions: ${response.statusText}`)
    }
    return response.json()
  } catch {
    return { data: [] }
  }
}

export const getSessionAPI = async (
  base: string,
  type: 'agent' | 'team',
  sessionId: string,
  dbId?: string,
  authToken?: string
) => {
  // build query string
  const queryParams = new URLSearchParams({ type })
  if (dbId) queryParams.append('db_id', dbId)

  const response = await fetch(
    `${APIRoutes.GetSession(base, sessionId)}?${queryParams.toString()}`,
    {
      method: 'GET',
      headers: createHeaders(authToken)
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch session: ${response.statusText}`)
  }

  return response.json()
}

export const deleteSessionAPI = async (
  base: string,
  dbId: string,
  sessionId: string,
  authToken?: string
) => {
  const queryParams = new URLSearchParams()
  if (dbId) queryParams.append('db_id', dbId)
  const response = await fetch(
    `${APIRoutes.DeleteSession(base, sessionId)}?${queryParams.toString()}`,
    {
      method: 'DELETE',
      headers: createHeaders(authToken)
    }
  )
  return response
}

export const getTeamsAPI = async (
  endpoint: string,
  authToken?: string
): Promise<TeamDetails[]> => {
  const url = APIRoutes.GetTeams(endpoint)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: createHeaders(authToken)
    })
    if (!response.ok) {
      toast.error(`Failed to fetch  teams: ${response.statusText}`)
      return []
    }
    const data = await response.json()

    return data
  } catch {
    toast.error('Error fetching  teams')
    return []
  }
}

export const getWorkflowsAPI = async (
  endpoint: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<WorkflowSummary[]> => {
  const response = await fetch(APIRoutes.GetWorkflows(endpoint), {
    method: 'GET',
    headers: createHeaders(authToken),
    signal
  })

  if (!response.ok) {
    throw new Error(`Failed to load workflows (${response.status})`)
  }

  return response.json()
}

export const getWorkflowDefinitionAPI = async (
  endpoint: string,
  workflowId: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<WorkflowDefinition> => {
  const response = await fetch(
    APIRoutes.GetWorkflowDefinition(endpoint, workflowId),
    {
      method: 'GET',
      headers: createHeaders(authToken),
      signal
    }
  )

  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? 'Workflow definition was not found for this AgentOS.'
        : `Failed to load workflow definition (${response.status})`
    )
  }

  return response.json()
}

export const getFactoryRevisionAPI = async (
  endpoint: string,
  authToken?: string,
  signal?: AbortSignal
): Promise<FactoryRevision> => {
  const response = await fetch(APIRoutes.GetFactoryRevision(endpoint), {
    method: 'GET',
    headers: createHeaders(authToken),
    signal
  })

  if (!response.ok) {
    throw new Error(`Failed to load definition revision (${response.status})`)
  }

  return response.json()
}

export const deleteTeamSessionAPI = async (
  base: string,
  teamId: string,
  sessionId: string,
  authToken?: string
) => {
  const response = await fetch(
    APIRoutes.DeleteTeamSession(base, teamId, sessionId),
    {
      method: 'DELETE',
      headers: createHeaders(authToken)
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to delete team session: ${response.statusText}`)
  }
  return response
}
