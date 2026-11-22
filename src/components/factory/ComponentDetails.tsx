'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  Bot,
  ChevronLeft,
  LoaderCircle,
  Users
} from 'lucide-react'

import {
  getAgentRuntimeDetailsAPI,
  getFactoryAgentDefinitionAPI,
  getFactoryTeamDefinitionAPI,
  getFactoryWorkflowDefinitionAPI,
  getWorkflowsAPI,
  getTeamRuntimeDetailsAPI
} from '@/api/os'
import { Button } from '@/components/ui/button'
import { useStore } from '@/store'
import {
  AgentRuntimeDetails,
  FactoryAgentDefinition,
  FactoryTeamDefinition,
  TeamRuntimeDetails,
  WorkflowDefinition,
  WorkflowStepDefinition
} from '@/types/os'

type ComponentDetailsProps = {
  kind: 'agent' | 'team'
  id: string
  onSelectAgent?: (agentId: string) => void
  onBack?: () => void
  backLabel?: string
}

const Section = ({
  title,
  children
}: {
  title: string
  children: ReactNode
}) => (
  <section className="space-y-3 border-t border-primary/10 pt-4">
    <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted">
      {title}
    </h4>
    {children}
  </section>
)

const Value = ({ label, value }: { label: string; value?: string | null }) => (
  <div className="min-w-0 rounded-lg border border-primary/10 bg-accent p-3">
    <div className="text-[10px] font-medium uppercase tracking-wide text-muted">
      {label}
    </div>
    <div className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-primary">
      {value?.trim() || 'Not provided'}
    </div>
  </div>
)

const ErrorMessage = ({
  message,
  onRetry
}: {
  message: string
  onRetry?: () => void
}) => (
  <div
    role="alert"
    className="flex flex-col items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs leading-5 text-destructive sm:flex-row sm:items-center sm:justify-between"
  >
    <AlertCircle className="mt-0.5 size-4 shrink-0" />
    <span className="min-w-0 flex-1">{message}</span>
    {onRetry && (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 shrink-0 border-destructive/30 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={onRetry}
      >
        Retry
      </Button>
    )}
  </div>
)

const JsonDetails = ({ title, value }: { title: string; value: unknown }) => (
  <details className="rounded-lg border border-primary/10 bg-accent p-3">
    <summary className="cursor-pointer text-xs font-medium text-primary">
      {title}
    </summary>
    <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap break-words border-t border-primary/10 pt-3 font-mono text-[11px] leading-5 text-muted">
      {JSON.stringify(value, null, 2)}
    </pre>
  </details>
)

const workflowReferencesComponent = (
  steps: WorkflowStepDefinition[] = [],
  kind: ComponentDetailsProps['kind'],
  id: string
): boolean =>
  steps.some((step) => {
    if (step.type === kind && step.ref === id) return true
    return (
      workflowReferencesComponent(step.steps, kind, id) ||
      workflowReferencesComponent(step.else_steps, kind, id)
    )
  })

const ComponentDetails = ({
  kind,
  id,
  onSelectAgent,
  onBack,
  backLabel
}: ComponentDetailsProps) => {
  const { selectedEndpoint, authToken, isEndpointActive } = useStore()
  const [definition, setDefinition] = useState<
    FactoryAgentDefinition | FactoryTeamDefinition | null
  >(null)
  const [runtime, setRuntime] = useState<
    AgentRuntimeDetails | TeamRuntimeDetails | null
  >(null)
  const [definitionLoading, setDefinitionLoading] = useState(true)
  const [runtimeLoading, setRuntimeLoading] = useState(true)
  const [definitionError, setDefinitionError] = useState('')
  const [runtimeError, setRuntimeError] = useState('')
  const [definitionRetryCount, setDefinitionRetryCount] = useState(0)
  const [runtimeRetryCount, setRuntimeRetryCount] = useState(0)
  const [workflowDefinitions, setWorkflowDefinitions] = useState<
    WorkflowDefinition[]
  >([])
  const [workflowTotal, setWorkflowTotal] = useState(0)
  const [workflowFailureCount, setWorkflowFailureCount] = useState(0)
  const [workflowLoading, setWorkflowLoading] = useState(true)
  const [workflowError, setWorkflowError] = useState('')
  const [workflowRetryCount, setWorkflowRetryCount] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setDefinition(null)
    setDefinitionError('')
    setDefinitionLoading(true)

    if (!isEndpointActive) {
      setDefinitionError('Connect to AgentOS to load component details.')
      setDefinitionLoading(false)
      return () => controller.abort()
    }

    const request =
      kind === 'agent'
        ? getFactoryAgentDefinitionAPI(
            selectedEndpoint,
            id,
            authToken,
            controller.signal
          )
        : getFactoryTeamDefinitionAPI(
            selectedEndpoint,
            id,
            authToken,
            controller.signal
          )
    request
      .then((result) => {
        if (!controller.signal.aborted) setDefinition(result)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setDefinitionError(
          error instanceof Error
            ? error.message
            : 'Factory definition could not be loaded.'
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setDefinitionLoading(false)
      })

    return () => controller.abort()
  }, [
    authToken,
    definitionRetryCount,
    id,
    isEndpointActive,
    kind,
    selectedEndpoint
  ])

  useEffect(() => {
    const controller = new AbortController()
    setRuntime(null)
    setRuntimeError('')
    setRuntimeLoading(true)

    if (!isEndpointActive) {
      setRuntimeError('Connect to AgentOS to load runtime details.')
      setRuntimeLoading(false)
      return () => controller.abort()
    }

    const request =
      kind === 'agent'
        ? getAgentRuntimeDetailsAPI(
            selectedEndpoint,
            id,
            authToken,
            controller.signal
          )
        : getTeamRuntimeDetailsAPI(
            selectedEndpoint,
            id,
            authToken,
            controller.signal
          )

    request
      .then((result) => {
        if (!controller.signal.aborted) setRuntime(result)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setRuntimeError(
          error instanceof Error
            ? error.message
            : 'AgentOS runtime details could not be loaded.'
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setRuntimeLoading(false)
      })

    return () => controller.abort()
  }, [authToken, id, isEndpointActive, kind, runtimeRetryCount, selectedEndpoint])

  useEffect(() => {
    const controller = new AbortController()
    setWorkflowDefinitions([])
    setWorkflowTotal(0)
    setWorkflowFailureCount(0)
    setWorkflowError('')
    setWorkflowLoading(true)

    if (!isEndpointActive) {
      setWorkflowError('Connect to AgentOS to load Workflow references.')
      setWorkflowLoading(false)
      return () => controller.abort()
    }

    getWorkflowsAPI(selectedEndpoint, authToken, controller.signal)
      .then(async (summaries) => {
        if (controller.signal.aborted) return
        setWorkflowTotal(summaries.length)

        const results = await Promise.allSettled(
          summaries.map((workflow) =>
            getFactoryWorkflowDefinitionAPI(
              selectedEndpoint,
              workflow.id,
              authToken,
              controller.signal
            )
          )
        )
        if (controller.signal.aborted) return

        const definitions = results.flatMap((result) =>
          result.status === 'fulfilled' ? [result.value] : []
        )
        setWorkflowDefinitions(definitions)
        setWorkflowFailureCount(
          results.filter((result) => result.status === 'rejected').length
        )
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setWorkflowError(
          error instanceof Error
            ? error.message
            : 'Workflow references could not be loaded.'
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setWorkflowLoading(false)
      })

    return () => controller.abort()
  }, [authToken, id, isEndpointActive, kind, selectedEndpoint, workflowRetryCount])

  const loading = definitionLoading || runtimeLoading

  const tools = runtime?.tools
    ? Array.isArray(runtime.tools)
      ? runtime.tools
      : runtime.tools.tools || []
    : []
  const isAgent = kind === 'agent'
  const agentDefinition = definition as FactoryAgentDefinition | null
  const teamDefinition = definition as FactoryTeamDefinition | null
  const teamRuntime = runtime as TeamRuntimeDetails | null
  const skills = agentDefinition?.skills ?? []
  const members = teamDefinition?.members ?? []
  const workflowsUsingComponent = workflowDefinitions.filter((workflow) =>
    workflowReferencesComponent(workflow.steps, kind, id)
  )

  return (
    <div className="space-y-5">
      {onBack && backLabel && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="-ml-2 text-muted hover:text-primary"
        >
          <ChevronLeft className="size-4" />
          {backLabel}
        </Button>
      )}

      <header className="flex min-w-0 items-start gap-3">
        <span className="rounded-lg border border-primary/10 bg-primaryAccent p-2">
          {isAgent ? (
            <Bot className="size-4 text-muted" />
          ) : (
            <Users className="size-4 text-muted" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted">
            {isAgent ? 'Agent' : 'Team'} details
          </div>
          <h3 className="mt-1 break-words text-base font-medium text-primary">
            {definition?.name || runtime?.name || id}
          </h3>
          <div className="mt-1 break-all font-mono text-[11px] text-muted">
            {id}
          </div>
        </div>
      </header>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted">
          <LoaderCircle className="size-4 animate-spin" />
          Loading component details
        </div>
      )}

      {definitionError && (
        <ErrorMessage
          message={definitionError}
          onRetry={
            isEndpointActive
              ? () => setDefinitionRetryCount((count) => count + 1)
              : undefined
          }
        />
      )}
      {runtimeError && (
        <ErrorMessage
          message={runtimeError}
          onRetry={
            isEndpointActive
              ? () => setRuntimeRetryCount((count) => count + 1)
              : undefined
          }
        />
      )}

      {definition && (
        <JsonDetails title="Full Factory definition" value={definition} />
      )}

      {isAgent && agentDefinition && (
        <>
          <Section title="Factory definition">
            <div className="grid gap-2 sm:grid-cols-2">
              <Value label="Role group" value={agentDefinition.group} />
              <Value
                label="Definition revision"
                value={agentDefinition.revision}
              />
            </div>
            <Value label="Summary" value={agentDefinition.summary} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Value label="Inputs" value={agentDefinition.inputs} />
              <Value label="Expected outputs" value={agentDefinition.outputs} />
            </div>
          </Section>

          <Section title={`Skills · ${skills.length}`}>
            {skills.length > 0 ? (
              <div className="space-y-2">
                {skills.map((skill) => (
                  <details
                    key={skill.id}
                    className="group rounded-lg border border-primary/10 bg-accent p-3"
                  >
                    <summary className="cursor-pointer list-none">
                      <span className="block break-all font-mono text-xs text-primary">
                        {skill.id}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted">
                        {skill.description || 'No description provided.'}
                      </span>
                    </summary>
                    <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words border-t border-primary/10 pt-3 font-sans text-xs leading-5 text-muted">
                      {skill.instructions || 'No skill instructions provided.'}
                    </pre>
                  </details>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted">No skills are defined.</p>
            )}
          </Section>

          <details className="rounded-lg border border-primary/10 bg-accent p-3">
            <summary className="cursor-pointer text-xs font-medium text-primary">
              Agent instructions
            </summary>
            <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-primary/10 pt-3 font-sans text-xs leading-5 text-muted">
              {agentDefinition.instructions || 'No instructions provided.'}
            </pre>
          </details>
        </>
      )}

      {!isAgent && teamDefinition && (
        <>
          <Section title="Factory definition">
            <Value
              label="Definition revision"
              value={teamDefinition.revision}
            />
            <Value
              label="Team instructions"
              value={teamDefinition.instructions}
            />
          </Section>

          <Section title={`Members · ${members.length}`}>
            <div className="space-y-2">
              {members.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => onSelectAgent?.(member.id)}
                  className="w-full rounded-lg border border-primary/10 bg-accent p-3 text-left transition-colors hover:border-primary/30"
                >
                  <span className="block break-words text-sm font-medium text-primary">
                    {member.name}
                  </span>
                  <span className="mt-1 block break-all font-mono text-[11px] text-muted">
                    {member.id} · {member.group}
                  </span>
                  {member.summary && (
                    <span className="mt-2 block text-xs leading-5 text-muted">
                      {member.summary}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </Section>

          <details className="rounded-lg border border-primary/10 bg-accent p-3">
            <summary className="cursor-pointer text-xs font-medium text-primary">
              Team instructions
            </summary>
            <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-primary/10 pt-3 font-sans text-xs leading-5 text-muted">
              {teamDefinition.instructions || 'No instructions provided.'}
            </pre>
          </details>
        </>
      )}

      <Section title={`Factory Workflow references · ${workflowsUsingComponent.length}`}>
        <p className="text-[10px] leading-4 text-muted">
          Source: AgentOS GET /workflows and Factory GET /factory/workflows/{'{workflow_id}'}.
        </p>
        {workflowLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted">
            <LoaderCircle className="size-4 animate-spin" />
            Loading Workflow references
          </div>
        ) : workflowError ? (
          <ErrorMessage
            message={workflowError}
            onRetry={
              isEndpointActive
                ? () => setWorkflowRetryCount((count) => count + 1)
                : undefined
            }
          />
        ) : (
          <>
            {workflowFailureCount > 0 && (
              <ErrorMessage
                message={`${workflowFailureCount} of ${workflowTotal} Workflow definitions could not be loaded. Results may be incomplete.`}
                onRetry={() => setWorkflowRetryCount((count) => count + 1)}
              />
            )}
            {workflowsUsingComponent.length > 0 ? (
              <div className="space-y-2">
                {workflowsUsingComponent.map((workflow) => (
                  <div
                    key={workflow.id}
                    className="min-w-0 rounded-lg border border-primary/10 bg-accent p-3"
                  >
                    <div className="break-words text-sm font-medium text-primary">
                      {workflow.name || workflow.id}
                    </div>
                    <div className="mt-1 break-all font-mono text-[11px] text-muted">
                      {workflow.id}
                    </div>
                  </div>
                ))}
              </div>
            ) : workflowFailureCount > 0 ? (
              <p className="text-xs leading-5 text-muted">
                No matching reference was found in the Workflow definitions that loaded.
              </p>
            ) : workflowTotal === 0 ? (
              <p className="text-xs leading-5 text-muted">
                AgentOS returned no configured Workflows.
              </p>
            ) : (
              <p className="text-xs leading-5 text-muted">
                No Factory Workflow definition references this component.
              </p>
            )}
          </>
        )}
      </Section>

      <Section title="AgentOS runtime">
        {runtime ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <Value label="Model provider" value={runtime.model?.provider} />
              <Value label="Model" value={runtime.model?.model} />
              {runtime.model?.name && (
                <Value label="Model integration" value={runtime.model.name} />
              )}
              {!isAgent && teamRuntime?.mode && (
                <Value label="Team mode" value={teamRuntime.mode} />
              )}
            </div>
            <div>
              <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted">
                Runtime tools · {tools.length}
              </div>
              <p className="mb-2 break-all text-[10px] text-muted">
                Source: AgentOS {kind === 'agent' ? 'GET /agents' : 'GET /teams'}/{encodeURIComponent(id)}
              </p>
              {tools.length > 0 ? (
                <div className="space-y-2">
                  {tools.map((tool, index) => {
                    const parameters = tool.parameters
                    return (
                      <div
                        key={`${tool.name || 'tool'}-${index}`}
                        className="rounded-lg border border-primary/10 bg-accent p-3"
                      >
                        <div className="break-all font-mono text-xs text-primary">
                          {tool.name || 'Unnamed tool'}
                        </div>
                        {tool.description && (
                          <p className="mt-1 text-xs leading-5 text-muted">
                            {tool.description}
                          </p>
                        )}
                        {parameters !== undefined ? (
                          <details className="mt-3 rounded-md border border-primary/10 p-2">
                            <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-wide text-muted">
                              Parameter schema
                            </summary>
                            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words border-t border-primary/10 pt-2 font-mono text-[10px] leading-4 text-muted">
                              {JSON.stringify(parameters, null, 2)}
                            </pre>
                          </details>
                        ) : (
                          <p className="mt-2 text-[10px] text-muted">
                            AgentOS did not return a parameter schema.
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted">
                  AgentOS did not return any runtime tools.
                </p>
              )}
            </div>
            {isAgent && (
              <div className="grid gap-2 sm:grid-cols-2">
                <Value
                  label="Knowledge configuration"
                  value="Not returned by the AgentOS component details API"
                />
                <Value
                  label="Memory configuration"
                  value="Not returned by the AgentOS component details API"
                />
              </div>
            )}
            {!isAgent && teamRuntime?.members && (
              <Value
                label="Runtime members"
                value={teamRuntime.members
                  .map((member) => member.id)
                  .join(', ')}
              />
            )}
          </>
        ) : (
          <p className="text-xs leading-5 text-muted">
            Runtime details are unavailable. Factory definition data remains
            visible when it loaded.
          </p>
        )}
      </Section>

      {runtime && (
        <JsonDetails title="Full AgentOS runtime response" value={runtime} />
      )}
    </div>
  )
}

export default ComponentDetails
