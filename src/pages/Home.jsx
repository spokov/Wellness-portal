import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useLanguage } from '../lib/i18n.jsx'
import { callManageAccount } from '../lib/manageAccount.js'
import ClientCard from '../components/ClientCard.jsx'
import AddClientModal from '../components/AddClientModal.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import StatusMessage from '../components/StatusMessage.jsx'

export default function Home() {
  const { t } = useLanguage()
  const [clients, setClients] = useState([])
  const [trainerAccountIds, setTrainerAccountIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('newest')
  const [showAdd, setShowAdd] = useState(false)
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadClients()
  }, [])

  async function loadClients() {
    setLoading(true)
    setError('')

    const { data, error: clientsError } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })

    if (clientsError) {
      setError(clientsError.message)
      setLoading(false)
      return
    }

    const clientRows = data || []
    setClients(clientRows)

    const userIds = clientRows.map((client) => client.user_id).filter(Boolean)
    if (userIds.length > 0) {
      const { data: accounts, error: accountsError } = await supabase
        .from('profiles')
        .select('id, role')
        .in('id', userIds)

      if (accountsError) {
        setError(accountsError.message)
      }

      setTrainerAccountIds(
        new Set((accounts || []).filter((account) => account.role === 'trainer').map((account) => account.id))
      )
    } else {
      setTrainerAccountIds(new Set())
    }

    setLoading(false)
  }

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const result = normalizedQuery
      ? clients.filter((client) =>
          [client.full_name, client.phone, client.email, client.address]
            .filter(Boolean)
            .some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
        )
      : [...clients]

    result.sort((a, b) => {
      if (sort === 'name') return (a.full_name || '').localeCompare(b.full_name || '', undefined, { sensitivity: 'base' })
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    return result
  }, [clients, query, sort])

  async function confirmDelete() {
    if (!toDelete || deleting) return
    setDeleting(true)
    setError('')

    try {
      await callManageAccount({ action: 'delete_client', client_id: toDelete.id })
      setClients((items) => items.filter((client) => client.id !== toDelete.id))
      setToDelete(null)
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Wellness Portal</p>
          <h1 className="page-title">{t('clientsTitle')}</h1>
          <p className="page-subtitle">{t('clientsSubtitle')}</p>
        </div>
        <button type="button" onClick={() => setShowAdd(true)} className="btn-primary">
          {t('newClient')}
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label={t('clientCount')} value={clients.length} />
        <StatCard label={t('resultsCount')} value={filtered.length} />
        <StatCard label={t('trainerClientCount')} value={trainerAccountIds.size} className="col-span-2 sm:col-span-1" />
      </div>

      <section className="rounded-xl border border-line bg-card p-3 shadow-sm sm:p-4" aria-label={t('searchPlaceholder')}>
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <input
              className="input pr-10"
              type="search"
              placeholder={t('searchPlaceholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('clearSearch')}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft hover:bg-paper hover:text-ink"
              >
                ×
              </button>
            )}
          </div>
          <select className="input md:w-48" value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="newest">{t('sortNewest')}</option>
            <option value="name">{t('sortName')}</option>
          </select>
          <button type="button" onClick={loadClients} disabled={loading} className="btn-secondary">
            {t('refresh')}
          </button>
        </div>
      </section>

      <StatusMessage type="error" className="mt-4">{error}</StatusMessage>

      {loading ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label={t('loading')}>
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-44 animate-pulse rounded-xl border border-line bg-card" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-card/50 py-16 text-center">
          <p className="font-display text-lg text-ink-soft">
            {clients.length === 0 ? t('noClientsYet') : t('noSearchMatches')}
          </p>
          {query && (
            <button type="button" onClick={() => setQuery('')} className="btn-secondary mt-4">
              {t('clearSearch')}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              onDelete={setToDelete}
              isTrainer={client.user_id && trainerAccountIds.has(client.user_id)}
            />
          ))}
        </div>
      )}

      <AddClientModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={(client) => {
          setClients((items) => [client, ...items])
          setShowAdd(false)
        }}
      />

      <ConfirmDialog
        open={!!toDelete}
        title={t('deleteClientTitle', { name: toDelete?.full_name || '' })}
        message={t('deleteClientMessage')}
        onConfirm={confirmDelete}
        onCancel={() => !deleting && setToDelete(null)}
        loading={deleting}
      />
    </div>
  )
}

function StatCard({ label, value, className = '' }) {
  return (
    <div className={`rounded-xl border border-line bg-card px-4 py-3 shadow-sm ${className}`}>
      <p className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold text-ledger">{value}</p>
    </div>
  )
}
