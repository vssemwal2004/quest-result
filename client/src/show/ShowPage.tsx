import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import { AnimatePresence } from 'framer-motion'
import { FilmOverlay } from './chrome/FilmOverlay'
import { BrandFooter } from './chrome/BrandFooter'
import { Hud } from './chrome/Hud'
import { PreviewBadge } from './chrome/PreviewBadge'
import { ShowLoader } from './chrome/ShowLoader'
import { TopBar } from './chrome/TopBar'
import { Countdown } from './intro/Countdown'
import { CssBackground } from './scene/CssBackground'
import { sceneModeFor, stageAccent } from './stageMeta'
import { prefetchPodium, StageView } from './StageView'
import { useEffectiveQuality } from './useEffectiveQuality'
import { useIdle } from './useIdle'
import { useShow } from './useShow'
import { toggleFullscreen, useNavLock, useShowHotkeys } from './useShowHotkeys'
import './show.css'

// three.js + the scene download in parallel with the data while the CSS loader is already on screen.
const loadScene = () => import('./scene/BackgroundScene')
const BackgroundScene = lazy(loadScene)

/** idle → counting (3-2-1 running) → launched (flash held until the next stage is on screen). */
type RevealPhase = 'idle' | 'counting' | 'launched'

/** Never hold the audience on the loader longer than this, even if the GPU is slow to warm up. */
const SCENE_READY_TIMEOUT_MS = 8000

function readQueryFlags() {
  const q = new URLSearchParams(window.location.search)
  return { hud: q.get('hud') !== '0', fps: q.get('fps') === '1' }
}

/** The big-screen show: persistent 3D background, current stage, brand bar, HUD and the reveal countdown. */
export default function ShowPage() {
  const show = useShow()
  const { payload, position, mode, canControl, connected, next, prev } = show
  const { quality, reducedMotion, webgl } = useEffectiveQuality(payload?.settings.quality)
  const stage = payload?.stages[position.stageIndex] ?? null

  const [flags] = useState(readQueryFlags)
  const [hudVisible, setHudVisible] = useState(flags.hud)
  const [reveal, setReveal] = useState<RevealPhase>('idle')
  const cursorIdle = useIdle(3000)
  const withLock = useNavLock(350)

  // The loader stays until the data is here AND the scene has rendered (or WebGL is off / too slow).
  const [sceneReady, setSceneReady] = useState(!webgl)
  const onSceneReady = useCallback(() => setSceneReady(true), [])
  const hasPayload = !!payload
  useEffect(() => {
    if (!hasPayload) return
    const id = window.setTimeout(onSceneReady, SCENE_READY_TIMEOUT_MS)
    return () => window.clearTimeout(id)
  }, [hasPayload, onSceneReady])
  const ready = !!payload && sceneReady

  useEffect(() => {
    if (webgl) void loadScene().catch(() => setSceneReady(true))
  }, [webgl])

  useEffect(() => {
    if (ready && payload?.stages.some((s) => s.tier?.style === 'podium')) prefetchPodium()
  }, [ready, payload])

  // Any stage change ends the countdown (including a remote admin advancing past the intro).
  const stageKey = stage?.key
  useEffect(() => {
    setReveal('idle')
  }, [stageKey])

  // Safety net: if the advance never lands (e.g. network hiccup), lift the flash.
  useEffect(() => {
    if (reveal !== 'launched') return
    const id = window.setTimeout(() => setReveal('idle'), 3500)
    return () => window.clearTimeout(id)
  }, [reveal])

  const goNext = useCallback(
    () =>
      withLock(() => {
        if (!canControl || !stage || !ready || reveal !== 'idle') return
        if (stage.type === 'intro') setReveal('counting')
        else next()
      }),
    [withLock, canControl, stage, ready, reveal, next],
  )

  const goPrev = useCallback(
    () =>
      withLock(() => {
        if (reveal === 'counting') setReveal('idle')
        else if (canControl && ready && reveal === 'idle') prev()
      }),
    [withLock, canControl, ready, reveal, prev],
  )

  const onCountdownComplete = useCallback(() => {
    setReveal('launched')
    next()
  }, [next])

  useShowHotkeys({
    next: goNext,
    prev: goPrev,
    toggleFullscreen,
    toggleHud: () => setHudVisible((v) => !v),
  })

  const accent = stageAccent(stage)
  const showTopBar = stage?.type === 'tier' || stage?.type === 'finale'

  return (
    <div className={clsx('show-root fixed inset-0 select-none overflow-hidden bg-navy-950 text-white', cursorIdle && 'cursor-none')}>
      {/* Mounted once the payload is known, so its quality ceiling never remounts the GL context mid-show. */}
      {!webgl ? (
        <CssBackground accent={accent} />
      ) : (
        payload && (
          <Suspense fallback={null}>
            <BackgroundScene
              mode={ready ? sceneModeFor(stage) : 'boot'}
              accent={accent}
              quality={quality}
              reducedMotion={reducedMotion}
              showRobot={payload.settings.showRobot}
              warp={reveal !== 'idle'}
              onReady={onSceneReady}
              showFps={flags.fps}
            />
          </Suspense>
        )
      )}

      {ready && payload && stage && (
        <StageView
          stage={stage}
          step={position.step}
          settings={payload.settings}
          totalWinners={payload.totalWinners}
          quality={quality}
          reducedMotion={reducedMotion}
          canControl={canControl}
          revealing={reveal !== 'idle'}
          onReveal={goNext}
        />
      )}

      <AnimatePresence>{ready && payload && showTopBar && <TopBar key="topbar" settings={payload.settings} />}</AnimatePresence>

      {ready && payload && <BrandFooter settings={payload.settings} />}

      <AnimatePresence>
        {ready && payload && hudVisible && (
          <Hud
            key="hud"
            stages={payload.stages}
            position={position}
            mode={mode}
            connected={connected}
            canControl={canControl}
            onPrev={goPrev}
            onNext={goNext}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>{reveal !== 'idle' && <Countdown key="countdown" onComplete={onCountdownComplete} />}</AnimatePresence>

      {mode === 'preview' && payload && <PreviewBadge stages={payload.stages} position={position} />}

      <FilmOverlay />

      <AnimatePresence>{!ready && <ShowLoader key="loader" waitingForData={!payload} />}</AnimatePresence>
    </div>
  )
}
