/**
 * Frame delta for damped animations. Clamped because the canvas idles in frameloop "demand" and the
 * first frame after waking up would otherwise report the whole idle time and skip the animation.
 */
export const frameDelta = (dt: number): number => Math.min(dt, 1 / 30)
