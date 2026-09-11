# ScrumFlow

**A lightweight Scrum operating system for software teams — without Jira's complexity.**

Live: **https://venkatmanickam.github.io/scrumflow/**

ScrumFlow answers the five questions every Scrum team asks, on one screen each:

| Question | Where |
|---|---|
| What are we building? | **Backlog** — epics → stories → tasks, drag-to-prioritise, move into sprints |
| What are we doing now? | **Board** — drag-and-drop Scrum board with WIP limits and swimlanes |
| Who is doing it? | **Team** — capacity, workload, utilisation per member |
| Will we finish the sprint? | **Dashboard / Reports** — burndown, burnup, velocity, and a deterministic **sprint-risk engine** |
| What should we improve? | **Retrospective** — went well / didn't / ideas, votes, action items that carry forward automatically |

Plus **Daily Stand-up** (yesterday / today / blockers per member with a Scrum Master summary), **Sprint Planning** (capacity vs commitment with over-commit warnings), **Reports** (sprint report, cycle time, blockers, epic progress, Excel export), a **Scrum Assistant** panel that answers "Are we going to complete this sprint?", "Who is overloaded?", "What should we move?" from the actual sprint data, global search (`Ctrl+K`), notifications and light/dark themes.

## Runs entirely in your browser

There is no server. All data lives in the browser's IndexedDB. Nothing is uploaded anywhere, which is what lets it be hosted on GitHub Pages and used with client data.

- **Backup / restore** — one JSON file moves a whole workspace between devices.
- **Excel export** — backlog, sprints, team, stand-ups and retro actions as a workbook.
- **Excel / CSV import** — reads ScrumFlow exports, Jira-style CSVs, and simple action trackers (`Activity | Owner | Status | Priority | ETA`).
- First launch loads a fictional demo workspace ("Acme Software / ERP–MES Integration") so nothing is empty. Erase it from Settings.

## Tech

Vite · React 19 · TypeScript · Tailwind CSS · Zustand · Dexie (IndexedDB) · dnd-kit · Recharts · SheetJS · date-fns · Vitest.

```bash
npm install
npm run dev        # http://localhost:5173/scrumflow/
npm test           # unit tests (metrics engine, store)
npm run build      # static build in dist/
```

Deployment is a GitHub Actions workflow (`.github/workflows/deploy.yml`): every push to `main` runs the tests, builds, and publishes `dist/` to GitHub Pages. The app is served under `/scrumflow/`; set `VITE_BASE=/` to build for a root path.

## Structure

```
src/domain    types, date helpers, metrics (burndown, velocity, workload, sprint health, assistant)
src/data      Dexie schema, Zustand store (every mutation persists), demo seed, import/export
src/ui        primitives (badges, avatars, modal, drawer, KPI, progress), toasts, confirm dialog
src/app       shell: layout, command palette, item drawer/form, assistant panel
src/pages     Dashboard, Backlog, Sprints, Board, Standup, Reports, Retro, Team, Projects, Settings
```

## Roadmap

- Optional sync backend (self-hosted) so a team shares one workspace
- GitHub / GitLab issue links, Slack/Teams stand-up posting
- Optional LLM-backed assistant on top of the deterministic engine
- Roadmap / release tracking, calendar

## Licence

MIT
