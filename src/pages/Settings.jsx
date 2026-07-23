import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { useLanguage } from '../lib/i18n.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import StatusMessage from '../components/StatusMessage.jsx'

export default function Settings() {
  const { t } = useLanguage()
  const [parameters, setParameters] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [newNames, setNewNames] = useState({})
  const [addingCategory, setAddingCategory] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase
      .from('parameters')
      .select('*')
      .order('category')
      .order('sort_order')

    if (loadError) setError(loadError.message)
    else setParameters(data || [])
    setLoading(false)
  }

  function updateLocal(parameterId, value) {
    setParameters((current) => current.map((parameter) => (
      parameter.id === parameterId ? { ...parameter, name: value } : parameter
    )))
  }

  async function saveOne(parameter) {
    const name = parameter.name.trim()
    if (!name) return

    setSavingId(parameter.id)
    setError('')
    setSuccess('')
    const { data, error: saveError } = await supabase
      .from('parameters')
      .update({ name })
      .eq('id', parameter.id)
      .select()
      .single()

    if (saveError) setError(saveError.message)
    else {
      setParameters((current) => current.map((item) => (item.id === parameter.id ? data : item)))
      setSuccess(t('savedSuccess'))
    }
    setSavingId(null)
  }

  async function addParameter(category) {
    const name = (newNames[category] || '').trim()
    if (!name || addingCategory) return

    const nextOrder = Math.max(
      0,
      ...parameters.filter((parameter) => parameter.category === category).map((parameter) => Number(parameter.sort_order) || 0)
    ) + 1

    setAddingCategory(category)
    setError('')
    setSuccess('')
    const { data, error: addError } = await supabase
      .from('parameters')
      .insert({ name, value_type: 'number', category, sort_order: nextOrder })
      .select()
      .single()

    if (addError) setError(addError.message)
    else {
      setParameters((current) => [...current, data])
      setNewNames((current) => ({ ...current, [category]: '' }))
      setSuccess(t('savedSuccess'))
    }
    setAddingCategory(null)
  }

  async function deleteParameter() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    setError('')
    setSuccess('')
    const { error: deleteError } = await supabase.from('parameters').delete().eq('id', deleteTarget.id)

    if (deleteError) setError(deleteError.message)
    else {
      setParameters((current) => current.filter((parameter) => parameter.id !== deleteTarget.id))
      setSuccess(t('savedSuccess'))
    }
    setDeleteTarget(null)
    setDeleting(false)
  }

  const groups = [
    { category: 'tanita', label: t('tanitaTitle') },
    { category: 'body', label: t('bodyTitle') },
  ]

  return (
    <div>
      <header className="mb-6">
        <p className="eyebrow">{t('navSettings')}</p>
        <h1 className="page-title">{t('settingsTitle')}</h1>
        <p className="page-subtitle max-w-3xl">{t('settingsDescription')}</p>
      </header>

      <StatusMessage type="error" className="mb-4">{error}</StatusMessage>
      <StatusMessage type="success" className="mb-4">{success}</StatusMessage>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl border border-line bg-card" />)}
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(({ category, label }) => {
            const items = parameters
              .filter((parameter) => parameter.category === category)
              .sort((a, b) => a.sort_order - b.sort_order)

            return (
              <section key={category}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="font-display text-xl font-semibold text-ink">{label}</h2>
                  <span className="rounded-full bg-ledger/10 px-2.5 py-1 font-mono text-xs text-ledger">{items.length}</span>
                </div>

                <div className="space-y-2">
                  {items.map((parameter) => (
                    <form
                      key={parameter.id}
                      onSubmit={(event) => { event.preventDefault(); saveOne(parameter) }}
                      className="grid gap-2 rounded-xl border border-line bg-card p-3 shadow-sm sm:grid-cols-[2rem_minmax(0,1fr)_auto_auto] sm:items-center"
                    >
                      <span className="font-mono text-xs text-ink-soft">{parameter.sort_order}</span>
                      <input
                        className="input"
                        value={parameter.name}
                        onChange={(event) => updateLocal(parameter.id, event.target.value)}
                        placeholder={t('namePlaceholder')}
                        required
                      />
                      <button type="submit" disabled={savingId === parameter.id || !parameter.name.trim()} className="btn-secondary">
                        {savingId === parameter.id ? t('saving') : t('save')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(parameter)}
                        aria-label={t('deleteParamAria')}
                        title={t('deleteParamAria')}
                        className="icon-button hover:bg-red-50 hover:text-stamp"
                      >
                        ×
                      </button>
                    </form>
                  ))}

                  <form
                    onSubmit={(event) => { event.preventDefault(); addParameter(category) }}
                    className="flex flex-col gap-2 rounded-xl border border-dashed border-line bg-card/50 p-3 sm:flex-row"
                  >
                    <input
                      className="input flex-1"
                      placeholder={t('newParamPlaceholder')}
                      value={newNames[category] || ''}
                      onChange={(event) => setNewNames((current) => ({ ...current, [category]: event.target.value }))}
                    />
                    <button
                      type="submit"
                      disabled={addingCategory === category || !(newNames[category] || '').trim()}
                      className="btn-primary whitespace-nowrap"
                    >
                      {addingCategory === category ? t('saving') : t('addParameter')}
                    </button>
                  </form>
                </div>
              </section>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t('delete')}
        message={deleteTarget ? t('deleteParamConfirm', { name: deleteTarget.name }) : ''}
        onConfirm={deleteParameter}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  )
}
