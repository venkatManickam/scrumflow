import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertOctagon, ChevronLeft, ChevronRight, Copy, Download, Mic } from 'lucide-react'
import { useStore } from '../data/store'
import { useActiveSprint, useCurrentMember, useCurrentProject, useProjectItems, useProjectMembers } from '../data/hooks'
import { ROLE_LABEL, itemKey } from '../domain/types'
import type { StandupEntry, WorkItem } from '../domain/types'
import { dayKey, niceDate, shiftDays } from '../domain/dates'
import { isStarted } from '../domain/metrics'
import { downloadText } from '../data/io'
import { Avatar, Card, EmptyState, KPI, PageHeader } from '../ui/primitives'
import { toast } from '../ui/toast'
import { useItemDrawer } from '../app/useItemDrawer'

export function Standup() {
  const project = useCurrentProject()
  const items = useProjectItems(project?.id)
  const members = useProjectMembers(project)
  const sprint = useActiveSprint(project?.id)
  const me = useCurrentMember()
  const standups = useStore((s) => s.standups)
  const upsertStandup = useStore((s) => s.upsertStandup)
  const drawer = useItemDrawer()

  const [date, setDate] = useState(dayKey())
  const [yesterday, setYesterday] = useState('')
  const [today, setToday] = useState('')
  const [blockers, setBlockers] = useState('')

  const activeMembers = useMemo(() => members.filter((m) => m.active), [members])
  const dayEntries = useMemo(() => (project ? standups.filter((e) => e.projectId === project.id && e.date === date) : []), [standups, project, date])
  const myEntry = useMemo(() => dayEntries.find((e) => e.memberId === me?.id), [dayEntries, me])
  const prevDay = dayKey(shiftDays(date, -1))

  useEffect(() => {
    setYesterday(myEntry?.yesterday ?? '')
    setToday(myEntry?.today ?? '')
    setBlockers(myEntry?.blockers ?? '')
  }, [myEntry, date, me?.id])

  const completedOnDay = useMemo(() => items.filter((i) => i.type !== 'epic' && i.completedAt && dayKey(i.completedAt) === date), [items, date])
  const inProgress = useMemo(() => items.filter((i) => i.type !== 'epic' && isStarted(i) && i.status !== 'blocked' && (!sprint || i.sprintId === sprint.id)), [items, sprint])
  const blockedItems = useMemo(() => items.filter((i) => i.type !== 'epic' && i.status !== 'done' && (i.blocked || i.status === 'blocked') && (!sprint || i.sprintId === sprint.id)), [items, sprint])
  const atRisk = useMemo(() => items.filter((i) => i.type !== 'epic' && i.status !== 'done' && i.dueDate && i.dueDate < date), [items, date])
  const blockerTexts = useMemo(() => {
    const out: { who: string; text: string; item?: WorkItem }[] = []
    dayEntries.forEach((e) => {
      if (e.blockers.trim()) out.push({ who: members.find((m) => m.id === e.memberId)?.name ?? 'Unknown', text: e.blockers.trim() })
    })
    blockedItems.forEach((i) => out.push({ who: members.find((m) => m.id === i.assigneeId)?.name ?? 'Unassigned', text: `${itemKey(project, i)} ${i.title}${i.blockedReason ? ` — ${i.blockedReason}` : ''}`, item: i }))
    return out
  }, [dayEntries, blockedItems, members, project])

  const history = useMemo(() => {
    const days: { date: string; count: number }[] = []
    for (let n = 0; n < 7; n++) {
      const d = dayKey(shiftDays(new Date(), -n))
      days.push({ date: d, count: project ? standups.filter((e) => e.projectId === project.id && e.date === d).length : 0 })
    }
    return days
  }, [standups, project])

  if (!project) {
    return <EmptyState icon={<Mic />} title="No project selected" hint="Create or open a project first." action={<Link to="/projects" className="btn-primary btn-sm">Go to projects</Link>} />
  }

  const save = () => {
    if (!me) return
    upsertStandup({ projectId: project.id, sprintId: sprint?.id, memberId: me.id, date, yesterday: yesterday.trim(), today: today.trim(), blockers: blockers.trim() })
    toast('Stand-up saved', 'success')
  }

  const insertInProgress = () => {
    if (!me) return
    const mine = inProgress.filter((i) => i.assigneeId === me.id).map((i) => `• ${itemKey(project, i)} ${i.title}`)
    if (!mine.length) {
      toast('You have no items in progress')
      return
    }
    setToday((t) => (t.trim() ? t + '\n' : '') + mine.join('\n'))
  }
  const insertCompleted = () => {
    if (!me) return
    const mine = items.filter((i) => i.assigneeId === me.id && i.completedAt && dayKey(i.completedAt) === prevDay).map((i) => `✓ ${itemKey(project, i)} ${i.title}`)
    if (!mine.length) {
      toast(`Nothing completed on ${niceDate(prevDay)}`)
      return
    }
    setYesterday((y) => (y.trim() ? y + '\n' : '') + mine.join('\n'))
  }

  const summaryText = () => {
    const lines: string[] = []
    lines.push(`DAILY STAND-UP — ${project.name} — ${niceDate(date)}${sprint ? ` — ${sprint.name}` : ''}`)
    lines.push(`Reported: ${dayEntries.length}/${activeMembers.length} · Completed: ${completedOnDay.length} · In progress: ${inProgress.length} · Blockers: ${blockerTexts.length}`)
    lines.push('')
    activeMembers.forEach((m) => {
      const e = dayEntries.find((x) => x.memberId === m.id)
      lines.push(m.name.toUpperCase())
      if (!e) {
        lines.push('  (no update)')
      } else {
        lines.push(`  Yesterday: ${e.yesterday || '—'}`)
        lines.push(`  Today: ${e.today || '—'}`)
        lines.push(`  Blockers: ${e.blockers || 'none'}`)
      }
      lines.push('')
    })
    if (blockerTexts.length) {
      lines.push('BLOCKERS')
      blockerTexts.forEach((b) => lines.push(`  🔴 ${b.who}: ${b.text}`))
    }
    return lines.join('\n')
  }
  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summaryText())
      toast('Summary copied', 'success')
    } catch {
      toast('Clipboard unavailable — use Download instead', 'error')
    }
  }

  return (
    <div>
      <PageHeader
        title="Daily Stand-up"
        subtitle={sprint ? `${sprint.name} · ${sprint.goal || 'no goal set'}` : 'No active sprint'}
        actions={
          <>
            <div className="flex items-center gap-1">
              <button className="btn-secondary btn-sm" onClick={() => setDate(dayKey(shiftDays(date, -1)))} aria-label="Previous day">
                <ChevronLeft size={14} />
              </button>
              <input className="input input-sm w-auto" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
              <button className="btn-secondary btn-sm" onClick={() => setDate(dayKey(shiftDays(date, 1)))} aria-label="Next day">
                <ChevronRight size={14} />
              </button>
            </div>
            <button className="btn-secondary btn-sm" onClick={copySummary}>
              <Copy size={14} /> Copy summary
            </button>
            <button className="btn-secondary btn-sm" onClick={() => downloadText(`standup-${project.key}-${date}.txt`, summaryText())}>
              <Download size={14} /> Download .txt
            </button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <KPI label="Reported" value={`${dayEntries.length}/${activeMembers.length}`} hint="team members" tone={dayEntries.length === activeMembers.length && activeMembers.length ? 'good' : 'default'} />
        <KPI label="Completed" value={completedOnDay.length} hint={`items on ${niceDate(date)}`} tone="good" />
        <KPI label="In progress" value={inProgress.length} hint="items started" />
        <KPI label="Blockers" value={blockerTexts.length} tone={blockerTexts.length ? 'bad' : 'good'} hint="entries + blocked items" />
        <KPI label="At risk" value={atRisk.length} tone={atRisk.length ? 'warn' : 'default'} hint="overdue, not done" />
      </div>

      {(blockerTexts.length > 0 || atRisk.length > 0) && (
        <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {blockerTexts.length > 0 && (
            <Card title="Blockers">
              <ul className="space-y-1.5 text-sm">
                {blockerTexts.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-red-700 dark:text-red-300">
                    <AlertOctagon size={14} className="mt-0.5 shrink-0" />
                    <span>
                      <span className="font-semibold">{b.who}:</span>{' '}
                      {b.item ? (
                        <button className="hover:underline" onClick={() => drawer.open(b.item!.id)}>
                          {b.text}
                        </button>
                      ) : (
                        b.text
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {atRisk.length > 0 && (
            <Card title="At-risk items (overdue)">
              <ul className="space-y-1.5 text-sm">
                {atRisk.map((i) => (
                  <li key={i.id} className="flex items-center gap-2">
                    <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => drawer.open(i.id)}>
                      <span className="mr-1 font-mono text-xs text-slate-500">{itemKey(project, i)}</span>
                      {i.title}
                    </button>
                    <span className="text-xs text-amber-600 dark:text-amber-400">due {niceDate(i.dueDate)}</span>
                    <Avatar member={members.find((m) => m.id === i.assigneeId)} size="xs" />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[380px_1fr]">
        <Card title={me ? `My update · ${me.name}` : 'My update'}>
          {!me ? (
            <p className="text-sm text-slate-500">Pick who you are under <span className="font-semibold">Acting as</span> in the sidebar to post your update.</p>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="label mb-0">Yesterday</span>
                  <button className="text-[11px] text-brand-600 hover:underline" onClick={insertCompleted}>
                    + items I completed yesterday
                  </button>
                </div>
                <textarea className="input min-h-[70px]" value={yesterday} onChange={(e) => setYesterday(e.target.value)} placeholder="What did you complete?" />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="label mb-0">Today</span>
                  <button className="text-[11px] text-brand-600 hover:underline" onClick={insertInProgress}>
                    + my in-progress items
                  </button>
                </div>
                <textarea className="input min-h-[70px]" value={today} onChange={(e) => setToday(e.target.value)} placeholder="What will you work on?" />
              </div>
              <div>
                <span className="label">Blockers</span>
                <textarea className="input min-h-[50px]" value={blockers} onChange={(e) => setBlockers(e.target.value)} placeholder="What is blocking you? (leave empty if nothing)" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{myEntry ? `Last saved ${niceDate(myEntry.updatedAt)}` : 'Not posted yet'}</span>
                <button className="btn-primary btn-sm" onClick={save}>
                  {myEntry ? 'Update' : 'Post update'}
                </button>
              </div>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card title={`Team · ${niceDate(date)}`}>
            {activeMembers.length === 0 ? (
              <EmptyState title="No active members" hint="Add people on the Team page." />
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {activeMembers.map((m) => {
                  const e = dayEntries.find((x) => x.memberId === m.id)
                  return <MemberCard key={m.id} name={m.name} role={ROLE_LABEL[m.role]} avatar={<Avatar member={m} size="md" />} entry={e} />
                })}
              </div>
            )}
          </Card>

          <Card title="Last 7 days">
            <div className="flex flex-wrap gap-2">
              {history.map((h) => (
                <button
                  key={h.date}
                  onClick={() => setDate(h.date)}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${h.date === date ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}
                >
                  <div className="font-medium">{niceDate(h.date)}</div>
                  <div className="text-slate-500">
                    {h.count}/{activeMembers.length} reported
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function MemberCard({ name, role, avatar, entry }: { name: string; role: string; avatar: React.ReactNode; entry?: StandupEntry }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="mb-2 flex items-center gap-2">
        {avatar}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{name}</div>
          <div className="text-[11px] text-slate-500">{role}</div>
        </div>
        {entry?.blockers.trim() && <span className="ml-auto rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">Blocked</span>}
      </div>
      {!entry ? (
        <div className="text-xs italic text-slate-400">No update yet</div>
      ) : (
        <dl className="space-y-1.5 text-xs">
          <div>
            <dt className="font-semibold text-slate-500">Yesterday</dt>
            <dd className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{entry.yesterday || '—'}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Today</dt>
            <dd className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{entry.today || '—'}</dd>
          </div>
          {entry.blockers.trim() && (
            <div className="rounded bg-red-50 px-2 py-1 dark:bg-red-950/40">
              <dt className="font-semibold text-red-700 dark:text-red-300">Blockers</dt>
              <dd className="whitespace-pre-wrap text-red-700 dark:text-red-300">{entry.blockers}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  )
}
