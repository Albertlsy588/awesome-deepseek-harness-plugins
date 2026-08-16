import { SELF_PACKAGE_NAME, SELF_PLUGIN_ID } from './constants.js'

const REPOSITORY_PART_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/
// https://docs.npmjs.com/package-name-guidelines, minus the legacy uppercase forms.
const NPM_NAME_PATTERN = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/
// Anything that names a location rather than a published package or repository.
// This is a hard privacy boundary: such targets are forwarded like any other
// argument but never reported, so an install event can never carry a path.
const LOCATION_TARGET_PATTERN = /^(?:file:|link:|portal:|https?:|git\+|git:|ssh:|[.~]|\/|\\|[A-Za-z]:[\\/])/
// Verbs that write dependencies into the profile manifest. `remove`, `update`,
// `why`, `list`, `link` and friends never produce an install event.
const ADD_VERBS = new Set(['add', 'i', 'install'])
// Flags that install somewhere other than the profile's own dependencies, so
// the profile check would report a phantom failure.
const OFF_PROFILE_FLAGS = new Set([
  '-D', '--save-dev',
  '-O', '--save-optional',
  '--save-peer',
  '-g', '--global',
])

export class UsageError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UsageError'
  }
}

export function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === 'help' || argv[0] === '--help' || argv[0] === '-h') {
    return { command: 'help' }
  }

  if (argv[0] === '--version' || argv[0] === '-v') {
    return { command: 'version' }
  }

  if (argv[0] === 'telemetry') {
    const action = argv[1] ?? 'status'
    if (!['status', 'enable', 'disable', 'reset'].includes(action) || argv.length > 2) {
      throw new UsageError('telemetry action must be status, enable, disable, or reset')
    }
    return { command: 'telemetry', action }
  }

  if (argv[0] !== 'plugin') {
    throw new UsageError(`unknown command: ${argv[0]}`)
  }

  // The wrapper mirrors the official argument surface exactly: everything from
  // `plugin` onwards is forwarded verbatim. The scan below is read-only and only
  // feeds telemetry; it never rewrites, reorders, or defaults anything in argv.
  return { command: 'plugin', officialArgs: [...argv], ...scanPluginArgs(argv) }
}

/**
 * Read-only scan of an official `plugin` argument vector.
 *
 * Every rule here only decides whether an install can be attributed; none of
 * them touches the forwarded arguments. When anything is ambiguous the scan
 * reports nothing, because a missing count is better than a wrong one.
 *
 * @returns `profile` (explicit value or null), `target` (the single install
 *   target or null), and `attribution` (null when nothing may be reported).
 */
export function scanPluginArgs(argv) {
  let profile = null
  let verb = null
  let offProfile = false
  const targets = []

  for (let index = 1; index < argv.length; index += 1) {
    const value = argv[index]
    // Everything past the official `--` separator belongs to a deeper tool.
    if (value === '--') break
    if (value === '--profile') {
      const next = argv[index + 1]
      if (typeof next === 'string' && !next.startsWith('-')) {
        profile = next
        index += 1
      }
      continue
    }
    if (value.startsWith('--profile=')) {
      profile = value.slice('--profile='.length)
      continue
    }
    if (OFF_PROFILE_FLAGS.has(value)) {
      offProfile = true
      continue
    }
    if (value.startsWith('-')) continue
    if (verb === null) {
      verb = value
      continue
    }
    targets.push(value)
  }

  const target = targets.length === 0 ? null : targets[0]
  // A single event carries a single plugin id, the official CLI must have been
  // told which profile to write, and the dependency has to land in that profile.
  const reportable = profile !== null
    && !offProfile
    && verb !== null
    && ADD_VERBS.has(verb)
    && targets.length === 1

  return { profile, target, attribution: reportable ? attributeTarget(target) : null }
}

/** Split a published package spec into its name and optional version/tag/range. */
export function splitPackageSpec(value) {
  const separator = value.lastIndexOf('@')
  if (separator <= 0) return { name: value, version: null }
  return { name: value.slice(0, separator), version: value.slice(separator + 1) }
}

/**
 * Map an official install target to a catalog plugin identity.
 *
 * GitHub shorthands carry their identity in the argument itself. A published
 * package name does not, so it is only recorded here; the plugin id is looked
 * up from the installed package's own manifest once the install succeeds.
 *
 * @returns null when the target may never be reported, `{kind: 'plugin'}` when
 *   the identity is already known, `{kind: 'npm'}` when it needs a lookup.
 */
export function attributeTarget(target) {
  if (typeof target !== 'string' || target.length === 0) return null
  if (LOCATION_TARGET_PATTERN.test(target)) return null

  const { name } = splitPackageSpec(target)
  if (name === SELF_PACKAGE_NAME) {
    return {
      kind: 'plugin',
      pluginId: SELF_PLUGIN_ID,
      requestedRef: null,
      knownPackageNames: [SELF_PACKAGE_NAME],
    }
  }

  const repository = attributeRepositoryTarget(target)
  if (repository !== null) return repository

  // Other hosting shorthands (gitlab:, bitbucket:, gist:), npm aliases
  // (`x@npm:y`), `jsr:`, `workspace:` and `catalog:` all carry a colon and stop
  // here; so does any target with a git ref, which a package name cannot have.
  if (target.includes(':') || target.includes('#')) return null
  if (!NPM_NAME_PATTERN.test(name)) return null
  return { kind: 'npm', packageName: name }
}

function attributeRepositoryTarget(target) {
  let value = target.startsWith('github:') ? target.slice('github:'.length) : target
  if (LOCATION_TARGET_PATTERN.test(value)) return null

  const hashIndex = value.indexOf('#')
  const requestedRef = hashIndex === -1 ? null : value.slice(hashIndex + 1)
  value = hashIndex === -1 ? value : value.slice(0, hashIndex)
  value = value.endsWith('.git') ? value.slice(0, -4) : value

  const parts = value.split('/')
  if (parts.length !== 2 || !parts.every((part) => REPOSITORY_PART_PATTERN.test(part))) return null
  if (requestedRef !== null && (!requestedRef || requestedRef.length > 200 || /[\s\x00-\x1f\x7f]/.test(requestedRef))) {
    return null
  }

  return {
    kind: 'plugin',
    pluginId: `${parts[0]}/${parts[1]}`.toLowerCase(),
    requestedRef,
    knownPackageNames: [],
  }
}

/**
 * Read a catalog plugin id out of a package manifest's `repository` field.
 *
 * Accepts the string and object spellings npm allows, but only github.com
 * hosts. A monorepo `directory` is ignored: the repository root is the identity
 * the catalog uses.
 *
 * @returns the lowercased `owner/repository`, or null when it is not a GitHub
 *   repository, so an unrecognised manifest simply goes uncounted.
 */
export function pluginIdFromRepositoryField(repository) {
  const raw = typeof repository === 'string'
    ? repository
    : (repository !== null && typeof repository === 'object' && typeof repository.url === 'string'
      ? repository.url
      : null)
  if (raw === null) return null

  let value = raw.trim()
  if (value.startsWith('github:')) return repositoryPathToPluginId(value.slice('github:'.length))

  value = value.startsWith('git+') ? value.slice('git+'.length) : value

  // scp-style: git@github.com:owner/repository.git
  const scp = /^[A-Za-z0-9_.-]+@([^:/]+):(.+)$/.exec(value)
  if (scp !== null) {
    return isGitHubHost(scp[1]) ? repositoryPathToPluginId(scp[2]) : null
  }

  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (!['http:', 'https:', 'git:', 'ssh:'].includes(url.protocol)) return null
  if (!isGitHubHost(url.hostname)) return null
  return repositoryPathToPluginId(url.pathname)
}

function isGitHubHost(hostname) {
  const host = hostname.toLowerCase()
  return host === 'github.com' || host === 'www.github.com'
}

function repositoryPathToPluginId(path) {
  let value = path.split('#', 1)[0].replace(/^\/+/, '').replace(/\/+$/, '')
  value = value.endsWith('.git') ? value.slice(0, -4) : value
  const parts = value.split('/')
  if (parts.length !== 2 || !parts.every((part) => REPOSITORY_PART_PATTERN.test(part))) return null
  return `${parts[0]}/${parts[1]}`.toLowerCase()
}
