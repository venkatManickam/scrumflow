import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import clsx from 'clsx'
import { AlertOctagon, Plus } from 'lucide-react'
import { useStore } from '../data/store'
import { useCurrentProject, useMemberMap, useProjectItems, useProjectMembers, useProjectSprints, useVelocityHistory } from '../data/hooks'
import type { BoardColumn, ItemType, Member, Status, WorkItem } from '../domain/types'
import { ITEM_TYPES, ITEM_TYPE_LABEL, itemKey } from '../domain/types'
import { sprintHealth, sumPoints } from '../domain/metrics'
import { dayKey, daysBetween, niceDate, shortDate } from '../domain/dates'
import { Avatar, EmptyState, Label, PageHeader, Points, PriorityBadge, Progress, RiskPill, TypeIcon } from '../ui/primitives'
import { ItemForm, type ItemFormDefaults } from '../app/ItemForm'
import { useItemDrawer } from '../app/useItemDrawer'

const byRank = (a: WorkItem, b: WorkItem) => a.rank - b.rank || a.number - b.number
const BACKLOG_COL: BoardColumn = { id: '__backlog', name: 'Backlog', status: 'backlog' }

export function Board() {
  const project = useCurrentProject()
  const items = useProjectItems(project?.id)
  const sprints = useProjectSprints(project?.id)
  const members = useProjectMembers(project)
  const memberMap = useMemberMap()
  const history = useVelocityHistory(project?.id)
  const currentMemberId = useStore((s) => s.settings.currentMemberId)
  const updateItem = useStore((s) => s.updateItem)
  const drawer = useItemDrawer()

  const [sprintId, setSprintId] = useState('')
  const [search, setSearch] = useState('')
  const [assignees, setAssignees] = useState<Set<string>>(new Set())
  const [typeFilter, setTypeFilter] = useState<ItemType | ''>('')
  const [swimlanes, setSwimlanes] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [formDefaults, setFormDefaults] = useState<ItemFormDefaults | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const sprint = useMemo(() => sprints.find((s) => s.id === sprintId) ?? sprints.find((s) => s.status === 'active') ?? sprints.find((s) => s.status === 'planned') ?? sprints.at(-1), [sprints, sprintId])

  const sprintItems = useMemo(() => (sprint ? items.filter((i) => i.sprintId === sprint.id && i.type !== 'epic').sort(byRank) : []), [items, sprint])
  const filtered = useMemo(
    () =>
      sprintItems.filter((i) => {
        if (typeFilter && i.type !== typeFilter) return false
        if (assignees.size && !assignees.has(i.assigneeId ?? '')) return false
        if (search) {
          const q = search.toLowerCase()
          if (!i.title.toLowerCase().includes(q) && !itemKey(project, i).toLowerCase().includes(q)) return false
        }
        return true
      }),
    [sprintItems, typeFilter, assignees, search, project],
  )

  const columns = useMemo(() => {
    if (!project) return []
    const known = new Set(project.columns.map((c) => c.status))
    const needBacklog = sprintItems.some((i) => !known.has(i.status))
    return needBacklog ? [BACKLOG_COL, ...project.columns] : project.columns
  }, [project, sprintItems])

  const health = useMemo(() => (sprint ? sprintHealth(sprint, items, members, history) : null), [sprint, items, members, history])
  const childCounts = useMemo(() => {
    const m = new Map<string, { total: number; done: number }>()
    for (const i of items) {
      if (!i.parentId) continue
      const c = m.get(i.parentId) ?? { total: 0, done: 0 }
      c.total++
      if (i.status === 'done') c.done++
      m.set(i.parentId, c)
    }
    return m
  }, [items])

  if (!project) {
    return (
      <EmptyState
        title="No project selected"
        hint="Create a project to use the board."
        action={
          <Link to="/projects" className="btn-primary">
            Go to projects
          </Link>
        }
      />
    )
  }
  if (!sprint) {
    return (
      <EmptyState
        title="No sprint to show"
        hint="Create and start a sprint to see its board."
        action={
          <Link to="/sprints" className="btn-primary">
            Go to sprints
          </Link>
        }
      />
    )
  }

  const onDragEnd = (e: DragEndEvent) => {
    setDragId(null)
    const { active, over } = e
    if (!over) return
    const [colId] = String(over.id).split('::')
    const col = columns.find((c) => c.id === colId)
    const item = items.find((i) => i.id === String(active.id))
    if (!col || !item || item.status === col.status) return
    updateItem(item.id, { status: col.status })
  }

  const columnItems = (col: BoardColumn, list: WorkItem[]) => {
    const known = new Set(project.columns.map((c) => c.status))
    return col.id === BACKLOG_COL.id ? list.filter((i) => !known.has(i.status)) : list.filter((i) => i.status === col.status)
  }

  const total = sumPoints(sprintItems)
  const done = sumPoints(sprintItems.filter((i) => i.status === 'done'))
  const today = dayKey()
  const daysLeft = Math.max(0, daysBetween(today, sprint.endDate) + 1)
  const dragItem = dragId ? items.find((i) => i.id === dragId) : null
  const activeAssignees = members.filter((m) => m.active)

  const lanes: { key: string; label: string; member?: Member; list: WorkItem[] }[] = swimlanes
    ? [
        ...activeAssignees.map((m) => ({ key: m.id, label: m.name, member: m, list: filtered.filter((i) => i.assigneeId === m.id) })).filter((l) => l.list.length),
        { key: '__none', label: 'Unassigned', list: filtered.filter((i) => !i.assigneeId || !activeAssignees.some((m) => m.id === i.assigneeId)) },
      ].filter((l) => l.list.length)
    : [{ key: '__all', label: '', list: filtered }]

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Board"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {niceDate(sprint.startDate)} → {niceDate(sprint.endDate)} · {sprint.status === 'active' ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : sprint.status}
            {health && <RiskPill risk={health.risk} />}
          </span>
        }
        actions={
          <select className="input w-auto" value={sprint.id} onChange={(e) => setSprintId(e.target.value)}>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.status})
              </option>
            ))}
          </select>
        }
      />

      <div className="card mb-4 px-4 py-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold">{sprint.name}</span>
          {sprint.goal && <span className="truncate text-slate-500">{sprint.goal}</span>}
          <span className="ml-auto shrink-0 text-xs tabular-nums text-slate-500">
            {done} / {total} SP done
          </span>
        </div>
        <Progress value={done} max={total || 1} tone={done === total && total > 0 ? 'good' : 'brand'} className="mt-2" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input w-52" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input w-auto" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ItemType | '')}>
          <option value="">All types</option>
          {ITEM_TYPES.filter((t) => t !== 'epic').map((t) => (
            <option key={t} value={t}>
              {ITEM_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          {activeAssignees.map((m) => (
            <button
              key={m.id}
              className={clsx('rounded-full transition', assignees.has(m.id) ? 'ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-slate-950' : 'opacity-70 hover:opacity-100')}
              title={m.name}
              onClick={() =>
                setAssignees((prev) => {
                  const n = new Set(prev)
                  if (n.has(m.id)) n.delete(m.id)
                  else n.add(m.id)
                  return n
                })
              }
            >
              <Avatar member={m} size="sm" />
            </button>
          ))}
          {currentMemberId && (
            <button className={clsx('btn-secondary btn-sm ml-1', assignees.size === 1 && assignees.has(currentMemberId) && 'ring-2 ring-brand-500')} onClick={() => setAssignees(assignees.size === 1 && assignees.has(currentMemberId) ? new Set() : new Set([currentMemberId]))}>
              Only mine
            </button>
          )}
          {assignees.size > 0 && (
            <button className="btn-ghost btn-sm" onClick={() => setAssignees(new Set())}>
              Clear
            </button>
          )}
        </div>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={swimlanes} onChange={(e) => setSwimlanes(e.target.checked)} /> Swimlanes by assignee
        </label>
      </div>

      <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setDragId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
        <div className="flex-1 overflow-x-auto pb-2">
          <div className="min-w-max space-y-4">
            {lanes.map((lane) => (
              <div key={lane.key}>
                {swimlanes && (
                  <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {lane.member && <Avatar member={lane.member} size="xs" />}
                    {lane.label}
                    <span className="font-normal text-slate-400">· {sumPoints(lane.list)} SP</span>
                  </div>
                )}
                <div className="flex gap-3">
                  {columns.map((col) => {
                    const list = columnItems(col, lane.list)
                    const count = columnItems(col, sprintItems).length
                    const overWip = col.wip !== undefined && count > col.wip
                    return (
                      <Column key={col.id} id={`${col.id}::${lane.key}`} col={col} count={list.length} sp={sumPoints(list)} overWip={overWip} showHeader={!swimlanes || lane.key === lanes[0].key} onAdd={col.id === BACKLOG_COL.id ? undefined : () => setFormDefaults({ sprintId: sprint.id, status: col.status, assigneeId: lane.member?.id })}>
                        {list.map((i) => (
                          <BoardCard key={i.id} item={i} project={project} assignee={memberMap.get(i.assigneeId ?? '')} highlighted={drawer.itemId === i.id} today={today} subtasks={childCounts.get(i.id)} onOpen={() => drawer.open(i.id)} />
                        ))}
                      </Column>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        <DragOverlay>{dragItem ? <BoardCard item={dragItem} project={project} assignee={memberMap.get(dragItem.assigneeId ?? '')} today={today} subtasks={childCounts.get(dragItem.id)} overlay /> : null}</DragOverlay>
      </DndContext>

      <ItemForm open={!!formDefaults} onClose={() => setFormDefaults(null)} defaults={formDefaults ?? undefined} />
    </div>
  )
}

function Column({ id, col, count, sp, overWip, showHeader, onAdd, children }: { id: string; col: BoardColumn; count: number; sp: number; overWip: boolean; showHeader: boolean; onAdd?: () => void; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={clsx('flex w-64 shrink-0 flex-col rounded-xl border bg-slate-100/70 transition dark:bg-slate-900/60', isOver ? 'border-brand-400 ring-2 ring-brand-300' : 'border-slate-200 dark:border-slate-800', col.status === 'blocked' && 'bg-red-50/60 dark:bg-red-950/20')}>
      {showHeader && (
        <div className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span>{col.name}</span>
          <span className="rounded-full bg-white px-1.5 text-[10px] tabular-nums text-slate-500 dark:bg-slate-800">{count}</span>
          <span className="ml-auto text-[10px] font-normal text-slate-400">{sp} SP</span>
          {col.wip !== undefined && (
            <span className={clsx('rounded px-1 text-[10px]', overWip ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300')} title="WIP limit">
              WIP {col.wip}
            </span>
          )}
        </div>
      )}
      <div className="flex-1 space-y-2 px-2 pb-2">{children}</div>
      {onAdd && (
        <button className="flex items-center gap-1 px-3 py-2 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" onClick={onAdd}>
          <Plus size={12} /> Add
        </button>
      )}
    </div>
  )
}

function BoardCard({ item, project, assignee, highlighted, today, subtasks, onOpen, overlay }: { item: WorkItem; project: { key: string }; assignee?: Member; highlighted?: boolean; today: string; subtasks?: { total: number; done: number }; onOpen?: () => void; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id, disabled: overlay })
  const blocked = item.blocked || item.status === 'blocked'
  const overdue = item.dueDate && item.status !== 'done' && item.dueDate < today
  const done = item.status === 'done'
  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      onClick={onOpen}
      className={clsx(
        'cursor-grab rounded-lg border bg-white p-2.5 text-sm shadow-sm transition dark:bg-slate-800',
        blocked ? 'border-red-300 border-l-4 border-l-red-500 dark:border-red-800 dark:border-l-red-500' : 'border-slate-200 dark:border-slate-700',
        isDragging && 'opacity-40',
        overlay && 'shadow-xl ring-2 ring-brand-400',
        highlighted && 'ring-2 ring-brand-500',
        done && 'opacity-75',
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <TypeIcon type={item.type} />
        <span className="font-mono">{itemKey(project, item)}</span>
        <span className="ml-auto flex items-center gap-1">
          <PriorityBadge priority={item.priority} />
          <Points value={item.points} />
        </span>
      </div>
      <div className={clsx('mt-1 line-clamp-3 font-medium leading-snug', done && 'line-through text-slate-500')}>{item.title}</div>
      {blocked && (
        <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
          <AlertOctagon size={12} /> Blocked{item.blockedReason ? `: ${item.blockedReason}` : ''}
        </div>
      )}
      <div className="mt-2 flex items-center gap-1.5">
        {item.labels.slice(0, 2).map((l) => (
          <Label key={l} text={l} />
        ))}
        {subtasks && subtasks.total > 0 && (
          <span className="text-[10px] text-slate-500">
            ✓ {subtasks.done}/{subtasks.total}
          </span>
        )}
        {item.dueDate && <span className={clsx('text-[10px]', overdue ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-500')}>{shortDate(item.dueDate)}</span>}
        <span className="ml-auto">
          <Avatar member={assignee} size="xs" />
        </span>
      </div>
    </div>
  )
}

export type { Status }
