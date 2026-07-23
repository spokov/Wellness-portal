import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/auth.jsx'
import { useLanguage } from '../lib/i18n.jsx'
import { isValidUsername } from '../lib/username.js'
import { callManageAccount } from '../lib/manageAccount.js'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import Modal from '../components/Modal.jsx'
import StatusMessage from '../components/StatusMessage.jsx'

const ROLE_LABELS_KEY = {
  admin: 'roleAdmin',
  trainer: 'roleTrainer',
  client: 'roleClient',
}

export default function Accounts() {
  const { profile } = useAuth()
  const { t } = useLanguage()

  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [passwordTarget, setPasswordTarget] = useState(null)
  const [roleTarget, setRoleTarget] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (loadError) setError(loadError.message)
    else setAccounts((data || []).filter((account) => account.id !== profile.id))
    setLoading(false)
  }

  async function handleDelete() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    setError('')
    try {
      await callManageAccount({ action: 'delete', user_id: deleteTarget.id })
      setAccounts((current) => current.filter((account) => account.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (deleteError) {
      setError(deleteError.message)
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{t('navAccounts')}</p>
          <h1 className="page-title">{t('accountsTitle')}</h1>
          <p className="page-subtitle max-w-3xl">{t('accountsDescription')}</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="btn-primary whitespace-nowrap">
          {t('newAccount')}
        </button>
      </header>

      <StatusMessage type="error" className="mb-4">{error}</StatusMessage>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl border border-line bg-card" />)}
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line py-16 text-center">
          <p className="font-display text-ink-soft">{t('noAccountsYet')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => (
            <article
              key={account.id}
              className="grid gap-3 rounded-xl border border-line bg-card p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{account.full_name || account.username}</p>
                <p className="truncate font-mono text-xs text-ink-soft">@{account.username}</p>
              </div>

              <span className="w-fit rounded-full bg-ledger/10 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide text-ledger">
                {t(ROLE_LABELS_KEY[account.role] || account.role)}
              </span>

              <div className="flex items-center gap-1 sm:justify-end">
                {account.role !== 'admin' && (
                  <button
                    type="button"
                    onClick={() => setRoleTarget(account)}
                    aria-label={t('changeRole')}
                    title={t('changeRole')}
                    className="icon-button"
                  >
                    ⇄
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPasswordTarget(account)}
                  aria-label={t('changePassword')}
                  title={t('changePassword')}
                  className="icon-button"
                >
                  <span aria-hidden="true">🔑</span>
                </button>
                {account.role !== 'client' && (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(account)}
                    aria-label={t('delete')}
                    title={t('delete')}
                    className="icon-button hover:bg-red-50 hover:text-stamp"
                  >
                    ×
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <CreateAccountModal
        open={showCreate}
        canCreateAdmin={profile.role === 'admin'}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false)
          load()
        }}
      />

      <ChangePasswordModal
        account={passwordTarget}
        onClose={() => setPasswordTarget(null)}
      />

      <ChangeRoleModal
        account={roleTarget}
        onClose={() => setRoleTarget(null)}
        onDone={() => {
          setRoleTarget(null)
          load()
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t('delete')}
        message={deleteTarget ? t('deleteAccountConfirm', { name: deleteTarget.full_name || deleteTarget.username }) : ''}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  )
}

function CreateAccountModal({ open, canCreateAdmin, onClose, onCreated }) {
  const { t } = useLanguage()
  const [role, setRole] = useState('trainer')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      setRole('trainer')
      setFullName('')
      setUsername('')
      setPassword('')
      setShowPassword(false)
      setError('')
    }
  }, [open])

  async function handleSubmit(event) {
    event.preventDefault()
    const normalizedUsername = username.trim().toLowerCase()
    if (!isValidUsername(normalizedUsername)) {
      setError(t('usernameInvalid'))
      return
    }
    if (password.length < 8) {
      setError(t('passwordHint'))
      return
    }

    setSaving(true)
    setError('')
    try {
      await callManageAccount({
        action: 'create',
        role,
        full_name: fullName.trim(),
        username: normalizedUsername,
        password,
      })
      onCreated()
    } catch (createError) {
      setError(createError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      titleId="create-account-title"
      maxWidth="max-w-md"
      closeOnBackdrop={!saving}
    >
      <form onSubmit={handleSubmit}>
        <ModalHeader id="create-account-title" title={t('newAccount')} onClose={onClose} disabled={saving} t={t} />
        <div className="space-y-4 p-5 sm:p-6">
          <Field label={t('accountRole')}>
            <select className="input" value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="trainer">{t('roleTrainer')}</option>
              {canCreateAdmin && <option value="admin">{t('roleAdmin')}</option>}
            </select>
          </Field>

          <Field label={t('accountFullName')} required>
            <input
              className="input"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              autoFocus
              required
            />
          </Field>

          <Field label={t('fieldUsername')} required hint={t('usernameHelp')}>
            <input
              className="input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="ivan.petrov"
              autoComplete="username"
              minLength={3}
              maxLength={40}
              required
            />
          </Field>

          <Field label={t('loginPassword')} required hint={t('passwordHint')}>
            <div className="relative">
              <input
                className="input pr-16"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute inset-y-0 right-2 text-xs font-medium text-ledger"
              >
                {showPassword ? t('hidePassword') : t('showPassword')}
              </button>
            </div>
          </Field>

          <StatusMessage type="error">{error}</StatusMessage>
        </div>
        <ModalActions onClose={onClose} saving={saving} t={t} />
      </form>
    </Modal>
  )
}

function ChangePasswordModal({ account, onClose }) {
  const { t } = useLanguage()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    setPassword('')
    setShowPassword(false)
    setSaving(false)
    setError('')
    setDone(false)
  }, [account?.id])

  if (!account) return null

  async function handleSubmit(event) {
    event.preventDefault()
    if (password.length < 8) {
      setError(t('passwordHint'))
      return
    }

    setSaving(true)
    setError('')
    try {
      await callManageAccount({ action: 'reset_password', user_id: account.id, new_password: password })
      setDone(true)
    } catch (passwordError) {
      setError(passwordError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={() => !saving && onClose()} titleId="change-password-title" maxWidth="max-w-sm" closeOnBackdrop={!saving}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p id="change-password-title" className="font-display text-xl font-semibold text-ink">{t('changePassword')}</p>
            <p className="mt-1 font-mono text-xs text-ink-soft">@{account.username}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="icon-button" aria-label={t('closeAria')}>✕</button>
        </div>

        {done ? (
          <div className="mt-5">
            <StatusMessage type="success">{t('passwordChanged')}</StatusMessage>
            <button type="button" onClick={onClose} className="btn-primary mt-4 w-full">{t('done')}</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <Field label={t('newPassword')} required hint={t('passwordHint')}>
              <div className="relative">
                <input
                  className="input pr-16"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  autoFocus
                  required
                />
                <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-2 text-xs font-medium text-ledger">
                  {showPassword ? t('hidePassword') : t('showPassword')}
                </button>
              </div>
            </Field>
            <StatusMessage type="error">{error}</StatusMessage>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? t('saving') : t('save')}</button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  )
}

function ChangeRoleModal({ account, onClose, onDone }) {
  const { t } = useLanguage()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setSaving(false)
    setError('')
  }, [account?.id])

  if (!account) return null
  const newRole = account.role === 'trainer' ? 'client' : 'trainer'

  async function handleConfirm() {
    setSaving(true)
    setError('')
    try {
      await callManageAccount({ action: 'change_role', user_id: account.id, new_role: newRole })
      onDone()
    } catch (roleError) {
      setError(roleError.message)
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={() => !saving && onClose()} titleId="change-role-title" maxWidth="max-w-sm" closeOnBackdrop={!saving}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p id="change-role-title" className="font-display text-xl font-semibold text-ink">{t('changeRole')}</p>
            <p className="mt-1 font-mono text-xs text-ink-soft">@{account.username}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="icon-button" aria-label={t('closeAria')}>✕</button>
        </div>

        <p className="mt-5 text-sm leading-6 text-ink">
          {newRole === 'client' ? t('changeRoleToClientWarning') : t('changeRoleToTrainerWarning')}
        </p>
        <StatusMessage type="error" className="mt-4">{error}</StatusMessage>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">{t('cancel')}</button>
          <button type="button" onClick={handleConfirm} disabled={saving} className="btn-primary">{saving ? t('saving') : t('confirm')}</button>
        </div>
      </div>
    </Modal>
  )
}

function ModalHeader({ id, title, onClose, disabled, t }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
      <p id={id} className="font-display text-xl font-semibold text-ink">{title}</p>
      <button type="button" onClick={onClose} disabled={disabled} className="icon-button" aria-label={t('closeAria')}>✕</button>
    </div>
  )
}

function ModalActions({ onClose, saving, t }) {
  return (
    <div className="flex justify-end gap-2 border-t border-line px-5 py-4 sm:px-6">
      <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">{t('cancel')}</button>
      <button type="submit" disabled={saving} className="btn-primary">{saving ? t('saving') : t('save')}</button>
    </div>
  )
}

function Field({ label, children, required = false, hint = '' }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[11px] uppercase tracking-wide text-ink-soft">
        {label}{required ? ' *' : ''}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  )
}
