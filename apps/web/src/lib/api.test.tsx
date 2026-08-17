import { describe, expect, it } from 'vitest'
import { pluginListIdentity, repositoryInstallTarget } from './api'

describe('plugin list identity', () => {
  it('gives discovered monorepo siblings distinct titles', () => {
    expect(pluginListIdentity({
      id: 'zhu1090093659/dsh-web-ui/packages/dsh-aionui-panel',
      name: 'dsh-web-ui',
      owner: 'zhu1090093659',
    })).toEqual({
      displayName: 'dsh-aionui-panel',
      sourceLabel: 'zhu1090093659 / dsh-web-ui',
    })
    expect(pluginListIdentity({
      id: 'zhu1090093659/dsh-web-ui/packages/dsh-web-ui-all',
      name: 'dsh-web-ui',
      owner: 'zhu1090093659',
    })).toEqual({
      displayName: 'dsh-web-ui-all',
      sourceLabel: 'zhu1090093659 / dsh-web-ui',
    })
  })

  it('keeps repository plugins and already-specific package names unchanged', () => {
    expect(pluginListIdentity({
      id: 'owner/repository',
      name: 'repository',
      owner: 'owner',
    })).toEqual({ displayName: 'repository', sourceLabel: 'owner' })
    expect(pluginListIdentity({
      id: 'owner/repository/packages/plugin',
      name: 'specific-plugin-name',
      owner: 'owner',
    })).toEqual({
      displayName: 'specific-plugin-name',
      sourceLabel: 'owner / repository',
    })
  })
})

describe('repository install target', () => {
  const plugin = (id: string) => ({ id })

  it('offers no command when a repository only publishes subdirectories', () => {
    // `dsh plugin add github:owner/repo` would install the repository root,
    // which in this shape carries no bundle at all.
    expect(repositoryInstallTarget([
      plugin('owner/mono/packages/pet'),
      plugin('owner/mono/packages/ssh'),
    ])).toBeUndefined()
  })

  it('offers the root plugin when the repository is itself installable', () => {
    expect(repositoryInstallTarget([
      plugin('owner/mono/packages/pet'),
      plugin('owner/mono'),
      plugin('owner/mono/packages/ssh'),
    ])).toEqual(plugin('owner/mono'))
  })

  it('ignores an id no plugin id grammar accepts', () => {
    expect(repositoryInstallTarget([plugin('not-an-id')])).toBeUndefined()
  })
})
