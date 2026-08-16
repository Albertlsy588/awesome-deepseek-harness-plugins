import type { PluginInstallMethod } from '../../worker/lib/install-methods'
import { useI18n } from '../lib/i18n'
import { InstallCommand } from './InstallCommand'

/**
 * The install methods a plugin offers, each with what the catalog actually
 * knows about it.
 *
 * "Checking" is deliberately distinct from "unverified": a plugin the crawler
 * has not reached yet is unknown, and calling somebody else's project
 * unverified because our own queue is behind would be a false claim. The
 * badges describe installability only — never the plugin's quality or safety.
 */
export function InstallMethods({ methods }: { methods: PluginInstallMethod[] }) {
  const { t } = useI18n()
  if (methods.length === 0) return null

  return (
    <div className="install-methods">
      {methods.map((method) => {
        const label = method.verification === 'verified'
          ? t('installVerified')
          : method.verification === 'unverified'
            ? t('installUnverified')
            : t('installChecking')
        const hint = method.verification === 'verified'
          ? t('installVerifiedHint')
          : method.verification === 'unverified'
            ? t('installUnverifiedHint')
            : t('installCheckingHint')
        return (
          <div className="install-method" key={`${method.kind}-${method.spec}`}>
            <div className="install-method-head">
              <span className="install-method-kind">{method.kind === 'npm' ? 'npm' : 'GitHub'}</span>
              <span
                className={`install-badge install-badge-${method.verification}`}
                title={hint}
              >
                {label}
              </span>
              {method.requiresBuildAllowance && (
                <span className="install-badge install-badge-allowance" title={t('installBuildAllowanceHint')}>
                  {t('installNeedsBuildAllowance')}
                </span>
              )}
            </div>
            <InstallCommand command={method.command} prominent />
          </div>
        )
      })}
    </div>
  )
}
