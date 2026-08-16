import { describe, expect, it } from 'vitest'
import {
  classifyNpmBinding,
  deriveInstallMethods,
  gitVerification,
  NO_ENTRY_DECLARED_VERIFICATION,
  type GitInstallCode,
} from '../worker/lib/install-methods'

const GITHUB_ONLY = { packageName: null, binding: 'absent', bundleDeclared: false } as const

describe('install method verdicts', () => {
  it('maps every git outcome to a verification state', () => {
    const expected: Record<GitInstallCode, string> = {
      entry_committed: 'verified',
      prepare_builds_entry: 'verified',
      no_entry_declared: NO_ENTRY_DECLARED_VERIFICATION,
      entry_missing_no_prepare: 'unverified',
      entry_outside_repository: 'unverified',
      manifest_missing: 'unverified',
      entry_unresolved: 'unknown',
      tree_truncated: 'unknown',
      repository_unreachable: 'unknown',
      not_checked: 'unknown',
    }
    for (const [code, verification] of Object.entries(expected)) {
      expect(gitVerification(code as GitInstallCode), code).toBe(verification)
    }
  })

  it('separates the build allowance from the verdict', () => {
    // A committed entry is verified whether or not a prepare script exists, but
    // the allowance flag follows the prepare script alone: pnpm refuses to run
    // it until the user allowlists the package, so the first add fails.
    const [committed] = deriveInstallMethods(
      'owner/repo',
      { code: 'entry_committed', hasPrepare: true },
      null,
    )
    expect(committed).toMatchObject({ verification: 'verified', requiresBuildAllowance: true })

    const [plain] = deriveInstallMethods('owner/repo', { code: 'entry_committed', hasPrepare: false }, null)
    expect(plain).toMatchObject({ verification: 'verified', requiresBuildAllowance: false })
  })

  it('emits a github method carrying the official command', () => {
    const [method] = deriveInstallMethods(
      'owner/repo/packages/foo',
      { code: 'entry_missing_no_prepare', hasPrepare: false },
      null,
    )
    expect(method).toMatchObject({
      kind: 'github',
      spec: 'github:owner/repo#path:packages/foo',
      command: 'dsh plugin --profile web add github:owner/repo#path:packages/foo',
      verification: 'unverified',
      code: 'entry_missing_no_prepare',
    })
  })

  it('offers npm only when the package is tied to this plugin', () => {
    const git = { code: 'entry_missing_no_prepare', hasPrepare: false } as const

    const strict = deriveInstallMethods('owner/repo', git, {
      packageName: '@scope/plugin', binding: 'strict', bundleDeclared: true, version: '1.2.3',
    })
    expect(strict).toHaveLength(2)
    expect(strict[1]).toMatchObject({
      kind: 'npm',
      spec: '@scope/plugin',
      command: 'dsh plugin --profile web add @scope/plugin',
      verification: 'verified',
      code: 'repository_backlink',
      requiresBuildAllowance: false,
      revision: '1.2.3',
    })

    // A name that exists on npm but does not point back here is shown, clearly
    // unverified, so the author knows what to fix.
    const nameOnly = deriveInstallMethods('owner/repo', git, {
      packageName: 'plugin', binding: 'name_only', bundleDeclared: true,
    })
    expect(nameOnly[1]).toMatchObject({ verification: 'unverified', code: 'unlinked_package' })

    // A package pointing at a different repository — or a different directory
    // of the same monorepo — is somebody else's code. Withhold it entirely:
    // printing that command would tell the user to install the wrong package.
    for (const binding of ['mismatch', 'no_bundle', 'absent', 'unknown'] as const) {
      const methods = deriveInstallMethods('owner/repo', git, {
        packageName: 'plugin', binding, bundleDeclared: binding !== 'no_bundle',
      })
      expect(methods.map((m) => m.kind), binding).toEqual(['github'])
    }

    // Declaring no DSH bundle is the same story: same name, not this plugin.
    const noBundle = deriveInstallMethods('owner/repo', git, {
      packageName: 'plugin', binding: 'strict', bundleDeclared: false,
    })
    expect(noBundle.map((m) => m.kind)).toEqual(['github'])
    expect(deriveInstallMethods('owner/repo', git, GITHUB_ONLY).map((m) => m.kind)).toEqual(['github'])
  })
})

describe('npm binding classification', () => {
  const bundle = { bundle: { patch: './cordis.patch.yml' } }

  it('binds a repository-level package by its repository url', () => {
    expect(classifyNpmBinding('Owner/Repo', {
      repository: { url: 'git+https://github.com/Owner/Repo.git' }, dsh: bundle,
    })).toEqual({ binding: 'strict', bundleDeclared: true })

    // Every url form npm accepts normalizes to the same owner/repo.
    for (const url of [
      'https://github.com/Owner/Repo',
      'git://github.com/Owner/Repo.git',
      'git+ssh://git@github.com/Owner/Repo.git',
      'github.com/owner/repo',
    ]) {
      expect(classifyNpmBinding('Owner/Repo', { repository: url, dsh: bundle }).binding, url).toBe('strict')
    }
  })

  it('requires the directory to match exactly for a subpackage', () => {
    const id = 'Owner/Repo/packages/foo'
    expect(classifyNpmBinding(id, {
      repository: { url: 'https://github.com/Owner/Repo', directory: 'packages/foo' }, dsh: bundle,
    }).binding).toBe('strict')
    // Tolerate cosmetic prefixes/suffixes but not a different directory: git
    // paths are case-sensitive, and a sibling is a different plugin.
    expect(classifyNpmBinding(id, {
      repository: { url: 'https://github.com/Owner/Repo', directory: './packages/foo/' }, dsh: bundle,
    }).binding).toBe('strict')
    for (const directory of ['packages/bar', 'packages/Foo', '', undefined]) {
      expect(classifyNpmBinding(id, {
        repository: { url: 'https://github.com/Owner/Repo', directory }, dsh: bundle,
      }).binding, String(directory)).toBe('mismatch')
    }
  })

  it('reports weaker bindings honestly', () => {
    expect(classifyNpmBinding('Owner/Repo', { dsh: bundle }).binding).toBe('name_only')
    expect(classifyNpmBinding('Owner/Repo', {
      repository: { url: 'https://github.com/Attacker/Other' }, dsh: bundle,
    }).binding).toBe('mismatch')
    expect(classifyNpmBinding('Owner/Repo', {
      repository: { url: 'https://github.com/Owner/Repo' },
    })).toEqual({ binding: 'no_bundle', bundleDeclared: false })
    expect(classifyNpmBinding('Owner/Repo', null)).toEqual({ binding: 'absent', bundleDeclared: false })
  })
})
