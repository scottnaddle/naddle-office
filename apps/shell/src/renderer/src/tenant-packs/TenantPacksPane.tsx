import { useCallback, useEffect, useState } from 'react'
import type {
  TenantPackActionResult,
  TenantPackOriginView,
  TenantPackPreviewView,
  TenantPackSummary,
  TenantPacksApi,
} from '../../../shared/tenant-packs-api'
import { useI18n } from '../locale'
import { tenantPacksText, type TenantPacksPaneStringKey } from './strings'
import './tenant-packs-pane.css'

declare global {
  interface Window {
    /** absent outside the shell or with an older preload */
    aiOfficeTenantPacks?: TenantPacksApi
  }
}

type Text = (
  key: TenantPacksPaneStringKey,
  params?: Readonly<Record<string, string | number>>,
) => string

interface Notice {
  kind: 'error' | 'info'
  text: string
}

function originLabel(origin: TenantPackOriginView): string {
  switch (origin.kind) {
    case 'zip':
      return `zip: ${origin.file}`
    case 'folder':
      return `folder: ${origin.folder}`
    case 'github':
      return `GitHub: ${origin.repo}@${origin.commit.slice(0, 8)}${origin.path ? `/${origin.path}` : ''}`
  }
}

function api(): TenantPacksApi | undefined {
  return window.aiOfficeTenantPacks
}

/**
 * Settings → Company forms: import company template packs (zip, folder,
 * GitHub), review the preview table, confirm the rights, and manage the packs
 * the current tenant stores. Every list and preview comes from main; no tenant
 * value is ever sent and no folder path is shown.
 */
export function TenantPacksPane() {
  const { lang } = useI18n()
  const t = useCallback<Text>((key, params) => tenantPacksText(lang, key, params), [lang])
  const [packs, setPacks] = useState<TenantPackSummary[] | null>(null)
  const [preview, setPreview] = useState<TenantPackPreviewView | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [attested, setAttested] = useState(false)
  const [github, setGithub] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const bridge = api()
    if (!bridge) {
      setPacks([])
      return
    }
    const result = await bridge.list().catch(() => null)
    if (result?.ok && result.packs) setPacks(result.packs)
    else {
      setPacks([])
      setNotice({ kind: 'error', text: result?.error ?? t('prepareFailed') })
    }
  }, [t])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const beginPreview = useCallback(
    (result: TenantPackActionResult | null) => {
      if (!result) {
        setNotice({ kind: 'error', text: t('prepareFailed') })
        return
      }
      if (result.canceled) return
      if (!result.ok || !result.preview || !result.prepareToken) {
        setNotice({ kind: 'error', text: result.error ?? t('prepareFailed') })
        return
      }
      setNotice(null)
      setPreview(result.preview)
      setToken(result.prepareToken)
      setAttested(false)
    },
    [t],
  )

  const prepare = useCallback(
    async (run: (bridge: TenantPacksApi) => Promise<TenantPackActionResult>) => {
      const bridge = api()
      if (!bridge || busy) return
      setBusy(true)
      setNotice(null)
      try {
        beginPreview(await run(bridge))
      } catch {
        setNotice({ kind: 'error', text: t('prepareFailed') })
      } finally {
        setBusy(false)
      }
    },
    [beginPreview, busy, t],
  )

  const cancelPreview = useCallback(async () => {
    const bridge = api()
    const currentToken = token
    setPreview(null)
    setToken(null)
    setAttested(false)
    if (bridge && currentToken) await bridge.cancelPrepare(currentToken).catch(() => null)
  }, [token])

  const install = useCallback(async () => {
    const bridge = api()
    if (!bridge || !token || !preview || busy) return
    if (preview.problems.length > 0 || !attested) return
    setBusy(true)
    setNotice(null)
    try {
      const result = await bridge.confirmInstall(token, true)
      if (!result.ok) {
        setNotice({ kind: 'error', text: result.error ?? t('installFailed') })
        return
      }
      setPreview(null)
      setToken(null)
      setAttested(false)
      if (result.packs) setPacks(result.packs)
      else await refresh()
    } catch {
      setNotice({ kind: 'error', text: t('installFailed') })
    } finally {
      setBusy(false)
    }
  }, [attested, busy, preview, refresh, t, token])

  const remove = useCallback(
    async (id: string) => {
      const bridge = api()
      setConfirmRemove(null)
      if (!bridge) return
      setBusy(true)
      setNotice(null)
      try {
        const result = await bridge.remove(id)
        if (!result.ok) {
          setNotice({ kind: 'error', text: result.error ?? t('removeFailed') })
          return
        }
        if (result.packs) setPacks(result.packs)
        else await refresh()
      } catch {
        setNotice({ kind: 'error', text: t('removeFailed') })
      } finally {
        setBusy(false)
      }
    },
    [refresh, t],
  )

  const hasProblems = (preview?.problems.length ?? 0) > 0
  const canInstall = !!preview && !!token && !hasProblems && attested && !busy

  return (
    <section className="tenant-packs" data-testid="tenant-packs-pane">
      <h3 className="set-pane-title">{t('title')}</h3>
      <p className="tenant-packs-intro">{t('intro')}</p>

      <div className="tenant-packs-import">
        <button
          type="button"
          className="tenant-packs-btn"
          disabled={busy}
          onClick={() => void prepare((bridge) => bridge.prepareZip())}
        >
          {t('importZip')}
        </button>
        <button
          type="button"
          className="tenant-packs-btn"
          disabled={busy}
          onClick={() => void prepare((bridge) => bridge.prepareFolder())}
        >
          {t('importFolder')}
        </button>
      </div>

      <form
        className="tenant-packs-github"
        onSubmit={(event) => {
          event.preventDefault()
          const address = github.trim()
          if (!address) return
          void prepare((bridge) => bridge.prepareGitHub(address))
        }}
      >
        <label>
          <span>{t('githubLabel')}</span>
          <input
            type="text"
            value={github}
            placeholder={t('githubPlaceholder')}
            disabled={busy}
            onChange={(event) => setGithub(event.target.value)}
          />
        </label>
        <button type="submit" className="tenant-packs-btn" disabled={busy || !github.trim()}>
          {t('importGitHub')}
        </button>
        <small className="tenant-packs-hint">{t('githubHint')}</small>
      </form>

      {notice && (
        <p
          className={`tenant-packs-notice is-${notice.kind}`}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      )}

      <div className="tenant-packs-preview" data-testid="tenant-packs-preview">
        <h4>{t('previewTitle')}</h4>
        {!preview ? (
          <p className="tenant-packs-muted">{t('previewEmpty')}</p>
        ) : (
          <>
            <dl className="tenant-packs-facts">
              <dt>{t('packLabel')}</dt>
              <dd>
                {preview.pack.name} ({preview.pack.id})
              </dd>
              <dt>{t('versionLabel')}</dt>
              <dd>{preview.pack.version}</dd>
              {preview.pack.publisher && (
                <>
                  <dt>{t('publisherLabel')}</dt>
                  <dd>{preview.pack.publisher}</dd>
                </>
              )}
              <dt>{t('licenseLabel')}</dt>
              <dd>
                {preview.license}
                {preview.licenseNormalized ? ' (CC0 → CC0-1.0)' : ''}
              </dd>
              <dt>{t('authorLabel')}</dt>
              <dd>{preview.author || '—'}</dd>
              <dt>{t('originLabel')}</dt>
              <dd>{originLabel(preview.origin)}</dd>
            </dl>
            {preview.replacesExisting && <p className="tenant-packs-note">{t('replaceNote')}</p>}
            <table className="tenant-packs-table" data-testid="tenant-packs-entry-table">
              <thead>
                <tr>
                  <th>{t('colName')}</th>
                  <th>{t('colKind')}</th>
                  <th>{t('colLicense')}</th>
                  <th>{t('colSha')}</th>
                  <th>{t('colProblems')}</th>
                </tr>
              </thead>
              <tbody>
                {preview.entries.map((entry) => (
                  <tr key={entry.id} data-entry-id={entry.id}>
                    <td>{entry.name}</td>
                    <td>{entry.kind}</td>
                    <td>{entry.license}</td>
                    <td>
                      {entry.formAsset
                        ? entry.sha256Match
                          ? t('shaOk')
                          : t('shaBad')
                        : t('noForm')}
                    </td>
                    <td>
                      {entry.problems.length === 0 ? (
                        '—'
                      ) : (
                        <ul>
                          {entry.problems.map((problem) => (
                            <li key={problem}>{problem}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hasProblems && (
              <div className="tenant-packs-problems" role="alert">
                <strong>{t('packProblems')}</strong>
                <ul>
                  {preview.problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </div>
            )}
            <label className="tenant-packs-attest">
              <input
                type="checkbox"
                checked={attested}
                disabled={busy || hasProblems}
                onChange={(event) => setAttested(event.target.checked)}
              />
              <span>{t('attestationLabel')}</span>
            </label>
            <div className="tenant-packs-actions">
              <button
                type="button"
                className="tenant-packs-btn is-primary"
                data-testid="tenant-packs-install"
                disabled={!canInstall}
                onClick={() => void install()}
              >
                {t('install')}
              </button>
              <button
                type="button"
                className="tenant-packs-btn"
                disabled={busy}
                onClick={() => void cancelPreview()}
              >
                {t('cancel')}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="tenant-packs-installed" data-testid="tenant-packs-installed">
        <h4>{t('installedTitle')}</h4>
        {packs === null ? (
          <p className="tenant-packs-muted">{t('loading')}</p>
        ) : packs.length === 0 ? (
          <p className="tenant-packs-muted">{t('emptyInstalled')}</p>
        ) : (
          <ul className="tenant-packs-list">
            {packs.map((pack) => (
              <li key={pack.id} data-pack-id={pack.id}>
                <div className="tenant-packs-row-head">
                  <strong>
                    {pack.name} ({pack.id})
                  </strong>
                  <span className={pack.verified ? 'is-ok' : 'is-bad'}>
                    {pack.verified ? t('verified') : t('tampered')}
                  </span>
                </div>
                <div className="tenant-packs-row-meta">
                  <span>
                    {t('versionLabel')} {pack.version}
                  </span>
                  {pack.publisher && (
                    <span>
                      {t('publisherLabel')} {pack.publisher}
                    </span>
                  )}
                  <span>
                    {t('licenseLabel')} {pack.license}
                  </span>
                  <span>
                    {t('originLabel')} {originLabel(pack.origin)}
                  </span>
                  <span>{t('formsCount', { count: pack.formCount })}</span>
                </div>
                {pack.problems.length > 0 && (
                  <ul className="tenant-packs-problems">
                    {pack.problems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                )}
                {confirmRemove === pack.id ? (
                  <div className="tenant-packs-confirm">
                    <span>{t('removeConfirm', { name: pack.name })}</span>
                    <button
                      type="button"
                      className="tenant-packs-btn is-danger"
                      disabled={busy}
                      onClick={() => void remove(pack.id)}
                    >
                      {t('removeYes')}
                    </button>
                    <button
                      type="button"
                      className="tenant-packs-btn"
                      disabled={busy}
                      onClick={() => setConfirmRemove(null)}
                    >
                      {t('removeNo')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="tenant-packs-btn"
                    disabled={busy}
                    onClick={() => setConfirmRemove(pack.id)}
                  >
                    {t('remove')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
