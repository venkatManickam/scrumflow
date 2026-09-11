import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { BarChart3, Bell, CalendarRange, FolderKanban, KanbanSquare, LayoutDashboard, ListTodo, Menu, Mic, Moon, Plus, RotateCcw, Search, Settings, Sun, Users, X, Zap } from 'lucide-react'
import { useStore } from '../data/store'
import { useCurrentProject, useCurrentMember } from '../data/hooks'
import { Avatar } from '../ui/primitives'
import { CommandPalette } from './CommandPalette'
import { ItemForm } from './ItemForm'
import { ItemDrawer } from './ItemDrawer'
import { useItemDrawer } from './useItemDrawer'
import { formatDistanceToNow, parseISO } from 'date-fns'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/backlog', label: 'Backlog', icon: ListTodo },
  { to: '/sprints', label: 'Sprints', icon: CalendarRange },
  { to: '/board', label: 'Board', icon: KanbanSquare },
  { to: '/standup', label: 'Stand-up', icon: Mic },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/retro', label: 'Retrospective', icon: RotateCcw },
  { to: '/team', label: 'Team', icon: Users },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Layout({ children }: { children: ReactNode }) {
  const project = useCurrentProject()
  const projects = useStore((s) => s.projects)
  const members = useStore((s) => s.members)
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const setCurrentProject = useStore((s) => s.setCurrentProject)
  const me = useCurrentMember()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()
  const drawer = useItemDrawer()

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      } else if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'n' && !paletteOpen && !drawer.itemId) {
        e.preventDefault()
        setNewOpen(true)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [paletteOpen, drawer.itemId])

  useEffect(() => setNavOpen(false), [location.pathname])

  const isDark = useMemo(() => document.documentElement.classList.contains('dark'), [settings.theme])
  const toggleTheme = () => updateSettings({ theme: isDark ? 'light' : 'dark' })

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className={clsx('fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-slate-200 bg-white transition-transform dark:border-slate-800 dark:bg-slate-900 lg:static lg:translate-x-0', navOpen ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex h-14 items-center gap-2 border-b border-slate-100 px-4 dark:border-slate-800">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Zap size={16} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold tracking-tight">ScrumFlow</div>
            <div className="truncate text-[10px] text-slate-500">{settings.orgName}</div>
          </div>
          <button className="btn-ghost btn-sm ml-auto lg:hidden" onClick={() => setNavOpen(false)} aria-label="Close menu">
            <X size={16} />
          </button>
        </div>
        <div className="px-3 pt-3">
          <label className="label">Project</label>
          <select className="input input-sm" value={project?.id ?? ''} onChange={(e) => setCurrentProject(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.key} · {p.name}
              </option>
            ))}
            {projects.length === 0 && <option value="">No projects</option>}
          </select>
        </div>
        <nav className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-2">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                clsx('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition', isActive ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-3 dark:border-slate-800">
          <label className="label">Acting as</label>
          <div className="flex items-center gap-2">
            <Avatar member={me} size="sm" />
            <select className="input input-sm" value={settings.currentMemberId ?? ''} onChange={(e) => updateSettings({ currentMemberId: e.target.value || undefined })}>
              <option value="">— nobody —</option>
              {members.filter((m) => m.active).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </aside>
      {navOpen && <div className="fixed inset-0 z-20 bg-slate-900/40 lg:hidden" onClick={() => setNavOpen(false)} />}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
          <button className="btn-ghost btn-sm lg:hidden" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <Menu size={18} />
          </button>
          <button className="btn-secondary btn-sm hidden min-w-[220px] justify-start text-slate-500 sm:inline-flex" onClick={() => setPaletteOpen(true)}>
            <Search size={14} /> Search or jump to… <span className="kbd ml-auto">Ctrl K</span>
          </button>
          <button className="btn-ghost btn-sm sm:hidden" onClick={() => setPaletteOpen(true)} aria-label="Search">
            <Search size={18} />
          </button>
          <div className="ml-auto flex items-center gap-1">
            <button className="btn-primary btn-sm" onClick={() => setNewOpen(true)}>
              <Plus size={14} /> New
            </button>
            <NotificationsMenu />
            <button className="btn-ghost btn-sm" onClick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNewItem={() => setNewOpen(true)} />
      <ItemForm open={newOpen} onClose={() => setNewOpen(false)} />
      <ItemDrawer />
    </div>
  )
}

function NotificationsMenu() {
  const notifications = useStore((s) => s.notifications)
  const markRead = useStore((s) => s.markNotificationsRead)
  const clear = useStore((s) => s.clearNotifications)
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const unread = notifications.filter((n) => !n.read).length
  return (
    <div className="relative">
      <button
        className="btn-ghost btn-sm relative"
        onClick={() => {
          setOpen((o) => !o)
          if (!open) markRead()
        }}
        aria-label="Notifications"
      >
        <Bell size={16} />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="card absolute right-0 z-40 mt-1 w-80 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-xs font-semibold dark:border-slate-800">
              Notifications
              <button className="text-slate-400 hover:text-slate-700" onClick={clear}>
                Clear all
              </button>
            </div>
            <ul className="max-h-80 overflow-y-auto">
              {notifications.length === 0 && <li className="px-3 py-6 text-center text-xs text-slate-500">You're all caught up.</li>}
              {notifications.slice(0, 30).map((n) => (
                <li key={n.id}>
                  <button
                    className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                    onClick={() => {
                      setOpen(false)
                      if (n.itemId) nav(`${location.hash ? window.location.hash.slice(1).split('?')[0] : '/'}?item=${n.itemId}`)
                    }}
                  >
                    <div className="text-slate-700 dark:text-slate-200">{n.text}</div>
                    <div className="text-[10px] text-slate-400">{formatDistanceToNow(parseISO(n.at), { addSuffix: true })}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
