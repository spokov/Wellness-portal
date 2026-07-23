import { useLanguage } from '../lib/i18n.jsx'
import Modal from './Modal.jsx'

export default function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  loading = false,
}) {
  const { t } = useLanguage()

  return (
    <Modal
      open={open}
      onClose={() => !loading && onCancel?.()}
      titleId="confirm-dialog-title"
      maxWidth="max-w-md"
      closeOnBackdrop={!loading}
    >
      <div className="p-6">
        <p id="confirm-dialog-title" className="font-display text-xl font-semibold text-ink">
          {title}
        </p>
        <p className="mt-2 text-sm leading-6 text-ink-soft">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={loading} className="btn-secondary">
            {t('cancel')}
          </button>
          <button type="button" onClick={onConfirm} disabled={loading} className="btn-danger">
            {loading ? t('saving') : t('delete')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
