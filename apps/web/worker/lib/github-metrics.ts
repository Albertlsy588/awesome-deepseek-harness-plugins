import type { RegistryPlugin, RepositoryMetric } from '../types'
import { repositoryName } from './catalog'

const GRAPHQL_URL = 'https://api.github.com/graphql'
const SEARCH_URL = 'https://api.github.com/search/repositories'
const GRAPHQL_BATCH_SIZE = 80

type MetricMap = Map<string, RepositoryMetric>
type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

export function metricKey(plugin: Pick<RegistryPlugin, 'owner' | 'name' | 'url'>): string {
  return `${plugin.owner}/${repositoryName(plugin)}`.toLocaleLowerCase()
}

function githubHeaders(token?: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'dsh-1024store-worker',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function parseGraphMetric(value: unknown): RepositoryMetric | null {
  if (!isObject(value)) return null
  const releases = isObject(value.releases) ? value.releases : null
  const nodes = releases && Array.isArray(releases.nodes) ? releases.nodes : []
  const latestRelease = nodes.length > 0 && isObject(nodes[0]) ? nullableString(nodes[0].publishedAt) : null
  return {
    stars: nullableNumber(value.stargazerCount),
    forks: nullableNumber(value.forkCount),
    pushedAt: nullableString(value.pushedAt),
    updatedAt: nullableString(value.updatedAt),
    latestReleaseAt: latestRelease,
  }
}

async function fetchGraphMetrics(
  plugins: RegistryPlugin[],
  token: string,
  fetcher: typeof fetch,
): Promise<MetricMap> {
  const metrics: MetricMap = new Map()

  for (let offset = 0; offset < plugins.length; offset += GRAPHQL_BATCH_SIZE) {
    const batch = plugins.slice(offset, offset + GRAPHQL_BATCH_SIZE)
    const fields = batch
      .map(
        (plugin, index) => `r${index}: repository(owner: ${JSON.stringify(plugin.owner)}, name: ${JSON.stringify(repositoryName(plugin))}) {
          stargazerCount
          forkCount
          pushedAt
          updatedAt
          releases(first: 1, orderBy: { field: CREATED_AT, direction: DESC }) {
            nodes { publishedAt }
          }
        }`,
      )
      .join('\n')

    const response = await fetcher(GRAPHQL_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(12_000),
      headers: {
        ...githubHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: `query Dsh1024StoreCatalog { ${fields} }` }),
    })
    if (!response.ok) throw new Error(`GitHub GraphQL returned HTTP ${response.status}`)

    const payload: unknown = await response.json()
    if (!isObject(payload)) throw new Error('GitHub GraphQL returned invalid JSON')
    const errors = Array.isArray(payload.errors) ? payload.errors : []
    // GraphQL reports a repository that was deleted, renamed or made private as
    // a NOT_FOUND entry in `errors` while `data` still carries every other
    // repository in the batch. Throwing on any error at all threw away the
    // eighty repositories that answered along with the one that did not, so a
    // single dead repository blanked the star counts of a whole batch.
    //
    // No `data` at all means nothing came back to salvage. With errors attached
    // that is a rate limit or a rejected token, and the batches queued behind it
    // would fare no better, so the sweep stops. Without them the response is
    // merely malformed, and skipping the batch costs eighty repositories rather
    // than every one of them — the caller turns a throw into an empty result.
    if (!isObject(payload.data)) {
      if (errors.length > 0) throw new Error('GitHub GraphQL returned query errors')
      continue
    }
    if (errors.length > 0) {
      console.warn(
        JSON.stringify({
          message: 'github_metrics_partial_batch',
          errors: errors.length,
          repositories: batch.length,
        }),
      )
    }
    const data = payload.data
    batch.forEach((plugin, index) => {
      const metric = parseGraphMetric(data[`r${index}`])
      if (metric) metrics.set(metricKey(plugin), metric)
    })
  }

  return metrics
}

function parseSearchItem(value: unknown): { key: string; metric: RepositoryMetric } | null {
  if (!isObject(value)) return null
  const fullName = nullableString(value.full_name)
  if (!fullName) return null
  return {
    key: fullName.toLocaleLowerCase(),
    metric: {
      stars: nullableNumber(value.stargazers_count),
      forks: nullableNumber(value.forks_count),
      pushedAt: nullableString(value.pushed_at),
      updatedAt: nullableString(value.updated_at),
      latestReleaseAt: null,
    },
  }
}

async function fetchSearchMetrics(
  plugins: RegistryPlugin[],
  fetcher: typeof fetch,
): Promise<MetricMap> {
  const curatedKeys = new Set(plugins.map(metricKey))
  const query = 'topic:dsh-plugin fork:false archived:false'
  const urls = [
    `${SEARCH_URL}?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=100&page=1`,
    `${SEARCH_URL}?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=100&page=1`,
  ]
  const responses = await Promise.all(
    urls.map((url) => fetcher(url, {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(12_000),
    })),
  )
  const metrics: MetricMap = new Map()

  for (const response of responses) {
    if (!response.ok) continue
    const payload: unknown = await response.json()
    if (!isObject(payload) || !Array.isArray(payload.items)) continue
    for (const item of payload.items) {
      const parsed = parseSearchItem(item)
      if (parsed && curatedKeys.has(parsed.key)) metrics.set(parsed.key, parsed.metric)
    }
  }

  return metrics
}

export async function fetchGitHubMetrics(
  plugins: RegistryPlugin[],
  token: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<MetricMap> {
  // Metrics are repository facts keyed by owner/repository, so monorepo
  // siblings must not each contribute a duplicate GraphQL repository() field.
  const byRepository = new Map<string, RegistryPlugin>()
  for (const plugin of plugins) {
    const key = metricKey(plugin)
    if (!byRepository.has(key)) byRepository.set(key, plugin)
  }
  const unique = [...byRepository.values()]
  try {
    return token
      ? await fetchGraphMetrics(unique, token, fetcher)
      : await fetchSearchMetrics(unique, fetcher)
  } catch (error) {
    console.error(
      JSON.stringify({
        message: 'github_metrics_refresh_failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    return new Map()
  }
}
