import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useStore } from '../data/store'
import { useCurrentProject } from '../data/hooks'
import { itemKey } from '../domain/types'
import { StatusBadge, TypeIcon, Avatar } from '../ui/primitives'
import { useItemDrawer } from './useItemDrawer'

interface Entry {
  id: string
  group: 'Navigate' | 'Work items' | 'Projects' | 'People' | 'Actions'
  label: string
  hint?: string
  node?: React.ReactNode
  run: () => void
}

export const NAV: { to: string; label: string }[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/backlog', label: 'Backlog' },
  { to: '/sprints', label: 'Sprints' },
  { to: '/board', label: 'Board' },
  { to: '/standup', label: 'Stand-up' },
  { to: '/reports', label: 'Reports' },
  { to: '/retro', label: 'Retrospective' },
  { to: '/team', label: 'Team' },
  { to: '/projects', label: 'Projects' },
  { to: '/shared', label: 'Shared workspaces' },
  { to: '/settings', label: 'Settings' },
]

export function CommandPalette({ open, onClose, onNewItem }: { open: boolean; onClose: () => void; onNewItem: () => void }) {
  const nav = useNavigate()
  const project = useCurrentProject()
  const items = useStore((s) => s.items)
  const projects = useStore((s) => s.projects)
  const members = useStore((s) => s.members)
  const setCurrentProject = useStore((s) => s.setCurrentProject)
  const updateSettings = useStore((s) => s.updateSettings)
  const drawer = useItemDrawer()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setIdx(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  const entries = useMemo<Entry[]>(() => {
    const term = q.trim().toLowerCase()
    const out: Entry[] = []
    const go = (to: string) => () => {
      nav(to)
      onClose()
    }
    NAV.forEach((n) => out.push({ id: 'nav' + n.to, group: 'Navigate', label: n.label, run: go(n.to) }))
    out.push({ id: 'act-new', group: 'Actions', label: 'New work item', hint: 'N', run: () => { onClose(); onNewItem() } })
    projects.forEach((p) => out.push({ id: 'p' + p.id, group: 'Projects', label: `${p.key} · ${p.name}`, hint: p.id === project?.id ? 'current' : 'switch', run: () => { setCurrentProject(p.id); onClose() } }))
    members.forEach((m) => out.push({ id: 'm' + m.id, group: 'People', label: m.name, hint: 'act as', node: <Avatar member={m} size="xs" />, run: () => { updateSettings({ currentMemberId: m.id }); onClose() } }))
    const projItems = items.filter((i) => i.projectId === project?.id)
    const pool = term ? projItems : projItems.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8)
    pool.forEach((i) =>
      out.push({
        id: 'i' + i.id,
        group: 'Work items',
        label: `${itemKey(project, i)} ${i.title}`,
        node: (
          <span className="flex items-center gap-2">
            <TypeIcon type={i.type} />
            <StatusBadge status={i.status} />
          </span>
        ),
        run: () => {
          drawer.open(i.id)
          onClose()
        },
      }),
    )
    if (!term) return out.filter((e) => e.group !== 'People' || members.length <= 12)
    const words = term.split(/\s+/)
    return out.filter((e) => words.every((w) => e.label.toLowerCase().includes(w)))
  }, [q, items, projects, members, project, nav, onClose, onNewItem, setCurrentProject, updateSettings, drawer])

  useEffect(() => setIdx(0), [q])

  if (!open) return null
  const grouped = entries.reduce<Record<string, Entry[]>>((acc, e) => {
    ;(acc[e.group] ??= []).push(e)
    return acc
  }, {})
  const flat = Object.values(grouped).flat()

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 pt-[12vh]" onMouseDown={onClose}>
      <div className="card animate-fade-in w-full max-w-xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 dark:border-slate-800">
          <Search size={16} className="text-slate-400" />
          <input
            ref={inputRef}
            className="w-full bg-transparent py-3 text-sm focus:outline-none"
            placeholder="Search work items, jump to a page, switch project or person…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setIdx((i) => Math.min(flat.length - 1, i + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setIdx((i) => Math.max(0, i - 1))
              } else if (e.key === 'Enter') {
                flat[idx]?.run()
              }
            }}
          />
          <span className="kbd">esc</span>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {flat.length === 0 && <div className="px-4 py-6 text-center text-sm text-slate-500">No matches.</div>}
          {Object.entries(grouped).map(([group, list]) => (
            <div key={group}>
              <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{group}</div>
              {list.map((e) => {
                const i = flat.indexOf(e)
                return (
                  <button
                    key={e.id}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${i === idx ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    onMouseEnter={() => setIdx(i)}
                    onClick={e.run}
                  >
                    {e.node}
                    <span className="min-w-0 flex-1 truncate">{e.label}</span>
                    {e.hint && <span className="text-xs text-slate-400">{e.hint}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
