import generatedRegistry from '../data/registry.generated.json'
import type { Registry, RegistryPlugin, RegistryResult } from '../types'

function isTextMap(value: unknown): value is { en: string; zh: string } {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.en === 'string' && typeof item.zh === 'string'
}

function isPlugin(value: unknown): value is RegistryPlugin {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.name === 'string' &&
    typeof item.owner === 'string' &&
    typeof item.url === 'string' &&
    typeof item.category === 'string' &&
    isTextMap(item.description) &&
    typeof item.install === 'string' &&
    typeof item.added === 'string'
  )
}

export function isRegistry(value: unknown): value is Registry {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (
    typeof item.updated !== 'string' ||
    typeof item.count !== 'number' ||
    typeof item.revision !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(item.revision) ||
    !item.categories ||
    typeof item.categories !== 'object' ||
    !Array.isArray(item.plugins) ||
    item.plugins.length === 0
  ) {
    return false
  }

  const categories = item.categories as Record<string, unknown>
  return item.count === item.plugins.length &&
    Object.values(categories).every(isTextMap) &&
    item.plugins.every((plugin) => isPlugin(plugin) && plugin.category in categories)
}

const bundledData: unknown = generatedRegistry
if (!isRegistry(bundledData)) {
  throw new Error('The generated plugin registry does not match the Worker schema')
}

export const BUNDLED_REGISTRY: Registry = bundledData

export async function loadRegistry(): Promise<RegistryResult> {
  return { registry: BUNDLED_REGISTRY, source: 'bundled' }
}
