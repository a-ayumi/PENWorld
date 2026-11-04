import { buildSheet, pixelSprite, type Sheet } from './sprites'

/**
 * オリジナルのモンスター 8 種。すべてコードで描く 2.5D ドット絵（色・陰影・アウトライン付き）。
 * 1 種につき 12 コマ：idle×2 / walk×4 / happy / eat×2 / sleep / attack / hurt
 */
export type SpeciesId = 'mebu' | 'pikori' | 'gorota' | 'fuwari' | 'giaru' | 'noiz' | 'hireru' | 'mofuru'

export interface Species {
  id: SpeciesId
  name: string
  kind: string
  height: number
  hp: number
  atk: number
  speed: number
  /** calm = 平和に暮らす / wild = 近くの相手に襲いかかる */
  temper: 'calm' | 'wild'
  float?: boolean
  /** 育成で進化する先 */
  next?: SpeciesId
}

export const SPECIES: Record<SpeciesId, Species> = {
  mebu: { id: 'mebu', name: 'メブ', kind: 'めばえ型', height: 1.22, hp: 30, atk: 5, speed: 1.4, temper: 'calm', next: 'pikori' },
  pikori: { id: 'pikori', name: 'ピコリ', kind: 'でんきゅう鳥型', height: 1.35, hp: 45, atk: 8, speed: 1.8, temper: 'calm', next: 'giaru' },
  gorota: { id: 'gorota', name: 'ゴロタ', kind: 'けっしょう甲羅型', height: 1.35, hp: 70, atk: 7, speed: 0.9, temper: 'calm' },
  fuwari: { id: 'fuwari', name: 'フワリ', kind: 'くもくらげ型', height: 1.49, hp: 40, atk: 6, speed: 1.2, temper: 'calm', float: true },
  giaru: { id: 'giaru', name: 'ギアル', kind: 'はぐるまロボ型', height: 1.69, hp: 80, atk: 13, speed: 1.7, temper: 'calm' },
  hireru: { id: 'hireru', name: 'ヒレル', kind: 'なみのり魚型', height: 1.4, hp: 42, atk: 7, speed: 1.6, temper: 'calm', float: true },
  mofuru: { id: 'mofuru', name: 'モフル', kind: 'わたゆき獣型', height: 1.4, hp: 60, atk: 6, speed: 1.0, temper: 'calm' },
  noiz: { id: 'noiz', name: 'ノイズ', kind: 'こわれたデータ', height: 1.35, hp: 38, atk: 7, speed: 1.5, temper: 'wild' },
}

interface Pose {
  bob: number; sq: number; step: number; eye: 'open' | 'closed' | 'happy' | 'angry' | 'hurt'; mouth: number; lean: number; flap: number
}
const P = (o: Partial<Pose>): Pose => ({ bob: 0, sq: 0, step: 0, eye: 'open', mouth: 0, lean: 0, flap: 0, ...o })

const POSES: Pose[] = [
  P({}), P({ bob: 1, sq: 1 }), // idle
  P({ step: -1, flap: 1 }), P({ bob: 1, sq: 1 }), P({ step: 1, flap: -1 }), P({ bob: 1, sq: 1 }), // walk
  P({ bob: -3, eye: 'happy', flap: 2, mouth: 1 }), // happy
  P({ mouth: 1, lean: 1 }), P({ bob: 1, sq: 1, lean: 1 }), // eat
  P({ sq: 2, bob: 1, eye: 'closed' }), // sleep
  P({ lean: 3, eye: 'angry', mouth: 1, flap: 2 }), // attack
  P({ lean: -2, eye: 'hurt', sq: -1 }), // hurt
]

const ANIMS = {
  idle: { frames: [0, 1], fps: 2.5, loop: true },
  walk: { frames: [2, 3, 4, 5], fps: 8, loop: true },
  happy: { frames: [6, 0], fps: 4, loop: true },
  eat: { frames: [7, 8], fps: 5, loop: true },
  sleep: { frames: [9], fps: 1, loop: true },
  attack: { frames: [10], fps: 1, loop: true },
  hurt: { frames: [11], fps: 1, loop: true },
}

// ---------- 描画ヘルパー ----------
type G = CanvasRenderingContext2D
const fill = (g: G, c: string) => (g.fillStyle = c)
const rect = (g: G, c: string, x: number, y: number, w: number, h: number) => {
  fill(g, c)
  g.fillRect(Math.round(x), Math.round(y), w, h)
}
const ell = (g: G, c: string, x: number, y: number, rx: number, ry: number) => {
  fill(g, c)
  g.beginPath()
  g.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2)
  g.fill()
}
const poly = (g: G, c: string, pts: number[]) => {
  fill(g, c)
  g.beginPath()
  for (let i = 0; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1])
  g.closePath()
  g.fill()
}
/** 影 → 本体 → ハイライトの 3 段で塗る丸 */
const blob = (g: G, x: number, y: number, rx: number, ry: number, base: string, shade: string, light: string) => {
  ell(g, shade, x, y, rx, ry)
  ell(g, base, x - 0.8, y - 1, rx - 1.2, ry - 1.4)
  ell(g, light, x - rx * 0.4, y - ry * 0.45, rx * 0.3, ry * 0.22)
}
const eyes = (g: G, xs: number[], y: number, mode: Pose['eye'], color = '#1a1530') => {
  for (const x of xs) {
    if (mode === 'closed') rect(g, color, x - 1, y + 1, 3, 1)
    else if (mode === 'happy') {
      rect(g, color, x - 1, y + 1, 1, 1)
      rect(g, color, x, y, 1, 1)
      rect(g, color, x + 1, y + 1, 1, 1)
    } else if (mode === 'hurt') {
      rect(g, color, x - 1, y - 1, 1, 1)
      rect(g, color, x + 1, y - 1, 1, 1)
      rect(g, color, x, y, 1, 1)
      rect(g, color, x - 1, y + 1, 1, 1)
      rect(g, color, x + 1, y + 1, 1, 1)
    } else {
      rect(g, color, x - 1, y - 1, 2, 3)
      rect(g, '#ffffff', x - 1, y - 1, 1, 1)
      if (mode === 'angry') rect(g, color, x - 2, y - 3, 4, 1)
    }
  }
}

// ---------- 各モンスター ----------
const DRAW: Record<SpeciesId, (g: G, p: Pose, f: number) => void> = {
  mebu(g, p) {
    const cx = 16 + p.lean
    const ry = 8 - p.sq * 0.7
    const rx = 9 + p.sq * 0.7
    const cy = 30 - ry - 1 + p.bob * 0.5 + (p.bob < 0 ? p.bob : 0)
    ell(g, '#3f9e4a', cx - 4 + p.step, 30, 2.5, 1.5)
    ell(g, '#3f9e4a', cx + 4 - p.step, 30, 2.5, 1.5)
    blob(g, cx, cy, rx, ry, '#6fd26a', '#3f9e4a', '#c8f7b0')
    rect(g, '#3f9e4a', cx - 1, cy - ry - 4, 2, 4)
    ell(g, '#8ee86a', cx - 3.5, cy - ry - 5 + (p.flap > 0 ? -1 : 0), 3, 1.6)
    ell(g, '#a6f27c', cx + 3, cy - ry - 6 + (p.flap < 0 ? -1 : 0), 3, 1.6)
    eyes(g, [cx + 2, cx + 6], cy - 2, p.eye)
    ell(g, '#ff9eb5', cx + 8, cy + 1, 1.5, 1)
    if (p.mouth) rect(g, '#7a1f3d', cx + 4, cy + 2, 2, 2)
    else rect(g, '#1a1530', cx + 4, cy + 2, 2, 1)
  },
  pikori(g, p) {
    const cx = 16 + p.lean
    const ry = 9 - p.sq * 0.6
    const rx = 9 + p.sq * 0.6
    const cy = 29 - ry + p.bob * 0.5 + (p.bob < 0 ? p.bob : 0)
    rect(g, '#ff8a3d', cx - 4 + p.step, 28, 3, 3)
    rect(g, '#ff8a3d', cx + 2 - p.step, 28, 3, 3)
    blob(g, cx, cy, rx, ry, '#ffd23f', '#d99a00', '#fff3b0')
    ell(g, '#fff0c2', cx + 1, cy + 3, 5, 4)
    // 頭のでんきゅう
    rect(g, '#5b4a00', cx - 1, cy - ry - 3, 1, 3)
    rect(g, '#5b4a00', cx - 2, cy - ry - 5, 1, 2)
    ell(g, '#5ec8e6', cx - 2, cy - ry - 7, 3, 3)
    ell(g, '#e9fbff', cx - 3, cy - ry - 8, 1.2, 1.2)
    // つばさ
    ell(g, '#d99a00', cx - 4, cy + 1 - p.flap, 3, 4)
    // くちばし
    if (p.mouth) {
      poly(g, '#ff8a3d', [cx + rx - 2, cy - 2, cx + rx + 3, cy - 2, cx + rx - 2, cy])
      poly(g, '#e8662a', [cx + rx - 2, cy + 1, cx + rx + 2, cy + 2, cx + rx - 2, cy + 3])
    } else poly(g, '#ff8a3d', [cx + rx - 2, cy - 1, cx + rx + 3, cy, cx + rx - 2, cy + 2])
    eyes(g, [cx + 2, cx + 6], cy - 3, p.eye)
  },
  gorota(g, p) {
    const cx = 14 + p.lean
    const cy = 22 + p.bob * 0.5
    for (const [dx, s] of [[-8, 1], [-3, -1], [3, 1], [7, -1]] as const)
      rect(g, '#5f6878', cx + dx + p.step * s, cy + 4, 3, 5)
    blob(g, cx, cy, 11, 6 - p.sq * 0.5, '#8a94a6', '#5f6878', '#c4ccd8')
    // 甲羅のけっしょう
    for (const [dx, h] of [[-5, 7], [0, 10], [5, 6]] as const) {
      const bx = cx + dx
      const by = cy - 4
      poly(g, '#22a7c9', [bx - 3, by, bx, by - h, bx + 3, by])
      poly(g, '#5ef2ff', [bx - 3, by, bx, by - h, bx, by])
      rect(g, '#d6fdff', bx - 1, by - h + 3, 1, 2)
    }
    ell(g, '#9aa4b6', cx + 12, cy, 4, 3.5)
    ell(g, '#c4ccd8', cx + 11, cy - 1.5, 1.6, 1)
    eyes(g, [cx + 13], cy - 1, p.eye)
    if (p.mouth) rect(g, '#3b2030', cx + 14, cy + 1, 2, 1)
  },
  fuwari(g, p, f) {
    const cx = 16 + p.lean
    const cy = 15 + p.bob
    // ゆらゆら揺れるリボン
    for (const [i, dx] of [[0, -4], [1, 0], [2, 4]] as const)
      for (let k = 0; k < 8; k++) {
        const w = Math.round(Math.sin(k * 0.9 + i + f * 1.3) * 1.2)
        rect(g, k > 5 ? '#ffd0e6' : '#ff9ecb', cx + dx + w, cy + 5 + k, 2, 1)
      }
    for (const [x, y, r] of [[-5, 1, 5], [5, 1, 5], [0, -2, 7]] as const) ell(g, '#cdb8ec', cx + x + 1, cy + y + 1, r, r - p.sq * 0.4)
    for (const [x, y, r] of [[-5, 1, 5], [5, 1, 5], [0, -2, 7]] as const) ell(g, '#fdfbff', cx + x, cy + y, r - 0.5, r - 0.8 - p.sq * 0.4)
    ell(g, '#ffffff', cx - 3, cy - 5, 2.5, 1.5)
    eyes(g, [cx + 1, cx + 5], cy - 1, p.eye, '#4a2d6b')
    ell(g, '#ff9ecb', cx + 7, cy + 2, 1.5, 1)
    ell(g, '#ff9ecb', cx - 1, cy + 2, 1.5, 1)
    if (p.mouth) rect(g, '#7a1f3d', cx + 3, cy + 2, 2, 2)
  },
  giaru(g, p) {
    const cx = 16 + p.lean
    const cy = 21 + p.bob * 0.5 + (p.bob < 0 ? p.bob : 0)
    // プラグのしっぽ
    rect(g, '#3d2a8a', cx - 10, cy + 2, 4, 1)
    rect(g, '#3d2a8a', cx - 12, cy, 2, 3)
    rect(g, '#ffd23f', cx - 15, cy - 1, 3, 4)
    rect(g, '#c9ced6', cx - 17, cy, 2, 1)
    rect(g, '#c9ced6', cx - 17, cy + 2, 2, 1)
    rect(g, '#3d2a8a', cx - 5 + p.step, cy + 6, 4, 3)
    rect(g, '#3d2a8a', cx + 1 - p.step, cy + 6, 4, 3)
    // からだ
    fill(g, '#5b3fc9')
    g.beginPath()
    g.roundRect(cx - 7, cy - 8 + p.sq, 15, 15 - p.sq, 4)
    g.fill()
    fill(g, '#8e6cff')
    g.beginPath()
    g.roundRect(cx - 7, cy - 8 + p.sq, 14, 12 - p.sq, 4)
    g.fill()
    rect(g, '#c3b2ff', cx - 5, cy - 7 + p.sq, 3, 2)
    // うで
    rect(g, '#5b3fc9', cx - 9, cy - 1 + p.flap, 2, 5)
    rect(g, '#5b3fc9', cx + 7 + (p.lean > 1 ? 2 : 0), cy - 1 - p.flap, 3, 4)
    // はぐるまの耳
    const ex = cx - 4
    const ey = cy - 10 + p.sq
    for (const [dx, dy] of [[0, -4], [0, 3], [-4, 0], [3, 0]]) rect(g, '#9aa1ab', ex + dx, ey + dy, 2, 2)
    ell(g, '#c9ced6', ex + 1, ey + 1, 3, 3)
    rect(g, '#3d2a8a', ex, ey, 2, 2)
    // アンテナ
    rect(g, '#c9ced6', cx + 4, ey - 2, 1, 4)
    rect(g, '#ff4d6d', cx + 3, ey - 4, 3, 2)
    // バイザー
    const vy = cy - 5 + p.sq
    rect(g, p.eye === 'closed' ? '#7a2033' : '#ff4d6d', cx - 4, vy, 12, 4)
    rect(g, '#ffb3c1', cx - 4, vy, 12, 1)
    if (p.eye === 'open' || p.eye === 'angry') {
      rect(g, '#ffffff', cx + 1, vy + 1, 2, 2)
      rect(g, '#ffffff', cx + 5, vy + 1, 2, 2)
    } else if (p.eye === 'happy') {
      rect(g, '#ffffff', cx + 1, vy + 2, 2, 1)
      rect(g, '#ffffff', cx + 5, vy + 2, 2, 1)
    } else if (p.eye === 'hurt') rect(g, '#ffffff', cx, vy + 2, 8, 1)
    if (p.mouth) rect(g, '#2a1a5e', cx + 2, vy + 6, 4, 2)
  },
  hireru(g, p) {
    const cx = 16 + p.lean
    const cy = 17 + p.bob
    // しっぽ（後ろ = 左側）
    const tw = p.step * 1.5
    poly(g, '#e8743f', [cx - 8, cy, cx - 14, cy - 5 + tw, cx - 13, cy + 5 + tw])
    poly(g, '#ff9f6b', [cx - 8, cy, cx - 13, cy - 4 + tw, cx - 12, cy + 3 + tw])
    // 背びれ
    poly(g, '#e8743f', [cx - 4, cy - 6, cx + 1, cy - 13 - p.flap, cx + 4, cy - 6])
    poly(g, '#ff9f6b', [cx - 3, cy - 6, cx + 1, cy - 12 - p.flap, cx + 1, cy - 6])
    blob(g, cx, cy, 10 + p.sq * 0.5, 7 - p.sq * 0.5, '#3fc1c9', '#1f8a9a', '#b8f3f5')
    ell(g, '#eafcff', cx + 2, cy + 3, 6, 3)
    // むなびれ
    ell(g, '#1f8a9a', cx - 1, cy + 2 + p.flap * 0.5, 3, 2)
    // ほっぺのウロコ模様
    rect(g, '#9ae6ea', cx - 4, cy - 2, 2, 2)
    rect(g, '#9ae6ea', cx - 6, cy + 1, 2, 2)
    eyes(g, [cx + 4, cx + 8], cy - 2, p.eye)
    if (p.mouth) {
      rect(g, '#7a1f3d', cx + 9, cy + 2, 2, 2)
      ell(g, '#e8ffff', cx + 13, cy - 3, 1.6, 1.6)
      ell(g, '#e8ffff', cx + 15, cy - 7, 1, 1)
    } else rect(g, '#1a1530', cx + 9, cy + 2, 2, 1)
  },
  mofuru(g, p) {
    const cx = 16 + p.lean
    const ry = 9 - p.sq * 0.7
    const rx = 10 + p.sq * 0.7
    const cy = 29 - ry + p.bob * 0.5 + (p.bob < 0 ? p.bob : 0)
    rect(g, '#9fb4d6', cx - 5 + p.step, 28, 3, 3)
    rect(g, '#9fb4d6', cx + 2 - p.step, 28, 3, 3)
    // もこもこの外周（小さな丸をぐるりと並べる）
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      ell(g, '#c9d8ee', cx + Math.cos(a) * (rx - 1) + 0.6, cy + Math.sin(a) * (ry - 1) + 0.6, 3, 3)
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      ell(g, '#fbfdff', cx + Math.cos(a) * (rx - 1.5), cy + Math.sin(a) * (ry - 1.5), 2.6, 2.6)
    }
    ell(g, '#fbfdff', cx, cy, rx - 2, ry - 2)
    ell(g, '#ffffff', cx - 4, cy - 4, 3, 2)
    // 青い耳の房
    poly(g, '#5b8fe0', [cx - 6, cy - ry + 2, cx - 8, cy - ry - 5 + p.flap, cx - 3, cy - ry + 1])
    poly(g, '#7fb2ff', [cx + 3, cy - ry + 1, cx + 6, cy - ry - 6 - p.flap, cx + 7, cy - ry + 3])
    eyes(g, [cx + 2, cx + 6], cy - 1, p.eye, '#2a3a6a')
    ell(g, '#ffb3c8', cx + 8, cy + 2, 1.6, 1)
    ell(g, '#ffb3c8', cx, cy + 2, 1.6, 1)
    if (p.mouth) rect(g, '#7a1f3d', cx + 3, cy + 3, 2, 2)
    else rect(g, '#2a3a6a', cx + 3, cy + 3, 2, 1)
  },
  noiz(g, p, f) {
    const cx = 16 + p.lean
    const cy = 21 + p.bob * 0.5
    const pts: number[] = []
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2
      const r = (i % 2 ? 6 : 10) - p.sq * 0.6 + (((i * 7 + f) % 3) - 1) * 0.6
      pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.85)
    }
    poly(g, '#1a1530', pts.map((v, i) => v + (i % 2 ? 1 : 1)))
    poly(g, '#2b2350', pts)
    ell(g, '#4a3d80', cx - 3, cy - 4, 3, 2)
    // こわれたデータの粒
    for (let i = 0; i < 7; i++) {
      const h = Math.sin((i + 1) * 91.7 + f * 13.1) * 43758.5
      const n = h - Math.floor(h)
      rect(g, i % 2 ? '#ff3bd4' : '#3bf2ff', cx - 8 + Math.floor(n * 16), cy - 7 + ((i * 5 + f * 3) % 14), 2, 1)
    }
    // ひとつ目
    if (p.eye === 'closed') rect(g, '#ff3b5c', cx, cy - 1, 5, 1)
    else {
      ell(g, '#ffffff', cx + 2, cy - 1, 3.5, 3)
      ell(g, '#ff3b5c', cx + 3, cy - 1, 2, 2)
      rect(g, '#1a1530', cx + 3, cy - 2, 1, 2)
      if (p.eye === 'angry') rect(g, '#1a1530', cx - 2, cy - 5, 8, 1)
    }
    if (p.mouth) for (let i = 0; i < 6; i++) rect(g, '#ff3bd4', cx - 1 + i, cy + 4 + (i % 2), 1, 1)
  },
}

const cache = new Map<SpeciesId, Sheet>()
export function sheetFor(id: SpeciesId): Sheet {
  let s = cache.get(id)
  if (!s) {
    const frames = POSES.map((p, i) => pixelSprite(34, 32, (g) => DRAW[id](g, p, i)))
    s = buildSheet(frames, ANIMS)
    cache.set(id, s)
  }
  return s
}
