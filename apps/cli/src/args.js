import { DEFAULT_PROFILE } from './constants.js'

const PROFILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const REPOSITORY_PART_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/

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

  if (argv[0] !== 'add') {
    throw new UsageError(`unknown command: ${argv[0]}`)
  }

  let profile = DEFAULT_PROFILE
  let repository
  const passthroughArgs = []
  let passthroughOnly = false

  for (let index = 1; index < argv.length; index += 1) {
    const value = argv[index]
    if (passthroughOnly) {
      passthroughArgs.push(value)
      continue
    }
    if (value === '--') {
      if (!repository) throw new UsageError('add requires owner/repository before --')
      passthroughOnly = true
      continue
    }
    if (value === '--profile' || value === '-p') {
      const next = argv[index + 1]
      if (!next) throw new UsageError('--profile requires a value')
      profile = next
      index += 1
      continue
    }
    if (value.startsWith('--profile=')) {
      profile = value.slice('--profile='.length)
      continue
    }
    if (!repository) {
      if (value.startsWith('-')) {
        throw new UsageError('owner/repository must appear before pass-through arguments')
      }
      repository = value
      continue
    }
    passthroughArgs.push(value)
  }

  if (!repository) throw new UsageError('add requires owner/repository')
  if (!PROFILE_PATTERN.test(profile)) {
    throw new UsageError('profile must contain only letters, numbers, dot, underscore, or hyphen (1-64 characters)')
  }

  return { command: 'add', profile, passthroughArgs, ...parseRepository(repository) }
}

function isIdSegment(part) {
  return REPOSITORY_PART_PATTERN.test(part) && part !== '.' && part !== '..'
}

/**
 * Accepts `owner/repository`, the monorepo subpackage form
 * `owner/repository/sub/dir`, and the raw pnpm spec
 * `github:owner/repository#path:sub/dir` (optionally `#ref&path:sub/dir`).
 * The subdirectory becomes pnpm's `#path:` fragment, and the reported plugin
 * id is the full id so telemetry is keyed per plugin rather than per
 * repository.
 */
export function parseRepository(input) {
  let value = input.startsWith('github:') ? input.slice('github:'.length) : input
  const hashIndex = value.indexOf('#')
  const fragment = hashIndex === -1 ? null : value.slice(hashIndex + 1)
  value = hashIndex === -1 ? value : value.slice(0, hashIndex)
  value = value.endsWith('.git') ? value.slice(0, -4) : value

  const segments = value.split('/')
  if (segments.length < 2 || !segments.every(isIdSegment)) {
    throw new UsageError('plugin must use the owner/repository[/sub/dir] form')
  }
  const [owner, repository, ...rest] = segments

  let requestedRef = null
  let fragmentPath = ''
  if (fragment !== null) {
    if (!fragment || fragment.length > 200 || /[\s\x00-\x1f\x7f]/.test(fragment)) {
      throw new UsageError('git ref must be 1-200 characters and contain no whitespace or control characters')
    }
    for (const part of fragment.split('&')) {
      if (part.startsWith('path:')) {
        fragmentPath = part.slice('path:'.length).replace(/^\/+|\/+$/g, '')
      } else if (requestedRef === null && part.length > 0) {
        requestedRef = part
      } else {
        throw new UsageError('plugin spec fragment must be a git ref, path:<sub/dir>, or <ref>&path:<sub/dir>')
      }
    }
  }

  const idPath = rest.join('/')
  if (idPath.length > 0 && fragmentPath.length > 0 && idPath !== fragmentPath) {
    throw new UsageError('plugin subdirectory is declared twice with different values')
  }
  const subPath = idPath.length > 0 ? idPath : fragmentPath
  if (subPath.length > 0 && !subPath.split('/').every(isIdSegment)) {
    throw new UsageError('plugin subdirectory segments must be letters, numbers, dot, underscore, or hyphen')
  }

  const specFragment = [
    ...(requestedRef === null ? [] : [requestedRef]),
    ...(subPath.length === 0 ? [] : [`path:${subPath}`]),
  ]
  const pluginId = subPath.length === 0
    ? `${owner}/${repository}`
    : `${owner}/${repository}/${subPath}`

  return {
    pluginId: pluginId.toLowerCase(),
    requestedRef,
    source: `github:${owner}/${repository}${specFragment.length === 0 ? '' : `#${specFragment.join('&')}`}`,
  }
}
