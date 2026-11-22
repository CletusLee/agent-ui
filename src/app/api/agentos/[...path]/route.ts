export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{ path: string[] }>
}

const forward = async (request: Request, context: RouteContext) => {
  const configuredEndpoint = process.env.AGENTOS_URL
  if (!configuredEndpoint) {
    return Response.json(
      { detail: 'AgentOS proxy is not configured.' },
      { status: 503 }
    )
  }

  let endpoint: URL
  try {
    endpoint = new URL(configuredEndpoint)
  } catch {
    return Response.json(
      { detail: 'AgentOS proxy endpoint is invalid.' },
      { status: 503 }
    )
  }

  if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
    return Response.json(
      { detail: 'AgentOS proxy endpoint must use HTTP or HTTPS.' },
      { status: 503 }
    )
  }

  const { path } = await context.params
  if (!path?.length || path.some((segment) => segment === '.' || segment === '..')) {
    return Response.json({ detail: 'Invalid AgentOS API path.' }, { status: 400 })
  }

  const incomingUrl = new URL(request.url)
  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join('/')
  const basePath = endpoint.pathname.replace(/\/+$/, '')
  endpoint.pathname = `${basePath}/${encodedPath}`
  endpoint.search = incomingUrl.search

  const headers = new Headers()
  for (const name of ['accept', 'authorization', 'content-type']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }

  const method = request.method.toUpperCase()
  const body = method === 'POST' ? await request.arrayBuffer() : undefined

  try {
    const upstream = await fetch(endpoint, {
      method,
      headers,
      body,
      cache: 'no-store',
      redirect: 'manual',
      signal: request.signal
    })

    const responseHeaders = new Headers()
    for (const name of ['content-type', 'cache-control', 'retry-after']) {
      const value = upstream.headers.get(name)
      if (value) responseHeaders.set(name, value)
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders
    })
  } catch {
    return Response.json(
      { detail: 'AgentOS request could not be reached from the UI server.' },
      { status: 502 }
    )
  }
}

export const GET = forward
export const POST = forward
export const DELETE = forward
