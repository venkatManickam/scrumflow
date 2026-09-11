import Dexie, { type EntityTable } from 'dexie'
import type { Activity, Comment, Member, Notification, Project, RetroAction, RetroNote, Settings, Sprint, StandupEntry, WorkItem } from '../domain/types'

export class ScrumFlowDB extends Dexie {
  members!: EntityTable<Member, 'id'>
  projects!: EntityTable<Project, 'id'>
  items!: EntityTable<WorkItem, 'id'>
  sprints!: EntityTable<Sprint, 'id'>
  comments!: EntityTable<Comment, 'id'>
  activities!: EntityTable<Activity, 'id'>
  standups!: EntityTable<StandupEntry, 'id'>
  retroNotes!: EntityTable<RetroNote, 'id'>
  retroActions!: EntityTable<RetroAction, 'id'>
  notifications!: EntityTable<Notification, 'id'>
  settings!: EntityTable<Settings, 'id'>

  constructor(name = 'scrumflow') {
    super(name)
    this.version(1).stores({
      members: 'id, name',
      projects: 'id, key',
      items: 'id, projectId, sprintId, parentId, status, assigneeId',
      sprints: 'id, projectId, status',
      comments: 'id, itemId',
      activities: 'id, projectId, itemId, at',
      standups: 'id, projectId, memberId, date',
      retroNotes: 'id, sprintId',
      retroActions: 'id, projectId, sprintId',
      notifications: 'id, memberId, at',
      settings: 'id',
    })
  }
}

export const db = new ScrumFlowDB()

export const TABLES = ['members', 'projects', 'items', 'sprints', 'comments', 'activities', 'standups', 'retroNotes', 'retroActions', 'notifications', 'settings'] as const
export type TableName = (typeof TABLES)[number]

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}
