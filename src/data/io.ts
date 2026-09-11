import type { ItemType, Member, Priority, Project, Sprint, Status, WorkItem, StandupEntry, RetroAction } from '../domain/types'
import { itemKey, STATUS_LABEL, PRIORITY_LABEL, ITEM_TYPE_LABEL } from '../domain/types'
import type { NewItemInput, Snapshot } from './store'
import { dayKey } from '../domain/dates'

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function downloadText(name: string, text: string, type = 'text/plain') {
  downloadBlob(name, new Blob([text], { type }))
}

export function exportSnapshotFile(snap: Snapshot) {
  downloadText(`scrumflow-backup-${dayKey()}.json`, JSON.stringify(snap, null, 2), 'application/json')
}

export async function readSnapshotFile(file: File): Promise<Snapshot> {
  const text = await file.text()
  return JSON.parse(text) as Snapshot
}

/* ---------- Excel export ---------- */

/** SheetJS is ~400 kB, so it is loaded on demand. */
async function loadXLSX() {
  return await import('xlsx')
}

export async function exportProjectExcel(project: Project, items: WorkItem[], sprints: Sprint[], members: Member[], standups: StandupEntry[], retroActions: RetroAction[]) {
  const name = (id?: string) => members.find((m) => m.id === id)?.name ?? ''
  const sprintName = (id?: string) => sprints.find((s) => s.id === id)?.name ?? ''
  const byId = new Map(items.map((i) => [i.id, i]))
  const XLSX = await loadXLSX()
  const wb = XLSX.utils.book_new()

  const backlog = [...items]
    .sort((a, b) => a.rank - b.rank)
    .map((i) => ({
      Key: itemKey(project, i),
      Type: ITEM_TYPE_LABEL[i.type],
      Title: i.title,
      Status: STATUS_LABEL[i.status],
      Priority: PRIORITY_LABEL[i.priority],
      'Story Points': i.points ?? '',
      Assignee: name(i.assigneeId),
      Sprint: sprintName(i.sprintId),
      Parent: i.parentId ? itemKey(project, byId.get(i.parentId) ?? { number: 0 }) : '',
      Labels: i.labels.join(', '),
      'Due Date': i.dueDate ?? '',
      Blocked: i.blocked ? 'Yes' : '',
      'Blocked Reason': i.blockedReason ?? '',
      Description: i.description,
      Created: dayKey(i.createdAt),
      Started: i.startedAt ? dayKey(i.startedAt) : '',
      Completed: i.completedAt ? dayKey(i.completedAt) : '',
    }))
  const ws1 = XLSX.utils.json_to_sheet(backlog)
  ws1['!cols'] = [10, 8, 50, 12, 10, 8, 16, 12, 10, 18, 12, 8, 30, 60, 12, 12, 12].map((w) => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, ws1, 'Backlog')

  const sp = sprints.map((s) => ({ Sprint: s.name, Goal: s.goal, Start: s.startDate, End: s.endDate, Status: s.status, Capacity: s.capacity, Committed: s.committedPoints ?? '', Completed: s.completedPoints ?? '' }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sp), 'Sprints')

  const team = members.filter((m) => project.memberIds.includes(m.id)).map((m) => ({ Name: m.name, Email: m.email ?? '', Role: m.role, Capacity: m.capacity, Active: m.active ? 'Yes' : 'No' }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(team), 'Team')

  const su = [...standups].sort((a, b) => b.date.localeCompare(a.date)).map((e) => ({ Date: e.date, Member: name(e.memberId), Sprint: sprintName(e.sprintId), Yesterday: e.yesterday, Today: e.today, Blockers: e.blockers }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(su), 'Stand-ups')

  const ra = retroActions.map((r) => ({ Sprint: sprintName(r.sprintId), Action: r.description, Owner: name(r.ownerId), Due: r.dueDate ?? '', Status: r.status }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ra), 'Retro Actions')

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  downloadBlob(`${project.key}-scrumflow-${dayKey()}.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
}

/* ---------- Excel import ---------- */

export interface ImportPreview {
  sheet: string
  rows: NewItemInput[]
  newMembers: string[]
  skipped: number
}

const STATUS_MAP: Record<string, Status> = {
  backlog: 'backlog',
  open: 'todo',
  todo: 'todo',
  'to do': 'todo',
  new: 'todo',
  'in progress': 'inprogress',
  inprogress: 'inprogress',
  wip: 'inprogress',
  active: 'inprogress',
  review: 'review',
  'code review': 'review',
  'in review': 'review',
  testing: 'testing',
  qa: 'testing',
  test: 'testing',
  blocked: 'blocked',
  'on hold': 'blocked',
  hold: 'blocked',
  done: 'done',
  completed: 'done',
  complete: 'done',
  closed: 'done',
  resolved: 'done',
  recurring: 'todo',
}
const PRIORITY_MAP: Record<string, Priority> = { critical: 'critical', highest: 'critical', p0: 'critical', p1: 'critical', high: 'high', p2: 'high', medium: 'medium', normal: 'medium', p3: 'medium', low: 'low', lowest: 'low', p4: 'low' }
const TYPE_MAP: Record<string, ItemType> = { epic: 'epic', story: 'story', 'user story': 'story', feature: 'story', task: 'task', subtask: 'task', 'sub-task': 'task', bug: 'bug', defect: 'bug', issue: 'bug' }

function findCol(headers: string[], ...cands: string[]): number {
  const h = headers.map((x) => x.toLowerCase().trim())
  for (const c of cands) {
    const i = h.findIndex((x) => x === c)
    if (i >= 0) return i
  }
  for (const c of cands) {
    const i = h.findIndex((x) => x.includes(c))
    if (i >= 0) return i
  }
  return -1
}

function toDate(v: unknown, XLSX: typeof import('xlsx')): string | undefined {
  if (v === undefined || v === null || v === '') return undefined
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
    return undefined
  }
  if (v instanceof Date) return dayKey(v)
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return undefined
}

/**
 * Reads work items from any sheet whose header row has a title-like column.
 * Understands ScrumFlow's own export, Jira CSV-style headers, and simple action trackers
 * (Sl. No | Activity | Owner | Status | Priority | Latest Update | ETA).
 */
export async function previewExcelImport(file: File, project: Project, members: Member[]): Promise<ImportPreview[]> {
  const buf = await file.arrayBuffer()
  const XLSX = await loadXLSX()
  const wb = XLSX.read(buf, { type: 'array', cellDates: false })
  const previews: ImportPreview[] = []
  const memberByName = new Map(members.map((m) => [m.name.toLowerCase(), m]))

  for (const sheetName of wb.SheetNames) {
    if (/^summary$/i.test(sheetName)) continue
    const ws = wb.Sheets[sheetName]
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
    let headerIdx = -1
    for (let r = 0; r < Math.min(6, aoa.length); r++) {
      const row = (aoa[r] ?? []).map((c) => String(c ?? ''))
      if (findCol(row, 'title', 'summary', 'activity', 'subject', 'story', 'task') >= 0) {
        headerIdx = r
        break
      }
    }
    if (headerIdx < 0) continue
    const headers = (aoa[headerIdx] ?? []).map((c) => String(c ?? ''))
    const cTitle = findCol(headers, 'title', 'summary', 'activity', 'subject', 'story', 'task')
    const cType = findCol(headers, 'type', 'issue type', 'work item type')
    const cStatus = findCol(headers, 'status')
    const cPriority = findCol(headers, 'priority')
    const cPoints = findCol(headers, 'story points', 'points', 'estimate', 'sp')
    const cAssignee = findCol(headers, 'assignee', 'owner', 'assigned to')
    const cDue = findCol(headers, 'due date', 'due', 'eta', 'end date', 'target')
    const cDesc = findCol(headers, 'description', 'latest update', 'update', 'blocker', 'remarks', 'notes')
    const cLabels = findCol(headers, 'labels', 'tags', 'environment', 'env')
    const rows: NewItemInput[] = []
    const newMembers = new Set<string>()
    let skipped = 0
    for (let r = headerIdx + 1; r < aoa.length; r++) {
      const row = aoa[r] ?? []
      const title = String(row[cTitle] ?? '').trim()
      if (!title) {
        skipped++
        continue
      }
      const typeRaw = cType >= 0 ? String(row[cType] ?? '').toLowerCase().trim() : ''
      const statusRaw = cStatus >= 0 ? String(row[cStatus] ?? '').toLowerCase().trim() : ''
      const prioRaw = cPriority >= 0 ? String(row[cPriority] ?? '').toLowerCase().trim() : ''
      const pointsRaw = cPoints >= 0 ? Number(row[cPoints]) : NaN
      const assigneeRaw = cAssignee >= 0 ? String(row[cAssignee] ?? '').trim() : ''
      const firstAssignee = assigneeRaw.split(/[,/&]/)[0].trim()
      let assigneeId: string | undefined
      if (firstAssignee) {
        const m = memberByName.get(firstAssignee.toLowerCase())
        if (m) assigneeId = m.id
        else newMembers.add(firstAssignee)
      }
      const labels = cLabels >= 0 ? String(row[cLabels] ?? '').split(/[,;]/).map((x) => x.trim()).filter(Boolean) : []
      rows.push({
        projectId: project.id,
        type: TYPE_MAP[typeRaw] ?? 'story',
        title,
        description: cDesc >= 0 ? String(row[cDesc] ?? '') : '',
        status: STATUS_MAP[statusRaw] ?? 'backlog',
        priority: PRIORITY_MAP[prioRaw] ?? 'medium',
        assigneeId: assigneeId ?? (firstAssignee ? `__new__:${firstAssignee}` : undefined),
        points: Number.isFinite(pointsRaw) && pointsRaw > 0 ? pointsRaw : undefined,
        dueDate: cDue >= 0 ? toDate(row[cDue], XLSX) : undefined,
        labels: wb.SheetNames.length > 1 ? [sheetName, ...labels] : labels,
      })
    }
    if (rows.length) previews.push({ sheet: sheetName, rows, newMembers: [...newMembers], skipped })
  }
  return previews
}
