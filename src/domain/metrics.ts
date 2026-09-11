import type { Member, Sprint, WorkItem } from './types'
import { STARTED_STATUSES } from './types'
import { dayKey, daysBetween, sprintDays } from './dates'

/* ---------- helpers ---------- */

export const pts = (i: Pick<WorkItem, 'points'>): number => i.points ?? 0
export const sumPoints = (items: Pick<WorkItem, 'points'>[]): number => items.reduce((a, i) => a + pts(i), 0)

/** Items that count towards a sprint's scope (epics are containers, never sprint work). */
export function sprintItems(sprint: Pick<Sprint, 'id'>, items: WorkItem[]): WorkItem[] {
  return items.filter((i) => i.sprintId === sprint.id && i.type !== 'epic')
}

export const isDone = (i: Pick<WorkItem, 'status'>): boolean => i.status === 'done'
export const isStarted = (i: Pick<WorkItem, 'status'>): boolean => STARTED_STATUSES.includes(i.status)

export function pct(part: number, whole: number): number {
  if (!whole) return 0
  return Math.round((part / whole) * 100)
}

/* ---------- burndown ---------- */

export interface BurndownPoint {
  date: string
  /** Ideal remaining points (straight line from committed scope to zero). */
  ideal: number
  /** Actual remaining points, null for future days. */
  actual: number | null
  /** Scope on that day (grows when items are added mid-sprint). */
  scope: number
}

export function burndown(sprint: Sprint, items: WorkItem[], today: string = dayKey()): BurndownPoint[] {
  const its = sprintItems(sprint, items)
  const days = sprintDays(sprint.startDate, sprint.endDate)
  const initialScope = sprint.committedPoints ?? sumPoints(its.filter((i) => !i.sprintAddedAt || dayKey(i.sprintAddedAt) <= sprint.startDate))
  const steps = Math.max(days.length - 1, 1)
  return days.map((date, idx) => {
    const scope = sumPoints(its.filter((i) => !i.sprintAddedAt || dayKey(i.sprintAddedAt) <= date))
    const done = sumPoints(its.filter((i) => isDone(i) && i.completedAt && dayKey(i.completedAt) <= date))
    const ideal = Math.max(0, Math.round((initialScope * (1 - idx / steps)) * 10) / 10)
    const actual = date <= today ? Math.max(0, scope - done) : null
    return { date, ideal, actual, scope }
  })
}

/* ---------- velocity ---------- */

export interface VelocityPoint {
  sprintId: string
  name: string
  committed: number
  completed: number
}

export function velocity(sprints: Sprint[], items: WorkItem[]): VelocityPoint[] {
  return sprints
    .filter((s) => s.status === 'completed')
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((s) => {
      const its = sprintItems(s, items)
      return {
        sprintId: s.id,
        name: s.name,
        committed: s.committedPoints ?? sumPoints(its),
        completed: s.completedPoints ?? sumPoints(its.filter(isDone)),
      }
    })
}

export function averageVelocity(v: VelocityPoint[], lastN = 3): number {
  const tail = v.slice(-lastN)
  if (!tail.length) return 0
  return Math.round((tail.reduce((a, p) => a + p.completed, 0) / tail.length) * 10) / 10
}

/* ---------- sprint completion breakdown ---------- */

export interface SprintCompletion {
  committed: number
  completed: number
  remaining: number
  addedDuringSprint: number
  carriedOver: number
  items: { total: number; done: number }
}

export function sprintCompletion(sprint: Sprint, items: WorkItem[]): SprintCompletion {
  const its = sprintItems(sprint, items)
  const added = its.filter((i) => i.sprintAddedAt && dayKey(i.sprintAddedAt) > sprint.startDate)
  const doneItems = its.filter(isDone)
  const committed = sprint.committedPoints ?? sumPoints(its) - sumPoints(added)
  const completed = sprint.completedPoints ?? sumPoints(doneItems)
  return {
    committed,
    completed,
    remaining: Math.max(0, sumPoints(its) - sumPoints(doneItems)),
    addedDuringSprint: sumPoints(added),
    carriedOver: sumPoints(its.filter((i) => !isDone(i))),
    items: { total: its.length, done: doneItems.length },
  }
}

/* ---------- workload ---------- */

export interface WorkloadRow {
  member: Member
  assigned: number
  done: number
  remaining: number
  itemCount: number
  capacity: number
  /** assigned / capacity, null when the member has no capacity set. */
  utilization: number | null
}

export function workload(sprint: Pick<Sprint, 'id'> | undefined, items: WorkItem[], members: Member[]): WorkloadRow[] {
  const its = sprint ? sprintItems(sprint, items) : items.filter((i) => i.type !== 'epic' && !isDone(i))
  return members
    .filter((m) => m.active)
    .map((m) => {
      const mine = its.filter((i) => i.assigneeId === m.id)
      const assigned = sumPoints(mine)
      const done = sumPoints(mine.filter(isDone))
      return {
        member: m,
        assigned,
        done,
        remaining: assigned - done,
        itemCount: mine.length,
        capacity: m.capacity,
        utilization: m.capacity ? Math.round((assigned / m.capacity) * 100) / 100 : null,
      }
    })
    .sort((a, b) => b.assigned - a.assigned)
}

/* ---------- cycle time / lead time ---------- */

export interface FlowStats {
  avgCycleDays: number | null
  avgLeadDays: number | null
  sampled: number
}

export function flowStats(items: WorkItem[]): FlowStats {
  const done = items.filter((i) => isDone(i) && i.completedAt)
  const cycles = done.filter((i) => i.startedAt).map((i) => daysBetween(dayKey(i.startedAt!), dayKey(i.completedAt!)))
  const leads = done.map((i) => daysBetween(dayKey(i.createdAt), dayKey(i.completedAt!)))
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)
  return { avgCycleDays: avg(cycles), avgLeadDays: avg(leads), sampled: done.length }
}

/* ---------- sprint health ("AI" insight engine, deterministic) ---------- */

export type Risk = 'low' | 'medium' | 'high' | 'none'

export interface SprintHealth {
  risk: Risk
  /** 0 (doomed) – 100 (comfortable). */
  score: number
  committed: number
  completed: number
  remaining: number
  totalDays: number
  daysElapsed: number
  daysLeft: number
  progressPct: number
  timePct: number
  requiredPerDay: number
  expectedPerDay: number
  projectedCompleted: number
  projectedShortfall: number
  blocked: WorkItem[]
  blockedPoints: number
  atRisk: WorkItem[]
  overdue: WorkItem[]
  notStarted: WorkItem[]
  overloaded: WorkloadRow[]
  idle: WorkloadRow[]
  findings: string[]
  recommendations: string[]
  moveCandidates: WorkItem[]
}

export function sprintHealth(
  sprint: Sprint,
  items: WorkItem[],
  members: Member[],
  history: VelocityPoint[],
  today: string = dayKey(),
): SprintHealth {
  const its = sprintItems(sprint, items)
  const comp = sprintCompletion(sprint, items)
  const totalScope = sumPoints(its)
  const completed = sumPoints(its.filter(isDone))
  const remaining = Math.max(0, totalScope - completed)
  const totalDays = Math.max(1, daysBetween(sprint.startDate, sprint.endDate) + 1)
  /** Days fully elapsed before today; today counts as a remaining day. */
  const daysElapsed = Math.min(totalDays, Math.max(0, daysBetween(sprint.startDate, today)))
  const daysLeft = Math.max(0, totalDays - daysElapsed)
  const progressPct = pct(completed, totalScope)
  const timePct = pct(daysElapsed, totalDays)

  const avgVel = averageVelocity(history)
  const sprintLen = totalDays
  const historicalPerDay = avgVel ? avgVel / sprintLen : 0
  const observedPerDay = daysElapsed > 0 ? completed / daysElapsed : 0
  const expectedPerDay = Math.round(((historicalPerDay && observedPerDay ? (historicalPerDay + observedPerDay) / 2 : historicalPerDay || observedPerDay) || (sprint.capacity ? sprint.capacity / sprintLen : totalScope / sprintLen)) * 100) / 100
  const requiredPerDay = daysLeft > 0 ? Math.round((remaining / daysLeft) * 100) / 100 : remaining
  const projectedCompleted = Math.min(totalScope, Math.round(completed + expectedPerDay * daysLeft))
  const projectedShortfall = Math.max(0, totalScope - projectedCompleted)

  const blocked = its.filter((i) => i.blocked || i.status === 'blocked')
  const blockedPoints = sumPoints(blocked)
  const overdue = its.filter((i) => !isDone(i) && i.dueDate && i.dueDate < today)
  const notStarted = its.filter((i) => !isDone(i) && !isStarted(i))
  const wl = workload(sprint, items, members.filter((m) => m.active))
  const overloaded = wl.filter((r) => r.utilization !== null && r.utilization > 1.05)
  const idle = wl.filter((r) => r.assigned === 0 && r.capacity > 0)

  const atRisk = its
    .filter((i) => !isDone(i))
    .filter((i) => i.blocked || i.status === 'blocked' || (i.dueDate && i.dueDate < today) || (!isStarted(i) && timePct >= 50 && pts(i) >= 5) || overloaded.some((o) => o.member.id === i.assigneeId))
    .sort((a, b) => pts(b) - pts(a))

  // Risk scoring
  let score = 100
  const gap = timePct - progressPct
  if (gap > 0) score -= Math.min(45, gap * 1.2)
  if (expectedPerDay > 0 && requiredPerDay > expectedPerDay) score -= Math.min(30, ((requiredPerDay / expectedPerDay) - 1) * 40)
  if (remaining > 0) score -= Math.min(20, (blockedPoints / Math.max(remaining, 1)) * 40)
  score -= Math.min(10, overloaded.length * 5)
  if (sprint.status === 'completed') score = pct(comp.completed, comp.committed || 1)
  score = Math.max(0, Math.min(100, Math.round(score)))

  let risk: Risk = 'low'
  if (sprint.status === 'planned') risk = 'none'
  else if (score < 50) risk = 'high'
  else if (score < 75) risk = 'medium'

  const findings: string[] = []
  const recommendations: string[] = []
  const moveCandidates: WorkItem[] = []

  if (sprint.status === 'active') {
    findings.push(`${completed} of ${totalScope} SP done (${progressPct}%) with ${timePct}% of the sprint elapsed — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left.`)
    if (expectedPerDay > 0) findings.push(`Team needs ${requiredPerDay} SP/day to finish; recent pace is ${expectedPerDay} SP/day.`)
    if (projectedShortfall > 0) findings.push(`At the current pace roughly ${projectedShortfall} SP will not be finished.`)
    if (blocked.length) findings.push(`${blocked.length} blocked item${blocked.length === 1 ? '' : 's'} holding ${blockedPoints} SP.`)
    if (comp.addedDuringSprint > 0) findings.push(`${comp.addedDuringSprint} SP were added after the sprint started (scope creep).`)
    if (overdue.length) findings.push(`${overdue.length} item${overdue.length === 1 ? ' is' : 's are'} past their due date.`)
    if (overloaded.length) findings.push(`${overloaded.map((o) => `${o.member.name} (${o.assigned}/${o.capacity} SP)`).join(', ')} ${overloaded.length === 1 ? 'is' : 'are'} over capacity.`)
    if (idle.length && remaining > 0) findings.push(`${idle.map((i) => i.member.name).join(', ')} ${idle.length === 1 ? 'has' : 'have'} nothing assigned in this sprint.`)

    // Recommendations
    if (blocked.length) {
      const top = [...blocked].sort((a, b) => pts(b) - pts(a))[0]
      recommendations.push(`Unblock "${top.title}" first — it is the largest blocked item (${pts(top)} SP)${top.blockedReason ? `: ${top.blockedReason}` : ''}.`)
    }
    if (projectedShortfall > 0) {
      let toMove = projectedShortfall
      for (const i of notStarted.filter((i) => pts(i) > 0).sort((a, b) => pts(b) - pts(a))) {
        if (toMove <= 0) break
        moveCandidates.push(i)
        toMove -= pts(i)
      }
      if (moveCandidates.length) {
        recommendations.push(`Move ${moveCandidates.map((i) => `"${i.title}" (${pts(i)} SP)`).join(', ')} to the next sprint to protect the sprint goal.`)
      } else {
        recommendations.push('All remaining work has already started — negotiate scope with the Product Owner or add capacity.')
      }
    }
    if (overloaded.length) {
      const lightest = [...wl].filter((r) => !overloaded.includes(r)).sort((a, b) => (a.utilization ?? 0) - (b.utilization ?? 0))[0]
      recommendations.push(`Rebalance work from ${overloaded.map((o) => o.member.name).join(' and ')}${lightest ? ` to ${lightest.member.name} (${Math.round((lightest.utilization ?? 0) * 100)}% loaded)` : ''}.`)
    }
    if (overdue.length) recommendations.push(`Re-plan due dates for ${overdue.map((i) => `"${i.title}"`).join(', ')} or raise them in the stand-up.`)
    if (!recommendations.length) recommendations.push('Sprint is on track — keep the daily stand-up focused on the in-progress items.')
  } else if (sprint.status === 'completed') {
    findings.push(`Delivered ${comp.completed} of ${comp.committed} committed SP (${pct(comp.completed, comp.committed || 1)}%).`)
    if (comp.carriedOver) findings.push(`${comp.carriedOver} SP carried over to the next sprint.`)
    if (comp.addedDuringSprint) findings.push(`${comp.addedDuringSprint} SP were added mid-sprint.`)
  } else {
    findings.push(`Planned: ${totalScope} SP against a capacity of ${sprint.capacity} SP.`)
    if (sprint.capacity && totalScope > sprint.capacity) recommendations.push(`Committed ${totalScope} SP exceeds capacity ${sprint.capacity} SP — trim ${totalScope - sprint.capacity} SP before starting.`)
    if (avgVel && totalScope > avgVel * 1.15) recommendations.push(`Average velocity is ${avgVel} SP; this plan is ${pct(totalScope - avgVel, avgVel)}% above it.`)
  }

  return {
    risk,
    score,
    committed: comp.committed,
    completed,
    remaining,
    totalDays,
    daysElapsed,
    daysLeft,
    progressPct,
    timePct,
    requiredPerDay,
    expectedPerDay,
    projectedCompleted,
    projectedShortfall,
    blocked,
    blockedPoints,
    atRisk,
    overdue,
    notStarted,
    overloaded,
    idle,
    findings,
    recommendations,
    moveCandidates,
  }
}

/* ---------- sprint summary (report text) ---------- */

export function sprintSummary(sprint: Sprint, items: WorkItem[], members: Member[], history: VelocityPoint[], today: string = dayKey()): string {
  const h = sprintHealth(sprint, items, members, history, today)
  const its = sprintItems(sprint, items)
  const name = (id?: string) => members.find((m) => m.id === id)?.name ?? 'Unassigned'
  const done = its.filter(isDone)
  const open = its.filter((i) => !isDone(i))
  const lines: string[] = []
  lines.push(`${sprint.name.toUpperCase()} SUMMARY`)
  lines.push('')
  lines.push(`Goal: ${sprint.goal || '—'}`)
  lines.push(`Dates: ${sprint.startDate} → ${sprint.endDate}`)
  lines.push(`Achievement: ${h.progressPct}% (${h.completed} / ${h.completed + h.remaining} SP)`)
  lines.push(`Items: ${done.length} done, ${open.length} open`)
  lines.push('')
  lines.push('Completed:')
  if (done.length) done.forEach((i) => lines.push(`  • ${i.title} (${pts(i)} SP, ${name(i.assigneeId)})`))
  else lines.push('  • nothing yet')
  lines.push('')
  lines.push('Not completed:')
  if (open.length) open.forEach((i) => lines.push(`  • ${i.title} (${pts(i)} SP, ${name(i.assigneeId)}${i.blocked || i.status === 'blocked' ? ', BLOCKED' : ''})`))
  else lines.push('  • none')
  if (h.blocked.length) {
    lines.push('')
    lines.push('Blockers:')
    h.blocked.forEach((i) => lines.push(`  • ${i.title}${i.blockedReason ? ` — ${i.blockedReason}` : ''}`))
  }
  lines.push('')
  lines.push('Findings:')
  h.findings.forEach((f) => lines.push(`  • ${f}`))
  lines.push('')
  lines.push('Recommended next actions:')
  h.recommendations.forEach((r) => lines.push(`  • ${r}`))
  return lines.join('\n')
}

/* ---------- assistant: question router ---------- */

export interface AssistantContext {
  sprint?: Sprint
  items: WorkItem[]
  members: Member[]
  history: VelocityPoint[]
  today?: string
}

export interface AssistantAnswer {
  title: string
  body: string[]
  risk?: Risk
}

export function answerQuestion(question: string, ctx: AssistantContext): AssistantAnswer {
  const q = question.toLowerCase()
  const today = ctx.today ?? dayKey()
  const { sprint, items, members, history } = ctx
  const name = (id?: string) => members.find((m) => m.id === id)?.name ?? 'Unassigned'

  if (!sprint) {
    return { title: 'No sprint selected', body: ['Create or start a sprint first — the assistant reasons over the current sprint\'s data.'] }
  }
  const h = sprintHealth(sprint, items, members, history, today)

  if (/velocity|trend|slow|faster|decreas|increas/.test(q)) {
    if (!history.length) return { title: 'Velocity', body: ['No completed sprints yet, so there is no velocity history. Complete a sprint to start the trend.'] }
    const last = history[history.length - 1]
    const prev = history[history.length - 2]
    const body = history.map((p) => `${p.name}: ${p.completed} / ${p.committed} SP (${pct(p.completed, p.committed || 1)}%)`)
    if (prev) {
      const delta = last.completed - prev.completed
      body.push('')
      body.push(delta < 0 ? `Velocity dropped by ${-delta} SP in ${last.name}. Common causes: carry-over, mid-sprint scope changes, blocked items or reduced capacity.` : delta > 0 ? `Velocity rose by ${delta} SP in ${last.name}.` : 'Velocity is flat.')
    }
    body.push(`Rolling average (last 3): ${averageVelocity(history)} SP.`)
    return { title: 'Velocity trend', body }
  }
  if (/block/.test(q)) {
    if (!h.blocked.length) return { title: 'Blockers', body: ['No items are blocked in this sprint.'], risk: 'low' }
    return {
      title: `${h.blocked.length} blocker${h.blocked.length === 1 ? '' : 's'} (${h.blockedPoints} SP)`,
      body: h.blocked.map((i) => `• ${i.title} — ${pts(i)} SP, ${name(i.assigneeId)}${i.blockedReason ? `: ${i.blockedReason}` : ''}`).concat(['', h.recommendations[0] ?? '']),
      risk: h.blockedPoints > h.remaining * 0.3 ? 'high' : 'medium',
    }
  }
  if (/overload|workload|who is|busy|capacity|balanced/.test(q)) {
    const wl = workload(sprint, items, members)
    const body = wl.map((r) => `• ${r.member.name}: ${r.assigned} SP assigned (${r.done} done) vs capacity ${r.capacity}${r.utilization !== null ? ` → ${Math.round(r.utilization * 100)}%` : ''}`)
    if (h.overloaded.length) body.push('', `Overloaded: ${h.overloaded.map((o) => o.member.name).join(', ')}.`)
    if (h.idle.length) body.push(`Unassigned capacity: ${h.idle.map((o) => o.member.name).join(', ')}.`)
    return { title: 'Team workload', body, risk: h.overloaded.length ? 'medium' : 'low' }
  }
  if (/at risk|risky|which stor|which item|late|overdue/.test(q)) {
    if (!h.atRisk.length) return { title: 'At-risk items', body: ['No items look at risk right now.'], risk: 'low' }
    return {
      title: `${h.atRisk.length} at-risk item${h.atRisk.length === 1 ? '' : 's'}`,
      body: h.atRisk.map((i) => {
        const why: string[] = []
        if (i.blocked || i.status === 'blocked') why.push('blocked')
        if (i.dueDate && i.dueDate < today) why.push('overdue')
        if (!isStarted(i)) why.push('not started')
        if (h.overloaded.some((o) => o.member.id === i.assigneeId)) why.push('assignee overloaded')
        return `• ${i.title} — ${pts(i)} SP, ${name(i.assigneeId)} (${why.join(', ')})`
      }),
      risk: h.risk,
    }
  }
  if (/move|next sprint|descope|drop|cut/.test(q)) {
    if (!h.moveCandidates.length) return { title: 'Nothing to move', body: ['Projection says the sprint can be completed at the current pace, or all remaining items are already in progress.'], risk: h.risk }
    return {
      title: `Move ${sumPoints(h.moveCandidates)} SP out`,
      body: h.moveCandidates.map((i) => `• ${i.title} — ${pts(i)} SP, ${name(i.assigneeId)}, ${i.status}`).concat(['', `Projected shortfall is ${h.projectedShortfall} SP; these not-started items cover it.`]),
      risk: h.risk,
    }
  }
  if (/summar|report|recap/.test(q)) {
    return { title: `${sprint.name} summary`, body: sprintSummary(sprint, items, members, history, today).split('\n'), risk: h.risk }
  }
  // default: will we finish?
  return {
    title: `${sprint.name} risk: ${h.risk.toUpperCase()} (health ${h.score}/100)`,
    body: [...h.findings, '', 'Recommendation:', ...h.recommendations.map((r) => `• ${r}`)],
    risk: h.risk,
  }
}
