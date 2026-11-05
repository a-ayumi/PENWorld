import { SpriteAnim, buildSheet, pixelSprite, type Sheet } from './sprites'
import { SECRET_FORMS, secretSpecies, type SecretId } from './secrets'
import { CHAINS, FAMILIES, FAMILY_OF, FAMILY_SPEED, TIER_BASE, WATER_NEW, EVOLVE, type Look, type Family } from './families'

/**
 * オリジナルのモンスター 14 種（仲間になれる 11 種 + 敵 4 種のうち ノイズ を含む）。すべてコードで描く 2.5D ドット絵（色・陰影・アウトライン付き）。
 * 1 種につき 12 コマ：idle×2 / walk×4 / happy / eat×2 / sleep / attack / hurt
 */
type OldId =
  | 'mebu' | 'pikori' | 'gorota' | 'fuwari' | 'giaru' | 'noiz' | 'hireru' | 'mofuru'
  | 'garudora' | 'shioryu' | 'hoshikujira' | 'togebug' | 'yamikage' | 'gougan'
/** 系統の仲間（families.ts） */
export type NewId =
  | 'nejiru' | 'boruta' | 'kacha' | 'tankuru' | 'kurokko' | 'metarion' | 'ryuuko' | 'honora' | 'kazeru' | 'bakuryu' | 'raigaru' | 'tenryuu' | 'mimiko' | 'tsumeru' | 'yoruna' | 'torahime' | 'tsukineko' | 'nekomata' | 'wanko' | 'kibaru' | 'fuwan' | 'garufu' | 'mamoru' | 'rouga' | 'piyo' | 'habataki' | 'utaru' | 'hayate' | 'hoshiro' | 'hikaritori' | 'gabuko' | 'oniko' | 'nurari' | 'ogaran' | 'bakeran' | 'yamatan' | 'shizuku' | 'awako' | 'kaimaru'
export type SpeciesId = OldId | NewId | SecretId

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
  /** 進化の段階（1 = 幼年期、2 = 成長期、3 = 成熟期、4 = 完成期、0 = 敵） */
  tier: 0 | 1 | 2 | 3 | 4
  /** 敵のこのみ（raid = 家を壊したがる / night = 夜だけ出る） */
  habit?: 'raid' | 'night'
}

/** 進化に必要な経験値（段階ごと） */
export const XP_NEED: Record<1 | 2 | 3, number> = { 1: 15, 2: 45, 3: 110 }

/** 進化分岐：育て方の傾向（ちから / まもり / こころ）でつぎの姿が決まる */
export type Care = 'power' | 'guard' | 'spirit'
export const BRANCH: Record<1 | 2 | 3, Record<Care, SpeciesId>> = {
  1: { power: 'pikori', guard: 'gorota', spirit: 'mofuru' },
  2: { power: 'giaru', guard: 'hireru', spirit: 'fuwari' },
  3: { power: 'garudora', guard: 'shioryu', spirit: 'hoshikujira' },
}

const OLD_SPECIES: Record<OldId, Species> = {
  mebu: { id: 'mebu', name: 'メブ', kind: 'めばえ型', height: 1.22, hp: 30, atk: 5, speed: 1.4, temper: 'calm', tier: 1 },
  pikori: { id: 'pikori', name: 'ピコリ', kind: 'でんきゅう鳥型', height: 1.35, hp: 45, atk: 8, speed: 1.8, temper: 'calm', tier: 2 },
  gorota: { id: 'gorota', name: 'ゴロタ', kind: 'けっしょう甲羅型', height: 1.35, hp: 70, atk: 7, speed: 0.9, temper: 'calm', tier: 2 },
  fuwari: { id: 'fuwari', name: 'フワリ', kind: 'くもくらげ型', height: 1.49, hp: 72, atk: 11, speed: 1.3, temper: 'calm', float: true, tier: 3 },
  giaru: { id: 'giaru', name: 'ギアル', kind: 'はぐるまロボ型', height: 1.69, hp: 80, atk: 13, speed: 1.7, temper: 'calm', tier: 3 },
  hireru: { id: 'hireru', name: 'ヒレル', kind: 'なみのり魚型', height: 1.4, hp: 76, atk: 12, speed: 1.7, temper: 'calm', float: true, tier: 3 },
  mofuru: { id: 'mofuru', name: 'モフル', kind: 'わたゆき獣型', height: 1.4, hp: 60, atk: 6, speed: 1.0, temper: 'calm', tier: 2 },
  garudora: { id: 'garudora', name: 'ガルドラ', kind: 'はがねりゅう型', height: 2.05, hp: 150, atk: 22, speed: 1.6, temper: 'calm', tier: 4 },
  shioryu: { id: 'shioryu', name: 'シオリュウ', kind: 'うしおへび型', height: 2.0, hp: 165, atk: 18, speed: 1.5, temper: 'calm', float: true, tier: 4 },
  hoshikujira: { id: 'hoshikujira', name: 'ホシクジラ', kind: 'ほしぞらくじら型', height: 2.1, hp: 140, atk: 19, speed: 1.2, temper: 'calm', float: true, tier: 4 },
  noiz: { id: 'noiz', name: 'ノイズ', kind: 'こわれたデータ', height: 1.35, hp: 38, atk: 7, speed: 1.5, temper: 'wild', tier: 0 },
  togebug: { id: 'togebug', name: 'トゲバグ', kind: 'とげむし型', height: 1.15, hp: 26, atk: 6, speed: 2.2, temper: 'wild', tier: 0 },
  yamikage: { id: 'yamikage', name: 'ヤミカゲ', kind: 'よるのかげ', height: 1.5, hp: 40, atk: 10, speed: 1.6, temper: 'wild', float: true, tier: 0, habit: 'night' },
  gougan: { id: 'gougan', name: 'ゴウガン', kind: 'マグマいわ型', height: 1.95, hp: 115, atk: 14, speed: 0.8, temper: 'wild', tier: 0, habit: 'raid' },
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
  // 2 倍の解像度で描くので 0.5 刻みまで使える
  g.fillRect(Math.round(x * 2) / 2, Math.round(y * 2) / 2, w, h)
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
      rect(g, '#ffffff', x + 0.5, y + 1, 0.5, 0.5)
      if (mode === 'angry') rect(g, color, x - 2, y - 3, 4, 1)
    }
  }
}

// ---------- 各モンスター ----------
const DRAW_OLD: Record<OldId, (g: G, p: Pose, f: number) => void> = {
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
    // 丸い頭 + ゴーグルの目 + 角ばった胴体のロボット（3D 版と同じデザイン）
    const cx = 16 + p.lean
    const cy = 21 + p.bob * 0.5 + (p.bob < 0 ? p.bob : 0)
    // プラグのしっぽ
    rect(g, '#3d2a8a', cx - 9, cy + 3, 3, 1)
    rect(g, '#3d2a8a', cx - 11, cy + 1, 2, 3)
    rect(g, '#ffd23f', cx - 14, cy, 3, 4)
    rect(g, '#c9ced6', cx - 16, cy + 0.5, 2, 1)
    rect(g, '#c9ced6', cx - 16, cy + 2.5, 2, 1)
    // あし
    rect(g, '#3d2a8a', cx - 5 + p.step, cy + 6, 4, 4)
    rect(g, '#3d2a8a', cx + 1 - p.step, cy + 6, 4, 4)
    // 胴体（角ばった箱）+ 胸のパネル
    rect(g, '#5b3fc9', cx - 6, cy - 2 + p.sq, 12, 9 - p.sq)
    rect(g, '#8e6cff', cx - 6, cy - 2 + p.sq, 12, 6 - p.sq)
    rect(g, '#2a1a5e', cx - 3, cy + 1, 6, 3)
    rect(g, '#5ef2ff', cx - 2, cy + 2, 4, 1)
    // うで
    rect(g, '#5b3fc9', cx - 8, cy - 1 + p.flap, 2, 5)
    rect(g, '#c9ced6', cx - 8, cy + 4 + p.flap, 2, 1.5)
    rect(g, '#5b3fc9', cx + 6 + (p.lean > 1 ? 2 : 0), cy - 1 - p.flap, 2.5, 4.5)
    // 頭（丸）
    const hy = cy - 8 + p.sq * 0.5
    blob(g, cx + 0.5, hy, 6.5, 5.5, '#a58cff', '#6f55d8', '#d6caff')
    // はぐるまの耳（頭の左）
    for (const [dx, dy] of [[0, -3], [0, 2], [-3, -0.5], [2, -0.5]]) rect(g, '#9aa1ab', cx - 6.5 + dx, hy - 1 + dy, 1.5, 1.5)
    ell(g, '#c9ced6', cx - 6, hy - 0.3, 2.2, 2.2)
    rect(g, '#3d2a8a', cx - 6.5, hy - 0.8, 1, 1)
    // アンテナ
    rect(g, '#c9ced6', cx + 3, hy - 8, 1, 3)
    rect(g, '#ffd23f', cx + 2.5, hy - 9.5, 2, 1.5)
    // ゴーグルの目
    for (const ex of [cx - 1.5, cx + 3.5]) {
      ell(g, '#c9ced6', ex, hy, 2.3, 2.3)
      if (p.eye === 'closed') rect(g, '#7a2033', ex - 1.5, hy, 3, 0.5)
      else if (p.eye === 'happy') {
        rect(g, '#ff4d6d', ex - 1.5, hy, 1, 0.5)
        rect(g, '#ff4d6d', ex - 0.5, hy - 0.5, 1, 0.5)
        rect(g, '#ff4d6d', ex + 0.5, hy, 1, 0.5)
      } else if (p.eye === 'hurt') {
        rect(g, '#ff4d6d', ex - 1, hy - 1, 0.5, 0.5)
        rect(g, '#ff4d6d', ex + 0.5, hy - 1, 0.5, 0.5)
        rect(g, '#ff4d6d', ex - 0.25, hy - 0.25, 0.5, 0.5)
        rect(g, '#ff4d6d', ex - 1, hy + 0.5, 0.5, 0.5)
        rect(g, '#ff4d6d', ex + 0.5, hy + 0.5, 0.5, 0.5)
      } else {
        ell(g, '#ff4d6d', ex, hy, 1.4, 1.4)
        rect(g, '#ffffff', ex - 1, hy - 1, 0.5, 0.5)
        if (p.eye === 'angry') rect(g, '#2a1a5e', ex - 2, hy - 3, 4, 0.5)
      }
    }
    // くちのグリル
    if (p.mouth) for (let i = 0; i < 3; i++) rect(g, '#2a1a5e', cx - 0.5 + i * 1.5, hy + 3, 1, 1)
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
  garudora(g, p) {
    // はがねの竜：青い装甲・金のふち・歯車の翼・プラグのしっぽ
    const cx = 15 + p.lean
    const cy = 20 + p.bob * 0.5 + (p.bob < 0 ? p.bob : 0)
    // 歯車の翼（後ろ）
    for (let i = 0; i < 5; i++) {
      const a = -2.4 + i * 0.32 + p.flap * 0.05
      poly(g, i % 2 ? '#7a8aa8' : '#9aaac8', [cx - 3, cy - 4, cx - 3 + Math.cos(a) * 12, cy - 4 + Math.sin(a) * 12, cx - 3 + Math.cos(a + 0.25) * 11, cy - 4 + Math.sin(a + 0.25) * 11])
    }
    ell(g, '#c9ced6', cx - 3, cy - 4, 2.5, 2.5)
    // しっぽ
    poly(g, '#34508a', [cx - 7, cy + 3, cx - 15, cy + 1 - p.step, cx - 14, cy + 3 - p.step, cx - 7, cy + 6])
    rect(g, '#ffd23f', cx - 17, cy - p.step, 3, 3)
    // あし
    rect(g, '#2a3f6e', cx - 6 + p.step, cy + 6, 4, 5)
    rect(g, '#2a3f6e', cx + 2 - p.step, cy + 6, 4, 5)
    rect(g, '#ffd23f', cx - 6 + p.step, cy + 10, 4, 1)
    rect(g, '#ffd23f', cx + 2 - p.step, cy + 10, 4, 1)
    // からだ
    blob(g, cx, cy + 1, 8, 7 - p.sq * 0.5, '#4a6fa5', '#2a3f6e', '#8fb0e0')
    ell(g, '#c9d8f0', cx + 2, cy + 3, 4, 3.5)
    for (let i = 0; i < 3; i++) rect(g, '#9aaac8', cx + 0.5, cy + 1 + i * 1.5, 3, 0.5)
    // くび + あたま
    poly(g, '#4a6fa5', [cx + 3, cy - 4, cx + 7, cy - 9, cx + 9, cy - 6, cx + 6, cy - 1])
    const hx = cx + 9
    const hy = cy - 10
    blob(g, hx, hy, 5, 3.6, '#4a6fa5', '#2a3f6e', '#8fb0e0')
    poly(g, '#ffd23f', [hx - 2, hy - 3, hx - 4, hy - 8, hx, hy - 3.5])
    poly(g, '#ffd23f', [hx + 1, hy - 3, hx + 1, hy - 7, hx + 3, hy - 3])
    rect(g, '#2a3f6e', hx + 2, hy + 1.5, 4, 1.5)
    if (p.mouth) {
      rect(g, '#7a1f3d', hx + 2, hy + 1.5, 4, 1.5)
      rect(g, '#ffffff', hx + 3, hy + 1.5, 0.5, 0.5)
    }
    // ゴーグルの目
    ell(g, '#c9ced6', hx + 1, hy - 0.5, 1.6, 1.6)
    if (p.eye === 'closed') rect(g, '#2a3f6e', hx, hy - 0.5, 2, 0.5)
    else {
      ell(g, p.eye === 'hurt' ? '#ffffff' : '#5ef2ff', hx + 1, hy - 0.5, 1, 1)
      if (p.eye === 'angry') rect(g, '#1a1530', hx - 1, hy - 2.5, 4, 0.5)
    }
    // うで
    rect(g, '#2a3f6e', cx + 5 + (p.lean > 1 ? 2 : 0), cy - 1 - p.flap * 0.5, 3, 4)
    rect(g, '#ffd23f', cx + 6 + (p.lean > 1 ? 2 : 0), cy + 2.5 - p.flap * 0.5, 2, 1)
  },
  shioryu(g, p, f) {
    // うしおの竜：S 字にうねる体・クリームのおなか・オレンジのひれ
    const cx = 15 + p.lean
    const cy = 16 + p.bob
    const segs = 7
    for (let i = segs; i >= 0; i--) {
      const t = i / segs
      const x = cx - 10 + t * 16
      const y = cy + 6 - Math.sin(t * Math.PI * 1.6 + f * 0.6) * 4 - t * 4
      const r = 2.2 + t * 1.6
      ell(g, '#1f8a9a', x + 0.5, y + 0.8, r, r)
      ell(g, '#2fb5c9', x, y, r - 0.4, r - 0.6)
      ell(g, '#f4ead6', x + 0.3, y + r * 0.45, r * 0.6, r * 0.35)
      if (i % 2 === 0) poly(g, '#ff9f6b', [x - 1, y - r + 0.5, x + 0.5, y - r - 2.5, x + 1.5, y - r + 0.5])
    }
    // 尾びれ
    poly(g, '#ff9f6b', [cx - 11, cy + 6, cx - 15, cy + 3, cx - 14, cy + 9])
    // あたま
    const hx = cx + 8
    const hy = cy - 5
    blob(g, hx, hy, 4.5, 3.5, '#2fb5c9', '#1f8a9a', '#9ae6ea')
    rect(g, '#f4ead6', hx + 1, hy + 1, 4, 1.5)
    poly(g, '#ff9f6b', [hx - 3, hy - 2, hx - 6, hy - 6, hx - 1, hy - 3])
    // ひげ
    for (const dy of [0, 1.5]) {
      const w = Math.sin(f + dy) * 0.8
      rect(g, '#f4ead6', hx + 4, hy + dy, 2, 0.5)
      rect(g, '#f4ead6', hx + 5.5, hy + dy + 0.5 + w, 1.5, 0.5)
    }
    eyes(g, [hx + 1.5], hy - 1, p.eye)
    if (p.mouth) rect(g, '#7a1f3d', hx + 2, hy + 1.5, 2, 1)
  },
  hoshikujira(g, p, f) {
    // ほしぞらのくじら：紺の体に星もよう・水色のおなか
    const cx = 16 + p.lean
    const cy = 16 + p.bob
    // しっぽ
    const tw = Math.sin(f * 0.9) * 1.5
    poly(g, '#1f2a5e', [cx - 10, cy, cx - 16, cy - 5 + tw, cx - 13, cy + tw, cx - 16, cy + 5 + tw])
    blob(g, cx, cy, 12, 7.5 - p.sq * 0.4, '#2a3a7a', '#1a2350', '#5a6ab0')
    ell(g, '#9fd8ff', cx + 2, cy + 3.5, 8, 3)
    for (let i = 0; i < 4; i++) rect(g, '#7ab8e0', cx - 4 + i * 2.5, cy + 2, 0.5, 3)
    // 星もよう
    for (const [sx, sy] of [[-6, -3], [-2, -5], [3, -4], [-8, 1], [6, -2]] as const) {
      rect(g, '#fff27a', cx + sx, cy + sy, 1, 1)
      rect(g, '#fff27a', cx + sx - 0.5, cy + sy + 0.25, 2, 0.5)
    }
    // むなびれ
    poly(g, '#1a2350', [cx - 1, cy + 4, cx - 5, cy + 9 - p.flap, cx + 2, cy + 6])
    // 潮ふき（きらきら）
    if ((f + 1) % 3 === 0 || p.eye === 'happy') {
      rect(g, '#cfeeff', cx - 1, cy - 11, 1, 3)
      rect(g, '#cfeeff', cx - 3, cy - 12, 1, 2)
      rect(g, '#cfeeff', cx + 1, cy - 12, 1, 2)
    }
    eyes(g, [cx + 7], cy - 1, p.eye, '#0d1530')
    if (p.mouth) rect(g, '#0d1530', cx + 8, cy + 2, 3, 1)
    else rect(g, '#0d1530', cx + 8, cy + 2, 3, 0.5)
  },
  togebug(g, p, f) {
    // とげむし：とがった甲羅の小さな虫。足が 6 本
    const cx = 16 + p.lean
    const cy = 24 + p.bob * 0.5
    for (let i = 0; i < 3; i++) {
      const lx = cx - 5 + i * 5
      const s = (i % 2 ? 1 : -1) * p.step
      rect(g, '#1a3a38', lx + s, cy + 3, 1, 4)
      rect(g, '#1a3a38', lx + s - 1, cy + 6, 2, 1)
    }
    blob(g, cx, cy, 9, 5.5 - p.sq * 0.5, '#2a6f6a', '#1a4a48', '#5fb8a8')
    for (let i = 0; i < 5; i++) {
      const sx = cx - 7 + i * 3.4
      poly(g, i % 2 ? '#ff3bd4' : '#d01fb0', [sx - 1.5, cy - 3, sx, cy - 8 - (i === 2 ? 2 : 0), sx + 1.5, cy - 3])
    }
    ell(g, '#1a3a38', cx + 9, cy + 1, 3, 2.5)
    rect(g, '#ff3b5c', cx + 9.5, cy, 1.5, 1)
    if (p.eye === 'angry' || p.mouth) {
      rect(g, '#ffd23f', cx + 12, cy + 1, 2, 0.5)
      rect(g, '#ffd23f', cx + 12, cy + 2.5, 2, 0.5)
    }
    // こわれたデータの粒
    if (f % 2 === 0) rect(g, '#3bf2ff', cx - 3, cy - 1, 1, 1)
  },
  yamikage(g, p, f) {
    // よるのかげ：ゆらめく紫の炎のようなもの。光る目
    const cx = 16 + p.lean
    const cy = 16 + p.bob
    for (let i = 0; i < 4; i++) {
      const w = Math.sin(f * 1.3 + i) * 1.5
      poly(g, '#2a1a50', [cx - 6 + i * 4, cy + 4, cx - 5 + i * 4 + w, cy + 11 + (i % 2) * 2, cx - 3 + i * 4, cy + 4])
    }
    ell(g, '#2a1a50', cx, cy, 8, 7)
    ell(g, '#3a2a6a', cx - 0.5, cy - 0.5, 7, 6)
    // 頭の炎
    const fl = Math.sin(f * 1.7) * 1.5
    poly(g, '#3a2a6a', [cx - 5, cy - 4, cx - 2 + fl, cy - 14, cx + 1, cy - 6])
    poly(g, '#5a3a9a', [cx - 1, cy - 5, cx + 3 - fl, cy - 12, cx + 5, cy - 4])
    poly(g, '#7a5ac0', [cx - 2, cy - 5, cx + fl * 0.5, cy - 9, cx + 2, cy - 5])
    if (p.eye === 'closed') {
      rect(g, '#ffe14a', cx, cy - 1, 2, 0.5)
      rect(g, '#ffe14a', cx + 4, cy - 1, 2, 0.5)
    } else {
      ell(g, '#ffe14a', cx + 1, cy - 1, 1.4, p.eye === 'angry' ? 0.8 : 1.4)
      ell(g, '#ffe14a', cx + 5, cy - 1, 1.4, p.eye === 'angry' ? 0.8 : 1.4)
    }
    if (p.mouth) for (let i = 0; i < 4; i++) rect(g, '#ffe14a', cx + i * 1.2, cy + 2.5 + (i % 2) * 0.5, 0.5, 0.5)
  },
  gougan(g, p, f) {
    // マグマいわ：岩のかたまりの巨人。すきまからマグマが光る
    const cx = 16 + p.lean
    const cy = 20 + p.bob * 0.5
    rect(g, '#4f4740', cx - 7 + p.step, cy + 6, 5, 5)
    rect(g, '#4f4740', cx + 2 - p.step, cy + 6, 5, 5)
    // 胴体（岩をつみ重ねた形）
    poly(g, '#4f4740', [cx - 9, cy + 7, cx - 10, cy - 4, cx - 5, cy - 9, cx + 6, cy - 9, cx + 10, cy - 3, cx + 9, cy + 7])
    poly(g, '#7a6f66', [cx - 8, cy + 5, cx - 9, cy - 4, cx - 4, cy - 8, cx + 5, cy - 8, cx + 8, cy - 3, cx + 7, cy + 5])
    poly(g, '#a89c90', [cx - 7, cy - 4, cx - 4, cy - 7, cx, cy - 7, cx - 3, cy - 3])
    // マグマのひび
    const glow = f % 2 ? '#ff9a3a' : '#ff6a1a'
    rect(g, glow, cx - 3, cy - 2, 1, 5)
    rect(g, glow, cx - 3, cy + 2, 5, 1)
    rect(g, glow, cx + 3, cy - 5, 1, 4)
    rect(g, glow, cx + 4, cy + 3, 1, 3)
    // 頭（小さな岩）+ ひとつ目
    rect(g, '#4f4740', cx - 2, cy - 13, 7, 5)
    rect(g, '#7a6f66', cx - 2, cy - 13, 6, 4)
    ell(g, p.eye === 'closed' ? '#4f4740' : '#ff3b2a', cx + 2.5, cy - 11, 1.4, p.eye === 'angry' ? 0.8 : 1.2)
    // おおきなこぶし
    const ax = p.lean > 1 ? 3 : 0
    rect(g, '#4f4740', cx + 8 + ax, cy - 3 - p.flap, 5, 6)
    rect(g, '#7a6f66', cx + 8 + ax, cy - 3 - p.flap, 4, 5)
    rect(g, '#4f4740', cx - 13, cy - 2 + p.flap, 4, 6)
    rect(g, '#7a6f66', cx - 13, cy - 2 + p.flap, 3, 5)
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


// ---------- 系統の仲間（パーツ指定で描く）----------
/** families.ts の Look（パーツの指定）から 1 コマ描く。右むき、足もとは y=30 */
function critter(g: G, p: Pose, f: number, L: Look) {
  const s = L.s
  const [B, S, H] = L.c
  const dark = L.eye ?? '#1a1530'
  const quad = L.f === 'quad'
  const cx = (quad ? 13 - (s - 1) * 3 : 15) + p.lean
  const bob = p.bob * 0.5 + (p.bob < 0 ? p.bob : 0)
  const wag = Math.round(Math.sin(f * 1.7) * 1.5)
  let rx: number, ry: number, ty: number, hx: number, hy: number, hr: number
  if (quad) {
    rx = 7.5 * s + p.sq * 0.6
    ry = 5 * s - p.sq * 0.5
    ty = 30 - ry - 3 + bob
    hx = cx + 7 * s
    hy = ty - 3.5 * s
    hr = 4.8 * s
  } else if (L.f === 'biped') {
    rx = 6 * s + p.sq * 0.5
    ry = 6.5 * s - p.sq * 0.5
    ty = 30 - ry - 2 + bob
    hx = cx + 1.5
    hy = ty - ry - 2 * s
    hr = 5.2 * s
  } else if (L.f === 'bird') {
    rx = 7 * s + p.sq * 0.6
    ry = 6.5 * s - p.sq * 0.5
    ty = 30 - ry - 3 + bob
    hx = cx + 3 * s
    hy = ty - ry * 0.7
    hr = 4.8 * s
  } else {
    rx = 8 * s + p.sq * 0.7
    ry = 7.5 * s - p.sq * 0.7
    ty = 30 - ry - 1 + bob
    hx = cx + 2
    hy = ty - 1
    hr = rx * 0.8
  }
  const bx = cx - rx + 1.5
  const by = ty + (quad ? 0 : ry * 0.3)
  const sep = L.f !== 'blob'

  // しっぽ
  const tails = L.tails ?? 1
  for (let t = 0; t < tails; t++) {
    const o = t * 3
    if (L.tail === 'cat') {
      for (let i = 0; i < 7; i++) ell(g, i > 4 ? S : B, bx - 1 - i * 1.0 - o * 0.3, by - 1 - i * 1.0 - o + wag * (i / 6), 1.7, 1.7)
    } else if (L.tail === 'dog') {
      ell(g, S, bx - 1, by - 3 - o + wag, 2.6, 3.2)
      ell(g, H, bx - 1.5, by - 4 - o + wag, 1.2, 1.8)
    } else if (L.tail === 'dragon') {
      for (let i = 0; i < 7; i++) ell(g, i % 2 ? B : S, bx - 1 - i * 1.5, by + 1 + Math.sin(f * 0.9 + i * 0.5) * 1.2 - i * 0.2, 3 - i * 0.3, 2.4 - i * 0.28)
      poly(g, L.spike ?? S, [bx - 11, by - 1, bx - 14, by - 3, bx - 12, by + 1])
    } else if (L.tail === 'bird') {
      for (const [dy, c] of [[-3, B], [-1, S], [1, H]] as const) ell(g, c, bx - 2 - Math.abs(dy), by + dy - 1 + wag * 0.5, 4, 1.6)
    } else if (L.tail === 'plug') {
      rect(g, '#3d2a8a', bx - 3, by, 3, 1)
      rect(g, '#3d2a8a', bx - 5, by - 2, 2, 3)
      rect(g, '#ffd23f', bx - 8, by - 3, 3, 4)
    } else if (L.tail === 'fish') {
      poly(g, S, [bx, by, bx - 6, by - 4 + wag, bx - 6, by + 4 + wag])
      poly(g, H, [bx, by, bx - 4, by - 2 + wag, bx - 4, by + 2 + wag])
    } else if (L.tail === 'flame') {
      for (let i = 0; i < 4; i++) ell(g, B, bx - 1 - i * 1.6, by + 1 - i * 0.3, 2.4 - i * 0.4, 2 - i * 0.3)
      ell(g, '#ff7a2a', bx - 8 + (f % 2), by - 1, 3, 3.5)
      ell(g, '#ffd23f', bx - 8 + (f % 2), by, 1.7, 2.2)
    }
  }
  // つばさ（体のうしろ側）
  const fl = p.flap
  if (L.wing === 'bird') {
    ell(g, S, cx - 1, ty - ry * 0.2 - fl * 2, 3.2 * s, 5 * s)
    ell(g, H, cx - 1.5, ty - ry * 0.4 - fl * 2, 1.4 * s, 2.5 * s)
  } else if (L.wing === 'dragon' || L.wing === 'bat') {
    const k = L.wing === 'dragon' ? 1.25 : 0.9
    poly(g, S, [cx, ty - ry * 0.6, cx - 10 * s * k, ty - ry - 7 * s * k - fl * 3, cx - 4 * s, ty - ry * 0.1, cx - 8 * s * k, ty + 1])
    poly(g, H, [cx, ty - ry * 0.6, cx - 6 * s * k, ty - ry - 3 * s * k - fl * 2, cx - 3 * s, ty - ry * 0.3])
  } else if (L.wing === 'mech') {
    rect(g, S, cx - 5, ty - ry - 4 - fl, 3, 6)
    rect(g, '#ffd23f', cx - 5, ty - ry + 1 - fl, 3, 1)
    rect(g, S, cx - 2, ty - ry - 6 - fl, 3, 6)
  }
  if (L.shell) {
    ell(g, L.shell, cx - 1, ty - ry * 0.6, rx * 0.8, ry * 0.9)
    ell(g, '#ff9ecb', cx - 1, ty - ry * 0.6, rx * 0.5, ry * 0.55)
    ell(g, L.shell, cx - 1, ty - ry * 0.6, rx * 0.2, ry * 0.25)
  }
  // あし
  if (quad) {
    for (const [dx, sg] of [[-0.75, 1], [-0.3, -1], [0.3, 1], [0.75, -1]] as const) {
      const lx = cx + dx * rx - 1 + p.step * sg * 0.8
      rect(g, S, lx, ty + ry - 1.5, 2.6, 31 - (ty + ry - 1.5))
      rect(g, H, lx, 29.5, 2.6, 1)
    }
  } else if (L.f === 'bird') {
    rect(g, '#ff9f43', cx - 1 + p.step, ty + ry - 1, 1, 31 - (ty + ry - 1))
    rect(g, '#ff9f43', cx + 3 - p.step, ty + ry - 1, 1, 31 - (ty + ry - 1))
    rect(g, '#ff9f43', cx - 2 + p.step, 29.5, 3, 1)
    rect(g, '#ff9f43', cx + 2 - p.step, 29.5, 3, 1)
  } else if (L.f === 'biped') {
    ell(g, S, cx - 3 + p.step, 29.5, 3, 1.8)
    ell(g, S, cx + 3 - p.step, 29.5, 3, 1.8)
  }
  // 胴
  blob(g, quad ? cx - 1 : cx, ty, rx, ry, B, S, H)
  if (L.b) ell(g, L.b, (quad ? cx - 1 : cx) + 1.5, ty + ry * 0.45, rx * 0.55, ry * 0.5)
  if (L.stripe) for (const i of [-1, 0, 1]) rect(g, L.stripe, (quad ? cx - 1 : cx) + i * rx * 0.45 - 0.5, ty - ry + 1.2, 1.6, ry * 1.1)
  if (L.spot) for (const [dx, dy, r] of [[-0.4, -0.3, 1.8], [0.2, 0.3, 1.5], [0.45, -0.4, 1.2]] as const) ell(g, L.spot, cx + dx * rx, ty + dy * ry, r, r)
  if (L.armor) {
    rect(g, L.armor, cx - rx * 0.7, ty - ry * 0.35, rx * 1.3, 2.2)
    rect(g, L.armor, cx - rx * 0.7, ty + ry * 0.25, rx * 1.3, 1.6)
    for (const dx of [-0.5, 0.5]) rect(g, '#ffffff', cx + dx * rx - 0.5, ty - ry * 0.35 + 0.5, 1, 1)
  }
  if (L.spike) for (let i = 0; i < 4; i++) poly(g, L.spike, [cx - rx * 0.7 + i * rx * 0.45, ty - ry + 1.5, cx - rx * 0.55 + i * rx * 0.45, ty - ry - 3, cx - rx * 0.3 + i * rx * 0.45, ty - ry + 1.5])
  if (L.gear) {
    const gx = cx - 1
    const gy = ty - ry - 1
    ell(g, L.gear, gx, gy, 3.4, 3.4)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI + (f % 2) * 0.4
      rect(g, L.gear, gx + Math.cos(a) * 4 - 0.8, gy + Math.sin(a) * 4 - 0.8, 1.8, 1.8)
      rect(g, L.gear, gx - Math.cos(a) * 4 - 0.8, gy - Math.sin(a) * 4 - 0.8, 1.8, 1.8)
    }
    ell(g, S, gx, gy, 1.3, 1.3)
  }
  if (L.cannon) {
    rect(g, S, cx - 2, ty - ry - 3, 6, 3)
    rect(g, '#2a2f3a', cx + 4, ty - ry - 3.5, 5, 2)
    rect(g, H, cx - 2, ty - ry - 3, 6, 0.8)
  }
  if (L.club) {
    rect(g, '#7a5230', cx + rx - 1, ty - 2 - p.lean, 2, 9)
    ell(g, '#5a3a22', cx + rx, ty - 3 - p.lean, 3, 3.6)
    rect(g, '#c9ced6', cx + rx - 1, ty - 4 - p.lean, 1, 1)
  }
  // 頭
  if (L.heads) {
    for (const [dx, dy] of [[-6, -3], [-2, -6]] as const) {
      blob(g, hx + dx, hy + dy, hr * 0.55, hr * 0.5, B, S, H)
      eyes(g, [hx + dx + 1], hy + dy - 1, p.eye, dark)
    }
  }
  if (L.mane) ell(g, L.mane, hx - 1, hy + 0.5, hr + 2.6, hr + 2)
  if (sep) blob(g, hx, hy, hr, hr * 0.92, B, S, H)
  // みみ・つの・かざり
  const ex = (k: number) => hx + k * hr
  const top = hy - hr * 0.85
  if (L.ear === 'cat') {
    poly(g, B, [ex(-0.8), hy - hr * 0.4, ex(-0.7), top - 4 * s, ex(-0.05), top + 0.5])
    poly(g, B, [ex(0.1), top + 0.5, ex(0.75), top - 4 * s, ex(0.95), hy - hr * 0.3])
    poly(g, '#ff9ecb', [ex(-0.65), hy - hr * 0.5, ex(-0.65), top - 2 * s, ex(-0.25), top + 0.5])
    poly(g, '#ff9ecb', [ex(0.25), top + 0.5, ex(0.65), top - 2 * s, ex(0.78), hy - hr * 0.5])
  } else if (L.ear === 'dog') {
    ell(g, S, ex(-0.75), hy + 0.5 + (p.bob < 0 ? -1 : 0), 2.2 * s, 4.2 * s)
    ell(g, S, ex(0.7), hy + 0.8, 1.8 * s, 3.8 * s)
  } else if (L.ear === 'bunny') {
    ell(g, B, ex(-0.4), top - 4 * s, 1.8, 5 * s)
    ell(g, B, ex(0.4), top - 4 * s, 1.8, 5 * s)
  } else if (L.ear === 'horn') {
    poly(g, '#fff0c2', [ex(-0.6), top + 1, ex(-0.5), top - 4 * s, ex(-0.1), top + 1])
    poly(g, '#fff0c2', [ex(0.2), top + 1, ex(0.6), top - 4 * s, ex(0.8), top + 1])
  } else if (L.ear === 'ant') {
    rect(g, S, ex(0.1), top - 4 * s, 1, 4 * s)
    ell(g, '#ff5e5e', ex(0.1) + 0.5, top - 4 * s - 0.5, 1.6, 1.6)
  } else if (L.ear === 'fin') {
    poly(g, S, [ex(-0.9), hy, ex(-1.5), hy - 5, ex(-0.4), hy - hr * 0.6])
    poly(g, H, [ex(-0.9), hy, ex(-1.2), hy - 3, ex(-0.5), hy - hr * 0.5])
  } else if (L.ear === 'tuft') {
    for (const [dx, h] of [[-0.3, 3], [0.1, 4], [0.5, 3]] as const) rect(g, B, ex(dx), top - h + 1, 1.4, h)
  }
  if (L.horn) {
    poly(g, L.horn, [ex(-0.3), top + 1, ex(-0.1), top - 6 * s, ex(0.3), top + 1])
    poly(g, L.horn, [ex(0.4), top + 1, ex(0.75), top - 5 * s, ex(0.95), top + 2])
  }
  if (L.crest) for (const [dx, h] of [[-0.5, 4], [-0.1, 6], [0.3, 5]] as const) poly(g, L.crest, [ex(dx), top + 1, ex(dx + 0.15), top - h * s, ex(dx + 0.45), top + 1])
  if (L.collar) rect(g, L.collar, hx - hr * 0.7, hy + hr * 0.8, hr * 1.1, 1.8)
  if (L.gem) poly(g, L.gem, [hx + 0.5, hy - hr * 0.75, hx + 2, hy - hr * 0.75 + 1.5, hx + 0.5, hy - hr * 0.75 + 3, hx - 1, hy - hr * 0.75 + 1.5])
  // かお
  const fx = sep ? hx : hx + 1
  const fy = sep ? hy : hy - 1
  if (L.visor) {
    rect(g, L.visor, fx - hr * 0.3, fy - 2.5, hr * 1.2, 3)
    rect(g, '#ffffff', fx - hr * 0.3 + 1, fy - 2.5, 1, 1)
    rect(g, dark, fx + hr * 0.3, fy - 1.5, 1, 1.5)
  } else if (L.cyclops) {
    ell(g, '#ffffff', fx + 2, fy, hr * 0.5, hr * 0.45)
    ell(g, '#ff3b5e', fx + 3, fy, hr * 0.28, hr * 0.28)
    rect(g, dark, fx + 3, fy - 0.5, 1, 1.5)
    if (p.eye === 'closed') ell(g, B, fx + 2, fy, hr * 0.52, hr * 0.46)
  } else eyes(g, [fx + 0.5, fx + hr * 0.6 + 1.5], fy - 1, p.eye, dark)
  if (L.beak) {
    const bxp = hx + hr * 0.85
    if (p.mouth) {
      poly(g, '#ff9f43', [bxp - 1, hy - 1, bxp + 4, hy - 1.5, bxp - 1, hy + 0.5])
      poly(g, '#e8662a', [bxp - 1, hy + 1.5, bxp + 3.5, hy + 2.5, bxp - 1, hy + 3.5])
    } else poly(g, '#ff9f43', [bxp - 1, hy - 0.5, bxp + 4, hy + 0.8, bxp - 1, hy + 2.5])
  } else if (quad && !L.visor) {
    ell(g, H, hx + hr * 0.75, hy + hr * 0.35, hr * 0.5, hr * 0.38)
    rect(g, dark, hx + hr * 0.95, hy + hr * 0.1, 1.5, 1)
  }
  if (!L.beak && !L.cyclops) {
    const mx = fx + hr * 0.4
    const my = fy + hr * 0.5 + 1
    if (p.mouth) rect(g, '#7a1f3d', mx, my, 2.5, 2)
    else if (!quad) rect(g, dark, mx, my + 0.5, 2, 0.8)
  }
  if (L.fang) {
    poly(g, '#ffffff', [fx + hr * 0.4, fy + hr * 0.5 + 1, fx + hr * 0.4 + 1.2, fy + hr * 0.5 + 1, fx + hr * 0.4 + 0.6, fy + hr * 0.5 + 3])
    poly(g, '#ffffff', [fx + hr * 0.4 + 2.2, fy + hr * 0.5 + 1, fx + hr * 0.4 + 3.4, fy + hr * 0.5 + 1, fx + hr * 0.4 + 2.8, fy + hr * 0.5 + 3])
  }
}

/** きょうの系統の仲間の見た目（id → Look） */
const LOOKS: Record<string, Look> = {}
export const NEW_SKILLS: Record<string, { name: string; kind: 'shot' | 'burst' | 'dash' | 'rain' | 'heal' | 'wave'; color: string; mult: number }> = {}
const NEW_SPECIES = {} as Record<NewId, Species>
for (const ch of CHAINS) {
  const specs = ch.family === 'water' ? WATER_NEW : FAMILIES[ch.family as keyof typeof FAMILIES]
  ch.ids.forEach((id, i) => {
    const sp = specs.find((x) => x.id === id)
    if (!sp) return
    const tier = ([1, 2, 2, 3, 3, 4] as const)[i]
    const v = i === 1 || i === 3 ? 1 : i === 2 || i === 4 ? -1 : 0
    const b = TIER_BASE[tier]
    LOOKS[id] = sp.look
    NEW_SKILLS[id] = { name: sp.skill[0], kind: sp.skill[1], color: sp.skill[2], mult: sp.skill[3] }
    NEW_SPECIES[id as NewId] = {
      id: id as NewId, name: sp.name, kind: sp.kind, height: b.h, hp: Math.round(b.hp * (1 - v * 0.1)), atk: Math.round(b.atk * (1 + v * 0.15)),
      speed: FAMILY_SPEED[ch.family as Exclude<Family, 'plain'>], temper: 'calm', float: sp.float, tier,
    }
  })
}
// 隠しの姿（secrets.ts）：見た目・技・ステータスを足す
for (const s of SECRET_FORMS) {
  LOOKS[s.id] = s.look
  NEW_SKILLS[s.id] = { name: s.skill[0], kind: s.skill[1], color: s.skill[2], mult: s.skill[3] }
}
export const SPECIES: Record<SpeciesId, Species> = { ...OLD_SPECIES, ...NEW_SPECIES, ...secretSpecies() }
export const familyOf = (id: SpeciesId): Family => (FAMILY_OF[id] as Family | undefined) ?? 'plain'
/** つぎの姿：系統ごとの枝分かれ → なければ 昔からの BRANCH */
export function nextForm(id: SpeciesId, tier: 1 | 2 | 3, care: Care): SpeciesId {
  return (EVOLVE[id]?.[care] as SpeciesId | undefined) ?? BRANCH[tier][care]
}
export { BABY, EGG_COLORS, FAMILY_NAME, STAGE_EGGS, type EggKind } from './families'

const cache = new Map<SpeciesId, Sheet>()
export function sheetFor(id: SpeciesId): Sheet {
  let s = cache.get(id)
  if (!s) {
    // 2 倍の解像度（68×64）で描き、自動陰影と色付き輪郭をかける
    const frames = POSES.map((p, i) =>
      pixelSprite(68, 64, (g) => {
        g.scale(2, 2)
        ;(DRAW_OLD[id as OldId] ?? ((gg: G, pp: Pose, ff: number) => critter(gg, pp, ff, LOOKS[id])))(g, p, i)
      }, '#1a1530', { shade: true }),
    )
    s = buildSheet(frames, ANIMS)
    cache.set(id, s)
  }
  return s
}

/** 箱庭のキャラの見た目（2.5D のドット絵 / 3D モデル）に共通の口 */
export interface MonsterView {
  readonly sprite: import('three').Object3D
  facing: 1 | -1
  play(name: string): void
  update(dt: number): void
  setHeight(h: number): void
  setSpecies(id: SpeciesId, height: number): void
  dispose(): void
}

/** 2.5D のドット絵キャラ（やられた時は赤く色づく） */
export class SpriteMonster extends SpriteAnim implements MonsterView {
  private cur = 'idle'
  constructor(id: SpeciesId, height: number) {
    super(sheetFor(id), height, 'idle')
  }
  setSpecies(id: SpeciesId, height: number) {
    this.setSheet(sheetFor(id), height)
  }
  play(name: string, restart = false) {
    this.cur = name
    super.play(name, restart)
  }
  update(dt: number) {
    super.update(dt)
    this.material.color.set(this.cur === 'hurt' ? '#ff9a9a' : '#ffffff')
  }
}
