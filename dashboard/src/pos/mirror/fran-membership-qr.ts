import QRCode from 'qrcode'

const BROWN = '#3A2415'
const YELLOW = '#FFE14D'
const WHITE = '#FFFFFF'

// 0.38 of the matrix is an 11-module eye on https://fran.sg/m.
// A 13-module solid badge on that symbol fails checksum at ECC H.
const EYE_FRACTION = 0.38
const QUIET_MARGIN = 1

type Stamp =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number; fill: string }
  | { kind: 'poly'; points: Array<[number, number]>; fill: string }

function n(value: number): string {
  return String(Math.round(value * 100) / 100)
}

function eyeSpan(moduleCount: number): number {
  const room = moduleCount - 16
  const roomOdd = room % 2 === 0 ? room - 1 : room
  const target = Math.round(moduleCount * EYE_FRACTION)
  const odd = target % 2 === 0 ? target - 1 : target
  return Math.max(5, Math.min(odd, roomOdd))
}

function frStamps(x: number, y: number, size: number): Stamp[] {
  const u = size / 10
  const r = u * 0.35
  const box = (cx: number, cy: number, w: number, h: number): Stamp => ({
    kind: 'rect',
    x: x + cx * u,
    y: y + cy * u,
    w: w * u,
    h: h * u,
    rx: r,
    fill: BROWN,
  })
  const pt = (cx: number, cy: number): [number, number] => [x + cx * u, y + cy * u]
  return [
    box(0.7, 1.05, 1.45, 7.9),
    box(0.7, 1.05, 3.7, 1.5),
    box(0.7, 4.2, 2.95, 1.4),
    box(5.05, 1.05, 1.45, 7.9),
    box(5.05, 1.05, 3.85, 1.5),
    box(7.45, 1.05, 1.45, 3.35),
    box(5.05, 3.95, 3.85, 1.45),
    {
      kind: 'poly',
      fill: BROWN,
      points: [pt(6.35, 5.15), pt(7.85, 5.15), pt(9.2, 8.95), pt(7.55, 8.95)],
    },
  ]
}

function svgStamp(stamp: Stamp): string {
  switch (stamp.kind) {
    case 'rect':
      return `<rect x="${n(stamp.x)}" y="${n(stamp.y)}" width="${n(stamp.w)}" height="${n(stamp.h)}" rx="${n(stamp.rx)}" fill="${stamp.fill}"/>`
    case 'poly':
      return `<polygon points="${stamp.points.map(([px, py]) => `${n(px)},${n(py)}`).join(' ')}" fill="${stamp.fill}"/>`
    default: {
      const neverStamp: never = stamp
      return neverStamp
    }
  }
}

export function renderFranMembershipQr(url: string): string | null {
  const payload = url.trim()
  if (!payload) return null

  let symbol
  try {
    symbol = QRCode.create(payload, { errorCorrectionLevel: 'H' })
  } catch {
    return null
  }

  const modules = symbol.modules
  const count = modules.size
  const span = eyeSpan(count)
  const origin = Math.floor((count - span) / 2)
  const view = count + QUIET_MARGIN * 2
  const stamps: Stamp[] = [
    { kind: 'rect', x: 0, y: 0, w: view, h: view, rx: 0, fill: WHITE },
  ]

  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!modules.get(row, col)) continue
      if (col >= origin && col < origin + span && row >= origin && row < origin + span) continue
      stamps.push({
        kind: 'rect',
        x: col + QUIET_MARGIN,
        y: row + QUIET_MARGIN,
        w: 1,
        h: 1,
        rx: 0,
        fill: BROWN,
      })
    }
  }

  const ring = 0.9
  const badge = span - ring * 2
  const badgeX = origin + QUIET_MARGIN + ring
  const badgeY = origin + QUIET_MARGIN + ring
  stamps.push({
    kind: 'rect',
    x: origin + QUIET_MARGIN,
    y: origin + QUIET_MARGIN,
    w: span,
    h: span,
    rx: span * 0.18,
    fill: WHITE,
  })
  stamps.push({
    kind: 'rect',
    x: badgeX,
    y: badgeY,
    w: badge,
    h: badge,
    rx: badge * 0.22,
    fill: YELLOW,
  })

  const pad = badge * 0.12
  stamps.push(...frStamps(badgeX + pad, badgeY + pad, badge - pad * 2))

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view} ${view}" width="100%" height="100%" aria-hidden="true" focusable="false">${stamps.map(svgStamp).join('')}</svg>`
}
