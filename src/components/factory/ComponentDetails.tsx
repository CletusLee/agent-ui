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
  getTeamRuntimeDetailsAPI
} from '@/api/os'
import { Button } from '@/components/ui/button'
import { useStore } from '@/store'
import {
  AgentRuntimeDetails,
  FactoryAgentDefinition,
  FactoryTeamDefinition,
  TeamRuntimeDetails
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

const ErrorMessage = ({ message }: { message: string }) => (
  <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs leading-5 text-destructive">
    <AlertCircle className="mt-0.5 size-4 shrink-0" />
    <span>{message}</span>
  </div>
)

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
  const [loading, setLoading] = useState(true)
  const [definitionError, setDefinitionError] = useState('')
  const [runtimeError, setRuntimeError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setDefinition(null)
    setRuntime(null)
    setDefinitionError('')
    setRuntimeError('')
    setLoading(true)

    if (!isEndpointActive) {
      setDefinitionError('Connect to AgentOS to load component details.')
      setRuntimeError('Connect to AgentOS to load runtime details.')
      setLoading(false)
      return () => controller.abort()
    }

    const definitionRequest =
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
    const runtimeRequest =
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

    Promise.allSettled([definitionRequest, runtimeRequest])
      .then(([definitionResult, runtimeResult]) => {
        if (controller.signal.aborted) return
        if (definitionResult.status === 'fulfilled') {
          setDefinition(definitionResult.value)
        } else {
          setDefinitionError(
            definitionResult.reason instanceof Error
              ? definitionResult.reason.message
              : 'Factory definition could not be loaded.'
          )
        }
        if (runtimeResult.status === 'fulfilled') {
          setRuntime(runtimeResult.value)
        } else {
          setRuntimeError(
            runtimeResult.reason instanceof Error
              ? runtimeResult.reason.message
              : 'AgentOS runtime details could not be loaded.'
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [authToken, id, isEndpointActive, kind, selectedEndpoint])

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

      {definitionError && <ErrorMessage message={definitionError} />}
      {runtimeError && <ErrorMessage message={runtimeError} />}

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
              {tools.length > 0 ? (
                <div className="space-y-2">
                  {tools.map((tool, index) => (
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
                    </div>
                  ))}
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
    </div>
  )
}

export default ComponentDetails
