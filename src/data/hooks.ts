import { useMemo } from 'react'
import { useStore } from './store'
import type { ID, Member, Project, Sprint, WorkItem } from '../domain/types'
import { velocity } from '../domain/metrics'

export function useCurrentProject(): Project | undefined {
  const projects = useStore((s) => s.projects)
  const id = useStore((s) => s.settings.currentProjectId)
  return useMemo(() => projects.find((p) => p.id === id) ?? projects[0], [projects, id])
}

export function useProjectItems(projectId?: ID): WorkItem[] {
  const items = useStore((s) => s.items)
  return useMemo(() => (projectId ? items.filter((i) => i.projectId === projectId) : []), [items, projectId])
}

export function useProjectSprints(projectId?: ID): Sprint[] {
  const sprints = useStore((s) => s.sprints)
  return useMemo(() => (projectId ? sprints.filter((x) => x.projectId === projectId).sort((a, b) => a.startDate.localeCompare(b.startDate)) : []), [sprints, projectId])
}

export function useActiveSprint(projectId?: ID): Sprint | undefined {
  const sprints = useProjectSprints(projectId)
  return useMemo(() => sprints.find((x) => x.status === 'active'), [sprints])
}

export function useProjectMembers(project?: Project): Member[] {
  const members = useStore((s) => s.members)
  return useMemo(() => (project ? members.filter((m) => project.memberIds.includes(m.id)) : members), [members, project])
}

export function useMemberMap(): Map<ID, Member> {
  const members = useStore((s) => s.members)
  return useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
}

export function useVelocityHistory(projectId?: ID) {
  const sprints = useProjectSprints(projectId)
  const items = useProjectItems(projectId)
  return useMemo(() => velocity(sprints, items), [sprints, items])
}

export function useCurrentMember(): Member | undefined {
  const members = useStore((s) => s.members)
  const id = useStore((s) => s.settings.currentMemberId)
  return useMemo(() => members.find((m) => m.id === id), [members, id])
}
