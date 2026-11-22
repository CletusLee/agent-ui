'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react'
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs'

import { getRegistryAPI } from '@/api/os'
import { Button } from '@/components/ui/button'
import { useStore } from '@/store'
import { RegistryPage, RegistryRecord } from '@/types/os'

const REGISTRY_TYPES = ['agent', 'team', 'workflow', 'tool', 'function', 'model', 'db'] as const
const PAGE_SIZE = 10
const SAFE_METADATA_FIELDS = ['description', 'provider', 'model_id', 'db_id', 'is_toolkit', 'has_entrypoint'] as const

const SafeMetadata = ({ record }: { record: RegistryRecord }) => {
  const fields = SAFE_METADATA_FIELDS.flatMap((key) => {
    const value = record.metadata?.[key]
    if (value === undefined || value === null || value === '') return []
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return []
    return [[key.replace(/_/g, ' '), String(value)] as const]
  })

  return (
    <dl className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
      {fields.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-lg border border-primary/10 bg-background p-2">
          <dt className="text-[9px] uppercase tracking-wide text-muted">{label}</dt>
          <dd className="mt-1 break-words text-[11px] text-primary">{value}</dd>
        </div>
      ))}
      {fields.length === 0 && <p className="text-[10px] text-muted">No approved summary fields were returned.</p>}
    </dl>
  )
}

const RegistryPanel = ({ refreshKey }: { refreshKey: number }) => {
  const { selectedEndpoint, authToken } = useStore()
  const [pageQuery, setPageQuery] = useQueryState('registry_page', parseAsInteger.withDefault(1))
  const [typeQuery, setTypeQuery] = useQueryState('registry_type', parseAsString)
  const [nameQuery, setNameQuery] = useQueryState('registry_name', parseAsString)
  const [typeInput, setTypeInput] = useState(typeQuery || '')
  const [nameInput, setNameInput] = useState(nameQuery || '')
  const [pageData, setPageData] = useState<RegistryPage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const page = Math.max(1, pageQuery || 1)

  useEffect(() => {
    setTypeInput(typeQuery || '')
    setNameInput(nameQuery || '')
  }, [typeQuery, nameQuery])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    getRegistryAPI(
      selectedEndpoint,
      { page, limit: PAGE_SIZE, resourceType: typeQuery || undefined, name: nameQuery || undefined },
      authToken,
      controller.signal
    ).then((result) => {
      setPageData(result)
    }).catch((reason) => {
      if (!controller.signal.aborted) {
        setPageData(null)
        setError(reason instanceof Error ? reason.message : 'Unable to load the AgentOS registry.')
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })

    return () => controller.abort()
  }, [selectedEndpoint, authToken, page, typeQuery, nameQuery, refreshKey, refreshNonce])

  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void Promise.all([
      setPageQuery(1),
      setTypeQuery(typeInput || null),
      setNameQuery(nameInput.trim() || null)
    ])
  }

  const clearFilters = () => {
    setTypeInput('')
    setNameInput('')
    void Promise.all([setPageQuery(1), setTypeQuery(null), setNameQuery(null)])
  }

  const records = pageData?.data ?? []
  const totalCount = pageData?.meta.total_count ?? 0
  const totalPages = Math.max(1, pageData?.meta.total_pages ?? 1)

  return (
    <section className="min-w-0 space-y-4 rounded-xl border border-primary/10 bg-card p-4">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-primary">AgentOS registry records</h2>
          <p className="mt-1 break-words text-[11px] text-muted">
            Read-only GET /registry · {totalCount} records · global scope (the endpoint has no db_id filter).
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" aria-label="Refresh registry records" onClick={() => setRefreshNonce((value) => value + 1)}>
          <RefreshCw className="size-3.5" /> Refresh
        </Button>
      </header>

      <form onSubmit={applyFilters} className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto_auto]">
        <label className="block min-w-0 text-[10px] font-medium text-muted">
          Resource type
          <select
            value={typeInput}
            onChange={(event) => setTypeInput(event.target.value)}
            className="mt-1 h-10 w-full min-w-0 rounded-lg border border-primary/15 bg-background px-3 text-sm text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Any type</option>
            {REGISTRY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label className="block min-w-0 text-[10px] font-medium text-muted">
          Name
          <input
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            placeholder="Filter by name"
            className="mt-1 h-10 w-full min-w-0 rounded-lg border border-primary/15 bg-background px-3 text-sm text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </label>
        <Button type="submit" variant="outline" className="h-10 self-end"><Search className="size-3.5" /> Filter</Button>
        <Button type="button" variant="outline" className="h-10 self-end" onClick={clearFilters}>Clear</Button>
      </form>

      <p className="break-words text-[10px] text-muted">
        Only identity fields and approved metadata summaries (description, provider, model/database ID, toolkit and entrypoint flags) are shown. Other registry metadata is omitted.
      </p>

      {loading ? (
        <div className="rounded-lg border border-primary/10 p-6 text-center text-xs text-muted">Loading registry records…</div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
          <p className="break-words text-xs text-destructive">{error}</p>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setRefreshNonce((value) => value + 1)}>
            <RefreshCw className="size-3.5" /> Retry
          </Button>
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-lg border border-primary/10 p-5 text-center text-xs text-muted">
          {totalCount === 0 && !typeQuery && !nameQuery ? 'AgentOS returned a successful empty registry.' : 'No registry records match these filters.'}
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((record) => (
            <article key={`${record.type}:${record.id}`} className="min-w-0 rounded-xl border border-primary/10 bg-background p-3">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-medium text-primary">{record.name || 'Unnamed registry record'}</h3>
                  <p className="mt-1 break-all font-mono text-[10px] text-muted">{record.id}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  <span className="rounded-full border border-primary/15 px-2 py-1 text-[9px] uppercase text-muted">{record.type}</span>
                  {record.sandboxed !== undefined && <span className="rounded-full border border-primary/15 px-2 py-1 text-[9px] text-muted">{record.sandboxed ? 'Sandboxed' : 'Not sandboxed'}</span>}
                </div>
              </div>
              <SafeMetadata record={record} />
            </article>
          ))}
        </div>
      )}

      <footer className="flex min-w-0 items-center justify-between gap-3 border-t border-primary/10 pt-3">
        <Button type="button" variant="ghost" size="sm" disabled={loading || page <= 1} onClick={() => void setPageQuery(Math.max(1, page - 1))}>
          <ChevronLeft className="size-3.5" /> Previous
        </Button>
        <span className="text-center text-[10px] text-muted">Page {pageData?.meta.page ?? page} of {totalPages}</span>
        <Button type="button" variant="ghost" size="sm" disabled={loading || page >= totalPages} onClick={() => void setPageQuery(page + 1)}>
          Next <ChevronRight className="size-3.5" />
        </Button>
      </footer>
    </section>
  )
}

export default RegistryPanel
