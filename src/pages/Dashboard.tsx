import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlertOctagon, CalendarClock, ClipboardList, Sparkles } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { useStore } from '../data/store'
import { useActiveSprint, useCurrentMember, useCurrentProject, useMemberMap, useProjectItems, useProjectMembers, useProjectSprints, useVelocityHistory } from '../data/hooks'
import { burndown, isDone, sprintCompletion, sprintHealth, sumPoints, velocity, workload } from '../domain/metrics'
import { dayKey, daysBetween, niceDate, relativeDays } from '../domain/dates'
import { STATUS_LABEL, itemKey, type Activity, type Status } from '../domain/types'
import { Avatar, Card, EmptyState, KPI, PageHeader, Progress, RiskPill, StatusBadge, TypeIcon } from '../ui/primitives'
import { useItemDrawer } from '../app/useItemDrawer'
import { BurndownChart, VelocityChart } from '../app/charts'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function ago(iso: string) {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true })
  } catch {
    return iso
  }
}

export function Dashboard() {
  const project = useCurrentProject()
  const me = useCurrentMember()
  const items = useProjectItems(project?.id)
  const sprints = useProjectSprints(project?.id)
  const active = useActiveSprint(project?.id)
  const members = useProjectMembers(project)
  const memberMap = useMemberMap()
  const history = useVelocityHistory(project?.id)
  const activities = useStore((s) => s.activities)
  const retroActions = useStore((s) => s.retroActions)
  const drawer = useItemDrawer()
  const today = dayKey()

  const health = useMemo(() => (active ? sprintHealth(active, items, members, history, today) : undefined), [active, items, members, history, today])
  const completion = useMemo(() => (active ? sprintCompletion(active, items) : undefined), [active, items])
  const bd = useMemo(() => (active ? burndown(active, items, today) : []), [active, items, today])
  const wl = useMemo(() => workload(active, items, members), [active, items, members])
  const vel = useMemo(() => velocity(sprints, items).slice(-6), [sprints, items])
  const recent = useMemo(() => activities.filter((a) => a.projectId === project?.id).slice(0, 12), [activities, project?.id])
  const openActions = useMemo(
    () => retroActions.filter((r) => r.projectId === project?.id && r.status === 'open').sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')),
    [retroActions, project?.id],
  )
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  if (!project) {
    return <EmptyState icon={<ClipboardList />} title="No project yet" hint="Create a project to start planning sprints." action={<Link className="btn-primary" to="/projects">Create a project</Link>} />
  }

  const firstName = me?.name.split(' ')[0]
  const capacityTotal = wl.reduce((a, r) => a + r.capacity, 0)
  const assignedTotal = wl.reduce((a, r) => a + r.assigned, 0)
  const utilization = capacityTotal ? Math.round((assignedTotal / capacityTotal) * 100) : 0
  const backlogItems = items.filter((i) => i.type !== 'epic' && !i.sprintId && !isDone(i))

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        subtitle={
          <>
            <span className="font-medium text-slate-700 dark:text-slate-200">{project.name}</span>
            {active ? ` · ${active.name} · ${niceDate(active.startDate)} – ${niceDate(active.endDate)}` : ' · no active sprint'}
          </>
        }
        actions={!active && <Link className="btn-primary" to="/sprints">Plan a sprint</Link>}
      />

      {/* KPI row */}
      {active && health && completion ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KPI label="Sprint" value={active.name} hint={`${health.daysLeft} day${health.daysLeft === 1 ? '' : 's'} left · ${health.timePct}% elapsed`} />
          <KPI label="Completed" value={`${health.completed} SP`} hint={`${completion.items.done} of ${completion.items.total} items`} tone="good" />
          <KPI label="Remaining" value={`${health.remaining} SP`} hint={`${health.progressPct}% done`} tone={health.progressPct < health.timePct ? 'warn' : 'default'} />
          <KPI label="Capacity used" value={`${utilization}%`} hint={`${assignedTotal} / ${capacityTotal} SP`} tone={utilization > 105 ? 'bad' : utilization > 85 ? 'warn' : 'default'} />
          <KPI label="Open blockers" value={health.blocked.length} hint={health.blockedPoints ? `${health.blockedPoints} SP held` : 'nothing blocked'} tone={health.blocked.length ? 'bad' : 'good'} />
          <KPI label="Overdue" value={health.overdue.length} hint={health.overdue.length ? 'past due date' : 'all on time'} tone={health.overdue.length ? 'warn' : 'good'} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KPI label="Backlog items" value={backlogItems.length} hint={`${sumPoints(backlogItems)} SP unplanned`} />
          <KPI label="Planned sprints" value={sprints.filter((s) => s.status === 'planned').length} hint="ready to start" />
          <KPI label="Completed sprints" value={sprints.filter((s) => s.status === 'completed').length} hint={history.length ? `avg ${Math.round(history.reduce((a, p) => a + p.completed, 0) / history.length)} SP` : 'no history yet'} />
          <KPI label="Team" value={members.filter((m) => m.active).length} hint={`${capacityTotal} SP capacity`} />
        </div>
      )}

      {active && health && completion && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {/* Burndown */}
          <Card title="Sprint burndown" className="xl:col-span-2">
            <BurndownChart data={bd} />
          </Card>

          {/* Health */}
          <Card
            title={
              <span className="flex items-center gap-2">
                <Sparkles size={14} className="text-brand-600" /> Sprint health
              </span>
            }
            actions={<RiskPill risk={health.risk} />}
          >
            <div className="mb-3 flex items-end gap-3">
              <div className={`text-4xl font-semibold tabular-nums ${health.risk === 'high' ? 'text-red-600 dark:text-red-400' : health.risk === 'medium' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{health.score}</div>
              <div className="pb-1 text-xs text-slate-500">/ 100 health score</div>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-800/60">
                <div className="text-slate-500">Needed pace</div>
                <div className="font-semibold">{health.requiredPerDay} SP/day</div>
              </div>
              <div className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-800/60">
                <div className="text-slate-500">Recent pace</div>
                <div className="font-semibold">{health.expectedPerDay} SP/day</div>
              </div>
            </div>
            <div className="label">Findings</div>
            <ul className="mb-3 space-y-1 text-sm text-slate-700 dark:text-slate-300">
              {health.findings.map((f, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-slate-400">•</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="label">Recommendations</div>
            <ul className="space-y-1 text-sm">
              {health.recommendations.map((r, i) => (
                <li key={i} className="rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-brand-900 dark:border-brand-900/50 dark:bg-brand-900/20 dark:text-brand-100">
                  {r}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Progress + velocity */}
        <div className="space-y-4">
          {active && health && completion && (
            <Card title="Sprint progress">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-semibold">{health.progressPct}%</span>
                <span className="text-xs text-slate-500">
                  {health.completed} / {health.completed + health.remaining} SP
                </span>
              </div>
              <Progress value={health.progressPct} tone={health.risk === 'high' ? 'bad' : health.risk === 'medium' ? 'warn' : 'good'} />
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <dt className="text-slate-500">Committed</dt>
                <dd className="text-right font-medium">{completion.committed} SP</dd>
                <dt className="text-slate-500">Completed</dt>
                <dd className="text-right font-medium">{completion.completed} SP</dd>
                <dt className="text-slate-500">Added mid-sprint</dt>
                <dd className={`text-right font-medium ${completion.addedDuringSprint ? 'text-amber-600 dark:text-amber-400' : ''}`}>{completion.addedDuringSprint} SP</dd>
                <dt className="text-slate-500">Not yet done</dt>
                <dd className="text-right font-medium">{completion.carriedOver} SP</dd>
              </dl>
              {active.goal && (
                <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60">
                  <div className="label mb-0.5">Sprint goal</div>
                  {active.goal}
                </div>
              )}
            </Card>
          )}
          <Card title="Velocity" actions={<Link to="/reports" className="text-xs text-brand-600 hover:underline">Reports</Link>}>
            {vel.length ? <VelocityChart data={vel} height={200} /> : <div className="py-6 text-center text-xs text-slate-500">Complete a sprint to see velocity.</div>}
          </Card>
        </div>

        {/* Workload */}
        <Card title="Team workload" actions={<Link to="/team" className="text-xs text-brand-600 hover:underline">Team</Link>}>
          {wl.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500">No active members.</div>
          ) : (
            <ul className="space-y-3">
              {wl.map((r) => {
                const u = r.utilization ?? 0
                const tone = u > 1 ? 'bad' : u > 0.85 ? 'warn' : 'brand'
                return (
                  <li key={r.member.id} className="flex items-center gap-3">
                    <Avatar member={r.member} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="truncate font-medium">{r.member.name}</span>
                        <span className="tabular-nums text-slate-500">
                          {r.assigned} / {r.capacity || '–'} SP{r.utilization !== null ? ` · ${Math.round(u * 100)}%` : ''}
                        </span>
                      </div>
                      <Progress value={r.capacity ? r.assigned : 0} max={r.capacity || 1} tone={tone} className="mt-1" />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* Blockers & risks */}
        <Card
          title={
            <span className="flex items-center gap-2">
              <AlertOctagon size={14} className="text-red-500" /> Blockers & risks
            </span>
          }
        >
          {health && health.blocked.length > 0 && (
            <div className="mb-3">
              <div className="label">Blocked</div>
              <ul className="space-y-1.5">
                {health.blocked.map((i) => (
                  <li key={i.id} className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm dark:border-red-900/50 dark:bg-red-950/30">
                    <button className="flex w-full items-center gap-2 text-left hover:underline" onClick={() => drawer.open(i.id)}>
                      <TypeIcon type={i.type} />
                      <span className="mr-1 font-mono text-xs text-slate-500">{itemKey(project, i)}</span>
                      <span className="min-w-0 flex-1 truncate">{i.title}</span>
                    </button>
                    {i.blockedReason && <div className="mt-0.5 text-xs text-red-700 dark:text-red-300">{i.blockedReason}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {health && health.overdue.length > 0 && (
            <div className="mb-3">
              <div className="label">Overdue</div>
              <ul className="space-y-1">
                {health.overdue.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 text-sm">
                    <CalendarClock size={14} className="text-amber-500" />
                    <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => drawer.open(i.id)}>
                      {i.title}
                    </button>
                    <span className="text-xs text-amber-600 dark:text-amber-400">{daysBetween(i.dueDate!, today)}d late</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <div className="label">Open retro actions</div>
            {openActions.length === 0 ? (
              <div className="text-xs text-slate-500">No open action items.</div>
            ) : (
              <ul className="space-y-1">
                {openActions.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex items-start gap-2 text-sm">
                    <Avatar member={memberMap.get(a.ownerId ?? '')} size="xs" className="mt-0.5" />
                    <span className="min-w-0 flex-1">{a.description}</span>
                    {a.dueDate && <span className={`shrink-0 text-xs ${a.dueDate < today ? 'text-red-600' : 'text-slate-500'}`}>{relativeDays(a.dueDate, today)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {health && !health.blocked.length && !health.overdue.length && openActions.length === 0 && <div className="mt-2 text-xs text-emerald-600">Nothing blocked or overdue.</div>}
        </Card>
      </div>

      {/* Recent activity */}
      <Card title="Recent activity">
        {recent.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-500">No activity yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {recent.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
                <Avatar member={memberMap.get(a.actorId ?? '')} size="xs" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{memberMap.get(a.actorId ?? '')?.name ?? 'Someone'}</span> {describe(a, itemById, project, drawer.open)}
                </span>
                <span className="shrink-0 text-xs text-slate-400">{ago(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function describe(a: Activity, itemById: Map<string, { id: string; title: string; number: number; status: Status }>, project: { key: string }, open: (id: string) => void) {
  const item = a.itemId ? itemById.get(a.itemId) : undefined
  const ref = item ? (
    <button className="font-mono text-xs text-brand-600 hover:underline" onClick={() => open(item.id)}>
      {itemKey(project, item)}
    </button>
  ) : (
    <span className="text-slate-500">{a.from ?? 'an item'}</span>
  )
  switch (a.kind) {
    case 'created':
      return <>created {ref}</>
    case 'commented':
      return <>commented on {ref}</>
    case 'status':
      return (
        <>
          moved {ref} to <StatusBadge status={(a.to as Status) ?? 'todo'} />
        </>
      )
    case 'assignee':
      return <>reassigned {ref}</>
    case 'points':
      return <>re-estimated {ref} ({a.from || '–'} → {a.to || '–'} SP)</>
    case 'priority':
      return <>changed priority of {ref} to {a.to}</>
    case 'sprint':
      return item ? <>moved {ref} to another sprint</> : <>{a.to}</>
    case 'blocked':
      return <>{a.to === 'unblocked' ? 'unblocked' : 'blocked'} {ref}</>
    case 'deleted':
      return <>deleted "{a.from}"</>
    default:
      return <>{STATUS_LABEL[(a.to as Status) ?? 'todo'] ? a.kind : a.kind}</>
  }
}
