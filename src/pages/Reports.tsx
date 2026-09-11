import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Download, FileSpreadsheet } from 'lucide-react'
import clsx from 'clsx'
import { useStore } from '../data/store'
import { useActiveSprint, useCurrentProject, useMemberMap, useProjectItems, useProjectMembers, useProjectSprints, useVelocityHistory } from '../data/hooks'
import { averageVelocity, burndown, flowStats, isDone, pct, sprintCompletion, sprintItems, sprintSummary, sumPoints, workload } from '../domain/metrics'
import { dayKey, daysBetween, niceDate, sprintDays } from '../domain/dates'
import { itemKey, type WorkItem } from '../domain/types'
import { downloadText, exportProjectExcel } from '../data/io'
import { Avatar, Card, EmptyState, KPI, PageHeader, Progress, StatusBadge, TypeIcon } from '../ui/primitives'
import { toast } from '../ui/toast'
import { useItemDrawer } from '../app/useItemDrawer'
import { BurndownChart, BurnupChart, VelocityChart, WorkloadChart, type BurnupPoint } from '../app/charts'

const TABS = ['Sprint report', 'Burndown', 'Burnup', 'Velocity', 'Workload', 'Flow', 'Blockers', 'Epic progress'] as const
type Tab = (typeof TABS)[number]

export function Reports() {
  const project = useCurrentProject()
  const items = useProjectItems(project?.id)
  const sprints = useProjectSprints(project?.id)
  const active = useActiveSprint(project?.id)
  const members = useProjectMembers(project)
  const memberMap = useMemberMap()
  const history = useVelocityHistory(project?.id)
  const standups = useStore((s) => s.standups)
  const retroActions = useStore((s) => s.retroActions)
  const activities = useStore((s) => s.activities)
  const drawer = useItemDrawer()
  const [tab, setTab] = useState<Tab>('Sprint report')
  const [sprintId, setSprintId] = useState<string>()
  const today = dayKey()

  const sprint = useMemo(() => {
    if (sprintId) return sprints.find((s) => s.id === sprintId)
    return active ?? [...sprints].sort((a, b) => b.startDate.localeCompare(a.startDate))[0]
  }, [sprintId, sprints, active])

  const name = (id?: string) => memberMap.get(id ?? '')?.name ?? 'Unassigned'

  if (!project) {
    return <EmptyState title="No project yet" hint="Create a project to see reports." action={<Link className="btn-primary" to="/projects">Create a project</Link>} />
  }

  const exportExcel = () => {
    exportProjectExcel(
      project,
      items,
      sprints,
      members,
      standups.filter((s) => s.projectId === project.id),
      retroActions.filter((r) => r.projectId === project.id),
    )
    toast('Excel workbook downloaded', 'success')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        subtitle={`${project.name} · sprint and team analytics`}
        actions={
          <>
            <select className="input input-sm w-auto" value={sprint?.id ?? ''} onChange={(e) => setSprintId(e.target.value || undefined)}>
              {sprints.length === 0 && <option value="">No sprints</option>}
              {[...sprints].reverse().map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.status})
                </option>
              ))}
            </select>
            <button className="btn-secondary btn-sm" onClick={exportExcel}>
              <FileSpreadsheet size={14} /> Export Excel
            </button>
          </>
        }
      />

      <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => (
          <button key={t} className={clsx('-mb-px border-b-2 px-3 py-2 text-sm font-medium', tab === t ? 'border-brand-600 text-brand-700 dark:text-brand-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200')} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Sprint report' && (sprint ? <SprintReport sprint={sprint} /> : <NoSprint />)}
      {tab === 'Burndown' && (sprint ? <Card title={`${sprint.name} burndown`}><BurndownChart data={burndown(sprint, items, today)} height={340} /></Card> : <NoSprint />)}
      {tab === 'Burnup' && (sprint ? <Card title={`${sprint.name} burnup`}><BurnupChart data={burnup(sprint, items, today)} height={340} /></Card> : <NoSprint />)}
      {tab === 'Velocity' && <VelocityTab />}
      {tab === 'Workload' && (
        <Card title={sprint ? `Workload · ${sprint.name}` : 'Workload · open items'}>
          <WorkloadChart data={workload(sprint, items, members)} />
        </Card>
      )}
      {tab === 'Flow' && <FlowTab />}
      {tab === 'Blockers' && <BlockersTab />}
      {tab === 'Epic progress' && <EpicsTab />}
    </div>
  )

  function NoSprint() {
    return <EmptyState title="No sprint to report on" hint="Create a sprint from the Sprints page." action={<Link className="btn-primary" to="/sprints">Go to Sprints</Link>} />
  }

  function SprintReport({ sprint }: { sprint: NonNullable<typeof active> }) {
    const comp = sprintCompletion(sprint, items)
    const its = sprintItems(sprint, items).sort((a, b) => a.rank - b.rank)
    const done = its.filter(isDone)
    const open = its.filter((i) => !isDone(i))
    const text = sprintSummary(sprint, items, members, history, today)
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(text)
        toast('Summary copied', 'success')
      } catch {
        toast('Could not copy — download instead', 'error')
      }
    }
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KPI label="Committed" value={`${comp.committed} SP`} hint={`${comp.items.total} items`} />
          <KPI label="Completed" value={`${comp.completed} SP`} hint={`${comp.items.done} items · ${pct(comp.completed, comp.committed || 1)}%`} tone="good" />
          <KPI label="Not completed" value={`${comp.carriedOver} SP`} hint={sprint.status === 'completed' ? 'carried over' : 'still open'} tone={comp.carriedOver ? 'warn' : 'default'} />
          <KPI label="Added mid-sprint" value={`${comp.addedDuringSprint} SP`} hint="scope change" tone={comp.addedDuringSprint ? 'warn' : 'default'} />
        </div>
        {sprint.goal && (
          <Card title="Sprint goal">
            <p className="text-sm">{sprint.goal}</p>
            <p className="mt-1 text-xs text-slate-500">
              {niceDate(sprint.startDate)} – {niceDate(sprint.endDate)} · capacity {sprint.capacity} SP
            </p>
          </Card>
        )}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title={`Done · ${done.length}`} padded={false}>
            <ItemTable rows={done} />
          </Card>
          <Card title={`Not done · ${open.length}`} padded={false}>
            <ItemTable rows={open} />
          </Card>
        </div>
        <Card
          title="Sprint summary (text)"
          actions={
            <div className="flex gap-1">
              <button className="btn-ghost btn-sm" onClick={copy}>
                <Copy size={14} /> Copy
              </button>
              <button className="btn-ghost btn-sm" onClick={() => downloadText(`${project!.key}-${sprint.name.replace(/\s+/g, '-')}-summary.txt`, text)}>
                <Download size={14} /> Download .txt
              </button>
            </div>
          }
        >
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-xs leading-relaxed dark:bg-slate-800/60">{text}</pre>
        </Card>
      </div>
    )
  }

  function ItemTable({ rows }: { rows: WorkItem[] }) {
    if (!rows.length) return <div className="px-4 py-6 text-center text-xs text-slate-500">Nothing here.</div>
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Key</th>
              <th className="px-2 py-2">Title</th>
              <th className="px-2 py-2">Assignee</th>
              <th className="px-2 py-2 text-right">SP</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((i) => (
              <tr key={i.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="whitespace-nowrap px-4 py-1.5 font-mono text-xs text-slate-500">
                  <span className="mr-1 inline-block align-middle">
                    <TypeIcon type={i.type} />
                  </span>
                  {itemKey(project, i)}
                </td>
                <td className="px-2 py-1.5">
                  <button className="text-left hover:underline" onClick={() => drawer.open(i.id)}>
                    {i.title}
                  </button>
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-xs">
                  <span className="mr-1 inline-block align-middle">
                    <Avatar member={memberMap.get(i.assigneeId ?? '')} size="xs" />
                  </span>
                  {name(i.assigneeId)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{i.points ?? '–'}</td>
                <td className="px-4 py-1.5">
                  <StatusBadge status={i.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  function VelocityTab() {
    if (!history.length) return <EmptyState title="No completed sprints yet" hint="Velocity appears once a sprint has been completed." />
    const avg = averageVelocity(history)
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KPI label="Average (last 3)" value={`${avg} SP`} />
          <KPI label="Best sprint" value={`${Math.max(...history.map((h) => h.completed))} SP`} />
          <KPI label="Sprints" value={history.length} />
          <KPI label="Commit accuracy" value={`${pct(history.reduce((a, h) => a + h.completed, 0), history.reduce((a, h) => a + h.committed, 0) || 1)}%`} hint="completed / committed" />
        </div>
        <Card title="Velocity by sprint">
          <VelocityChart data={history} height={300} average={avg} />
        </Card>
        <Card title="Velocity table" padded={false}>
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Sprint</th>
                <th className="px-2 py-2 text-right">Committed</th>
                <th className="px-2 py-2 text-right">Completed</th>
                <th className="px-4 py-2 text-right">Delivered %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {history.map((h) => (
                <tr key={h.sprintId}>
                  <td className="px-4 py-1.5">{h.name}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{h.committed}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{h.completed}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{pct(h.completed, h.committed || 1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    )
  }

  function FlowTab() {
    const fs = flowStats(items)
    const done = items.filter((i) => i.type !== 'epic' && isDone(i) && i.completedAt).sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <KPI label="Avg cycle time" value={fs.avgCycleDays === null ? '–' : `${fs.avgCycleDays} d`} hint="started → done" />
          <KPI label="Avg lead time" value={fs.avgLeadDays === null ? '–' : `${fs.avgLeadDays} d`} hint="created → done" />
          <KPI label="Items sampled" value={fs.sampled} />
        </div>
        <Card title="Completed items" padded={false}>
          {done.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-slate-500">No completed items yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Key</th>
                    <th className="px-2 py-2">Title</th>
                    <th className="px-2 py-2">Created</th>
                    <th className="px-2 py-2">Started</th>
                    <th className="px-2 py-2">Completed</th>
                    <th className="px-2 py-2 text-right">Cycle</th>
                    <th className="px-4 py-2 text-right">Lead</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {done.map((i) => (
                    <tr key={i.id}>
                      <td className="whitespace-nowrap px-4 py-1.5 font-mono text-xs text-slate-500">{itemKey(project, i)}</td>
                      <td className="px-2 py-1.5">
                        <button className="text-left hover:underline" onClick={() => drawer.open(i.id)}>
                          {i.title}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-xs">{niceDate(i.createdAt)}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-xs">{i.startedAt ? niceDate(i.startedAt) : '–'}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-xs">{niceDate(i.completedAt)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{i.startedAt ? `${daysBetween(dayKey(i.startedAt), dayKey(i.completedAt!))} d` : '–'}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{daysBetween(dayKey(i.createdAt), dayKey(i.completedAt!))} d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    )
  }

  function BlockersTab() {
    const blocked = items.filter((i) => i.type !== 'epic' && !isDone(i) && (i.blocked || i.status === 'blocked'))
    const cutoff = dayKey(new Date(Date.now() - 30 * 86_400_000))
    const recentBlocks = activities.filter((a) => a.projectId === project!.id && a.kind === 'blocked' && a.to !== 'unblocked' && dayKey(a.at) >= cutoff).length
    const sprintName = (id?: string) => sprints.find((s) => s.id === id)?.name ?? 'Backlog'
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <KPI label="Currently blocked" value={blocked.length} hint={`${sumPoints(blocked)} SP held`} tone={blocked.length ? 'bad' : 'good'} />
          <KPI label="Blocked in last 30 days" value={recentBlocks} hint="block events" />
          <KPI label="Oldest block" value={blocked.length ? `${Math.max(...blocked.map((i) => daysBetween(dayKey(i.updatedAt), today)))} d` : '–'} hint="since last update" />
        </div>
        <Card title="Blocked items" padded={false}>
          {blocked.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-slate-500">Nothing is blocked. 🎉</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Key</th>
                    <th className="px-2 py-2">Title</th>
                    <th className="px-2 py-2">Reason</th>
                    <th className="px-2 py-2">Assignee</th>
                    <th className="px-2 py-2">Sprint</th>
                    <th className="px-4 py-2 text-right">SP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {blocked.map((i) => (
                    <tr key={i.id}>
                      <td className="whitespace-nowrap px-4 py-1.5 font-mono text-xs text-slate-500">{itemKey(project, i)}</td>
                      <td className="px-2 py-1.5">
                        <button className="text-left hover:underline" onClick={() => drawer.open(i.id)}>
                          {i.title}
                        </button>
                      </td>
                      <td className="px-2 py-1.5 text-xs text-red-700 dark:text-red-300">{i.blockedReason ?? '—'}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-xs">{name(i.assigneeId)}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-xs">{sprintName(i.sprintId)}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{i.points ?? '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    )
  }

  function EpicsTab() {
    const epics = items.filter((i) => i.type === 'epic').sort((a, b) => a.rank - b.rank)
    if (!epics.length) return <EmptyState title="No epics" hint="Create an epic from the Backlog to group stories." />
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {epics.map((e) => {
          const children = items.filter((i) => i.parentId === e.id).sort((a, b) => a.rank - b.rank)
          const total = sumPoints(children)
          const done = sumPoints(children.filter(isDone))
          return (
            <Card
              key={e.id}
              title={
                <button className="flex items-center gap-2 hover:underline" onClick={() => drawer.open(e.id)}>
                  <TypeIcon type="epic" /> {e.title}
                </button>
              }
              actions={<StatusBadge status={e.status} />}
            >
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>
                  {children.filter(isDone).length} / {children.length} items done
                </span>
                <span>
                  {done} / {total} SP · {pct(done, total)}%
                </span>
              </div>
              <Progress value={done} max={total || 1} tone={pct(done, total) === 100 ? 'good' : 'brand'} />
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                {children.length === 0 && <li className="py-2 text-xs text-slate-500">No stories linked yet.</li>}
                {children.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 py-1.5 text-sm">
                    <TypeIcon type={c.type} />
                    <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => drawer.open(c.id)}>
                      <span className="mr-1 font-mono text-xs text-slate-500">{itemKey(project, c)}</span>
                      {c.title}
                    </button>
                    <span className="text-xs tabular-nums text-slate-500">{c.points ?? '–'} SP</span>
                    <StatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
            </Card>
          )
        })}
      </div>
    )
  }
}

function burnup(sprint: { id: string; startDate: string; endDate: string }, items: WorkItem[], today: string): BurnupPoint[] {
  const its = items.filter((i) => i.sprintId === sprint.id && i.type !== 'epic')
  return sprintDays(sprint.startDate, sprint.endDate).map((date) => {
    const scope = sumPoints(its.filter((i) => !i.sprintAddedAt || dayKey(i.sprintAddedAt) <= date))
    const completed = date <= today ? sumPoints(its.filter((i) => isDone(i) && i.completedAt && dayKey(i.completedAt) <= date)) : null
    return { date, scope, completed }
  })
}
