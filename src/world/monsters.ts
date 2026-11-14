import { PAD, SpriteAnim, buildSheet, pixelSprite, type AnimDef, type Sheet } from './sprites'
import { SECRET_FORMS, secretSpecies, type SecretId } from './secrets'
import { CHAINS, FAMILIES, FAMILY_OF, FAMILY_SPEED, TIER_BASE, WATER_NEW, EVOLVE, type Look, type Family } from './families'

/**
 * オリジナルのモンスター 14 種（仲間になれる 11 種 + 敵 4 種のうち ノイズ を含む）。すべてコードで描く 2.5D ドット絵（色・陰影・アウトライン付き）。
 * 1 種につき 12 コマ：idle×2 / walk×4 / happy / eat×2 / sleep / attack / hurt
 */
type OldId =
  | 'mebu' | 'pikori' | 'gorota' | 'fuwari' | 'giaru' | 'noiz' | 'hireru' | 'mofuru'
  | 'garudora' | 'shioryu' | 'hoshikujira' | 'togebug' | 'yamikage' | 'gougan'
/** 敵の亜種 6 種とボス 3 種（ステージや敵軍の波で、もとの敵に混ざって出る） */
type FoeId = 'shimonoiz' | 'homurabug' | 'tetsubug' | 'fuguran' | 'shirokage' | 'ganmaru' | 'hatenashi' | 'kazanou' | 'sangogani'
/** 系統の仲間（families.ts） */
export type NewId =
  | 'nejiru' | 'boruta' | 'kacha' | 'tankuru' | 'kurokko' | 'metarion' | 'ryuuko' | 'honora' | 'kazeru' | 'bakuryu' | 'raigaru' | 'tenryuu' | 'mimiko' | 'tsumeru' | 'yoruna' | 'torahime' | 'tsukineko' | 'nekomata' | 'wanko' | 'kibaru' | 'fuwan' | 'garufu' | 'mamoru' | 'rouga' | 'piyo' | 'habataki' | 'utaru' | 'hayate' | 'hoshiro' | 'hikaritori' | 'gabuko' | 'oniko' | 'nurari' | 'ogaran' | 'bakeran' | 'yamatan' | 'shizuku' | 'awako' | 'kaimaru'
export type SpeciesId = OldId | NewId | FoeId | SecretId

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
  /** 敵軍のボス（HP バーが大きい） */
  boss?: boolean
}

/** 進化に必要な経験値（段階ごと） */
export const XP_NEED: Record<1 | 2 | 3, number> = { 1: 16, 2: 44, 3: 85 }

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

type EyeMode = 'open' | 'closed' | 'happy' | 'angry' | 'hurt' | 'sleepy' | 'worry' | 'hungry'
/** 表情のしるし：おなか（よだれ）/ ねむい（z）/ おこり（#）/ こまった（あせ）/ うれしい（ハート） */
type Mark = '' | 'drool' | 'z' | 'vein' | 'sweat' | 'heart'
interface Pose {
  bob: number; sq: number; step: number; eye: EyeMode; mouth: number; lean: number; flap: number; mark: Mark
}
/** mouth: 0 = とじる / 1 = あける / 2 = にっこり / 3 = こまり / 4 = よだれ / 5 = くいしばり */
const P = (o: Partial<Pose>): Pose => ({ bob: 0, sq: 0, step: 0, eye: 'open', mouth: 0, lean: 0, flap: 0, mark: '', ...o })

const POSES: Pose[] = [
  P({}), P({ bob: 1, sq: 1 }), // idle
  P({ step: -1, flap: 1 }), P({ bob: 1, sq: 1 }), P({ step: 1, flap: -1 }), P({ bob: 1, sq: 1 }), // walk
  P({ bob: -3, eye: 'happy', flap: 2, mouth: 1 }), // happy
  P({ mouth: 1, lean: 1 }), P({ bob: 1, sq: 1, lean: 1 }), // eat
  P({ sq: 2, bob: 1, eye: 'closed' }), // sleep
  P({ lean: 3, eye: 'angry', mouth: 1, flap: 2 }), // attack
  P({ lean: -2, eye: 'hurt', sq: -1 }), // hurt
  // ---- 表情（12〜21）：おなかすいた / ねむい / うれしい / おこっている / こまっている（それぞれ 2 コマ）----
  P({ eye: 'hungry', mouth: 4, sq: 1, mark: 'drool' }), P({ eye: 'hungry', mouth: 4, bob: 1, sq: 2, mark: 'drool' }),
  P({ eye: 'sleepy', lean: -1, mark: 'z' }), P({ eye: 'sleepy', mouth: 1, bob: 1, sq: 1, lean: -2, mark: 'z' }),
  P({ eye: 'happy', mouth: 2, flap: 1, mark: 'heart' }), P({ eye: 'happy', mouth: 2, bob: -1, flap: 2, mark: 'heart' }),
  P({ eye: 'angry', mouth: 5, lean: 1, mark: 'vein' }), P({ eye: 'angry', mouth: 5, lean: 1, bob: 1, sq: 1, mark: 'vein' }),
  P({ eye: 'worry', mouth: 3, sq: 1, mark: 'sweat' }), P({ eye: 'worry', mouth: 3, bob: 1, sq: 2, mark: 'sweat' }),
]

const ANIMS = {
  idle: { frames: [0, 1], fps: 2.5, loop: true },
  walk: { frames: [2, 3, 4, 5], fps: 8, loop: true },
  happy: { frames: [6, 0], fps: 4, loop: true },
  eat: { frames: [7, 8], fps: 5, loop: true },
  sleep: { frames: [9], fps: 1, loop: true },
  attack: { frames: [10], fps: 1, loop: true },
  hurt: { frames: [11], fps: 1, loop: true },
  hungry: { frames: [12, 13], fps: 1.8, loop: true },
  sleepy: { frames: [14, 15], fps: 1.1, loop: true },
  glad: { frames: [16, 17], fps: 3, loop: true },
  angry: { frames: [18, 19], fps: 5, loop: true },
  worry: { frames: [20, 21], fps: 3, loop: true },
}
/** 表情のアニメ名（World が状態から選ぶ） */
export type Face = 'hungry' | 'sleepy' | 'glad' | 'angry' | 'worry'

// ---------- 描画ヘルパー ----------
type G = CanvasRenderingContext2D
/** 描いた子の「からだ」「あたま」「くち」の位置（34×32 の座標）と からだの色。もよう・表情のしるしを置くのに使う */
interface Geom { bx: number; by: number; rx: number; ry: number; hx: number; hy: number; hr: number; mx: number; my: number; cols: string[] }
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
/** まゆ：inner = 目の内がわが +x か -x か。angry は内がわが下がり、worry は内がわが上がる */
const brow = (g: G, c: string, x: number, y: number, inner: 1 | -1, mood: 'angry' | 'worry') => {
  const ox = x - inner * 1.7
  const ix = x + inner * 0.6
  const oy = mood === 'angry' ? y - 3.5 : y - 2.5
  const iy = mood === 'angry' ? y - 2.5 : y - 3.5
  rect(g, c, ox - 0.75, oy, 1.5, 0.5)
  rect(g, c, ix - 0.75, iy, 1.5, 0.5)
}
const eyes = (g: G, xs: number[], y: number, mode: Pose['eye'], color = '#1a1530') => {
  xs.forEach((x, i) => {
    const inner: 1 | -1 = xs.length === 1 ? -1 : i === 0 ? 1 : -1
    if (mode === 'closed') rect(g, color, x - 1, y + 1, 3, 1)
    else if (mode === 'sleepy') {
      // まぶたが半分おりた目
      rect(g, color, x - 1, y + 0.5, 2, 1.5)
      rect(g, color, x - 1.5, y, 3, 0.5)
    } else if (mode === 'happy') {
      rect(g, color, x - 1, y + 1, 1, 1)
      rect(g, color, x, y, 1, 1)
      rect(g, color, x + 1, y + 1, 1, 1)
    } else if (mode === 'hurt') {
      rect(g, color, x - 1, y - 1, 1, 1)
      rect(g, color, x + 1, y - 1, 1, 1)
      rect(g, color, x, y, 1, 1)
      rect(g, color, x - 1, y + 1, 1, 1)
      rect(g, color, x + 1, y + 1, 1, 1)
    } else if (mode === 'hungry') {
      // うるうるの大きな目
      rect(g, color, x - 1, y - 1.5, 2.5, 3.5)
      rect(g, '#ffffff', x - 1, y - 1.5, 1, 1)
      rect(g, '#ffffff', x + 0.5, y + 0.5, 1, 1)
    } else {
      rect(g, color, x - 1, y - 1, 2, 3)
      rect(g, '#ffffff', x - 1, y - 1, 1, 1)
      rect(g, '#ffffff', x + 0.5, y + 1, 0.5, 0.5)
      if (mode === 'angry' || mode === 'worry') brow(g, color, x, y, inner, mode)
      if (mode === 'worry') rect(g, '#ffffff', x + 0.5, y - 0.5, 0.5, 0.5)
    }
  })
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


// ---------- 敵の亜種とボス ----------
const DRAW_FOE: Record<FoeId, (g: G, p: Pose, f: number) => void> = {
  shimonoiz(g, p, f) {
    // しものノイズ：六つの氷のかけらを広げた、雪の結晶のようなデータのかたまり
    const cx = 16 + p.lean
    const cy = 19 + p.bob * 0.5
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3 + Math.PI / 6
      const len = (k % 2 ? 10 : 11.5) - p.sq * 0.4
      const tx = cx + Math.cos(a) * len
      const ty = cy + Math.sin(a) * len * 0.92
      const l1 = [cx + Math.cos(a - 0.5) * 5, cy + Math.sin(a - 0.5) * 5]
      const l2 = [cx + Math.cos(a + 0.5) * 5, cy + Math.sin(a + 0.5) * 5]
      poly(g, '#4aa6d6', [l1[0], l1[1], tx, ty, l2[0], l2[1]])
      poly(g, '#c8f1ff', [l1[0], l1[1], tx, ty, (l1[0] + l2[0]) / 2, (l1[1] + l2[1]) / 2])
      if (k % 2 === 0) rect(g, '#ffffff', tx - Math.cos(a) * 3 - 0.5, ty - Math.sin(a) * 3 - 0.5, 1, 1)
    }
    blob(g, cx, cy, 6.8, 6.2 - p.sq * 0.5, '#9fe0f5', '#4aa6d6', '#f2fdff')
    // こごえたデータの粒
    for (let i = 0; i < 4; i++) {
      const h = Math.sin((i + 2) * 53.7 + f * 9.3) * 43758.5
      const n = h - Math.floor(h)
      rect(g, '#ffffff', cx - 11 + Math.floor(n * 22), cy - 11 + ((i * 7 + f * 3) % 22), 1, 1)
    }
    eyes(g, [cx - 0.5, cx + 3.5], cy - 1, p.eye, '#14305a')
    if (p.mouth) rect(g, '#14305a', cx + 0.5, cy + 2.5, 2, 1.5)
    else rect(g, '#14305a', cx + 0.5, cy + 3, 2, 0.5)
  },
  homurabug(g, p, f) {
    // ホムラバグ：背中にほのおをもやす赤いむし
    const cx = 16 + p.lean
    const cy = 24 + p.bob * 0.5
    for (let i = 0; i < 3; i++) {
      const lx = cx - 5 + i * 5
      const s = (i % 2 ? 1 : -1) * p.step
      rect(g, '#3a1a14', lx + s, cy + 3, 1, 4)
      rect(g, '#3a1a14', lx + s - 1, cy + 6, 2, 1)
    }
    blob(g, cx, cy, 9, 5.5 - p.sq * 0.5, '#d8532a', '#8f2a14', '#ff9a6a')
    for (let i = 0; i < 5; i++) {
      const fx = cx - 7 + i * 3.4
      const fl = Math.sin(f * 1.7 + i * 1.3) * 1.2
      const top = cy - 9 - (i === 2 ? 3 : i % 2) - (f % 2)
      poly(g, '#ff7a2a', [fx - 2, cy - 3, fx + fl, top, fx + 2, cy - 3])
      poly(g, '#ffd23f', [fx - 1, cy - 3, fx + fl * 0.6, top + 3, fx + 1, cy - 3])
    }
    ell(g, '#3a1a14', cx + 9, cy + 1, 3, 2.5)
    rect(g, '#ffe14a', cx + 9.5, cy, 1.5, 1)
    if (p.eye === 'angry' || p.mouth) {
      rect(g, '#ffd23f', cx + 12, cy + 1, 2, 0.5)
      rect(g, '#ffd23f', cx + 12, cy + 2.5, 2, 0.5)
    }
    if (f % 2 === 0) rect(g, '#ffd23f', cx - 3, cy - 1, 1, 1)
  },
  tetsubug(g, p) {
    // テツバグ：はがねのよろいをまとった、のっそりしたむし。前に一本のドリルのつの
    const cx = 15 + p.lean
    const cy = 24 + p.bob * 0.5
    for (let i = 0; i < 4; i++) {
      const lx = cx - 7 + i * 4.5
      const s = (i % 2 ? 1 : -1) * p.step
      rect(g, '#3d4658', lx + s, cy + 3, 1.5, 4)
      rect(g, '#3d4658', lx + s - 1, cy + 6, 3, 1)
    }
    blob(g, cx, cy, 10.5, 7 - p.sq * 0.5, '#8e9bb0', '#566179', '#d6dfec')
    // よろいの板と、きいろの注意しま
    for (const dx of [-6, -1, 4]) rect(g, '#566179', cx + dx, cy - 6, 0.5, 11)
    for (let i = 0; i < 6; i++) rect(g, i % 2 ? '#2a2f3a' : '#ffd23f', cx - 8 + i * 3, cy + 1, 1.5, 2.5)
    for (const [dx, dy] of [[-8, -3], [-3, -5], [3, -5], [7, -2]] as const) rect(g, '#e8eef8', cx + dx, cy + dy, 1, 1)
    ell(g, '#566179', cx + 10.5, cy + 1.5, 3.4, 3)
    ell(g, '#8e9bb0', cx + 10, cy + 0.5, 2.2, 1.6)
    // ドリルのつの
    poly(g, '#d6dfec', [cx + 12, cy - 1.5, cx + 18, cy + 0.8, cx + 12, cy + 2.5])
    poly(g, '#8e9bb0', [cx + 12, cy + 0.5, cx + 18, cy + 0.8, cx + 12, cy + 2.5])
    rect(g, '#2a2f3a', cx + 14, cy + 0.2, 0.5, 1.5)
    // あかい目のスリット
    if (p.eye === 'closed' || p.eye === 'sleepy') rect(g, '#2a2f3a', cx + 8.5, cy, 3, 0.5)
    else {
      rect(g, '#ff3b2a', cx + 8.5, cy - 0.5, 3, p.eye === 'angry' ? 1 : 1.5)
      rect(g, '#ffd0c0', cx + 8.5, cy - 0.5, 1, 0.5)
    }
  },
  fuguran(g, p, f) {
    // フグラン：おこるとふくらんでトゲだらけになる、ふわふわ浮かぶまるい魚
    const cx = 16 + p.lean
    const cy = 17 + p.bob
    const r = 8.5 - p.sq * 0.5
    const w = Math.sin(f * 1.3) * 1.5
    poly(g, '#ffa53a', [cx - r + 1, cy, cx - r - 5, cy - 4 + w, cx - r - 5, cy + 4 + w])
    poly(g, '#ffd08a', [cx - r + 1, cy, cx - r - 4, cy - 2 + w, cx - r - 4, cy + 2 + w])
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + 0.2
      if (Math.cos(a) > 0.75 && Math.sin(a) > -0.2 && Math.sin(a) < 0.7) continue
      const bx = cx + Math.cos(a) * (r - 0.5)
      const by = cy + Math.sin(a) * (r - 0.5)
      const tx = cx + Math.cos(a) * (r + 3.2 + (p.lean > 1 ? 1 : 0))
      const ty = cy + Math.sin(a) * (r + 3.2 + (p.lean > 1 ? 1 : 0))
      poly(g, '#ffa53a', [bx - Math.sin(a) * 1.4, by + Math.cos(a) * 1.4, tx, ty, bx + Math.sin(a) * 1.4, by - Math.cos(a) * 1.4])
    }
    poly(g, '#ffa53a', [cx - 3, cy - r + 1, cx, cy - r - 5 - p.flap, cx + 3, cy - r + 1])
    blob(g, cx, cy, r, r - 0.5, '#5cc8a8', '#2a8a74', '#c0f5e4')
    ell(g, '#e4fbf0', cx + 1, cy + 4, 6, 3)
    ell(g, '#ffa53a', cx - 1, cy + 2 - p.flap * 0.5, 3, 1.8)
    eyes(g, [cx + 2.5, cx + 6.5], cy - 3, p.eye, '#1a3a30')
    ell(g, '#ff7a8a', cx + 8.5, cy + 3, 2.2, 1.7)
    if (p.mouth) ell(g, '#7a1f3d', cx + 9, cy + 3, 1.2, 1.2)
  },
  shirokage(g, p, f) {
    // シロカゲ：よるだけ現れる、フードの中がまっくらな白いかげ。あたまの上に三日月
    const cx = 16 + p.lean
    const cy = 15 + p.bob
    for (let i = 0; i < 5; i++) {
      const w = Math.sin(f * 1.1 + i * 1.2) * 1.5
      poly(g, '#8aa0cc', [cx - 9 + i * 4.2, cy + 8, cx - 8 + i * 4.2 + w, cy + 15 + (i % 2) * 2, cx - 5 + i * 4.2, cy + 8])
    }
    poly(g, '#8aa0cc', [cx - 10, cy + 10, cx - 8, cy - 4, cx - 3, cy - 9.5, cx + 4, cy - 9.5, cx + 9, cy - 4, cx + 10, cy + 10])
    poly(g, '#c9d8f2', [cx - 9, cy + 9, cx - 7, cy - 3.5, cx - 2.5, cy - 8.5, cx + 3.5, cy - 8.5, cx + 8, cy - 3.5, cx + 9, cy + 9])
    poly(g, '#eef4ff', [cx - 8, cy + 3, cx - 6.5, cy - 3, cx - 2.5, cy - 8, cx - 2, cy - 2])
    ell(g, '#141b38', cx + 3, cy - 1.5, 5.2, 5.6)
    ell(g, '#0a0f26', cx + 3.5, cy - 1.2, 4.2, 4.6)
    // 三日月のかんむり
    g.save()
    g.translate(cx + 0.5, cy - 13.5)
    g.rotate(-Math.PI / 2)
    const cr = (k: number, c: string) => {
      const pts: number[] = []
      for (let i = 0; i <= 10; i++) pts.push(4.6 * k * Math.cos(-Math.PI / 2 - (i * Math.PI) / 10), 4.6 * k * Math.sin(-Math.PI / 2 - (i * Math.PI) / 10))
      for (let i = 10; i >= 0; i--) pts.push(3.3 * k * Math.cos(-Math.PI / 2 - (i * Math.PI) / 10), 4.4 * k * Math.sin(-Math.PI / 2 - (i * Math.PI) / 10))
      poly(g, c, pts)
    }
    cr(1, '#d8c47a')
    cr(0.85, '#fff1a8')
    g.restore()
    if (p.eye === 'closed' || p.eye === 'sleepy') {
      rect(g, '#ff4d6d', cx + 0.5, cy - 1, 2, 0.5)
      rect(g, '#ff4d6d', cx + 4.5, cy - 1, 2, 0.5)
    } else {
      const k = p.eye === 'angry' ? 0.8 : 1.5
      ell(g, '#ff4d6d', cx + 1.5, cy - 1.5, 1.4, k)
      ell(g, '#ff4d6d', cx + 5.5, cy - 1.5, 1.4, k)
      rect(g, '#ffffff', cx + 1, cy - 2.2, 0.5, 0.5)
      rect(g, '#ffffff', cx + 5, cy - 2.2, 0.5, 0.5)
    }
    if (p.mouth) for (let i = 0; i < 4; i++) rect(g, '#ffffff', cx + 1.5 + i * 1.2, cy + 2 + (i % 2) * 0.5, 0.5, 1)
  },
  ganmaru(g, p, f) {
    // ガンマル：コケとクリスタルをのせた、丸い岩のかたまり。ころがって体当たりする
    const cx = 15 + p.lean
    const cy = 21 + p.bob * 0.5
    rect(g, '#5a5048', cx - 5 + p.step, cy + 7, 4, 3)
    rect(g, '#5a5048', cx + 2 - p.step, cy + 7, 4, 3)
    ell(g, '#8a8076', cx - 10, cy + 2 + p.flap * 0.4, 2.6, 3.4)
    ell(g, '#8a8076', cx + 10 + (p.lean > 1 ? 2 : 0), cy + 2 - p.flap * 0.4, 2.6, 3.4)
    blob(g, cx, cy, 10.5, 9.5 - p.sq * 0.6, '#9a8f84', '#625850', '#cfc4b8')
    // ひび・コケ・クリスタル
    rect(g, '#4a4038', cx - 6, cy - 2, 0.5, 5)
    rect(g, '#4a4038', cx - 6, cy + 2.5, 4, 0.5)
    rect(g, '#4a4038', cx + 5, cy + 4, 0.5, 4)
    ell(g, '#5f9a4e', cx - 6, cy - 6.5, 3.6, 1.8)
    ell(g, '#8fcf70', cx - 6.5, cy - 7, 2, 0.9)
    ell(g, '#5f9a4e', cx + 7, cy + 5, 2.2, 1.2)
    poly(g, '#d63fa8', [cx + 1, cy - 8, cx + 2.5, cy - 15, cx + 4, cy - 8])
    poly(g, '#ff8ad8', [cx + 1.5, cy - 8, cx + 2.5, cy - 14, cx + 3, cy - 8])
    poly(g, '#d63fa8', [cx + 5, cy - 7, cx + 7, cy - 12, cx + 8, cy - 6])
    rect(g, '#625850', cx + 1, cy - 5, 8, 1.5)
    eyes(g, [cx + 3, cx + 7], cy - 2, p.eye, '#2a1a14')
    if (p.mouth) rect(g, '#3b2030', cx + 4, cy + 2.5, 3, 2)
    else rect(g, '#3b2030', cx + 4, cy + 3, 3, 0.8)
    if (f % 2 && p.step) rect(g, '#cfc4b8', cx - 9, cy + 9, 1, 1)
  },

  // ---- ボス：大きな専用の姿 ----
  hatenashi(g, p, f) {
    // ハテナシ：ノイズのかたまりが育った王。三つの目と、はてしなく流れるデータの尾
    const cx = 15 + p.lean
    const cy = 17 + p.bob * 0.5
    const pts: number[] = []
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2
      const r = (i % 2 ? 9 : 13.5) - p.sq * 0.6 + (((i * 7 + f * 2) % 3) - 1) * 0.7
      pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.78)
    }
    // 流れるデータの尾
    for (let k = 0; k < 4; k++) {
      const bx = cx - 9 + k * 5
      for (let j = 0; j < 5; j++) {
        const wob = Math.round(Math.sin(f * 1.5 + k + j * 0.9) * 1.5)
        rect(g, (j + k) % 2 ? '#3bf2ff' : '#ff3bd4', bx + wob, cy + 8 + j * 2.2, 2, 1.5 - j * 0.1)
      }
    }
    poly(g, '#150e36', pts.map((v) => v + 1))
    poly(g, '#2b1f66', pts)
    ell(g, '#4a3d9a', cx - 5, cy - 6, 5, 3)
    // グリッチの横線
    for (let k = 0; k < 4; k++) {
      const off = ((k * 5 + f * 3) % 7) - 3
      rect(g, k % 2 ? '#3bf2ff' : '#ff3bd4', cx - 10 + off, cy - 7 + k * 4.5, 6 + (k % 3) * 2, 1)
    }
    // かんむりの立方体
    for (let k = 0; k < 5; k++) {
      const hy = cy - 14 - (k === 2 ? 3 : k % 2) + Math.sin(f * 1.2 + k) * 0.8
      rect(g, k % 2 ? '#ff3bd4' : '#3bf2ff', cx - 9 + k * 4.4, hy, 2.5, 2.5)
      rect(g, '#ffffff', cx - 9 + k * 4.4, hy, 1, 1)
    }
    // 三つの目
    const k = p.eye === 'angry' ? 0.7 : 1
    if (p.eye === 'closed' || p.eye === 'sleepy') {
      rect(g, '#ff3b5c', cx + 1, cy - 2, 7, 1)
    } else {
      ell(g, '#ffffff', cx + 4, cy - 2, 5, 4.2 * k)
      ell(g, '#ff3b5c', cx + 5.5, cy - 2, 2.8, 2.8 * k)
      rect(g, '#150e36', cx + 5.5, cy - 3.5, 1, 3)
    }
    for (const [ex, ey] of [[cx - 6, cy - 4], [cx + 11, cy - 5]] as const) {
      if (p.eye === 'closed' || p.eye === 'sleepy') rect(g, '#ff3b5c', ex - 1, ey, 2, 0.5)
      else {
        ell(g, '#ffffff', ex, ey, 2, 1.8 * k)
        ell(g, '#ff3b5c', ex + 0.5, ey, 1.1, 1.1 * k)
      }
    }
    if (p.eye === 'angry') rect(g, '#150e36', cx - 1, cy - 7.5, 11, 1.2)
    // ぎざぎざの口
    const my = cy + 4
    if (p.mouth) {
      rect(g, '#150e36', cx - 4, my, 14, 3)
      for (let i = 0; i < 7; i++) rect(g, '#ff3bd4', cx - 4 + i * 2, my + (i % 2), 1, 1.5)
    } else for (let i = 0; i < 7; i++) rect(g, '#ff3bd4', cx - 4 + i * 2, my + (i % 2), 1, 0.8)
  },
  kazanou(g, p, f) {
    // カザンオウ：火山そのものの王。てっぺんのかこうから溶岩をふきあげ、両のこぶしを打ちつける
    const cx = 15 + p.lean
    const cy = 19 + p.bob * 0.5
    const ax = p.lean > 1 ? 4 : 0
    // あし
    rect(g, '#3a2c26', cx - 9 + p.step, cy + 9, 6, 4)
    rect(g, '#3a2c26', cx + 3 - p.step, cy + 9, 6, 4)
    // 山の体
    poly(g, '#33251f', [cx - 14, cy + 11, cx - 7, cy - 8, cx + 7, cy - 8, cx + 15, cy + 11])
    poly(g, '#5e493d', [cx - 13, cy + 10, cx - 6.5, cy - 7.5, cx + 6.5, cy - 7.5, cx + 14, cy + 10])
    poly(g, '#8a6f5e', [cx - 12, cy + 4, cx - 6, cy - 7, cx - 1, cy - 7, cx - 6, cy + 2])
    // 溶岩のすじ
    const glow = f % 2 ? '#ff9a3a' : '#ff6a1a'
    poly(g, glow, [cx - 7, cy - 7, cx - 8.5, cy + 1, cx - 7, cy + 8, cx - 6, cy + 1])
    poly(g, glow, [cx + 6, cy - 7, cx + 8, cy + 0, cx + 6.5, cy + 8, cx + 5, cy + 0])
    rect(g, '#ffd23f', cx - 7.5, cy - 1, 0.5, 4)
    // かこう
    ell(g, '#2a1a14', cx, cy - 9, 8, 2.8)
    ell(g, glow, cx, cy - 9.3, 6.5, 2)
    const fl = Math.sin(f * 1.4)
    poly(g, '#ff9a3a', [cx - 3.5, cy - 9.5, cx - 1 + fl, cy - 17 - (f % 2), cx + 1.5, cy - 9.5])
    poly(g, '#ffd23f', [cx - 1, cy - 9.5, cx + 2.5 - fl, cy - 15 - (f % 2), cx + 4, cy - 9.5])
    rect(g, '#ffe27a', cx - 6, cy - 14 + (f % 3), 1, 1)
    rect(g, '#ffe27a', cx + 6, cy - 13 - (f % 2), 1, 1)
    // かお
    if (p.eye === 'closed' || p.eye === 'sleepy') {
      rect(g, '#ffe14a', cx - 5, cy - 3, 3, 0.5)
      rect(g, '#ffe14a', cx + 2, cy - 3, 3, 0.5)
    } else {
      const k = p.eye === 'angry' ? 0.8 : 1.4
      poly(g, '#ffe14a', [cx - 6, cy - 3 - k, cx - 1.5, cy - 3, cx - 6, cy - 3 + k * 1.5])
      poly(g, '#ffe14a', [cx + 6, cy - 3 - k, cx + 1.5, cy - 3, cx + 6, cy - 3 + k * 1.5])
    }
    if (p.mouth) {
      poly(g, '#2a1a14', [cx - 5, cy + 1, cx + 5, cy + 1, cx + 4, cy + 6, cx - 4, cy + 6])
      rect(g, glow, cx - 3, cy + 3, 6, 2.5)
      for (let i = 0; i < 4; i++) rect(g, '#d8c8b0', cx - 4 + i * 2.4, cy + 1, 1.2, 1.6)
    } else {
      rect(g, '#2a1a14', cx - 5, cy + 2, 10, 1.5)
      for (let i = 0; i < 4; i++) rect(g, '#d8c8b0', cx - 4 + i * 2.4, cy + 2, 1, 1)
    }
    // こぶし
    rect(g, '#33251f', cx + 12 + ax, cy - 1 - p.flap, 7, 8)
    rect(g, '#6e5648', cx + 12 + ax, cy - 1 - p.flap, 6, 7)
    rect(g, glow, cx + 13 + ax, cy + 3 - p.flap, 4, 0.5)
    rect(g, '#33251f', cx - 20, cy + 0 + p.flap, 7, 8)
    rect(g, '#6e5648', cx - 20, cy + 0 + p.flap, 6, 7)
    rect(g, glow, cx - 19, cy + 4 + p.flap, 4, 0.5)
  },
  sangogani(g, p, f) {
    // サンゴガニ：背中にサンゴの森をのせた、大きなカニの王。目は長いくきの先
    const cx = 14 + p.lean
    const cy = 22 + p.bob * 0.5
    // あし
    for (let i = 0; i < 3; i++) {
      const lx = cx - 8 + i * 5
      const s = (i % 2 ? 1 : -1) * p.step
      poly(g, '#8a2a1c', [lx, cy + 3, lx - 3 + s, cy + 5, lx - 3 + s, cy + 9, lx - 2 + s, cy + 9, lx - 1.5, cy + 5.5])
      poly(g, '#8a2a1c', [lx + 8, cy + 3, lx + 11 - s, cy + 5, lx + 11 - s, cy + 9, lx + 10 - s, cy + 9, lx + 9.5, cy + 5.5])
    }
    // こうら
    blob(g, cx + 1, cy, 13.5, 8 - p.sq * 0.6, '#e0604a', '#9a2e20', '#ff9e86')
    ell(g, '#ffb8a0', cx + 3, cy + 3, 8, 2.5)
    for (const [dx, dy] of [[-8, -2], [-3, -4], [4, -4], [9, -1]] as const) rect(g, '#9a2e20', cx + dx, cy + dy, 1.2, 1.2)
    // 背中のサンゴ
    const sway = Math.sin(f * 0.9) * 0.8
    for (const [bx, h, c1, c2] of [[-6, 11, '#ff9ecb', '#ffd0e6'], [-1, 14, '#ff7ab8', '#ffc0dc'], [4, 10, '#ffb0d8', '#ffe0ee']] as const) {
      const tx = cx + bx + sway
      poly(g, c1, [cx + bx - 1.5, cy - 6, tx, cy - 6 - h, cx + bx + 1.5, cy - 6])
      poly(g, c2, [cx + bx - 0.5, cy - 6, tx - 0.3, cy - 5 - h, cx + bx + 0.2, cy - 6])
      poly(g, c1, [cx + bx, cy - 6 - h * 0.5, tx + 3.5, cy - 6 - h * 0.85, tx + 1, cy - 6 - h * 0.35])
      ell(g, '#fff27a', tx, cy - 6 - h, 1.1, 1.1)
    }
    // ハサミ
    const open = p.lean > 1 || p.mouth ? 1 : 0
    for (const [bx, sd] of [[cx + 14, 1], [cx - 13, -1]] as const) {
      const by = cy - 2 - (sd > 0 ? p.flap : -p.flap)
      ell(g, '#9a2e20', bx + sd * 1.5, by + 3, 3, 3.6)
      ell(g, '#e0604a', bx + sd * 1.2, by + 2.5, 2.5, 3.2)
      poly(g, '#e0604a', [bx - 2.5 * sd, by - 0.5, bx + sd * (2.5 + open * 1.5), by - 6 - open, bx + sd * 3.5, by])
      poly(g, '#ffb8a0', [bx - 1.5 * sd, by - 0.5, bx + sd * (2.4 + open * 1.5), by - 5.5 - open, bx + sd * 2.6, by - 0.5])
      poly(g, '#9a2e20', [bx + sd * 1, by + 0.5, bx + sd * (5.5 + open), by - 2, bx + sd * 4.5, by + 2])
    }
    // 目のくき
    for (const ex of [cx + 6, cx + 11]) {
      rect(g, '#9a2e20', ex, cy - 11, 1.2, 5)
      if (p.eye === 'closed' || p.eye === 'sleepy') {
        ell(g, '#e0604a', ex + 0.6, cy - 11.5, 2, 1.4)
        rect(g, '#1a1530', ex - 0.8, cy - 11.2, 3, 0.5)
      } else {
        ell(g, '#ffffff', ex + 0.6, cy - 12, 2.2, 2.2)
        ell(g, '#1a1530', ex + 1.2, cy - 12, 1.1, 1.3)
        if (p.eye === 'angry') rect(g, '#9a2e20', ex - 1.6, cy - 14.8, 4, 1)
      }
    }
    if (p.mouth) rect(g, '#5a1410', cx + 6, cy + 1, 4, 2)
    else rect(g, '#5a1410', cx + 6, cy + 1.5, 4, 0.8)
  },
}

/** 敵の亜種・ボスの「からだ」「あたま」の位置（もよう・表情のしるしの置き場） */
const FOE_GEOM: Record<FoeId, (p: Pose) => Geom> = {
  shimonoiz: (p) => ({ bx: 16 + p.lean, by: 19 + p.bob * 0.5, rx: 6.8, ry: 6.2, hx: 16 + p.lean + 1.5, hy: 19 + p.bob * 0.5, hr: 5, mx: 17 + p.lean, my: 22 + p.bob * 0.5, cols: ['#9fe0f5', '#4aa6d6', '#f2fdff'] }),
  homurabug: (p) => ({ bx: 16 + p.lean, by: 24 + p.bob * 0.5, rx: 9, ry: 5.5, hx: 25 + p.lean, hy: 25 + p.bob * 0.5, hr: 3, mx: 26 + p.lean, my: 27 + p.bob * 0.5, cols: ['#d8532a', '#8f2a14', '#ff9a6a'] }),
  tetsubug: (p) => ({ bx: 15 + p.lean, by: 24 + p.bob * 0.5, rx: 10.5, ry: 7, hx: 25 + p.lean, hy: 25 + p.bob * 0.5, hr: 3.4, mx: 25 + p.lean, my: 27.5 + p.bob * 0.5, cols: ['#8e9bb0', '#566179', '#d6dfec'] }),
  fuguran: (p) => ({ bx: 16 + p.lean, by: 17 + p.bob, rx: 8.5, ry: 8, hx: 20 + p.lean, hy: 16 + p.bob, hr: 6, mx: 23 + p.lean, my: 20 + p.bob, cols: ['#5cc8a8', '#2a8a74', '#c0f5e4'] }),
  shirokage: (p) => ({ bx: 16 + p.lean, by: 17 + p.bob, rx: 9, ry: 9, hx: 19 + p.lean, hy: 13.5 + p.bob, hr: 5.5, mx: 19 + p.lean, my: 17.5 + p.bob, cols: ['#c9d8f2', '#8aa0cc', '#eef4ff'] }),
  ganmaru: (p) => ({ bx: 15 + p.lean, by: 21 + p.bob * 0.5, rx: 10.5, ry: 9.5, hx: 20 + p.lean, hy: 19 + p.bob * 0.5, hr: 6, mx: 19 + p.lean, my: 23.5 + p.bob * 0.5, cols: ['#9a8f84', '#625850', '#cfc4b8'] }),
  hatenashi: (p) => ({ bx: 15 + p.lean, by: 17 + p.bob * 0.5, rx: 12, ry: 9.5, hx: 19 + p.lean, hy: 15 + p.bob * 0.5, hr: 8, mx: 15 + p.lean, my: 21 + p.bob * 0.5, cols: ['#2b1f66', '#150e36', '#4a3d9a'] }),
  kazanou: (p) => ({ bx: 15 + p.lean, by: 20 + p.bob * 0.5, rx: 12, ry: 8, hx: 15 + p.lean, hy: 16 + p.bob * 0.5, hr: 7, mx: 15 + p.lean, my: 20 + p.bob * 0.5, cols: ['#5e493d', '#33251f', '#8a6f5e'] }),
  sangogani: (p) => ({ bx: 15 + p.lean, by: 22 + p.bob * 0.5, rx: 13, ry: 8, hx: 22 + p.lean, hy: 13 + p.bob * 0.5, hr: 6, mx: 21 + p.lean, my: 23 + p.bob * 0.5, cols: ['#e0604a', '#9a2e20', '#ff9e86'] }),
}

// ---------- ねこ系統（描きなおし・見本）----------
/** しなる しっぽ：2 次の曲線に そって 丸を ならべる。先は tip の色、ring があれば しま */
function tailCurve(g: G, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, r0: number, r1: number, col: string, tip: string, ring?: string) {
  const N = 16
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * x1 + t * t * x2
    const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * y1 + t * t * y2
    const r = r0 + (r1 - r0) * t
    ell(g, i > N - 4 ? tip : ring && i % 5 >= 3 ? ring : col, x, y, r, r)
  }
}
/** ねこの あたま（ななめ向き・両目が顔の中）。口の位置を返す */
function catHead(g: G, p: Pose, L: Look, hx: number, hy: number, hr: number, up = 0) {
  const [B, S, H] = L.c
  const dark = L.eye ?? '#1a1530'
  const belly = L.b ?? H
  const hy2 = hr * 0.9
  // みみ（奥 → 手前）。内がわは もも色
  poly(g, S, [hx + hr * 0.12, hy - hy2 * 0.7, hx + hr * 0.66, hy - hy2 * 1.82, hx + hr * 0.95, hy - hy2 * 0.4])
  poly(g, '#f29ab8', [hx + hr * 0.36, hy - hy2 * 0.8, hx + hr * 0.66, hy - hy2 * 1.5, hx + hr * 0.82, hy - hy2 * 0.62])
  poly(g, B, [hx - hr * 0.9, hy - hy2 * 0.35, hx - hr * 0.62, hy - hy2 * 1.86, hx + hr * 0.02, hy - hy2 * 0.8])
  poly(g, '#f29ab8', [hx - hr * 0.7, hy - hy2 * 0.62, hx - hr * 0.58, hy - hy2 * 1.5, hx - hr * 0.2, hy - hy2 * 0.82])
  // あたま：かげ → 本体。ほおの毛を 左右に
  ell(g, S, hx, hy, hr, hy2)
  poly(g, S, [hx - hr * 0.9, hy + hy2 * 0.05, hx - hr * 1.28, hy + hy2 * 0.62, hx - hr * 0.5, hy + hy2 * 0.8])
  poly(g, S, [hx + hr * 0.78, hy + hy2 * 0.25, hx + hr * 1.2, hy + hy2 * 0.66, hx + hr * 0.5, hy + hy2 * 0.86])
  ell(g, B, hx - 0.5, hy - 0.6, hr - 0.9, hy2 - 0.9)
  poly(g, B, [hx - hr * 0.88, hy, hx - hr * 1.16, hy + hy2 * 0.52, hx - hr * 0.5, hy + hy2 * 0.66])
  poly(g, B, [hx + hr * 0.72, hy + hy2 * 0.2, hx + hr * 1.08, hy + hy2 * 0.56, hx + hr * 0.5, hy + hy2 * 0.72])
  ell(g, H, hx - hr * 0.38, hy - hy2 * 0.55, hr * 0.3, hy2 * 0.16)
  // ひたいの しま
  if (L.stripe) for (const dx of [-0.28, 0.08, 0.44]) rect(g, L.stripe, hx + dx * hr - 0.5, hy - hy2 * 0.98 + Math.abs(dx - 0.08) * 1.4, 1, hy2 * (dx === 0.08 ? 0.3 : 0.2))
  if (L.gem) poly(g, L.gem, [hx + hr * 0.2, hy - hy2 * 0.82, hx + hr * 0.2 + 1.5, hy - hy2 * 0.82 + 1.5, hx + hr * 0.2, hy - hy2 * 0.82 + 3, hx + hr * 0.2 - 1.5, hy - hy2 * 0.82 + 1.5])
  // おとなは ほおの毛が 大きい
  if (up > 0.4) {
    poly(g, B, [hx - hr * 0.9, hy + hy2 * 0.2, hx - hr * (1.2 + up * 0.3), hy + hy2 * 0.95, hx - hr * 0.4, hy + hy2 * 0.8])
    poly(g, B, [hx + hr * 0.7, hy + hy2 * 0.4, hx + hr * (1.05 + up * 0.25), hy + hy2 * 0.98, hx + hr * 0.4, hy + hy2 * 0.86])
  }
  // ひたいの 三日月
  if (L.moon) {
    ell(g, L.moon, hx + hr * 0.18, hy - hy2 * 0.6, 1.9, 1.9)
    ell(g, B, hx + hr * 0.18 + 1, hy - hy2 * 0.6 - 0.5, 1.6, 1.6)
  }
  tiara(g, L, hx, hy, hr)
  // 口もと（白っぽい ふくらみ）と はな
  const mzx = hx + hr * 0.36
  const mzy = hy + hy2 * 0.46
  ell(g, belly, mzx, mzy, hr * 0.5, hy2 * 0.34)
  poly(g, '#e8708e', [mzx - 1, mzy - hy2 * 0.28, mzx + 1, mzy - hy2 * 0.28, mzx, mzy - hy2 * 0.28 + 1])
  eyes(g, [hx - hr * 0.26, hx + hr * 0.64], hy - hy2 * 0.02, p.eye, dark)
  // ほおの 赤み
  if (p.eye === 'happy' || p.eye === 'hungry') ell(g, '#ffb0c0', hx - hr * 0.5, hy + hy2 * 0.42, 1.2, 0.7)
  const mx = mzx - 1.2
  const my = mzy
  if (p.mouth) mouthShape(g, p.mouth, mx, my, dark, false)
  else {
    // とじた口：ちいさな「ω」
    rect(g, dark, mzx - 0.25, mzy - 0.2, 0.5, 1)
    rect(g, dark, mzx - 1.25, mzy + 0.8, 1, 0.5)
    rect(g, dark, mzx + 0.25, mzy + 0.8, 1, 0.5)
  }
  // きば：おとなほど 長い（サーベル）
  if (L.fang) {
    poly(g, '#ffffff', [mzx + 0.8, mzy + 0.6, mzx + 2, mzy + 0.6, mzx + 1.4, mzy + 2.4 + up * 2.4])
    if (up > 0.4) poly(g, '#ffffff', [mzx - 1.6, mzy + 0.6, mzx - 0.4, mzy + 0.6, mzx - 1, mzy + 2 + up * 1.8])
  }
  return { mx, my }
}
/** 四つあしの ねこ（右むき、足もとは y=30） */
function cat(g: G, p: Pose, f: number, L: Look, dog = false): Geom {
  const s = L.s
  const [B, S, H] = L.c
  const belly = L.b ?? H
  const cx = 13 - (s - 1) * 1.5 + p.lean
  const bob = p.bob * 0.5 + (p.bob < 0 ? p.bob : 0)
  // 進化の だんかい（0 = 成長期 … 1 = 完成期）：上がるほど 足が長く・体が長く・頭の割合が小さく（おとなの体つき）
  const up = Math.min(1, Math.max(0, (s - 0.82) / 0.63))
  const rx = (6.2 + up * 0.5) * s + p.sq * 0.5
  const ry = 4.2 * s - p.sq * 0.4
  const ty = 30 - (4.2 + s + up * 1.5) - ry * 0.55 + bob
  const hr = (5.6 - up * 1.0) * s
  const hx = cx + (5.6 + up * 0.5) * s
  const hy = ty - (3.5 + up * 0.6) * s + p.sq * 0.3
  const wag = Math.sin(f * 1.7) * 1.6
  const w = 1.9 + s * 0.5
  const legY = ty + ry * 0.35
  const leg = (x: number, col: string, paw: string) => {
    rect(g, col, x - w / 2, legY, w, 29.6 - legY)
    ell(g, paw, x + 0.5, 29.3, w * 0.72, 1.2)
  }
  // しっぽ（ふたまたは 2 本）
  // 2 本目は せなかの上へ（かくれないように）
  const tip = (t: number) => (t ? { x: cx - rx * 0.35 - wag, y: ty - (8.6 + up) * s } : { x: cx - rx - 1.2 * s + wag, y: ty - (8.2 + up * 1.2) * s })
  const tails = L.tails ?? 1
  if (dog) {
    // いぬ：ふさふさの みじかい しっぽを 上へ まく（よく ふる）
    const w2 = Math.sin(f * 2.6) * 2.2
    tailCurve(g, cx - rx + 1.4, ty - ry * 0.3, cx - rx - 3.2 * s, ty - ry * 0.4, cx - rx - 0.6 * s + w2, ty - ry - 3.6 * s, 1.5 + s * 0.5, 1.9 + s * 0.6, B, L.mane ?? H)
  } else
  for (let t = tails - 1; t >= 0; t--)
    tailCurve(g, cx - rx + 1.2, ty - 0.4, cx - rx - (t ? 2.4 : 4.2) * s, ty + (t ? -2.5 : 0.5) * s, tip(t).x, tip(t).y, 1.3 + s * 0.35, 1.0 + s * 0.25, B, L.stripe ?? S, L.stripe)
  if (L.star && !dog) {
    const q = tip(0)
    poly(g, L.star, [q.x, q.y - 3.4, q.x + 1, q.y - 1, q.x + 3.2, q.y, q.x + 1, q.y + 1, q.x, q.y + 3.4, q.x - 1, q.y + 1, q.x - 3.2, q.y, q.x - 1, q.y - 1])
    rect(g, '#ffffff', q.x - 0.5, q.y - 0.5, 1, 1)
  }
  // せなかの けっしょうの はね（3 まい・うしろへ そる）
  if (L.blade)
    for (let i = 0; i < 3; i++) {
      const bx0 = cx - rx * 0.1 - i * rx * 0.28
      const by0 = ty - ry * 0.75
      const tx = bx0 - (3 + i * 1.6) * s * 0.8
      const ty2 = by0 - (7.5 - i * 1.6) * s * 0.8 - p.flap * 1.2
      poly(g, L.blade, [bx0 - 1.3 * s, by0, tx, ty2, bx0 + 1.3 * s, by0])
      poly(g, '#ffffff', [bx0 - 0.2, by0 - 1, tx + 0.6, ty2 + 1.5, bx0 + 0.5, by0 - 1])
    }
  // しっぽの先の ひとだま（ゆらめく）
  if (L.wisp && !dog)
    for (let t = 0; t < tails; t++) {
      const wx = tip(t).x
      const wy = tip(t).y - 1.5
      const fl = (f + t) % 2
      poly(g, L.wisp, [wx - 2, wy + 1, wx + (fl ? 0.6 : -0.6), wy - 4.2, wx + 2, wy + 1])
      ell(g, L.wisp, wx, wy, 2.1, 2.1)
      ell(g, '#ffffff', wx, wy + 0.3, 1, 1.1)
    }
  // 奥の足
  leg(cx - rx * 0.62 - p.step * 0.9, S, S)
  leg(cx + rx * 0.55 + p.step * 0.9, S, S)
  // 胴：おしり（ふともも）を 少し高く、むねを ふくらませる
  ell(g, S, cx, ty, rx, ry)
  ell(g, S, cx - rx * 0.46, ty - 0.2, rx * 0.64, ry * 1.1)
  ell(g, B, cx - 0.4, ty - 0.7, rx - 1, ry - 1)
  ell(g, B, cx - rx * 0.46 - 0.3, ty - 0.9, rx * 0.64 - 0.9, ry * 1.1 - 0.9)
  ell(g, belly, cx + rx * 0.2, ty + ry * 0.52, rx * 0.62, ry * 0.4)
  ell(g, H, cx - rx * 0.32, ty - ry * 0.6, rx * 0.4, ry * 0.18)
  // せなかの しま（上が太く、下へ とがる）
  if (L.stripe)
    for (const i of [-0.62, -0.24, 0.14]) {
      const yt = ty - ry * Math.sqrt(1 - i * i) * (i < -0.3 ? 1.08 : 1) + 0.8
      poly(g, L.stripe, [cx + i * rx - 1, yt, cx + i * rx + 1, yt, cx + i * rx + 0.3, yt + ry * 1.05])
    }
  if (L.spot) for (const [dx, dy, r] of [[-0.55, -0.25, 1.6], [-0.2, 0.15, 1.2], [0.15, -0.35, 1.3]] as const) ell(g, L.spot, cx + dx * rx, ty + dy * ry, r * Math.sqrt(s), r * Math.sqrt(s))
  // 手前の足（ふともも つき）。おなかの色が あれば くつした
  ell(g, B, cx - rx * 0.36, ty + ry * 0.3, rx * 0.34, ry * 0.62)
  leg(cx - rx * 0.3 + p.step * 0.9, B, L.b ?? H)
  leg(cx + rx * 0.84 - p.step * 0.9, B, L.b ?? H)
  // むねの毛
  ell(g, belly, cx + rx * 0.82, ty + ry * 0.05, rx * 0.26, ry * 0.7)
  // たてがみ：首のまわりの ふさ
  if (L.mane)
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3
      ell(g, L.mane, hx - 1 + Math.cos(a) * (hr + 0.3), hy + 0.8 + Math.sin(a) * (hr * 0.9 + 0.3), 1.6 + s * 0.5, 1.6 + s * 0.5)
    }
  // よろい（せなかの くら と かたあて）・せなかの とげ・くびわ
  if (L.armor) {
    poly(g, L.armor, [cx - rx * 0.55, ty - ry * 0.95, cx + rx * 0.35, ty - ry * 0.95, cx + rx * 0.45, ty - ry * 0.1, cx - rx * 0.6, ty - ry * 0.1])
    rect(g, '#ffffff', cx - rx * 0.5, ty - ry * 0.85, rx * 0.8, 0.5)
    ell(g, L.armor, cx + rx * 0.7, ty - ry * 0.25, rx * 0.26, ry * 0.5)
  }
  if (L.spike) for (let i = 0; i < 4; i++) poly(g, L.spike, [cx - rx * 0.75 + i * rx * 0.36, ty - ry * 0.85, cx - rx * 0.62 + i * rx * 0.36, ty - ry - (2.2 + up * 2.2) * s, cx - rx * 0.42 + i * rx * 0.36, ty - ry * 0.85])
  if (L.collar) {
    rect(g, L.collar, hx - hr * 0.72, hy + hr * 0.62, hr * 0.95, 1.8)
    ell(g, '#ffd23f', hx - hr * 0.1, hy + hr * 0.62 + 2.2, 1, 1)
  }
  // おとなの しま：足にも
  if (L.stripe && up > 0.4) for (const lx of [cx - rx * 0.3 + p.step * 0.9, cx + rx * 0.84 - p.step * 0.9]) for (const dy of [1.2, 3]) rect(g, L.stripe, lx - w / 2, legY + dy, w, 0.8)
  // 光る もよう（ふともも と かた）
  if (L.rune) {
    for (const [mxr, myr] of [[cx - rx * 0.42, ty + ry * 0.05], [cx + rx * 0.55, ty - ry * 0.2]] as const) {
      poly(g, L.rune, [mxr - 1.6, myr - 1, mxr, myr + 1.2, mxr + 1.6, myr - 1, mxr, myr + 0.2])
      rect(g, L.rune, mxr - 0.4, myr - 2.6, 0.8, 1)
    }
  }
  // かたと足の よろい
  if (L.plate) {
    ell(g, L.plate, cx + rx * 0.72, ty - ry * 0.3, rx * 0.28, ry * 0.6)
    rect(g, '#ffffff', cx + rx * 0.62, ty - ry * 0.62, rx * 0.2, 0.5)
    for (const lx of [cx - rx * 0.3 + p.step * 0.9, cx + rx * 0.84 - p.step * 0.9]) {
      rect(g, L.plate, lx - w / 2 - 0.3, legY + 0.8, w + 0.6, 2.4)
      rect(g, '#ffffff', lx - w / 2, legY + 1.1, 0.5, 1.4)
    }
  }
  // まわりに うかぶ たま
  if (L.orbs)
    for (const [ox, oy, ph] of [[cx - rx * 0.1, ty - ry - 5.5 * s * 0.8, 0], [hx + hr * 1.15, hy - hr * 1.5, 2]] as const) {
      const yy = oy + Math.sin(f * 1.3 + ph) * 1.2
      ell(g, L.orbs, ox, yy, 1.8, 1.8)
      rect(g, '#ffffff', ox - 0.7, yy - 0.8, 1, 1)
    }
  // なびく スカーフ（首に まいて、うしろへ たなびく）
  if (L.scarf) {
    const fy2 = Math.sin(f * 1.9) * 1.2
    poly(g, L.scarf, [hx - hr * 0.5, hy + hr * 0.55, hx - hr * 1.9, hy + hr * 0.1 + fy2, hx - hr * 2.3, hy + hr * 0.75 + fy2, hx - hr * 0.6, hy + hr * 1.0])
    rect(g, L.scarf, hx - hr * 0.78, hy + hr * 0.58, hr * 1.05, 2.2)
  }
  const { mx, my } = dog ? dogHead(g, p, L, hx, hy, hr, up) : catHead(g, p, L, hx, hy, hr, up)
  return { bx: cx, by: ty, rx, ry, hx, hy, hr, mx, my, cols: [B, S, H] }
}
/** 頭の かざり：けっしょう（かんむり）を 3 本 */
function tiara(g: G, L: Look, hx: number, hy: number, hr: number) {
  if (!L.tiara) return
  const top = hy - hr * 0.82
  for (const [dx, h] of [[-0.22, 2.6], [0.12, 4], [0.46, 2.6]] as const) {
    poly(g, L.tiara, [hx + dx * hr - 1, top + 0.6, hx + dx * hr, top - h, hx + dx * hr + 1, top + 0.6])
    rect(g, '#ffffff', hx + dx * hr - 0.25, top - h + 1.2, 0.5, 1)
  }
}
/** いぬ・おおかみの あたま：前へ のびた 口さき・黒い はな・たれ耳（おおかみは 立ち耳）・した */
function dogHead(g: G, p: Pose, L: Look, hx: number, hy: number, hr: number, up = 0) {
  const [B, S, H] = L.c
  const dark = L.eye ?? '#1a1530'
  const belly = L.b ?? H
  const hy2 = hr * 0.9
  const wolf = L.ear === 'cat'
  const perk = p.bob < 0 ? -1 : 0
  // 奥の耳
  if (wolf) poly(g, S, [hx + hr * 0.05, hy - hy2 * 0.7, hx + hr * 0.5, hy - hy2 * 1.75, hx + hr * 0.82, hy - hy2 * 0.45])
  else ell(g, S, hx + hr * 0.5, hy - hy2 * 0.25 + perk, hr * 0.3, hy2 * 0.62)
  // あたま と ほおの毛（おおかみ）
  ell(g, S, hx, hy, hr, hy2)
  if (wolf) poly(g, S, [hx - hr * 0.9, hy + hy2 * 0.05, hx - hr * 1.3, hy + hy2 * 0.66, hx - hr * 0.45, hy + hy2 * 0.84])
  ell(g, B, hx - 0.5, hy - 0.6, hr - 0.9, hy2 - 0.9)
  if (wolf) poly(g, L.mane ?? B, [hx - hr * 0.88, hy, hx - hr * 1.18, hy + hy2 * 0.56, hx - hr * 0.45, hy + hy2 * 0.7])
  ell(g, H, hx - hr * 0.38, hy - hy2 * 0.55, hr * 0.3, hy2 * 0.16)
  // 口さき（前へ のびる）
  ell(g, S, hx + hr * 0.66, hy + hy2 * 0.42, hr * 0.62, hy2 * 0.44)
  ell(g, B, hx + hr * 0.64, hy + hy2 * 0.36, hr * 0.58, hy2 * 0.38)
  ell(g, belly, hx + hr * 0.7, hy + hy2 * 0.5, hr * 0.46, hy2 * 0.26)
  ell(g, dark, hx + hr * 1.12, hy + hy2 * 0.2, 1.2, 1)
  rect(g, '#ffffff', hx + hr * 1.12 - 0.8, hy + hy2 * 0.2 - 0.8, 0.5, 0.5)
  // 目のまわりの ぶち（こいぬ）
  if (L.spot) ell(g, L.spot, hx - hr * 0.3, hy - hy2 * 0.12, hr * 0.34, hy2 * 0.4)
  if (L.gem) poly(g, L.gem, [hx + hr * 0.1, hy - hy2 * 0.82, hx + hr * 0.1 + 1.5, hy - hy2 * 0.82 + 1.5, hx + hr * 0.1, hy - hy2 * 0.82 + 3, hx + hr * 0.1 - 1.5, hy - hy2 * 0.82 + 1.5])
  eyes(g, [hx - hr * 0.3, hx + hr * 0.42], hy - hy2 * 0.14, p.eye, dark)
  if (p.eye === 'happy' || p.eye === 'hungry') ell(g, '#ffb0c0', hx - hr * 0.55, hy + hy2 * 0.4, 1.2, 0.7)
  tiara(g, L, hx, hy, hr)
  // かぶと（ばんけん）：頭の上の 鉄の ぼうし と ひさし
  if (L.helm && L.armor) {
    poly(g, L.armor, [hx - hr * 0.8, hy - hy2 * 0.42, hx - hr * 0.5, hy - hy2 * 1.12, hx + hr * 0.5, hy - hy2 * 1.12, hx + hr * 0.95, hy - hy2 * 0.5])
    rect(g, '#ffffff', hx - hr * 0.45, hy - hy2 * 1.0, hr * 0.9, 0.5)
    poly(g, '#ffd23f', [hx - 0.8, hy - hy2 * 1.1, hx, hy - hy2 * 1.55, hx + 0.8, hy - hy2 * 1.1])
  }
  // 手前の耳：たれ耳（うれしい時は 少し はねる）/ おおかみは 立ち耳
  if (wolf) {
    poly(g, B, [hx - hr * 0.92, hy - hy2 * 0.35, hx - hr * 0.7, hy - hy2 * 1.8, hx - hr * 0.05, hy - hy2 * 0.8])
    poly(g, L.mane ?? '#f29ab8', [hx - hr * 0.74, hy - hy2 * 0.62, hx - hr * 0.66, hy - hy2 * 1.45, hx - hr * 0.26, hy - hy2 * 0.82])
  } else {
    ell(g, S, hx - hr * 0.74, hy + hy2 * 0.02 + perk, hr * 0.36, hy2 * 0.78)
    ell(g, B, hx - hr * 0.8, hy - hy2 * 0.3 + perk, hr * 0.2, hy2 * 0.26)
  }
  const mx = hx + hr * 0.5
  const my = hy + hy2 * 0.64
  if (p.mouth === 1 || p.mouth === 2 || p.mouth === 4) {
    // あけた口と した
    rect(g, '#7a1f3d', mx, my - 0.3, 3, 1.4)
    ell(g, '#ff8aa0', mx + 1.6, my + 1.4, 1.2, 1.5)
  } else if (p.mouth) mouthShape(g, p.mouth, mx, my, dark, false)
  else rect(g, dark, mx - 0.5, my, 3.5, 0.5)
  if (L.fang) poly(g, '#ffffff', [mx + 1.8, my + 0.2, mx + 3, my + 0.2, mx + 2.4, my + 2 + up * 1.6])
  return { mx, my }
}
/** 赤ちゃん：顔だけの ちいさな つぶ（体は まだ無い・ちいさな足と しっぽの芽） */
function pip(g: G, p: Pose, f: number, L: Look, dog = false): Geom {
  const [B, S, H] = L.c
  const bob = p.bob * 0.5 + (p.bob < 0 ? p.bob : 0)
  const hr = 7 + p.sq * 0.4
  const hx = 15 + p.lean
  const hy = 30 - 1.4 - hr * 0.86 + bob + p.sq * 0.4
  const wag = Math.sin(f * (dog ? 2.6 : 1.7)) * 1.3
  tailCurve(g, hx - hr + 1.5, hy + hr * 0.45, hx - hr - 2.4, hy + hr * 0.5, hx - hr - 1.2 + wag, hy - hr * 0.15, 1.3, dog ? 1.7 : 1.0, B, dog ? H : S)
  ell(g, S, hx - 2.6 + p.step * 0.8, 29.3, 2, 1.2)
  ell(g, S, hx + 3 - p.step * 0.8, 29.3, 2, 1.2)
  const { mx, my } = dog ? dogHead(g, p, L, hx - 0.8, hy, hr * 0.96) : catHead(g, p, L, hx, hy, hr)
  return { bx: hx, by: hy, rx: hr, ry: hr * 0.9, hx, hy, hr, mx, my, cols: [B, S, H] }
}

// ---------- とり系統（描きなおし）----------
/** 赤ちゃん：まんまるの ひよこ（体 = 顔）。ちいさな はね・頭の毛・くちばし・足 */
function chick(g: G, p: Pose, f: number, L: Look): Geom {
  const [B, S, H] = L.c
  const dark = L.eye ?? '#1a1530'
  const bob = p.bob * 0.5 + (p.bob < 0 ? p.bob : 0)
  const r = 6.6 + p.sq * 0.4
  const hx = 15 + p.lean
  const hy = 30 - 1.8 - r * 0.88 + bob + p.sq * 0.4
  rect(g, '#ff9f43', hx - 2.6 + p.step, 28, 1, 2)
  rect(g, '#ff9f43', hx + 2 - p.step, 28, 1, 2)
  rect(g, '#ff9f43', hx - 3.6 + p.step, 29.5, 3, 1)
  rect(g, '#ff9f43', hx + 1 - p.step, 29.5, 3, 1)
  // おしりの 毛
  poly(g, S, [hx - r * 0.8, hy + r * 0.2, hx - r * 1.25, hy + r * 0.1 + Math.sin(f * 1.7), hx - r * 0.7, hy + r * 0.6])
  ell(g, S, hx, hy, r, r * 0.9)
  ell(g, B, hx - 0.5, hy - 0.6, r - 0.9, r * 0.9 - 0.9)
  ell(g, H, hx - r * 0.38, hy - r * 0.5, r * 0.3, r * 0.15)
  // ちいさな はね（ぱたぱた）
  ell(g, S, hx - r * 0.72, hy + r * 0.15 - p.flap * 1.2, r * 0.26, r * 0.36)
  // 頭の毛
  for (const [dx, h] of [[-0.2, 2.4], [0.05, 3.4], [0.3, 2.2]] as const) poly(g, B, [hx + dx * r - 0.8, hy - r * 0.8, hx + dx * r + 0.2, hy - r * 0.8 - h, hx + dx * r + 0.9, hy - r * 0.8])
  eyes(g, [hx - r * 0.12, hx + r * 0.52], hy - r * 0.08, p.eye, dark)
  ell(g, '#ffb0c0', hx - r * 0.42, hy + r * 0.3, 1.2, 0.7)
  const mx = hx + r * 0.2
  const my = hy + r * 0.22
  if (p.mouth === 1 || p.mouth === 4) {
    poly(g, '#ff9f43', [mx - 1.3, my, mx + 1.3, my, mx, my - 1.2])
    poly(g, '#e8662a', [mx - 1.1, my + 0.6, mx + 1.1, my + 0.6, mx, my + 2.2])
  } else poly(g, '#ff9f43', [mx - 1.4, my - 0.2, mx + 1.4, my - 0.2, mx, my + 1.8])
  return { bx: hx, by: hy, rx: r, ry: r * 0.9, hx, hy, hr: r, mx, my, cols: [B, S, H] }
}
/** なめらかな形：曲線で かこんで ぬる（丸や三角を かさねない） */
const shape = (g: G, c: string, d: (g: G) => void) => {
  fill(g, c)
  g.beginPath()
  d(g)
  g.closePath()
  g.fill()
}
/** はね 1 まい（木の葉の形）：(x0,y0) から (x1,y1) へ、はば w */
const leaf = (g: G, c: string, x0: number, y0: number, x1: number, y1: number, w: number) => {
  const mx = (x0 + x1) / 2
  const my = (y0 + y1) / 2
  const d = Math.hypot(x1 - x0, y1 - y0) || 1
  const nx = (-(y1 - y0) / d) * w
  const ny = ((x1 - x0) / d) * w
  shape(g, c, (g) => {
    g.moveTo(x0, y0)
    g.quadraticCurveTo(mx + nx, my + ny, x1, y1)
    g.quadraticCurveTo(mx - nx, my - ny, x0, y0)
  })
}
/**
 * つばさ：かた (sx,sy) から 向き ang へ 長さ len。うでの線に そって はねを 1 まいずつ ならべる。
 * trail = はねが たれる向き（+1 / -1）。pointed = 先が とがる（はやぶさ）、まるい（ふくろう）は false
 */
function featherWing(g: G, sx: number, sy: number, len: number, ang: number, trail: number, cols: [string, string, string], pointed: boolean, n = 7) {
  const ax = Math.cos(ang)
  const ay = Math.sin(ang)
  const tip = { x: sx + ax * len, y: sy + ay * len }
  // はねを 根もと → 先へ。先ほど うでの向きに そろう（風切り羽）
  for (let i = 0; i < n; i++) {
    const t = (i + 0.6) / n
    const bx = sx + ax * len * t * 0.92
    const by = sy + ay * len * t * 0.92
    const sweep = ang + trail * (1.25 - t * (pointed ? 1.0 : 0.75))
    const fl = len * (pointed ? 0.38 + t * 0.34 : 0.5 - Math.abs(t - 0.55) * 0.3)
    leaf(g, i % 2 ? cols[1] : cols[0], bx, by, bx + Math.cos(sweep) * fl, by + Math.sin(sweep) * fl, len * 0.085 + 0.5)
  }
  // うで（上の かたい ふち）と かたの 小さな はね
  leaf(g, cols[0], sx, sy, tip.x, tip.y, len * 0.11 + 0.4)
  for (let i = 0; i < 4; i++) {
    const t = (i + 0.5) / 5
    const bx = sx + ax * len * t * 0.8
    const by = sy + ay * len * t * 0.8
    const sweep = ang + trail * 1.2
    leaf(g, cols[2], bx, by, bx + Math.cos(sweep) * len * 0.17, by + Math.sin(sweep) * len * 0.17, len * 0.05 + 0.4)
  }
}
/**
 * とぶ鳥（右むき）。成長期から 上は 地面に立たず、はばたいて うかぶ（種族の float）。
 * 体は ひとつづきの なめらかな形（むね → 首 → 頭）。進化するほど つばさが大きく・体が ほそく するどく。
 * はやぶさ = とがった長い つばさ・かぎの くちばし / ふくろう = まるい顔と 広い つばさ / ひかりの鳥 = 大きな つばさ・ながれる おばね・光の輪
 */
function bird(g: G, p: Pose, f: number, L: Look): Geom {
  const s = L.s
  const [B, S, H] = L.c
  const dark = L.eye ?? '#1a1530'
  const belly = L.b ?? H
  const up = Math.min(1, Math.max(0, (s - 0.82) / 0.63))
  const u = 0.62 + up * 0.5
  const bob = p.bob * 0.6 + (p.bob < 0 ? p.bob : 0)
  const asleep = p.eye === 'closed'
  // はばたき：コマごとに 上げる / 下ろす。ねむる時は たたむ
  const down = f % 2 === 1
  const cx = 17 + p.lean
  const cy = 18 + bob + (down ? -0.8 : 0.6) + (asleep ? 3 : 0)
  const beakC = L.raptor ? '#f0b030' : '#ff9f43'
  const bl = (L.owl ? 6.2 : 7.4) * u // 体の 半分の長さ
  const bw = (L.owl ? 5.0 : 4.0 - up * 0.5) * u // 体の ふとさ
  const tilt = L.owl ? -0.5 : -0.28 - up * 0.1 // 前が上がる
  const tx = cx - Math.cos(tilt) * bl // おしり
  const tyy = cy - Math.sin(tilt) * bl
  const fx = cx + Math.cos(tilt) * bl // むね
  const fy = cy + Math.sin(tilt) * bl
  const hr = (L.owl ? 4.6 : 3.6 - up * 0.3) * u
  const hx = fx + (L.owl ? -hr * 0.2 : hr * 0.25)
  const hy = fy - hr * (L.owl ? 0.75 : 0.55)
  const sx = cx + Math.cos(tilt) * bl * 0.25
  const sy = cy + Math.sin(tilt) * bl * 0.25 - bw * 0.45
  const wl = (L.raptor ? 13.5 : L.owl ? 13 : L.spread ? 14 : 8.5) * u
  // ふくろうは 横へ 大きく ひろげる
  const a = asleep ? 2.5 : down ? (L.owl ? 2.95 : 2.62) - p.flap * 0.1 : (L.owl ? -2.7 : -2.18) - p.flap * 0.08
  const tr = asleep || down ? -1 : 1
  const pointed = !!L.raptor
  // ながれる 長い おばね（ひかりの鳥）
  if (L.plume)
    for (let i = 0; i < 3; i++) {
      const ex = tx - (9.5 - Math.abs(i - 1) * 2) * u + Math.sin(f * 1.3 + i) * 1.2
      const ey = tyy + (i - 1) * 4.6 * u + 1.5
      tailCurve(g, tx + 1, tyy, tx - 4 * u, tyy + (i - 1) * 1.5 * u - 2, ex, ey, 1.1 + u * 0.3, 0.7, i === 1 ? B : S, L.plume)
      ell(g, L.gem ?? L.plume, ex, ey, 1.5, 1.5)
      rect(g, '#ffffff', ex - 0.6, ey - 0.7, 0.8, 0.8)
    }
  // おばね（おうぎ）
  const tn = L.owl ? 4 : 5
  for (let i = 0; i < tn; i++) {
    const ta = Math.PI + tilt + (i - (tn - 1) / 2) * (L.raptor ? 0.16 : 0.26)
    const tl = (L.raptor ? 6.5 : 4.6) * u * (1 - Math.abs(i - (tn - 1) / 2) * 0.1)
    leaf(g, i % 2 ? S : B, tx + 1.2, tyy, tx + Math.cos(ta) * tl, tyy + Math.sin(ta) * tl, 1.1 * u + 0.3)
  }
  // 奥の つばさ（少し ずらして 暗く）
  if (!asleep) featherWing(g, sx + 1.2, sy + 0.3, wl * 0.92, a + (down ? -0.22 : 0.26), tr, [S, S, S], pointed)
  // あし（からだに 引きよせる）。はやぶさは つめ
  if (!asleep) {
    for (const k of [0.1, -0.35]) {
      const lx = cx + Math.cos(tilt) * bl * k
      const ly = cy + Math.sin(tilt) * bl * k + bw * 0.75
      rect(g, beakC, lx, ly, 1, 2.2 * u)
      rect(g, beakC, lx - 0.6, ly + 2.2 * u, 2.6, 0.8)
      if (L.raptor) rect(g, dark, lx + 1.8, ly + 2.2 * u, 0.8, 1)
    }
  }
  // 体：おしり → せなか → 首 → 頭 → のど → むね → おなか を ひとつづきに
  const nx = -Math.sin(tilt)
  const ny = Math.cos(tilt)
  const body = (c: string, k: number, o: number) =>
    shape(g, c, (g) => {
      g.moveTo(tx + o, tyy + o)
      g.bezierCurveTo(tx + (cx - tx) * 0.5 - nx * bw * 1.25 * k, tyy + (cy - tyy) * 0.5 - ny * bw * 1.25 * k, cx + (fx - cx) * 0.3 - nx * bw * 1.1 * k, cy + (fy - cy) * 0.3 - ny * bw * 1.1 * k, hx - hr * 0.8 * k, hy - hr * 0.5 * k)
      g.bezierCurveTo(hx - hr * 0.5 * k, hy - hr * 1.35 * k, hx + hr * 1.15 * k, hy - hr * 1.1 * k, hx + hr * k, hy + hr * 0.15 * k)
      g.bezierCurveTo(hx + hr * 0.85 * k, hy + hr * 1.1 * k, fx + nx * bw * 0.9 * k + 1, fy + ny * bw * 0.9 * k, cx + nx * bw * 1.15 * k, cy + ny * bw * 1.15 * k)
      g.bezierCurveTo(cx + (tx - cx) * 0.5 + nx * bw * 0.9 * k, cy + (tyy - cy) * 0.5 + ny * bw * 0.9 * k, tx + (cx - tx) * 0.15 + nx * bw * 0.3, tyy + ny * bw * 0.3, tx + o, tyy + o)
    })
  body(S, 1, 0)
  body(B, 0.86, 0.4)
  // おなか と のどの 明るい色（体の下がわに そわせる）
  shape(g, belly, (g) => {
    g.moveTo(hx + hr * 0.55, hy + hr * 0.35)
    g.bezierCurveTo(hx + hr * 0.5, hy + hr * 1.0, fx + nx * bw * 0.7, fy + ny * bw * 0.7, cx + nx * bw * 0.92, cy + ny * bw * 0.92)
    g.bezierCurveTo(cx + nx * bw * 0.3, cy + ny * bw * 0.3, fx - 1, fy, hx + hr * 0.55, hy + hr * 0.35)
  })
  // むねの はねの もよう（みじかい 曲線の 列）
  for (let i = 0; i < 3; i++) leaf(g, S, cx + Math.cos(tilt) * bl * (0.05 + i * 0.22) + nx * bw * 0.45, cy + Math.sin(tilt) * bl * (0.05 + i * 0.22) + ny * bw * 0.45, cx + Math.cos(tilt) * bl * (0.2 + i * 0.22) + nx * bw * 0.62, cy + Math.sin(tilt) * bl * (0.2 + i * 0.22) + ny * bw * 0.62, 0.35)
  if (L.owl && L.spot) for (const [k, q] of [[0.3, 0.45], [0.55, 0.3], [0.05, 0.6]] as const) {
    const px = cx + Math.cos(tilt) * bl * k + nx * bw * q
    const py = cy + Math.sin(tilt) * bl * k + ny * bw * q
    rect(g, L.spot, px - 0.4, py - 1.2, 0.8, 2.4)
    rect(g, L.spot, px - 1.2, py - 0.4, 2.4, 0.8)
  }
  // 手前の つばさ（ねむる時は 体に たたむ）
  if (asleep) {
    leaf(g, S, sx + 1, sy + bw * 0.5, tx - 1, tyy + 1, bw * 0.75)
    leaf(g, B, sx + 0.5, sy + bw * 0.4, tx + 1.5, tyy + 0.6, bw * 0.5)
  } else featherWing(g, sx, sy + 0.8, wl, a, tr, [B, L.spread ? H : S, H], pointed)
  // かんむりの はね（うしろへ ながす）
  if (L.crest)
    for (let i = 0; i < 3; i++) {
      const cl = (2.6 + i * 1.1 + up * 1.6) * (L.halo ? 0.8 : 1)
      leaf(g, L.crest, hx - hr * 0.2 + i * 0.5, hy - hr * 0.8, hx - hr * 0.2 - cl * (0.8 - i * 0.15), hy - hr * 0.8 - cl * (0.5 + i * 0.25), 0.9)
    }
  if (L.ear === 'tuft' || L.owl) {
    leaf(g, S, hx - hr * 0.5, hy - hr * 0.6, hx - hr * (L.owl ? 1.0 : 0.7), hy - hr * (L.owl ? 1.6 : 1.4), 0.9)
    leaf(g, S, hx + hr * 0.45, hy - hr * 0.65, hx + hr * (L.owl ? 0.95 : 0.6), hy - hr * (L.owl ? 1.6 : 1.45), 0.9)
  }
  if (L.gem) poly(g, L.gem, [hx - hr * 0.1, hy - hr * 0.95, hx - hr * 0.1 + 1.2, hy - hr * 0.95 + 1.2, hx - hr * 0.1, hy - hr * 0.95 + 2.4, hx - hr * 0.1 - 1.2, hy - hr * 0.95 + 1.2])
  // かお
  const ey = hy - hr * 0.08
  let bxk = hx + hr * 0.95
  let byk = hy + hr * 0.2
  const open = p.mouth === 1 || p.mouth === 4
  if (L.owl) {
    const e0 = hx - hr * 0.38
    const e1 = hx + hr * 0.42
    for (const ex of [e0, e1]) {
      ell(g, S, ex, ey, hr * 0.46, hr * 0.46)
      ell(g, belly, ex, ey, hr * 0.38, hr * 0.38)
    }
    eyes(g, [e0, e1], ey, p.eye, dark)
    bxk = (e0 + e1) / 2
    byk = ey + hr * 0.45
    poly(g, beakC, [bxk - 1, byk - 0.6, bxk + 1, byk - 0.6, bxk, byk + 1.8])
  } else {
    if (L.raptor) {
      // 目の うしろへ のびる すじ と、目の下の しるし
      leaf(g, S, hx + hr * 0.3, ey, hx - hr * 0.9, ey + hr * 0.25, 0.9)
      leaf(g, S, hx + hr * 0.35, ey + 1, hx + hr * 0.2, ey + hr * 0.95, 0.6)
      ell(g, '#f0b030', hx + hr * 0.35, ey + 0.4, 1.6, 1.7)
    } else if (up < 0.5) ell(g, '#ffb0c0', hx - hr * 0.1, hy + hr * 0.45, 1.1, 0.7)
    // 横顔：目は 1 つ（小鳥は 2 つ見せて かわいく）
    eyes(g, up < 0.3 ? [hx - hr * 0.05, hx + hr * 0.55] : [hx + hr * 0.35], ey, p.eye === 'open' && L.raptor ? 'angry' : p.eye, dark)
    // くちばし：なめらかな くさび形（はやぶさは 先が かぎ）
    const bk = (2.6 + up * 1.4) * (L.raptor ? 1.1 : 1)
    shape(g, beakC, (g) => {
      g.moveTo(bxk - 1.2, byk - 1.3)
      g.quadraticCurveTo(bxk + bk * 0.7, byk - 1.4, bxk + bk, byk + (L.raptor ? 1.6 : 0.3) - (open ? 0.6 : 0))
      g.quadraticCurveTo(bxk + bk * 0.4, byk + 0.4, bxk - 1.2, byk + 0.6)
    })
    if (open)
      shape(g, '#e8662a', (g) => {
        g.moveTo(bxk - 1.2, byk + 1)
        g.quadraticCurveTo(bxk + bk * 0.5, byk + 1.4, bxk + bk * 0.8, byk + 2.6)
        g.quadraticCurveTo(bxk + bk * 0.2, byk + 2.6, bxk - 1.2, byk + 2.2)
      })
    if (L.raptor) rect(g, dark, bxk + bk - 0.9, byk + 1.2, 0.8, 0.9)
  }
  // 頭の上の 光の輪
  if (L.halo)
    for (let i = 0; i < 12; i++) {
      const q = (i / 12) * Math.PI * 2 + f * 0.3
      rect(g, i % 3 ? L.halo : '#ffffff', hx + Math.cos(q) * hr * 1.0 - 0.5, hy - hr * 1.75 + Math.sin(q) * 1.2 - 0.5, 1.2, 1)
    }
  return { bx: cx, by: cy, rx: bl * 0.8, ry: bw, hx, hy, hr, mx: bxk, my: byk, cols: [B, S, H] }
}

// ---------- りゅう系統（描きなおし）----------
type Pt = [number, number]
/** 点の列を なめらかに つなぐ（Catmull-Rom）。t = 0〜1 */
function along(pts: Pt[], t: number): Pt {
  const n = pts.length - 1
  const x = Math.min(n - 1e-6, Math.max(0, t * n))
  const i = Math.floor(x)
  const k = x - i
  const p0 = pts[Math.max(0, i - 1)]
  const p1 = pts[i]
  const p2 = pts[i + 1]
  const p3 = pts[Math.min(n, i + 2)]
  const h = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * k + (2 * a - 5 * b + 4 * c - d) * k * k + (-a + 3 * b - 3 * c + d) * k * k * k)
  return [h(p0[0], p1[0], p2[0], p3[0]), h(p0[1], p1[1], p2[1], p3[1])]
}
/** 太さの変わる くだ（しっぽ → 胴 → 首）：曲線に そって 丸を つめて ならべる */
function tube(g: G, c: string, pts: Pt[], R: (t: number) => number, ox = 0, oy = 0, n = 44) {
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const [x, y] = along(pts, t)
    const r = R(t)
    ell(g, c, x + ox, y + oy, r, r)
  }
}
/** こうもり型の つばさ：うで → 手首から 指の骨が ひろがり、あいだに 波形の まく */
function membraneWing(g: G, sx: number, sy: number, len: number, ang: number, trail: number, bone: string, skin: string) {
  const wx = sx + Math.cos(ang) * len * 0.42
  const wy = sy + Math.sin(ang) * len * 0.42
  const tips: Pt[] = []
  for (let i = 0; i < 4; i++) {
    const a = ang + trail * (0.12 + i * 0.44)
    const l = len * (0.78 - i * 0.07)
    tips.push([wx + Math.cos(a) * l, wy + Math.sin(a) * l])
  }
  const root: Pt = [sx - Math.cos(ang) * 1.5 + Math.cos(ang + trail * 1.57) * len * 0.3, sy - Math.sin(ang) * 1.5 + Math.sin(ang + trail * 1.57) * len * 0.3]
  shape(g, skin, (g) => {
    g.moveTo(sx, sy)
    g.lineTo(wx, wy)
    g.lineTo(tips[0][0], tips[0][1])
    const all = [...tips, root]
    for (let i = 0; i < all.length - 1; i++) {
      const a = all[i]
      const b = all[i + 1]
      // まくの ふちは 内がわへ たるむ
      g.quadraticCurveTo((a[0] + b[0]) / 2 + (wx - (a[0] + b[0]) / 2) * 0.34, (a[1] + b[1]) / 2 + (wy - (a[1] + b[1]) / 2) * 0.34, b[0], b[1])
    }
  })
  for (const tp of tips) leaf(g, bone, wx, wy, tp[0], tp[1], 0.45)
  leaf(g, bone, sx, sy, wx, wy, len * 0.07 + 0.5)
  ell(g, bone, wx, wy, 0.9, 0.9)
}
/** りゅうの あたま（右むき）：なめらかな頭 → 口さき、下あご、うしろへ そる つの、ほおの ひれ */
function dragonHead(g: G, p: Pose, L: Look, hx: number, hy: number, hr: number, up: number) {
  const [B, S, H] = L.c
  const dark = L.eye ?? '#1a1530'
  const belly = L.b ?? H
  const open = p.mouth === 1 || p.mouth === 4 || p.mouth === 5
  const jaw = open ? hr * 0.42 : 0
  const sn = hr * (1.5 + up * 0.5) // 口さきの長さ
  // つの（奥 → 手前）
  const hl = (2.6 + up * 4.2) * (hr / 4)
  if (L.horn) {
    leaf(g, S, hx - hr * 0.1, hy - hr * 0.7, hx - hr * 0.5 - hl * 0.75, hy - hr * 0.9 - hl * 0.75, 0.9)
    leaf(g, L.horn, hx - hr * 0.45, hy - hr * 0.6, hx - hr * 0.9 - hl, hy - hr * 0.6 - hl * 0.55, 1.0)
    if (up > 0.9) leaf(g, L.horn, hx - hr * 0.9 - hl * 0.5, hy - hr * 0.6 - hl * 0.28, hx - hr * 0.7 - hl * 0.7, hy - hr * 0.6 - hl * 0.95, 0.7)
  }
  // ほおの ひれ（おとな）
  if (up > 0.3) for (let i = 0; i < 3; i++) leaf(g, L.mane ?? S, hx - hr * 0.5, hy + hr * (0.1 + i * 0.25), hx - hr * (1.5 + up * 0.5), hy + hr * (0.25 + i * 0.5), 0.8)
  // 下あご
  shape(g, S, (g) => {
    g.moveTo(hx - hr * 0.5, hy + hr * 0.35)
    g.quadraticCurveTo(hx + sn * 0.5, hy + hr * 1.0 + jaw, hx + sn * 0.92, hy + hr * 0.45 + jaw)
    g.quadraticCurveTo(hx + sn * 0.4, hy + hr * 0.35 + jaw * 0.6, hx - hr * 0.5, hy + hr * 0.35)
  })
  if (open) {
    shape(g, '#7a1f3d', (g) => {
      g.moveTo(hx - hr * 0.2, hy + hr * 0.3)
      g.lineTo(hx + sn * 0.9, hy + hr * 0.3)
      g.lineTo(hx + sn * 0.85, hy + hr * 0.4 + jaw)
      g.closePath()
    })
    if (p.mouth === 1) ell(g, '#ffb03a', hx + sn * 0.55, hy + hr * 0.42 + jaw * 0.5, 1.2, 0.8)
  }
  // 上の頭（ひたい → はなさき）
  shape(g, S, (g) => {
    g.moveTo(hx - hr, hy + hr * 0.1)
    g.bezierCurveTo(hx - hr, hy - hr * 1.2, hx + hr * 0.6, hy - hr * 1.1, hx + sn * 0.6, hy - hr * 0.35)
    g.quadraticCurveTo(hx + sn * 1.08, hy - hr * 0.3, hx + sn, hy + hr * 0.38)
    g.quadraticCurveTo(hx, hy + hr * 0.75, hx - hr, hy + hr * 0.1)
  })
  shape(g, B, (g) => {
    g.moveTo(hx - hr * 0.85, hy)
    g.bezierCurveTo(hx - hr * 0.85, hy - hr * 1.02, hx + hr * 0.55, hy - hr * 0.95, hx + sn * 0.58, hy - hr * 0.25)
    g.quadraticCurveTo(hx + sn * 0.98, hy - hr * 0.2, hx + sn * 0.92, hy + hr * 0.22)
    g.quadraticCurveTo(hx, hy + hr * 0.5, hx - hr * 0.85, hy)
  })
  leaf(g, belly, hx + hr * 0.1, hy + hr * 0.32, hx + sn * 0.9, hy + hr * 0.26, 0.5)
  leaf(g, H, hx - hr * 0.5, hy - hr * 0.55, hx + hr * 0.4, hy - hr * 0.7, 0.5)
  // はなの あな・目・きば
  rect(g, dark, hx + sn * 0.82, hy - hr * 0.08, 0.8, 0.6)
  eyes(g, [hx + hr * 0.15], hy - hr * 0.22, p.eye === 'open' && up > 0.3 ? 'angry' : p.eye, dark)
  if (L.gem) poly(g, L.gem, [hx - hr * 0.3, hy - hr * 0.95, hx - hr * 0.3 + 1.3, hy - hr * 0.95 + 1.3, hx - hr * 0.3, hy - hr * 0.95 + 2.6, hx - hr * 0.3 - 1.3, hy - hr * 0.95 + 1.3])
  if (L.fang) {
    poly(g, '#ffffff', [hx + sn * 0.5, hy + hr * 0.32, hx + sn * 0.5 + 1, hy + hr * 0.32, hx + sn * 0.5 + 0.5, hy + hr * 0.32 + 1.4 + up])
    poly(g, '#ffffff', [hx + sn * 0.75, hy + hr * 0.3, hx + sn * 0.75 + 0.9, hy + hr * 0.3, hx + sn * 0.75 + 0.45, hy + hr * 0.3 + 1.1 + up * 0.6])
  }
  return { mx: hx + sn * 0.5, my: hy + hr * 0.4 }
}
/** 赤ちゃん：まるい頭だけの ちびりゅう（小さな つの・口さき・つばさの芽・しっぽ） */
function whelp(g: G, p: Pose, f: number, L: Look): Geom {
  const [B, S, H] = L.c
  const dark = L.eye ?? '#1a1530'
  const belly = L.b ?? H
  const bob = p.bob * 0.5 + (p.bob < 0 ? p.bob : 0)
  const r = 6.4 + p.sq * 0.4
  const hx = 14.5 + p.lean
  const hy = 30 - 1.6 - r * 0.88 + bob + p.sq * 0.4
  tailCurve(g, hx - r + 1.5, hy + r * 0.5, hx - r - 3, hy + r * 0.7, hx - r - 2 + Math.sin(f * 1.7), hy - r * 0.1, 1.5, 0.7, B, L.horn ?? S)
  for (const sg of [-1, 1]) membraneWing(g, hx + sg * r * 0.55 - 1, hy - r * 0.35, 4.2, sg < 0 ? -2.3 - p.flap * 0.2 : -0.9 + p.flap * 0.2, sg < 0 ? 1 : -1, S, belly)
  ell(g, S, hx - 2.6 + p.step * 0.8, 29.3, 2, 1.2)
  ell(g, S, hx + 2.6 - p.step * 0.8, 29.3, 2, 1.2)
  if (L.horn) {
    leaf(g, L.horn, hx - r * 0.45, hy - r * 0.7, hx - r * 0.75, hy - r * 1.2, 0.9)
    leaf(g, L.horn, hx + r * 0.25, hy - r * 0.75, hx + r * 0.15, hy - r * 1.25, 0.9)
  }
  ell(g, S, hx, hy, r, r * 0.9)
  ell(g, B, hx - 0.5, hy - 0.6, r - 0.9, r * 0.9 - 0.9)
  ell(g, H, hx - r * 0.38, hy - r * 0.5, r * 0.3, r * 0.15)
  // 口さきの ふくらみ
  ell(g, S, hx + r * 0.5, hy + r * 0.38, r * 0.62, r * 0.4)
  ell(g, belly, hx + r * 0.5, hy + r * 0.34, r * 0.56, r * 0.34)
  rect(g, dark, hx + r * 0.75, hy + r * 0.18, 0.8, 0.6)
  rect(g, dark, hx + r * 0.4, hy + r * 0.18, 0.8, 0.6)
  eyes(g, [hx - r * 0.25, hx + r * 0.42], hy - r * 0.12, p.eye, dark)
  const mx = hx + r * 0.35
  const my = hy + r * 0.48
  if (p.mouth) mouthShape(g, p.mouth, mx, my, dark, false)
  else rect(g, dark, mx, my, 2.5, 0.5)
  return { bx: hx, by: hy, rx: r, ry: r * 0.9, hx, hy, hr: r, mx, my, cols: [B, S, H] }
}
/**
 * りゅう（右むき）。kind：0 = 成長期（地面に すわる 子りゅう・小さな つばさ）/ 1 = 成熟期（まくの つばさで とぶ）/ 2 = 完成期（つばさの無い 長い体で 空を およぐ 天のりゅう）
 * 体は しっぽ → 胴 → 首を 1 本の なめらかな くだで描く（丸や四角を かさねない）
 */
function dragon(g: G, p: Pose, f: number, L: Look, kind: 0 | 1 | 2): Geom {
  const [B, S, H] = L.c
  const belly = L.b ?? H
  const up = kind / 2
  const bob = p.bob * 0.6 + (p.bob < 0 ? p.bob : 0)
  const down = f % 2 === 1
  const asleep = p.eye === 'closed'
  const ox = p.lean
  const oy = bob + (kind ? (down ? -0.7 : 0.5) + (asleep ? 2.5 : 0) : 0)
  const wv = (k: number) => Math.sin(f * 1.1 + k) * (kind === 2 ? 1.3 : 0.7)
  let pts: Pt[]
  let R: (t: number) => number
  let hr: number
  if (kind === 0) {
    pts = [[5 + wv(0), 26], [8, 29], [12.5, 28.2], [14.5, 24.5 - p.sq * 0.4], [16, 20.5], [18, 17.5]]
    R = (t) => 0.6 + Math.exp(-(((t - 0.55) / 0.2) ** 2)) * 2.9 + (t > 0.75 ? 1.0 : t * 0.9)
    hr = 4.1
  } else if (kind === 1) {
    pts = [[1.5, 20 + wv(0)], [5.5, 22.5 + wv(1) * 0.6], [10, 21.5], [15.5, 19.5], [20, 17], [22.5, 13.5], [24, 11]]
    // しっぽは ほそく → むね（t 0.55）で ふくらみ → 首は ほそく
    R = (t) => 0.5 + t * 0.7 + Math.exp(-(((t - 0.55) / 0.17) ** 2)) * 2.1
    hr = 3.9
  } else {
    pts = [[1.5, 23 + wv(0)], [5, 26 + wv(1)], [9, 22 + wv(2)], [12.5, 26 + wv(3) * 0.6], [16.5, 22], [19, 17 + wv(4) * 0.4], [22.5, 14.5], [25, 10.5]]
    R = (t) => 0.6 + Math.sin(Math.pow(t, 0.75) * Math.PI) * 1.25 + (t > 0.7 ? 0.5 : 0)
    hr = 4.0
  }
  pts = pts.map(([x, y]) => [x + ox, y + oy] as Pt)
  const head = pts[pts.length - 1]
  const at = (t: number) => along(pts, t)
  const norm = (t: number): Pt => {
    const a = at(Math.max(0, t - 0.02))
    const b = at(Math.min(1, t + 0.02))
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    return [(b[1] - a[1]) / d, -(b[0] - a[0]) / d] // せなか側
  }
  // つばさ（成長期は 小さく・成熟期は 大きく）
  const sh = at(kind === 0 ? 0.72 : 0.6)
  const wl = kind === 0 ? 7.5 : 18
  const wa = asleep ? 2.6 : kind === 0 ? -2.2 - p.flap * 0.25 + (down ? 0.35 : 0) : down ? 2.75 : -2.05
  const wt = asleep || (kind === 1 && down) ? -1 : 1
  if (kind < 2 && !asleep) membraneWing(g, sh[0] + 1.2, sh[1] - 1, wl * 0.9, wa + (kind === 1 && down ? -0.25 : 0.28), wt, S, S)
  // たてがみ（天のりゅう）：せなかに そって ながれる 毛
  if (L.mane && kind === 2)
    for (let i = 0; i < 9; i++) {
      const t = 0.3 + i * 0.075
      const q = at(t)
      const n = norm(t)
      leaf(g, L.mane, q[0], q[1], q[0] + n[0] * (R(t) + 2.6) - 2.2, q[1] + n[1] * (R(t) + 2.6) + Math.sin(f + i) * 0.6, 1.0)
    }
  // せなかの とげ
  if (L.spike)
    for (let i = 0; i < (kind === 2 ? 0 : 6); i++) {
      const t = 0.22 + i * 0.1
      const q = at(t)
      const n = norm(t)
      leaf(g, L.spike, q[0] - 0.8, q[1], q[0] + n[0] * (R(t) + 1.6 + up * 1.4) - 1, q[1] + n[1] * (R(t) + 1.6 + up * 1.4), 0.8)
    }
  // しっぽの先：ほのお / やいば
  const tp = pts[0]
  if (L.tail === 'flame') {
    leaf(g, '#ff7a2a', tp[0] + 1, tp[1], tp[0] - 3 - (f % 2), tp[1] - 4.5, 1.8)
    leaf(g, '#ffd23f', tp[0] + 0.8, tp[1], tp[0] - 1.6, tp[1] - 2.6, 0.9)
  } else leaf(g, L.spike ?? L.horn ?? S, tp[0] + 1.5, tp[1], tp[0] - 3.2, tp[1] - 1.8, 1.3)
  // あし：奥
  const legAt = (t: number, len: number, c: string, sw: number) => {
    const q = at(t)
    const r = R(t)
    leaf(g, c, q[0], q[1] + r * 0.3, q[0] + 1.2 + sw, q[1] + r + len, 1.1 + up * 0.3)
    for (const dx of [-0.8, 0.4, 1.6]) rect(g, L.horn ?? '#fff0c2', q[0] + 1.2 + sw + dx, q[1] + r + len - 0.2, 0.7, 1)
  }
  if (kind > 0) {
    legAt(0.34, 2.2, S, 1.4)
    legAt(0.66, 1.8, S, 1.6)
  }
  // 体：かげ → 本体 → おなかの色（下がわへ ずらした ほそい くだ）
  tube(g, S, pts, (t) => R(t) + 0.5, 0, 0.3)
  tube(g, B, pts, R, -0.2, -0.4)
  // おなかの色：体の 下がわ（せなかの 反対）に そわせる
  for (let i = 4; i <= 40; i++) {
    const t = i / 44
    const q = at(t)
    const n = norm(t)
    const r = R(t)
    ell(g, belly, q[0] - n[0] * r * 0.5, q[1] - n[1] * r * 0.5, r * 0.52, r * 0.52)
  }
  // おなかの ふし
  for (let i = 0; i < (kind === 2 ? 9 : 5); i++) {
    const t = 0.3 + i * (kind === 2 ? 0.065 : 0.09)
    const q = at(t)
    const n = norm(t)
    rect(g, S, q[0] - n[0] * R(t) * 0.55 - 0.3, q[1] - n[1] * R(t) * 0.55 + 0.2, 1, 0.5)
  }
  leaf(g, H, at(0.45)[0], at(0.45)[1] - R(0.45) * 0.55, at(0.62)[0], at(0.62)[1] - R(0.62) * 0.55, 0.45)
  // あし：手前
  if (kind === 0) {
    ell(g, S, pts[3][0] - 1.6 + p.step * 0.8, 29.3, 2.4, 1.3)
    ell(g, S, pts[3][0] + 2.6 - p.step * 0.8, 29.3, 2.4, 1.3)
    const q = at(0.8)
    leaf(g, B, q[0] + 1, q[1] + 1, q[0] + 3.4, q[1] + 3.2 - p.flap, 0.9)
  } else {
    legAt(0.3, 2.6, B, -0.6)
    legAt(0.62, 2.2, B, -0.2)
  }
  // 手前の つばさ
  if (kind < 2) {
    if (asleep) leaf(g, S, sh[0], sh[1] - 1, sh[0] - 7, sh[1] + 2, 2)
    else membraneWing(g, sh[0], sh[1] - 1.2, wl, wa, wt, B, belly)
  }
  // 天のりゅう：手に もつ 光の玉 と ひげ
  if (kind === 2) {
    const q = at(0.66)
    if (L.gem) {
      ell(g, L.gem, q[0] + 3.2, q[1] + R(0.66) + 3.4, 2.1, 2.1)
      rect(g, '#ffffff', q[0] + 2.2, q[1] + R(0.66) + 2.4, 1, 1)
    }
  }
  const m = dragonHead(g, p, L, head[0] + 0.5, head[1], hr, up)
  if (kind === 2) for (const sg of [0, 1]) tailCurve(g, head[0] + hr * 1.6, head[1] + hr * 0.2, head[0] + hr * 2.6, head[1] + hr * (0.9 + sg * 0.6), head[0] + hr * 1.2 + wv(sg + 5), head[1] + hr * (2 + sg * 0.5), 0.45, 0.35, L.mane ?? S, L.mane ?? S)
  const mid = at(0.5)
  return { bx: mid[0], by: mid[1], rx: kind === 0 ? 4.5 : 7, ry: R(0.5), hx: head[0], hy: head[1], hr, mx: m.mx, my: m.my, cols: [B, S, H] }
}

// ---------- 系統の仲間（パーツ指定で描く）----------
/** families.ts の Look（パーツの指定）から 1 コマ描く。右むき、足もとは y=30 */
function critter(g: G, p: Pose, f: number, L: Look): Geom {
  // ねこ（耳も しっぽも ねこ）は 専用の描き方（見本）
  if (L.ear === 'cat' && L.tail === 'cat') return L.f === 'quad' ? cat(g, p, f, L) : pip(g, p, f, L)
  // とり（くちばし + とりの つばさ）：赤ちゃんは ひよこの つぶ
  if (L.f === 'bird' && L.beak && L.wing === 'bird') return L.s < 0.8 ? chick(g, p, f, L) : bird(g, p, f, L)
  // りゅう（つの + まくの つばさ）：つぶ → 子りゅう → とぶ りゅう → 天のりゅう
  if (L.horn && (L.wing === 'bat' || L.wing === 'dragon')) return L.s < 0.8 ? whelp(g, p, f, L) : dragon(g, p, f, L, L.s < 1 ? 0 : L.s < 1.4 ? 1 : 2)
  // いぬ・おおかみ（しっぽが いぬ）も 同じ体に、いぬの頭
  if (L.tail === 'dog') return L.f === 'quad' ? cat(g, p, f, L, true) : pip(g, p, f, L, true)
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
    } else if ((L.tail as string) === 'dog') {
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
    // バイザーでも表情がわかるように：まぶた・つり目・にっこり
    if (p.eye === 'closed') rect(g, dark, fx - hr * 0.3, fy - 2.5, hr * 1.2, 3)
    else if (p.eye === 'sleepy') rect(g, dark, fx - hr * 0.3, fy - 2.5, hr * 1.2, 1.5)
    else if (p.eye === 'angry') poly(g, dark, [fx - hr * 0.3, fy - 2.5, fx + hr * 0.9, fy - 2.5, fx + hr * 0.9, fy - 1])
    else if (p.eye === 'worry') poly(g, dark, [fx - hr * 0.3, fy - 2.5, fx + hr * 0.9, fy - 2.5, fx - hr * 0.3, fy - 1])
    else if (p.eye === 'happy') rect(g, dark, fx - hr * 0.3, fy - 0.5, hr * 1.2, 1)
  } else if (L.cyclops) {
    ell(g, '#ffffff', fx + 2, fy, hr * 0.5, hr * 0.45)
    ell(g, '#ff3b5e', fx + 3, fy, hr * 0.28, hr * 0.28)
    rect(g, dark, fx + 3, fy - 0.5, 1, 1.5)
    if (p.eye === 'closed') ell(g, B, fx + 2, fy, hr * 0.52, hr * 0.46)
    else if (p.eye === 'sleepy') rect(g, B, fx + 2 - hr * 0.55, fy - hr * 0.5, hr * 1.1, hr * 0.5)
    else if (p.eye === 'angry') poly(g, dark, [fx + 2 - hr * 0.55, fy - hr * 0.6, fx + 2 + hr * 0.55, fy - hr * 0.6, fx + 2 + hr * 0.55, fy - hr * 0.2])
    else if (p.eye === 'worry') poly(g, dark, [fx + 2 - hr * 0.55, fy - hr * 0.6, fx + 2 + hr * 0.55, fy - hr * 0.6, fx + 2 - hr * 0.55, fy - hr * 0.2])
  } else eyes(g, [fx + 0.5, fx + hr * 0.6 + 1.5], fy - 1, p.eye, dark)
  if (L.beak) {
    const bxp = hx + hr * 0.85
    if (p.mouth === 1 || p.mouth === 4) {
      poly(g, '#ff9f43', [bxp - 1, hy - 1, bxp + 4, hy - 1.5, bxp - 1, hy + 0.5])
      poly(g, '#e8662a', [bxp - 1, hy + 1.5, bxp + 3.5, hy + 2.5, bxp - 1, hy + 3.5])
    } else poly(g, '#ff9f43', [bxp - 1, hy - 0.5, bxp + 4, hy + 0.8, bxp - 1, hy + 2.5])
  } else if (quad && !L.visor) {
    ell(g, H, hx + hr * 0.75, hy + hr * 0.35, hr * 0.5, hr * 0.38)
    rect(g, dark, hx + hr * 0.95, hy + hr * 0.1, 1.5, 1)
  }
  const mx = fx + hr * 0.4
  const my = fy + hr * 0.5 + 1
  if (!L.beak && !L.cyclops) mouthShape(g, p.mouth, mx, my, dark, !quad)
  if (L.fang) {
    poly(g, '#ffffff', [mx, my, mx + 1.2, my, mx + 0.6, my + 2])
    poly(g, '#ffffff', [mx + 2.2, my, mx + 3.4, my, mx + 2.8, my + 2])
  }
  return { bx: quad ? cx - 1 : cx, by: ty, rx, ry, hx, hy, hr, mx, my, cols: [B, S, H] }
}

/** 口のかたち（mouth: 0 とじる / 1 あける / 2 にっこり / 3 こまり / 4 よだれ / 5 くいしばり） */
function mouthShape(g: G, kind: number, x: number, y: number, dark: string, line: boolean) {
  if (kind === 1) rect(g, '#7a1f3d', x, y, 2.5, 2)
  else if (kind === 4) rect(g, '#7a1f3d', x, y, 2.5, 2.5)
  else if (kind === 2) {
    rect(g, dark, x, y + 0.5, 2.5, 0.5)
    rect(g, dark, x - 0.5, y, 0.5, 0.5)
    rect(g, dark, x + 2.5, y, 0.5, 0.5)
  } else if (kind === 3) {
    rect(g, dark, x, y, 2.5, 0.5)
    rect(g, dark, x - 0.5, y + 0.5, 0.5, 0.5)
    rect(g, dark, x + 2.5, y + 0.5, 0.5, 0.5)
  } else if (kind === 5) {
    rect(g, '#ffffff', x, y, 3, 1.5)
    rect(g, dark, x, y, 3, 0.5)
    rect(g, dark, x, y + 1.5, 3, 0.5)
    rect(g, dark, x + 1, y, 0.5, 1.5)
    rect(g, dark, x + 2, y, 0.5, 1.5)
  } else if (line) rect(g, dark, x, y + 0.5, 2, 0.8)
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
/** 敵の亜種 6 種とボス 3 種（オリジナル）。もとの敵に混ざって、ステージや敵軍の波で出てくる */
const FOE_SPECIES: Record<FoeId, Species> = {
  shimonoiz: { id: 'shimonoiz', name: 'シモノイズ', kind: 'こおりのかけら型', height: 1.4, hp: 42, atk: 7, speed: 1.4, temper: 'wild', tier: 0 },
  homurabug: { id: 'homurabug', name: 'ホムラバグ', kind: 'ほのおのむし型', height: 1.2, hp: 30, atk: 7, speed: 2.3, temper: 'wild', tier: 0 },
  tetsubug: { id: 'tetsubug', name: 'テツバグ', kind: 'はがねのむし型', height: 1.3, hp: 58, atk: 8, speed: 1.2, temper: 'wild', tier: 0 },
  fuguran: { id: 'fuguran', name: 'フグラン', kind: 'ふくらみ魚型', height: 1.45, hp: 40, atk: 9, speed: 1.5, temper: 'wild', float: true, tier: 0 },
  shirokage: { id: 'shirokage', name: 'シロカゲ', kind: 'つきのかげ', height: 1.55, hp: 44, atk: 11, speed: 1.7, temper: 'wild', float: true, tier: 0, habit: 'night' },
  ganmaru: { id: 'ganmaru', name: 'ガンマル', kind: 'ころがりいわ型', height: 1.5, hp: 75, atk: 10, speed: 1.0, temper: 'wild', tier: 0 },
  hatenashi: { id: 'hatenashi', name: 'ハテナシ', kind: 'ノイズのおう', height: 3.0, hp: 130, atk: 15, speed: 1.0, temper: 'wild', tier: 0, boss: true },
  kazanou: { id: 'kazanou', name: 'カザンオウ', kind: 'かざんのおう', height: 3.1, hp: 150, atk: 17, speed: 0.75, temper: 'wild', tier: 0, boss: true },
  sangogani: { id: 'sangogani', name: 'サンゴガニ', kind: 'さんごのカニおう', height: 2.9, hp: 140, atk: 16, speed: 0.85, temper: 'wild', tier: 0, boss: true },
}
const FOE_SKILLS: Record<FoeId, { name: string; kind: 'shot' | 'burst' | 'dash' | 'rain' | 'heal' | 'wave'; color: string; mult: number }> = {
  shimonoiz: { name: 'こごえるノイズ', kind: 'burst', color: '#bfefff', mult: 1.7 },
  homurabug: { name: 'ひのこミサイル', kind: 'shot', color: '#ff8a3a', mult: 1.6 },
  tetsubug: { name: 'てっぺきタックル', kind: 'dash', color: '#c9d4e8', mult: 1.9 },
  fuguran: { name: 'とげだま', kind: 'burst', color: '#ffb84d', mult: 1.8 },
  shirokage: { name: 'つきかげのまい', kind: 'dash', color: '#d8e8ff', mult: 1.9 },
  ganmaru: { name: 'ごろごろタックル', kind: 'dash', color: '#c8b89a', mult: 2.0 },
  hatenashi: { name: 'ノイズストーム', kind: 'wave', color: '#ff3bd4', mult: 2.3 },
  kazanou: { name: 'ふんかだん', kind: 'rain', color: '#ff7a2a', mult: 2.4 },
  sangogani: { name: 'サンゴのたたき', kind: 'wave', color: '#ff8ab8', mult: 2.3 },
}
Object.assign(NEW_SKILLS, FOE_SKILLS)
export const SPECIES: Record<SpeciesId, Species> = { ...OLD_SPECIES, ...NEW_SPECIES, ...FOE_SPECIES, ...secretSpecies() }
export const familyOf = (id: SpeciesId): Family => (FAMILY_OF[id] as Family | undefined) ?? 'plain'
/** つぎの姿：系統ごとの枝分かれ → なければ 昔からの BRANCH */
export function nextForm(id: SpeciesId, tier: 1 | 2 | 3, care: Care): SpeciesId {
  return (EVOLVE[id]?.[care] as SpeciesId | undefined) ?? BRANCH[tier][care]
}
export { BABY, EGG_COLORS, FAMILY_NAME, STAGE_EGGS, type EggKind } from './families'

// ---------- 敵の亜種・ボスの出かた ----------
/** ステージごとに出やすい亜種（森・砂丘・入り江・雪原・回路峰） */
const STAGE_FOES: SpeciesId[][] = [['ganmaru'], ['homurabug', 'ganmaru'], ['fuguran'], ['shimonoiz'], ['tetsubug', 'shimonoiz']]
/** ボスは 3 種が順ぐりに。最初に出る子はステージで決まる */
const BOSSES: SpeciesId[] = ['hatenashi', 'kazanou', 'sangogani']
const BOSS_START = [0, 1, 2, 0, 1]
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
/** ステージの敵のもとの種族を、ときどき そのステージらしい亜種に入れかえる */
export function enemyFor(id: SpeciesId, stage: number): SpeciesId {
  if (id === 'yamikage') return Math.random() < (stage >= 3 ? 0.55 : 0.12) ? 'shirokage' : id
  if (id !== 'noiz' && id !== 'togebug') return id
  return Math.random() < 0.38 ? pick(STAGE_FOES[stage] ?? STAGE_FOES[0]) : id
}
/** 敵軍のふつうの兵：もとの敵 + ステージの亜種が混ざる */
export function armyMember(stage: number, wave: number): SpeciesId {
  const r = Math.random()
  if (Math.random() < 0.4) return pick(STAGE_FOES[stage] ?? STAGE_FOES[0])
  return enemyFor(r < 0.45 ? 'noiz' : r < 0.85 || wave < 2 ? 'togebug' : 'gougan', stage)
}
/** 敵軍のボス（3 回に 1 回、専用の大きな姿） */
export function armyBoss(stage: number, wave: number): SpeciesId {
  return BOSSES[((BOSS_START[stage] ?? 0) + Math.max(0, Math.floor(wave / 3) - 1)) % BOSSES.length]
}


// ---------- 個体差（もよう・色のゆらぎ）と 色ちがい ----------
/** 昔からいる子の「からだ」「あたま」の位置（描画関数と同じ式） */
const geom = (bx: number, by: number, rx: number, ry: number, hx: number, hy: number, hr: number, cols: string[]): Geom =>
  ({ bx, by, rx, ry, hx, hy, hr, mx: hx + hr * 0.45, my: hy + hr * 0.5, cols })
const OLD_GEOM: Record<OldId, (p: Pose) => Geom> = {
  mebu: (p) => {
    const ry = 8 - p.sq * 0.7
    const cx = 16 + p.lean
    const cy = 30 - ry - 1 + p.bob * 0.5 + (p.bob < 0 ? p.bob : 0)
    return geom(cx, cy, 9 + p.sq * 0.7, ry, cx + 4, cy - 1, 6, ['#6fd26a', '#3f9e4a', '#c8f7b0'])
  },
  pikori: (p) => {
    const ry = 9 - p.sq * 0.6
    const cx = 16 + p.lean
    const cy = 29 - ry + p.bob * 0.5 + (p.bob < 0 ? p.bob : 0)
    return geom(cx, cy, 9 + p.sq * 0.6, ry, cx + 3, cy - 3, 5, ['#ffd23f', '#d99a00', '#fff3b0'])
  },
  gorota: (p) => geom(14 + p.lean, 22 + p.bob * 0.5, 11, 6 - p.sq * 0.5, 26 + p.lean, 22 + p.bob * 0.5, 3.5, ['#8a94a6', '#5f6878', '#c4ccd8', '#9aa4b6']),
  fuwari: (p) => geom(16 + p.lean, 14 + p.bob, 8, 6, 17 + p.lean, 14 + p.bob, 5, ['#fdfbff', '#cdb8ec']),
  giaru: (p) => {
    const cx = 16 + p.lean
    const cy = 21 + p.bob * 0.5 + (p.bob < 0 ? p.bob : 0)
    return geom(cx, cy + 2, 6, 5, cx + 0.5, cy - 8 + p.sq * 0.5, 6, ['#5b3fc9', '#8e6cff', '#a58cff', '#6f55d8', '#d6caff'])
  },
  hireru: (p) => geom(16 + p.lean, 17 + p.bob, 10 + p.sq * 0.5, 7 - p.sq * 0.5, 22 + p.lean, 16 + p.bob, 5, ['#3fc1c9', '#1f8a9a', '#b8f3f5']),
  mofuru: (p) => {
    const ry = 9 - p.sq * 0.7
    const cx = 16 + p.lean
    const cy = 29 - ry + p.bob * 0.5 + (p.bob < 0 ? p.bob : 0)
    return geom(cx, cy, 10 + p.sq * 0.7, ry, cx + 4, cy, 6, ['#fbfdff', '#c9d8ee', '#ffffff'])
  },
  garudora: (p) => {
    const cx = 15 + p.lean
    const cy = 20 + p.bob * 0.5 + (p.bob < 0 ? p.bob : 0)
    return geom(cx, cy + 1, 8, 7 - p.sq * 0.5, cx + 9, cy - 10, 4.5, ['#4a6fa5', '#2a3f6e', '#8fb0e0'])
  },
  shioryu: (p) => geom(14 + p.lean, 19 + p.bob, 9, 4, 23 + p.lean, 11 + p.bob, 4.5, ['#2fb5c9', '#1f8a9a', '#9ae6ea']),
  hoshikujira: (p) => geom(16 + p.lean, 16 + p.bob, 12, 7.5 - p.sq * 0.4, 23 + p.lean, 16 + p.bob, 5, ['#2a3a7a', '#1a2350', '#5a6ab0']),
  togebug: (p) => geom(16 + p.lean, 24 + p.bob * 0.5, 9, 5.5 - p.sq * 0.5, 25 + p.lean, 25 + p.bob * 0.5, 3, ['#2a6f6a', '#1a4a48', '#5fb8a8']),
  yamikage: (p) => geom(16 + p.lean, 16 + p.bob, 8, 7, 19 + p.lean, 15 + p.bob, 4, ['#2a1a50', '#3a2a6a']),
  gougan: (p) => geom(16 + p.lean, 19 + p.bob * 0.5, 9, 8, 18 + p.lean, 9 + p.bob * 0.5, 3.5, ['#4f4740', '#7a6f66', '#a89c90']),
  noiz: (p) => geom(16 + p.lean, 21 + p.bob * 0.5, 9, 8, 18 + p.lean, 20 + p.bob * 0.5, 4, ['#2b2350', '#1a1530', '#4a3d80']),
}

/** えの かわりに ふつうの目を持つ子（表情の目の形を eyes() にまかせられる） */
const PLAIN_EYES = new Set<string>(['mebu', 'pikori', 'gorota', 'fuwari', 'hireru', 'mofuru', 'shioryu', 'hoshikujira'])
/** 昔の描き方の子には、新しい表情を昔の目・口に置きかえて渡す */
function legacyPose(id: string, p: Pose): Pose {
  const mouth = p.mouth === 1 || p.mouth === 4 || p.mouth === 5 ? 1 : 0
  let eye = p.eye
  if (!PLAIN_EYES.has(id)) eye = p.eye === 'sleepy' ? 'closed' : p.eye === 'hungry' || p.eye === 'worry' ? 'open' : p.eye
  return { ...p, mouth, eye }
}

function drawBody(g: G, id: SpeciesId, p: Pose, f: number): Geom {
  const old = DRAW_OLD[id as OldId]
  if (old) {
    const q = legacyPose(id, p)
    old(g, q, f)
    return OLD_GEOM[id as OldId](q)
  }
  const foe = DRAW_FOE[id as FoeId]
  if (foe) {
    const q = legacyPose(id, p)
    foe(g, q, f)
    return FOE_GEOM[id as FoeId](q)
  }
  return critter(g, p, f, LOOKS[id])
}

/** 個体の見た目 8 種（キャッシュが増えすぎないように量子化）：0 ふつう / 1 いろこいめ / 2 いろうすめ / 3 ぶち / 4 しま / 5 そばかす / 6 ほっぺ / 7 しま+いろちがい */
export const LOOK_NAME = ['', 'いろこいめ', 'いろうすめ', 'ぶち', 'しま', 'そばかす', 'ほっぺ', 'しまもよう']
const LOOK_BY_SEED = [0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4, 5, 6]
/** シード → 見た目 0〜7 */
export const lookOf = (seed: number) => LOOK_BY_SEED[(seed >>> 0) % 16]
/** 見た目 0〜7 + 色ちがい(+8) = スプライトの種類 0〜15 */
export const variantOf = (seed: number, rare: boolean) => lookOf(seed) + (rare ? 8 : 0)
export const newSeed = () => Math.floor(Math.random() * 0x7fffffff)

const hexRgb = new Map<string, [number, number, number]>()
const rgbOf = (c: string): [number, number, number] => {
  let v = hexRgb.get(c)
  if (!v) {
    const n = parseInt(c.slice(1), 16)
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    hexRgb.set(c, v)
  }
  return v
}
function toHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  if (mx === mn) return [0, 0, l]
  const d = mx - mn
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}
function fromHsl(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

/** 色ちがい：系統ごとに色相をずらす量（すこし白っぽい子は 彩度も足す） */
const RARE_SHIFT: Record<string, number> = { plain: 165, machine: 125, dragon: 150, cat: 205, dog: 175, bird: 140, water: 135, monster: 105 }
const rareShift = (id: string) => RARE_SHIFT[FAMILY_OF[id] ?? 'plain'] ?? 150

type Mode = 'spot' | 'stripe' | 'freckle' | 'cheek'
/** もよう・色のゆらぎ・色ちがいを、描き終えた絵のからだの色の所にだけ重ねる（目・口・飾りはそのまま） */
function decorate(g: G, o: Geom, vk: number, id: string) {
  const look = vk & 7
  const rare = vk >= 8
  if (!look && !rare) return
  const W = g.canvas.width
  const H = g.canvas.height
  const img = g.getImageData(0, 0, W, H)
  const d = img.data
  const cols = o.cols.map(rgbOf)
  const mode: Mode | '' = look === 3 ? 'spot' : look === 4 || look === 7 ? 'stripe' : look === 5 ? 'freckle' : look === 6 ? 'cheek' : ''
  if (mode) {
    const ell2 = (u: number, v: number, cx: number, cy: number, a: number, b: number) => ((u - cx) / a) ** 2 + ((v - cy) / b) ** 2 < 1
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4
        if (d[i + 3] < 200 || !cols.some((c) => Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]) <= 44)) continue
        const u = (x - PAD + 0.5) / 2
        const v = (y - PAD + 0.5) / 2
        let on = false
        if (mode === 'spot') {
          on = ell2(u, v, o.bx - o.rx * 0.42, o.by - o.ry * 0.12, o.rx * 0.34, o.ry * 0.34) || ell2(u, v, o.bx + o.rx * 0.2, o.by + o.ry * 0.42, o.rx * 0.28, o.ry * 0.26) || ell2(u, v, o.bx + o.rx * 0.55, o.by - o.ry * 0.3, o.rx * 0.2, o.ry * 0.22)
        } else if (mode === 'stripe') {
          on = ell2(u, v, o.bx, o.by, o.rx * 1.08, o.ry * 1.08) && ((u - o.bx) * 0.9 + (v - o.by) * 0.35 + 200) % 4.4 < 1.6
        } else if (mode === 'freckle') {
          for (const [dx, dy] of FRECKLES) if ((u - (o.hx + dx * o.hr)) ** 2 + (v - (o.hy + dy * o.hr)) ** 2 < 0.36) on = true
        } else {
          on = ell2(u, v, o.hx + o.hr * 0.2, o.hy + o.hr * 0.38, Math.max(1.3, o.hr * 0.26), Math.max(0.9, o.hr * 0.17)) || ell2(u, v, o.hx + o.hr * 0.78, o.hy + o.hr * 0.34, Math.max(1.3, o.hr * 0.26), Math.max(0.9, o.hr * 0.17))
        }
        if (!on) continue
        const light = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11 > 85
        if (mode === 'spot' || mode === 'stripe') {
          const k = mode === 'spot' ? [0.66, 0.58, 0.56] : [0.62, 0.62, 0.74]
          for (let ch = 0; ch < 3; ch++) d[i + ch] = light ? d[i + ch] * k[ch] : Math.min(255, d[i + ch] + 40)
        } else {
          const t = mode === 'freckle' ? (light ? [120, 64, 40] : [255, 214, 140]) : [255, 128, 156]
          const m = mode === 'freckle' ? 0.75 : 0.6
          for (let ch = 0; ch < 3; ch++) d[i + ch] = d[i + ch] * (1 - m) + t[ch] * m
        }
      }
  }
  const dh = look === 1 ? -11 : look === 2 || look === 7 ? 11 : 0
  const dl = look === 1 ? -0.035 : look === 2 ? 0.045 : 0
  const rs = rare ? rareShift(id) : 0
  if (dh || dl || rare) {
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue
      if (rare && d[i] >= 254 && d[i + 1] >= 254 && d[i + 2] >= 254) continue
      let [h, s, l] = toHsl(d[i], d[i + 1], d[i + 2])
      if (l < 0.17) continue
      if (rare) {
        s += Math.max(0, 0.5 - s) * 0.85
        if (l > 0.88) l = 0.88 + (l - 0.88) * 0.45
        h += rs
      } else {
        if (s < 0.1 || l > 0.97) continue
        h += dh
        l += dl
      }
      const [r, gg, b] = fromHsl(h, s, l)
      d[i] = r
      d[i + 1] = gg
      d[i + 2] = b
    }
  }
  g.putImageData(img, 0, 0)
}
const FRECKLES = [[0.3, 0.2], [0.52, 0.3], [0.16, 0.34], [0.62, 0.08], [0.4, 0.42], [0.04, 0.22], [0.55, 0.5]]

const clampTo = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
/** 表情のしるし（ハート・よだれ・z・あせ・#）。色ちがいの色相ずらしを受けないよう、最後に重ねる */
function drawMark(g: G, mark: Mark, o: Geom, f: number) {
  if (!mark) return
  const alt = f % 2
  const top = o.hy - o.hr
  if (mark === 'drool') {
    const x = clampTo(o.mx + 1.2, 2, 31)
    const y = clampTo(o.my + 2.6 + alt * 0.9, 3, 29)
    poly(g, '#8fd8ff', [x, y - 1.6, x - 0.9, y, x + 0.9, y])
    ell(g, '#8fd8ff', x, y + 0.2, 1, 1)
    rect(g, '#ffffff', x - 0.5, y - 0.3, 0.5, 0.5)
  } else if (mark === 'z') {
    const x = clampTo(o.hx + o.hr * 0.8 + 1, 3, 29)
    const y = clampTo(top - 1.5 - alt, 6, 24)
    const z = (zx: number, zy: number, w: number) => {
      rect(g, '#d8ecff', zx, zy, w, 0.6)
      rect(g, '#d8ecff', zx, zy + w - 0.6, w, 0.6)
      poly(g, '#d8ecff', [zx + w, zy + 0.5, zx + w - 0.9, zy + 0.5, zx, zy + w - 0.5, zx + 0.9, zy + w - 0.5])
    }
    z(x, y, 3)
    z(x + 2.8, y - 3.8, 2)
  } else if (mark === 'vein') {
    const x = clampTo(o.hx + o.hr * 0.7, 3, 30)
    const y = clampTo(top - 0.5, 4, 26)
    const a = alt ? 1.15 : 1
    const c = '#ff3b3b'
    rect(g, c, x - 0.9 * a, y - 1.6 * a, 0.5, 3.2 * a)
    rect(g, c, x + 0.5 * a, y - 1.6 * a, 0.5, 3.2 * a)
    rect(g, c, x - 1.6 * a, y - 0.9 * a, 3.2 * a, 0.5)
    rect(g, c, x - 1.6 * a, y + 0.5 * a, 3.2 * a, 0.5)
  } else if (mark === 'sweat') {
    const x = clampTo(o.hx + o.hr * 0.95, 3, 31)
    const y = clampTo(o.hy - o.hr * 0.5 + alt * 0.9, 4, 26)
    poly(g, '#7fd1ff', [x, y - 2.2, x - 1.2, y + 0.2, x + 1.2, y + 0.2])
    ell(g, '#7fd1ff', x, y + 0.5, 1.2, 1.2)
    rect(g, '#ffffff', x - 0.6, y, 0.5, 0.8)
  } else if (mark === 'heart') {
    const x = clampTo(o.hx + o.hr * 0.8 + 1, 4, 30)
    const y = clampTo(top - 2 - alt, 5, 26)
    const c = '#ff6f9c'
    rect(g, c, x - 1.5, y - 1, 1, 1)
    rect(g, c, x + 0.5, y - 1, 1, 1)
    rect(g, c, x - 1.5, y, 3, 1)
    rect(g, c, x - 1, y + 1, 2, 1)
    rect(g, c, x - 0.5, y + 2, 1, 0.5)
    rect(g, '#ffd0e0', x - 1.5, y - 1, 0.5, 0.5)
  }
}
/** 色ちがいのしるし：あたまの上の金の ★ */
function drawStar(g: G, o: Geom, f: number) {
  const x = clampTo(o.hx - o.hr * 0.55, 4, 29)
  const y = clampTo(o.hy - o.hr - 2.4, 3.6, 26)
  const R = f % 2 ? 2.6 : 2.2
  const star = (r: number, c: string) => {
    const pts: number[] = []
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const rr = i % 2 ? r * 0.45 : r
      pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
    }
    poly(g, c, pts)
  }
  star(R, '#ffd23f')
  star(R * 0.5, '#fff6b0')
}

function paintFrame(g: G, id: SpeciesId, p: Pose, i: number, vk: number) {
  g.scale(2, 2)
  const geo = drawBody(g, id, p, i)
  decorate(g, geo, vk, id)
  if (p.mark) drawMark(g, p.mark, geo, i)
  if (vk >= 8) drawStar(g, geo, i)
}

const cache = new Map<string, Sheet>()
/** スプライトシート：id × 見た目 vk（0〜15、8 以上 = 色ちがい）。生成時に 1 回だけ焼いてキャッシュする */
export function sheetFor(id: SpeciesId, vk = 0): Sheet {
  const key = `${id}:${vk}`
  let s = cache.get(key)
  if (!s) {
    // 2 倍の解像度（68×64）で描き、自動陰影と色付き輪郭をかける
    const frames = POSES.map((p, i) => pixelSprite(68, 64, (g) => paintFrame(g, id, p, i, vk), '#1a1530', { shade: true }))
    s = buildSheet(frames, ANIMS)
    cache.set(key, s)
  }
  return s
}

const portraits = new Map<string, HTMLCanvasElement>()
/** ずかん用：1 コマ目だけ焼いた小さな絵（シート全体を作らない） */
export function portraitFor(id: SpeciesId, vk = 0): HTMLCanvasElement {
  const key = `${id}:${vk}`
  let c = portraits.get(key)
  if (!c) {
    const sh = cache.get(key)
    if (sh) {
      // 焼いてあるシートがあれば、その 1 コマ目だけを切りだす（シートをそのまま返すと全コマが並んだ絵になる）
      const atlas = sh.texture.image as HTMLCanvasElement
      c = document.createElement('canvas')
      c.width = sh.cellW
      c.height = sh.cellH
      c.getContext('2d')!.drawImage(atlas, 0, 0, sh.cellW, sh.cellH, 0, 0, sh.cellW, sh.cellH)
    } else c = pixelSprite(68, 64, (g) => paintFrame(g, id, POSES[0], 0, vk), '#1a1530', { shade: true })
    portraits.set(key, c)
  }
  return c
}

const silhouettes = new Map<string, Sheet>()
/** 進化の演出用：白いシルエットだけの 1 コマ（どのアニメ名でも同じ絵）。色ちがいの飾りや表情は入れない */
export function silhouetteFor(id: SpeciesId): Sheet {
  let s = silhouettes.get(id)
  if (!s) {
    const frame = pixelSprite(
      68,
      64,
      (g) => {
        g.scale(2, 2)
        drawBody(g, id, POSES[0], 0)
        g.globalCompositeOperation = 'source-in'
        g.fillStyle = '#ffffff'
        g.fillRect(-10, -10, 80, 80)
      },
      '#9fdcff',
    )
    const anims: Record<string, AnimDef> = {}
    for (const k of Object.keys(ANIMS)) anims[k] = { frames: [0], fps: 1, loop: true }
    s = buildSheet([frame], anims, false)
    silhouettes.set(id, s)
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
  setSpecies(id: SpeciesId, height: number, variant?: number): void
  /** 進化の演出：白いシルエットにする（setSpecies で元にもどる）。3D モデルでは使わない */
  silhouette?(id: SpeciesId, height: number): void
  dispose(): void
}

/** 2.5D のドット絵キャラ（やられた時は赤く色づく） */
export class SpriteMonster extends SpriteAnim implements MonsterView {
  private cur = 'idle'
  constructor(id: SpeciesId, height: number, variant = 0) {
    super(sheetFor(id, variant), height, 'idle')
  }
  setSpecies(id: SpeciesId, height: number, variant = 0) {
    this.setSheet(sheetFor(id, variant), height)
  }
  silhouette(id: SpeciesId, height: number) {
    this.setSheet(silhouetteFor(id), height)
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
