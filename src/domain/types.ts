export type ID = string

export type Role = 'admin' | 'po' | 'sm' | 'dev' | 'stakeholder'
export const ROLES: Role[] = ['admin', 'po', 'sm', 'dev', 'stakeholder']
export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Organization Admin',
  po: 'Product Owner',
  sm: 'Scrum Master',
  dev: 'Developer',
  stakeholder: 'Stakeholder',
}

export type ItemType = 'epic' | 'story' | 'task' | 'bug'
export const ITEM_TYPES: ItemType[] = ['epic', 'story', 'task', 'bug']
export const ITEM_TYPE_LABEL: Record<ItemType, string> = { epic: 'Epic', story: 'Story', task: 'Task', bug: 'Bug' }

export type Status = 'backlog' | 'todo' | 'inprogress' | 'review' | 'testing' | 'blocked' | 'done'
export const STATUSES: Status[] = ['backlog', 'todo', 'inprogress', 'review', 'testing', 'blocked', 'done']
export const STATUS_LABEL: Record<Status, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  inprogress: 'In Progress',
  review: 'Code Review',
  testing: 'Testing',
  blocked: 'Blocked',
  done: 'Done',
}
/** Statuses that count as "work has started" for cycle-time purposes. */
export const STARTED_STATUSES: Status[] = ['inprogress', 'review', 'testing', 'blocked']

export type Priority = 'critical' | 'high' | 'medium' | 'low'
export const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low']
export const PRIORITY_LABEL: Record<Priority, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }

export type SprintStatus = 'planned' | 'active' | 'completed'

export interface Member {
  id: ID
  name: string
  email?: string
  role: Role
  /** Story points this member can normally take in one sprint. */
  capacity: number
  color: string
  active: boolean
  createdAt: string
}

export interface BoardColumn {
  id: ID
  name: string
  status: Status
  /** Work-in-progress limit (cards), undefined = unlimited. */
  wip?: number
}

export interface Project {
  id: ID
  key: string
  name: string
  description: string
  columns: BoardColumn[]
  memberIds: ID[]
  nextNumber: number
  sprintLengthDays: number
  createdAt: string
  updatedAt: string
}

export interface WorkItem {
  id: ID
  projectId: ID
  number: number
  type: ItemType
  title: string
  description: string
  status: Status
  priority: Priority
  assigneeId?: ID
  reporterId?: ID
  points?: number
  sprintId?: ID
  /** ISO timestamp of when the item joined its current sprint (scope-change tracking). */
  sprintAddedAt?: string
  /** Epic for stories/bugs, story for tasks. */
  parentId?: ID
  labels: string[]
  dueDate?: string
  rank: number
  blocked: boolean
  blockedReason?: string
  dependsOn: ID[]
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
}

export interface Sprint {
  id: ID
  projectId: ID
  name: string
  goal: string
  startDate: string
  endDate: string
  status: SprintStatus
  /** Planned capacity in story points for the whole team. */
  capacity: number
  /** Snapshot taken when the sprint starts. */
  committedPoints?: number
  /** Snapshot taken when the sprint completes. */
  completedPoints?: number
  createdAt: string
  updatedAt: string
}

export interface Comment {
  id: ID
  itemId: ID
  authorId?: ID
  body: string
  createdAt: string
}

export type ActivityKind = 'created' | 'updated' | 'commented' | 'deleted' | 'sprint' | 'status' | 'assignee' | 'points' | 'priority' | 'blocked'
export interface Activity {
  id: ID
  projectId: ID
  itemId?: ID
  actorId?: ID
  kind: ActivityKind
  field?: string
  from?: string
  to?: string
  at: string
}

export interface StandupEntry {
  id: ID
  projectId: ID
  sprintId?: ID
  memberId: ID
  /** yyyy-MM-dd */
  date: string
  yesterday: string
  today: string
  blockers: string
  createdAt: string
  updatedAt: string
}

export type RetroCategory = 'well' | 'improve' | 'ideas'
export const RETRO_CATEGORIES: RetroCategory[] = ['well', 'improve', 'ideas']
export const RETRO_CATEGORY_LABEL: Record<RetroCategory, string> = { well: 'What went well', improve: "What didn't go well", ideas: 'Ideas' }
export interface RetroNote {
  id: ID
  sprintId: ID
  category: RetroCategory
  text: string
  authorId?: ID
  votes: number
  createdAt: string
}

export interface RetroAction {
  id: ID
  projectId: ID
  sprintId: ID
  description: string
  ownerId?: ID
  dueDate?: string
  status: 'open' | 'done'
  createdAt: string
}

export interface Notification {
  id: ID
  memberId?: ID
  kind: 'assignment' | 'comment' | 'due' | 'sprint' | 'blocker' | 'overdue' | 'mention'
  text: string
  itemId?: ID
  read: boolean
  at: string
}

export interface Settings {
  id: 'app'
  orgName: string
  theme: 'light' | 'dark' | 'system'
  currentProjectId?: ID
  currentMemberId?: ID
  seeded: boolean
}

export const DEFAULT_COLUMNS: BoardColumn[] = [
  { id: 'c-todo', name: 'To Do', status: 'todo' },
  { id: 'c-inprogress', name: 'In Progress', status: 'inprogress', wip: 4 },
  { id: 'c-review', name: 'Code Review', status: 'review' },
  { id: 'c-testing', name: 'Testing', status: 'testing' },
  { id: 'c-blocked', name: 'Blocked', status: 'blocked' },
  { id: 'c-done', name: 'Done', status: 'done' },
]

export function itemKey(project: Pick<Project, 'key'> | undefined, item: Pick<WorkItem, 'number'>): string {
  return `${project?.key ?? '?'}-${item.number}`
}
