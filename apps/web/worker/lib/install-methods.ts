/**
 * Install methods and their verification state.
 *
 * A plugin may be installable from GitHub, from npm, or both. Verification is a
 * LABEL, never an admission test: every plugin stays in the catalog regardless
 * of what this module concludes. The catalog stores observed *facts* (is the
 * entry point committed, does a prepare script exist, does npm point back at
 * this repository) and this module derives the *verdicts* from them, so a
 * change of judgement costs a deploy rather than a re-crawl of every plugin.
 *
 * Must stay aligned with the classifier in scripts/review-plugin-submission.mjs,
 * which reaches the same verdicts from the pull-request gate. The two are
 * cross-checked by tests/install-methods.test.ts.
 */

import { parsePluginId, pluginInstallSpec, pluginRepositoryFullName } from './plugin-id'

export type InstallMethodKind = 'github' | 'npm'

/**
 * `unknown` is distinct from `unverified` on purpose: a queue that has not
 * reached a plugin yet knows nothing about it, and rendering that as
 * "unverified" would be a false claim about somebody else's project.
 */
export type InstallVerification = 'verified' | 'unverified' | 'unknown'

export type GitInstallCode =
  | 'entry_committed'
  | 'no_entry_declared'
  | 'prepare_builds_entry'
  | 'entry_missing_no_prepare'
  | 'entry_outside_repository'
  | 'manifest_missing'
  | 'entry_unresolved'
  | 'tree_truncated'
  | 'repository_unreachable'
  | 'not_checked'

export type NpmInstallCode = 'repository_backlink' | 'unlinked_package'

/** How firmly a published npm package is tied back to the plugin's source. */
export type NpmBinding = 'strict' | 'name_only' | 'mismatch' | 'no_bundle' | 'absent' | 'unknown'

export interface PluginInstallMethod {
  kind: InstallMethodKind
  /** The bare spec, e.g. `github:owner/repo#path:sub/dir` or `@scope/name`. */
  spec: string
  /** The full official command, ready to copy. */
  command: string
  verification: InstallVerification
  code: GitInstallCode | NpmInstallCode
  /**
   * pnpm >= 10 refuses to run a git dependency's `prepare` until the user
   * allowlists it, so the first `add` fails. Driven by the presence of a
   * prepare script alone — a package can have both a committed entry point and
   * a prepare script.
   */
  requiresBuildAllowance: boolean
  /** npm version, or the short default-branch sha the git facts came from. */
  revision: string | null
  checkedAt: string | null
}

/**
 * A package that declares no entry point at all is the "carrier" pattern: its
 * patch mounts other packages as loader rows and nothing ever imports the
 * carrier itself, so it needs no loadable module.
 *
 * Telling the two apart for certain would mean parsing cordis.patch.yml, which
 * the submission gate deliberately does not do. Until that changes this stays
 * `unknown` rather than `verified`: a badge that over-claims is worse than one
 * that admits ignorance, because the whole point of the badge is trust.
 * Flip this single constant to 'verified' to take the optimistic reading.
 */
export const NO_ENTRY_DECLARED_VERIFICATION: InstallVerification = 'unknown'

const GIT_VERIFICATION: Record<GitInstallCode, InstallVerification> = {
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

export function gitVerification(code: GitInstallCode): InstallVerification {
  return GIT_VERIFICATION[code] ?? 'unknown'
}

/** Facts recorded for the git install method, as stored per plugin. */
export interface GitInstallFacts {
  code: GitInstallCode
  hasPrepare: boolean
  headSha?: string | null
  checkedAt?: string | null
}

/** Facts recorded for a candidate npm package, as stored per plugin. */
export interface NpmInstallFacts {
  packageName: string | null
  binding: NpmBinding
  bundleDeclared: boolean
  version?: string | null
  checkedAt?: string | null
}

function command(spec: string): string {
  return `dsh plugin --profile web add ${spec}`
}

/**
 * Derives the install methods shown for a plugin. Pure: no I/O, so the rules
 * can be exercised exhaustively in tests and changed without a re-crawl.
 *
 * An npm method is emitted only when the published package declares a DSH
 * bundle AND its name is at least tied to this plugin. A package whose
 * `repository` points somewhere else — or at a different directory of the same
 * monorepo — is somebody else's code that merely shares a name, so it is
 * withheld entirely rather than shown as unverified.
 */
export function deriveInstallMethods(
  id: string,
  git: GitInstallFacts,
  npm: NpmInstallFacts | null,
): PluginInstallMethod[] {
  const methods: PluginInstallMethod[] = []

  const gitSpec = pluginInstallSpec(id)
  methods.push({
    kind: 'github',
    spec: gitSpec,
    command: command(gitSpec),
    verification: gitVerification(git.code),
    code: git.code,
    requiresBuildAllowance: git.hasPrepare,
    revision: git.headSha ?? null,
    checkedAt: git.checkedAt ?? null,
  })

  if (npm?.packageName && npm.bundleDeclared && (npm.binding === 'strict' || npm.binding === 'name_only')) {
    const strict = npm.binding === 'strict'
    methods.push({
      kind: 'npm',
      spec: npm.packageName,
      command: command(npm.packageName),
      verification: strict ? 'verified' : 'unverified',
      code: strict ? 'repository_backlink' : 'unlinked_package',
      requiresBuildAllowance: false,
      revision: npm.version ?? null,
      checkedAt: npm.checkedAt ?? null,
    })
  }

  return methods
}

function normalizeGitHubUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null
  const match = /github\.com[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/#?]|$)/.exec(url)
  return match ? `${match[1]}/${match[2]}`.toLocaleLowerCase('en-US') : null
}

/**
 * How firmly an npm package is bound to this plugin's source.
 *
 * `repository.directory` is npm's own field for "this package lives in that
 * subdirectory of that repository", so for a monorepo subpackage it must match
 * the plugin's path exactly — git paths are case-sensitive. Anything weaker is
 * a name that happens to be taken, which is not evidence of anything.
 */
export function classifyNpmBinding(
  id: string,
  published: { repository?: unknown; dsh?: unknown } | null,
): { binding: NpmBinding; bundleDeclared: boolean } {
  if (published === null) return { binding: 'absent', bundleDeclared: false }

  const repositoryField = published.repository
  const raw = typeof repositoryField === 'string'
    ? { url: repositoryField }
    : (repositoryField as { url?: unknown; directory?: unknown } | null) ?? {}
  const bundleDeclared = Boolean(
    raw && typeof published.dsh === 'object' && published.dsh !== null &&
    (published.dsh as { bundle?: unknown }).bundle,
  )

  const parts = parsePluginId(id)
  if (parts === null) return { binding: 'unknown', bundleDeclared }

  const declared = normalizeGitHubUrl(typeof raw.url === 'string' ? raw.url : null)
  if (declared === null) return { binding: 'name_only', bundleDeclared }
  if (declared !== pluginRepositoryFullName(id).toLocaleLowerCase('en-US')) {
    return { binding: 'mismatch', bundleDeclared }
  }

  const directory = typeof raw.directory === 'string'
    ? raw.directory.replace(/^\.?\/+/, '').replace(/\/+$/, '')
    : ''
  if (directory !== parts.path) return { binding: 'mismatch', bundleDeclared }
  if (!bundleDeclared) return { binding: 'no_bundle', bundleDeclared }
  return { binding: 'strict', bundleDeclared }
}
