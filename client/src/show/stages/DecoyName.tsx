import { useEffect, useState } from 'react'

// Fictional combinations keep suspense without showing another participant's name.
const FIRST = ['Aarav', 'Maya', 'Riya', 'Kabir', 'Anaya', 'Vihaan', 'Ishita', 'Reyansh']
const LAST = ['Nova', 'Orbit', 'Vector', 'Comet', 'Pixel', 'Vertex', 'Cosmos', 'Photon']

export function DecoyName({ reducedMotion }: { reducedMotion: boolean }) {
  const [name, setName] = useState(reducedMotion ? 'Aarav Nova' : '···· ····')

  useEffect(() => {
    if (reducedMotion) {
      setName('Aarav Nova')
      return
    }
    const timer = window.setInterval(() => {
      const first = FIRST[Math.floor(Math.random() * FIRST.length)]
      const last = LAST[Math.floor(Math.random() * LAST.length)]
      setName(`${first} ${last}`)
    }, 130)
    return () => window.clearInterval(timer)
  }, [reducedMotion])

  return <span aria-label="Cycling decoy names">{name}</span>
}
