import { useMemo, useState } from 'react'
import { Send, Sparkles, X } from 'lucide-react'
import { useActiveSprint, useCurrentProject, useProjectItems, useProjectMembers, useProjectSprints, useVelocityHistory } from '../data/hooks'
import { answerQuestion, type AssistantAnswer } from '../domain/metrics'
import { RiskPill } from '../ui/primitives'

const SUGGESTED = [
  'Are we going to complete this sprint?',
  'What are our biggest blockers?',
  'Which stories are at risk?',
  'Why is velocity decreasing?',
  'Who is overloaded?',
  'What should we move to the next sprint?',
  'Summarize this sprint.',
]

interface Message {
  id: number
  question: string
  answer: AssistantAnswer
}

export function AssistantPanel() {
  const project = useCurrentProject()
  const items = useProjectItems(project?.id)
  const sprints = useProjectSprints(project?.id)
  const active = useActiveSprint(project?.id)
  const members = useProjectMembers(project)
  const history = useVelocityHistory(project?.id)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [messages, setMessages] = useState<Message[]>([])

  const sprint = useMemo(() => active ?? [...sprints].sort((a, b) => b.startDate.localeCompare(a.startDate))[0], [active, sprints])

  const ask = (question: string) => {
    const text = question.trim()
    if (!text) return
    const answer = answerQuestion(text, { sprint, items, members, history })
    setMessages((m) => [...m, { id: Date.now() + m.length, question: text, answer }])
    setQ('')
  }

  return (
    <>
      {!open && (
        <button
          className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-brand-700"
          onClick={() => setOpen(true)}
          aria-label="Open Scrum Assistant"
        >
          <Sparkles size={16} /> Scrum Assistant
        </button>
      )}
      {open && (
        <div className="card animate-fade-in fixed bottom-5 right-5 z-30 flex max-h-[70vh] w-[calc(100vw-2.5rem)] flex-col overflow-hidden sm:w-96">
          <header className="flex items-start gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Sparkles size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Scrum Assistant</div>
              <div className="text-[11px] leading-snug text-slate-500">
                Answers from {project ? `${project.key}'s` : 'your'} actual sprint data{sprint ? ` (${sprint.name})` : ''}. Runs in your browser — nothing leaves it.
              </div>
            </div>
            <button className="btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close">
              <X size={16} />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <div className="text-xs text-slate-500">Ask about sprint risk, blockers, workload or velocity — or pick a question below.</div>
            )}
            {messages.map((m) => (
              <div key={m.id} className="space-y-1.5">
                <div className="ml-8 rounded-lg bg-brand-600 px-3 py-2 text-sm text-white">{m.question}</div>
                <div className="mr-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/60">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{m.answer.title}</span>
                    {m.answer.risk && <RiskPill risk={m.answer.risk} />}
                  </div>
                  <AnswerBody lines={m.answer.body} />
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-100 px-4 py-2 dark:border-slate-800">
            <div className="mb-2 flex flex-wrap gap-1">
              {SUGGESTED.map((s) => (
                <button key={s} className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => ask(s)}>
                  {s}
                </button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                ask(q)
              }}
            >
              <input className="input input-sm" placeholder="Ask a question…" value={q} onChange={(e) => setQ(e.target.value)} />
              <button type="submit" className="btn-primary btn-sm" disabled={!q.trim()} aria-label="Ask">
                <Send size={14} />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function AnswerBody({ lines }: { lines: string[] }) {
  const nodes: React.ReactNode[] = []
  let list: string[] = []
  const flush = (key: string) => {
    if (list.length) {
      nodes.push(
        <ul key={key} className="ml-4 list-disc space-y-0.5">
          {list.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>,
      )
      list = []
    }
  }
  lines.forEach((line, i) => {
    if (line.startsWith('• ')) {
      list.push(line.slice(2))
      return
    }
    flush('l' + i)
    if (line.trim() === '') nodes.push(<div key={'s' + i} className="h-1.5" />)
    else nodes.push(<p key={'p' + i} className="whitespace-pre-wrap">{line}</p>)
  })
  flush('end')
  return <div className="space-y-0.5 text-xs text-slate-700 dark:text-slate-300">{nodes}</div>
}
