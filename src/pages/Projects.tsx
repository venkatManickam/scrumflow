import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, FolderKanban, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useStore } from '../data/store'
import type { BoardColumn, Project, Status } from '../domain/types'
import { DEFAULT_COLUMNS, STATUSES, STATUS_LABEL } from '../domain/types'
import { uid } from '../data/db'
import { Avatar, EmptyState, Field, Modal, PageHeader } from '../ui/primitives'
import { confirmDialog } from '../ui/confirm'
import { toast } from '../ui/toast'

function deriveKey(name: string): string {
  const words = name.trim().split(/[\s\-_]+/).filter(Boolean)
  const k = words.length >= 2 ? words.map((w) => w[0]).join('') : (words[0] ?? '').slice(0, 4)
  return k.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
}

export function Projects() {
  const nav = useNavigate()
  const projects = useStore((s) => s.projects)
  const items = useStore((s) => s.items)
  const sprints = useStore((s) => s.sprints)
  const members = useStore((s) => s.members)
  const settings = useStore((s) => s.settings)
  const setCurrentProject = useStore((s) => s.setCurrentProject)
  const deleteProject = useStore((s) => s.deleteProject)
  const loadDemo = useStore((s) => s.loadDemo)
  const [newOpen, setNewOpen] = useState(false)
  const [editing, setEditing] = useState<Project | undefined>()

  const open = (p: Project) => {
    setCurrentProject(p.id)
    nav('/')
  }
  const remove = async (p: Project) => {
    const n = items.filter((i) => i.projectId === p.id).length
    const ok = await confirmDialog({ title: `Delete ${p.name}?`, message: `${n} work item${n === 1 ? '' : 's'}, all sprints, stand-ups and retros of this project will be deleted permanently.`, confirmLabel: 'Delete project', danger: true })
    if (!ok) return
    await deleteProject(p.id)
    toast(`${p.name} deleted`)
  }
  const demo = async () => {
    const ok = await confirmDialog({ title: 'Load the demo workspace?', message: 'This replaces everything currently stored in this browser with the fictional Acme Software workspace.', confirmLabel: 'Load demo' })
    if (!ok) return
    await loadDemo()
    toast('Demo workspace loaded', 'success')
    nav('/')
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={`${settings.orgName} · ${projects.length} project${projects.length === 1 ? '' : 's'}`}
        actions={
          <>
            {projects.length === 0 && (
              <button className="btn-secondary btn-sm" onClick={demo}>
                <Sparkles size={14} /> Load demo workspace
              </button>
            )}
            <button className="btn-primary btn-sm" onClick={() => setNewOpen(true)}>
              <Plus size={14} /> New project
            </button>
          </>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban />}
          title="Welcome to ScrumFlow"
          hint="Create your first project, or load the demo workspace to see a team mid-sprint with backlog, board, stand-ups, reports and a retrospective."
          action={
            <div className="flex gap-2">
              <button className="btn-primary" onClick={() => setNewOpen(true)}>
                Create project
              </button>
              <button className="btn-secondary" onClick={demo}>
                Load demo workspace
              </button>
            </div>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const pItems = items.filter((i) => i.projectId === p.id && i.type !== 'epic')
            const openItems = pItems.filter((i) => i.status !== 'done').length
            const pSprints = sprints.filter((s) => s.projectId === p.id)
            const active = pSprints.find((s) => s.status === 'active')
            const team = members.filter((m) => p.memberIds.includes(m.id))
            const current = settings.currentProjectId === p.id
            return (
              <div key={p.id} className={`card flex flex-col p-4 ${current ? 'ring-2 ring-brand-500/40' : ''}`}>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600 font-mono text-xs font-bold text-white">{p.key}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{p.name}</div>
                    <div className="line-clamp-2 text-xs text-slate-500">{p.description || 'No description'}</div>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-slate-50 py-1.5 dark:bg-slate-800/60">
                    <dt className="text-slate-500">Items</dt>
                    <dd className="font-semibold">{pItems.length}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 py-1.5 dark:bg-slate-800/60">
                    <dt className="text-slate-500">Open</dt>
                    <dd className="font-semibold">{openItems}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 py-1.5 dark:bg-slate-800/60">
                    <dt className="text-slate-500">Sprints</dt>
                    <dd className="font-semibold">{pSprints.length}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex -space-x-1.5">
                    {team.slice(0, 6).map((m) => (
                      <Avatar key={m.id} member={m} size="sm" className="ring-2 ring-white dark:ring-slate-900" />
                    ))}
                    {team.length > 6 && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] ring-2 ring-white dark:bg-slate-700 dark:ring-slate-900">+{team.length - 6}</span>}
                  </div>
                  <span className="ml-auto truncate text-xs text-slate-500">{active ? `▶ ${active.name}` : 'no active sprint'}</span>
                </div>
                <div className="mt-3 flex items-center gap-1 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <button className="btn-primary btn-sm" onClick={() => open(p)}>
                    Open
                  </button>
                  <button className="btn-secondary btn-sm" onClick={() => setEditing(p)}>
                    Edit
                  </button>
                  <button className="btn-ghost btn-sm ml-auto text-red-600" onClick={() => remove(p)} aria-label="Delete project">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <NewProjectModal open={newOpen} onClose={() => setNewOpen(false)} />
      <EditProjectModal project={editing} onClose={() => setEditing(undefined)} />
    </div>
  )
}

function NewProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addProject = useStore((s) => s.addProject)
  const setCurrentProject = useStore((s) => s.setCurrentProject)
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [keyTouched, setKeyTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [length, setLength] = useState('14')
  useEffect(() => {
    if (open) {
      setName('')
      setKey('')
      setKeyTouched(false)
      setDescription('')
      setLength('14')
    }
  }, [open])
  const submit = () => {
    if (!name.trim()) {
      toast('Project name is required', 'error')
      return
    }
    const k = (key || deriveKey(name)).toUpperCase()
    if (!k) {
      toast('Project key is required', 'error')
      return
    }
    const p = addProject({ name: name.trim(), key: k, description: description.trim(), sprintLengthDays: Math.max(1, Number(length) || 14) })
    setCurrentProject(p.id)
    toast(`${p.name} created`, 'success')
    onClose()
    nav('/backlog')
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New project"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit}>
            Create project
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_120px]">
        <Field label="Name">
          <input
            className="input"
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (!keyTouched) setKey(deriveKey(e.target.value))
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            placeholder="e.g. Mobile Banking App"
          />
        </Field>
        <Field label="Key" hint="Item ids: KEY-1">
          <input
            className="input font-mono uppercase"
            value={key}
            maxLength={8}
            onChange={(e) => {
              setKeyTouched(true)
              setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
            }}
          />
        </Field>
        <Field label="Description" className="md:col-span-2">
          <textarea className="input min-h-[70px]" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Sprint length (days)">
          <input className="input" type="number" min={1} max={60} value={length} onChange={(e) => setLength(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function EditProjectModal({ project, onClose }: { project?: Project; onClose: () => void }) {
  const updateProject = useStore((s) => s.updateProject)
  const members = useStore((s) => s.members)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [description, setDescription] = useState('')
  const [length, setLength] = useState('14')
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [columns, setColumns] = useState<BoardColumn[]>([])
  useEffect(() => {
    if (!project) return
    setName(project.name)
    setKey(project.key)
    setDescription(project.description)
    setLength(String(project.sprintLengthDays))
    setMemberIds(project.memberIds)
    setColumns(project.columns.length ? project.columns : DEFAULT_COLUMNS)
  }, [project])

  const columnsValid = useMemo(() => columns.length >= 2 && columns.some((c) => c.status === 'done') && columns.some((c) => c.status !== 'done') && columns.every((c) => c.name.trim()), [columns])

  if (!project) return null
  const setCol = (i: number, patch: Partial<BoardColumn>) => setColumns((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const move = (i: number, d: -1 | 1) =>
    setColumns((cs) => {
      const j = i + d
      if (j < 0 || j >= cs.length) return cs
      const n = [...cs]
      ;[n[i], n[j]] = [n[j], n[i]]
      return n
    })
  const submit = () => {
    if (!name.trim()) {
      toast('Project name is required', 'error')
      return
    }
    const k = key.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
    if (!k) {
      toast('Project key is required', 'error')
      return
    }
    if (!columnsValid) {
      toast('Board needs at least one Done column and one other column, all named', 'error')
      return
    }
    updateProject(project.id, { name: name.trim(), key: k, description: description.trim(), sprintLengthDays: Math.max(1, Number(length) || 14), memberIds, columns: columns.map((c) => ({ ...c, name: c.name.trim(), wip: c.wip && c.wip > 0 ? c.wip : undefined })) })
    toast('Project saved', 'success')
    onClose()
  }
  return (
    <Modal
      open={!!project}
      onClose={onClose}
      title={`Edit ${project.key}`}
      size="xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit}>
            Save
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <Field label="Name">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Key">
              <input className="input font-mono uppercase" value={key} maxLength={8} onChange={(e) => setKey(e.target.value.toUpperCase())} />
            </Field>
          </div>
          <Field label="Description">
            <textarea className="input min-h-[60px]" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Sprint length (days)">
            <input className="input" type="number" min={1} max={60} value={length} onChange={(e) => setLength(e.target.value)} />
          </Field>
          <div>
            <div className="label">Members</div>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
              {members.length === 0 && <div className="text-xs text-slate-500">No members yet — add them on the Team page.</div>}
              {members.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={memberIds.includes(m.id)} onChange={(e) => setMemberIds((ids) => (e.target.checked ? [...ids, m.id] : ids.filter((x) => x !== m.id)))} />
                  <Avatar member={m} size="xs" /> {m.name}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <div className="label mb-0">Board columns</div>
            <button className="btn-ghost btn-sm" onClick={() => setColumns((cs) => [...cs, { id: uid(), name: 'New column', status: 'todo' }])}>
              <Plus size={14} /> Add column
            </button>
          </div>
          <div className="space-y-1.5">
            {columns.map((c, i) => (
              <div key={c.id} className="grid grid-cols-[1fr_120px_60px_auto] items-center gap-1.5">
                <input className="input input-sm" value={c.name} onChange={(e) => setCol(i, { name: e.target.value })} />
                <select className="input input-sm" value={c.status} onChange={(e) => setCol(i, { status: e.target.value as Status })}>
                  {STATUSES.filter((s) => s !== 'backlog').map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                <input className="input input-sm" type="number" min={0} placeholder="WIP" value={c.wip ?? ''} onChange={(e) => setCol(i, { wip: e.target.value === '' ? undefined : Number(e.target.value) })} title="WIP limit" />
                <div className="flex">
                  <button className="btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                    <ArrowUp size={12} />
                  </button>
                  <button className="btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === columns.length - 1} aria-label="Move down">
                    <ArrowDown size={12} />
                  </button>
                  <button className="btn-ghost btn-sm text-red-500" onClick={() => setColumns((cs) => cs.filter((_, j) => j !== i))} aria-label="Remove column">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {!columnsValid && <div className="mt-2 text-xs text-red-600">Keep at least one Done column and one other column, each with a name.</div>}
          <p className="mt-2 text-[11px] text-slate-500">Each column maps to a status. Cards dropped into a column take that status. WIP = max cards before the column turns amber.</p>
        </div>
      </div>
    </Modal>
  )
}
