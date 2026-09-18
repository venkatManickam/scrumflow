import { useEffect, type ReactNode } from 'react'
import clsx from 'clsx'
import { X } from 'lucide-react'
import type { Member, Priority, Status, ItemType } from '../domain/types'
import { PRIORITY_LABEL, STATUS_LABEL, ITEM_TYPE_LABEL } from '../domain/types'

/* ---------- Avatar ---------- */

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

export function Avatar({ member, size = 'md', className }: { member?: Member | null; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const sz = { xs: 'h-5 w-5 text-[9px]', sm: 'h-6 w-6 text-[10px]', md: 'h-8 w-8 text-xs', lg: 'h-12 w-12 text-base' }[size]
  if (!member) {
    return (
      <span title="Unassigned" className={clsx('inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-slate-400 text-slate-400', sz, className)}>
        ?
      </span>
    )
  }
  return (
    <span title={member.name} className={clsx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', sz, className)} style={{ background: member.color }}>
      {initials(member.name)}
    </span>
  )
}

/* ---------- Badges ---------- */

const STATUS_CLASS: Record<Status, string> = {
  backlog: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  todo: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  inprogress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  review: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  testing: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  blocked: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
}
export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return <span className={clsx('inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium', STATUS_CLASS[status], className)}>{STATUS_LABEL[status]}</span>
}

const PRIORITY_CLASS: Record<Priority, string> = {
  critical: 'text-red-600 dark:text-red-400',
  high: 'text-orange-600 dark:text-orange-400',
  medium: 'text-amber-600 dark:text-amber-400',
  low: 'text-slate-500 dark:text-slate-400',
}
const PRIORITY_GLYPH: Record<Priority, string> = { critical: '‼', high: '↑', medium: '=', low: '↓' }
export function PriorityBadge({ priority, showLabel = false, className }: { priority: Priority; showLabel?: boolean; className?: string }) {
  return (
    <span title={PRIORITY_LABEL[priority]} className={clsx('inline-flex items-center gap-1 text-xs font-bold', PRIORITY_CLASS[priority], className)}>
      <span>{PRIORITY_GLYPH[priority]}</span>
      {showLabel && <span className="font-medium">{PRIORITY_LABEL[priority]}</span>}
    </span>
  )
}

const TYPE_CLASS: Record<ItemType, string> = {
  epic: 'bg-purple-600',
  story: 'bg-emerald-600',
  task: 'bg-sky-600',
  bug: 'bg-red-600',
}
const TYPE_GLYPH: Record<ItemType, string> = { epic: '⚡', story: '▣', task: '✓', bug: '●' }
export function TypeIcon({ type, className }: { type: ItemType; className?: string }) {
  return (
    <span title={ITEM_TYPE_LABEL[type]} className={clsx('inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] text-white', TYPE_CLASS[type], className)}>
      {TYPE_GLYPH[type]}
    </span>
  )
}

export function Points({ value, className }: { value?: number; className?: string }) {
  if (value === undefined || value === null) return <span className={clsx('rounded-full border border-dashed border-slate-300 px-1.5 text-[10px] text-slate-400 dark:border-slate-600', className)}>–</span>
  return <span className={clsx('rounded-full bg-slate-200 px-1.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200', className)}>{value}</span>
}

export function Label({ text }: { text: string }) {
  return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{text}</span>
}

/* ---------- Layout bits ---------- */

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ title, children, className, actions, padded = true }: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode; padded?: boolean }) {
  return (
    <section className={clsx('card', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h2>
          {actions}
        </header>
      )}
      <div className={clsx(padded && 'p-4')}>{children}</div>
    </section>
  )
}

export function KPI({ label, value, hint, tone = 'default' }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'good' | 'warn' | 'bad' }) {
  const toneClass = { default: 'text-slate-900 dark:text-white', good: 'text-emerald-600 dark:text-emerald-400', warn: 'text-amber-600 dark:text-amber-400', bad: 'text-red-600 dark:text-red-400' }[tone]
  return (
    <div className="card px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className={clsx('mt-1 text-2xl font-semibold tabular-nums', toneClass)}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
    </div>
  )
}

export function Progress({ value, max = 100, tone = 'brand', className }: { value: number; max?: number; tone?: 'brand' | 'good' | 'warn' | 'bad'; className?: string }) {
  const pctv = max ? Math.min(100, Math.round((value / max) * 100)) : 0
  const color = { brand: 'bg-brand-500', good: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-red-500' }[tone]
  return (
    <div className={clsx('h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700', className)}>
      <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${pctv}%` }} />
    </div>
  )
}

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center dark:border-slate-700">
      {icon && <div className="text-3xl text-slate-400">{icon}</div>}
      <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</div>
      {hint && <div className="max-w-sm text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

/* ---------- Modal / Drawer ---------- */

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEscape(onClose)
  if (!open) return null
  const w = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size]
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-[8vh] backdrop-blur-[1px]" onMouseDown={onClose} role="dialog" aria-modal="true">
      <div className={clsx('card animate-fade-in w-full', w)} onMouseDown={(e) => e.stopPropagation()}>
        {title && (
          <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
            <h2 className="text-base font-semibold">{title}</h2>
            <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </header>
        )}
        <div className="px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">{footer}</footer>}
      </div>
    </div>
  )
}

export function Drawer({ open, onClose, title, children, width = 'max-w-2xl', placement = 'right' }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; width?: string; placement?: 'right' | 'center' }) {
  useEscape(onClose)
  if (!open) return null
  const centered = placement === 'center'
  return (
    <div className={clsx('fixed inset-0 z-40 flex bg-slate-900/40', centered ? 'items-center justify-center p-3 md:p-6' : 'justify-end')} onMouseDown={onClose}>
      <div
        className={clsx('flex w-full flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-900', centered ? 'animate-fade-in h-full max-h-[92vh] rounded-2xl border border-slate-200 dark:border-slate-800' : 'h-full', width)}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
            <div className="min-w-0 flex-1">{title}</div>
            <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </header>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

export function RiskPill({ risk }: { risk: 'low' | 'medium' | 'high' | 'none' }) {
  const cls = {
    low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    high: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    none: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  }[risk]
  const label = { low: 'On track', medium: 'At risk', high: 'High risk', none: 'Not started' }[risk]
  return <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', cls)}>{label}</span>
}
