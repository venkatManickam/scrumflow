import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Plus, RotateCcw, ThumbsUp, Trash2 } from 'lucide-react'
import { useStore } from '../data/store'
import { useCurrentProject, useMemberMap, useProjectItems, useProjectMembers, useProjectSprints } from '../data/hooks'
import type { RetroAction, RetroCategory } from '../domain/types'
import { RETRO_CATEGORIES, RETRO_CATEGORY_LABEL, itemKey } from '../domain/types'
import { sprintCompletion, sprintItems, pct } from '../domain/metrics'
import { niceDate } from '../domain/dates'
import { Avatar, Card, EmptyState, PageHeader, Progress } from '../ui/primitives'
import { toast } from '../ui/toast'
import { useItemDrawer } from '../app/useItemDrawer'

const CATEGORY_TONE: Record<RetroCategory, string> = {
  well: 'border-emerald-200 dark:border-emerald-900',
  improve: 'border-red-200 dark:border-red-900',
  ideas: 'border-amber-200 dark:border-amber-900',
}
const CATEGORY_EMOJI: Record<RetroCategory, string> = { well: '😊', improve: '😟', ideas: '💡' }

export function Retro() {
  const project = useCurrentProject()
  const sprints = useProjectSprints(project?.id)
  const items = useProjectItems(project?.id)
  const members = useProjectMembers(project)
  const memberMap = useMemberMap()
  const retroNotes = useStore((s) => s.retroNotes)
  const retroActions = useStore((s) => s.retroActions)
  const addRetroNote = useStore((s) => s.addRetroNote)
  const voteRetroNote = useStore((s) => s.voteRetroNote)
  const deleteRetroNote = useStore((s) => s.deleteRetroNote)
  const addRetroAction = useStore((s) => s.addRetroAction)
  const updateRetroAction = useStore((s) => s.updateRetroAction)
  const deleteRetroAction = useStore((s) => s.deleteRetroAction)
  const drawer = useItemDrawer()

  const defaultSprint = useMemo(() => {
    const completed = sprints.filter((s) => s.status === 'completed')
    return completed[completed.length - 1] ?? sprints.find((s) => s.status === 'active') ?? sprints[0]
  }, [sprints])
  const [sprintId, setSprintId] = useState<string>(defaultSprint?.id ?? '')
  useEffect(() => {
    if (!sprints.some((s) => s.id === sprintId)) setSprintId(defaultSprint?.id ?? '')
  }, [sprints, sprintId, defaultSprint])
  const sprint = sprints.find((s) => s.id === sprintId)

  const [drafts, setDrafts] = useState<Record<RetroCategory, string>>({ well: '', improve: '', ideas: '' })
  const [actDesc, setActDesc] = useState('')
  const [actOwner, setActOwner] = useState('')
  const [actDue, setActDue] = useState('')

  const notes = useMemo(() => retroNotes.filter((n) => n.sprintId === sprintId).sort((a, b) => b.votes - a.votes || a.createdAt.localeCompare(b.createdAt)), [retroNotes, sprintId])
  const actions = useMemo(() => retroActions.filter((a) => a.sprintId === sprintId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [retroActions, sprintId])
  const carried = useMemo(() => {
    if (!sprint || !project) return []
    const earlier = new Set(sprints.filter((s) => s.startDate < sprint.startDate).map((s) => s.id))
    return retroActions.filter((a) => a.projectId === project.id && a.status === 'open' && earlier.has(a.sprintId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [retroActions, sprints, sprint, project])
  const facts = useMemo(() => (sprint ? sprintCompletion(sprint, items) : undefined), [sprint, items])
  const blockers = useMemo(() => (sprint ? sprintItems(sprint, items).filter((i) => i.blocked || i.status === 'blocked') : []), [sprint, items])
  const notDone = useMemo(() => (sprint ? sprintItems(sprint, items).filter((i) => i.status !== 'done') : []), [sprint, items])

  if (!project) {
    return <EmptyState icon={<RotateCcw />} title="No project selected" hint="Create or open a project first." action={<Link to="/projects" className="btn-primary btn-sm">Go to projects</Link>} />
  }
  if (!sprint) {
    return <EmptyState icon={<RotateCcw />} title="No sprints yet" hint="Retrospectives are held per sprint. Plan and complete a sprint first." action={<Link to="/sprints" className="btn-primary btn-sm">Go to sprints</Link>} />
  }

  const addNote = (cat: RetroCategory) => {
    const text = drafts[cat].trim()
    if (!text) return
    addRetroNote(sprint.id, cat, text)
    setDrafts((d) => ({ ...d, [cat]: '' }))
  }
  const addAction = () => {
    if (!actDesc.trim()) {
      toast('Describe the action first', 'error')
      return
    }
    addRetroAction({ projectId: project.id, sprintId: sprint.id, description: actDesc.trim(), ownerId: actOwner || undefined, dueDate: actDue || undefined })
    setActDesc('')
    setActOwner('')
    setActDue('')
    toast('Action item added', 'success')
  }

  const summaryText = () => {
    const name = (id?: string) => memberMap.get(id ?? '')?.name ?? 'Unassigned'
    const lines: string[] = [`${sprint.name.toUpperCase()} RETROSPECTIVE — ${project.name}`, `${niceDate(sprint.startDate)} → ${niceDate(sprint.endDate)}`, '']
    if (facts) lines.push(`Committed ${facts.committed} SP · Completed ${facts.completed} SP (${pct(facts.completed, facts.committed || 1)}%) · Carried over ${facts.carriedOver} SP`, '')
    RETRO_CATEGORIES.forEach((cat) => {
      lines.push(`${CATEGORY_EMOJI[cat]} ${RETRO_CATEGORY_LABEL[cat].toUpperCase()}`)
      const list = notes.filter((n) => n.category === cat)
      if (!list.length) lines.push('  —')
      list.forEach((n) => lines.push(`  ${cat === 'well' ? '+' : cat === 'improve' ? '-' : '*'} ${n.text}${n.votes ? ` (${n.votes} votes)` : ''}`))
      lines.push('')
    })
    lines.push('ACTION ITEMS')
    if (!actions.length) lines.push('  —')
    actions.forEach((a, i) => lines.push(`  ${i + 1}. [${a.status === 'done' ? 'x' : ' '}] ${a.description} — ${name(a.ownerId)}${a.dueDate ? `, due ${niceDate(a.dueDate)}` : ''}`))
    if (carried.length) {
      lines.push('', 'CARRIED OVER (still open)')
      carried.forEach((a) => lines.push(`  • ${a.description} — ${name(a.ownerId)}${a.dueDate ? `, due ${niceDate(a.dueDate)}` : ''}`))
    }
    return lines.join('\n')
  }
  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summaryText())
      toast('Retro summary copied', 'success')
    } catch {
      toast('Clipboard unavailable', 'error')
    }
  }

  return (
    <div>
      <PageHeader
        title="Retrospective"
        subtitle={`${sprint.name} · ${niceDate(sprint.startDate)} → ${niceDate(sprint.endDate)} · ${sprint.status}`}
        actions={
          <>
            <select className="input input-sm w-auto" value={sprintId} onChange={(e) => setSprintId(e.target.value)}>
              {[...sprints].reverse().map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.status})
                </option>
              ))}
            </select>
            <button className="btn-secondary btn-sm" onClick={copySummary}>
              <Copy size={14} /> Copy retro summary
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {RETRO_CATEGORIES.map((cat) => {
              const list = notes.filter((n) => n.category === cat)
              return (
                <section key={cat} className={`card border-t-4 ${CATEGORY_TONE[cat]}`}>
                  <header className="flex items-center justify-between px-4 py-2.5">
                    <h2 className="text-sm font-semibold">
                      {CATEGORY_EMOJI[cat]} {RETRO_CATEGORY_LABEL[cat]}
                    </h2>
                    <span className="text-xs text-slate-400">{list.length}</span>
                  </header>
                  <div className="space-y-2 px-3 pb-3">
                    {list.map((n) => (
                      <div key={n.id} className="rounded-lg bg-slate-50 p-2.5 text-sm dark:bg-slate-800/60">
                        <div className="whitespace-pre-wrap">{n.text}</div>
                        <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
                          <Avatar member={memberMap.get(n.authorId ?? '')} size="xs" />
                          <span className="truncate">{memberMap.get(n.authorId ?? '')?.name ?? 'Anonymous'}</span>
                          <button className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-slate-200 dark:hover:bg-slate-700" onClick={() => voteRetroNote(n.id, 1)} title="Vote">
                            <ThumbsUp size={12} /> {n.votes}
                          </button>
                          <button className="rounded px-1 py-0.5 text-slate-400 hover:text-red-500" onClick={() => deleteRetroNote(n.id)} aria-label="Delete note">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                    <input
                      className="input input-sm"
                      placeholder="Add a note, press Enter"
                      value={drafts[cat]}
                      onChange={(e) => setDrafts((d) => ({ ...d, [cat]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addNote(cat)
                      }}
                    />
                  </div>
                </section>
              )
            })}
          </div>

          <Card title={`Action items · ${actions.filter((a) => a.status === 'open').length} open`}>
            <div className="space-y-2">
              {actions.length === 0 && <div className="text-xs text-slate-500">No action items for this sprint yet.</div>}
              {actions.map((a) => (
                <ActionRow key={a.id} action={a} members={members} onChange={(p) => updateRetroAction(a.id, p)} onDelete={() => deleteRetroAction(a.id)} />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700 md:grid-cols-[1fr_180px_150px_auto]">
              <input
                className="input input-sm"
                placeholder="New action item…"
                value={actDesc}
                onChange={(e) => setActDesc(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addAction()
                }}
              />
              <select className="input input-sm" value={actOwner} onChange={(e) => setActOwner(e.target.value)}>
                <option value="">Owner…</option>
                {members.filter((m) => m.active).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <input className="input input-sm" type="date" value={actDue} onChange={(e) => setActDue(e.target.value)} />
              <button className="btn-primary btn-sm" onClick={addAction}>
                <Plus size={14} /> Add
              </button>
            </div>
            {carried.length > 0 && (
              <div className="mt-5">
                <div className="label">Carried over from earlier sprints · still open</div>
                <div className="space-y-2">
                  {carried.map((a) => (
                    <ActionRow key={a.id} action={a} members={members} origin={sprints.find((s) => s.id === a.sprintId)?.name} onChange={(p) => updateRetroAction(a.id, p)} onDelete={() => deleteRetroAction(a.id)} />
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Sprint facts">
            {facts && (
              <div className="space-y-3 text-sm">
                <div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Delivered</span>
                    <span>
                      {facts.completed} / {facts.committed} SP
                    </span>
                  </div>
                  <Progress value={facts.completed} max={facts.committed || 1} tone={pct(facts.completed, facts.committed || 1) >= 80 ? 'good' : 'warn'} className="mt-1" />
                </div>
                <dl className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Goal</dt>
                    <dd className="max-w-[60%] text-right">{sprint.goal || '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Items done</dt>
                    <dd>
                      {facts.items.done} / {facts.items.total}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Added mid-sprint</dt>
                    <dd>{facts.addedDuringSprint} SP</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Carried over</dt>
                    <dd>{facts.carriedOver} SP</dd>
                  </div>
                </dl>
              </div>
            )}
          </Card>
          <Card title={`Blockers · ${blockers.length}`}>
            {blockers.length === 0 ? (
              <div className="text-xs text-slate-500">No blocked items in this sprint.</div>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {blockers.map((i) => (
                  <li key={i.id}>
                    <button className="text-left hover:underline" onClick={() => drawer.open(i.id)}>
                      <span className="mr-1 font-mono text-slate-500">{itemKey(project, i)}</span>
                      {i.title}
                    </button>
                    {i.blockedReason && <div className="text-red-600 dark:text-red-400">{i.blockedReason}</div>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {notDone.length > 0 && (
            <Card title={`Not finished · ${notDone.length}`}>
              <ul className="space-y-1 text-xs">
                {notDone.map((i) => (
                  <li key={i.id}>
                    <button className="text-left hover:underline" onClick={() => drawer.open(i.id)}>
                      <span className="mr-1 font-mono text-slate-500">{itemKey(project, i)}</span>
                      {i.title} <span className="text-slate-400">({i.points ?? 0} SP)</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function ActionRow({ action, members, origin, onChange, onDelete }: { action: RetroAction; members: { id: string; name: string; active: boolean }[]; origin?: string; onChange: (p: Partial<RetroAction>) => void; onDelete: () => void }) {
  const [desc, setDesc] = useState(action.description)
  useEffect(() => setDesc(action.description), [action.description])
  const overdue = action.status === 'open' && action.dueDate && action.dueDate < new Date().toISOString().slice(0, 10)
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800 md:grid-cols-[auto_1fr_160px_140px_auto]">
      <input type="checkbox" checked={action.status === 'done'} onChange={(e) => onChange({ status: e.target.checked ? 'done' : 'open' })} aria-label="Done" />
      <div className="min-w-0">
        <input
          className={`w-full bg-transparent text-sm focus:outline-none ${action.status === 'done' ? 'text-slate-400 line-through' : ''}`}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => desc.trim() && desc !== action.description && onChange({ description: desc.trim() })}
        />
        {origin && <div className="text-[10px] text-slate-400">from {origin}</div>}
      </div>
      <select className="input input-sm" value={action.ownerId ?? ''} onChange={(e) => onChange({ ownerId: e.target.value || undefined })}>
        <option value="">Owner…</option>
        {members.filter((m) => m.active || m.id === action.ownerId).map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <input className={`input input-sm ${overdue ? 'border-red-400 text-red-600' : ''}`} type="date" value={action.dueDate ?? ''} onChange={(e) => onChange({ dueDate: e.target.value || undefined })} />
      <button className="btn-ghost btn-sm text-slate-400 hover:text-red-500" onClick={onDelete} aria-label="Delete action">
        <Trash2 size={14} />
      </button>
    </div>
  )
}
