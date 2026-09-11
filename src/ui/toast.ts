import { create } from 'zustand'

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'success' | 'error'
}

interface ToastState {
  toasts: Toast[]
  push: (text: string, kind?: Toast['kind']) => void
  remove: (id: number) => void
}

let seq = 1
export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (text, kind = 'info') => {
    const id = seq++
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3500)
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = (text: string, kind: Toast['kind'] = 'info') => useToasts.getState().push(text, kind)
