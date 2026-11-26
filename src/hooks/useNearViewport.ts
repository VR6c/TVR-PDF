import { useEffect, useRef, useState } from 'react'

/** True while the element is within `margin` of `root`'s viewport; used to render lazily. */
export function useNearViewport<T extends Element>(root: Element | null, margin: string) {
  const ref = useRef<T>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!root || !el) return
    const io = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { root, rootMargin: margin })
    io.observe(el)
    return () => io.disconnect()
  }, [root, margin])
  return [ref, near] as const
}
