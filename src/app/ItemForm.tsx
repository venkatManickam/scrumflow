import { useEffect, useMemo, useState } from 'react'
import { useStore, type NewItemInput } from '../data/store'
import { useCurrentProject, useProjectItems, useProjectMembers, useProjectSprints } from '../data/hooks'
import type { ItemType, Priority, Status } from '../domain/types'
import { ITEM_TYPES, ITEM_TYPE_LABEL, PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, itemKey } from '../domain/types'
import { Field, Modal } from '../ui/primitives'
import { toast } from '../ui/toast'
import { useItemDrawer } from './useItemDrawer'

export interface ItemFormDefaults {
  type?: ItemType
  sprintId?: string
  parentId?: string
  status?: Status
  assigneeId?: string
}

export function ItemForm({ open, onClose, defaults }: { open: boolean; onClose: () => void; defaults?: ItemFormDefaults }) {
  const project = useCurrentProject()
  const items = useProjectItems(project?.id)
  const members = useProjectMembers(project)
  const sprints = useProjectSprints(project?.id)
  const createItem = useStore((s) => s.createItem)
  const currentMemberId = useStore((s) => s.settings.currentMemberId)
  const drawer = useItemDrawer()

  const [type, setType] = useState<ItemType>('story')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [status, setStatus] = useState<Status | ''>('')
  const [points, setPoints] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [sprintId, setSprintId] = useState('')
  const [parentId, setParentId] = useState('')
  const [labels, setLabels] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [openAfter, setOpenAfter] = useState(false)

  useEffect(() => {
    if (!open) return
    setType(defaults?.type ?? 'story')
    setTitle('')
    setDescription('')
    setPriority('medium')
    setStatus(defaults?.status ?? '')
    setPoints('')
    setAssigneeId(defaults?.assigneeId ?? '')
    setSprintId(defaults?.sprintId ?? '')
    setParentId(defaults?.parentId ?? '')
    setLabels('')
    setDueDate('')
  }, [open, defaults])

  const parentCandidates = useMemo(() => {
    if (type === 'epic') return []
    const wanted: ItemType[] = type === 'task' ? ['story', 'bug'] : ['epic']
    return items.filter((i) => wanted.includes(i.type) && i.status !== 'done').sort((a, b) => a.number - b.number)
  }, [items, type])

  if (!project) return null

  const submit = () => {
    if (!title.trim()) {
      toast('Title is required', 'error')
      return
    }
    const input: NewItemInput = {
      projectId: project.id,
      type,
      title,
      description,
      priority,
      status: status || undefined,
      points: points ? Number(points) : undefined,
      assigneeId: assigneeId || undefined,
      sprintId: type === 'epic' ? undefined : sprintId || undefined,
      parentId: parentId || undefined,
      labels: labels.split(',').map((l) => l.trim()).filter(Boolean),
      dueDate: dueDate || undefined,
    }
    const item = createItem(input)
    toast(`${itemKey(project, item)} created`, 'success')
    onClose()
    if (openAfter) drawer.open(item.id)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`New work item · ${project.key}`}
      size="lg"
      footer={
        <>
          <label className="mr-auto flex items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" checked={openAfter} onChange={(e) => setOpenAfter(e.target.checked)} /> Open after creating
          </label>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit}>
            Create
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Type">
          <select className="input" value={type} onChange={(e) => setType(e.target.value as ItemType)}>
            {ITEM_TYPES.map((t) => (
              <option key={t} value={t}>
                {ITEM_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title" className="md:col-span-2">
          <input
            className="input"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={type === 'bug' ? 'What is broken?' : 'As a … I want … so that …'}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit()
            }}
          />
        </Field>
        <Field label="Description" className="md:col-span-2">
          <textarea className="input min-h-[80px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Acceptance criteria, context, links…" />
        </Field>
        {type !== 'epic' && (
          <Field label={type === 'task' ? 'Parent story' : 'Epic'}>
            <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">— none —</option>
              {parentCandidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {itemKey(project, p)} · {p.title}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Assignee">
          <select className="input" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Unassigned</option>
            {members.filter((m) => m.active).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.id === currentMemberId ? ' (me)' : ''}
              </option>
            ))}
          </select>
        </Field>
        {type !== 'epic' && (
          <Field label="Sprint">
            <select className="input" value={sprintId} onChange={(e) => setSprintId(e.target.value)}>
              <option value="">Backlog</option>
              {sprints.filter((s) => s.status !== 'completed').map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.status})
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Story points">
          <input className="input" type="number" min={0} step={1} value={points} onChange={(e) => setPoints(e.target.value)} placeholder="e.g. 5" />
        </Field>
        <Field label="Status">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            <option value="">Auto (Backlog / To Do)</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Due date">
          <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Labels" hint="Comma separated">
          <input className="input" value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="sap, inbound" />
        </Field>
      </div>
    </Modal>
  )
}
