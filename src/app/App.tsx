import { useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { useStore } from '../data/store'
import { Layout } from './Layout'
import { Toaster, ConfirmDialog } from '../ui/Toaster'
import { Dashboard } from '../pages/Dashboard'
import { Backlog } from '../pages/Backlog'
import { Sprints } from '../pages/Sprints'
import { Board } from '../pages/Board'
import { Standup } from '../pages/Standup'
import { Reports } from '../pages/Reports'
import { Retro } from '../pages/Retro'
import { Team } from '../pages/Team'
import { Projects } from '../pages/Projects'
import { SettingsPage } from '../pages/SettingsPage'
import { Shared } from '../pages/Shared'
import { AssistantPanel } from './AssistantPanel'

function useTheme() {
  const theme = useStore((s) => s.settings.theme)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

export default function App() {
  const ready = useStore((s) => s.ready)
  const boot = useStore((s) => s.boot)
  useEffect(() => {
    boot().catch((e) => console.error('boot failed', e))
  }, [boot])
  useTheme()

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        <div className="animate-pulse">Loading ScrumFlow…</div>
      </div>
    )
  }

  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/backlog" element={<Backlog />} />
          <Route path="/sprints" element={<Sprints />} />
          <Route path="/board" element={<Board />} />
          <Route path="/standup" element={<Standup />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/retro" element={<Retro />} />
          <Route path="/team" element={<Team />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/shared/:id?" element={<Shared />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </Layout>
      <AssistantPanel />
      <Toaster />
      <ConfirmDialog />
    </HashRouter>
  )
}
