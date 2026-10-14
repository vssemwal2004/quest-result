import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { CAMERA } from './types'

/**
 * Uniform converting a world-space point size to pixels: gl_PointSize = worldSize * uPointScale / -mvPosition.z.
 * Kept in sync with the drawing-buffer height so sprites stay the same size at every resolution.
 */
export function usePointScale(): { value: number } {
  const height = useThree((s) => s.size.height)
  const dpr = useThree((s) => s.viewport.dpr)
  const uniform = useMemo(() => ({ value: 1 }), [])
  useEffect(() => {
    uniform.value = (height * dpr) / (2 * Math.tan(((CAMERA.fov / 2) * Math.PI) / 180))
  }, [height, dpr, uniform])
  return uniform
}
