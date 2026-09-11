import { describe, expect, it } from 'vitest'
import type { Member, Sprint, WorkItem } from './types'
import { answerQuestion, averageVelocity, burndown, sprintCompletion, sprintHealth, velocity, workload } from './metrics'

const member = (id: string, capacity = 10): Member => ({ id, name: id, role: 'dev', capacity, color: '#000', active: true, createdAt: '2026-01-01T00:00:00Z' })
const item = (p: Partial<WorkItem> & { id: string }): WorkItem => ({
  projectId: 'p',
  number: 1,
  type: 'story',
  title: p.id,
  description: '',
  status: 'todo',
  priority: 'medium',
  labels: [],
  rank: 0,
  blocked: false,
  dependsOn: [],
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  ...p,
})
const sprint: Sprint = {
  id: 's1',
  projectId: 'p',
  name: 'Sprint 1',
  goal: 'g',
  startDate: '2026-09-01',
  endDate: '2026-09-10',
  status: 'active',
  capacity: 30,
  committedPoints: 30,
  createdAt: '2026-08-30T00:00:00Z',
  updatedAt: '2026-08-30T00:00:00Z',
}

describe('burndown', () => {
  it('draws the ideal line from committed points to zero and the actual line only up to today', () => {
    const items = [
      item({ id: 'a', sprintId: 's1', points: 10, status: 'done', completedAt: '2026-09-03T10:00:00Z' }),
      item({ id: 'b', sprintId: 's1', points: 20 }),
    ]
    const bd = burndown(sprint, items, '2026-09-05')
    expect(bd).toHaveLength(10)
    expect(bd[0].ideal).toBe(30)
    expect(bd[9].ideal).toBe(0)
    expect(bd[0].actual).toBe(30)
    expect(bd[2].actual).toBe(20)
    expect(bd[4].actual).toBe(20)
    expect(bd[5].actual).toBeNull()
  })
  it('grows scope when an item is added mid-sprint', () => {
    const items = [item({ id: 'a', sprintId: 's1', points: 10 }), item({ id: 'b', sprintId: 's1', points: 5, sprintAddedAt: '2026-09-04T09:00:00Z' })]
    const bd = burndown({ ...sprint, committedPoints: 10 }, items, '2026-09-10')
    expect(bd[0].scope).toBe(10)
    expect(bd[3].scope).toBe(15)
    expect(bd[3].actual).toBe(15)
  })
  it('ignores epics', () => {
    const items = [item({ id: 'e', type: 'epic', sprintId: 's1', points: 99 }), item({ id: 'a', sprintId: 's1', points: 3 })]
    expect(burndown({ ...sprint, committedPoints: undefined }, items, '2026-09-01')[0].scope).toBe(3)
  })
})

describe('velocity', () => {
  it('uses snapshots for completed sprints and averages the last three', () => {
    const sprints: Sprint[] = [
      { ...sprint, id: 'a', name: 'A', status: 'completed', committedPoints: 20, completedPoints: 18, startDate: '2026-01-01' },
      { ...sprint, id: 'b', name: 'B', status: 'completed', committedPoints: 25, completedPoints: 22, startDate: '2026-02-01' },
      { ...sprint, id: 'c', name: 'C', status: 'active', startDate: '2026-03-01' },
    ]
    const v = velocity(sprints, [])
    expect(v.map((p) => p.name)).toEqual(['A', 'B'])
    expect(v[1].completed).toBe(22)
    expect(averageVelocity(v)).toBe(20)
  })
})

describe('sprintCompletion', () => {
  it('separates committed, added and carried-over points', () => {
    const items = [
      item({ id: 'a', sprintId: 's1', points: 10, status: 'done', completedAt: '2026-09-03T00:00:00Z' }),
      item({ id: 'b', sprintId: 's1', points: 20 }),
      item({ id: 'c', sprintId: 's1', points: 5, sprintAddedAt: '2026-09-05T00:00:00Z' }),
    ]
    const c = sprintCompletion({ ...sprint, committedPoints: undefined }, items)
    expect(c.committed).toBe(30)
    expect(c.completed).toBe(10)
    expect(c.addedDuringSprint).toBe(5)
    expect(c.carriedOver).toBe(25)
  })
})

describe('workload', () => {
  it('computes utilization per member', () => {
    const items = [item({ id: 'a', sprintId: 's1', points: 8, assigneeId: 'm1' }), item({ id: 'b', sprintId: 's1', points: 4, assigneeId: 'm1', status: 'done' })]
    const wl = workload(sprint, items, [member('m1', 10), member('m2', 10)])
    expect(wl[0].member.id).toBe('m1')
    expect(wl[0].assigned).toBe(12)
    expect(wl[0].done).toBe(4)
    expect(wl[0].utilization).toBe(1.2)
    expect(wl[1].assigned).toBe(0)
  })
})

describe('sprintHealth', () => {
  const members = [member('m1', 20), member('m2', 20)]
  it('flags the textbook high-risk sprint: 38 committed, 20 done, 2 days left', () => {
    const items = [
      item({ id: 'done', sprintId: 's1', points: 20, status: 'done', completedAt: '2026-09-06T00:00:00Z', assigneeId: 'm1' }),
      item({ id: 'big', sprintId: 's1', points: 13, status: 'todo', assigneeId: 'm2' }),
      item({ id: 'small', sprintId: 's1', points: 5, status: 'inprogress', assigneeId: 'm2' }),
    ]
    const h = sprintHealth({ ...sprint, committedPoints: 38, capacity: 40 }, items, members, [], '2026-09-09')
    expect(h.daysLeft).toBe(2)
    expect(h.remaining).toBe(18)
    expect(h.risk).toBe('high')
    expect(h.moveCandidates.map((i) => i.id)).toEqual(['big'])
    expect(h.recommendations.join(' ')).toMatch(/Move "big"/)
  })
  it('is low risk when ahead of the ideal line', () => {
    const items = [
      item({ id: 'a', sprintId: 's1', points: 20, status: 'done', completedAt: '2026-09-02T00:00:00Z', assigneeId: 'm1' }),
      item({ id: 'b', sprintId: 's1', points: 5, status: 'inprogress', assigneeId: 'm2' }),
    ]
    const h = sprintHealth({ ...sprint, committedPoints: 25 }, items, members, [{ sprintId: 'x', name: 'x', committed: 25, completed: 25 }], '2026-09-04')
    expect(h.risk).toBe('low')
    expect(h.recommendations[0]).toMatch(/on track/)
  })
  it('names blockers and overloaded members in findings', () => {
    const items = [
      item({ id: 'a', sprintId: 's1', points: 13, status: 'blocked', blocked: true, blockedReason: 'waiting for test data', assigneeId: 'm1' }),
      item({ id: 'b', sprintId: 's1', points: 13, status: 'inprogress', assigneeId: 'm1' }),
    ]
    const h = sprintHealth(sprint, items, members, [], '2026-09-05')
    expect(h.blockedPoints).toBe(13)
    expect(h.overloaded[0].member.id).toBe('m1')
    expect(h.findings.join(' ')).toMatch(/over capacity/)
    expect(h.recommendations[0]).toMatch(/waiting for test data/)
  })
})

describe('answerQuestion', () => {
  const members = [member('m1', 20), member('m2', 20)]
  const items = [
    item({ id: 'a', sprintId: 's1', points: 8, status: 'blocked', blocked: true, blockedReason: 'SAP test data', assigneeId: 'm1' }),
    item({ id: 'b', sprintId: 's1', points: 8, status: 'done', completedAt: '2026-09-03T00:00:00Z', assigneeId: 'm2' }),
  ]
  it('routes blocker questions', () => {
    const a = answerQuestion('What are our biggest blockers?', { sprint, items, members, history: [], today: '2026-09-05' })
    expect(a.title).toMatch(/1 blocker/)
    expect(a.body[0]).toMatch(/SAP test data/)
  })
  it('routes workload questions', () => {
    const a = answerQuestion('Who is overloaded?', { sprint, items, members, history: [], today: '2026-09-05' })
    expect(a.title).toBe('Team workload')
  })
  it('falls back to the completion forecast', () => {
    const a = answerQuestion('Are we going to complete this sprint?', { sprint, items, members, history: [], today: '2026-09-05' })
    expect(a.title).toMatch(/risk/i)
    expect(a.risk).toBeDefined()
  })
  it('handles no sprint', () => {
    expect(answerQuestion('anything', { items: [], members: [], history: [] }).title).toMatch(/No sprint/)
  })
})
