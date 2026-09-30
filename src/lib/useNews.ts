import { useEffect, useRef, useState } from 'react'
import type { NewsFeed, NewsResponse } from './news'

export function useNews(ids: string[]) {
  const [feeds, setFeeds] = useState<Record<string, NewsFeed>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState<string[]>([])
  const [generation, setGeneration] = useState(0)
  const cache = useRef<Record<string, NewsFeed>>({})
  const key = ids.join(',')
  useEffect(() => {
    const controller = new AbortController()
    const selected = key.split(',').filter(Boolean)
    const needed = selected.filter(
      (id) =>
        !cache.current[id] ||
        Date.now() - Date.parse(cache.current[id].fetchedAt) > 15 * 60000,
    )
    setLoading(needed)
    setErrors({})
    void (async () => {
      for (let i = 0; i < needed.length; i += 6) {
        const group = needed.slice(i, i + 6)
        try {
          const response = await fetch(
            `/api/news?sources=${encodeURIComponent(group.join(','))}`,
            {
              signal: AbortSignal.any([
                controller.signal,
                AbortSignal.timeout(35000),
              ]),
            },
          )
          if (!response.ok)
            throw new Error(
              response.status === 429
                ? 'Please wait a minute before refreshing more feeds.'
                : 'News service is unavailable.',
            )
          const body = (await response.json()) as NewsResponse
          if (controller.signal.aborted) return
          for (const feed of body.feeds) cache.current[feed.sourceId] = feed
          setFeeds({ ...cache.current })
          setErrors((prev) => ({
            ...prev,
            ...Object.fromEntries(
              body.errors.map((error) => [error.sourceId, error.message]),
            ),
          }))
        } catch (error) {
          if (controller.signal.aborted) return
          setErrors((prev) => ({
            ...prev,
            ...Object.fromEntries(
              group.map((id) => [
                id,
                error instanceof Error ? error.message : 'Feed unavailable.',
              ]),
            ),
          }))
        } finally {
          if (!controller.signal.aborted)
            setLoading((prev) => prev.filter((id) => !group.includes(id)))
        }
      }
    })()
    return () => controller.abort()
  }, [key, generation])
  const refresh = () => {
    cache.current = {}
    setFeeds({})
    setGeneration((value) => value + 1)
  }
  return { feeds, errors, loading, refresh }
}
