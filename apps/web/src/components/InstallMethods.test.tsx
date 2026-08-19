// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PluginInstallMethod } from '../../worker/lib/install-methods'
import { I18nProvider } from '../lib/i18n'
import { InstallMethods } from './InstallMethods'

const methods: PluginInstallMethod[] = [
  {
    kind: 'npm',
    spec: '@scope/plugin',
    command: 'dsh plugin --profile web add @scope/plugin',
    verification: 'verified',
    code: 'published_package',
    requiresBuildAllowance: false,
    revision: '1.0.0',
    checkedAt: null,
  },
  {
    kind: 'github',
    spec: 'github:owner/repo',
    command: 'dsh plugin --profile web add --allow-build=@scope/plugin github:owner/repo',
    verification: 'verified',
    code: 'prepare_builds_entry',
    requiresBuildAllowance: true,
    revision: 'abc1234',
    checkedAt: null,
  },
]

describe('InstallMethods', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    window.localStorage.clear()
  })

  it('renders npm first, recommends it once, and preserves the source build grant', () => {
    const container = document.createElement('div')
    document.body.append(container)
    act(() => {
      createRoot(container).render(
        <I18nProvider>
          <InstallMethods methods={methods} pluginId="owner/repo" />
        </I18nProvider>,
      )
    })

    const renderedMethods = [...container.querySelectorAll('.install-method')]
    expect(renderedMethods[0]?.querySelector('.install-method-kind')?.textContent).toBe('npm')
    expect(container.querySelectorAll('.install-option-badge')).toHaveLength(1)
    expect(renderedMethods[1]?.textContent).toContain(
      'dsh1024 plugin --profile web add --allow-build=@scope/plugin github:owner/repo',
    )
  })
})
