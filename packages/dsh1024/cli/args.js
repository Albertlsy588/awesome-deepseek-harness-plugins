import { DEFAULT_PROFILE, SELF_PACKAGE_NAME, SELF_PLUGIN_ID } from './constants.js'

const REPOSITORY_PART_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/
// Anything that names a location rather than a catalog repository. This is a
// hard privacy boundary: such targets are forwarded like any other argument but
// never reported, so an install event can never carry a filesystem path.
const LOCATION_TARGET_PATTERN = /^(?:file:|link:|portal:|https?:|git\+|[.~]|\/|\\|[A-Za-z]:[\\/])/

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
 * @returns `profile` (explicit value or null), `attribution` (null when the
 *   target is not a catalog plugin, so nothing is reported).
 */
export function scanPluginArgs(argv) {
  let profile = null
  let target = null
  let sawAdd = false

  for (let index = 1; index < argv.length; index += 1) {
    const value = argv[index]
    // Everything past the official `--` separator belongs to a deeper tool.
    if (value === '--') break
    if (value === '--profile' || value === '-p') {
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
    if (value.startsWith('-')) continue
    if (!sawAdd) {
      sawAdd = value === 'add'
      continue
    }
    if (target === null) target = value
  }

  return { profile, target, attribution: target === null ? null : attributeTarget(target) }
}

/**
 * Map an official install target to a catalog plugin identity.
 *
 * Targets that cannot be identified are forwarded normally but not reported.
 * Published npm package names other than this CLI's own package currently fall
 * into that group: mapping a package name back to a catalog entry is not
 * defined yet, so those installs run without being counted rather than being
 * attributed to a guess.
 *
 * @returns null when the target cannot be identified as a catalog plugin.
 */
export function attributeTarget(target) {
  if (typeof target !== 'string' || target.length === 0) return null
  if (target === SELF_PACKAGE_NAME) {
    return { pluginId: SELF_PLUGIN_ID, requestedRef: null, knownPackageNames: [SELF_PACKAGE_NAME] }
  }
  if (LOCATION_TARGET_PATTERN.test(target)) return null

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
    pluginId: `${parts[0]}/${parts[1]}`.toLowerCase(),
    requestedRef,
    knownPackageNames: [],
  }
}

/** Profile used to verify and attribute an install when argv omits `--profile`. */
export function telemetryProfile(profile) {
  return profile ?? DEFAULT_PROFILE
}
