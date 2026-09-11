import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import clsx from 'clsx'
import { ChevronDown, ChevronRight, GripVertical, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../data/store'
import { useCurrentProject, useMemberMap, useProjectItems, useProjectMembers, useProjectSprints } from '../data/hooks'
import type { ItemType, Priority, Sprint, WorkItem } from '../domain/types'
import { ITEM_TYPES, ITEM_TYPE_LABEL, PRIORITIES, PRIORITY_LABEL, itemKey } from '../domain/types'
import { sumPoints } from '../domain/metrics'
import { niceDate } from '../domain/dates'
import { Avatar, Card, EmptyState, Label, PageHeader, Points, PriorityBadge, Progress, StatusBadge, TypeIcon } from '../ui/primitives'
import { toast } from '../ui/toast'
import { confirmDialog } from '../ui/confirm'
import { ItemForm } from '../app/ItemForm'
import { useItemDrawer } from '../app/useItemDrawer'

const byRank = (a: WorkItem, b: WorkItem) => a.rank - b.rank || a.number - b.number

export function Backlog() {
  const project = useCurrentProject()
  const items = useProjectItems(project?.id)
  const sprints = useProjectSprints(project?.id)
  const members = useProjectMembers(project)
  const memberMap = useMemberMap()
  const updateItem = useStore((s) => s.updateItem)
  const deleteItem = useStore((s) => s.deleteItem)
  const reorderItems = useStore((s) => s.reorderItems)
  const createItem = useStore((s) => s.createItem)
  const drawer = useItemDrawer()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<ItemType | ''>('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [epicFilter, setEpicFilter] = useState('')
  const [hideDone, setHideDone] = useState(true)
  const [groupByEpic, setGroupByEpic] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [newOpen, setNewOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [quickTitle, setQuickTitle] = useState('')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const epics = useMemo(() => items.filter((i) => i.type === 'epic').sort(byRank), [items])
  const openSprints = useMemo(() => sprints.filter((s) => s.status !== 'completed'), [sprints])

  const matches = (i: WorkItem) => {
    if (i.type === 'epic') return false
    if (hideDone && i.status === 'done') return false
    if (typeFilter && i.type !== typeFilter) return false
    if (assigneeFilter && (i.assigneeId ?? '') !== assigneeFilter) return false
    if (epicFilter) {
      // stories/bugs under the epic, or tasks whose parent story is under the epic
      const parent = items.find((p) => p.id === i.parentId)
      const inEpic = i.parentId === epicFilter || parent?.parentId === epicFilter
      if (!inEpic) return false
    }
    if (search) {
      const q = search.toLowerCase()
      if (!i.title.toLowerCase().includes(q) && !itemKey(project, i).toLowerCase().includes(q) && !i.labels.some((l) => l.toLowerCase().includes(q))) return false
    }
    return true
  }

  const backlogItems = useMemo(() => items.filter((i) => !i.sprintId && matches(i)).sort(byRank), [items, search, typeFilter, assigneeFilter, epicFilter, hideDone]) // eslint-disable-line react-hooks/exhaustive-deps
  const sprintItemsOf = (s: Sprint) => items.filter((i) => i.sprintId === s.id && matches(i)).sort(byRank)

  const visibleAll = items.filter((i) => i.type !== 'epic')
  const totalSP = sumPoints(visibleAll.filter((i) => i.status !== 'done'))

  if (!project) {
    return (
      <EmptyState
        title="No project selected"
        hint="Create a project to start building a backlog."
        action={
          <Link to="/projects" className="btn-primary">
            Go to projects
          </Link>
        }
      />
    )
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const bulkMove = (sprintId: string) => {
    selected.forEach((id) => updateItem(id, { sprintId: sprintId || undefined }))
    toast(`${selected.size} item(s) moved`, 'success')
    setSelected(new Set())
  }
  const bulkPriority = (p: Priority) => {
    selected.forEach((id) => updateItem(id, { priority: p }))
    toast(`Priority set on ${selected.size} item(s)`, 'success')
    setSelected(new Set())
  }
  const bulkDelete = async () => {
    const ok = await confirmDialog({ title: `Delete ${selected.size} item(s)?`, message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true })
    if (!ok) return
    selected.forEach((id) => deleteItem(id))
    toast('Deleted')
    setSelected(new Set())
  }

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = backlogItems.map((i) => i.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    reorderItems(arrayMove(ids, from, to))
  }

  const quickAdd = () => {
    const t = quickTitle.trim()
    if (!t) return
    const it = createItem({ projectId: project.id, type: 'story', title: t, parentId: epicFilter || undefined })
    toast(`${itemKey(project, it)} added`, 'success')
    setQuickTitle('')
  }

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const renderRow = (i: WorkItem, sortable: boolean) => (
    <Row
      key={i.id}
      item={i}
      project={project}
      sortable={sortable}
      selected={selected.has(i.id)}
      onSelect={() => toggleSelect(i.id)}
      onOpen={() => drawer.open(i.id)}
      assignee={memberMap.get(i.assigneeId ?? '')}
      sprints={openSprints}
      onMove={(sprintId) => updateItem(i.id, { sprintId: sprintId || undefined })}
      childCount={items.filter((c) => c.parentId === i.id).length}
    />
  )

  const renderGrouped = (list: WorkItem[], sortable: boolean) => {
    if (!groupByEpic) return list.map((i) => renderRow(i, sortable))
    const groups = new Map<string, WorkItem[]>()
    for (const i of list) {
      const parent = items.find((p) => p.id === i.parentId)
      const epicId = i.parentId && parent?.type === 'epic' ? i.parentId : parent?.parentId && items.find((p) => p.id === parent.parentId)?.type === 'epic' ? parent.parentId : ''
      ;(groups.get(epicId) ?? groups.set(epicId, []).get(epicId)!).push(i)
    }
    return [...groups.entries()].map(([epicId, list2]) => {
      const epic = items.find((e) => e.id === epicId)
      return (
        <div key={epicId || 'none'}>
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            {epic ? <TypeIcon type="epic" /> : null}
            {epic ? epic.title : 'No epic'}
            <span className="font-normal text-slate-400">· {list2.length} · {sumPoints(list2)} SP</span>
          </div>
          {list2.map((i) => renderRow(i, sortable))}
        </div>
      )
    })
  }

  return (
    <div>
      <PageHeader
        title="Backlog"
        subtitle={`${visibleAll.length} items · ${totalSP} SP open · ${epics.length} epics`}
        actions={
          <button className="btn-primary" onClick={() => setNewOpen(true)}>
            <Plus size={14} /> New item
          </button>
        }
      />

      {/* filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input className="input w-56" placeholder="Search title, key, label…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input w-auto" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ItemType | '')}>
          <option value="">All types</option>
          {ITEM_TYPES.filter((t) => t !== 'epic').map((t) => (
            <option key={t} value={t}>
              {ITEM_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
          <option value="">All assignees</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={epicFilter} onChange={(e) => setEpicFilter(e.target.value)}>
          <option value="">All epics</option>
          {epics.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Hide done
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={groupByEpic} onChange={(e) => setGroupByEpic(e.target.checked)} /> Group by epic
        </label>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm dark:border-brand-900 dark:bg-brand-900/20">
          <span className="font-semibold">{selected.size} selected</span>
          <select className="input input-sm w-auto" value="" onChange={(e) => bulkMove(e.target.value)}>
            <option value="" disabled>
              Move to…
            </option>
            <option value="">Backlog</option>
            {openSprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select className="input input-sm w-auto" value="" onChange={(e) => e.target.value && bulkPriority(e.target.value as Priority)}>
            <option value="" disabled>
              Set priority…
            </option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
          <button className="btn-ghost btn-sm text-red-600" onClick={bulkDelete}>
            <Trash2 size={14} /> Delete
          </button>
          <button className="btn-ghost btn-sm ml-auto" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          {openSprints.map((s) => {
            const list = sprintItemsOf(s)
            const all = items.filter((i) => i.sprintId === s.id && i.type !== 'epic')
            const sp = sumPoints(all)
            const isCollapsed = collapsed.has(s.id)
            return (
              <Card key={s.id} padded={false}>
                <button className="flex w-full items-center gap-2 px-4 py-2.5 text-left" onClick={() => toggleCollapse(s.id)}>
                  {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  <span className="text-sm font-semibold">{s.name}</span>
                  <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-semibold', s.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>
                    {s.status}
                  </span>
                  <span className="text-xs text-slate-500">
                    {niceDate(s.startDate)} → {niceDate(s.endDate)}
                  </span>
                  <span className="ml-auto text-xs text-slate-500">
                    {all.length} items · <span className={clsx(s.capacity && sp > s.capacity && 'font-semibold text-red-600')}>{sp}</span>
                    {s.capacity ? ` / ${s.capacity}` : ''} SP
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                    {list.length === 0 ? <div className="px-4 py-3 text-xs text-slate-500">No items match.</div> : renderGrouped(list, false)}
                  </div>
                )}
              </Card>
            )
          })}

          <Card padded={false}>
            <div className="flex items-center gap-2 px-4 py-2.5">
              <span className="text-sm font-semibold">Backlog</span>
              <span className="ml-auto text-xs text-slate-500">
                {backlogItems.length} items · {sumPoints(backlogItems)} SP
              </span>
            </div>
            <div className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
              {backlogItems.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-slate-500">Backlog is empty — add a story below.</div>
              ) : groupByEpic ? (
                renderGrouped(backlogItems, false)
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={backlogItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                    {backlogItems.map((i) => renderRow(i, true))}
                  </SortableContext>
                </DndContext>
              )}
            </div>
            <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-2 dark:border-slate-800">
              <Plus size={14} className="text-slate-400" />
              <input
                className="w-full bg-transparent py-1 text-sm focus:outline-none"
                placeholder="Quick add a story… (Enter)"
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
              />
            </div>
          </Card>
        </div>

        <div>
          <Card title="Epics" actions={epicFilter ? <button className="btn-ghost btn-sm" onClick={() => setEpicFilter('')}>Clear</button> : undefined} padded={false}>
            {epics.length === 0 ? (
              <div className="px-4 py-4 text-xs text-slate-500">No epics yet.</div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {epics.map((e) => {
                  const children = items.filter((c) => c.parentId === e.id)
                  const total = sumPoints(children)
                  const done = sumPoints(children.filter((c) => c.status === 'done'))
                  return (
                    <li key={e.id} className={clsx('px-4 py-2.5', epicFilter === e.id && 'bg-brand-50 dark:bg-brand-900/20')}>
                      <div className="flex items-center gap-2">
                        <TypeIcon type="epic" />
                        <button className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline" onClick={() => setEpicFilter(epicFilter === e.id ? '' : e.id)}>
                          {e.title}
                        </button>
                        <button className="text-[10px] text-slate-400 hover:underline" onClick={() => drawer.open(e.id)}>
                          {itemKey(project, e)}
                        </button>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Progress value={done} max={total || 1} tone={total && done === total ? 'good' : 'brand'} className="flex-1" />
                        <span className="text-[10px] tabular-nums text-slate-500">
                          {done}/{total} SP · {children.length}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <ItemForm open={newOpen} onClose={() => setNewOpen(false)} defaults={{ parentId: epicFilter || undefined }} />
    </div>
  )
}

function Row({
  item,
  project,
  sortable,
  selected,
  onSelect,
  onOpen,
  assignee,
  sprints,
  onMove,
  childCount,
}: {
  item: WorkItem
  project: { key: string }
  sortable: boolean
  selected: boolean
  onSelect: () => void
  onOpen: () => void
  assignee?: import('../domain/types').Member
  sprints: Sprint[]
  onMove: (sprintId: string) => void
  childCount: number
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !sortable })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div ref={setNodeRef} style={style} className={clsx('flex items-center gap-2 px-3 py-2 text-sm', isDragging && 'opacity-60', selected && 'bg-brand-50/60 dark:bg-brand-900/20', item.status === 'done' && 'opacity-60')}>
      {sortable ? (
        <button className="cursor-grab text-slate-300 hover:text-slate-500" {...attributes} {...listeners} aria-label="Drag to reorder">
          <GripVertical size={14} />
        </button>
      ) : (
        <span className="w-[14px]" />
      )}
      <input type="checkbox" checked={selected} onChange={onSelect} />
      <TypeIcon type={item.type} />
      <span className="font-mono text-xs text-slate-500">{itemKey(project, item)}</span>
      <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={onOpen}>
        {item.title}
        {childCount > 0 && <span className="ml-1 text-[10px] text-slate-400">({childCount})</span>}
      </button>
      <span className="hidden gap-1 md:flex">
        {item.labels.slice(0, 2).map((l) => (
          <Label key={l} text={l} />
        ))}
      </span>
      {item.blocked && <span className="rounded bg-red-100 px-1.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">Blocked</span>}
      <PriorityBadge priority={item.priority} />
      <Points value={item.points} />
      <Avatar member={assignee} size="xs" />
      <StatusBadge status={item.status} className="hidden sm:inline-flex" />
      <select className="input input-sm hidden w-auto lg:block" value={item.sprintId ?? ''} onChange={(e) => onMove(e.target.value)} title="Move to sprint">
        <option value="">Backlog</option>
        {sprints.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  )
}
