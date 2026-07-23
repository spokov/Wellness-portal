import { useRef, useState } from 'react'
import { callManageAccount } from '../lib/manageAccount.js'
import { useLanguage } from '../lib/i18n.jsx'
import StatusMessage from '../components/StatusMessage.jsx'

const MAX_BACKUP_SIZE = 40 * 1024 * 1024

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export default function BackupRestore() {
  const { t } = useLanguage()
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [restoreFile, setRestoreFile] = useState(null)
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [credentials, setCredentials] = useState([])

  async function createBackup() {
    setBusy(true)
    setError('')
    setSuccess('')
    setCredentials([])
    try {
      const result = await callManageAccount({ action: 'backup_all' })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      downloadJson(result.backup, `wellness-portal-backup-${stamp}.json`)
      setSuccess(t('backupCreated'))
    } catch (backupError) {
      setError(backupError.message)
    } finally {
      setBusy(false)
    }
  }

  function selectRestoreFile(event) {
    const file = event.target.files?.[0] || null
    event.target.value = ''
    setError('')
    setSuccess('')
    setCredentials([])

    if (!file) return
    if (file.size > MAX_BACKUP_SIZE) {
      setRestoreFile(null)
      setError(t('backupFileTooLarge'))
      return
    }
    setRestoreFile(file)
  }

  async function restoreBackup() {
    if (!restoreFile || confirmation.trim().toUpperCase() !== 'RESTORE') return

    setBusy(true)
    setError('')
    setSuccess('')
    setCredentials([])

    try {
      const text = await restoreFile.text()
      const backup = JSON.parse(text)
      const result = await callManageAccount({
        action: 'restore_all',
        backup,
        replace_accounts: true,
      })
      setCredentials(result.generated_credentials || [])
      setSuccess(t('restoreCompleted', {
        accounts: result.counts?.accounts ?? 0,
        clients: result.counts?.clients ?? 0,
        entries: result.counts?.entries ?? 0,
      }))
      setRestoreFile(null)
      setConfirmation('')
    } catch (restoreError) {
      setError(restoreError instanceof SyntaxError ? t('invalidBackupFile') : restoreError.message)
    } finally {
      setBusy(false)
    }
  }

  function downloadCredentials() {
    downloadJson(
      {
        created_at: new Date().toISOString(),
        note: t('temporaryPasswordsNote'),
        accounts: credentials,
      },
      'wellness-portal-restored-account-passwords.json'
    )
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">{t('navBackup')}</p>
        <h1 className="page-title">{t('backupTitle')}</h1>
        <p className="page-subtitle max-w-3xl">{t('backupDescription')}</p>
      </header>

      <StatusMessage type="error">{error}</StatusMessage>
      <StatusMessage type="success">{success}</StatusMessage>

      <section className="rounded-xl border border-line bg-card p-5 shadow-sm sm:p-6">
        <h2 className="font-display text-xl font-semibold text-ink">{t('createBackupTitle')}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-soft">{t('createBackupHelp')}</p>
        <button type="button" onClick={createBackup} disabled={busy} className="btn-primary mt-4">
          {busy ? t('saving') : t('downloadBackup')}
        </button>
      </section>

      <section className="rounded-xl border border-red-200 bg-card p-5 shadow-sm sm:p-6">
        <h2 className="font-display text-xl font-semibold text-stamp">{t('restoreBackupTitle')}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-soft">{t('restoreBackupHelp')}</p>

        <div className="mt-4 space-y-4">
          <div>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={selectRestoreFile} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="btn-secondary">
              {t('chooseBackupFile')}
            </button>
            {restoreFile && <p className="mt-2 break-all font-mono text-xs text-ledger">{restoreFile.name}</p>}
          </div>

          <label className="block max-w-md">
            <span className="mb-1 block text-sm font-medium text-ink">{t('restoreConfirmationLabel')}</span>
            <input
              className="input"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="RESTORE"
              autoComplete="off"
            />
          </label>

          <button
            type="button"
            onClick={restoreBackup}
            disabled={busy || !restoreFile || confirmation.trim().toUpperCase() !== 'RESTORE'}
            className="btn-danger"
          >
            {busy ? t('saving') : t('restoreBackupButton')}
          </button>
        </div>
      </section>

      <StatusMessage type="warning">
        <p className="font-semibold">{t('passwordBackupWarningTitle')}</p>
        <p className="mt-1">{t('passwordBackupWarning')}</p>
      </StatusMessage>

      {credentials.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-5">
          <h2 className="font-display text-lg font-semibold text-ink">{t('temporaryPasswordsTitle')}</h2>
          <p className="mt-1 text-sm text-ink-soft">{t('temporaryPasswordsNote')}</p>
          <button type="button" onClick={downloadCredentials} className="btn-secondary mt-3">
            {t('downloadTemporaryPasswords')}
          </button>
        </section>
      )}
    </div>
  )
}
