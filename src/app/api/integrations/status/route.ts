export const dynamic = 'force-dynamic'

const probes = [
  { id: 'langfuse', url: 'http://langfuse-web:3000/api/public/health' },
  { id: 'gateway', url: 'http://agno-gateway:8080/health' },
  { id: 'backstage', url: 'http://backstage:7007/healthcheck' }
] as const

export async function GET() {
  const checks = await Promise.all(probes.map(async ({ id, url }) => {
    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000)
      })
      await response.body?.cancel()
      return { id, httpStatus: response.status, checkedAt: new Date().toISOString() }
    } catch {
      return { id, error: 'Health endpoint request failed.', checkedAt: new Date().toISOString() }
    }
  }))

  return Response.json(checks, {
    headers: { 'Cache-Control': 'no-store' }
  })
}
