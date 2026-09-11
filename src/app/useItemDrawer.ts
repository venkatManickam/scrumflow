import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/** The item detail drawer is addressed by `?item=<id>` so it can be opened from any page and deep-linked. */
export function useItemDrawer() {
  const [params, setParams] = useSearchParams()
  const itemId = params.get('item') ?? undefined
  const open = useCallback(
    (id: string) => {
      setParams((p) => {
        const n = new URLSearchParams(p)
        n.set('item', id)
        return n
      })
    },
    [setParams],
  )
  const close = useCallback(() => {
    setParams((p) => {
      const n = new URLSearchParams(p)
      n.delete('item')
      return n
    })
  }, [setParams])
  return { itemId, open, close }
}
