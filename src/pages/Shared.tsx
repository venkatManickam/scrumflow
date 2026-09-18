import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Lock, RefreshCw, Share2, Unlock } from 'lucide-react'
import { useStore } from '../data/store'
import { create } from 'zustand'
import type { Snapshot } from '../data/store'
import { decryptWorkspace, WrongPassphraseError, type EncryptedWorkspace } from '../data/crypto'
import { Card, EmptyState, Field, PageHeader } from '../ui/primitives'
import { confirmDialog } from '../ui/confirm'
import { toast } from '../ui/toast'
import { niceDate } from '../domain/dates'

/** A workspace published with the site as an encrypted file under public/shared/ (see tools/encrypt-workspace.mjs). */
export interface SharedWorkspaceEntry {
  id: string
  name: string
  description?: string
  file: string
  updatedAt: string
  stats?: { projects: number; items: number; members: number; sprints: number }
}

const sharedBase = () => (import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/') + 'shared/'

export const useShared = create<{ loaded: boolean; workspaces: SharedWorkspaceEntry[]; load: () => Promise<void> }>((set, get) => ({
  loaded: false,
  workspaces: [],
  load: async () => {
    if (get().loaded) return
    try {
      const r = await fetch(`${sharedBase()}index.json?t=${Date.now()}`, { cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      const j = (await r.json()) as { workspaces?: SharedWorkspaceEntry[] }
      set({ loaded: true, workspaces: Array.isArray(j.workspaces) ? j.workspaces : [] })
    } catch {
      set({ loaded: true, workspaces: [] })
    }
  },
}))

async function unlockSharedWorkspace(entry: SharedWorkspaceEntry, passphrase: string): Promise<Snapshot> {
  const r = await fetch(`${sharedBase()}${entry.file}?t=${Date.now()}`, { cache: 'no-store' })
  if (!r.ok) throw new Error(`Could not download ${entry.file} (${r.status})`)
  return decryptWorkspace<Snapshot>((await r.json()) as EncryptedWorkspace, passphrase)
}

export function Shared() {
  const { id } = useParams()
  const nav = useNavigate()
  const { workspaces, loaded, load } = useShared()
  const importSnapshot = useStore((s) => s.importSnapshot)
  const items = useStore((s) => s.items)
  const orgName = useStore((s) => s.settings.orgName)
  const [selected, setSelected] = useState<string | undefined>(id)
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    if (id) setSelected(id)
  }, [id])

  const entry: SharedWorkspaceEntry | undefined = workspaces.find((w) => w.id === (selected ?? workspaces[0]?.id))

  const unlock = async () => {
    if (!entry || !passphrase) return
    setBusy(true)
    setError(undefined)
    try {
      const snap = await unlockSharedWorkspace(entry, passphrase)
      const hasData = items.length > 0
      const ok = !hasData || (await confirmDialog({ title: `Replace "${orgName}" with "${entry.name}"?`, message: 'Everything currently in this browser (edits, stand-ups, retros) will be replaced by the shared workspace. Download a backup from Settings first if you want to keep it.', confirmLabel: 'Load shared workspace', danger: true }))
      if (!ok) return
      await importSnapshot(snap)
      toast(`${entry.name} loaded`, 'success')
      nav('/')
    } catch (e) {
      setError(e instanceof WrongPassphraseError ? 'Wrong passphrase — check with the person who shared the link.' : e instanceof Error ? e.message : 'Could not load the workspace')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Shared workspaces" subtitle="Team data published with this site, encrypted. Unlock it with the team passphrase to load it into this browser." />
      {!loaded ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : workspaces.length === 0 ? (
        <EmptyState icon={<Share2 />} title="No shared workspaces published" hint="A maintainer can add one with tools/encrypt-workspace.mjs and redeploy the site." />
      ) : (
        <div className="grid gap-4 md:grid-cols-[1fr_320px]">
          <Card title="Available">
            <ul className="space-y-2">
              {workspaces.map((w) => (
                <li key={w.id}>
                  <button className={`w-full rounded-lg border p-3 text-left transition ${entry?.id === w.id ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'}`} onClick={() => setSelected(w.id)}>
                    <div className="flex items-center gap-2">
                      <Lock size={14} className="text-slate-400" />
                      <span className="font-semibold">{w.name}</span>
                      <span className="ml-auto text-xs text-slate-500">updated {niceDate(w.updatedAt)}</span>
                    </div>
                    {w.description && <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{w.description}</div>}
                    {w.stats && (
                      <div className="mt-1 text-xs text-slate-500">
                        {w.stats.projects} projects · {w.stats.items} items · {w.stats.members} members · {w.stats.sprints} sprints
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Unlock">
            {entry ? (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  unlock()
                }}
              >
                <div className="text-sm font-medium">{entry.name}</div>
                <Field label="Team passphrase">
                  <input className="input" type="password" autoFocus autoComplete="off" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder="••••••••••••" />
                </Field>
                {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
                <button className="btn-primary w-full" type="submit" disabled={!passphrase || busy}>
                  {busy ? <RefreshCw size={14} className="animate-spin" /> : <Unlock size={14} />} {busy ? 'Decrypting…' : 'Unlock and load'}
                </button>
                <p className="text-xs text-slate-500">Decryption happens in your browser. The passphrase is never sent anywhere. Your edits stay local to this browser; re-open this page to reload the latest published copy.</p>
              </form>
            ) : (
              <div className="text-sm text-slate-500">Pick a workspace.</div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
