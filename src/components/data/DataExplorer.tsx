'use client'

import { useEffect, useState } from 'react'
import { parseAsInteger, parseAsStringEnum, useQueryState } from 'nuqs'
import { BookOpen, Brain, Database, GraduationCap, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getKnowledgeConfigAPI,
  getKnowledgeContentAPI,
  getLearningsAPI,
  getMemoriesAPI,
  getSessionDatabaseOptionsAPI,
  searchKnowledgeAPI,
  type ReadOnlyRecordPage
} from '@/api/os'
import { useStore } from '@/store'

const dataSections = ['memory', 'learnings', 'knowledge'] as const
type DataSection = (typeof dataSections)[number]
const knowledgeViews = ['configuration', 'content', 'search'] as const
type KnowledgeView = (typeof knowledgeViews)[number]
type KnowledgeSearchType = 'vector' | 'keyword' | 'hybrid'

interface KnowledgeSearchRequest {
  query: string
  searchType: KnowledgeSearchType
  maxResults: number
  requestId: number
}

const sectionLabels: Record<DataSection, string> = {
  memory: 'Memory',
  learnings: 'Learnings',
  knowledge: 'Knowledge'
}

const sectionIcons = {
  memory: Brain,
  learnings: GraduationCap,
  knowledge: BookOpen
}

const formatValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return 'Not returned'
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

const formatTimestamp = (value: unknown) => {
  if (typeof value !== 'number' && typeof value !== 'string') return 'Not returned'
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not returned' : date.toLocaleString()
}

const JsonDetails = ({
  label,
  value
}: {
  label: string
  value: unknown
}) => (
  <details className="min-w-0 rounded-lg border border-primary/10 bg-background">
    <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-primary">
      {label}
    </summary>
    <pre className="max-h-80 min-w-0 overflow-auto whitespace-pre-wrap break-words border-t border-primary/10 p-3 font-mono text-[10px] leading-5 text-muted">
      {formatValue(value)}
    </pre>
  </details>
)

const ErrorPanel = ({
  message,
  onRetry
}: {
  message: string
  onRetry: () => void
}) => (
  <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5">
    <p className="break-words text-sm text-destructive">{message}</p>
    <Button type="button" variant="outline" size="sm" onClick={onRetry} className="mt-3">
      Retry
    </Button>
  </div>
)

const RecordPage = ({
  section,
  result,
  page,
  onPageChange
}: {
  section: Exclude<DataSection, 'knowledge'>
  result: ReadOnlyRecordPage
  page: number
  onPageChange: (page: number) => void
}) => {
  const totalCount = result.meta.total_count ?? result.data.length
  const totalPages = Math.max(1, result.meta.total_pages ?? 1)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-medium uppercase tracking-wide text-primary">
            {sectionLabels[section]} records
          </h2>
          <p className="mt-1 text-[11px] text-muted">
            {totalCount} total · Page {page} of {totalPages}
          </p>
        </div>
        <span className="text-[10px] text-muted">AgentOS API</span>
      </div>

      {result.data.length === 0 ? (
        <div className="rounded-xl border border-primary/10 p-5 text-sm text-muted">
          {section === 'memory'
            ? 'No Memory records were returned for this database.'
            : 'No Learning records were returned for this database.'}
          <div className="mt-2 text-[11px]">The AgentOS request succeeded with an empty result.</div>
        </div>
      ) : (
        result.data.map((record, index) => {
          const recordId =
            (section === 'memory' ? record.memory_id : record.learning_id) ?? `record-${index + 1}`
          return (
            <article
              key={String(recordId)}
              className="min-w-0 space-y-3 rounded-xl border border-primary/10 bg-background p-4"
            >
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-medium text-primary">
                    {section === 'memory'
                      ? String(record.memory_id || 'Memory record')
                      : String(record.learning_type || 'Learning record')}
                  </h3>
                  <p className="mt-1 break-all font-mono text-[10px] text-muted">
                    {String(recordId)}
                  </p>
                </div>
                <span className="text-[10px] text-muted">
                  Updated {formatTimestamp(record.updated_at)}
                </span>
              </div>

              {section === 'memory' ? (
                <>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 text-primary">
                    {formatValue(record.memory)}
                  </p>
                  {Array.isArray(record.topics) && record.topics.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {record.topics.map((topic) => (
                        <span
                          key={String(topic)}
                          className="rounded-full border border-primary/10 px-2 py-1 text-[10px] text-muted"
                        >
                          {String(topic)}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="grid min-w-0 grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                    {(['namespace', 'user_id', 'agent_id', 'team_id', 'session_id', 'entity_id'] as const).map(
                      (key) => (
                        <div key={key} className="min-w-0 break-words">
                          <span className="text-muted">{key}: </span>
                          <span className="text-primary">{formatValue(record[key])}</span>
                        </div>
                      )
                    )}
                  </div>
                  {record.content !== undefined && (
                    <JsonDetails label="Learning content" value={record.content} />
                  )}
                </>
              )}

              <JsonDetails label={`Full ${sectionLabels[section]} record`} value={record} />
            </article>
          )
        })
      )}

      <div className="flex items-center justify-between gap-3 border-t border-primary/10 pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="text-[10px] text-muted">Page {page} of {totalPages}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}

const KnowledgePanel = ({
  config,
  configError,
  onRetryConfig,
  view,
  onViewChange,
  content,
  contentLoading,
  contentError,
  page,
  onPageChange,
  onRetryContent,
  searchQuery,
  onSearchQueryChange,
  searchType,
  onSearchTypeChange,
  maxResults,
  onMaxResultsChange,
  vectorDbId,
  onVectorDbChange,
  searchResult,
  searchLoading,
  searchError,
  onSearch,
  onRetrySearch
}: {
  config: Record<string, unknown> | null
  configError: string | null
  onRetryConfig: () => void
  view: KnowledgeView
  onViewChange: (view: KnowledgeView) => void
  content: ReadOnlyRecordPage | null
  contentLoading: boolean
  contentError: string | null
  page: number
  onPageChange: (page: number) => void
  onRetryContent: () => void
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  searchType: KnowledgeSearchType
  onSearchTypeChange: (type: KnowledgeSearchType) => void
  maxResults: number
  onMaxResultsChange: (count: number) => void
  vectorDbId: string
  onVectorDbChange: (id: string) => void
  searchResult: ReadOnlyRecordPage | null
  searchLoading: boolean
  searchError: string | null
  onSearch: () => void
  onRetrySearch: () => void
}) => {
  const entries = config
    ? ([
        ['Vector databases', config.vector_dbs],
        ['Readers', config.readers],
        ['Chunkers', config.chunkers],
        ['Remote content sources', config.remote_content_sources],
        ['Filters', config.filters]
      ] as const)
    : []
  const vectorDbs = config && Array.isArray(config.vector_dbs)
    ? config.vector_dbs.filter(
        (item): item is Record<string, unknown> => item !== null && typeof item === 'object'
      )
    : []
  const configuredSearchTypes = Array.from(
    new Set(
      vectorDbs.flatMap((database) =>
        Array.isArray(database.search_types)
          ? database.search_types.filter(
              (type): type is KnowledgeSearchType =>
                type === 'vector' || type === 'keyword' || type === 'hybrid'
            )
          : []
      )
    )
  )
  const searchTypes: KnowledgeSearchType[] = configuredSearchTypes.length
    ? configuredSearchTypes
    : ['vector', 'keyword', 'hybrid']
  const totalPages = Math.max(1, content?.meta.total_pages ?? 1)

  return (
    <div className="space-y-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xs font-medium uppercase tracking-wide text-primary">Knowledge</h2>
          <p className="mt-1 text-[11px] leading-5 text-muted">
            Browse configured content and search results. All actions in this workspace are read-only.
          </p>
        </div>
        <nav aria-label="Knowledge views" className="flex max-w-full flex-wrap gap-1 rounded-lg bg-primaryAccent/30 p-1">
          {knowledgeViews.map((item) => (
            <Button
              key={item}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={view === item}
              onClick={() => onViewChange(item)}
              className={`text-[10px] uppercase ${view === item ? 'bg-accent text-primary' : 'text-muted'}`}
            >
              {item}
            </Button>
          ))}
        </nav>
      </div>

      {view === 'configuration' && (
        config ? (
          <>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              {entries.map(([label, value]) => (
                <article key={label} className="min-w-0 rounded-xl border border-primary/10 p-4">
                  <h3 className="text-xs font-medium text-primary">{label}</h3>
                  <p className="mt-2 text-sm text-muted">
                    {Array.isArray(value)
                      ? `${value.length} configured`
                      : value && typeof value === 'object'
                        ? `${Object.keys(value).length} configured`
                        : 'Not returned'}
                  </p>
                  <JsonDetails label={`View ${label.toLowerCase()}`} value={value} />
                </article>
              ))}
            </div>
            <JsonDetails label="Full Knowledge configuration" value={config} />
          </>
        ) : (
          <ErrorPanel
            message={configError || 'No Knowledge configuration was returned.'}
            onRetry={onRetryConfig}
          />
        )
      )}

      {view === 'content' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-primary">Indexed content</h3>
              <p className="mt-1 text-[11px] text-muted">GET /knowledge/content · newest updates first</p>
            </div>
            {content && !contentError && (
              <span className="text-[10px] text-muted">
                {content.meta.total_count ?? content.data.length} total · Page {page} of {totalPages}
              </span>
            )}
          </div>
          {contentLoading ? (
            <div className="py-10 text-center text-sm text-muted">Loading Knowledge content…</div>
          ) : contentError ? (
            <ErrorPanel message={contentError} onRetry={onRetryContent} />
          ) : content?.data.length === 0 ? (
            <div className="rounded-xl border border-primary/10 p-5 text-sm text-muted">
              Knowledge is configured, but AgentOS returned no indexed content.
              <div className="mt-2 text-[11px]">The request succeeded with an empty result.</div>
            </div>
          ) : content ? (
            content.data.map((record, index) => {
              const recordId = record.id ?? `content-${index + 1}`
              return (
                <article key={String(recordId)} className="min-w-0 space-y-3 rounded-xl border border-primary/10 bg-background p-4">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="break-words text-sm font-medium text-primary">
                        {String(record.name || 'Knowledge content')}
                      </h4>
                      <p className="mt-1 break-all font-mono text-[10px] text-muted">{String(recordId)}</p>
                    </div>
                    <span className="rounded-full border border-primary/10 px-2 py-1 text-[10px] text-muted">
                      {String(record.status || 'Status not returned')}
                    </span>
                  </div>
                  <div className="grid min-w-0 grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                    {(['type', 'size', 'linked_to', 'access_count', 'created_at', 'updated_at'] as const).map((key) => (
                      <div key={key} className="min-w-0 break-words">
                        <span className="text-muted">{key}: </span>
                        <span className="text-primary">
                          {key === 'created_at' || key === 'updated_at'
                            ? formatTimestamp(record[key])
                            : formatValue(record[key])}
                        </span>
                      </div>
                    ))}
                  </div>
                  {typeof record.description === 'string' && record.description.length > 0 && (
                    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-primary">{String(record.description)}</p>
                  )}
                  {typeof record.status_message === 'string' && record.status_message.length > 0 && (
                    <p className="break-words text-xs text-muted">{String(record.status_message)}</p>
                  )}
                  {record.metadata !== undefined && <JsonDetails label="Content metadata" value={record.metadata} />}
                  <JsonDetails label="Full Knowledge content record" value={record} />
                </article>
              )
            })
          ) : null}

          {content && !contentError && (
            <div className="flex items-center justify-between gap-3 border-t border-primary/10 pt-3">
              <Button type="button" variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
                Previous
              </Button>
              <span className="text-[10px] text-muted">Page {page} of {totalPages}</span>
              <Button type="button" variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      {view === 'search' && (
        <div className="space-y-4">
          <form
            className="space-y-3 rounded-xl border border-primary/10 bg-primaryAccent/20 p-4"
            onSubmit={(event) => {
              event.preventDefault()
              onSearch()
            }}
          >
            <label className="block text-xs font-medium text-primary">
              Search query
              <input
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                placeholder="Ask a question about indexed knowledge"
                className="mt-2 h-10 w-full min-w-0 rounded-lg border border-primary/15 bg-background px-3 text-sm font-normal text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </label>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <label className="block text-[11px] font-medium text-muted">
                Search type
                <select
                  value={searchType}
                  onChange={(event) => onSearchTypeChange(event.target.value as KnowledgeSearchType)}
                  className="mt-2 h-10 w-full min-w-0 rounded-lg border border-primary/15 bg-background px-3 text-sm text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {searchTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label className="block text-[11px] font-medium text-muted">
                Maximum results
                <select
                  value={maxResults}
                  onChange={(event) => onMaxResultsChange(Number(event.target.value))}
                  className="mt-2 h-10 w-full min-w-0 rounded-lg border border-primary/15 bg-background px-3 text-sm text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {[5, 10, 20, 50].map((count) => <option key={count} value={count}>{count}</option>)}
                </select>
              </label>
              <Button type="submit" variant="outline" disabled={!searchQuery.trim() || searchLoading} className="h-10">
                <Search className="size-3.5" />
                {searchLoading ? 'Searching…' : 'Search knowledge'}
              </Button>
            </div>
            {vectorDbs.length > 0 && (
              <label className="block max-w-full text-[11px] font-medium text-muted sm:max-w-sm">
                Vector database
                <select
                  value={vectorDbId}
                  onChange={(event) => onVectorDbChange(event.target.value)}
                  className="mt-2 h-10 w-full min-w-0 rounded-lg border border-primary/15 bg-background px-3 text-sm text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">All configured vector databases</option>
                  {vectorDbs.map((database, index) => (
                    <option key={String(database.id ?? index)} value={String(database.id ?? '')}>
                      {String(database.name || database.id || `Vector DB ${index + 1}`)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="text-[10px] leading-4 text-muted">
              Read-only POST /knowledge/search. Query text is not stored in the URL.
            </p>
          </form>
          {searchError && <ErrorPanel message={searchError} onRetry={onRetrySearch} />}
          {searchLoading ? (
            <div className="py-8 text-center text-sm text-muted">Searching configured Knowledge…</div>
          ) : searchResult ? searchResult.data.length === 0 ? (
            <div className="rounded-xl border border-primary/10 p-5 text-sm text-muted">
              No matching Knowledge results were returned.
              <div className="mt-2 text-[11px]">The search request succeeded with an empty result.</div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-[11px] text-muted">
                {searchResult.meta.total_count ?? searchResult.data.length} results
                {searchResult.meta.search_time_ms !== undefined && ` · ${searchResult.meta.search_time_ms} ms`}
              </div>
              {searchResult.data.map((record, index) => (
                <article key={String(record.id ?? index)} className="min-w-0 space-y-3 rounded-xl border border-primary/10 bg-background p-4">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <h4 className="break-words text-sm font-medium text-primary">{String(record.name || `Result ${index + 1}`)}</h4>
                    <span className="text-[10px] text-muted">Score {formatValue(record.reranking_score)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 text-primary">{formatValue(record.content)}</p>
                  <div className="grid min-w-0 grid-cols-1 gap-2 text-[10px] sm:grid-cols-2">
                    {(['content_id', 'content_origin', 'size'] as const).map((key) => (
                      <div key={key} className="min-w-0 break-words"><span className="text-muted">{key}: </span><span className="text-primary">{formatValue(record[key])}</span></div>
                    ))}
                  </div>
                  {record.meta_data !== undefined && <JsonDetails label="Result source metadata" value={record.meta_data} />}
                  <JsonDetails label="Full Knowledge search result" value={record} />
                </article>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

const DataExplorer = () => {
  const { selectedEndpoint, authToken, isEndpointActive } = useStore()
  const [section, setSection] = useQueryState(
    'data_type',
    parseAsStringEnum([...dataSections]).withDefault('memory')
  )
  const [dbId, setDbId] = useQueryState('db_id')
  const [pageQuery, setPageQuery] = useQueryState(
    'data_page',
    parseAsInteger.withDefault(1)
  )
  const [knowledgeView, setKnowledgeView] = useQueryState(
    'knowledge_view',
    parseAsStringEnum([...knowledgeViews]).withDefault('configuration')
  )
  const sectionValue = (section || 'memory') as DataSection
  const knowledgeViewValue = (knowledgeView || 'configuration') as KnowledgeView
  const page = Math.max(1, pageQuery || 1)
  const [databaseIds, setDatabaseIds] = useState<string[]>([])
  const [databaseLoading, setDatabaseLoading] = useState(true)
  const [databaseError, setDatabaseError] = useState<string | null>(null)
  const [result, setResult] = useState<ReadOnlyRecordPage | null>(null)
  const [knowledgeConfig, setKnowledgeConfig] = useState<Record<string, unknown> | null>(null)
  const [knowledgeContent, setKnowledgeContent] = useState<ReadOnlyRecordPage | null>(null)
  const [knowledgeContentLoading, setKnowledgeContentLoading] = useState(false)
  const [knowledgeContentError, setKnowledgeContentError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchType, setSearchType] = useState<KnowledgeSearchType>('vector')
  const [maxResults, setMaxResults] = useState(10)
  const [vectorDbId, setVectorDbId] = useState('')
  const [searchRequest, setSearchRequest] = useState<KnowledgeSearchRequest | null>(null)
  const [searchResult, setSearchResult] = useState<ReadOnlyRecordPage | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!isEndpointActive) {
      setDatabaseIds([])
      setDatabaseError(null)
      setDatabaseLoading(false)
      setKnowledgeConfig(null)
      setKnowledgeContent(null)
      setSearchRequest(null)
      setSearchResult(null)
      return
    }
    const controller = new AbortController()
    setDatabaseLoading(true)
    setDatabaseError(null)
    getSessionDatabaseOptionsAPI(selectedEndpoint, authToken, controller.signal)
      .then((ids) => {
        if (!controller.signal.aborted) setDatabaseIds(ids)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setDatabaseError(reason instanceof Error ? reason.message : 'Unable to load databases.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setDatabaseLoading(false)
      })
    return () => controller.abort()
  }, [selectedEndpoint, authToken, isEndpointActive, refreshKey])

  useEffect(() => {
    if (!isEndpointActive) {
      setLoading(false)
      setError(null)
      setResult(null)
      setKnowledgeConfig(null)
      setKnowledgeContent(null)
      setKnowledgeContentError(null)
      setSearchResult(null)
      setSearchError(null)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setResult(null)
    setKnowledgeConfig(null)
    const request =
      sectionValue === 'knowledge'
        ? getKnowledgeConfigAPI(selectedEndpoint, dbId || undefined, authToken, controller.signal).then(
            (config) => {
              if (!controller.signal.aborted) setKnowledgeConfig(config)
            }
          )
        : (sectionValue === 'memory'
            ? getMemoriesAPI(selectedEndpoint, dbId || undefined, page, authToken, controller.signal)
            : getLearningsAPI(selectedEndpoint, dbId || undefined, page, authToken, controller.signal)
          ).then((pageResult) => {
            if (!controller.signal.aborted) setResult(pageResult)
          })

    request
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : `Unable to load ${sectionLabels[sectionValue]}.`)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [selectedEndpoint, authToken, isEndpointActive, sectionValue, dbId, page, refreshKey])

  useEffect(() => {
    if (
      !isEndpointActive ||
      sectionValue !== 'knowledge' ||
      knowledgeViewValue !== 'content'
    ) {
      setKnowledgeContentLoading(false)
      return
    }

    const controller = new AbortController()
    setKnowledgeContentLoading(true)
    setKnowledgeContentError(null)
    setKnowledgeContent(null)
    getKnowledgeContentAPI(selectedEndpoint, dbId || undefined, page, authToken, controller.signal)
      .then((pageResult) => {
        if (!controller.signal.aborted) setKnowledgeContent(pageResult)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setKnowledgeContentError(
            reason instanceof Error ? reason.message : 'Unable to load Knowledge content.'
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setKnowledgeContentLoading(false)
      })

    return () => controller.abort()
  }, [
    selectedEndpoint,
    authToken,
    isEndpointActive,
    sectionValue,
    knowledgeViewValue,
    dbId,
    page,
    refreshKey
  ])

  useEffect(() => {
    if (
      !isEndpointActive ||
      sectionValue !== 'knowledge' ||
      knowledgeViewValue !== 'search' ||
      !searchRequest
    ) {
      setSearchLoading(false)
      return
    }

    const controller = new AbortController()
    setSearchLoading(true)
    setSearchError(null)
    setSearchResult(null)
    searchKnowledgeAPI(
      selectedEndpoint,
      {
        query: searchRequest.query,
        dbId: dbId || undefined,
        vectorDbId: vectorDbId || undefined,
        searchType: searchRequest.searchType,
        maxResults: searchRequest.maxResults
      },
      authToken,
      controller.signal
    )
      .then((pageResult) => {
        if (!controller.signal.aborted) setSearchResult(pageResult)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setSearchError(reason instanceof Error ? reason.message : 'Unable to search Knowledge.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearchLoading(false)
      })

    return () => controller.abort()
  }, [
    selectedEndpoint,
    authToken,
    isEndpointActive,
    sectionValue,
    knowledgeViewValue,
    dbId,
    vectorDbId,
    searchRequest,
    refreshKey
  ])

  const chooseSection = (next: DataSection) => {
    void setSection(next)
    void setPageQuery(1)
  }

  const chooseDatabase = (next: string) => {
    void setDbId(next || null)
    void setPageQuery(1)
    setVectorDbId('')
    setSearchRequest(null)
    setSearchResult(null)
    setSearchError(null)
  }

  const chooseKnowledgeView = (next: KnowledgeView) => {
    void setKnowledgeView(next)
    void setPageQuery(1)
    setKnowledgeContentError(null)
  }

  const submitKnowledgeSearch = () => {
    const query = searchQuery.trim()
    if (!query) return
    setSearchRequest((current) => ({
      query,
      searchType,
      maxResults,
      requestId: (current?.requestId ?? 0) + 1
    }))
  }

  const retryKnowledgeSearch = () => {
    setSearchRequest((current) =>
      current ? { ...current, requestId: current.requestId + 1 } : null
    )
  }

  return (
    <main className="m-1.5 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/10 px-5 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Database className="size-5 shrink-0 text-primary" />
            <h1 className="break-words text-lg font-medium text-primary">
              Knowledge, Memory &amp; Learnings
            </h1>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted">
            Inspect read-only AgentOS data and its configured Knowledge sources.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRefreshKey((current) => current + 1)}
        >
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
      </header>

      {!isEndpointActive ? (
        <div className="flex min-h-48 flex-1 items-center justify-center px-5 text-center text-sm text-muted">
          Connect to AgentOS to browse Knowledge, Memory and Learnings.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid min-w-0 grid-cols-1 gap-4 p-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
            <aside className="min-w-0 space-y-4 rounded-xl border border-primary/10 bg-primaryAccent/30 p-4">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Data type</div>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  {dataSections.map((item) => {
                    const ItemIcon = sectionIcons[item]
                    return (
                      <Button
                        key={item}
                        type="button"
                        variant="ghost"
                        aria-pressed={sectionValue === item}
                        onClick={() => chooseSection(item)}
                        className={`justify-start rounded-lg text-xs uppercase ${sectionValue === item ? 'bg-accent text-primary' : 'text-muted'}`}
                      >
                        <ItemIcon className="size-4" />
                        {sectionLabels[item]}
                      </Button>
                    )
                  })}
                </div>
              </div>

              <label className="block text-[11px] font-medium uppercase tracking-wide text-muted">
                Database
                <select
                  value={dbId || ''}
                  disabled={databaseLoading}
                  onChange={(event) => chooseDatabase(event.target.value)}
                  className="mt-2 h-10 w-full min-w-0 rounded-lg border border-primary/15 bg-background px-3 text-sm normal-case text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">AgentOS default</option>
                  {databaseIds.map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
              </label>
              <p className="-mt-2 text-[10px] leading-4 text-muted">
                Memory and Learning requests use this database and page selection.
              </p>
              {databaseError && (
                <p role="status" className="break-words text-[10px] text-muted">
                  Database list unavailable; AgentOS default remains usable. {databaseError}
                </p>
              )}
            </aside>

            <section className="min-w-0 rounded-xl border border-primary/10 p-4 sm:p-5">
              {sectionValue === 'knowledge' ? (
                loading ? (
                  <div className="py-10 text-center text-sm text-muted">Loading Knowledge…</div>
                ) : (
                  <KnowledgePanel
                    config={knowledgeConfig}
                    configError={error}
                    onRetryConfig={() => setRefreshKey((current) => current + 1)}
                    view={knowledgeViewValue}
                    onViewChange={chooseKnowledgeView}
                    content={knowledgeContent}
                    contentLoading={knowledgeContentLoading}
                    contentError={knowledgeContentError}
                    page={page}
                    onPageChange={(next) => void setPageQuery(next)}
                    onRetryContent={() => setRefreshKey((current) => current + 1)}
                    searchQuery={searchQuery}
                    onSearchQueryChange={setSearchQuery}
                    searchType={searchType}
                    onSearchTypeChange={setSearchType}
                    maxResults={maxResults}
                    onMaxResultsChange={setMaxResults}
                    vectorDbId={vectorDbId}
                    onVectorDbChange={setVectorDbId}
                    searchResult={searchResult}
                    searchLoading={searchLoading}
                    searchError={searchError}
                    onSearch={submitKnowledgeSearch}
                    onRetrySearch={retryKnowledgeSearch}
                  />
                )
              ) : loading ? (
                <div className="py-10 text-center text-sm text-muted">
                  Loading {sectionLabels[sectionValue]}…
                </div>
              ) : error ? (
                <ErrorPanel message={error} onRetry={() => setRefreshKey((current) => current + 1)} />
              ) : result ? (
                <RecordPage
                  section={sectionValue}
                  result={result}
                  page={page}
                  onPageChange={(next) => void setPageQuery(next)}
                />
              ) : (
                <div className="py-10 text-center text-sm text-muted">
                  No {sectionLabels[sectionValue]} records were returned.
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </main>
  )
}

export default DataExplorer
