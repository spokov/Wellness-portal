import { useState } from 'react'
import HistoryModal from './HistoryModal.jsx'
import { useLanguage } from '../lib/i18n.jsx'

export default function ParametersTable({
  parameters,
  entriesByParam,
  newValues,
  onValueChange,
  onUpdateEntry,
  onDeleteEntry,
  onImportRows,
  exportFileName,
  clientName,
  clientBirthDate,
  clientHeight,
  clientGender,
  dateInHeader = false,
  readOnly = false,
}) {
  const { t, formatDate } = useLanguage()
  const [historyOpen, setHistoryOpen] = useState(false)

  const latestOverallDate = dateInHeader
    ? parameters.reduce((latestDate, parameter) => {
        const latest = (entriesByParam[parameter.id] || [])[0]
        if (!latest) return latestDate
        return !latestDate || latest.recorded_at > latestDate ? latest.recorded_at : latestDate
      }, null)
    : null

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          {readOnly ? t('viewOnly') : t('measurementInputHelp')}
        </p>
        <button type="button" onClick={() => setHistoryOpen(true)} className="btn-secondary whitespace-nowrap">
          {t('historyButton')}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-card shadow-sm">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead className="bg-paper/70">
            <tr className="border-b border-line text-left">
              <th className="w-12 py-3 pl-4 pr-2 font-mono text-[11px] uppercase tracking-wide text-ink-soft">{t('colNum')}</th>
              <th className="py-3 pr-4 font-mono text-[11px] uppercase tracking-wide text-ink-soft">{t('colParameter')}</th>
              <th className="py-3 pr-4 font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                {t('colLatest')}
                {dateInHeader && latestOverallDate && <span className="ml-2 normal-case font-normal opacity-70">({formatDate(latestOverallDate)})</span>}
              </th>
              {!readOnly && <th className="w-52 py-3 pr-4 font-mono text-[11px] uppercase tracking-wide text-ink-soft">{t('colNewValue')}</th>}
            </tr>
          </thead>
          <tbody>
            {parameters.map((parameter) => {
              const entries = entriesByParam[parameter.id] || []
              const latest = entries[0]
              return (
                <tr key={parameter.id} className="border-b border-line/60 last:border-0 hover:bg-paper/35">
                  <td className="py-3 pl-4 pr-2 font-mono text-xs text-ink-soft">{parameter.sort_order}</td>
                  <td className="py-3 pr-4 font-display font-medium text-ink">{parameter.name}</td>
                  <td className="py-3 pr-4">
                    {latest ? (
                      <>
                        <span className="font-mono font-medium text-ledger">{latest.value}</span>
                        {!dateInHeader && <span className="ml-2 whitespace-nowrap text-xs text-ink-soft">{formatDate(latest.recorded_at)}</span>}
                      </>
                    ) : (
                      <span className="text-xs text-ink-soft">—</span>
                    )}
                  </td>
                  {!readOnly && (
                    <td className="py-2 pr-4">
                      <input
                        className="input"
                        type="text"
                        inputMode="decimal"
                        aria-label={`${t('colNewValue')}: ${parameter.name}`}
                        placeholder={t('newValuePlaceholder')}
                        value={newValues[parameter.id] ?? ''}
                        onChange={(event) => onValueChange(parameter.id, event.target.value)}
                      />
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <HistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        parameters={parameters}
        entriesByParam={entriesByParam}
        onUpdateEntry={onUpdateEntry}
        onDeleteEntry={onDeleteEntry}
        onImportRows={onImportRows}
        exportFileName={exportFileName}
        clientName={clientName}
        clientBirthDate={clientBirthDate}
        clientHeight={clientHeight}
        clientGender={clientGender}
        readOnly={readOnly}
      />
    </div>
  )
}
