import { Link } from 'react-router-dom'
import { useLanguage } from '../lib/i18n.jsx'
import { calcAge, initials } from '../lib/format.js'
import { useClientPhotoUrl } from '../lib/clientPhoto.jsx'

export default function ClientCard({ client, onDelete, isTrainer }) {
  const { t, genderLabel } = useLanguage()
  const age = calcAge(client.birth_date)
  const photoUrl = useClientPhotoUrl(client)

  return (
    <article className="group relative h-full">
      {onDelete && (
        <button
          type="button"
          aria-label={t('deleteClientAria')}
          onClick={() => onDelete(client)}
          className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-red-50 hover:text-stamp focus-visible:bg-red-50 focus-visible:text-stamp"
        >
          ×
        </button>
      )}

      <Link
        to={`/client/${client.id}`}
        className="card-tab block h-full rounded-xl border border-line bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-ledger/60 hover:shadow-md"
      >
        <div className="flex items-start gap-3 pr-8">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              loading="lazy"
              className="h-16 w-16 flex-shrink-0 rounded-lg border border-line object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg border border-ledger/15 bg-ledger/10">
              <span className="font-display text-lg font-semibold text-ledger">
                {initials(client.full_name) || '—'}
              </span>
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 truncate font-display text-lg font-semibold text-ink">
                {client.full_name}
              </h2>
              {isTrainer && (
                <span className="rounded-full bg-brass/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-brass">
                  {t('roleTrainer')}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              {[age !== null ? `${age}${t('ageSuffix')}` : null, genderLabel(client.gender)]
                .filter(Boolean)
                .join(' · ') || t('noContacts')}
            </p>
          </div>
        </div>

        <div className="mt-4 border-t border-line/70 pt-3 text-sm text-ink-soft">
          <p className="truncate">{client.phone || client.email || t('noContacts')}</p>
          {client.address && <p className="mt-1 truncate text-xs">{client.address}</p>}
        </div>

        <p className="mt-3 font-mono text-[11px] uppercase tracking-wide text-ledger opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {t('openArrow')}
        </p>
      </Link>
    </article>
  )
}
