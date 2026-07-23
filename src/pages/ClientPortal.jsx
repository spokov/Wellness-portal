import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/auth.jsx'
import { useLanguage } from '../lib/i18n.jsx'
import { calcAge, initials } from '../lib/format.js'
import { useClientPhotoUrl } from '../lib/clientPhoto.jsx'
import StatusMessage from '../components/StatusMessage.jsx'

export default function ClientPortal() {
  const { profile } = useAuth()
  const { t, formatDate, genderLabel } = useLanguage()
  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const photoUrl = useClientPhotoUrl(client)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')

    supabase
      .from('clients')
      .select('*')
      .eq('user_id', profile.id)
      .single()
      .then(({ data, error: loadError }) => {
        if (!active) return
        if (loadError) setError(loadError.message)
        else setClient(data)
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [profile.id])

  if (loading) return <div className="h-56 animate-pulse rounded-xl border border-line bg-card" />
  if (error || !client) return <StatusMessage type="error">{error || t('noLinkedClient')}</StatusMessage>

  const age = calcAge(client.birth_date)

  return (
    <div>
      <section className="card-tab rounded-xl border border-line bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="h-24 w-24 flex-shrink-0 rounded-xl border border-line object-cover" />
          ) : (
            <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-xl border border-ledger/15 bg-ledger/10">
              <span className="font-display text-2xl font-semibold text-ledger">{initials(client.full_name) || '—'}</span>
            </div>
          )}

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="eyebrow">{t('clientPortalLabel')}</p>
            <h1 className="page-title break-words">{client.full_name}</h1>
            <p className="page-subtitle">{t('clientPortalSubtitle')}</p>

            <dl className="mt-5 grid gap-x-6 gap-y-3 text-left sm:grid-cols-2">
              <Detail label={t('fieldBirthDate')} value={formatDate(client.birth_date)} />
              <Detail label={t('fieldGender')} value={genderLabel(client.gender)} />
              <Detail label={t('fieldHeight')} value={client.height_cm ? `${client.height_cm} ${t('cmSuffix')}` : ''} />
              <Detail label={t('ageAtDate')} value={age !== null ? `${age}${t('ageSuffix')}` : ''} />
            </dl>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-4">
          <p className="eyebrow">{t('parametersHeading')}</p>
          <h2 className="font-display text-2xl font-semibold text-ink">{t('measurementsTitle')}</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <GroupCard to={`/client/${client.id}/tanita`} title={t('tanitaTitle')} subtitle={t('viewOnly')} openLabel={t('openArrow')} />
          <GroupCard to={`/client/${client.id}/body`} title={t('bodyTitle')} subtitle={t('bodySubtitleShort')} openLabel={t('openArrow')} />
        </div>
      </section>
    </div>
  )
}

function Detail({ label, value }) {
  if (!value) return null
  return (
    <div>
      <dt className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{value}</dd>
    </div>
  )
}

function GroupCard({ to, title, subtitle, openLabel }) {
  return (
    <Link to={to} className="card-tab group block rounded-xl border border-line bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-ledger/60 hover:shadow-md">
      <p className="font-display text-xl font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>
      <p className="mt-4 font-mono text-xs text-ledger">{openLabel}</p>
    </Link>
  )
}
