export interface ToolCall {
  role: 'user' | 'tool' | 'system' | 'assistant'
  content: string | null
  tool_call_id: string
  tool_name: string
  tool_args: Record<string, string>
  tool_call_error: boolean
  metrics: {
    time: number
  }
  created_at: number
}

export interface ReasoningSteps {
  title: string
  action?: string
  result: string
  reasoning: string
  confidence?: number
  next_action?: string
}
export interface ReasoningStepProps {
  index: number
  stepTitle: string
}
export interface ReasoningProps {
  reasoning: ReasoningSteps[]
}

export type ToolCallProps = {
  tools: ToolCall
}
interface ModelMessage {
  content: string | null
  context?: MessageContext[]
  created_at: number
  metrics?: {
    time: number
    prompt_tokens: number
    input_tokens: number
    completion_tokens: number
    output_tokens: number
  }
  name: string | null
  role: string
  tool_args?: unknown
  tool_call_id: string | null
  tool_calls: Array<{
    function: {
      arguments: string
      name: string
    }
    id: string
    type: string
  }> | null
}

export interface Model {
  name: string
  model: string
  provider: string
}

export interface Agent {
  agent_id: string
  name: string
  description: string
  model: Model
  storage?: boolean
}

export interface Team {
  team_id: string
  name: string
  description: string
  model: Model
  storage?: boolean
}

interface MessageContext {
  query: string
  docs?: Array<Record<string, object>>
  time?: number
}

export enum RunEvent {
  RunStarted = 'RunStarted',
  RunContent = 'RunContent',
  RunCompleted = 'RunCompleted',
  RunError = 'RunError',
  RunOutput = 'RunOutput',
  UpdatingMemory = 'UpdatingMemory',
  ToolCallStarted = 'ToolCallStarted',
  ToolCallCompleted = 'ToolCallCompleted',
  MemoryUpdateStarted = 'MemoryUpdateStarted',
  MemoryUpdateCompleted = 'MemoryUpdateCompleted',
  ReasoningStarted = 'ReasoningStarted',
  ReasoningStep = 'ReasoningStep',
  ReasoningCompleted = 'ReasoningCompleted',
  RunCancelled = 'RunCancelled',
  RunPaused = 'RunPaused',
  RunContinued = 'RunContinued',
  // Team Events
  TeamRunStarted = 'TeamRunStarted',
  TeamRunContent = 'TeamRunContent',
  TeamRunCompleted = 'TeamRunCompleted',
  TeamRunError = 'TeamRunError',
  TeamRunCancelled = 'TeamRunCancelled',
  TeamToolCallStarted = 'TeamToolCallStarted',
  TeamToolCallCompleted = 'TeamToolCallCompleted',
  TeamReasoningStarted = 'TeamReasoningStarted',
  TeamReasoningStep = 'TeamReasoningStep',
  TeamReasoningCompleted = 'TeamReasoningCompleted',
  TeamMemoryUpdateStarted = 'TeamMemoryUpdateStarted',
  TeamMemoryUpdateCompleted = 'TeamMemoryUpdateCompleted'
}

export interface ResponseAudio {
  id?: string
  content?: string
  transcript?: string
  channels?: number
  sample_rate?: number
}

export interface NewRunResponse {
  status: 'RUNNING' | 'PAUSED' | 'CANCELLED'
}

export interface RunResponseContent {
  content?: string | object
  content_type: string
  context?: MessageContext[]
  event: RunEvent
  event_data?: object
  messages?: ModelMessage[]
  metrics?: object
  model?: string
  run_id?: string
  agent_id?: string
  session_id?: string
  tool?: ToolCall
  tools?: Array<ToolCall>
  created_at: number
  extra_data?: AgentExtraData
  images?: ImageData[]
  videos?: VideoData[]
  audio?: AudioData[]
  response_audio?: ResponseAudio
}

export interface RunResponse {
  content?: string | object
  content_type: string
  context?: MessageContext[]
  event: RunEvent
  event_data?: object
  messages?: ModelMessage[]
  metrics?: object
  model?: string
  run_id?: string
  agent_id?: string
  session_id?: string
  tool?: ToolCall
  tools?: Array<ToolCall>
  created_at: number
  extra_data?: AgentExtraData
  images?: ImageData[]
  videos?: VideoData[]
  audio?: AudioData[]
  response_audio?: ResponseAudio
}

export interface AgentExtraData {
  reasoning_steps?: ReasoningSteps[]
  reasoning_messages?: ReasoningMessage[]
  references?: ReferenceData[]
}

export interface AgentExtraData {
  reasoning_messages?: ReasoningMessage[]
  references?: ReferenceData[]
}

export interface ReasoningMessage {
  role: 'user' | 'tool' | 'system' | 'assistant'
  content: string | null
  tool_call_id?: string
  tool_name?: string
  tool_args?: Record<string, string>
  tool_call_error?: boolean
  metrics?: {
    time: number
  }
  created_at?: number
}
export interface ChatMessage {
  role: 'user' | 'agent' | 'system' | 'tool'
  content: string
  streamingError?: boolean
  created_at: number
  tool_calls?: ToolCall[]
  extra_data?: {
    reasoning_steps?: ReasoningSteps[]
    reasoning_messages?: ReasoningMessage[]
    references?: ReferenceData[]
  }
  images?: ImageData[]
  videos?: VideoData[]
  audio?: AudioData[]
  response_audio?: ResponseAudio
}

export interface AgentDetails {
  id: string
  name?: string
  db_id?: string
  // Model
  model?: Model
}

export interface TeamDetails {
  id: string
  name?: string
  db_id?: string

  // Model
  model?: Model
}

export type WorkflowStepType =
  | 'agent'
  | 'team'
  | 'executor'
  | 'condition'
  | 'parallel'
  | 'runtime_step'

export interface WorkflowStepDefinition {
  name: string
  type: WorkflowStepType
  ref?: string
  steps?: WorkflowStepDefinition[]
  else_steps?: WorkflowStepDefinition[]
}

export interface WorkflowSummary {
  id: string
  name?: string
  description?: string
}

export interface WorkflowDefinition extends WorkflowSummary {
  steps: WorkflowStepDefinition[]
  revision?: string
  source?: 'Factory definition registry' | 'AgentOS runtime'
}

export interface AgentOSWorkflowStep {
  name: string
  type: string
  agent?: { id?: string; name?: string }
  team?: { id?: string; name?: string }
  steps?: AgentOSWorkflowStep[]
  else_steps?: AgentOSWorkflowStep[]
}

export interface AgentOSWorkflowDetails extends WorkflowSummary {
  steps: AgentOSWorkflowStep[]
}

export interface FactoryRevision {
  revision: string
  agents?: number
  teams?: number
  workflows: number
}

export interface AgentOSInfo {
  os_id?: string
  name?: string | null
  agno_version?: string
  auth_mode?: string
  agent_count?: number
  team_count?: number
  workflow_count?: number
  mcp?: { enabled?: boolean; path?: string }
}

export interface AgentOSHealth {
  status?: string
  instantiated_at?: string
}

export interface AgentOSComponentSummary {
  id: string
  name?: string
  description?: string
}

export interface AgentOSInterfaceSummary {
  id?: string
  name?: string
  type?: string
}

export interface AgentOSSessionDatabaseSummary {
  db_id: string
  display_name?: string
}

/** A deliberately small projection of `/config`; never return its raw payload to the UI. */
export interface AgentOSConfigSummary {
  agents: AgentOSComponentSummary[]
  teams: AgentOSComponentSummary[]
  workflows: AgentOSComponentSummary[]
  session_db_ids: string[]
  session_databases: AgentOSSessionDatabaseSummary[]
  interfaces: AgentOSInterfaceSummary[]
  available_models?: AgentOSModelSummary[]
}

export interface AgentOSModelSummary {
  id?: string
  name?: string
  model?: string
  provider?: string
}

export interface FactorySkillDefinition {
  id: string
  description: string
  instructions: string
}

export interface FactoryCatalogAgentReference {
  id: string
  name: string
}

export interface FactoryCatalogSkill extends FactorySkillDefinition {
  agents: FactoryCatalogAgentReference[]
}

export interface FactorySkillCatalog {
  revision: string
  scope: string
  skills: FactoryCatalogSkill[]
}

export interface FactoryAgentDefinition {
  id: string
  name: string
  group: string
  summary: string
  inputs: string
  outputs: string
  skills: FactorySkillDefinition[]
  instructions: string
  revision: string
  source: string
}

export interface FactoryTeamMember {
  id: string
  name: string
  group: string
  summary: string
}

export interface FactoryTeamDefinition {
  id: string
  name: string
  members: FactoryTeamMember[]
  instructions: string
  revision: string
  source: string
}

export interface RuntimeTool {
  name?: string
  description?: string
  parameters?: unknown
}

export interface RuntimeToolCollection {
  tools?: RuntimeTool[]
}

export interface AgentRuntimeDetails extends AgentDetails {
  is_factory?: boolean
  model?: Model
  tools?: RuntimeToolCollection | RuntimeTool[]
}

export interface TeamRuntimeDetails extends TeamDetails {
  mode?: string
  streaming?: boolean
  is_factory?: boolean
  tools?: RuntimeToolCollection | RuntimeTool[]
  members?: AgentRuntimeDetails[]
}

export interface ImageData {
  revised_prompt: string
  url: string
}

export interface VideoData {
  id: number
  eta: number
  url: string
}

export interface AudioData {
  base64_audio?: string
  mime_type?: string
  url?: string
  id?: string
  content?: string
  channels?: number
  sample_rate?: number
}

export interface ReferenceData {
  query: string
  references: Reference[]
  time?: number
}

export interface Reference {
  content: string
  meta_data: {
    chunk: number
    chunk_size: number
  }
  name: string
}

export interface SessionEntry {
  session_id: string
  session_name: string
  created_at: number
  updated_at?: number
  session_type?: 'agent' | 'team' | 'workflow' | string
  agent_id?: string
  team_id?: string
  workflow_id?: string
  session_summary?: unknown
  session_state?: Record<string, unknown> | null
  metrics?: Record<string, unknown> | null
  total_tokens?: number
  metadata?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface OverviewSession {
  session_id: string
  session_name?: string | null
  session_type: string
  component_id?: string
  agent_id?: string
  team_id?: string
  workflow_id?: string
  created_at?: string | number
  updated_at?: string | number
}

export interface SessionCompactionRecord {
  id?: string | null
  run_id?: string | null
  messages_compacted?: number
  tokens_before?: number | null
  tokens_after?: number | null
  created_at?: string | null
  archived?: boolean
}

export type SessionComponentType = 'agent' | 'team' | 'workflow'

export interface SessionComponentOption {
  id: string
  name?: string
  db_id?: string
}

export interface Pagination {
  page: number
  limit: number
  total_pages: number
  total_count: number
  search_time_ms?: number
}

export interface RegistryRecord {
  id: string
  name: string
  type: string
  sandboxed?: boolean
  metadata?: Record<string, unknown> | null
}

export interface RegistryPage {
  data: RegistryRecord[]
  meta: Pagination
}

export interface EvaluationRun {
  id: string
  agent_id?: string | null
  team_id?: string | null
  workflow_id?: string | null
  evaluated_component_name?: string | null
  model_id?: string | null
  model_provider?: string | null
  name?: string | null
  user_id?: string | null
  eval_type: 'accuracy' | 'agent_as_judge' | 'performance' | 'reliability' | string
  eval_data: Record<string, unknown>
  eval_input?: Record<string, unknown> | null
  created_at?: string | null
  updated_at?: string | null
}

export interface EvaluationRunsPage {
  data: EvaluationRun[]
  meta: Pagination
}

export interface TraceSummary {
  trace_id: string
  name: string
  status: string
  duration: string
  start_time: string
  end_time: string
  total_spans: number
  error_count: number
  input?: unknown
  run_id?: string | null
  session_id?: string | null
  user_id?: string | null
  agent_id?: string | null
  team_id?: string | null
  workflow_id?: string | null
  created_at: string
}

export interface TraceNode {
  id: string
  name: string
  type: string
  duration: string
  start_time: string
  end_time: string
  status: string
  input?: unknown
  output?: unknown
  error?: string | null
  spans?: TraceNode[] | null
  step_type?: string | null
  metadata?: Record<string, unknown> | null
  extra_data?: Record<string, unknown> | null
}

export interface TraceDetail extends TraceSummary {
  output?: unknown
  error?: string | null
  tree: TraceNode[]
}

export interface TraceSessionStats {
  session_id: string
  user_id?: string | null
  agent_id?: string | string[] | null
  team_id?: string | null
  workflow_id?: string | null
  total_traces: number
  first_trace_at: string
  last_trace_at: string
}

export interface DayAggregatedMetrics {
  id?: string
  date: string
  agent_runs_count: number
  agent_sessions_count: number
  team_runs_count: number
  team_sessions_count: number
  workflow_runs_count: number
  workflow_sessions_count: number
  users_count: number
  token_metrics: Record<string, number>
  model_metrics: Array<Record<string, unknown>>
  created_at: string
  updated_at: string
}

export interface MetricsResponse {
  metrics: DayAggregatedMetrics[]
  updated_at?: string | null
}

export interface TracePage {
  data: TraceSummary[]
  meta: Pagination
}

export interface TraceSessionStatsPage {
  data: TraceSessionStats[]
  meta: Pagination
}

export interface Sessions {
  data: SessionEntry[]
  meta: Pagination
}

export interface WorkflowStepResult {
  step_id?: string
  step_name?: string
  step_type?: string
  step_run_id?: string
  executor_name?: string
  executor_type?: string
  success?: boolean
  is_paused?: boolean
  stop?: boolean
  error?: string | null
  content?: unknown
  metrics?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface SessionRunRecord {
  run_id: string
  status?: string
  agent_id?: string
  team_id?: string
  workflow_id?: string
  user_id?: string
  created_at?: number
  run_input?: unknown
  content?: unknown
  content_type?: string
  messages?: unknown[] | null
  tools?: unknown[] | null
  events?: unknown[] | null
  reasoning_steps?: unknown[] | null
  references?: unknown[] | null
  citations?: unknown[] | null
  files?: unknown[] | null
  images?: unknown[] | null
  videos?: unknown[] | null
  audio?: unknown[] | null
  session_state?: Record<string, unknown> | null
  step_results?: WorkflowStepResult[]
  step_executor_runs?: unknown[]
  step_requirements?: unknown
  pause_kind?: string
  paused_step_name?: string
  paused_step_index?: number
  metrics?: Record<string, unknown> | null
  [key: string]: unknown
}

/** Kept as an alias for callers that specifically inspect Workflow runs. */
export type WorkflowSessionRun = SessionRunRecord

export interface ChatEntry {
  message: {
    role: 'user' | 'system' | 'tool' | 'assistant'
    content: string
    created_at: number
  }
  response: {
    content: string
    tools?: ToolCall[]
    extra_data?: {
      reasoning_steps?: ReasoningSteps[]
      reasoning_messages?: ReasoningMessage[]
      references?: ReferenceData[]
    }
    images?: ImageData[]
    videos?: VideoData[]
    audio?: AudioData[]
    response_audio?: {
      transcript?: string
    }
    created_at: number
  }
}
