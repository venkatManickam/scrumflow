import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertOctagon, Link2, MessageSquare, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../data/store'
import { useCurrentProject, useMemberMap, useProjectItems, useProjectMembers, useProjectSprints } from '../data/hooks'
import type { ItemType, Priority, Status, WorkItem } from '../domain/types'
import { ITEM_TYPES, ITEM_TYPE_LABEL, PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, itemKey } from '../domain/types'
import { niceDate, relativeDays, dayKey } from '../domain/dates'
import { Avatar, Drawer, Field, Points, StatusBadge, TypeIcon } from '../ui/primitives'
import { confirmDialog } from '../ui/confirm'
import { toast } from '../ui/toast'
import { useItemDrawer } from './useItemDrawer'
import { ItemForm } from './ItemForm'
import { formatDistanceToNow, parseISO } from 'date-fns'

function ago(iso: string) {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true })
  } catch {
    return iso
  }
}

export function ItemDrawer() {
  const { itemId, open: openItem, close } = useItemDrawer()
  const item = useStore((s) => s.items.find((i) => i.id === itemId))
  return (
    <Drawer open={!!itemId} onClose={close} title={item ? <DrawerTitle item={item} /> : <span className="text-sm text-slate-500">Item not found</span>}>
      {item ? <ItemDetail item={item} onOpen={openItem} onClose={close} /> : <div className="p-6 text-sm text-slate-500">This item no longer exists.</div>}
    </Drawer>
  )
}

function DrawerTitle({ item }: { item: WorkItem }) {
  const project = useCurrentProject()
  const items = useStore((s) => s.items)
  const parent = items.find((i) => i.id === item.parentId)
  const { open } = useItemDrawer()
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
      {parent && (
        <>
          <button className="truncate hover:underline" onClick={() => open(parent.id)}>
            {itemKey(project, parent)} {parent.title}
          </button>
          <span>/</span>
        </>
      )}
      <TypeIcon type={item.type} />
      <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">{itemKey(project, item)}</span>
      <StatusBadge status={item.status} />
    </div>
  )
}

function ItemDetail({ item, onOpen, onClose }: { item: WorkItem; onOpen: (id: string) => void; onClose: () => void }) {
  const project = useCurrentProject()
  const items = useProjectItems(item.projectId)
  const members = useProjectMembers(project)
  const memberMap = useMemberMap()
  const sprints = useProjectSprints(item.projectId)
  const comments = useStore((s) => s.comments)
  const activities = useStore((s) => s.activities)
  const updateItem = useStore((s) => s.updateItem)
  const deleteItem = useStore((s) => s.deleteItem)
  const addComment = useStore((s) => s.addComment)
  const deleteComment = useStore((s) => s.deleteComment)
  const currentMemberId = useStore((s) => s.settings.currentMemberId)

  const [title, setTitle] = useState(item.title)
  const [description, setDescription] = useState(item.description)
  const [comment, setComment] = useState('')
  const [subtaskOpen, setSubtaskOpen] = useState(false)
  const [labelsText, setLabelsText] = useState(item.labels.join(', '))

  useEffect(() => {
    setTitle(item.title)
    setDescription(item.description)
    setLabelsText(item.labels.join(', '))
  }, [item.id, item.title, item.description, item.labels])

  const children = useMemo(() => items.filter((i) => i.parentId === item.id).sort((a, b) => a.rank - b.rank), [items, item.id])
  const itemComments = useMemo(() => comments.filter((c) => c.itemId === item.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [comments, item.id])
  const itemActivity = useMemo(() => activities.filter((a) => a.itemId === item.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30), [activities, item.id])
  const parentCandidates = useMemo(() => {
    if (item.type === 'epic') return []
    const wanted: ItemType[] = item.type === 'task' ? ['story', 'bug'] : ['epic']
    return items.filter((i) => wanted.includes(i.type) && i.id !== item.id)
  }, [items, item])
  const depCandidates = useMemo(() => items.filter((i) => i.id !== item.id && i.type !== 'epic' && i.status !== 'done'), [items, item.id])
  const dependents = useMemo(() => items.filter((i) => i.dependsOn.includes(item.id)), [items, item.id])

  const patch = (p: Partial<WorkItem>) => updateItem(item.id, p)
  const childPoints = children.reduce((a, c) => a + (c.points ?? 0), 0)
  const childDone = children.filter((c) => c.status === 'done').length
  const overdue = item.dueDate && item.status !== 'done' && item.dueDate < dayKey()

  const remove = async () => {
    const ok = await confirmDialog({ title: `Delete ${itemKey(project, item)}?`, message: children.length ? `${children.length} child item(s) will be detached, not deleted.` : 'This cannot be undone.', confirmLabel: 'Delete', danger: true })
    if (!ok) return
    deleteItem(item.id)
    toast('Item deleted')
    onClose()
  }

  return (
    <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_260px]">
      {/* main column */}
      <div className="space-y-5 p-5">
        <input
          className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-lg font-semibold hover:border-slate-200 focus:border-brand-500 focus:outline-none dark:hover:border-slate-700"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== item.title && patch({ title: title.trim() })}
        />

        {(item.blocked || item.status === 'blocked') && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            <AlertOctagon size={16} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold">Blocked</div>
              <input
                className="mt-1 w-full rounded border border-red-200 bg-white px-2 py-1 text-xs text-slate-800 dark:border-red-900 dark:bg-slate-900 dark:text-slate-100"
                placeholder="Why is it blocked?"
                defaultValue={item.blockedReason ?? ''}
                onBlur={(e) => e.target.value !== (item.blockedReason ?? '') && patch({ blockedReason: e.target.value })}
              />
            </div>
            <button className="btn-secondary btn-sm" onClick={() => patch({ blocked: false, blockedReason: undefined, status: item.status === 'blocked' ? 'inprogress' : item.status })}>
              Unblock
            </button>
          </div>
        )}

        <div>
          <div className="label">Description</div>
          <textarea
            className="input min-h-[110px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => description !== item.description && patch({ description })}
            placeholder="Acceptance criteria, context, links…"
          />
        </div>

        {item.type !== 'task' && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <div className="label mb-0">
                {item.type === 'epic' ? 'Stories' : 'Subtasks'} · {childDone}/{children.length}
                {childPoints ? ` · ${childPoints} SP` : ''}
              </div>
              <button className="btn-ghost btn-sm" onClick={() => setSubtaskOpen(true)}>
                <Plus size={14} /> Add
              </button>
            </div>
            {children.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700">No {item.type === 'epic' ? 'stories' : 'subtasks'} yet.</div>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {children.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <TypeIcon type={c.type} />
                    <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => onOpen(c.id)}>
                      <span className="mr-1 font-mono text-xs text-slate-500">{itemKey(project, c)}</span>
                      {c.title}
                    </button>
                    <Points value={c.points} />
                    <Avatar member={memberMap.get(c.assigneeId ?? '')} size="xs" />
                    <select className="input input-sm w-auto" value={c.status} onChange={(e) => updateItem(c.id, { status: e.target.value as Status })}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}
            <ItemForm open={subtaskOpen} onClose={() => setSubtaskOpen(false)} defaults={{ type: item.type === 'epic' ? 'story' : 'task', parentId: item.id, sprintId: item.sprintId, assigneeId: item.assigneeId }} />
          </section>
        )}

        <section>
          <div className="label">
            <Link2 size={12} className="mr-1 inline" />
            Dependencies
          </div>
          <div className="flex flex-wrap gap-1.5">
            {item.dependsOn.map((id) => {
              const d = items.find((i) => i.id === id)
              if (!d) return null
              return (
                <span key={id} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-xs dark:border-slate-700">
                  <button className="hover:underline" onClick={() => onOpen(d.id)}>
                    {itemKey(project, d)} {d.title}
                  </button>
                  <StatusBadge status={d.status} />
                  <button className="text-slate-400 hover:text-red-500" onClick={() => patch({ dependsOn: item.dependsOn.filter((x) => x !== id) })} aria-label="Remove dependency">
                    ×
                  </button>
                </span>
              )
            })}
            <select
              className="input input-sm w-auto"
              value=""
              onChange={(e) => {
                if (e.target.value) patch({ dependsOn: [...item.dependsOn, e.target.value] })
              }}
            >
              <option value="">+ depends on…</option>
              {depCandidates.filter((d) => !item.dependsOn.includes(d.id)).map((d) => (
                <option key={d.id} value={d.id}>
                  {itemKey(project, d)} · {d.title}
                </option>
              ))}
            </select>
          </div>
          {dependents.length > 0 && (
            <div className="mt-2 text-xs text-slate-500">
              Blocks:{' '}
              {dependents.map((d) => (
                <button key={d.id} className="mr-2 hover:underline" onClick={() => onOpen(d.id)}>
                  {itemKey(project, d)}
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="label">
            <MessageSquare size={12} className="mr-1 inline" />
            Comments · {itemComments.length}
          </div>
          <ul className="space-y-3">
            {itemComments.map((c) => {
              const author = memberMap.get(c.authorId ?? '')
              return (
                <li key={c.id} className="flex gap-2">
                  <Avatar member={author} size="sm" />
                  <div className="min-w-0 flex-1 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{author?.name ?? 'Unknown'}</span> · {ago(c.createdAt)}
                      </span>
                      {c.authorId === currentMemberId && (
                        <button className="text-slate-400 hover:text-red-500" onClick={() => deleteComment(c.id)} aria-label="Delete comment">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-sm">{c.body}</div>
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="mt-3 flex gap-2">
            <Avatar member={memberMap.get(currentMemberId ?? '')} size="sm" />
            <textarea
              className="input min-h-[60px]"
              placeholder="Write a comment… (Ctrl+Enter to post)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && comment.trim()) {
                  addComment(item.id, comment)
                  setComment('')
                }
              }}
            />
          </div>
          <div className="mt-2 flex justify-end">
            <button
              className="btn-primary btn-sm"
              disabled={!comment.trim()}
              onClick={() => {
                addComment(item.id, comment)
                setComment('')
              }}
            >
              Comment
            </button>
          </div>
        </section>

        <section>
          <div className="label">Activity</div>
          <ul className="space-y-1 text-xs text-slate-500">
            {itemActivity.map((a) => {
              const who = memberMap.get(a.actorId ?? '')?.name ?? 'Someone'
              let text = ''
              switch (a.kind) {
                case 'created':
                  text = 'created this item'
                  break
                case 'commented':
                  text = 'commented'
                  break
                case 'status':
                  text = `changed status ${a.from ? STATUS_LABEL[a.from as Status] ?? a.from : '—'} → ${STATUS_LABEL[a.to as Status] ?? a.to}`
                  break
                case 'assignee':
                  text = `reassigned to ${memberMap.get(a.to ?? '')?.name ?? 'Unassigned'}`
                  break
                case 'points':
                  text = `changed points ${a.from || '–'} → ${a.to || '–'}`
                  break
                case 'priority':
                  text = `changed priority ${a.from} → ${a.to}`
                  break
                case 'sprint':
                  text = `moved to ${sprints.find((s) => s.id === a.to)?.name ?? 'backlog'}`
                  break
                case 'blocked':
                  text = a.to === 'unblocked' ? 'unblocked' : `blocked: ${a.to}`
                  break
                default:
                  text = a.kind
              }
              return (
                <li key={a.id}>
                  <span className="font-medium text-slate-700 dark:text-slate-300">{who}</span> {text} · {ago(a.at)}
                </li>
              )
            })}
          </ul>
        </section>
      </div>

      {/* side column */}
      <aside className="space-y-3 border-t border-slate-100 bg-slate-50/60 p-4 text-sm dark:border-slate-800 dark:bg-slate-900/60 lg:border-l lg:border-t-0">
        <Field label="Status">
          <select className="input input-sm" value={item.status} onChange={(e) => patch({ status: e.target.value as Status })}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Assignee">
          <select className="input input-sm" value={item.assigneeId ?? ''} onChange={(e) => patch({ assigneeId: e.target.value || undefined })}>
            <option value="">Unassigned</option>
            {members.filter((m) => m.active || m.id === item.assigneeId).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Priority">
            <select className="input input-sm" value={item.priority} onChange={(e) => patch({ priority: e.target.value as Priority })}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Points">
            <input className="input input-sm" type="number" min={0} defaultValue={item.points ?? ''} key={item.id + item.points} onBlur={(e) => patch({ points: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </Field>
        </div>
        <Field label="Type">
          <select className="input input-sm" value={item.type} onChange={(e) => patch({ type: e.target.value as ItemType })}>
            {ITEM_TYPES.map((t) => (
              <option key={t} value={t}>
                {ITEM_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        {item.type !== 'epic' && (
          <Field label="Sprint">
            <select className="input input-sm" value={item.sprintId ?? ''} onChange={(e) => patch({ sprintId: e.target.value || undefined })}>
              <option value="">Backlog</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.status})
                </option>
              ))}
            </select>
          </Field>
        )}
        {item.type !== 'epic' && (
          <Field label={item.type === 'task' ? 'Parent story' : 'Epic'}>
            <select className="input input-sm" value={item.parentId ?? ''} onChange={(e) => patch({ parentId: e.target.value || undefined })}>
              <option value="">— none —</option>
              {parentCandidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {itemKey(project, p)} · {p.title}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Due date" hint={item.dueDate ? <span className={overdue ? 'text-red-600' : ''}>{relativeDays(item.dueDate)}</span> : undefined}>
          <input className="input input-sm" type="date" value={item.dueDate ?? ''} onChange={(e) => patch({ dueDate: e.target.value || undefined })} />
        </Field>
        <Field label="Labels" hint="Comma separated">
          <input className="input input-sm" value={labelsText} onChange={(e) => setLabelsText(e.target.value)} onBlur={() => patch({ labels: labelsText.split(',').map((l) => l.trim()).filter(Boolean) })} />
        </Field>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={item.blocked} onChange={(e) => patch({ blocked: e.target.checked, status: e.target.checked ? 'blocked' : item.status === 'blocked' ? 'inprogress' : item.status })} />
          Blocked
        </label>
        <dl className="space-y-1 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800">
          <div className="flex justify-between">
            <dt>Reporter</dt>
            <dd>{memberMap.get(item.reporterId ?? '')?.name ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Created</dt>
            <dd>{niceDate(item.createdAt)}</dd>
          </div>
          {item.startedAt && (
            <div className="flex justify-between">
              <dt>Started</dt>
              <dd>{niceDate(item.startedAt)}</dd>
            </div>
          )}
          {item.completedAt && (
            <div className="flex justify-between">
              <dt>Completed</dt>
              <dd>{niceDate(item.completedAt)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt>Updated</dt>
            <dd>{ago(item.updatedAt)}</dd>
          </div>
        </dl>
        <div className="flex items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
          <Link to={`/board?item=${item.id}`} className="text-xs text-brand-600 hover:underline" onClick={onClose}>
            Show on board
          </Link>
          <button className="btn-ghost btn-sm text-red-600" onClick={remove}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </aside>
    </div>
  )
}
