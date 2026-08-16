import { describe, expect, it } from 'vitest'
import {
  installSpec,
  officialInstallCommand,
  SELF_OFFICIAL_COMMAND,
  SELF_TRACKED_COMMAND,
  trackedInstallCommand,
} from './api'

describe('install command generation', () => {
  it('derives the spec from the plugin id, not the repository url', () => {
    // A monorepo subpackage's url is its repository root, so anything derived
    // from the url would install the wrong package.
    const plugin = { id: 'owner/mono/packages/foo' }
    expect(installSpec(plugin)).toBe('github:owner/mono#path:packages/foo')
    expect(trackedInstallCommand(plugin)).toBe(
      'dsh1024 plugin --profile web add github:owner/mono#path:packages/foo',
    )
    expect(officialInstallCommand(plugin)).toBe(
      'dsh plugin --profile web add github:owner/mono#path:packages/foo',
    )
  })

  it('keeps repository-level plugins on the two-segment spec', () => {
    const plugin = { id: 'owner/plugin' }
    expect(installSpec(plugin)).toBe('github:owner/plugin')
    expect(trackedInstallCommand(plugin)).toBe('dsh1024 plugin --profile web add github:owner/plugin')
  })

  it('gives sibling plugins distinct commands', () => {
    expect(installSpec({ id: 'owner/mono/packages/foo' }))
      .not.toBe(installSpec({ id: 'owner/mono/packages/bar' }))
  })

  it('uses the published package for the store itself', () => {
    const plugin = { id: 'imsai-sh/awesome-deepseek-harness-plugins' }
    expect(trackedInstallCommand(plugin)).toBe(SELF_TRACKED_COMMAND)
    expect(officialInstallCommand(plugin)).toBe(SELF_OFFICIAL_COMMAND)
  })
})
