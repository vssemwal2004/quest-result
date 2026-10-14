// Static, GPU-free version of the background: the loader's backdrop, and the whole background when
// WebGL is unavailable or the 3D scene fails. No three.js imports — it must stay in the first chunk.

const CIRCUIT_TILE = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='480' viewBox='0 0 480 480'>
    <g fill='none' stroke='#38e1ff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' opacity='.55'>
      <path d='M0 60h120l30 30h110l20-20h200'/>
      <path d='M0 84h96l30 30h80'/>
      <path d='M480 180h-90l-40 40H230l-20 20H40l-40 40'/>
      <path d='M60 480V380l40-40V250'/>
      <path d='M84 480V392l40-40v-60'/>
      <path d='M300 480v-70l30-30h150'/>
      <path d='M330 0v50l-30 30v60'/>
      <path d='M354 0v38l-30 30v40'/>
      <path d='M0 320h70l26 26h120l34-34h230'/>
    </g>
    <g fill='#8ff0ff' opacity='.8'>
      <circle cx='260' cy='90' r='5'/><circle cx='206' cy='114' r='4'/><circle cx='230' cy='220' r='5'/>
      <circle cx='100' cy='250' r='5'/><circle cx='124' cy='292' r='4'/><circle cx='300' cy='140' r='5'/>
      <circle cx='324' cy='108' r='4'/><circle cx='216' cy='346' r='5'/><circle cx='330' cy='380' r='5'/>
    </g>
  </svg>`,
)}")`

export function CssBackground({ accent }: { accent: string }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-quest-gradient" aria-hidden>
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage: CIRCUIT_TILE,
          backgroundSize: 'min(36vw, 64vh)',
          WebkitMaskImage: 'radial-gradient(ellipse 60% 55% at 50% 50%, transparent 30%, #000 85%)',
          maskImage: 'radial-gradient(ellipse 60% 55% at 50% 50%, transparent 30%, #000 85%)',
        }}
      />
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(55% 45% at 50% 52%, ${accent}26, transparent 70%)` }}
      />
    </div>
  )
}
