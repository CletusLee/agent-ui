'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bot, Database, RefreshCw, Search, Sparkles, Wrench } from 'lucide-react'
import { useQueryState } from 'nuqs'

import {
  getAgentOSConfigSummaryAPI,
  getAgentRuntimeDetailsAPI,
  getFactorySkillCatalogAPI,
  getTeamRuntimeDetailsAPI
} from '@/api/os'
import { Button } from '@/components/ui/button'
import { useStore } from '@/store'
import {
  AgentOSModelSummary,
  FactoryCatalogSkill,
  RuntimeTool,
  TeamRuntimeDetails,
  AgentRuntimeDetails
} from '@/types/os'

type DirectoryTab = 'tools' | 'skills' | 'models'
type SourceStatus = 'loading' | 'success' | 'partial' | 'error'
type ComponentKind = 'agent' | 'team'

type CatalogTool = {
  key: string
  kind: ComponentKind
  componentId: string
  componentName: string
  name: string
  description?: string
  parameters?: unknown
  source: string
}

type ComponentReference = {
  kind: ComponentKind
  id: string
  name: string
}

type SourceState = {
  status: SourceStatus
  message?: string
}

type ComponentFailure = ComponentReference & { error: string }

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'AgentOS request failed.'

const readRuntimeTools = (
  value: AgentRuntimeDetails['tools'] | TeamRuntimeDetails['tools']
): RuntimeTool[] => {
  if (Array.isArray(value)) return value
  return value && Array.isArray(value.tools) ? value.tools : []
}

const componentEndpoint = (kind: ComponentKind, id: string) =>
  `GET /${kind === 'agent' ? 'agents' : 'teams'}/${encodeURIComponent(id)}`

const modelsMatch = (
  catalogModel: AgentOSModelSummary,
  runtimeModel?: AgentRuntimeDetails['model']
) => {
  if (!runtimeModel) return false
  const catalogProvider = catalogModel.provider?.trim().toLowerCase()
  const runtimeProvider = runtimeModel.provider?.trim().toLowerCase()
  if (catalogProvider && runtimeProvider && catalogProvider !== runtimeProvider) {
    return false
  }
  const catalogNames = [catalogModel.id, catalogModel.name, catalogModel.model]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim().toLowerCase())
  const runtimeNames = [runtimeModel.name, runtimeModel.model]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim().toLowerCase())
  return catalogNames.some((name) => runtimeNames.includes(name))
}

const SourceError = ({
  message,
  onRetry
}: {
  message: string
  onRetry: () => void
}) => (
  <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
    <p className="min-w-0 break-words text-xs text-destructive">{message}</p>
    <Button type="button" variant="outline" size="sm" onClick={onRetry}>
      <RefreshCw className="size-3.5" /> Retry
    </Button>
  </div>
)

const ToolsExplorer = () => {
  const { selectedEndpoint, authToken, isEndpointActive, setActiveView } = useStore()
  const [, setViewQuery] = useQueryState('view')
  const [, setFactoryKindQuery] = useQueryState('factory_kind')
  const [, setFactoryIdQuery] = useQueryState('factory_id')
  const [tabQuery, setTabQuery] = useQueryState('catalog')
  const [activeTab, setActiveTab] = useState<DirectoryTab>('tools')
  const [search, setSearch] = useState('')
  const [skills, setSkills] = useState<FactoryCatalogSkill[]>([])
  const [skillRevision, setSkillRevision] = useState('')
  const [skillState, setSkillState] = useState<SourceState>({ status: 'loading' })
  const [tools, setTools] = useState<CatalogTool[]>([])
  const [runtimeState, setRuntimeState] = useState<SourceState>({ status: 'loading' })
  const [runtimeCoverage, setRuntimeCoverage] = useState({ checked: 0, total: 0 })
  const [runtimeFailures, setRuntimeFailures] = useState<ComponentFailure[]>([])
  const [models, setModels] = useState<AgentOSModelSummary[]>([])
  const [modelUsers, setModelUsers] = useState<Record<string, ComponentReference[]>>({})
  const [modelState, setModelState] = useState<SourceState>({ status: 'loading' })

  useEffect(() => {
    if (tabQuery === 'tools' || tabQuery === 'skills' || tabQuery === 'models') {
      setActiveTab(tabQuery)
    }
  }, [tabQuery])

  const loadSkills = useCallback(async (signal?: AbortSignal) => {
    setSkillState({ status: 'loading' })
    try {
      const catalog = await getFactorySkillCatalogAPI(selectedEndpoint, authToken, signal)
      if (signal?.aborted) return
      setSkills(catalog.skills)
      setSkillRevision(catalog.revision)
      setSkillState({
        status: 'success',
        message: `${catalog.skills.length} skills · ${catalog.scope}`
      })
    } catch (error) {
      if (signal?.aborted) return
      setSkillState({ status: 'error', message: getErrorMessage(error) })
    }
  }, [authToken, selectedEndpoint])

  const loadRuntimeCatalog = useCallback(async (signal?: AbortSignal) => {
    setRuntimeState({ status: 'loading' })
    setModelState({ status: 'loading' })
    setTools([])
    setRuntimeFailures([])
    setRuntimeCoverage({ checked: 0, total: 0 })
    setModelUsers({})

    try {
      const config = await getAgentOSConfigSummaryAPI(selectedEndpoint, authToken, signal)
      if (signal?.aborted) return
      const availableModels = config.available_models ?? []
      setModels(availableModels)
      setModelState({
        status: 'success',
        message: config.available_models === undefined
          ? 'GET /config did not return available_models.'
          : `${availableModels.length} model summaries from GET /config.available_models`
      })

      const components: ComponentReference[] = [
        ...config.agents.map((component) => ({
          kind: 'agent' as const,
          id: component.id,
          name: component.name || component.id
        })),
        ...config.teams.map((component) => ({
          kind: 'team' as const,
          id: component.id,
          name: component.name || component.id
        }))
      ]
      setRuntimeCoverage({ checked: 0, total: components.length })

      const settled = await Promise.allSettled(components.map(async (component) => {
        const runtime = component.kind === 'agent'
          ? await getAgentRuntimeDetailsAPI(selectedEndpoint, component.id, authToken, signal)
          : await getTeamRuntimeDetailsAPI(selectedEndpoint, component.id, authToken, signal)
        return { component, runtime }
      }))
      if (signal?.aborted) return

      const nextTools: CatalogTool[] = []
      const nextFailures: ComponentFailure[] = []
      const loadedModels: Array<{ component: ComponentReference; model?: AgentRuntimeDetails['model'] }> = []
      let checked = 0

      settled.forEach((result, index) => {
        const component = components[index]
        if (result.status === 'rejected') {
          nextFailures.push({ ...component, error: getErrorMessage(result.reason) })
          return
        }

        checked += 1
        const { runtime } = result.value
        loadedModels.push({ component: { ...component, name: runtime.name || component.name }, model: runtime.model })
        readRuntimeTools(runtime.tools).forEach((tool, toolIndex) => {
          const name = tool.name?.trim() || 'Unnamed tool'
          nextTools.push({
            key: `${component.kind}:${component.id}:${toolIndex}:${name}`,
            kind: component.kind,
            componentId: component.id,
            componentName: runtime.name || component.name,
            name,
            description: tool.description,
            parameters: tool.parameters,
            source: componentEndpoint(component.kind, component.id)
          })
        })
      })

      const nextModelUsers: Record<string, ComponentReference[]> = {}
      availableModels.forEach((model, index) => {
        nextModelUsers[String(model.id || model.model || model.name || index)] = loadedModels
          .filter(({ model: runtimeModel }) => modelsMatch(model, runtimeModel))
          .map(({ component }) => component)
      })

      setTools(nextTools)
      setRuntimeCoverage({ checked, total: components.length })
      setRuntimeFailures(nextFailures)
      setModelUsers(nextModelUsers)
      setRuntimeState({
        status: nextFailures.length === 0 ? 'success' : checked === 0 ? 'error' : 'partial',
        message: `${checked}/${components.length} AgentOS /config Agents and Teams were checked; tools came from their runtime detail endpoints.`
      })
    } catch (error) {
      if (signal?.aborted) return
      const message = getErrorMessage(error)
      setRuntimeState({ status: 'error', message })
      setModelState({ status: 'error', message })
    }
  }, [authToken, selectedEndpoint])

  const reloadAll = useCallback(() => {
    const controller = new AbortController()
    void Promise.all([
      loadSkills(controller.signal),
      loadRuntimeCatalog(controller.signal)
    ])
    return () => controller.abort()
  }, [loadRuntimeCatalog, loadSkills])

  useEffect(() => reloadAll(), [reloadAll])

  const selectTab = (tab: DirectoryTab) => {
    setActiveTab(tab)
    void setTabQuery(tab)
  }

  const openComponent = async (component: ComponentReference) => {
    setActiveView('agents')
    await setFactoryKindQuery(component.kind)
    await setFactoryIdQuery(component.id)
    await setViewQuery('agents', { history: 'push' })
  }

  const normalizedSearch = search.trim().toLowerCase()
  const filteredTools = useMemo(() => tools.filter((tool) =>
    `${tool.name} ${tool.description || ''} ${tool.kind} ${tool.componentName} ${tool.componentId} ${tool.source}`
      .toLowerCase().includes(normalizedSearch)
  ), [normalizedSearch, tools])
  const filteredSkills = useMemo(() => skills.filter((skill) =>
    `${skill.id} ${skill.description} ${skill.instructions} ${skill.agents.map((agent) => `${agent.name} ${agent.id}`).join(' ')}`
      .toLowerCase().includes(normalizedSearch)
  ), [normalizedSearch, skills])
  const filteredModels = useMemo(() => models.filter((model) =>
    `${model.id || ''} ${model.name || ''} ${model.model || ''} ${model.provider || ''}`
      .toLowerCase().includes(normalizedSearch)
  ), [models, normalizedSearch])

  const tabDescription = activeTab === 'tools'
    ? 'Runtime tools returned by the AgentOS components listed in the current /config snapshot.'
    : activeTab === 'skills'
      ? 'Skills and Agent references from the complete Factory definition snapshot.'
      : 'Model IDs and public labels returned by AgentOS /config.'

  return (
    <main className="m-1.5 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-background">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-primary/10 px-4 py-5 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Wrench className="size-5 text-primary" />
            <h1 className="text-lg font-medium text-primary">Tools, Skills and Models</h1>
          </div>
          <p className="mt-1 max-w-3xl break-words text-xs text-muted">{tabDescription}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={reloadAll}>
          <RefreshCw className="size-3.5" /> Refresh directory
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Catalog type">
            {([
              ['tools', 'Tools', Wrench, tools.length],
              ['skills', 'Skills', Sparkles, skills.length],
              ['models', 'Models', Database, models.length]
            ] as const).map(([tab, label, Icon, count]) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => selectTab(tab)}
                className={`min-w-0 rounded-lg border p-3 text-left text-xs ${activeTab === tab ? 'border-primary/40 bg-accent text-primary' : 'border-primary/10 bg-card text-muted'}`}
              >
                <span className="flex items-center gap-2"><Icon className="size-4 shrink-0" />{label}</span>
                <span className="mt-2 block text-lg font-semibold">{count}</span>
              </button>
            ))}
          </div>

          <label className="flex min-w-0 items-center gap-2 rounded-lg border border-primary/10 bg-card px-3">
            <Search className="size-4 shrink-0 text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${activeTab}`}
              aria-label={`Search ${activeTab}`}
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-muted"
            />
          </label>

          {!isEndpointActive && (
            <p className="rounded-lg border border-primary/10 p-4 text-sm text-muted">Connect to AgentOS to inspect runtime tools and models.</p>
          )}

          {activeTab === 'tools' && isEndpointActive && (
            <section className="space-y-3">
              <p className="text-xs text-muted">Runtime coverage: {runtimeCoverage.checked}/{runtimeCoverage.total} components · source scope is current AgentOS GET /config.</p>
              {runtimeState.status === 'loading' && <p className="rounded-lg border border-primary/10 p-4 text-sm text-muted">Loading runtime components listed by AgentOS /config…</p>}
              {runtimeState.status === 'error' && <SourceError message={runtimeState.message || 'Runtime tools could not be loaded.'} onRetry={reloadAll} />}
              {runtimeState.status === 'partial' && <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted">Partial runtime catalog: {runtimeState.message}</div>}
              {runtimeFailures.length > 0 && (
                <details className="rounded-lg border border-amber-500/30 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-primary">{runtimeFailures.length} component detail requests failed</summary>
                  <ul className="mt-2 space-y-2 border-t border-primary/10 pt-2 text-xs">
                    {runtimeFailures.map((failure) => (
                      <li key={`${failure.kind}:${failure.id}`} className="break-words text-muted">
                        <span className="font-mono text-primary">{failure.kind} · {failure.id}</span> — {failure.error}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {runtimeState.status !== 'loading' && runtimeState.status !== 'error' && filteredTools.length === 0 && (
                <p className="rounded-lg border border-primary/10 p-4 text-sm text-muted">{tools.length === 0 ? 'No runtime tools were returned by the checked components.' : 'No tools match this search.'}</p>
              )}
              <div className="space-y-3">
                {filteredTools.map((tool) => (
                  <article key={tool.key} className="min-w-0 space-y-3 rounded-xl border border-primary/10 bg-card p-4">
                    <div className="min-w-0">
                      <h2 className="break-all font-mono text-sm font-medium text-primary">{tool.name}</h2>
                      {tool.description && <p className="mt-1 break-words text-xs leading-5 text-muted">{tool.description}</p>}
                    </div>
                    <div className="grid min-w-0 gap-2 text-xs sm:grid-cols-2">
                      <div className="min-w-0 rounded-lg border border-primary/10 bg-background p-3">
                        <div className="text-[10px] uppercase tracking-wide text-muted">Source component</div>
                        <div className="mt-1 break-words text-primary">{tool.kind} · {tool.componentName}</div>
                        <div className="mt-1 break-all font-mono text-[10px] text-muted">{tool.componentId}</div>
                      </div>
                      <div className="min-w-0 rounded-lg border border-primary/10 bg-background p-3">
                        <div className="text-[10px] uppercase tracking-wide text-muted">Runtime endpoint and tool identity</div>
                        <div className="mt-1 break-all font-mono text-[10px] text-primary">{tool.source}</div>
                        <div className="mt-1 break-words text-[10px] text-muted">{tool.kind}:{tool.componentId}:{tool.name}</div>
                      </div>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => void openComponent({ kind: tool.kind, id: tool.componentId, name: tool.componentName })}>
                      <Bot className="size-3.5" /> Open source component
                    </Button>
                    {tool.parameters !== undefined ? (
                      <details className="rounded-lg border border-primary/10 p-3">
                        <summary className="cursor-pointer text-xs font-medium text-primary">Parameter schema</summary>
                        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words border-t border-primary/10 pt-3 font-mono text-[10px] leading-4 text-muted">{JSON.stringify(tool.parameters, null, 2)}</pre>
                      </details>
                    ) : <p className="text-[10px] text-muted">No parameter schema was returned by this runtime tool.</p>}
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'skills' && isEndpointActive && (
            <section className="space-y-3">
              <p className="break-words text-xs text-muted">Source: GET /factory/catalog · complete Factory snapshot · revision {skillRevision || 'loading'}.</p>
              {skillState.status === 'loading' && <p className="rounded-lg border border-primary/10 p-4 text-sm text-muted">Loading the Factory skill catalog…</p>}
              {skillState.status === 'error' && <SourceError message={skillState.message || 'Factory skill catalog could not be loaded.'} onRetry={reloadAll} />}
              {skillState.status === 'success' && filteredSkills.length === 0 && <p className="rounded-lg border border-primary/10 p-4 text-sm text-muted">{skills.length === 0 ? 'The Factory snapshot contains no skills.' : 'No skills match this search.'}</p>}
              {filteredSkills.map((skill) => (
                <article key={skill.id} className="min-w-0 space-y-3 rounded-xl border border-primary/10 bg-card p-4">
                  <div>
                    <h2 className="break-all font-mono text-sm font-medium text-primary">{skill.id}</h2>
                    <p className="mt-1 break-words text-xs leading-5 text-muted">{skill.description || 'No description returned.'}</p>
                  </div>
                  <details className="rounded-lg border border-primary/10 p-3">
                    <summary className="cursor-pointer text-xs font-medium text-primary">Instructions</summary>
                    <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-primary/10 pt-3 font-sans text-xs leading-5 text-muted">{skill.instructions || 'No instructions returned.'}</pre>
                  </details>
                  <div className="space-y-2">
                    <h3 className="text-[10px] font-medium uppercase tracking-wide text-muted">Used by {skill.agents.length} Agents in the complete Factory snapshot</h3>
                    {skill.agents.length === 0 ? <p className="text-xs text-muted">No Agent references this skill in the current snapshot.</p> : (
                      <div className="flex flex-wrap gap-2">
                        {skill.agents.map((agent) => (
                          <Button key={agent.id} type="button" variant="outline" size="sm" onClick={() => void openComponent({ kind: 'agent', id: agent.id, name: agent.name })}>
                            <Bot className="size-3.5" /> {agent.name} · {agent.id}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </section>
          )}

          {activeTab === 'models' && isEndpointActive && (
            <section className="space-y-3">
              <p className="break-words text-xs text-muted">Source: AgentOS GET /config.available_models. Agno 3.2.1 in this deployment does not expose GET /models.</p>
              {modelState.status === 'loading' && <p className="rounded-lg border border-primary/10 p-4 text-sm text-muted">Loading model summaries from AgentOS /config…</p>}
              {modelState.status === 'error' && <SourceError message={modelState.message || 'Model summaries could not be loaded.'} onRetry={reloadAll} />}
              {modelState.status === 'success' && filteredModels.length === 0 && <p className="rounded-lg border border-primary/10 p-4 text-sm text-muted">{models.length === 0 ? modelState.message || 'No model summaries were returned.' : 'No models match this search.'}</p>}
              {filteredModels.map((model, index) => {
                const key = String(model.id || model.model || model.name || index)
                const users = modelUsers[key] || []
                return (
                  <article key={key} className="min-w-0 space-y-3 rounded-xl border border-primary/10 bg-card p-4">
                    <h2 className="break-words text-sm font-medium text-primary">{model.name || model.model || model.id || 'Unnamed model'}</h2>
                    <dl className="grid min-w-0 gap-2 text-xs sm:grid-cols-2">
                      <div className="min-w-0 rounded-lg border border-primary/10 bg-background p-3"><dt className="text-[10px] uppercase tracking-wide text-muted">ID</dt><dd className="mt-1 break-all font-mono text-primary">{model.id || 'Not returned'}</dd></div>
                      <div className="min-w-0 rounded-lg border border-primary/10 bg-background p-3"><dt className="text-[10px] uppercase tracking-wide text-muted">Provider</dt><dd className="mt-1 break-words text-primary">{model.provider || 'Not returned'}</dd></div>
                      <div className="min-w-0 rounded-lg border border-primary/10 bg-background p-3 sm:col-span-2"><dt className="text-[10px] uppercase tracking-wide text-muted">Model</dt><dd className="mt-1 break-all font-mono text-primary">{model.model || 'Not returned'}</dd></div>
                    </dl>
                    <p className="break-words text-[10px] text-muted">No additional public model parameters were returned by GET /config.available_models.</p>
                    <div className="space-y-2">
                      <h3 className="text-[10px] font-medium uppercase tracking-wide text-muted">Runtime components using this model</h3>
                      {runtimeState.status === 'loading' ? <p className="text-xs text-muted">Checking runtime component references…</p> : users.length === 0 ? <p className="text-xs text-muted">No matching component model reference was returned in the checked runtime details.</p> : (
                        <div className="flex flex-wrap gap-2">
                          {users.map((component) => <Button key={`${component.kind}:${component.id}`} type="button" variant="outline" size="sm" onClick={() => void openComponent(component)}><Bot className="size-3.5" /> {component.name} · {component.id}</Button>)}
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
              {runtimeFailures.length > 0 && <p className="break-words text-xs text-muted">Component references are partial: {runtimeCoverage.checked}/{runtimeCoverage.total} AgentOS runtime detail requests succeeded.</p>}
            </section>
          )}
        </div>
      </div>
    </main>
  )
}

export default ToolsExplorer
