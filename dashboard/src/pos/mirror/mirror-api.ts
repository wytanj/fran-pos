import { supabase } from '@/lib/supabase'
import type { MirrorSnapshot } from './mirror-snapshot'

export interface MirrorPairCode {
  station_id: string
  pair_code: string
  pair_expires_at: string
  display_paired_at: string | null
  display_seen_at: string | null
}

export interface MirrorPublishResult {
  station_id: string
  snapshot_seq: number
  display_paired_at: string | null
  display_seen_at: string | null
}

export interface MirrorFaceBinding {
  station_id: string
  display_token: string
  store_code: string
  register_id: string
}

export interface MirrorJoinResult extends MirrorFaceBinding {
  snapshot: unknown
  snapshot_seq: number
}

export interface MirrorReadResult {
  station_id: string
  snapshot_seq: number
  snapshot: unknown
}

export const MIRROR_NOT_PAIRED = 'Display is not paired'

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const openMirrorPair = (registerToken: string) =>
  call<MirrorPairCode>('open_mirror_pair', { p_register_token: registerToken })

export const joinMirrorStation = (pairCode: string) =>
  call<MirrorJoinResult>('join_mirror_station', { p_pair_code: pairCode })

export const publishMirrorSnapshot = (registerToken: string, seq: number, snapshot: MirrorSnapshot) =>
  call<MirrorPublishResult>('publish_mirror_snapshot', {
    p_register_token: registerToken,
    p_seq: seq,
    p_snapshot: snapshot,
  })

export const readMirrorSnapshot = (displayToken: string, afterSeq: number) =>
  call<MirrorReadResult>('read_mirror_snapshot', { p_display_token: displayToken, p_after_seq: afterSeq })

const FACE_KEY = 'fran_pos_mirror_face_v1'

export function loadMirrorFace(): MirrorFaceBinding | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(FACE_KEY) || 'null') as Partial<MirrorFaceBinding> | null
    if (!parsed?.station_id || !parsed.display_token) return null
    return {
      station_id: parsed.station_id,
      display_token: parsed.display_token,
      store_code: parsed.store_code || '',
      register_id: parsed.register_id || '',
    }
  } catch {
    return null
  }
}

export function saveMirrorFace(binding: MirrorFaceBinding) {
  try {
    localStorage.setItem(FACE_KEY, JSON.stringify(binding))
  } catch {
    // Private mode: the display pairs again after a reload.
  }
}

export function clearMirrorFace() {
  try {
    localStorage.removeItem(FACE_KEY)
  } catch {
    // Nothing stored to clear.
  }
}

export type MirrorFaceMemberPhoneInput = {
  kind: 'member_phone'
  dial: string
  nationalNumber: string
  raw: string
  at: string
}

export type MirrorFaceInput = MirrorFaceMemberPhoneInput

export interface MirrorFaceInputReadResult {
  station_id: string
  face_input_seq: number
  face_input: MirrorFaceInput | null
  face_input_at?: string | null
}

export interface MirrorFaceInputSubmitResult {
  station_id: string
  face_input_seq: number
}

export const submitMirrorFaceInput = (displayToken: string, input: MirrorFaceInput) =>
  call<MirrorFaceInputSubmitResult>('submit_mirror_face_input', {
    p_display_token: displayToken,
    p_input: input,
  })

export const readMirrorFaceInput = (registerToken: string, afterSeq = 0) =>
  call<MirrorFaceInputReadResult>('read_mirror_face_input', {
    p_register_token: registerToken,
    p_after_seq: afterSeq,
  })

export const clearMirrorFaceInput = (registerToken: string) =>
  call<MirrorFaceInputSubmitResult>('clear_mirror_face_input', { p_register_token: registerToken })

