import { DEFAULT_PROFILE, SELF_PACKAGE_NAME, SELF_PLUGIN_ID } from './constants.js'

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

  if (argv[0] === 'store') {
    return parseStore(argv)
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

function parseStore(argv) {
  let profile = DEFAULT_PROFILE
  const passthroughArgs = []
  let passthroughOnly = false

  for (let index = 1; index < argv.length; index += 1) {
    const value = argv[index]
    if (passthroughOnly) {
      passthroughArgs.push(value)
      continue
    }
    if (value === '--') {
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
    throw new UsageError('store accepts only --profile; put official CLI arguments after --')
  }

  if (!PROFILE_PATTERN.test(profile)) {
    throw new UsageError('profile must contain only letters, numbers, dot, underscore, or hyphen (1-64 characters)')
  }

  return {
    command: 'add',
    profile,
    passthroughArgs,
    pluginId: SELF_PLUGIN_ID,
    requestedRef: null,
    source: SELF_PACKAGE_NAME,
    knownPackageNames: [SELF_PACKAGE_NAME],
  }
}

export function parseRepository(input) {
  let value = input.startsWith('github:') ? input.slice('github:'.length) : input
  const hashIndex = value.indexOf('#')
  const requestedRef = hashIndex === -1 ? null : value.slice(hashIndex + 1)
  value = hashIndex === -1 ? value : value.slice(0, hashIndex)
  value = value.endsWith('.git') ? value.slice(0, -4) : value

  const parts = value.split('/')
  if (parts.length !== 2 || !parts.every((part) => REPOSITORY_PART_PATTERN.test(part))) {
    throw new UsageError('plugin must use the owner/repository form')
  }
  if (requestedRef !== null && (!requestedRef || requestedRef.length > 200 || /[\s\x00-\x1f\x7f]/.test(requestedRef))) {
    throw new UsageError('git ref must be 1-200 characters and contain no whitespace or control characters')
  }

  return {
    pluginId: `${parts[0]}/${parts[1]}`.toLowerCase(),
    requestedRef,
    source: `github:${parts[0]}/${parts[1]}${requestedRef ? `#${requestedRef}` : ''}`,
  }
}
