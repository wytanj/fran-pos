import { useCallback, useEffect, useRef, useState } from 'react'
import { openMirrorPair, publishMirrorSnapshot, type MirrorPublishResult } from './mirror-api'
import { mirrorSnapshotKey, type MirrorSnapshot } from './mirror-snapshot'

export type MirrorFaceStatus = 'unpaired' | 'offline' | 'live'

export type MirrorLink =
  | { status: 'unbound' }
  | { status: 'connecting' }
  | { status: 'ready'; face: MirrorFaceStatus }
  | { status: 'error'; error: string }

export function mirrorLinkSummary(link: MirrorLink): { label: string; tone: 'ok' | 'wait' | 'bad' | 'off' } {
  switch (link.status) {
    case 'unbound':
      return { label: 'Register not bound', tone: 'off' }
    case 'connecting':
      return { label: 'Connecting', tone: 'wait' }
    case 'error':
      return { label: 'Offline', tone: 'bad' }
    case 'ready':
      if (link.face === 'live') return { label: 'Live', tone: 'ok' }
      if (link.face === 'offline') return { label: 'Display offline', tone: 'wait' }
      return { label: 'Not paired', tone: 'off' }
  }
}

const PUBLISH_DEBOUNCE_MS = 150
const HEARTBEAT_MS = 10_000
const FACE_LIVE_WINDOW_MS = 15_000

function faceStatus(result: MirrorPublishResult): MirrorFaceStatus {
  if (!result.display_paired_at) return 'unpaired'
  const seen = result.display_seen_at ? Date.parse(result.display_seen_at) : 0
  return Date.now() - seen <= FACE_LIVE_WINDOW_MS ? 'live' : 'offline'
}

export function useMirrorPublisher(snapshot: MirrorSnapshot, registerToken: string | null) {
  const [link, setLink] = useState<MirrorLink>(registerToken ? { status: 'connecting' } : { status: 'unbound' })
  const latest = useRef(snapshot)
  latest.current = snapshot
  const lastSeq = useRef(0)
  const sentKey = useRef<string | null>(null)
  const inFlight = useRef(false)
  const dirty = useRef(false)

  const send = useCallback(async () => {
    if (!registerToken) return
    if (inFlight.current) {
      dirty.current = true
      return
    }
    const payload = latest.current
    const key = mirrorSnapshotKey(payload)
    // An unchanged snapshot re-sends its seq: the server treats it as a heartbeat.
    const seq = key === sentKey.current ? lastSeq.current : Math.max(Date.now(), lastSeq.current + 1)
    inFlight.current = true
    try {
      const result = await publishMirrorSnapshot(registerToken, seq, payload)
      lastSeq.current = seq
      sentKey.current = key
      setLink({ status: 'ready', face: faceStatus(result) })
    } catch (err) {
      setLink({ status: 'error', error: err instanceof Error ? err.message : 'Customer display sync failed' })
    } finally {
      inFlight.current = false
      if (dirty.current) {
        dirty.current = false
        void send()
      }
    }
  }, [registerToken])

  useEffect(() => {
    if (!registerToken) return
    const timer = setInterval(() => void send(), HEARTBEAT_MS)
    return () => clearInterval(timer)
  }, [registerToken, send])

  const key = mirrorSnapshotKey(snapshot)
  useEffect(() => {
    if (!registerToken) return
    const timer = setTimeout(() => void send(), PUBLISH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [key, registerToken, send])

  const openPair = useCallback(async () => {
    if (!registerToken) throw new Error('Bind this register in Live mode first')
    const pair = await openMirrorPair(registerToken)
    await send()
    return pair
  }, [registerToken, send])

  return { link, openPair }
}
