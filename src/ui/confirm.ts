import { create } from 'zustand'

export interface ConfirmRequest {
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
}

interface ConfirmState {
  pending?: ConfirmRequest & { resolve: (ok: boolean) => void }
  ask: (req: ConfirmRequest) => Promise<boolean>
  answer: (ok: boolean) => void
}

export const useConfirm = create<ConfirmState>((set, get) => ({
  pending: undefined,
  ask: (req) =>
    new Promise<boolean>((resolve) => {
      set({ pending: { ...req, resolve } })
    }),
  answer: (ok) => {
    get().pending?.resolve(ok)
    set({ pending: undefined })
  },
}))

export const confirmDialog = (req: ConfirmRequest) => useConfirm.getState().ask(req)
