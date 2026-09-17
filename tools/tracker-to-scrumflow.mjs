#!/usr/bin/env node
/**
 * Convert an "Open Action Tracker" workbook into a ScrumFlow backup (.json) that can be
 * restored from Settings → Restore backup.
 *
 * Understands the layout produced by Scrum Command Center:
 *   project sheets : title banner row, then header
 *                    Sl. No | Activity / Issue | Environment | Owner | Status | Priority | Blocker / Pending / Latest Update | ETA | Update
 *   Project_Plan   : Project | Phase | Start Date | End Date | Progress % | Status | Owner | Milestone | Notes
 *   *Tickets*      : Sno | Start Date | End Date | <ref> | Subject | Status | Remarks
 *   Summary        : skipped
 *
 * Dated lines inside the update column ("05-08-2026: text", "05 Aug 2026: text", "12-08- text")
 * become Comments with that date, so the history survives the migration.
 *
 * Usage:
 *   node tools/tracker-to-scrumflow.mjs <tracker.xlsx> [--curation curation.json] [--out backup.json]
 *                                       [--key PRJ] [--name "Project name"] [--today 2026-09-17]
 *
 * The optional curation file lets you rename items, fix owners/status/ETA, assign epics,
 * nest items, drop duplicates and define sprints. See curation.json next to a migration for the shape.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

/* ---------- args ---------- */
const args = process.argv.slice(2)
const positional = args.filter((a) => !a.startsWith('--'))
const opt = (name, def) => {
  const i = args.indexOf('--' + name)
  return i >= 0 ? args[i + 1] : def
}
const input = positional[0]
if (!input) {
  console.error('usage: node tools/tracker-to-scrumflow.mjs <tracker.xlsx> [--curation file] [--out file] [--key PRJ] [--name "Project"] [--today yyyy-mm-dd]')
  process.exit(1)
}
const curation = opt('curation') ? JSON.parse(fs.readFileSync(opt('curation'), 'utf8')) : {}
const today = opt('today', new Date().toISOString().slice(0, 10))
const outFile = opt('out', path.join(path.dirname(input), 'scrumflow-backup.json'))
const projectKey = (opt('key', curation.project?.key ?? 'TRK')).toUpperCase()
const projectName = opt('name', curation.project?.name ?? path.basename(input, path.extname(input)))

/* ---------- helpers ---------- */
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 }
const pad = (n) => String(n).padStart(2, '0')
const iso = (y, m, d, h = 10) => `${y}-${pad(m)}-${pad(d)}T${pad(h)}:00:00.000Z`
let idSeq = 1
const uid = (prefix) => `${prefix}-${String(idSeq++).padStart(4, '0')}`
const t = (v) => String(v ?? '').replace(/ /g, ' ').trim()
const warnings = []
const changes = []
const warn = (s) => warnings.push(s)
const change = (where, field, from, to, why) => changes.push({ where, field, from, to, why })

/** Parse a date in any of the tracker's formats → 'yyyy-mm-dd' or undefined. */
function parseDate(raw, assumeYear = 2026) {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw)
    return d ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : undefined
  }
  let s = t(raw).replace(/[Oo](?=\d)/g, '0').replace(/\(.*?\)/g, '').trim()
  if (!s || /^tbd$/i.test(s)) return undefined
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[-/. ]\s?([A-Za-z]{3,9}|\d{1,2})[-/. ]?\s?(\d{2,4})?\b/)
  if (!m) return undefined
  const d = Number(m[1])
  const mon = /^\d+$/.test(m[2]) ? Number(m[2]) : MONTHS[m[2].slice(0, 4).toLowerCase()] ?? MONTHS[m[2].slice(0, 3).toLowerCase()]
  let y = m[3] ? Number(m[3]) : assumeYear
  if (y < 100) y += 2000
  // "18-082026" style: day-month glued to year
  if (!mon && /^(\d{1,2})-(\d{2})(\d{4})$/.test(s)) {
    const g = s.match(/^(\d{1,2})-(\d{2})(\d{4})$/)
    return `${g[3]}-${g[2]}-${pad(g[1])}`
  }
  if (!mon || mon < 1 || mon > 12 || d < 1 || d > 31) return undefined
  return `${y}-${pad(mon)}-${pad(d)}`
}

const STATUS_MAP = { open: 'todo', 'in progress': 'inprogress', 'in-progress': 'inprogress', inprogress: 'inprogress', 'on hold': 'blocked', hold: 'blocked', completed: 'done', complete: 'done', closed: 'done', done: 'done', recurring: 'todo' }
const PRIORITY_MAP = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' }
const ENV_TOKENS = { dev: 'env:dev', development: 'env:dev', qa: 'env:qa', sit: 'env:qa', uat: 'env:qa', prod: 'env:prod', prd: 'env:prod', production: 'env:prod', dr: 'env:dr', all: 'env:all', na: '', 'n/a': '' }
function envLabels(raw) {
  const out = new Set()
  for (const tok of t(raw).toLowerCase().split(/[\s,/&]+|and/)) {
    if (!tok) continue
    const v = ENV_TOKENS[tok]
    if (v === undefined) warn(`unknown environment token "${tok}" in "${raw}"`)
    else if (v) out.add(v)
  }
  return [...out]
}

/** Canonical owner name via the curation map, else Title Case of the raw text. */
function canonOwner(raw) {
  const s = t(raw)
  if (!s) return ''
  const key = s.toLowerCase()
  if (curation.owners && key in curation.owners) return curation.owners[key]
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}
/** "Rohini, Abhiram" / "Sravanthi and Pareekshith K V" → [canon...] */
function splitOwners(raw) {
  const whole = t(raw).toLowerCase()
  if (curation.owners && whole in curation.owners) return [curation.owners[whole]].filter(Boolean)
  return t(raw)
    .split(/,|\/|&|\band\b/)
    .map(canonOwner)
    .filter(Boolean)
}

/** Split an update cell into { preamble, entries:[{date, text}] } using dated markers. */
function parseUpdates(raw) {
  const text = t(raw).replace(/\r/g, '')
  if (!text) return { preamble: '', entries: [] }
  const entries = []
  let preamble = []
  // marker: start of line or whitespace, then a date, then optional ':' / '-' / '::'
  const marker = /(^|\s)(\d{1,2}[-/. ]\s?(?:[A-Za-z]{3,9}|[0O]\d|\d{1,2})(?:[-/. ]?\s?\d{2,4})?)\s*(?:::|:|-|–)?\s*/g
  for (const line of text.split('\n')) {
    let last = 0
    let found = false
    let m
    marker.lastIndex = 0
    const parts = []
    while ((m = marker.exec(line))) {
      const date = parseDate(m[2])
      if (!date) continue
      parts.push({ start: m.index + m[1].length, end: marker.lastIndex, date })
    }
    if (parts.length) {
      found = true
      const head = line.slice(0, parts[0].start).trim()
      if (head) {
        if (entries.length) entries[entries.length - 1].text += ' ' + head
        else preamble.push(head)
      }
      parts.forEach((p, i) => {
        const body = line.slice(p.end, i + 1 < parts.length ? parts[i + 1].start : undefined).trim()
        entries.push({ date: p.date, text: body })
        last = 1
      })
    }
    if (!found) {
      const l = line.trim()
      if (!l) continue
      if (entries.length) entries[entries.length - 1].text += (entries[entries.length - 1].text ? '\n' : '') + l
      else preamble.push(l)
    }
    void last
  }
  return { preamble: preamble.join('\n'), entries: entries.filter((e) => e.text) }
}

/* ---------- read workbook ---------- */
const wb = XLSX.readFile(input, { cellDates: false })
const sheets = {}
for (const name of wb.SheetNames) sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' })

const findCol = (hdr, ...cands) => {
  const h = hdr.map((x) => t(x).toLowerCase())
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

/* ---------- members ---------- */
const COLORS = ['#2563eb', '#8b5cf6', '#16a34a', '#ea8a0c', '#dc2626', '#0891b2', '#c026d3', '#65a30d', '#e11d48', '#7c3aed', '#0d9488', '#d97706', '#4f46e5', '#059669', '#b45309', '#9333ea']
const members = new Map()
function member(name) {
  if (!name) return undefined
  if (!members.has(name)) {
    const cfg = curation.members?.[name] ?? {}
    members.set(name, {
      id: uid('m'),
      name,
      role: cfg.role ?? 'dev',
      capacity: cfg.capacity ?? 8,
      color: COLORS[members.size % COLORS.length],
      active: true,
      createdAt: iso(2026, 8, 1, 9),
    })
  }
  return members.get(name)
}
// stable order for curated members
for (const name of Object.keys(curation.members ?? {})) member(name)

/* ---------- project + epics ---------- */
const projectId = uid('p')
const epics = new Map() // key → item
let number = 1
let rank = 0
const items = []
const comments = []
const itemByKey = new Map() // "sheet#sl" → item
const NOW = iso(...today.split('-').map(Number), 9)

function epicFor(key) {
  if (!key) return undefined
  if (epics.has(key)) return epics.get(key)
  const cfg = curation.epics?.[key] ?? { title: key }
  const e = {
    id: uid('i'),
    projectId,
    number: number++,
    type: 'epic',
    title: cfg.title,
    description: cfg.description ?? '',
    status: 'inprogress',
    priority: 'high',
    labels: cfg.labels ?? [],
    rank: rank++,
    blocked: false,
    dependsOn: [],
    createdAt: iso(2026, 8, 1, 9),
    updatedAt: NOW,
    startedAt: iso(2026, 8, 1, 9),
  }
  epics.set(key, e)
  items.push(e)
  return e
}
// create curated epics in declared order
for (const k of Object.keys(curation.epics ?? {})) epicFor(k)

/* ---------- project sheets ---------- */
const seenRows = new Set()
for (const [sheet, aoa] of Object.entries(sheets)) {
  if (/^summary$/i.test(sheet)) continue
  let hdrIdx = -1
  for (let r = 0; r < Math.min(5, aoa.length); r++) {
    if (findCol(aoa[r].map(t), 'activity', 'subject') >= 0 && findCol(aoa[r].map(t), 'status') >= 0) {
      hdrIdx = r
      break
    }
  }
  if (hdrIdx < 0) continue
  const hdr = aoa[hdrIdx].map(t)
  const isTickets = hdr.some((h) => /oneit|ticket|reference/i.test(h)) && findCol(hdr, 'activity') < 0
  const c = {
    sl: findCol(hdr, 'sl. no', 'sl', 'sno', 's.no', 'no'),
    title: findCol(hdr, 'activity', 'subject'),
    env: findCol(hdr, 'environment', 'env'),
    owner: findCol(hdr, 'owner'),
    status: findCol(hdr, 'status'),
    priority: findCol(hdr, 'priority'),
    update: (() => { const i = findCol(hdr, 'latest update', 'blocker'); return i >= 0 ? i : findCol(hdr, 'update') })(),
    eta: findCol(hdr, 'eta', 'due'),
    update2: -1,
    start: findCol(hdr, 'start date', 'start'),
    end: findCol(hdr, 'end date', 'end'),
    ref: findCol(hdr, 'oneit reference', 'reference', 'ticket'),
    remarks: findCol(hdr, 'remarks'),
  }
  c.update2 = hdr.findIndex((h, i) => /^update$/i.test(h) && i !== c.update)
  const epicKey = isTickets ? curation.ticketsEpic : curation.sheetEpic?.[sheet] ?? sheet
  const epic = epicFor(epicKey)

  for (let r = hdrIdx + 1; r < aoa.length; r++) {
    const row = aoa[r]
    const rawTitle = t(row[c.title])
    const sl = t(row[c.sl])
    const key = `${sheet}#${sl}`
    const cur = curation.items?.[key] ?? {}
    if (!rawTitle) {
      if (sl) {
        change(key, 'row', '(empty)', '(dropped)', 'empty row')
      }
      continue
    }
    const dupKey = `${sheet}|${sl}|${rawTitle}`
    if (seenRows.has(dupKey)) {
      change(key, 'row', rawTitle, '(dropped)', 'exact duplicate row')
      continue
    }
    seenRows.add(dupKey)
    if (cur.drop) {
      change(key, 'row', rawTitle, '(dropped)', cur.drop)
      continue
    }

    const statusRaw = t(cur.status ?? row[c.status])
    const status = STATUS_MAP[statusRaw.toLowerCase()] ?? (isTickets ? 'todo' : 'backlog')
    if (cur.status && cur.status !== t(row[c.status])) change(key, 'status', t(row[c.status]), cur.status, 'update text says so')
    const recurring = /recurring/i.test(statusRaw)
    const priority = PRIORITY_MAP[t(row[c.priority]).toLowerCase()] ?? (isTickets ? 'medium' : 'medium')
    const ownersRaw = t(cur.owner !== undefined ? cur.owner : row[c.owner])
    const owners = splitOwners(ownersRaw)
    if (c.owner >= 0 && t(row[c.owner]) && owners.join(', ') !== t(row[c.owner])) change(key, 'owner', t(row[c.owner]), owners.join(', ') || '(unassigned)', 'canonical name')
    const assignee = member(owners[0])
    const coOwners = owners.slice(1).map((o) => `co-owner:${o}`)
    const etaRaw = cur.eta !== undefined ? cur.eta : row[c.eta]
    const due = parseDate(etaRaw)
    if (c.eta >= 0 && t(row[c.eta]) && (due ?? '') !== t(row[c.eta]) && !/^tbd$/i.test(t(row[c.eta]))) change(key, 'eta', t(row[c.eta]), due ?? '(cleared)', cur.eta !== undefined ? 'curated' : 'normalised to ISO date')
    const upd = parseUpdates(row[c.update] ?? '')
    const extra = c.update2 >= 0 ? t(row[c.update2]) : ''
    const remarks = c.remarks >= 0 ? t(row[c.remarks]) : ''
    const labels = new Set([...(epic?.labels ?? []), ...envLabels(cur.env ?? row[c.env]), ...coOwners, ...(cur.labels ?? [])])
    if (recurring) labels.add('recurring')
    if (isTickets) labels.add('oneit')

    const dates = upd.entries.map((e) => e.date).sort()
    const startDate = isTickets ? parseDate(row[c.start]) : undefined
    const endDate = isTickets ? parseDate(row[c.end]) : undefined
    const first = dates[0] ?? startDate ?? '2026-08-01'
    const last = dates[dates.length - 1] ?? endDate ?? first
    const [fy, fm, fd] = first.split('-').map(Number)
    const [ly, lm, ld] = last.split('-').map(Number)
    const createdAt = iso(fy, fm, fd, 9)
    const updatedAt = iso(ly, lm, ld, 18)

    const ref = isTickets && c.ref >= 0 ? t(row[c.ref]) : ''
    const title = cur.title ?? (isTickets && ref ? `OneIT #${ref} · ${rawTitle}` : rawTitle.replace(/\s+/g, ' '))
    if (cur.title && cur.title !== rawTitle) change(key, 'title', rawTitle, cur.title, 'reframed')
    const descParts = []
    if (upd.preamble) descParts.push(upd.preamble)
    if (extra) descParts.push(extra)
    if (remarks) descParts.push('Remarks: ' + remarks)
    if (isTickets && curation.ticketNotes?.[ref]) descParts.push('Migration note: ' + curation.ticketNotes[ref])
    descParts.push(`Migrated from tracker sheet "${sheet}" row ${sl} on ${today}.`)

    const item = {
      id: uid('i'),
      projectId,
      number: number++,
      type: cur.type ?? (isTickets ? 'task' : 'story'),
      title,
      description: descParts.join('\n\n'),
      status,
      priority,
      assigneeId: assignee?.id,
      reporterId: undefined,
      labels: [...labels],
      dueDate: due,
      rank: rank++,
      blocked: status === 'blocked',
      blockedReason: status === 'blocked' ? cur.blockedReason ?? upd.preamble.split('\n')[0] ?? undefined : undefined,
      dependsOn: [],
      createdAt,
      updatedAt,
      startedAt: status === 'done' || status === 'inprogress' || status === 'blocked' ? createdAt : undefined,
      completedAt: status === 'done' ? updatedAt : undefined,
      parentId: (cur.epic ? epicFor(cur.epic) : epic)?.id,
      _key: key,
      _parentKey: cur.parent,
      _dependsKeys: cur.dependsOn ?? [],
    }
    if (cur.epic && cur.epic !== epicKey) change(key, 'epic', curation.epics?.[epicKey]?.title ?? epicKey, curation.epics?.[cur.epic]?.title ?? cur.epic, 'regrouped')
    items.push(item)
    itemByKey.set(key, item)
    for (const e of upd.entries) {
      const [y, m, d] = e.date.split('-').map(Number)
      comments.push({ id: uid('c'), itemId: item.id, authorId: assignee?.id, body: e.text, createdAt: iso(y, m, d, 12) })
    }
  }
}

/* second pass: parents, dependencies, keys → ids */
for (const it of items) {
  if (it._parentKey) {
    const p = itemByKey.get(it._parentKey)
    if (p) {
      it.parentId = p.id
      if (it.type === 'story') it.type = 'task'
      change(it._key, 'parent', '(epic)', it._parentKey, 'nested under related item')
    } else warn(`parent ${it._parentKey} not found for ${it._key}`)
  }
  it.dependsOn = (it._dependsKeys ?? []).map((k) => itemByKey.get(k)?.id).filter(Boolean)
  delete it._key
  delete it._parentKey
  delete it._dependsKeys
}

/* ---------- Project_Plan → epic due dates (Go-Live) ---------- */
const plan = sheets['Project_Plan']
if (plan) {
  const hdr = plan[0].map(t)
  const cp = { project: findCol(hdr, 'project'), phase: findCol(hdr, 'phase'), end: findCol(hdr, 'end date'), milestone: findCol(hdr, 'milestone') }
  for (const row of plan.slice(1)) {
    if (!t(row[cp.project])) continue
    if (/go-live|golive/i.test(t(row[cp.phase])) || /^yes$/i.test(t(row[cp.milestone]))) {
      const key = curation.planEpic?.[t(row[cp.project])] ?? curation.sheetEpic?.[t(row[cp.project])] ?? t(row[cp.project])
      const e = epics.get(key)
      const d = parseDate(row[cp.end])
      if (e && d) {
        e.dueDate = d
        e.description += `\n\nGo-live milestone (Project_Plan): ${d}.`
      }
    }
  }
}

/* ---------- sprints ---------- */
const sprints = []
const active = curation.sprint
const history = curation.historySprint
if (history) {
  const s = { id: uid('s'), projectId, name: history.name, goal: history.goal ?? '', startDate: history.start, endDate: history.end, status: 'completed', capacity: 0, committedPoints: 0, completedPoints: 0, createdAt: iso(2026, 8, 1, 9), updatedAt: NOW }
  sprints.push(s)
  for (const it of items) {
    if (it.type === 'epic' || it.status !== 'done') continue
    it.sprintId = s.id
    it.sprintAddedAt = it.createdAt
  }
}
if (active) {
  const s = { id: uid('s'), projectId, name: active.name, goal: active.goal ?? '', startDate: active.start, endDate: active.end, status: 'active', capacity: active.capacity ?? 0, committedPoints: 0, createdAt: NOW, updatedAt: NOW }
  sprints.push(s)
  for (const it of items) {
    if (it.type === 'epic' || it.status === 'done') continue
    const inFlight = it.status === 'inprogress' || it.status === 'blocked' || it.labels.includes('recurring') || (it.dueDate && it.dueDate <= active.end)
    if (inFlight) {
      it.sprintId = s.id
      it.sprintAddedAt = iso(...active.start.split('-').map(Number), 9)
      if (it.status === 'backlog') it.status = 'todo'
    }
  }
}

/* ---------- assemble snapshot ---------- */
const memberList = [...members.values()]
const project = {
  id: projectId,
  key: projectKey,
  name: projectName,
  description: curation.project?.description ?? '',
  columns: [
    { id: 'c-todo', name: 'To Do', status: 'todo' },
    { id: 'c-inprogress', name: 'In Progress', status: 'inprogress', wip: 6 },
    { id: 'c-review', name: 'Code Review', status: 'review' },
    { id: 'c-testing', name: 'Testing', status: 'testing' },
    { id: 'c-blocked', name: 'Blocked', status: 'blocked' },
    { id: 'c-done', name: 'Done', status: 'done' },
  ],
  memberIds: memberList.map((m) => m.id),
  nextNumber: number,
  sprintLengthDays: 14,
  createdAt: iso(2026, 8, 1, 9),
  updatedAt: NOW,
}
const snapshot = {
  version: 1,
  exportedAt: new Date().toISOString(),
  members: memberList,
  projects: [project],
  items,
  sprints,
  comments,
  activities: items.map((i) => ({ id: uid('a'), projectId, itemId: i.id, actorId: i.assigneeId, kind: 'created', at: i.createdAt })),
  standups: [],
  retroNotes: [],
  retroActions: [],
  notifications: [],
  settings: { id: 'app', orgName: opt('org', 'TSAT webMethods'), theme: 'system', currentProjectId: projectId, currentMemberId: memberList[0]?.id, seeded: true },
}
fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 1))
fs.writeFileSync(outFile.replace(/\.json$/, '') + '.changes.json', JSON.stringify({ warnings, changes }, null, 1))

/* ---------- report ---------- */
const byStatus = items.filter((i) => i.type !== 'epic').reduce((a, i) => ((a[i.status] = (a[i.status] ?? 0) + 1), a), {})
console.log(`Wrote ${outFile}`)
console.log(`  members ${memberList.length} | epics ${epics.size} | items ${items.length - epics.size} | comments ${comments.length} | sprints ${sprints.length}`)
console.log(`  status: ${JSON.stringify(byStatus)}`)
console.log(`  changes logged: ${changes.length} | warnings: ${warnings.length}`)
warnings.slice(0, 20).forEach((w) => console.log('  ! ' + w))
