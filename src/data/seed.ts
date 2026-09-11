import type { Activity, Comment, Member, Notification, Project, RetroAction, RetroNote, Settings, Sprint, StandupEntry, WorkItem, Status, ItemType, Priority } from '../domain/types'
import { DEFAULT_COLUMNS } from '../domain/types'
import { dayKey, shiftDays } from '../domain/dates'

export interface SeedData {
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

export const AVATAR_COLORS = ['#2563eb', '#8b5cf6', '#16a34a', '#ea8a0c', '#dc2626', '#0891b2', '#c026d3', '#65a30d', '#e11d48', '#7c3aed', '#0d9488', '#d97706']

/** Fictional demo workspace. Everything is relative to `today` so the active sprint is always mid-flight. */
export function buildSeed(today: Date = new Date()): SeedData {
  const at = (n: number, h = 10) => {
    const d = shiftDays(today, n)
    d.setHours(h, 0, 0, 0)
    return d.toISOString()
  }
  const day = (n: number) => dayKey(shiftDays(today, n))

  const members: Member[] = [
    { id: 'm-arun', name: 'Arun Mehta', email: 'arun@acme.example', role: 'sm', capacity: 5, color: AVATAR_COLORS[0], active: true, createdAt: at(-60) },
    { id: 'm-bhavna', name: 'Bhavna Rao', email: 'bhavna@acme.example', role: 'dev', capacity: 13, color: AVATAR_COLORS[1], active: true, createdAt: at(-60) },
    { id: 'm-chetan', name: 'Chetan Iyer', email: 'chetan@acme.example', role: 'dev', capacity: 13, color: AVATAR_COLORS[2], active: true, createdAt: at(-60) },
    { id: 'm-deepa', name: 'Deepa Nair', email: 'deepa@acme.example', role: 'po', capacity: 0, color: AVATAR_COLORS[3], active: true, createdAt: at(-60) },
    { id: 'm-eshan', name: 'Eshan Kulkarni', email: 'eshan@acme.example', role: 'dev', capacity: 13, color: AVATAR_COLORS[5], active: true, createdAt: at(-60) },
    { id: 'm-farah', name: 'Farah Khan', email: 'farah@acme.example', role: 'dev', capacity: 10, color: AVATAR_COLORS[6], active: true, createdAt: at(-60) },
    { id: 'm-gopal', name: 'Gopal Menon', email: 'gopal@acme.example', role: 'stakeholder', capacity: 0, color: AVATAR_COLORS[7], active: true, createdAt: at(-60) },
  ]

  const projectId = 'p-emi'
  const sprints: Sprint[] = [
    { id: 's1', projectId, name: 'Sprint 1', goal: 'Stand up the integration platform and deliver the first inbound master-data interface.', startDate: day(-36), endDate: day(-23), status: 'completed', capacity: 30, committedPoints: 24, completedPoints: 19, createdAt: at(-38), updatedAt: at(-23) },
    { id: 's2', projectId, name: 'Sprint 2', goal: 'Complete BOM and work-center inbound flows with monitoring.', startDate: day(-22), endDate: day(-9), status: 'completed', capacity: 32, committedPoints: 29, completedPoints: 26, createdAt: at(-24), updatedAt: at(-9) },
    { id: 's3', projectId, name: 'Sprint 3', goal: 'Deliver the Manufacturing Order and Stock Posting interfaces end-to-end in QA.', startDate: day(-8), endDate: day(5), status: 'active', capacity: 34, committedPoints: 35, createdAt: at(-10), updatedAt: at(-8) },
    { id: 's4', projectId, name: 'Sprint 4', goal: 'Close the production loop: order completion and goods receipt.', startDate: day(6), endDate: day(19), status: 'planned', capacity: 34, createdAt: at(-3), updatedAt: at(-3) },
  ]

  let n = 1
  let rank = 0
  const items: WorkItem[] = []
  const mk = (p: {
    id: string
    type: ItemType
    title: string
    description?: string
    status?: Status
    priority?: Priority
    assignee?: string
    points?: number
    sprint?: string
    sprintAddedAt?: string
    parent?: string
    labels?: string[]
    due?: string
    blocked?: boolean
    blockedReason?: string
    created?: string
    started?: string
    completed?: string
    dependsOn?: string[]
  }): WorkItem => {
    const status: Status = p.status ?? (p.sprint ? 'todo' : 'backlog')
    const item: WorkItem = {
      id: p.id,
      projectId,
      number: n++,
      type: p.type,
      title: p.title,
      description: p.description ?? '',
      status,
      priority: p.priority ?? 'medium',
      assigneeId: p.assignee,
      reporterId: 'm-deepa',
      points: p.points,
      sprintId: p.sprint,
      sprintAddedAt: p.sprintAddedAt,
      parentId: p.parent,
      labels: p.labels ?? [],
      dueDate: p.due,
      rank: rank++,
      blocked: p.blocked ?? status === 'blocked',
      blockedReason: p.blockedReason,
      dependsOn: p.dependsOn ?? [],
      createdAt: p.created ?? at(-40),
      updatedAt: p.completed ?? p.started ?? p.created ?? at(-40),
      startedAt: p.started,
      completedAt: status === 'done' ? p.completed ?? at(-1) : undefined,
    }
    items.push(item)
    return item
  }

  // Epics
  mk({ id: 'e-sap', type: 'epic', title: 'SAP Integration', description: 'All inbound and outbound interfaces between SAP ECC and the integration layer.', priority: 'high', assignee: 'm-deepa', labels: ['sap'], status: 'inprogress', started: at(-36) })
  mk({ id: 'e-mes', type: 'epic', title: 'MES Integration', description: 'Shop-floor MES adapters, message contracts and acknowledgement loops.', priority: 'high', assignee: 'm-deepa', labels: ['mes'], status: 'inprogress', started: at(-30) })
  mk({ id: 'e-infra', type: 'epic', title: 'Infrastructure & Observability', description: 'Environments, CI/CD, monitoring and operational tooling for the integration platform.', priority: 'medium', assignee: 'm-arun', labels: ['ops'], status: 'inprogress', started: at(-36) })

  // Sprint 1 (completed)
  mk({ id: 'st-mm', type: 'story', title: 'Material Master inbound interface (SAP → MES)', description: 'Receive MATMAS IDocs, map to the MES material contract and publish to the plant topic.', points: 8, priority: 'high', assignee: 'm-bhavna', sprint: 's1', parent: 'e-sap', labels: ['sap', 'inbound'], status: 'done', created: at(-40), started: at(-35), completed: at(-26) })
  mk({ id: 'st-plant', type: 'story', title: 'Plant and storage-location sync', points: 5, priority: 'medium', assignee: 'm-chetan', sprint: 's1', parent: 'e-sap', labels: ['sap'], status: 'done', created: at(-40), started: at(-34), completed: at(-28) })
  mk({ id: 'st-env', type: 'story', title: 'Development environment and CI pipeline', points: 3, priority: 'high', assignee: 'm-arun', sprint: 's1', parent: 'e-infra', labels: ['ops'], status: 'done', created: at(-40), started: at(-36), completed: at(-33) })
  mk({ id: 'bug-dup', type: 'bug', title: 'Duplicate material messages on IDoc resend', points: 3, priority: 'high', assignee: 'm-bhavna', sprint: 's1', parent: 'e-sap', labels: ['sap'], status: 'done', created: at(-30), started: at(-27), completed: at(-24) })
  // carried from S1 into S2
  mk({ id: 'st-log', type: 'story', title: 'Message logging and replay framework', description: 'Persist every inbound/outbound payload with correlation id; allow replay from the console.', points: 5, priority: 'medium', assignee: 'm-eshan', sprint: 's2', sprintAddedAt: at(-22, 9), parent: 'e-infra', labels: ['ops'], status: 'done', created: at(-40), started: at(-25), completed: at(-18) })

  // Sprint 2 (completed)
  mk({ id: 'st-bom', type: 'story', title: 'BOM inbound interface', description: 'Bill of materials with alternates and phantom assemblies.', points: 13, priority: 'high', assignee: 'm-chetan', sprint: 's2', parent: 'e-sap', labels: ['sap', 'inbound'], status: 'done', created: at(-38), started: at(-22), completed: at(-11) })
  mk({ id: 'st-wc', type: 'story', title: 'Work-center and routing sync', points: 5, priority: 'medium', assignee: 'm-bhavna', sprint: 's2', parent: 'e-sap', labels: ['sap'], status: 'done', created: at(-38), started: at(-21), completed: at(-15) })
  mk({ id: 'bug-uom', type: 'bug', title: 'Unit-of-measure conversion wrong for KG/G', points: 3, priority: 'critical', assignee: 'm-farah', sprint: 's2', parent: 'e-sap', labels: ['sap'], status: 'done', created: at(-20), started: at(-19), completed: at(-17) })
  // carried from S2 into S3
  mk({ id: 'st-mon', type: 'story', title: 'Interface monitoring dashboard', points: 3, priority: 'medium', assignee: 'm-arun', sprint: 's3', sprintAddedAt: at(-8, 9), parent: 'e-infra', labels: ['ops'], status: 'done', created: at(-30), started: at(-12), completed: at(-6) })

  // Sprint 3 (active)
  const mo = mk({ id: 'st-mo', type: 'story', title: 'Manufacturing Order inbound interface', description: 'Production orders with components and operations, merged into one MES message. Includes retry on MES unavailability.', points: 13, priority: 'high', assignee: 'm-bhavna', sprint: 's3', sprintAddedAt: at(-8, 9), parent: 'e-sap', labels: ['sap', 'mes', 'inbound'], status: 'inprogress', due: day(3), created: at(-25), started: at(-7) })
  mk({ id: 't-mo-map', type: 'task', title: 'SAP field mapping for MO header and components', assignee: 'm-bhavna', sprint: 's3', sprintAddedAt: at(-8, 9), parent: mo.id, status: 'done', created: at(-9), started: at(-7), completed: at(-5) })
  mk({ id: 't-mo-db', type: 'task', title: 'Staging tables and merge logic', assignee: 'm-bhavna', sprint: 's3', sprintAddedAt: at(-8, 9), parent: mo.id, status: 'done', created: at(-9), started: at(-5), completed: at(-3) })
  mk({ id: 't-mo-dev', type: 'task', title: 'Publish to MES topic with retry', assignee: 'm-bhavna', sprint: 's3', sprintAddedAt: at(-8, 9), parent: mo.id, status: 'inprogress', created: at(-9), started: at(-2) })
  mk({ id: 't-mo-ut', type: 'task', title: 'Unit tests and QA hand-over notes', assignee: 'm-farah', sprint: 's3', sprintAddedAt: at(-8, 9), parent: mo.id, status: 'todo', created: at(-9) })
  mk({ id: 'st-conf', type: 'story', title: 'Order confirmation outbound (MES → SAP)', description: 'Operation confirmations posted back to SAP via BAPI with idempotency key.', points: 8, priority: 'high', assignee: 'm-chetan', sprint: 's3', sprintAddedAt: at(-8, 9), parent: 'e-mes', labels: ['mes', 'outbound'], status: 'inprogress', due: day(4), created: at(-25), started: at(-4), dependsOn: [mo.id] })
  mk({ id: 'st-stock', type: 'story', title: 'Stock posting bidirectional with ACK loop', description: 'Goods movements from MES/WMS to SAP with acknowledgement polling (0 → 2 → 3 / -1).', points: 8, priority: 'high', assignee: 'm-eshan', sprint: 's3', sprintAddedAt: at(-8, 9), parent: 'e-sap', labels: ['sap', 'mes'], status: 'blocked', blocked: true, blockedReason: 'Waiting for SAP QA test data from the basis team', due: day(2), created: at(-25), started: at(-6) })
  mk({ id: 'bug-alt', type: 'bug', title: 'BOM alternate items ignored when quantity is zero', points: 3, priority: 'high', assignee: 'm-farah', sprint: 's3', sprintAddedAt: at(-8, 9), parent: 'e-sap', labels: ['sap'], status: 'review', created: at(-10), started: at(-4) })
  mk({ id: 'bug-hot', type: 'bug', title: 'Hotfix: MO date format rejected by MES (yyyyMMdd)', points: 2, priority: 'critical', assignee: 'm-chetan', sprint: 's3', sprintAddedAt: at(-3, 9), parent: 'e-mes', labels: ['mes', 'hotfix'], status: 'done', created: at(-3), started: at(-3), completed: at(-2) })

  // Sprint 4 (planned)
  mk({ id: 'st-comp', type: 'story', title: 'Order completion and technical close', points: 8, priority: 'high', assignee: 'm-bhavna', sprint: 's4', sprintAddedAt: at(-3), parent: 'e-mes', labels: ['mes', 'outbound'], status: 'todo', created: at(-20) })
  mk({ id: 'st-gr', type: 'story', title: 'Goods receipt against production order', points: 8, priority: 'high', assignee: 'm-eshan', sprint: 's4', sprintAddedAt: at(-3), parent: 'e-sap', labels: ['sap', 'inbound'], status: 'todo', created: at(-20) })
  mk({ id: 'st-scrap', type: 'story', title: 'Scrap and rework reporting', points: 5, priority: 'medium', sprint: 's4', sprintAddedAt: at(-3), parent: 'e-mes', labels: ['mes'], status: 'todo', created: at(-15) })

  // Backlog
  mk({ id: 'st-outconf', type: 'story', title: 'Outbound production confirmations batch', points: 13, priority: 'medium', parent: 'e-mes', labels: ['mes', 'outbound'], created: at(-15) })
  mk({ id: 'st-batch', type: 'story', title: 'Batch and serial-number tracking', points: 13, priority: 'medium', parent: 'e-sap', labels: ['sap'], created: at(-15) })
  mk({ id: 'st-replay', type: 'story', title: 'Retry and replay operator console', points: 8, priority: 'medium', parent: 'e-infra', labels: ['ops'], created: at(-14) })
  mk({ id: 'bug-tz', type: 'bug', title: 'Timestamps shift by 5h30 in message log', points: 2, priority: 'low', parent: 'e-infra', labels: ['ops'], created: at(-6) })
  mk({ id: 'st-perf', type: 'story', title: 'Performance test harness (1,000 orders/hour)', points: 5, priority: 'low', parent: 'e-infra', labels: ['ops', 'quality'], created: at(-5) })
  mk({ id: 'st-relnotes', type: 'story', title: 'Automated release notes from sprint items', points: 3, priority: 'low', parent: 'e-infra', labels: ['ops'], created: at(-2) })

  const project: Project = {
    id: projectId,
    key: 'EMI',
    name: 'ERP–MES Integration',
    description: 'Inbound and outbound interfaces between the ERP (SAP) and the shop-floor MES for the Nashik plant.',
    columns: DEFAULT_COLUMNS,
    memberIds: members.map((m) => m.id),
    nextNumber: n,
    sprintLengthDays: 14,
    createdAt: at(-45),
    updatedAt: at(-1),
  }

  const comments: Comment[] = [
    { id: 'c1', itemId: 'st-stock', authorId: 'm-eshan', body: 'Dev is complete; blocked on QA test data. Raised ticket with the basis team on ' + day(-2) + '.', createdAt: at(-2, 11) },
    { id: 'c2', itemId: 'st-stock', authorId: 'm-arun', body: 'Escalated to the SAP lead in today\'s call — ETA end of week.', createdAt: at(-1, 12) },
    { id: 'c3', itemId: 'st-mo', authorId: 'm-bhavna', body: 'Merge logic passes all 42 sample orders. Retry path next.', createdAt: at(-3, 16) },
    { id: 'c4', itemId: 'bug-alt', authorId: 'm-farah', body: 'Fix is in review; added regression case for zero-quantity alternates.', createdAt: at(-1, 15) },
  ]

  const activities: Activity[] = items.map((i) => ({ id: 'a-' + i.id, projectId, itemId: i.id, actorId: i.reporterId, kind: 'created' as const, at: i.createdAt }))
  activities.push(
    { id: 'a-x1', projectId, itemId: 'st-stock', actorId: 'm-eshan', kind: 'blocked', to: 'Waiting for SAP QA test data from the basis team', at: at(-2, 10) },
    { id: 'a-x2', projectId, itemId: 'st-mo', actorId: 'm-bhavna', kind: 'status', field: 'status', from: 'todo', to: 'inprogress', at: at(-7) },
    { id: 'a-x3', projectId, itemId: 'bug-hot', actorId: 'm-chetan', kind: 'sprint', field: 'sprintId', to: 's3', at: at(-3, 9) },
    { id: 'a-x4', projectId, itemId: 'bug-hot', actorId: 'm-chetan', kind: 'status', field: 'status', from: 'inprogress', to: 'done', at: at(-2) },
    { id: 'a-x5', projectId, itemId: 'st-mon', actorId: 'm-eshan', kind: 'status', field: 'status', from: 'testing', to: 'done', at: at(-6) },
  )

  const standups: StandupEntry[] = []
  const su = (memberId: string, n: number, yesterday: string, today: string, blockers = '') => {
    standups.push({ id: `su-${memberId}-${n}`, projectId, sprintId: 's3', memberId, date: day(n), yesterday, today, blockers, createdAt: at(n, 9), updatedAt: at(n, 9) })
  }
  su('m-bhavna', -2, 'Finished staging tables and merge logic for MO.', 'Start publish-to-MES with retry.')
  su('m-bhavna', -1, 'Retry wrapper drafted, 42 sample orders pass.', 'Wire retry into the publisher, hand over to Farah for tests.')
  su('m-bhavna', 0, 'Retry wired; two edge cases left.', 'Close out edge cases, then MO is code-complete.')
  su('m-chetan', -2, 'Shipped the MO date-format hotfix.', 'Start order-confirmation BAPI call.', '')
  su('m-chetan', -1, 'BAPI call working in DEV.', 'Idempotency key + error mapping.', '')
  su('m-chetan', 0, 'Idempotency done.', 'Error mapping and QA deployment.', 'Need QA deployment slot from Arun.')
  su('m-eshan', -2, 'Stock posting dev complete.', 'Waiting on SAP QA test data; helping Farah with regression.', 'SAP QA test data not available.')
  su('m-eshan', -1, 'Paired with Farah on BOM regression.', 'Chase basis team; prepare Sprint 4 goods-receipt design.', 'Still no SAP QA test data.')
  su('m-eshan', 0, 'Goods-receipt design drafted.', 'Retest stock posting once data arrives.', 'SAP QA test data — escalated.')
  su('m-farah', -1, 'Alternate-item bug fixed, in review.', 'Regression suite for BOM.', '')
  su('m-farah', 0, 'Regression suite green.', 'MO unit tests once Bhavna hands over.', '')

  const retroNotes: RetroNote[] = [
    { id: 'rn1', sprintId: 's2', category: 'well', text: 'BOM interface delivered with all alternates on the first QA pass.', authorId: 'm-chetan', votes: 4, createdAt: at(-9) },
    { id: 'rn2', sprintId: 's2', category: 'well', text: 'Pairing on the UoM bug fixed it in a day.', authorId: 'm-farah', votes: 2, createdAt: at(-9) },
    { id: 'rn3', sprintId: 's2', category: 'improve', text: 'Monitoring dashboard slipped because environment access came late.', authorId: 'm-eshan', votes: 3, createdAt: at(-9) },
    { id: 'rn4', sprintId: 's2', category: 'improve', text: 'Too many mid-sprint requests from stakeholders.', authorId: 'm-bhavna', votes: 3, createdAt: at(-9) },
    { id: 'rn5', sprintId: 's2', category: 'ideas', text: 'Create an environment-readiness checklist before sprint start.', authorId: 'm-arun', votes: 5, createdAt: at(-9) },
    { id: 'rn6', sprintId: 's1', category: 'well', text: 'CI pipeline ready on day 2.', authorId: 'm-arun', votes: 3, createdAt: at(-23) },
    { id: 'rn7', sprintId: 's1', category: 'improve', text: 'Logging framework was underestimated (5 SP → carried over).', authorId: 'm-eshan', votes: 2, createdAt: at(-23) },
  ]
  const retroActions: RetroAction[] = [
    { id: 'ra1', projectId, sprintId: 's1', description: 'Add an estimation checklist for infrastructure stories.', ownerId: 'm-arun', dueDate: day(-15), status: 'done', createdAt: at(-23) },
    { id: 'ra2', projectId, sprintId: 's2', description: 'Environment-readiness checklist reviewed at sprint planning.', ownerId: 'm-arun', dueDate: day(-1), status: 'done', createdAt: at(-9) },
    { id: 'ra3', projectId, sprintId: 's2', description: 'Route all stakeholder requests through the Product Owner (Deepa) — no direct asks to developers.', ownerId: 'm-deepa', dueDate: day(4), status: 'open', createdAt: at(-9) },
    { id: 'ra4', projectId, sprintId: 's2', description: 'Request SAP QA test data at least one sprint ahead.', ownerId: 'm-eshan', dueDate: day(6), status: 'open', createdAt: at(-9) },
  ]

  const notifications: Notification[] = [
    { id: 'n1', kind: 'blocker', text: 'Stock posting bidirectional with ACK loop is blocked: Waiting for SAP QA test data', itemId: 'st-stock', read: false, at: at(-2, 10) },
    { id: 'n2', kind: 'comment', text: 'Arun Mehta commented on Stock posting bidirectional with ACK loop', itemId: 'st-stock', read: false, at: at(-1, 12) },
    { id: 'n3', kind: 'due', text: 'Stock posting bidirectional with ACK loop is due ' + day(2), itemId: 'st-stock', read: true, at: at(0, 8) },
    { id: 'n4', kind: 'sprint', text: 'Sprint 3 ends in 5 days', read: true, at: at(0, 8) },
  ]

  const settings: Settings = { id: 'app', orgName: 'Acme Software', theme: 'system', currentProjectId: projectId, currentMemberId: 'm-arun', seeded: true }

  return { members, projects: [project], items, sprints, comments, activities, standups, retroNotes, retroActions, notifications, settings }
}
