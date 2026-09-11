import clsx from 'clsx'
import { useToasts } from './toast'
import { useConfirm } from './confirm'
import { Modal } from './primitives'

export function Toaster() {
  const toasts = useToasts((s) => s.toasts)
  const remove = useToasts((s) => s.remove)
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => remove(t.id)}
          className={clsx(
            'pointer-events-auto animate-fade-in rounded-lg px-4 py-2 text-sm text-white shadow-lg',
            t.kind === 'error' ? 'bg-red-600' : t.kind === 'success' ? 'bg-emerald-600' : 'bg-slate-800',
          )}
        >
          {t.text}
        </button>
      ))}
    </div>
  )
}

export function ConfirmDialog() {
  const pending = useConfirm((s) => s.pending)
  const answer = useConfirm((s) => s.answer)
  return (
    <Modal
      open={!!pending}
      onClose={() => answer(false)}
      title={pending?.title}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={() => answer(false)}>
            Cancel
          </button>
          <button className={pending?.danger ? 'btn-danger' : 'btn-primary'} onClick={() => answer(true)} autoFocus>
            {pending?.confirmLabel ?? 'Confirm'}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">{pending?.message}</p>
    </Modal>
  )
}
