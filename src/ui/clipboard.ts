import { toast } from './toast'

/** Copy text to the clipboard with a toast; falls back to a hidden textarea when the Clipboard API is unavailable. */
export async function copyText(text: string, done = 'Copied'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast(done, 'success')
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
      toast(done, 'success')
    } catch {
      toast('Could not copy — select the text manually', 'error')
    } finally {
      ta.remove()
    }
  }
}
