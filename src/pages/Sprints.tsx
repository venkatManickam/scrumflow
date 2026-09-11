import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import clsx from 'clsx'
import { ArrowLeft, ArrowRight, CheckCircle2, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../data/store'
import { useCurrentProject, useMemberMap, useProjectItems, useProjectMembers, useProjectSprints, useVelocityHistory } from '../data/hooks'
import type { Member, Sprint, WorkItem } from '../domain/types'
import { itemKey } from '../domain/types'
import { averageVelocity, sumPoints, workload } from '../domain/metrics'
import { dayKey, niceDate, shiftDays } from '../domain/dates'
import { Avatar, Card, EmptyState, Field, Modal, PageHeader, Points, PriorityBadge, Progress, TypeIcon } from '../ui/primitives'
import { toast } from '../ui/toast'
import { confirmDialog } from '../ui/confirm'
import { useItemDrawer } from '../app/useItemDrawer'

const byRank = (a: WorkItem, b: WorkItem) => a.rank - b.rank || a.number - b.number

interface SprintFormState {
  name: string
  goal: string
  startDate: string
  endDate: string
  capacity: string
}

export function Sprints() {
  const project = useCurrentProject()
  const items = useProjectItems(project?.id)
  const sprints = useProjectSprints(project?.id)
  const members = useProjectMembers(project)
  const memberMap = useMemberMap()
  const history = useVelocityHistory(project?.id)
  const createSprint = useStore((s) => s.createSprint)
  const updateSprint = useStore((s) => s.updateSprint)
  const deleteSprint = useStore((s) => s.deleteSprint)
  const startSprint = useStore((s) => s.startSprint)
  const completeSprint = useStore((s) => s.completeSprint)
  const updateItem = useStore((s) => s.updateItem)
  const drawer = useItemDrawer()

  const [selectedId, setSelectedId] = useState<string>('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Sprint | null>(null)
  const [form, setForm] = useState<SprintFormState>({ name: '', goal: '', startDate: '', endDate: '', capacity: '' })
  const [completing, setCompleting] = useState<Sprint | null>(null)
  const [moveTarget, setMoveTarget] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const selected = useMemo(() => sprints.find((s) => s.id === selectedId) ?? sprints.find((s) => s.status === 'active') ?? sprints.find((s) => s.status === 'planned'), [sprints, selectedId])

  const backlogItems = useMemo(() => items.filter((i) => !i.sprintId && i.type !== 'epic' && i.status !== 'done').sort(byRank), [items])
  const sprintList = useMemo(() => (selected ? items.filter((i) => i.sprintId === selected.id && i.type !== 'epic').sort(byRank) : []), [items, selected])
  const committed = sumPoints(sprintList)
  const avgVel = averageVelocity(history)
  const wl = useMemo(() => (selected ? workload(selected, items, members) : []), [selected, items, members])

  if (!project) {
    return (
      <EmptyState
        title="No project selected"
        hint="Create a project before planning sprints."
        action={
          <Link to="/projects" className="btn-primary">
            Go to projects
          </Link>
        }
      />
    )
  }

  const openNew = () => {
    const last = [...sprints].sort((a, b) => a.endDate.localeCompare(b.endDate)).at(-1)
    const start = last ? dayKey(shiftDays(last.endDate, 1)) : dayKey()
    const end = dayKey(shiftDays(start, Math.max(1, project.sprintLengthDays) - 1))
    const cap = members.filter((m) => m.active).reduce((a, m) => a + m.capacity, 0)
    setEditing(null)
    setForm({ name: `Sprint ${sprints.length + 1}`, goal: '', startDate: start, endDate: end, capacity: String(cap) })
    setFormOpen(true)
  }
  const openEdit = (s: Sprint) => {
    setEditing(s)
    setForm({ name: s.name, goal: s.goal, startDate: s.startDate, endDate: s.endDate, capacity: String(s.capacity) })
    setFormOpen(true)
  }
  const submitForm = () => {
    if (!form.name.trim() || !form.startDate || !form.endDate) {
      toast('Name, start and end dates are required', 'error')
      return
    }
    if (form.endDate < form.startDate) {
      toast('End date must be after start date', 'error')
      return
    }
    const cap = Number(form.capacity) || 0
    if (editing) {
      updateSprint(editing.id, { name: form.name.trim(), goal: form.goal, startDate: form.startDate, endDate: form.endDate, capacity: cap })
      toast('Sprint updated', 'success')
    } else {
      const s = createSprint({ projectId: project.id, name: form.name.trim(), goal: form.goal, startDate: form.startDate, endDate: form.endDate, capacity: cap })
      setSelectedId(s.id)
      toast(`${s.name} created`, 'success')
    }
    setFormOpen(false)
  }

  const onStart = (s: Sprint) => {
    const err = startSprint(s.id)
    if (err) toast(err, 'error')
    else toast(`${s.name} started`, 'success')
  }
  const openComplete = (s: Sprint) => {
    const next = sprints.find((x) => x.status === 'planned' && x.id !== s.id)
    setMoveTarget(next?.id ?? '')
    setCompleting(s)
  }
  const doComplete = () => {
    if (!completing) return
    completeSprint(completing.id, moveTarget || undefined)
    toast(`${completing.name} completed`, 'success')
    setCompleting(null)
  }
  const onDelete = async (s: Sprint) => {
    const ok = await confirmDialog({ title: `Delete ${s.name}?`, message: 'Its items go back to the backlog. Retro notes for this sprint are removed.', confirmLabel: 'Delete', danger: true })
    if (!ok) return
    deleteSprint(s.id)
    if (selectedId === s.id) setSelectedId('')
    toast('Sprint deleted')
  }

  const onDragEnd = (e: DragEndEvent) => {
    setDragId(null)
    const { active, over } = e
    if (!over || !selected) return
    const id = String(active.id)
    const item = items.find((i) => i.id === id)
    if (!item) return
    if (over.id === 'sprint' && item.sprintId !== selected.id) updateItem(id, { sprintId: selected.id })
    else if (over.id === 'backlog' && item.sprintId) updateItem(id, { sprintId: undefined })
  }

  const dragItem = dragId ? items.find((i) => i.id === dragId) : null
  const util = selected?.capacity ? Math.round((committed / selected.capacity) * 100) : 0
  const tone = util > 100 ? 'bad' : util > 85 ? 'warn' : 'brand'

  return (
    <div>
      <PageHeader
        title="Sprints"
        subtitle="Plan the next sprint, start it, and close it when the time-box ends."
        actions={
          <button className="btn-primary" onClick={openNew}>
            <Plus size={14} /> New sprint
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
        {/* sprint list */}
        <div className="space-y-3">
          {sprints.length === 0 && <EmptyState title="No sprints yet" hint="Create the first sprint to start planning." action={<button className="btn-primary" onClick={openNew}>New sprint</button>} />}
          {[...sprints].reverse().map((s) => {
            const its = items.filter((i) => i.sprintId === s.id && i.type !== 'epic')
            const sp = sumPoints(its)
            const done = sumPoints(its.filter((i) => i.status === 'done'))
            const isSel = selected?.id === s.id
            return (
              <div key={s.id} role="button" tabIndex={0} className={clsx('card w-full cursor-pointer p-3 text-left transition', isSel ? 'ring-2 ring-brand-500' : 'hover:border-slate-300 dark:hover:border-slate-700')} onClick={() => setSelectedId(s.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(s.id) } }}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{s.name}</span>
                  <span
                    className={clsx(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      s.status === 'active' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
                      s.status === 'planned' && 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
                      s.status === 'completed' && 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                    )}
                  >
                    {s.status}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {niceDate(s.startDate)} → {niceDate(s.endDate)}
                </div>
                {s.goal && <div className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{s.goal}</div>}
                <div className="mt-2 text-xs text-slate-500">
                  {s.status === 'completed' ? (
                    <>
                      {s.completedPoints ?? done} / {s.committedPoints ?? sp} SP delivered
                    </>
                  ) : s.status === 'active' ? (
                    <>
                      {done} / {sp} SP done · committed {s.committedPoints ?? sp}
                    </>
                  ) : (
                    <>
                      {sp} SP planned{s.capacity ? ` / ${s.capacity} capacity` : ''}
                    </>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                  {s.status === 'planned' && (
                    <button className="btn-secondary btn-sm" onClick={() => onStart(s)}>
                      <Play size={12} /> Start
                    </button>
                  )}
                  {s.status === 'active' && (
                    <button className="btn-secondary btn-sm" onClick={() => openComplete(s)}>
                      <CheckCircle2 size={12} /> Complete
                    </button>
                  )}
                  <button className="btn-ghost btn-sm" onClick={() => openEdit(s)}>
                    <Pencil size={12} /> Edit
                  </button>
                  <button className="btn-ghost btn-sm text-red-600" onClick={() => onDelete(s)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* planning workspace */}
        {selected ? (
          <div className="space-y-4">
            <Card title={`${selected.name} · capacity`}>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Field label="Planned capacity (SP)">
                  <input className="input input-sm" type="number" min={0} key={selected.id} defaultValue={selected.capacity} onBlur={(e) => Number(e.target.value) !== selected.capacity && updateSprint(selected.id, { capacity: Number(e.target.value) || 0 })} />
                </Field>
                <div>
                  <div className="label">Committed</div>
                  <div className="text-xl font-semibold tabular-nums">{committed} SP</div>
                </div>
                <div>
                  <div className="label">Available</div>
                  <div className={clsx('text-xl font-semibold tabular-nums', selected.capacity - committed < 0 && 'text-red-600')}>{selected.capacity - committed} SP</div>
                </div>
                <div>
                  <div className="label">Utilization</div>
                  <div className="text-xl font-semibold tabular-nums">{util}%</div>
                </div>
              </div>
              <Progress value={committed} max={selected.capacity || 1} tone={tone} className="mt-3" />
              {selected.capacity > 0 && committed > selected.capacity && <div className="mt-2 text-xs font-medium text-red-600">Committed work exceeds capacity by {committed - selected.capacity} SP.</div>}
              {avgVel > 0 && (
                <div className="mt-2 text-xs text-slate-500">
                  Avg velocity {avgVel} SP
                  {committed > avgVel * 1.15 && <span className="ml-1 text-amber-600">— this plan is {Math.round(((committed - avgVel) / avgVel) * 100)}% above it.</span>}
                </div>
              )}
              <Field label="Sprint goal" className="mt-3">
                <textarea className="input min-h-[60px]" key={selected.id + selected.goal} defaultValue={selected.goal} onBlur={(e) => e.target.value !== selected.goal && updateSprint(selected.id, { goal: e.target.value })} placeholder="What must be true at the end of this sprint?" />
              </Field>
            </Card>

            <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setDragId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <DropColumn id="backlog" title="Backlog" count={backlogItems.length} sp={sumPoints(backlogItems)}>
                  {backlogItems.length === 0 && <div className="p-4 text-center text-xs text-slate-500">Backlog is empty.</div>}
                  {backlogItems.map((i) => (
                    <PlanCard key={i.id} item={i} project={project} assignee={memberMap.get(i.assigneeId ?? '')} onOpen={() => drawer.open(i.id)} action={<button className="btn-ghost btn-sm" title="Add to sprint" onClick={() => updateItem(i.id, { sprintId: selected.id })}><ArrowRight size={14} /></button>} />
                  ))}
                </DropColumn>
                <DropColumn id="sprint" title={selected.name} count={sprintList.length} sp={committed} over={selected.capacity > 0 && committed > selected.capacity}>
                  {sprintList.length === 0 && <div className="p-4 text-center text-xs text-slate-500">Drag backlog items here.</div>}
                  {sprintList.map((i) => (
                    <PlanCard key={i.id} item={i} project={project} assignee={memberMap.get(i.assigneeId ?? '')} onOpen={() => drawer.open(i.id)} action={<button className="btn-ghost btn-sm" title="Back to backlog" onClick={() => updateItem(i.id, { sprintId: undefined })}><ArrowLeft size={14} /></button>} />
                  ))}
                </DropColumn>
              </div>
              <DragOverlay>{dragItem ? <PlanCard item={dragItem} project={project} assignee={memberMap.get(dragItem.assigneeId ?? '')} overlay /> : null}</DragOverlay>
            </DndContext>

            <Card title="Team load">
              {wl.length === 0 ? (
                <div className="text-xs text-slate-500">No active members.</div>
              ) : (
                <ul className="space-y-2">
                  {wl.map((r) => (
                    <li key={r.member.id} className="flex items-center gap-3 text-sm">
                      <Avatar member={r.member} size="sm" />
                      <span className="w-36 truncate">{r.member.name}</span>
                      <Progress value={r.assigned} max={r.capacity || Math.max(r.assigned, 1)} tone={r.utilization !== null && r.utilization > 1 ? 'bad' : r.utilization !== null && r.utilization > 0.85 ? 'warn' : 'brand'} className="flex-1" />
                      <span className="w-28 text-right text-xs tabular-nums text-slate-500">
                        {r.assigned} / {r.capacity || '–'} SP{r.utilization !== null ? ` · ${Math.round(r.utilization * 100)}%` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        ) : (
          <EmptyState title="Select or create a sprint" hint="The planning workspace shows the backlog next to the selected sprint." />
        )}
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'New sprint'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={submitForm}>
              {editing ? 'Save' : 'Create'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Name" className="md:col-span-2">
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </Field>
          <Field label="Goal" className="md:col-span-2">
            <textarea className="input min-h-[70px]" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} />
          </Field>
          <Field label="Start date">
            <input className="input" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </Field>
          <Field label="End date">
            <input className="input" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </Field>
          <Field label="Capacity (SP)" hint="Sum of active members' capacity by default">
            <input className="input" type="number" min={0} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!completing}
        onClose={() => setCompleting(null)}
        title={`Complete ${completing?.name ?? ''}`}
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCompleting(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={doComplete}>
              Complete sprint
            </button>
          </>
        }
      >
        {completing && (
          <div className="space-y-3 text-sm">
            <p>
              {items.filter((i) => i.sprintId === completing.id && i.type !== 'epic' && i.status !== 'done').length} unfinished item(s) will be moved. Completed points are snapshotted for velocity.
            </p>
            <Field label="Move unfinished items to">
              <select className="input" value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)}>
                <option value="">Backlog</option>
                {sprints.filter((s) => s.status === 'planned' && s.id !== completing.id).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </Modal>
    </div>
  )
}

function DropColumn({ id, title, count, sp, over, children }: { id: string; title: string; count: number; sp: number; over?: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={clsx('card flex min-h-[240px] flex-col transition', isOver && 'ring-2 ring-brand-400')}>
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm font-semibold dark:border-slate-800">
        {title}
        <span className={clsx('ml-auto text-xs font-normal', over ? 'font-semibold text-red-600' : 'text-slate-500')}>
          {count} · {sp} SP
        </span>
      </div>
      <div className="flex-1 space-y-1.5 p-2">{children}</div>
    </div>
  )
}

function PlanCard({ item, project, assignee, onOpen, action, overlay }: { item: WorkItem; project: { key: string }; assignee?: Member; onOpen?: () => void; action?: React.ReactNode; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id, disabled: overlay })
  return (
    <div ref={overlay ? undefined : setNodeRef} {...(overlay ? {} : attributes)} {...(overlay ? {} : listeners)} className={clsx('flex cursor-grab items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-800', isDragging && 'opacity-40', overlay && 'shadow-lg ring-2 ring-brand-400')}>
      <TypeIcon type={item.type} />
      <span className="font-mono text-[11px] text-slate-500">{itemKey(project, item)}</span>
      <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={onOpen} onPointerDown={(e) => e.stopPropagation()}>
        {item.title}
      </button>
      <PriorityBadge priority={item.priority} />
      <Points value={item.points} />
      <Avatar member={assignee} size="xs" />
      {action && <span onPointerDown={(e) => e.stopPropagation()}>{action}</span>}
    </div>
  )
}
