import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../lib/i18n.jsx'
import { parseCSV, toCSV } from '../lib/csv.js'
import { calcAgeAt } from '../lib/format.js'
import { classifyFatPercent, isFatParameterName } from '../lib/fatReference.js'
import StatusMessage from './StatusMessage.jsx'
import { printElement } from '../lib/print.js'

const FAT_COLOR_CLASSES = {
  excellent: 'text-emerald-700',
  good: 'text-sky-600',
  average: 'text-amber-600',
  danger: 'font-bold text-red-700',
}

export default function HistoryModal({
  open,
  onClose,
  parameters,
  entriesByParam,
  onUpdateEntry,
  onDeleteEntry,
  onImportRows,
  exportFileName,
  clientName,
  clientBirthDate,
  clientHeight,
  clientGender,
  readOnly = false,
  allowTransfer = true,
}) {
  const { t, formatDate } = useLanguage()
  const [importMessage, setImportMessage] = useState(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !importing) onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, importing, onClose])

  if (!open) return null

  const allDates = Array.from(
    new Set(parameters.flatMap((parameter) => (entriesByParam[parameter.id] || []).map((entry) => entry.recorded_at)))
  ).sort((a, b) => b.localeCompare(a))

  function handleExport() {
    const header = [t('colParameter'), ...allDates]
    const rows = parameters.map((parameter) => {
      const entries = entriesByParam[parameter.id] || []
      const byDate = Object.fromEntries(entries.map((entry) => [entry.recorded_at, entry]))
      return [parameter.name, ...allDates.map((date) => byDate[date]?.value ?? '')]
    })

    const blob = new Blob(['\uFEFF', toCSV([header, ...rows])], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${exportFileName || 'history'}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  function handleImportClick() {
    setImportMessage(null)
    fileInputRef.current?.click()
  }

  function handleFileSelected(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      setImportMessage({ type: 'error', text: t('importFileTooLarge') })
      return
    }

    const reader = new FileReader()
    reader.onerror = () => setImportMessage({ type: 'error', text: t('importParseError') })
    reader.onload = async () => {
      try {
        const rows = parseCSV(reader.result)
        if (rows.length < 2 || rows[0].length < 2) {
          setImportMessage({ type: 'error', text: t('importParseError') })
          return
        }

        const [header, ...dataRows] = rows
        const dateColumns = header.slice(1).map((value) => value.trim())
        const nameToParameter = new Map(
          parameters.map((parameter) => [parameter.name.trim().toLocaleLowerCase(), parameter])
        )

        const entries = []
        const unmatched = new Set()
        for (const row of dataRows) {
          const [rawName, ...values] = row
          const normalizedName = (rawName || '').trim().toLocaleLowerCase()
          const parameter = nameToParameter.get(normalizedName)
          if (!parameter) {
            if (rawName?.trim()) unmatched.add(rawName.trim())
            continue
          }

          values.forEach((rawValue, index) => {
            const value = (rawValue ?? '').trim()
            const recordedAt = dateColumns[index]
            if (value !== '' && recordedAt) {
              entries.push({ parameter_id: parameter.id, recorded_at: recordedAt, value })
            }
          })
        }

        if (entries.length === 0) {
          setImportMessage({ type: 'error', text: t('importNothingFound') })
          return
        }

        setImporting(true)
        const result = await onImportRows(entries)
        if (result?.error) {
          setImportMessage({ type: 'error', text: result.error })
        } else {
          setImportMessage({
            type: 'success',
            text: t('importSuccess', { count: result.imported }),
            unmatched: unmatched.size ? Array.from(unmatched).join(', ') : null,
          })
        }
      } catch {
        setImportMessage({ type: 'error', text: t('importParseError') })
      } finally {
        setImporting(false)
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/55 backdrop-blur-[2px] sm:items-center sm:p-4 print-flow"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !importing) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-modal-title"
        className="flex max-h-[94vh] w-full flex-col border-t border-line bg-card shadow-2xl sm:max-h-[88vh] sm:max-w-6xl sm:rounded-xl sm:border print-flow"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="no-print flex flex-shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p id="history-modal-title" className="truncate font-display text-lg font-semibold text-ink">{t('historyTitle')}</p>
            {clientName && <p className="truncate text-xs text-ink-soft">{clientName}</p>}
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            <button type="button" onClick={() => printElement('history-print-area')} className="toolbar-button">{t('printButton')}</button>
            {allowTransfer && <button type="button" onClick={handleExport} className="toolbar-button">{t('exportButton')}</button>}
            {allowTransfer && !readOnly && (
              <button type="button" onClick={handleImportClick} disabled={importing} className="toolbar-button">
                {importing ? t('saving') : t('importButton')}
              </button>
            )}
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileSelected} />
            <button type="button" onClick={onClose} disabled={importing} aria-label={t('closeAria')} className="icon-button">✕</button>
          </div>
        </div>

        {importMessage && (
          <div className="no-print flex-shrink-0 border-b border-line px-4 py-3 sm:px-6">
            <StatusMessage type={importMessage.type}>
              <p>{importMessage.text}</p>
              {importMessage.unmatched && <p className="mt-1 text-xs">{t('importUnmatched')}: {importMessage.unmatched}</p>}
            </StatusMessage>
          </div>
        )}

        <div id="history-print-area" className="printable-area overflow-auto p-4 sm:p-6">
          <div className="mb-4">
            <p className="font-display text-xl font-semibold text-ink">{clientName}</p>
            <p className="mt-1 font-mono text-xs text-ink-soft">
              {[
                clientHeight ? `${clientHeight} ${t('cmSuffix')}` : null,
                readOnly ? t('viewOnly') : null,
              ].filter(Boolean).join(' · ')}
            </p>
          </div>

          {parameters.some((parameter) => isFatParameterName(parameter.name)) && (
            <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
              <LegendDot className="bg-emerald-600" label={t('fatExcellent')} />
              <LegendDot className="bg-sky-500" label={t('fatGood')} />
              <LegendDot className="bg-amber-500" label={t('fatAverage')} />
              <LegendDot className="bg-red-600" label={t('fatDanger')} bold />
            </div>
          )}

          {allDates.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line py-10 text-center text-sm text-ink-soft">{t('noValuesYet')}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-paper/70">
                  <tr className="border-b border-line text-left">
                    <th className="sticky left-0 z-10 whitespace-nowrap bg-paper py-3 pl-4 pr-4 font-mono text-[11px] uppercase tracking-wide text-ink-soft">{t('colParameter')}</th>
                    {allDates.map((date) => (
                      <th key={date} className="whitespace-nowrap px-3 py-3 text-center font-mono text-[11px] uppercase tracking-wide text-ink-soft">{formatDate(date)}</th>
                    ))}
                  </tr>
                  {clientBirthDate && (
                    <tr className="border-b border-line bg-paper/40 text-left">
                      <th className="sticky left-0 z-10 whitespace-nowrap bg-paper py-2 pl-4 pr-4 font-mono text-xs font-normal text-ink-soft">{t('ageAtDate')}</th>
                      {allDates.map((date) => (
                        <th key={date} className="whitespace-nowrap px-3 py-2 text-center font-mono text-xs font-normal text-ink-soft">
                          {calcAgeAt(clientBirthDate, date) ?? '—'}{calcAgeAt(clientBirthDate, date) !== null ? t('ageSuffix') : ''}
                        </th>
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {parameters.map((parameter) => {
                    const entries = entriesByParam[parameter.id] || []
                    const byDate = Object.fromEntries(entries.map((entry) => [entry.recorded_at, entry]))
                    const isFat = isFatParameterName(parameter.name)

                    return (
                      <tr key={parameter.id} className="border-b border-line/60 last:border-0 hover:bg-paper/30">
                        <td className="sticky left-0 z-10 whitespace-nowrap bg-card py-3 pl-4 pr-4 font-display font-medium text-ink">{parameter.name}</td>
                        {allDates.map((date) => {
                          const entry = byDate[date]
                          const classification = isFat && entry
                            ? classifyFatPercent(entry.value, clientGender, calcAgeAt(clientBirthDate, date))
                            : null
                          return (
                            <td key={date} className="px-3 py-2 text-center">
                              {entry ? (
                                <HistoryCell
                                  entry={entry}
                                  onUpdate={(value) => onUpdateEntry(parameter.id, entry.id, value)}
                                  onDelete={() => onDeleteEntry(parameter.id, entry.id)}
                                  readOnly={readOnly}
                                  valueClassName={FAT_COLOR_CLASSES[classification]}
                                />
                              ) : (
                                <span className="text-ink-soft/40" title={t('noValueForDate')}>—</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function LegendDot({ className, label, bold = false }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-ink-soft">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
      <span className={bold ? 'font-bold' : ''}>{label}</span>
    </span>
  )
}

function HistoryCell({ entry, onUpdate, onDelete, readOnly, valueClassName }) {
  const { t } = useLanguage()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(entry.value)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => setValue(entry.value), [entry.value])

  if (readOnly) return <span className={`font-mono text-ink ${valueClassName || ''}`}>{entry.value}</span>

  async function save() {
    if (value.trim() === '' || busy) return
    setBusy(true)
    const ok = await onUpdate(value)
    setBusy(false)
    if (ok !== false) setEditing(false)
  }

  async function remove() {
    if (busy) return
    setBusy(true)
    const ok = await onDelete()
    setBusy(false)
    if (ok === false) setConfirmDelete(false)
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          className="input w-20 text-center"
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); save() }
            if (event.key === 'Escape') { setValue(entry.value); setEditing(false) }
          }}
          autoFocus
        />
        <button type="button" onClick={save} disabled={busy} className="text-ledger hover:text-ledger-dark" aria-label={t('saveAria')}>✓</button>
        <button type="button" onClick={() => { setValue(entry.value); setEditing(false) }} disabled={busy} className="text-ink-soft hover:text-ink" aria-label={t('cancelAria')}>×</button>
      </span>
    )
  }

  if (confirmDelete) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <button type="button" onClick={remove} disabled={busy} className="text-xs text-stamp hover:underline">{busy ? t('saving') : t('deleteQuestion')}</button>
        <button type="button" onClick={() => setConfirmDelete(false)} disabled={busy} className="text-xs text-ink-soft hover:underline">{t('no')}</button>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className={`font-mono text-ink ${valueClassName || ''}`}>{entry.value}</span>
      <button type="button" aria-label={t('editAria')} onClick={() => setEditing(true)} className="no-print text-ink-soft/70 hover:text-ledger">✎</button>
      <button type="button" aria-label={t('deleteAria')} onClick={() => setConfirmDelete(true)} className="no-print text-ink-soft/70 hover:text-stamp">×</button>
    </span>
  )
}
