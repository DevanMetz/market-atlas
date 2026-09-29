import { useCallback, useRef, useState } from 'react'
import type { History, HistoryResponse } from './types'

export function useMarket() {
  const [data, setData] = useState<Record<string, History>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState<string[]>([])
  const loaded = useRef(new Set<string>()),
    pending = useRef(new Set<string>())
  const load = useCallback(async (symbols: string[], refresh = false) => {
    const missing = [...new Set(symbols)].filter(
      (s) => !pending.current.has(s) && (refresh || !loaded.current.has(s)),
    )
    if (!missing.length) return
    missing.forEach((s) => pending.current.add(s))
    setLoading([...pending.current])
    for (let i = 0; i < missing.length; i += 12) {
      const group = missing.slice(i, i + 12)
      try {
        const response = await fetch(
          `/api/history?symbols=${encodeURIComponent(group.join(','))}`,
          {
            signal: AbortSignal.timeout(45000),
            cache: refresh ? 'reload' : 'default',
          },
        )
        if (!response.ok) {
          const body = (await response.json()) as { error?: string }
          throw new Error(body.error ?? 'Market data is unavailable.')
        }
        const body: HistoryResponse = await response.json()
        setData((prev) => ({
          ...prev,
          ...Object.fromEntries(body.data.map((d) => [d.symbol, d])),
        }))
        setErrors((prev) => {
          const next = { ...prev }
          body.data.forEach((d) => {
            delete next[d.symbol]
            loaded.current.add(d.symbol)
          })
          body.errors.forEach((e) => {
            next[e.symbol] = e.message
            loaded.current.add(e.symbol)
          })
          return next
        })
      } catch (error) {
        setErrors((prev) => ({
          ...prev,
          ...Object.fromEntries(
            group.map((s) => [
              s,
              error instanceof Error
                ? error.message
                : 'Unable to load market data.',
            ]),
          ),
        }))
        group.forEach((s) => loaded.current.add(s))
      } finally {
        group.forEach((s) => pending.current.delete(s))
        setLoading([...pending.current])
      }
    }
  }, [])
  return { data, errors, loading, load }
}
