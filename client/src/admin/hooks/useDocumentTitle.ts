import { useEffect } from 'react'

export function useDocumentTitle(title: string) {
  useEffect(() => {
    const prev = document.title
    document.title = `${title} · AI Quest Admin`
    return () => {
      document.title = prev
    }
  }, [title])
}
