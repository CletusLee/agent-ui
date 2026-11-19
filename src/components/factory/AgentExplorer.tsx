'use client'

import { useEffect, useState } from 'react'
import { Bot, Search, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import ComponentDetails from '@/components/factory/ComponentDetails'
import { useStore } from '@/store'

type ComponentKind = 'agent' | 'team'

const AgentExplorer = () => {
  const { agents, teams, isEndpointActive, isEndpointLoading } = useStore()
  const [kind, setKind] = useState<ComponentKind>('agent')
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const components = kind === 'agent' ? agents : teams
  const filteredComponents = components.filter((component) =>
    `${component.name || ''} ${component.id}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  )

  useEffect(() => {
    if (!components.some((component) => component.id === selectedId)) {
      setSelectedId(components[0]?.id || '')
    }
  }, [components, kind, selectedId])

  const selectKind = (nextKind: ComponentKind) => {
    if (nextKind === kind) return

    setKind(nextKind)
    setSearch('')
    setSelectedId('')
  }

  return (
    <main className="m-1.5 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/10 px-6 py-5">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="size-5 text-primary" />
            <h1 className="text-lg font-medium text-primary">Agents & Teams</h1>
          </div>
          <p className="mt-1 text-xs text-muted">
            Browse registered components and inspect their definitions and
            runtime details.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>{agents.length} agents</span>
          <span aria-hidden="true">·</span>
          <span>{teams.length} teams</span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-y-auto border-b border-primary/10 p-4 xl:border-b-0 xl:border-r">
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="ghost"
              aria-pressed={kind === 'agent'}
              onClick={() => selectKind('agent')}
              className={`h-9 rounded-xl text-xs uppercase ${kind === 'agent' ? 'bg-accent text-primary' : 'text-muted'}`}
            >
              <Bot className="size-4" />
              Agents
              <span className="ml-auto text-[10px] text-muted">
                {agents.length}
              </span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              aria-pressed={kind === 'team'}
              onClick={() => selectKind('team')}
              className={`h-9 rounded-xl text-xs uppercase ${kind === 'team' ? 'bg-accent text-primary' : 'text-muted'}`}
            >
              <Users className="size-4" />
              Teams
              <span className="ml-auto text-[10px] text-muted">
                {teams.length}
              </span>
            </Button>
          </div>

          <label className="mb-3 flex items-center gap-2 rounded-lg border border-primary/10 bg-accent px-3">
            <Search className="size-4 shrink-0 text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${kind}s`}
              aria-label={`Search ${kind}s`}
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-muted"
            />
          </label>

          {isEndpointLoading && (
            <p className="py-3 text-xs text-muted">Connecting to AgentOS</p>
          )}
          {!isEndpointActive && !isEndpointLoading && (
            <p className="py-3 text-xs leading-5 text-muted">
              Connect to AgentOS to view registered components.
            </p>
          )}
          {isEndpointActive && filteredComponents.length === 0 && (
            <p className="py-3 text-xs leading-5 text-muted">
              {components.length === 0
                ? `AgentOS has no registered ${kind}s.`
                : 'No components match this search.'}
            </p>
          )}
          <div className="space-y-2">
            {filteredComponents.map((component) => (
              <button
                key={component.id}
                type="button"
                onClick={() => setSelectedId(component.id)}
                aria-pressed={selectedId === component.id}
                className={`w-full min-w-0 rounded-xl border p-3 text-left transition-colors ${selectedId === component.id ? 'border-primary/40 bg-accent' : 'border-primary/10 bg-background hover:bg-accent/60'}`}
              >
                <span className="block break-words text-sm font-medium text-primary">
                  {component.name || component.id}
                </span>
                <span className="mt-1 block break-all font-mono text-[11px] text-muted">
                  {component.id}
                </span>
                {component.model && (
                  <span className="mt-2 block break-words text-[11px] text-muted">
                    {component.model.provider} · {component.model.model}
                  </span>
                )}
              </button>
            ))}
          </div>
        </aside>

        <section className="min-h-0 overflow-y-auto p-5 lg:p-7">
          {selectedId && isEndpointActive ? (
            <div className="mx-auto max-w-4xl">
              <ComponentDetails
                key={`${kind}:${selectedId}`}
                kind={kind}
                id={selectedId}
                onSelectAgent={(agentId) => {
                  setKind('agent')
                  setSearch('')
                  setSelectedId(agentId)
                }}
              />
            </div>
          ) : !isEndpointActive ? (
            <div className="flex h-full min-h-48 items-center justify-center text-sm text-muted">
              Connect to AgentOS to inspect Agent and Team details.
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}

export default AgentExplorer
