/**
 * npm side of install verification.
 *
 * The catalog only recommends an npm package when it can be tied back to the
 * plugin's own source. A name that merely exists on the registry is not
 * evidence — anyone can publish `dsh-foo` — so the binding is checked against
 * the package's own `repository` field, which is the only claim the publisher
 * makes about where the code came from.
 */

import { classifyNpmBinding, type NpmBinding } from './install-methods'

const REGISTRY_ORIGIN = 'https://registry.npmjs.org'
const REQUEST_TIMEOUT_MS = 10_000
const USER_AGENT = 'dsh-1024store-catalog-verification (+https://deepseek1024.com)'

export interface NpmProbeResult {
  status: 'found' | 'absent' | 'error'
  httpStatus: number | null
  version: string | null
  repositoryUrl: string | null
  repositoryDirectory: string | null
  bundleDeclared: boolean
  entryPoint: string | null
  tarballUrl: string | null
  integrity: string | null
  binding: NpmBinding
}

function unresolved(status: 'absent' | 'error', httpStatus: number | null): NpmProbeResult {
  return {
    status,
    httpStatus,
    version: null,
    repositoryUrl: null,
    repositoryDirectory: null,
    bundleDeclared: false,
    entryPoint: null,
    tarballUrl: null,
    integrity: null,
    // 'absent' is a fact (nobody published it); 'error' is ignorance, and the
    // caller must not overwrite a good binding with it.
    binding: status === 'absent' ? 'absent' : 'unknown',
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * Reads the published manifest of a package's `latest` tag.
 *
 * `/<name>/latest` returns only that version's manifest — a few KB against
 * megabytes for the full packument, which matters when several thousand
 * plugins are refreshed on a cron. Scoped names must keep their slash encoded.
 *
 * @param id - the plugin id the package claims to belong to.
 * @param packageName - the name declared by the plugin's own manifest.
 */
export async function probeNpmPackage(
  id: string,
  packageName: string,
  fetcher: typeof fetch = fetch,
): Promise<NpmProbeResult> {
  const encoded = packageName.startsWith('@')
    ? `@${encodeURIComponent(packageName.slice(1)).replace('%2F', '/')}`.replace('/', '%2f')
    : encodeURIComponent(packageName)
  let response: Response
  try {
    response = await fetcher(`${REGISTRY_ORIGIN}/${encoded}/latest`, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    return unresolved('error', null)
  }
  if (response.status === 404) return unresolved('absent', 404)
  if (!response.ok) return unresolved('error', response.status)

  let published: Record<string, unknown>
  try {
    published = (await response.json()) as Record<string, unknown>
  } catch {
    return unresolved('error', response.status)
  }

  const { binding, bundleDeclared } = classifyNpmBinding(id, published)
  const repositoryField = published.repository
  const repository = typeof repositoryField === 'string'
    ? { url: repositoryField, directory: undefined as unknown }
    : (repositoryField as { url?: unknown; directory?: unknown } | null) ?? {}
  const dist = (published.dist as { tarball?: unknown; integrity?: unknown } | null) ?? {}

  return {
    status: 'found',
    httpStatus: response.status,
    version: text(published.version),
    repositoryUrl: text(repository.url),
    repositoryDirectory: text(repository.directory),
    bundleDeclared,
    entryPoint: text(published.main),
    tarballUrl: text(dist.tarball),
    integrity: text(dist.integrity),
    binding,
  }
}
