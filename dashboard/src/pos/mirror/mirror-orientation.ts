const MIRROR_SEGMENT = '/pos/mirror'
const PORTRAIT_LOCKS = ['portrait', 'portrait-primary'] as const

export function mirrorPathRequestsPortrait(raw: string): boolean {
  const path = pathOnly(raw)
  return path.endsWith(MIRROR_SEGMENT) || path.includes(`${MIRROR_SEGMENT}/`)
}

function pathOnly(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed === '') return ''
  let path = trimmed
  const scheme = path.indexOf('://')
  if (scheme >= 0) {
    const slash = path.indexOf('/', scheme + 3)
    path = slash < 0 ? '/' : path.slice(slash)
  }
  const query = path.indexOf('?')
  if (query >= 0) path = path.slice(0, query)
  const hash = path.indexOf('#')
  if (hash >= 0) path = path.slice(0, hash)
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  return path
}

const MIRROR_RELEASE_PATH = '/pos/sale'

export function releaseMirrorPath(): void {
  postMirrorPath(MIRROR_RELEASE_PATH)
}

export function postMirrorPath(path: string): void {
  const host: object = window
  if (!('FranOrientation' in host)) return
  const bridge = host.FranOrientation
  if (typeof bridge !== 'object' || bridge === null || !('applyPath' in bridge)) return
  const applyPath = bridge.applyPath
  if (typeof applyPath !== 'function') return
  Reflect.apply(applyPath, bridge, [path])
}

export function postMirrorSession(live: boolean): void {
  const host: object = window
  if (!('FranOrientation' in host)) return
  const bridge = host.FranOrientation
  if (typeof bridge !== 'object' || bridge === null || !('setSession' in bridge)) return
  const setSession = bridge.setSession
  if (typeof setSession !== 'function') return
  Reflect.apply(setSession, bridge, [live])
}

export async function lockPortrait(): Promise<void> {
  const orientation = screen.orientation
  if (orientation == null || !('lock' in orientation)) return
  const lock = orientation.lock
  if (typeof lock !== 'function') return
  for (const mode of PORTRAIT_LOCKS) {
    try {
      await Reflect.apply(lock, orientation, [mode])
      return
    } catch {
      continue
    }
  }
}

export function unlockPortrait(): void {
  const orientation = screen.orientation
  if (orientation == null || !('unlock' in orientation)) return
  const unlock = orientation.unlock
  if (typeof unlock !== 'function') return
  try {
    Reflect.apply(unlock, orientation, [])
  } catch {
    return
  }
}

export async function enterMirrorImmersive(): Promise<void> {
  const root = document.documentElement
  if (document.fullscreenElement != null || typeof root.requestFullscreen !== 'function') return
  try {
    await root.requestFullscreen({ navigationUI: 'hide' })
  } catch {
    return
  }
}

export function leaveMirrorImmersive(): void {
  if (document.fullscreenElement == null || typeof document.exitFullscreen !== 'function') return
  void document.exitFullscreen().catch(() => undefined)
}
