import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import App from './App'
import { useStore } from '../data/store'
import { db } from '../data/db'

/** Minimal printf-style formatter (React's console.error uses %s placeholders). */
function format(fmt: string, ...rest: unknown[]): string {
  let i = 0
  const out = fmt.replace(/%[sdo]/g, () => String(rest[i++] ?? ''))
  return [out, ...rest.slice(i).map(String)].join(' ')
}

// jsdom lacks these; Recharts / matchMedia use them.
beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO
})

const errors: string[] = []
const origError = console.error
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    // React warnings about act() are noise here; real render errors are not.
    const msg = String(args[0] ?? '')
    if (msg.includes('not wrapped in act') || msg.includes('width(0) and height(0)')) return
    errors.push(format(...(args as [string, ...unknown[]])))
    origError(...args)
  }
})
afterAll(() => {
  console.error = origError
})

const ROUTES = ['/', '/backlog', '/sprints', '/board', '/standup', '/reports', '/retro', '/team', '/projects', '/settings']

describe('App smoke test (every page renders on the demo workspace)', () => {
  it('boots into the demo workspace and renders every route without throwing', async () => {
    await db.delete()
    await db.open()
    useStore.setState({ ready: false })
    render(<App />)
    await screen.findByText(/ScrumFlow/, {}, { timeout: 10000 })
    await waitFor(() => expect(useStore.getState().ready).toBe(true), { timeout: 10000 })
    expect(useStore.getState().projects[0]?.key).toBe('EMI')

    for (const route of ROUTES) {
      await act(async () => {
        window.location.hash = '#' + route
        await new Promise((r) => setTimeout(r, 30))
      })
      // Every page keeps the shell (sidebar brand) and renders something inside <main>.
      const main = document.querySelector('main')
      expect(main, route).toBeTruthy()
      await waitFor(() => expect(main!.textContent?.trim().length ?? 0, `route ${route} rendered nothing`).toBeGreaterThan(20))
      const nested = document.querySelectorAll('button button, a a, button a, a button, p div')
      const nestedInfo = [...nested].map((n) => n.parentElement?.closest('button, a, p')?.outerHTML.slice(0, 240)).join('\n')
      expect(nested.length, `route ${route} has invalid nesting:\n${nestedInfo}`).toBe(0)
    }

    // Deep-link the item drawer from the board.
    const item = useStore.getState().items.find((i) => i.type === 'story' && i.sprintId)!
    await act(async () => {
      window.location.hash = '#/board?item=' + item.id
      await new Promise((r) => setTimeout(r, 30))
    })
    await screen.findByDisplayValue(item.title)

    // Assistant answers from real sprint data
    const open = await screen.findByRole('button', { name: /Scrum Assistant/i })
    await act(async () => {
      open.click()
    })
    const chip = await screen.findByText(/biggest blockers/i)
    await act(async () => {
      chip.click()
    })
    expect((await screen.findAllByText(/Waiting for SAP QA test data/i)).length).toBeGreaterThan(0)

    expect(errors, 'console.error calls during render:\n' + errors.map((e) => e.slice(0, 1200)).join('\n---\n')).toHaveLength(0)
  }, 60000)

})
