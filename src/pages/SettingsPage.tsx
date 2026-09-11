import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database, Download, FileSpreadsheet, Sparkles, Trash2, Upload } from 'lucide-react'
import { useStore } from '../data/store'
import { useCurrentProject, useProjectItems, useProjectMembers, useProjectSprints } from '../data/hooks'
import { exportProjectExcel, exportSnapshotFile, previewExcelImport, readSnapshotFile, type ImportPreview } from '../data/io'
import type { Settings } from '../domain/types'
import { Card, Field, Modal, PageHeader } from '../ui/primitives'
import { confirmDialog } from '../ui/confirm'
import { toast } from '../ui/toast'

export function SettingsPage() {
  const nav = useNavigate()
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const exportSnapshot = useStore((s) => s.exportSnapshot)
  const importSnapshot = useStore((s) => s.importSnapshot)
  const loadDemo = useStore((s) => s.loadDemo)
  const resetAll = useStore((s) => s.resetAll)
  const addMember = useStore((s) => s.addMember)
  const createItems = useStore((s) => s.createItems)
  const standups = useStore((s) => s.standups)
  const retroActions = useStore((s) => s.retroActions)
  const project = useCurrentProject()
  const items = useProjectItems(project?.id)
  const sprints = useProjectSprints(project?.id)
  const members = useProjectMembers(project)

  const restoreRef = useRef<HTMLInputElement>(null)
  const excelRef = useRef<HTMLInputElement>(null)
  const [previews, setPreviews] = useState<ImportPreview[] | undefined>()
  const [busy, setBusy] = useState(false)

  const onRestore = async (file?: File) => {
    if (!file) return
    try {
      const snap = await readSnapshotFile(file)
      const ok = await confirmDialog({ title: 'Restore this backup?', message: `Everything in this browser will be replaced with the backup from ${snap.exportedAt ? new Date(snap.exportedAt).toLocaleString() : 'unknown date'} (${snap.projects?.length ?? 0} projects, ${snap.items?.length ?? 0} items).`, confirmLabel: 'Restore', danger: true })
      if (!ok) return
      await importSnapshot(snap)
      toast('Backup restored', 'success')
      nav('/')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not read backup', 'error')
    } finally {
      if (restoreRef.current) restoreRef.current.value = ''
    }
  }

  const onExcel = async (file?: File) => {
    if (!file || !project) return
    setBusy(true)
    try {
      const p = await previewExcelImport(file, project, members)
      if (!p.length) toast('No sheet with a Title / Activity / Summary column was found', 'error')
      else setPreviews(p)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not read the file', 'error')
    } finally {
      setBusy(false)
      if (excelRef.current) excelRef.current.value = ''
    }
  }

  const runImport = () => {
    if (!previews || !project) return
    const created = new Map<string, string>()
    const resolve = (assigneeId?: string) => {
      if (!assigneeId?.startsWith('__new__:')) return assigneeId
      const name = assigneeId.slice('__new__:'.length)
      const key = name.toLowerCase()
      if (!created.has(key)) {
        const m = addMember({ name, role: 'dev', capacity: 8, active: true })
        created.set(key, m.id)
      }
      return created.get(key)
    }
    const rows = previews.flatMap((p) => p.rows.map((r) => ({ ...r, assigneeId: resolve(r.assigneeId) })))
    const out = createItems(rows)
    if (created.size) {
      const proj = useStore.getState().projects.find((x) => x.id === project.id)
      if (proj) useStore.getState().updateProject(project.id, { memberIds: [...new Set([...proj.memberIds, ...created.values()])] })
    }
    toast(`Imported ${out.length} work item${out.length === 1 ? '' : 's'}${created.size ? ` and ${created.size} new member${created.size === 1 ? '' : 's'}` : ''}`, 'success')
    setPreviews(undefined)
    nav('/backlog')
  }

  const demo = async () => {
    const ok = await confirmDialog({ title: 'Load the demo workspace?', message: 'This replaces everything currently stored in this browser with the fictional Acme Software workspace. Download a backup first if you need your data.', confirmLabel: 'Load demo' })
    if (!ok) return
    await loadDemo()
    toast('Demo workspace loaded', 'success')
    nav('/')
  }
  const erase = async () => {
    const ok = await confirmDialog({ title: 'Erase all data?', message: 'Every project, item, sprint, stand-up and retro in this browser will be deleted. This cannot be undone.', confirmLabel: 'Erase everything', danger: true })
    if (!ok) return
    await resetAll()
    toast('All data erased')
    nav('/projects')
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Organization, appearance and your data" />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card title="Organization">
          <Field label="Organization name">
            <input className="input" defaultValue={settings.orgName} key={settings.orgName} onBlur={(e) => e.target.value.trim() && e.target.value !== settings.orgName && updateSettings({ orgName: e.target.value.trim() })} />
          </Field>
          <div className="mt-4">
            <div className="label">Theme</div>
            <div className="flex gap-3">
              {(['light', 'dark', 'system'] as Settings['theme'][]).map((t) => (
                <label key={t} className="flex items-center gap-1.5 text-sm capitalize">
                  <input type="radio" name="theme" checked={settings.theme === t} onChange={() => updateSettings({ theme: t })} /> {t}
                </label>
              ))}
            </div>
          </div>
        </Card>

        <Card title="About">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Version</dt>
              <dd className="font-mono">1.0.0</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Source</dt>
              <dd>
                <a className="text-brand-600 hover:underline" href="https://github.com/venkatManickam/scrumflow" target="_blank" rel="noreferrer">
                  github.com/venkatManickam/scrumflow
                </a>
              </dd>
            </div>
          </dl>
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">All data stays in this browser's IndexedDB; nothing is sent anywhere. Use backups to move between devices.</p>
          <div className="mt-3">
            <div className="label">Keyboard shortcuts</div>
            <ul className="space-y-1 text-xs">
              <li>
                <span className="kbd">Ctrl</span> + <span className="kbd">K</span> — search / jump anywhere
              </li>
              <li>
                <span className="kbd">N</span> — new work item
              </li>
              <li>
                <span className="kbd">Esc</span> — close dialog or drawer
              </li>
            </ul>
          </div>
        </Card>

        <Card title="Backup & restore" className="xl:col-span-2">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Database size={16} /> Full backup (.json)
              </div>
              <p className="mb-2 mt-1 text-xs text-slate-500">Everything — all projects, members, items, sprints, stand-ups, retros.</p>
              <div className="flex gap-2">
                <button className="btn-secondary btn-sm" onClick={() => exportSnapshotFile(exportSnapshot())}>
                  <Download size={14} /> Download backup
                </button>
                <button className="btn-secondary btn-sm" onClick={() => restoreRef.current?.click()}>
                  <Upload size={14} /> Restore backup
                </button>
                <input ref={restoreRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onRestore(e.target.files?.[0])} />
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <FileSpreadsheet size={16} /> Excel
              </div>
              <p className="mb-2 mt-1 text-xs text-slate-500">{project ? `Export ${project.key} to a workbook, or import work items from Excel/CSV (ScrumFlow export, Jira-style columns, or a simple Activity / Owner / Status / ETA tracker).` : 'Open a project to export or import.'}</p>
              <div className="flex gap-2">
                <button className="btn-secondary btn-sm" disabled={!project} onClick={() => project && exportProjectExcel(project, items, sprints, members, standups.filter((s) => s.projectId === project.id), retroActions.filter((r) => r.projectId === project.id))}>
                  <Download size={14} /> Export project
                </button>
                <button className="btn-secondary btn-sm" disabled={!project || busy} onClick={() => excelRef.current?.click()}>
                  <Upload size={14} /> {busy ? 'Reading…' : 'Import work items'}
                </button>
                <input ref={excelRef} type="file" accept=".xlsx,.xlsm,.xls,.csv" className="hidden" onChange={(e) => onExcel(e.target.files?.[0])} />
              </div>
            </div>
          </div>
        </Card>

        <Card title="Danger zone" className="xl:col-span-2">
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary btn-sm" onClick={demo}>
              <Sparkles size={14} /> Load demo workspace
            </button>
            <button className="btn-danger btn-sm" onClick={erase}>
              <Trash2 size={14} /> Erase all data
            </button>
          </div>
        </Card>
      </div>

      <Modal
        open={!!previews}
        onClose={() => setPreviews(undefined)}
        title="Import preview"
        size="xl"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setPreviews(undefined)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={runImport}>
              Import {previews?.reduce((a, p) => a + p.rows.length, 0) ?? 0} items
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {previews?.map((p) => (
            <div key={p.sheet}>
              <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{p.sheet}</span>
                <span className="text-xs text-slate-500">
                  {p.rows.length} row{p.rows.length === 1 ? '' : 's'}
                  {p.skipped ? ` · ${p.skipped} empty skipped` : ''}
                </span>
                {p.newMembers.length > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">New members: {p.newMembers.join(', ')}</span>}
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-left dark:bg-slate-800/60">
                    <tr>
                      <th className="px-2 py-1">Type</th>
                      <th className="px-2 py-1">Title</th>
                      <th className="px-2 py-1">Status</th>
                      <th className="px-2 py-1">Priority</th>
                      <th className="px-2 py-1">SP</th>
                      <th className="px-2 py-1">Assignee</th>
                      <th className="px-2 py-1">Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.rows.slice(0, 10).map((r, i) => (
                      <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-2 py-1 capitalize">{r.type}</td>
                        <td className="max-w-[320px] truncate px-2 py-1">{r.title}</td>
                        <td className="px-2 py-1">{r.status}</td>
                        <td className="px-2 py-1">{r.priority}</td>
                        <td className="px-2 py-1">{r.points ?? ''}</td>
                        <td className="px-2 py-1">{r.assigneeId?.startsWith('__new__:') ? `${r.assigneeId.slice(8)} (new)` : members.find((m) => m.id === r.assigneeId)?.name ?? ''}</td>
                        <td className="px-2 py-1">{r.dueDate ?? ''}</td>
                      </tr>
                    ))}
                    {p.rows.length > 10 && (
                      <tr className="border-t border-slate-100 dark:border-slate-800">
                        <td colSpan={7} className="px-2 py-1 text-slate-500">
                          … {p.rows.length - 10} more
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}
