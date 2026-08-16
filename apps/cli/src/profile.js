import { join } from 'node:path'
import { readJson } from './files.js'

function normalizeBundles(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (typeof entry === 'string') return [entry]
      if (entry && typeof entry === 'object' && typeof entry.name === 'string') return [entry.name]
      return []
    })
  }
  if (value && typeof value === 'object') return Object.keys(value)
  return []
}

async function readInstalledVersion(profileDirectory, packageName) {
  const safeParts = packageName.split('/')
  if (!safeParts.every((part) => /^[A-Za-z0-9_.@-]+$/.test(part))) return null
  const manifest = await readJson(join(profileDirectory, 'node_modules', ...safeParts, 'package.json'), null)
  return typeof manifest?.version === 'string' ? manifest.version : null
}

export async function readProfileState(dshHome, profile) {
  const profileDirectory = join(dshHome, 'profiles', profile)
  const manifest = await readJson(join(profileDirectory, 'package.json'), null)
  const dependencies = manifest?.dependencies && typeof manifest.dependencies === 'object'
    ? Object.fromEntries(Object.entries(manifest.dependencies).filter(([, spec]) => typeof spec === 'string'))
    : {}
  const bundles = normalizeBundles(manifest?.dsh?.profile?.bundles)
  const installedVersions = {}

  await Promise.all(Object.keys(dependencies).map(async (packageName) => {
    installedVersions[packageName] = await readInstalledVersion(profileDirectory, packageName)
  }))

  return { exists: Boolean(manifest), profileDirectory, dependencies, bundles, installedVersions }
}

function dependencyMatchesPlugin(spec, pluginId) {
  const normalized = spec.toLowerCase().replaceAll('\\', '/')
  const segments = pluginId.toLowerCase().split('/')
  const repository = segments.slice(0, 2).join('/')
  if (!normalized.includes(repository) && !normalized.includes(`github.com/${repository}`)) {
    return false
  }
  // Monorepo siblings share a repository, so the spec's `path:` fragment is
  // what tells them apart. A repository-root plugin (no path) must likewise not
  // match a dependency installed from one of its subdirectories.
  const specPath = (/[#&]path:\/*([^&]*)/.exec(normalized)?.[1] ?? '').replace(/\/+$/, '')
  return specPath === segments.slice(2).join('/')
}

function receiptNamesPresent(state, receipt) {
  return (receipt?.packageNames ?? []).some((name) => name in state.dependencies || state.bundles.includes(name))
}

export function inspectInstallation(before, after, pluginId, previousReceipt = null) {
  const beforeMatches = Object.entries(before.dependencies)
    .filter(([, spec]) => dependencyMatchesPlugin(spec, pluginId))
    .map(([name]) => name)
  const afterMatches = Object.entries(after.dependencies)
    .filter(([, spec]) => dependencyMatchesPlugin(spec, pluginId))
    .map(([name]) => name)
  const changed = Object.keys(after.dependencies)
    .filter((name) => before.dependencies[name] !== after.dependencies[name])
  const changedBundles = changed.filter((name) => after.bundles.includes(name))
  const receiptMatches = (previousReceipt?.packageNames ?? [])
    .filter((name) => name in after.dependencies || after.bundles.includes(name))
  const packageNames = [...new Set([...afterMatches, ...changedBundles, ...receiptMatches])].sort()
  const beforePresent = beforeMatches.length > 0 || receiptNamesPresent(before, previousReceipt)
  const afterPresent = after.exists && packageNames.length > 0

  return {
    beforePresent,
    afterPresent,
    packageNames,
    beforeVersion: selectVersion(before, [...beforeMatches, ...(previousReceipt?.packageNames ?? [])]),
    afterVersion: selectVersion(after, packageNames),
  }
}

function selectVersion(state, names) {
  for (const name of names) {
    const version = state.installedVersions[name]
    if (version) return version.slice(0, 128)
  }
  for (const name of names) {
    const spec = state.dependencies[name]
    if (spec) return spec.slice(0, 128)
  }
  return null
}

export function createReceipt({ previousReceipt, pluginId, profile, source, packageNames, state, completedAt }) {
  const packages = Object.fromEntries(packageNames.map((name) => [name, {
    requested: state.dependencies[name] ?? null,
    version: state.installedVersions[name] ?? null,
  }]))
  return {
    pluginId,
    profile,
    source,
    packageNames,
    packages,
    firstInstalledAt: previousReceipt?.firstInstalledAt ?? completedAt,
    lastInstalledAt: completedAt,
    installCount: (previousReceipt?.installCount ?? 0) + 1,
  }
}
