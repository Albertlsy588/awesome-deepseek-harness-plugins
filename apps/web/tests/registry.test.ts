import { describe, expect, it } from 'vitest'
import { BUNDLED_REGISTRY, isRegistry, loadRegistry } from '../worker/lib/registry'

describe('registry loading', () => {
  it('accepts the expected registry schema', () => {
    expect(isRegistry(BUNDLED_REGISTRY)).toBe(true)
    expect(BUNDLED_REGISTRY.count).toBeGreaterThan(0)
    expect(BUNDLED_REGISTRY.plugins).toHaveLength(BUNDLED_REGISTRY.count)
    expect(BUNDLED_REGISTRY.revision).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(isRegistry({ ...BUNDLED_REGISTRY, count: 1 })).toBe(false)
  })

  it('loads the generated catalog without an outbound registry request', async () => {
    const first = await loadRegistry()
    const second = await loadRegistry()

    expect(first.source).toBe('bundled')
    expect(second.source).toBe('bundled')
    expect(first.registry).toBe(BUNDLED_REGISTRY)
  })
})
