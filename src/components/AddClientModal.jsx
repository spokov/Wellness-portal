import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useLanguage } from '../lib/i18n.jsx'
import { generateUsernamePreview } from '../lib/username.js'
import { callManageAccount } from '../lib/manageAccount.js'
import { isFutureDate, todayISO } from '../lib/date.js'
import { uploadClientPhoto, removeClientPhoto, validateClientPhoto } from '../lib/clientPhoto.jsx'
import Modal from './Modal.jsx'
import StatusMessage from './StatusMessage.jsx'

const emptyForm = {
  first_name: '',
  last_name: '',
  address: '',
  phone: '',
  email: '',
  birth_date: '',
  gender: '',
  height_cm: '',
  notes: '',
}

export default function AddClientModal({ open = true, onClose, onCreated }) {
  const { t } = useLanguage()
  const [form, setForm] = useState(emptyForm)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [photoFile, setPhotoFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [createdInfo, setCreatedInfo] = useState(null)

  const usernamePreview = generateUsernamePreview(form.first_name, form.last_name)
  const photoPreview = useMemo(() => (photoFile ? URL.createObjectURL(photoFile) : null), [photoFile])

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
  }, [photoPreview])

  useEffect(() => {
    if (!open) {
      setForm(emptyForm)
      setPassword('')
      setPhotoFile(null)
      setError('')
      setCreatedInfo(null)
      setShowPassword(false)
    }
  }, [open])

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function validate() {
    if (!form.first_name.trim() || !form.last_name.trim()) return t('nameRequired')
    if (form.birth_date && isFutureDate(form.birth_date)) return t('futureBirthDate')

    if (form.height_cm) {
      const height = Number(form.height_cm)
      if (!Number.isFinite(height) || height < 80 || height > 250) return t('invalidHeight')
    }

    const photoError = validateClientPhoto(photoFile)
    if (photoError === 'type') return t('invalidPhotoType')
    if (photoError === 'size') return t('photoTooLarge')
    if (password.length < 8) return t('passwordHint')
    return null
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    setError('')
    let createdClientId = null
    let uploadedPhotoPath = null

    try {
      const { client_id, username } = await callManageAccount({
        action: 'create',
        role: 'client',
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        password,
      })
      createdClientId = client_id

      if (photoFile) uploadedPhotoPath = await uploadClientPhoto(client_id, photoFile)

      const { data, error: updateError } = await supabase
        .from('clients')
        .update({
          address: form.address.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim().toLowerCase() || null,
          birth_date: form.birth_date || null,
          gender: form.gender || null,
          height_cm: form.height_cm ? Number(form.height_cm) : null,
          notes: form.notes.trim() || null,
          photo_path: uploadedPhotoPath,
          photo_url: null,
        })
        .eq('id', client_id)
        .select()
        .single()

      if (updateError) throw updateError
      setCreatedInfo({ client: data, username })
    } catch (submitError) {
      if (uploadedPhotoPath) {
        try {
          await removeClientPhoto(uploadedPhotoPath)
        } catch {
          // The database/account cleanup below is more important; an orphaned
          // object can be removed later by an administrator.
        }
      }
      if (createdClientId) {
        try {
          await callManageAccount({ action: 'delete_client', client_id: createdClientId })
        } catch {
          // Preserve the original error; server logs contain cleanup details.
        }
      }
      setError(submitError.message || t('genericSaveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (saving) return
        if (createdInfo) onCreated?.(createdInfo.client)
        else onClose?.()
      }}
      titleId="new-client-title"
      maxWidth="max-w-2xl"
      closeOnBackdrop={!saving}
    >
      {createdInfo ? (
        <div className="p-6 sm:p-7">
          <p id="new-client-title" className="font-display text-2xl font-semibold text-ink">
            {t('clientCreatedTitle')}
          </p>
          <p className="mt-1 text-sm text-ink-soft">{t('clientCreatedSubtitle')}</p>
          <div className="mt-5 rounded-xl border border-line bg-paper p-4">
            <p className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">{t('fieldUsername')}</p>
            <p className="mt-1 select-all font-mono text-xl text-ink">{createdInfo.username}</p>
          </div>
          <button type="button" onClick={() => onCreated(createdInfo.client)} className="btn-primary mt-5 w-full">
            {t('done')}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
            <div>
              <p id="new-client-title" className="font-display text-xl font-semibold text-ink">
                {t('newClientTitle')}
              </p>
              <p className="mt-1 text-xs text-ink-soft">{t('requiredFieldsHint')}</p>
            </div>
            <button type="button" onClick={onClose} disabled={saving} className="icon-button" aria-label={t('closeAria')}>
              ✕
            </button>
          </div>

          <div className="space-y-4 p-5 sm:p-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t('fieldFirstName')} required>
                <input className="input" value={form.first_name} onChange={(e) => update('first_name', e.target.value)} autoFocus required />
              </Field>
              <Field label={t('fieldLastName')} required>
                <input className="input" value={form.last_name} onChange={(e) => update('last_name', e.target.value)} required />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t('fieldPhone')}>
                <input className="input" type="tel" autoComplete="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
              </Field>
              <Field label={t('fieldEmail')}>
                <input className="input" type="email" autoComplete="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
              </Field>
            </div>

            <Field label={t('fieldAddress')}>
              <input className="input" autoComplete="street-address" value={form.address} onChange={(e) => update('address', e.target.value)} />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label={t('fieldBirthDate')}>
                <input className="input" type="date" max={todayISO()} value={form.birth_date} onChange={(e) => update('birth_date', e.target.value)} />
              </Field>
              <Field label={t('fieldGender')}>
                <select className="input" value={form.gender} onChange={(e) => update('gender', e.target.value)}>
                  <option value="">—</option>
                  <option value="Мъж">{t('genderMale')}</option>
                  <option value="Жена">{t('genderFemale')}</option>
                  <option value="Друго">{t('genderOther')}</option>
                </select>
              </Field>
              <Field label={t('fieldHeight')}>
                <input className="input" type="number" min="80" max="250" step="0.1" inputMode="decimal" value={form.height_cm} onChange={(e) => update('height_cm', e.target.value)} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label={t('fieldPhoto')}>
                <input
                  className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-md file:border-0 file:bg-ledger/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ledger hover:file:bg-ledger/15"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null
                    setPhotoFile(file)
                    setError('')
                  }}
                />
              </Field>
              {photoPreview && <img src={photoPreview} alt={t('photoPreview')} className="h-20 w-20 rounded-lg border border-line object-cover" />}
            </div>

            <Field label={t('fieldNotes')}>
              <textarea className="input min-h-20 resize-y" value={form.notes} onChange={(e) => update('notes', e.target.value)} />
            </Field>

            <div className="rounded-xl border border-line bg-paper/70 p-4">
              <p className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">{t('clientLoginSectionTitle')}</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t('fieldUsername')}>
                  <input className="input bg-white/60 text-ink-soft" value={usernamePreview || '—'} readOnly tabIndex={-1} />
                </Field>
                <Field label={t('loginPassword')} required>
                  <div className="relative">
                    <input
                      className="input pr-16"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={8}
                      required
                    />
                    <button type="button" onClick={() => setShowPassword((value) => !value)} className="password-toggle">
                      {showPassword ? t('hidePassword') : t('showPassword')}
                    </button>
                  </div>
                </Field>
              </div>
              <p className="mt-2 text-xs text-ink-soft">{t('usernameAutoHelp')} {t('passwordHint')}</p>
            </div>

            <StatusMessage type="error">{error}</StatusMessage>
          </div>

          <div className="flex justify-end gap-2 border-t border-line bg-paper/50 px-5 py-4 sm:px-6">
            <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">{t('cancel')}</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? t('saving') : t('saveClient')}</button>
          </div>
        </form>
      )}
    </Modal>
  )
}

function Field({ label, required = false, children }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[11px] uppercase tracking-wide text-ink-soft">
        {label}{required ? ' *' : ''}
      </span>
      {children}
    </label>
  )
}
