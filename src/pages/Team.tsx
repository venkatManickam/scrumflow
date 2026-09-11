import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, UserMinus, UserPlus, Users } from 'lucide-react'
import { useStore } from '../data/store'
import { useActiveSprint, useCurrentProject, useProjectItems } from '../data/hooks'
import type { Member, Role } from '../domain/types'
import { ROLES, ROLE_LABEL } from '../domain/types'
import { workload, pct } from '../domain/metrics'
import { Avatar, Card, EmptyState, Field, KPI, Modal, PageHeader, Progress } from '../ui/primitives'
import { confirmDialog } from '../ui/confirm'
import { toast } from '../ui/toast'

const ROLE_HELP: Record<Role, string> = {
  admin: 'Manages the organization, people, projects and settings. Full access.',
  po: 'Owns the product backlog: writes and prioritises epics and stories, sets sprint goals.',
  sm: 'Runs the ceremonies, tracks blockers, keeps the board honest and reads the reports.',
  dev: 'Delivers the work: updates tasks, comments, logs stand-ups, estimates.',
  stakeholder: 'Reads progress, reports and the roadmap. Does not edit work.',
}

export function Team() {
  const project = useCurrentProject()
  const items = useProjectItems(project?.id)
  const sprint = useActiveSprint(project?.id)
  const members = useStore((s) => s.members)
  const addMember = useStore((s) => s.addMember)
  const updateMember = useStore((s) => s.updateMember)
  const removeMember = useStore((s) => s.removeMember)
  const updateProject = useStore((s) => s.updateProject)
  const [addOpen, setAddOpen] = useState(false)

  const inProject = useMemo(() => (project ? members.filter((m) => project.memberIds.includes(m.id)) : members), [members, project])
  const outside = useMemo(() => (project ? members.filter((m) => !project.memberIds.includes(m.id)) : []), [members, project])
  const load = useMemo(() => workload(sprint, items, inProject), [sprint, items, inProject])
  const loadOf = (id: string) => load.find((r) => r.member.id === id)
  const openCount = (id: string) => items.filter((i) => i.assigneeId === id && i.type !== 'epic' && i.status !== 'done').length

  const totalCapacity = inProject.filter((m) => m.active).reduce((a, m) => a + m.capacity, 0)
  const assigned = load.reduce((a, r) => a + r.assigned, 0)

  const remove = async (m: Member) => {
    const ok = await confirmDialog({ title: `Remove ${m.name}?`, message: 'They are removed from every project and their items become unassigned.', confirmLabel: 'Remove', danger: true })
    if (!ok) return
    removeMember(m.id)
    toast(`${m.name} removed`)
  }

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle={project ? `${inProject.length} member${inProject.length === 1 ? '' : 's'} in ${project.name}` : 'All members'}
        actions={
          <button className="btn-primary btn-sm" onClick={() => setAddOpen(true)}>
            <Plus size={14} /> Add member
          </button>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <KPI label="Capacity per sprint" value={`${totalCapacity} SP`} hint={`${inProject.filter((m) => m.active).length} active members`} />
        <KPI label={sprint ? `Assigned in ${sprint.name}` : 'Assigned'} value={`${assigned} SP`} hint={sprint ? sprint.goal || undefined : 'no active sprint'} />
        <KPI label="Utilisation" value={`${pct(assigned, totalCapacity)}%`} tone={assigned > totalCapacity ? 'bad' : assigned > totalCapacity * 0.85 ? 'warn' : 'good'} hint={assigned > totalCapacity ? 'over capacity' : 'of team capacity'} />
      </div>

      {members.length === 0 ? (
        <EmptyState icon={<Users />} title="No members yet" hint="Add the people who work on your projects." action={<button className="btn-primary btn-sm" onClick={() => setAddOpen(true)}>Add member</button>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {inProject.map((m) => {
            const l = loadOf(m.id)
            const util = l?.utilization
            return (
              <div key={m.id} className={`card p-4 ${m.active ? '' : 'opacity-60'}`}>
                <div className="flex items-start gap-3">
                  <Avatar member={m} size="lg" />
                  <div className="min-w-0 flex-1">
                    <input className="w-full bg-transparent text-sm font-semibold focus:outline-none" defaultValue={m.name} key={m.id + m.name} onBlur={(e) => e.target.value.trim() && e.target.value !== m.name && updateMember(m.id, { name: e.target.value.trim() })} />
                    <input className="w-full bg-transparent text-xs text-slate-500 focus:outline-none" placeholder="email" defaultValue={m.email ?? ''} key={m.id + (m.email ?? '')} onBlur={(e) => e.target.value !== (m.email ?? '') && updateMember(m.id, { email: e.target.value || undefined })} />
                  </div>
                  <label className="flex items-center gap-1 text-[11px] text-slate-500">
                    <input type="checkbox" checked={m.active} onChange={(e) => updateMember(m.id, { active: e.target.checked })} /> Active
                  </label>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Field label="Role">
                    <select className="input input-sm" value={m.role} onChange={(e) => updateMember(m.id, { role: e.target.value as Role })}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Capacity / sprint">
                    <input className="input input-sm" type="number" min={0} defaultValue={m.capacity} key={m.id + m.capacity} onBlur={(e) => Number(e.target.value) !== m.capacity && updateMember(m.id, { capacity: Math.max(0, Number(e.target.value) || 0) })} />
                  </Field>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{sprint ? `${sprint.name} load` : 'Open load'}</span>
                    <span>
                      {l?.assigned ?? 0} / {m.capacity || '—'} SP{util !== null && util !== undefined ? ` · ${Math.round(util * 100)}%` : ''}
                    </span>
                  </div>
                  <Progress value={l?.assigned ?? 0} max={m.capacity || Math.max(l?.assigned ?? 0, 1)} tone={util !== null && util !== undefined && util > 1.05 ? 'bad' : util !== null && util !== undefined && util > 0.85 ? 'warn' : 'good'} className="mt-1" />
                  <div className="mt-1 text-[11px] text-slate-500">
                    {openCount(m.id)} open item{openCount(m.id) === 1 ? '' : 's'}
                    {l ? ` · ${l.done} SP done this sprint` : ''}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
                  {project && (
                    <button className="btn-ghost btn-sm" onClick={() => updateProject(project.id, { memberIds: project.memberIds.filter((x) => x !== m.id) })}>
                      <UserMinus size={14} /> Remove from project
                    </button>
                  )}
                  <button className="btn-ghost btn-sm text-red-600" onClick={() => remove(m)}>
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {outside.length > 0 && project && (
        <Card title="Not in this project" className="mt-5">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {outside.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
                <Avatar member={m} size="sm" />
                <span className="min-w-0 flex-1 truncate">
                  {m.name} <span className="text-xs text-slate-500">· {ROLE_LABEL[m.role]}</span>
                </span>
                <button className="btn-secondary btn-sm" onClick={() => updateProject(project.id, { memberIds: [...project.memberIds, m.id] })}>
                  <UserPlus size={14} /> Add to project
                </button>
                <button className="btn-ghost btn-sm text-red-600" onClick={() => remove(m)} aria-label="Delete member">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Roles" className="mt-5">
        <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2 xl:grid-cols-5">
          {ROLES.map((r) => (
            <div key={r}>
              <dt className="font-semibold">{ROLE_LABEL[r]}</dt>
              <dd className="text-xs text-slate-500">{ROLE_HELP[r]}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {!project && members.length > 0 && (
        <p className="mt-4 text-xs text-slate-500">
          No project selected — <Link to="/projects" className="text-brand-600 hover:underline">open a project</Link> to see sprint load.
        </p>
      )}

      <AddMemberModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={(m) => {
          const row = addMember(m)
          if (project) updateProject(project.id, { memberIds: [...project.memberIds, row.id] })
          toast(`${row.name} added`, 'success')
        }}
      />
    </div>
  )
}

function AddMemberModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (m: { name: string; email?: string; role: Role; capacity: number; active: boolean }) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('dev')
  const [capacity, setCapacity] = useState('10')
  const submit = () => {
    if (!name.trim()) {
      toast('Name is required', 'error')
      return
    }
    onAdd({ name: name.trim(), email: email.trim() || undefined, role, capacity: Math.max(0, Number(capacity) || 0), active: true })
    setName('')
    setEmail('')
    setRole('dev')
    setCapacity('10')
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add team member"
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit}>
            Add
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name">
          <input
            className="input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
          />
        </Field>
        <Field label="Email">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Role">
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Capacity (SP / sprint)">
            <input className="input" type="number" min={0} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}
