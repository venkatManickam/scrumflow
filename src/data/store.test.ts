import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './store'
import { db } from './db'
import { buildSeed } from './seed'
import { dayKey } from '../domain/dates'

const S = () => useStore.getState()

beforeEach(async () => {
  await S().resetAll()
})

describe('store', () => {
  it('boots into the demo workspace on first run', async () => {
    await db.settings.clear()
    useStore.setState({ ready: false })
    await S().boot()
    expect(S().ready).toBe(true)
    expect(S().projects).toHaveLength(1)
    expect(S().sprints.find((s) => s.status === 'active')).toBeTruthy()
    expect(S().items.length).toBeGreaterThan(20)
  })

  it('numbers items per project and persists them', async () => {
    const p = S().addProject({ key: 'ab c', name: 'Test' })
    expect(p.key).toBe('ABC')
    const a = S().createItem({ projectId: p.id, type: 'story', title: 'First' })
    const b = S().createItem({ projectId: p.id, type: 'bug', title: 'Second', points: 3 })
    expect(a.number).toBe(1)
    expect(b.number).toBe(2)
    expect(a.status).toBe('backlog')
    expect(await db.items.count()).toBe(2)
    expect((await db.projects.get(p.id))?.nextNumber).toBe(3)
  })

  it('tracks status transitions, timestamps and activity', () => {
    const p = S().addProject({ key: 'T', name: 'T' })
    const a = S().createItem({ projectId: p.id, type: 'story', title: 'x', points: 5 })
    S().updateItem(a.id, { status: 'inprogress' })
    let cur = S().items.find((i) => i.id === a.id)!
    expect(cur.startedAt).toBeTruthy()
    expect(cur.completedAt).toBeUndefined()
    S().updateItem(a.id, { status: 'done' })
    cur = S().items.find((i) => i.id === a.id)!
    expect(cur.completedAt).toBeTruthy()
    S().updateItem(a.id, { status: 'todo' })
    cur = S().items.find((i) => i.id === a.id)!
    expect(cur.completedAt).toBeUndefined()
    const statusChanges = S().activities.filter((x) => x.itemId === a.id && x.kind === 'status')
    expect(statusChanges).toHaveLength(3)
  })

  it('moving into a sprint promotes backlog → todo and stamps sprintAddedAt', () => {
    const p = S().addProject({ key: 'T', name: 'T' })
    const sp = S().createSprint({ projectId: p.id, name: 'S1', startDate: dayKey(), endDate: dayKey(), capacity: 10 })
    const a = S().createItem({ projectId: p.id, type: 'story', title: 'x', points: 5 })
    S().updateItem(a.id, { sprintId: sp.id })
    const cur = S().items.find((i) => i.id === a.id)!
    expect(cur.status).toBe('todo')
    expect(cur.sprintAddedAt).toBeTruthy()
    S().updateItem(a.id, { sprintId: undefined })
    expect(S().items.find((i) => i.id === a.id)!.status).toBe('backlog')
  })

  it('start/complete sprint snapshots points and carries over unfinished work', () => {
    const p = S().addProject({ key: 'T', name: 'T' })
    const s1 = S().createSprint({ projectId: p.id, name: 'S1', startDate: dayKey(), endDate: dayKey(), capacity: 10 })
    const s2 = S().createSprint({ projectId: p.id, name: 'S2', startDate: dayKey(), endDate: dayKey(), capacity: 10 })
    const a = S().createItem({ projectId: p.id, type: 'story', title: 'a', points: 5, sprintId: s1.id })
    const b = S().createItem({ projectId: p.id, type: 'story', title: 'b', points: 8, sprintId: s1.id })
    S().createItem({ projectId: p.id, type: 'epic', title: 'epic', points: 99, sprintId: s1.id })
    expect(S().startSprint(s1.id)).toBeUndefined()
    expect(S().startSprint(s2.id)).toMatch(/still active/)
    expect(S().sprints.find((x) => x.id === s1.id)!.committedPoints).toBe(13)
    S().updateItem(a.id, { status: 'done' })
    S().completeSprint(s1.id, s2.id)
    const done = S().sprints.find((x) => x.id === s1.id)!
    expect(done.status).toBe('completed')
    expect(done.completedPoints).toBe(5)
    expect(S().items.find((i) => i.id === b.id)!.sprintId).toBe(s2.id)
    expect(S().items.find((i) => i.id === a.id)!.sprintId).toBe(s1.id)
    expect(S().startSprint(s2.id)).toBeUndefined()
  })

  it('deleting a project removes everything that belongs to it', async () => {
    await S().loadDemo()
    const p = S().projects[0]
    await S().deleteProject(p.id)
    expect(S().items).toHaveLength(0)
    expect(S().sprints).toHaveLength(0)
    expect(await db.items.count()).toBe(0)
    expect(await db.standups.count()).toBe(0)
  })

  it('round-trips a snapshot', async () => {
    await S().loadDemo()
    const snap = S().exportSnapshot()
    await S().resetAll()
    expect(S().items).toHaveLength(0)
    await S().importSnapshot(JSON.parse(JSON.stringify(snap)))
    expect(S().items).toHaveLength(snap.items.length)
    expect(S().settings.orgName).toBe('Acme Software')
  })

  it('demo seed is internally consistent', () => {
    const seed = buildSeed(new Date('2026-09-11T12:00:00'))
    const ids = new Set(seed.items.map((i) => i.id))
    for (const i of seed.items) {
      if (i.parentId) expect(ids.has(i.parentId)).toBe(true)
      for (const d of i.dependsOn) expect(ids.has(d)).toBe(true)
      if (i.status === 'done') expect(i.completedAt).toBeTruthy()
      if (i.sprintId) expect(seed.sprints.some((s) => s.id === i.sprintId)).toBe(true)
    }
    expect(seed.sprints.filter((s) => s.status === 'active')).toHaveLength(1)
    const numbers = seed.items.map((i) => i.number)
    expect(new Set(numbers).size).toBe(numbers.length)
  })
})
