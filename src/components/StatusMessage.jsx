export default function StatusMessage({ type = 'info', children, className = '' }) {
  if (!children) return null

  const styles = {
    info: 'border-ledger/20 bg-ledger/5 text-ledger-dark',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    error: 'border-red-200 bg-red-50 text-red-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
  }

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={`rounded-lg border px-3.5 py-3 text-sm ${styles[type] || styles.info} ${className}`}
    >
      {children}
    </div>
  )
}
