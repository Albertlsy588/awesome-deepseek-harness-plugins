import type { PluginInstallMethod } from '../../worker/lib/install-methods'
import { normalizePluginId } from '../../worker/lib/plugin-id'
import { SELF_OFFICIAL_COMMAND, SELF_PLUGIN_ID, SELF_TRACKED_COMMAND } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { InstallCommand } from './InstallCommand'

/**
 * The install methods a plugin offers, each with what the catalog actually
 * knows about it, and under each one the two ways to run it.
 *
 * The method decides *what* gets installed (a git spec or a published
 * package); the two rows under it decide *how* you invoke the official CLI —
 * through the wrapper, which counts the install, or directly. The wrapper
 * forwards its arguments verbatim, so both rows install exactly the same thing.
 *
 * "Checking" is deliberately distinct from "unverified": a plugin the crawler
 * has not reached yet is unknown, and calling somebody else's project
 * unverified because our own queue is behind would be a false claim. The
 * badges describe installability only — never the plugin's quality or safety.
 */
export function InstallMethods({ methods, pluginId }: {
  methods: PluginInstallMethod[]
  pluginId: string
}) {
  const { t } = useI18n()
  if (methods.length === 0) return null
  // The store's own entry installs from its published package, not from a spec
  // pointing at this catalog repository.
  const isSelf = normalizePluginId(pluginId) === SELF_PLUGIN_ID

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
            <div className="install-options">
              <div className="install-option install-option-recommended">
                <span className="install-option-badge">{t('recommendedInstall')}</span>
                <InstallCommand
                  command={isSelf ? SELF_TRACKED_COMMAND : `dsh1024 plugin --profile web add ${method.spec}`}
                  prominent
                />
                <p className="install-benefits">{t('installBenefitsLine')}</p>
                <p className="install-first-run">{t('installFirstRunHint')}</p>
              </div>
              <div className="install-option install-option-official">
                <span className="install-option-label">{t('officialCliCommand')}</span>
                <InstallCommand command={isSelf ? SELF_OFFICIAL_COMMAND : method.command} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
