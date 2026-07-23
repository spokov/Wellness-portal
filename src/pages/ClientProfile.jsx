import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useLanguage } from '../lib/i18n.jsx'
import { callManageAccount } from '../lib/manageAccount.js'
import { calcAge, initials } from '../lib/format.js'
import { isFutureDate, todayISO } from '../lib/date.js'
import {
  removeClientPhoto,
  removeManagedClientPhoto,
  uploadClientPhoto,
  useClientPhotoUrl,
  validateClientPhoto,
} from '../lib/clientPhoto.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import StatusMessage from '../components/StatusMessage.jsx'

export default function ClientProfile() {
  const { t, formatDate, genderLabel } = useLanguage()
  const { id } = useParams()
  const navigate = useNavigate()

  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const storedPhotoUrl = useClientPhotoUrl(client)
  const photoPreview = useMemo(() => (photoFile ? URL.createObjectURL(photoFile) : null), [photoFile])
  const displayedPhoto = removePhoto ? null : photoPreview || storedPhotoUrl

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
  }, [photoPreview])

  useEffect(() => {
    load()
  }, [id])

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase.from('clients').select('*').eq('id', id).single()

    if (loadError) {
      setError(loadError.message)
    } else {
      setClient(data)
      setForm(data)
    }
    setLoading(false)
  }

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function validate() {
    if (!form?.full_name?.trim()) return t('nameRequired')
    if (form.birth_date && isFutureDate(form.birth_date)) return t('futureBirthDate')
    if (form.height_cm) {
      const height = Number(form.height_cm)
      if (!Number.isFinite(height) || height < 80 || height > 250) return t('invalidHeight')
    }
    const photoError = validateClientPhoto(photoFile)
    if (photoError === 'type') return t('invalidPhotoType')
    if (photoError === 'size') return t('photoTooLarge')
    return null
  }

  async function saveEdits() {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')
    let newPhotoPath = null

    try {
      if (photoFile) newPhotoPath = await uploadClientPhoto(id, photoFile)

      const nextPhotoPath = removePhoto ? null : newPhotoPath || client.photo_path || null
      const { data, error: updateError } = await supabase
        .from('clients')
        .update({
          full_name: form.full_name.trim(),
          address: form.address?.trim() || null,
          phone: form.phone?.trim() || null,
          email: form.email?.trim().toLowerCase() || null,
          birth_date: form.birth_date || null,
          gender: form.gender || null,
          height_cm: form.height_cm ? Number(form.height_cm) : null,
          notes: form.notes?.trim() || null,
          photo_path: nextPhotoPath,
          photo_url: nextPhotoPath ? null : removePhoto ? null : client.photo_url,
        })
        .eq('id', id)
        .select()
        .single()

      if (updateError) throw updateError

      const oldPhotoPath = client.photo_path
      setClient(data)
      setForm(data)
      setPhotoFile(null)
      setRemovePhoto(false)
      setEditing(false)
      setSuccess(t('savedSuccess'))

      if (oldPhotoPath && oldPhotoPath !== nextPhotoPath) {
        removeManagedClientPhoto(id, oldPhotoPath).catch(() => {})
      }
    } catch (saveError) {
      if (newPhotoPath) removeClientPhoto(newPhotoPath).catch(() => {})
      setError(saveError.message || t('genericSaveError'))
    } finally {
      setSaving(false)
    }
  }

  function cancelEditing() {
    setForm(client)
    setPhotoFile(null)
    setRemovePhoto(false)
    setEditing(false)
    setError('')
  }

  async function handleDelete() {
    if (deleting) return
    setDeleting(true)
    setError('')
    try {
      await callManageAccount({ action: 'delete_client', client_id: id })
      navigate('/')
    } catch (deleteError) {
      setError(deleteError.message)
      setConfirmDeleteOpen(false)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return <div className="h-64 animate-pulse rounded-xl border border-line bg-card" />
  }
  if (!client || !form) return <StatusMessage type="error">{error}</StatusMessage>

  const age = calcAge(client.birth_date)

  return (
    <div>
      <StatusMessage type="error" className="mb-4">{error}</StatusMessage>
      <StatusMessage type="success" className="mb-4">{success}</StatusMessage>

      <section className="card-tab mt-4 rounded-xl border border-line bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <div className="flex flex-col items-center md:w-32">
            {displayedPhoto ? (
              <img src={displayedPhoto} alt="" className="h-28 w-28 rounded-xl border border-line object-cover" />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-xl border border-ledger/15 bg-ledger/10">
                <span className="font-display text-3xl font-semibold text-ledger">{initials(form.full_name) || '—'}</span>
              </div>
            )}

            {editing && (
              <div className="mt-3 w-full space-y-2 text-center">
                <label className="block cursor-pointer rounded-md border border-line px-2 py-1.5 text-xs text-ledger hover:bg-paper">
                  {t('changePhoto')}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      setPhotoFile(event.target.files?.[0] || null)
                      setRemovePhoto(false)
                    }}
                  />
                </label>
                {(photoFile || storedPhotoUrl) && !removePhoto && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoFile(null)
                      setRemovePhoto(true)
                    }}
                    className="text-xs text-stamp hover:underline"
                  >
                    {t('removePhoto')}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            {editing ? (
              <EditForm form={form} update={update} t={t} />
            ) : (
              <div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="eyebrow">{t('clientProfileLabel')}</p>
                    <h1 className="page-title break-words">{client.full_name}</h1>
                    <p className="mt-1 text-sm text-ink-soft">
                      {[
                        age !== null ? `${age}${t('ageSuffix')}` : null,
                        genderLabel(client.gender),
                        client.height_cm ? `${client.height_cm} ${t('cmSuffix')}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setEditing(true); setSuccess('') }} className="btn-secondary">
                      {t('editClient')}
                    </button>
                    <button type="button" onClick={() => setConfirmDeleteOpen(true)} className="btn-danger-outline">
                      {t('deleteClient')}
                    </button>
                  </div>
                </div>

                <dl className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <Detail label={t('fieldPhone')} value={client.phone} />
                  <Detail label={t('fieldEmail')} value={client.email} />
                  <Detail label={t('fieldAddress')} value={client.address} />
                  <Detail label={t('fieldBirthDate')} value={formatDate(client.birth_date)} />
                  {client.notes && <Detail label={t('fieldNotes')} value={client.notes} wide />}
                </dl>
              </div>
            )}

            {editing && (
              <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
                <button type="button" onClick={cancelEditing} disabled={saving} className="btn-secondary">
                  {t('cancel')}
                </button>
                <button type="button" onClick={saveEdits} disabled={saving} className="btn-primary">
                  {saving ? t('saving') : t('save')}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-4">
          <p className="eyebrow">{t('parametersHeading')}</p>
          <h2 className="font-display text-2xl font-semibold text-ink">{t('measurementsTitle')}</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <GroupCard to={`/client/${id}/tanita`} title={t('tanitaTitle')} subtitle={t('tanitaSubtitleShort')} openLabel={t('openArrow')} />
          <GroupCard to={`/client/${id}/body`} title={t('bodyTitle')} subtitle={t('bodySubtitleShort')} openLabel={t('openArrow')} />
        </div>
      </section>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={t('deleteClientTitle', { name: client.full_name })}
        message={t('deleteClientMessage')}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
        loading={deleting}
      />
    </div>
  )
}

function EditForm({ form, update, t }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('fieldFullName')} wide required>
        <input className="input" value={form.full_name || ''} onChange={(event) => update('full_name', event.target.value)} required />
      </Field>
      <Field label={t('fieldPhone')}>
        <input className="input" type="tel" value={form.phone || ''} onChange={(event) => update('phone', event.target.value)} />
      </Field>
      <Field label={t('fieldEmail')}>
        <input className="input" type="email" value={form.email || ''} onChange={(event) => update('email', event.target.value)} />
      </Field>
      <Field label={t('fieldAddress')} wide>
        <input className="input" value={form.address || ''} onChange={(event) => update('address', event.target.value)} />
      </Field>
      <Field label={t('fieldBirthDate')}>
        <input className="input" type="date" max={todayISO()} value={form.birth_date || ''} onChange={(event) => update('birth_date', event.target.value)} />
      </Field>
      <Field label={t('fieldGender')}>
        <select className="input" value={form.gender || ''} onChange={(event) => update('gender', event.target.value)}>
          <option value="">—</option>
          <option value="Мъж">{t('genderMale')}</option>
          <option value="Жена">{t('genderFemale')}</option>
          <option value="Друго">{t('genderOther')}</option>
        </select>
      </Field>
      <Field label={t('fieldHeight')}>
        <input className="input" type="number" min="80" max="250" step="0.1" value={form.height_cm || ''} onChange={(event) => update('height_cm', event.target.value)} />
      </Field>
      <Field label={t('fieldNotes')} wide>
        <textarea className="input min-h-24 resize-y" value={form.notes || ''} onChange={(event) => update('notes', event.target.value)} />
      </Field>
    </div>
  )
}

function Field({ label, children, wide = false, required = false }) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1 block font-mono text-[11px] uppercase tracking-wide text-ink-soft">
        {label}{required ? ' *' : ''}
      </span>
      {children}
    </label>
  )
}

function Detail({ label, value, wide = false }) {
  if (!value) return null
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm text-ink">{value}</dd>
    </div>
  )
}

function GroupCard({ to, title, subtitle, openLabel }) {
  return (
    <Link to={to} className="card-tab group block rounded-xl border border-line bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-ledger/60 hover:shadow-md">
      <p className="font-display text-xl font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>
      <p className="mt-4 font-mono text-xs text-ledger">{openLabel}</p>
    </Link>
  )
}
