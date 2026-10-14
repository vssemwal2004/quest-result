/** Static cinematic vignette over everything (one composited layer, never repainted). */
export function FilmOverlay() {
  return <div className="show-vignette pointer-events-none fixed inset-0 z-[45]" aria-hidden />
}
