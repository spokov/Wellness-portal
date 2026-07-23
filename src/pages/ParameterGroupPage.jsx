import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/auth.jsx'
import { useLanguage } from '../lib/i18n.jsx'
import { calcAge, slugifyFileName } from '../lib/format.js'
import { isFutureDate, isValidDateOnly, todayISO } from '../lib/date.js'
import ParametersTable from '../components/ParametersTable.jsx'
import StatusMessage from '../components/StatusMessage.jsx'

function normalizeMeasurement(value) {
  const normalized = String(value ?? '').trim().replace(',', '.')
  if (normalized === '') return { value: '', valid: false }
  const number = Number(normalized)
  if (!Number.isFinite(number)) return { value: normalized, valid: false }
  return { value: String(number), valid: true }
}

export default function ParameterGroupPage() {
  const { t } = useLanguage()
  const { profile } = useAuth()
  const { id, category } = useParams()
  const readOnly = profile.role === 'client' && category === 'tanita'

  const groupMeta = useMemo(
    () => ({
      tanita: { title: t('tanitaTitle'), subtitle: t('tanitaSubtitleLong') },
      body: { title: t('bodyTitle'), subtitle: t('bodySubtitleLong') },
    }),
    [t]
  )
  const meta = groupMeta[category]

  const [client, setClient] = useState(null)
  const [parameters, setParameters] = useState([])
  const [entriesByParam, setEntriesByParam] = useState({})
  const [newValues, setNewValues] = useState({})
  const [date, setDate] = useState(todayISO())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      if (!meta) {
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')
      setSuccess('')

      const [clientResult, parameterResult] = await Promise.all([
        supabase.from('clients').select('full_name, birth_date, height_cm, gender').eq('id', id).single(),
        supabase.from('parameters').select('*').eq('category', category).order('sort_order'),
      ])

      if (!active) return
      if (clientResult.error || parameterResult.error) {
        setError((clientResult.error || parameterResult.error).message)
        setLoading(false)
        return
      }

      const parameterRows = parameterResult.data || []
      const parameterIds = parameterRows.map((parameter) => parameter.id)
      let entryRows = []

      if (parameterIds.length > 0) {
        const entryResult = await supabase
          .from('parameter_entries')
          .select('*')
          .eq('client_id', id)
          .in('parameter_id', parameterIds)
          .order('recorded_at', { ascending: false })

        if (!active) return
        if (entryResult.error) {
          setError(entryResult.error.message)
          setLoading(false)
          return
        }
        entryRows = entryResult.data || []
      }

      const grouped = Object.fromEntries(parameterRows.map((parameter) => [parameter.id, []]))
      for (const entry of entryRows) {
        if (!grouped[entry.parameter_id]) grouped[entry.parameter_id] = []
        grouped[entry.parameter_id].push(entry)
      }

      setClient(clientResult.data)
      setParameters(parameterRows)
      setEntriesByParam(grouped)
      setNewValues({})
      setLoading(false)
    }

    load()
    return () => {
      active = false
    }
  }, [id, category, meta])

  function sortEntries(list) {
    return [...list].sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at)))
  }

  async function handleAddAll(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!isValidDateOnly(date) || isFutureDate(date)) {
      setError(t('invalidMeasurementDate'))
      return
    }

    const invalidParameter = parameters.find((parameter) => {
      const rawValue = newValues[parameter.id] ?? ''
      return rawValue !== '' && !normalizeMeasurement(rawValue).valid
    })

    if (invalidParameter) {
      setError(t('invalidNumberFor', { name: invalidParameter.name }))
      return
    }

    const rows = parameters
      .filter((parameter) => (newValues[parameter.id] ?? '') !== '')
      .map((parameter) => ({
        client_id: id,
        parameter_id: parameter.id,
        value: normalizeMeasurement(newValues[parameter.id]).value,
        recorded_at: date,
      }))

    if (rows.length === 0) return

    setSaving(true)
    const { data, error: saveError } = await supabase
      .from('parameter_entries')
      .upsert(rows, { onConflict: 'client_id,parameter_id,recorded_at' })
      .select()
    setSaving(false)

    if (saveError) {
      setError(saveError.message)
      return
    }

    mergeEntries(data || [])
    setNewValues({})
    setDate(todayISO())
    setSuccess(t('measurementsSaved', { count: data?.length || 0 }))
  }

  function mergeEntries(entries) {
    setEntriesByParam((previous) => {
      const next = { ...previous }
      for (const entry of entries) {
        const existing = next[entry.parameter_id] || []
        const index = existing.findIndex((item) => item.id === entry.id)
        const updated = index >= 0
          ? existing.map((item, itemIndex) => (itemIndex === index ? entry : item))
          : [...existing, entry]
        next[entry.parameter_id] = sortEntries(updated)
      }
      return next
    })
  }

  async function handleImportRows(rows) {
    setError('')
    const normalizedRows = []

    for (const row of rows) {
      const measurement = normalizeMeasurement(row.value)
      if (!measurement.valid || !isValidDateOnly(row.recorded_at) || isFutureDate(row.recorded_at)) {
        return { imported: 0, error: t('importInvalidRows') }
      }
      normalizedRows.push({ ...row, value: measurement.value, client_id: id })
    }

    if (normalizedRows.length === 0) return { imported: 0 }

    const { data, error: importError } = await supabase
      .from('parameter_entries')
      .upsert(normalizedRows, { onConflict: 'client_id,parameter_id,recorded_at' })
      .select()

    if (importError) {
      setError(importError.message)
      return { imported: 0, error: importError.message }
    }

    mergeEntries(data || [])
    return { imported: data?.length || 0 }
  }

  async function handleUpdateEntry(parameterId, entryId, rawValue) {
    const measurement = normalizeMeasurement(rawValue)
    if (!measurement.valid) {
      setError(t('invalidNumber'))
      return false
    }

    const { data, error: updateError } = await supabase
      .from('parameter_entries')
      .update({ value: measurement.value })
      .eq('id', entryId)
      .select()
      .single()

    if (updateError) {
      setError(updateError.message)
      return false
    }

    setEntriesByParam((previous) => ({
      ...previous,
      [parameterId]: (previous[parameterId] || []).map((entry) => (entry.id === entryId ? data : entry)),
    }))
    return true
  }

  async function handleDeleteEntry(parameterId, entryId) {
    const { error: deleteError } = await supabase.from('parameter_entries').delete().eq('id', entryId)
    if (deleteError) {
      setError(deleteError.message)
      return false
    }

    setEntriesByParam((previous) => ({
      ...previous,
      [parameterId]: (previous[parameterId] || []).filter((entry) => entry.id !== entryId),
    }))
    return true
  }

  if (!meta) return <StatusMessage type="error">{t('unknownGroup')}</StatusMessage>
  if (loading) return <div className="h-72 animate-pulse rounded-xl border border-line bg-card" />

  const hasAnyNewValue = parameters.some((parameter) => (newValues[parameter.id] ?? '') !== '')
  const age = calcAge(client?.birth_date)

  return (
    <div>
      <div className="mb-6">
        <p className="eyebrow">{client?.full_name}</p>
        <h1 className="page-title">{meta.title}</h1>
        <p className="page-subtitle">{meta.subtitle}</p>
        {(age !== null || client?.height_cm) && (
          <p className="mt-2 font-mono text-xs text-ledger">
            {[
              age !== null ? `${age}${t('ageSuffix')}` : null,
              client?.height_cm ? `${client.height_cm} ${t('cmSuffix')}` : null,
            ].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      <StatusMessage type="error" className="mb-4">{error}</StatusMessage>
      <StatusMessage type="success" className="mb-4">{success}</StatusMessage>

      {parameters.length === 0 ? (
        <StatusMessage type="warning">{t('noParameters')}</StatusMessage>
      ) : (
        <form onSubmit={handleAddAll}>
          <ParametersTable
            parameters={parameters}
            entriesByParam={entriesByParam}
            newValues={newValues}
            onValueChange={(parameterId, value) => setNewValues((current) => ({ ...current, [parameterId]: value }))}
            onUpdateEntry={handleUpdateEntry}
            onDeleteEntry={handleDeleteEntry}
            onImportRows={handleImportRows}
            exportFileName={slugifyFileName(`${client?.full_name || 'client'}-${category}`)}
            clientName={client?.full_name}
            clientBirthDate={client?.birth_date}
            clientHeight={client?.height_cm}
            clientGender={client?.gender}
            readOnly={readOnly}
            dateInHeader={category === 'tanita'}
            measurementDate={date}
            onMeasurementDateChange={setDate}
            addDisabled={!hasAnyNewValue}
            saving={saving}
          />
        </form>
      )}
    </div>
  )
}
