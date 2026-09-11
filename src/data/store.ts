import { create } from 'zustand'
import type { Activity, ActivityKind, Comment, ID, Member, Notification, Project, RetroAction, RetroCategory, RetroNote, Settings, Sprint, StandupEntry, Status, WorkItem } from '../domain/types'
import { DEFAULT_COLUMNS, STARTED_STATUSES } from '../domain/types'
import { db, uid, TABLES } from './db'
import { buildSeed, AVATAR_COLORS } from './seed'
import { nowISO } from '../domain/dates'
import { sumPoints, sprintItems } from '../domain/metrics'

const DEFAULT_SETTINGS: Settings = { id: 'app', orgName: 'My Organization', theme: 'system', seeded: false }

export interface Snapshot {
  version: 1
  exportedAt: string
  members: Member[]
  projects: Project[]
  items: WorkItem[]
  sprints: Sprint[]
  comments: Comment[]
  activities: Activity[]
  standups: StandupEntry[]
  retroNotes: RetroNote[]
  retroActions: RetroAction[]
  notifications: Notification[]
  settings: Settings
}

export interface NewItemInput {
  projectId: ID
  type: WorkItem['type']
  title: string
  description?: string
  status?: Status
  priority?: WorkItem['priority']
  assigneeId?: ID
  points?: number
  sprintId?: ID
  parentId?: ID
  labels?: string[]
  dueDate?: string
  dependsOn?: ID[]
}

export interface State {
  ready: boolean
  members: Member[]
  projects: Project[]
  items: WorkItem[]
  sprints: Sprint[]
  comments: Comment[]
  activities: Activity[]
  standups: StandupEntry[]
  retroNotes: RetroNote[]
  retroActions: RetroAction[]
  notifications: Notification[]
  settings: Settings

  boot: () => Promise<void>
  loadDemo: () => Promise<void>
  resetAll: () => Promise<void>
  exportSnapshot: () => Snapshot
  importSnapshot: (s: Snapshot) => Promise<void>

  updateSettings: (patch: Partial<Settings>) => void
  setCurrentProject: (id: ID) => void

  addMember: (m: Omit<Member, 'id' | 'createdAt' | 'color'> & { color?: string }) => Member
  updateMember: (id: ID, patch: Partial<Member>) => void
  removeMember: (id: ID) => void

  addProject: (p: { key: string; name: string; description?: string; sprintLengthDays?: number; memberIds?: ID[] }) => Project
  updateProject: (id: ID, patch: Partial<Project>) => void
  deleteProject: (id: ID) => Promise<void>

  createItem: (input: NewItemInput) => WorkItem
  createItems: (inputs: NewItemInput[]) => WorkItem[]
  updateItem: (id: ID, patch: Partial<WorkItem>) => void
  deleteItem: (id: ID) => void
  reorderItems: (orderedIds: ID[]) => void
  moveItemsToSprint: (ids: ID[], sprintId: ID | undefined) => void

  createSprint: (s: { projectId: ID; name: string; goal?: string; startDate: string; endDate: string; capacity?: number }) => Sprint
  updateSprint: (id: ID, patch: Partial<Sprint>) => void
  deleteSprint: (id: ID) => void
  startSprint: (id: ID) => string | undefined
  completeSprint: (id: ID, moveIncompleteTo: ID | undefined) => void

  addComment: (itemId: ID, body: string) => Comment
  deleteComment: (id: ID) => void

  upsertStandup: (e: Omit<StandupEntry, 'id' | 'createdAt' | 'updatedAt'>) => StandupEntry
  deleteStandup: (id: ID) => void

  addRetroNote: (sprintId: ID, category: RetroCategory, text: string) => RetroNote
  voteRetroNote: (id: ID, delta: number) => void
  deleteRetroNote: (id: ID) => void
  addRetroAction: (a: { projectId: ID; sprintId: ID; description: string; ownerId?: ID; dueDate?: string }) => RetroAction
  updateRetroAction: (id: ID, patch: Partial<RetroAction>) => void
  deleteRetroAction: (id: ID) => void

  markNotificationsRead: (ids?: ID[]) => void
  clearNotifications: () => void
}

function put<T>(table: { put: (x: T) => Promise<unknown> }, row: T) {
  table.put(row).catch((e) => console.error('persist failed', e))
}
function del(table: { delete: (k: string) => Promise<unknown> }, id: string) {
  table.delete(id).catch((e) => console.error('delete failed', e))
}

export const useStore = create<State>((set, get) => {
  const actor = () => get().settings.currentMemberId

  const log = (projectId: ID, kind: ActivityKind, extra: Partial<Activity> = {}) => {
    const a: Activity = { id: uid(), projectId, actorId: actor(), kind, at: nowISO(), ...extra }
    set((s) => ({ activities: [a, ...s.activities].slice(0, 5000) }))
    put(db.activities, a)
  }

  const notify = (n: Omit<Notification, 'id' | 'read' | 'at'>) => {
    const row: Notification = { id: uid(), read: false, at: nowISO(), ...n }
    set((s) => ({ notifications: [row, ...s.notifications].slice(0, 200) }))
    put(db.notifications, row)
  }

  const replaceAll = async (data: Omit<Snapshot, 'version' | 'exportedAt'>) => {
    await db.transaction('rw', TABLES.map((t) => db[t]), async () => {
      for (const t of TABLES) await db[t].clear()
      await db.members.bulkAdd(data.members)
      await db.projects.bulkAdd(data.projects)
      await db.items.bulkAdd(data.items)
      await db.sprints.bulkAdd(data.sprints)
      await db.comments.bulkAdd(data.comments)
      await db.activities.bulkAdd(data.activities)
      await db.standups.bulkAdd(data.standups)
      await db.retroNotes.bulkAdd(data.retroNotes)
      await db.retroActions.bulkAdd(data.retroActions)
      await db.notifications.bulkAdd(data.notifications)
      await db.settings.put(data.settings)
    })
    set({ ...data, ready: true })
  }

  return {
    ready: false,
    members: [],
    projects: [],
    items: [],
    sprints: [],
    comments: [],
    activities: [],
    standups: [],
    retroNotes: [],
    retroActions: [],
    notifications: [],
    settings: DEFAULT_SETTINGS,

    boot: async () => {
      const [members, projects, items, sprints, comments, activities, standups, retroNotes, retroActions, notifications, settings] = await Promise.all([
        db.members.toArray(),
        db.projects.toArray(),
        db.items.toArray(),
        db.sprints.toArray(),
        db.comments.toArray(),
        db.activities.orderBy('at').reverse().toArray(),
        db.standups.toArray(),
        db.retroNotes.toArray(),
        db.retroActions.toArray(),
        db.notifications.orderBy('at').reverse().toArray(),
        db.settings.get('app'),
      ])
      if (!settings) {
        // First run: load the demo workspace so the app is never empty.
        await replaceAll(buildSeed())
        return
      }
      set({ members, projects, items, sprints, comments, activities, standups, retroNotes, retroActions, notifications, settings, ready: true })
    },

    loadDemo: async () => {
      const seed = buildSeed()
      await replaceAll({ ...seed, settings: { ...seed.settings, theme: get().settings.theme } })
    },

    resetAll: async () => {
      const settings: Settings = { ...DEFAULT_SETTINGS, theme: get().settings.theme, seeded: true }
      await replaceAll({ members: [], projects: [], items: [], sprints: [], comments: [], activities: [], standups: [], retroNotes: [], retroActions: [], notifications: [], settings })
    },

    exportSnapshot: () => {
      const s = get()
      return {
        version: 1,
        exportedAt: nowISO(),
        members: s.members,
        projects: s.projects,
        items: s.items,
        sprints: s.sprints,
        comments: s.comments,
        activities: s.activities,
        standups: s.standups,
        retroNotes: s.retroNotes,
        retroActions: s.retroActions,
        notifications: s.notifications,
        settings: s.settings,
      }
    },

    importSnapshot: async (snap) => {
      if (!snap || snap.version !== 1 || !Array.isArray(snap.items) || !Array.isArray(snap.projects)) throw new Error('Not a ScrumFlow backup file')
      const { version: _v, exportedAt: _e, ...data } = snap
      void _v
      void _e
      await replaceAll({
        ...data,
        comments: data.comments ?? [],
        activities: data.activities ?? [],
        standups: data.standups ?? [],
        retroNotes: data.retroNotes ?? [],
        retroActions: data.retroActions ?? [],
        notifications: data.notifications ?? [],
        settings: { ...DEFAULT_SETTINGS, ...data.settings, id: 'app', seeded: true },
      })
    },

    updateSettings: (patch) => {
      const settings = { ...get().settings, ...patch, id: 'app' as const }
      set({ settings })
      put(db.settings, settings)
    },
    setCurrentProject: (id) => get().updateSettings({ currentProjectId: id }),

    addMember: (m) => {
      const idx = get().members.length % AVATAR_COLORS.length
      const row: Member = { id: uid(), createdAt: nowISO(), color: m.color ?? AVATAR_COLORS[idx], ...m }
      set((s) => ({ members: [...s.members, row] }))
      put(db.members, row)
      return row
    },
    updateMember: (id, patch) => {
      set((s) => ({ members: s.members.map((m) => (m.id === id ? { ...m, ...patch, id } : m)) }))
      const row = get().members.find((m) => m.id === id)
      if (row) put(db.members, row)
    },
    removeMember: (id) => {
      set((s) => ({
        members: s.members.filter((m) => m.id !== id),
        projects: s.projects.map((p) => ({ ...p, memberIds: p.memberIds.filter((x) => x !== id) })),
        items: s.items.map((i) => (i.assigneeId === id ? { ...i, assigneeId: undefined } : i)),
      }))
      del(db.members, id)
      get().projects.forEach((p) => put(db.projects, p))
      get().items.filter((i) => !i.assigneeId).forEach((i) => put(db.items, i))
    },

    addProject: (p) => {
      const now = nowISO()
      const row: Project = {
        id: uid(),
        key: p.key.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'PRJ',
        name: p.name,
        description: p.description ?? '',
        columns: DEFAULT_COLUMNS.map((c) => ({ ...c, id: uid() })),
        memberIds: p.memberIds ?? get().members.map((m) => m.id),
        nextNumber: 1,
        sprintLengthDays: p.sprintLengthDays ?? 14,
        createdAt: now,
        updatedAt: now,
      }
      set((s) => ({ projects: [...s.projects, row] }))
      put(db.projects, row)
      if (!get().settings.currentProjectId) get().setCurrentProject(row.id)
      return row
    },
    updateProject: (id, patch) => {
      set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch, id, updatedAt: nowISO() } : p)) }))
      const row = get().projects.find((p) => p.id === id)
      if (row) put(db.projects, row)
    },
    deleteProject: async (id) => {
      const s = get()
      const itemIds = new Set(s.items.filter((i) => i.projectId === id).map((i) => i.id))
      const sprintIds = new Set(s.sprints.filter((x) => x.projectId === id).map((x) => x.id))
      const next = {
        projects: s.projects.filter((p) => p.id !== id),
        items: s.items.filter((i) => i.projectId !== id),
        sprints: s.sprints.filter((x) => x.projectId !== id),
        comments: s.comments.filter((c) => !itemIds.has(c.itemId)),
        activities: s.activities.filter((a) => a.projectId !== id),
        standups: s.standups.filter((e) => e.projectId !== id),
        retroNotes: s.retroNotes.filter((r) => !sprintIds.has(r.sprintId)),
        retroActions: s.retroActions.filter((r) => r.projectId !== id),
      }
      set(next)
      await db.transaction('rw', [db.projects, db.items, db.sprints, db.comments, db.activities, db.standups, db.retroNotes, db.retroActions], async () => {
        await db.projects.delete(id)
        await db.items.where('projectId').equals(id).delete()
        await db.sprints.where('projectId').equals(id).delete()
        await db.comments.where('itemId').anyOf([...itemIds]).delete()
        await db.activities.where('projectId').equals(id).delete()
        await db.standups.where('projectId').equals(id).delete()
        await db.retroNotes.where('sprintId').anyOf([...sprintIds]).delete()
        await db.retroActions.where('projectId').equals(id).delete()
      })
      if (s.settings.currentProjectId === id) get().updateSettings({ currentProjectId: next.projects[0]?.id })
    },

    createItem: (input) => get().createItems([input])[0],
    createItems: (inputs) => {
      const created: WorkItem[] = []
      const now = nowISO()
      const projects = [...get().projects]
      let maxRank = get().items.reduce((m, i) => Math.max(m, i.rank), 0)
      for (const input of inputs) {
        const pi = projects.findIndex((p) => p.id === input.projectId)
        if (pi < 0) continue
        const project = projects[pi]
        const status: Status = input.status ?? (input.sprintId ? 'todo' : 'backlog')
        const row: WorkItem = {
          id: uid(),
          projectId: input.projectId,
          number: project.nextNumber,
          type: input.type,
          title: input.title.trim(),
          description: input.description ?? '',
          status,
          priority: input.priority ?? 'medium',
          assigneeId: input.assigneeId,
          reporterId: actor(),
          points: input.points,
          sprintId: input.sprintId,
          sprintAddedAt: input.sprintId ? now : undefined,
          parentId: input.parentId,
          labels: input.labels ?? [],
          dueDate: input.dueDate,
          rank: ++maxRank,
          blocked: status === 'blocked',
          dependsOn: input.dependsOn ?? [],
          createdAt: now,
          updatedAt: now,
          startedAt: STARTED_STATUSES.includes(status) ? now : undefined,
          completedAt: status === 'done' ? now : undefined,
        }
        projects[pi] = { ...project, nextNumber: project.nextNumber + 1, updatedAt: now }
        created.push(row)
      }
      set((s) => ({ items: [...s.items, ...created], projects }))
      created.forEach((row) => {
        put(db.items, row)
        log(row.projectId, 'created', { itemId: row.id })
        if (row.assigneeId && row.assigneeId !== actor()) notify({ memberId: row.assigneeId, kind: 'assignment', text: `You were assigned "${row.title}"`, itemId: row.id })
      })
      projects.forEach((p) => put(db.projects, p))
      return created
    },
    updateItem: (id, patch) => {
      const prev = get().items.find((i) => i.id === id)
      if (!prev) return
      const now = nowISO()
      const next: WorkItem = { ...prev, ...patch, id, updatedAt: now }
      if (patch.status && patch.status !== prev.status) {
        if (patch.status === 'done') next.completedAt = now
        else if (prev.status === 'done') next.completedAt = undefined
        if (STARTED_STATUSES.includes(patch.status) && !next.startedAt) next.startedAt = now
        if (patch.status === 'blocked') next.blocked = true
        else if (prev.status === 'blocked' && patch.blocked === undefined) next.blocked = false
      }
      if ('sprintId' in patch && patch.sprintId !== prev.sprintId) {
        next.sprintAddedAt = patch.sprintId ? now : undefined
        if (patch.sprintId && next.status === 'backlog') next.status = 'todo'
        if (!patch.sprintId && next.status !== 'done') next.status = 'backlog'
      }
      set((s) => ({ items: s.items.map((i) => (i.id === id ? next : i)) }))
      put(db.items, next)

      const track: [keyof WorkItem, ActivityKind][] = [
        ['status', 'status'],
        ['assigneeId', 'assignee'],
        ['points', 'points'],
        ['priority', 'priority'],
        ['sprintId', 'sprint'],
      ]
      for (const [field, kind] of track) {
        if (field in patch && prev[field] !== next[field]) log(prev.projectId, kind, { itemId: id, field, from: String(prev[field] ?? ''), to: String(next[field] ?? '') })
      }
      if (patch.blocked !== undefined && patch.blocked !== prev.blocked) {
        log(prev.projectId, 'blocked', { itemId: id, to: next.blocked ? next.blockedReason ?? 'blocked' : 'unblocked' })
        if (next.blocked) notify({ kind: 'blocker', text: `"${next.title}" is blocked${next.blockedReason ? `: ${next.blockedReason}` : ''}`, itemId: id })
      }
      if (patch.assigneeId && patch.assigneeId !== prev.assigneeId && patch.assigneeId !== actor()) {
        notify({ memberId: patch.assigneeId, kind: 'assignment', text: `You were assigned "${next.title}"`, itemId: id })
      }
    },
    deleteItem: (id) => {
      const item = get().items.find((i) => i.id === id)
      if (!item) return
      const childIds = get().items.filter((i) => i.parentId === id).map((i) => i.id)
      set((s) => ({
        items: s.items.filter((i) => i.id !== id).map((i) => (i.parentId === id ? { ...i, parentId: undefined } : { ...i, dependsOn: i.dependsOn.filter((d) => d !== id) })),
        comments: s.comments.filter((c) => c.itemId !== id),
      }))
      del(db.items, id)
      db.comments.where('itemId').equals(id).delete().catch(() => {})
      childIds.forEach((cid) => {
        const c = get().items.find((i) => i.id === cid)
        if (c) put(db.items, c)
      })
      log(item.projectId, 'deleted', { itemId: id, from: item.title })
    },
    reorderItems: (orderedIds) => {
      const rankOf = new Map(orderedIds.map((id, idx) => [id, idx]))
      const touched = get().items.filter((i) => rankOf.has(i.id))
      const base = Math.min(...touched.map((i) => i.rank))
      set((s) => ({ items: s.items.map((i) => (rankOf.has(i.id) ? { ...i, rank: base + rankOf.get(i.id)! } : i)) }))
      get().items.filter((i) => rankOf.has(i.id)).forEach((i) => put(db.items, i))
    },
    moveItemsToSprint: (ids, sprintId) => {
      ids.forEach((id) => get().updateItem(id, { sprintId }))
    },

    createSprint: (s) => {
      const now = nowISO()
      const row: Sprint = { id: uid(), projectId: s.projectId, name: s.name, goal: s.goal ?? '', startDate: s.startDate, endDate: s.endDate, status: 'planned', capacity: s.capacity ?? 0, createdAt: now, updatedAt: now }
      set((st) => ({ sprints: [...st.sprints, row] }))
      put(db.sprints, row)
      return row
    },
    updateSprint: (id, patch) => {
      set((s) => ({ sprints: s.sprints.map((x) => (x.id === id ? { ...x, ...patch, id, updatedAt: nowISO() } : x)) }))
      const row = get().sprints.find((x) => x.id === id)
      if (row) put(db.sprints, row)
    },
    deleteSprint: (id) => {
      const ids = get().items.filter((i) => i.sprintId === id).map((i) => i.id)
      get().moveItemsToSprint(ids, undefined)
      set((s) => ({ sprints: s.sprints.filter((x) => x.id !== id), retroNotes: s.retroNotes.filter((r) => r.sprintId !== id) }))
      del(db.sprints, id)
      db.retroNotes.where('sprintId').equals(id).delete().catch(() => {})
    },
    startSprint: (id) => {
      const s = get()
      const sprint = s.sprints.find((x) => x.id === id)
      if (!sprint) return 'Sprint not found'
      const active = s.sprints.find((x) => x.projectId === sprint.projectId && x.status === 'active')
      if (active) return `${active.name} is still active — complete it first.`
      const committed = sumPoints(sprintItems(sprint, s.items))
      s.updateSprint(id, { status: 'active', committedPoints: committed })
      s.items.filter((i) => i.sprintId === id && i.status === 'backlog').forEach((i) => s.updateItem(i.id, { status: 'todo' }))
      notify({ kind: 'sprint', text: `${sprint.name} started — ${committed} SP committed` })
      log(sprint.projectId, 'sprint', { to: `${sprint.name} started` })
      return undefined
    },
    completeSprint: (id, moveIncompleteTo) => {
      const s = get()
      const sprint = s.sprints.find((x) => x.id === id)
      if (!sprint) return
      const its = sprintItems(sprint, s.items)
      const completed = sumPoints(its.filter((i) => i.status === 'done'))
      s.updateSprint(id, { status: 'completed', completedPoints: completed })
      its.filter((i) => i.status !== 'done').forEach((i) => s.updateItem(i.id, { sprintId: moveIncompleteTo }))
      notify({ kind: 'sprint', text: `${sprint.name} completed — ${completed} SP delivered` })
      log(sprint.projectId, 'sprint', { to: `${sprint.name} completed` })
    },

    addComment: (itemId, body) => {
      const row: Comment = { id: uid(), itemId, authorId: actor(), body: body.trim(), createdAt: nowISO() }
      set((s) => ({ comments: [...s.comments, row] }))
      put(db.comments, row)
      const item = get().items.find((i) => i.id === itemId)
      if (item) {
        log(item.projectId, 'commented', { itemId })
        const who = get().members.find((m) => m.id === actor())?.name ?? 'Someone'
        if (item.assigneeId && item.assigneeId !== actor()) notify({ memberId: item.assigneeId, kind: 'comment', text: `${who} commented on "${item.title}"`, itemId })
      }
      return row
    },
    deleteComment: (id) => {
      set((s) => ({ comments: s.comments.filter((c) => c.id !== id) }))
      del(db.comments, id)
    },

    upsertStandup: (e) => {
      const existing = get().standups.find((x) => x.projectId === e.projectId && x.memberId === e.memberId && x.date === e.date)
      const now = nowISO()
      const row: StandupEntry = existing ? { ...existing, ...e, updatedAt: now } : { id: uid(), createdAt: now, updatedAt: now, ...e }
      set((s) => ({ standups: existing ? s.standups.map((x) => (x.id === row.id ? row : x)) : [...s.standups, row] }))
      put(db.standups, row)
      return row
    },
    deleteStandup: (id) => {
      set((s) => ({ standups: s.standups.filter((x) => x.id !== id) }))
      del(db.standups, id)
    },

    addRetroNote: (sprintId, category, text) => {
      const row: RetroNote = { id: uid(), sprintId, category, text: text.trim(), authorId: actor(), votes: 0, createdAt: nowISO() }
      set((s) => ({ retroNotes: [...s.retroNotes, row] }))
      put(db.retroNotes, row)
      return row
    },
    voteRetroNote: (id, delta) => {
      set((s) => ({ retroNotes: s.retroNotes.map((r) => (r.id === id ? { ...r, votes: Math.max(0, r.votes + delta) } : r)) }))
      const row = get().retroNotes.find((r) => r.id === id)
      if (row) put(db.retroNotes, row)
    },
    deleteRetroNote: (id) => {
      set((s) => ({ retroNotes: s.retroNotes.filter((r) => r.id !== id) }))
      del(db.retroNotes, id)
    },
    addRetroAction: (a) => {
      const row: RetroAction = { id: uid(), status: 'open', createdAt: nowISO(), ...a }
      set((s) => ({ retroActions: [...s.retroActions, row] }))
      put(db.retroActions, row)
      return row
    },
    updateRetroAction: (id, patch) => {
      set((s) => ({ retroActions: s.retroActions.map((r) => (r.id === id ? { ...r, ...patch, id } : r)) }))
      const row = get().retroActions.find((r) => r.id === id)
      if (row) put(db.retroActions, row)
    },
    deleteRetroAction: (id) => {
      set((s) => ({ retroActions: s.retroActions.filter((r) => r.id !== id) }))
      del(db.retroActions, id)
    },

    markNotificationsRead: (ids) => {
      set((s) => ({ notifications: s.notifications.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)) }))
      get().notifications.forEach((n) => put(db.notifications, n))
    },
    clearNotifications: () => {
      set({ notifications: [] })
      db.notifications.clear().catch(() => {})
    },
  }
})
