import { useEffect } from 'react'
import {
  enterMirrorImmersive,
  leaveMirrorImmersive,
  posPathRequestsImmersive,
  postMirrorPath,
} from '@/pos/mirror/mirror-orientation'

/**
 * Sticky immersive for POS surfaces (cashier S10A + mirror S10B).
 * Posts the path to the Cap FranOrientation bridge (nav-bar hide) and
 * requests web fullscreen with navigationUI hide when the browser allows it.
 */
export function usePosImmersive(active = true) {
  useEffect(() => {
    if (!active) return
    let cancelled = false
    const sync = () => {
      const href = window.location.href
      if (!posPathRequestsImmersive(href)) return
      postMirrorPath(href)
      void enterMirrorImmersive().then(() => {
        if (cancelled) leaveMirrorImmersive()
      })
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync()
    }
    const onGesture = () => {
      sync()
    }
    sync()
    document.addEventListener('visibilitychange', onVisible)
    // Fullscreen often needs a gesture in Chrome; first pointer/key re-tries.
    document.addEventListener('pointerdown', onGesture, { once: true })
    document.addEventListener('keydown', onGesture, { once: true })
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      document.removeEventListener('pointerdown', onGesture)
      document.removeEventListener('keydown', onGesture)
      leaveMirrorImmersive()
    }
  }, [active])
}