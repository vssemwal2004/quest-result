import { useEffect, useRef, useState } from 'react'

const BASE_W = 1920
const BASE_H = 1080

/** The show rendered at 1920×1080 inside an iframe, scaled down to fit a 16:9 box. */
export function PreviewFrame({ src, title }: { src: string; title: string }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const ro = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / BASE_W))
    ro.observe(box)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={boxRef} className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-navy-950">
      {scale > 0 && (
        <iframe
          key={src}
          src={src}
          title={title}
          width={BASE_W}
          height={BASE_H}
          tabIndex={-1}
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{ transform: `scale(${scale})` }}
        />
      )}
      <span className="absolute left-2 top-2 rounded-md bg-gold-400 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-navy-900">
        Preview · not live
      </span>
    </div>
  )
}
