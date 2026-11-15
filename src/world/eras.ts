import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * 町の「時代」ごとの 建物の形（計画 B の 見た目。すべて オリジナル）。
 *
 * 時代は 枝分かれ する：
 *   1 のじゅく → 2 まるたの村 → 3 木ぐみの町 → 4 石の城下町 → 5 城 ─┬→ 6 白い城
 *                                                                └→ 7 じょうきの町 → 8 まざりの町 → 9 きかいの城
 *   7 = れんがと 銅の パイプ・はぐるま・えんとつ（じょうきの 機械と くらしが まざる）
 *   8 = 石や 木の 家に 画面・ケーブル・アンテナが 生えた、機械と 自然が まざった町
 *
 * `wear` = 古び：0 新しい / 1 古びた（こけ・つた・ひび）/ 2 くずれた（屋根が ぬけ・壁が かけ・がれき・木が 生える）
 * 細かい部品を たくさん 使うので、同じ色の 形は 最後に 1 つに まとめる（描く回数を へらす）。
 * 名前つきの部品（lit 窓 / flag 旗 / blades まわる物 / chimney けむり）は まとめずに 残す。
 */
export type Era = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
/** 建物の 大きさ（2026-11-15：細かい 描きこみが 見えるように 1.5 倍）。区画の 間・当たり判定・タップの 高さも これを 掛ける */
export const BUILD_SCALE = 1.5
/** 町の 枝：white = 白い城へ / steam = じょうき → まざり → きかいへ */
export type EraPath = 'white' | 'steam'
/** 町の 段（村の 点数で 上がる）→ 時代。6 段めから 枝で 分かれる */
const STEP_SCORE = [0, 1, 3, 6, 10, 15, 21, 28]
export function eraStep(score: number) {
  let s = 1
  for (let i = 0; i < STEP_SCORE.length; i++) if (score >= STEP_SCORE[i]) s = i + 1
  return s
}
export function eraOf(step: number, path: EraPath | undefined): Era {
  if (step <= 5) return step as Era
  if (path === 'white') return 6
  return Math.min(9, step + 1) as Era
}
/** 窓（夜に ともる 色）。画面・回路・文字は いつも 光る */
export const WINDOW_LIT = new Set(['ffd27a', 'ffc46a', 'ffcf7a', '7fd8ff', 'ff9ecb', 'ffe27a', 'b48cff', 'fff4d8', 'ffb347'])
export type Wear = 0 | 1 | 2
export const ERAS: Era[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]
export const ERA_NAME: Record<Era, string> = {
  1: 'のじゅく', 2: 'まるたの村', 3: '木ぐみの町', 4: '石の城下町', 5: '城', 6: '白い城', 7: 'じょうきの町', 8: 'まざりの町', 9: 'きかいの城',
}
/** 次の時代（枝分かれ） */
export const ERA_NEXT: Record<Era, Era[]> = { 1: [2], 2: [3], 3: [4], 4: [5], 5: [6, 7], 6: [], 7: [8], 8: [9], 9: [] }
export interface EraCtx {
  lam: (color: string) => THREE.Material
  basic: (color: string) => THREE.Material
}

const mix = (a: string, b: string, t: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()
const WOOD = '#6a4a30'
const DARK = '#3d2a1e'
const STONE = '#a4aab2'
const COPPER = '#b8763a'
const BRASS = '#c9a44a'
const IRON = '#3a4250'

class Kit {
  g = new THREE.Group()
  r: () => number
  private mats = new Map<string, THREE.Material>()
  constructor(readonly ctx: EraCtx, readonly W: Wear, seed: number) {
    let a = (seed * 9301 + 49297) % 233280
    this.r = () => ((a = (a * 9301 + 49297) % 233280), a / 233280)
  }
  get old() {
    return this.W >= 1
  }
  get ruin() {
    return this.W === 2
  }
  /** 古びると くすんで こけ色に よる */
  m(c: string, raw = false) {
    const col = raw || !this.W ? c : mix(c, this.W === 2 ? '#56604a' : '#667058', this.W === 2 ? 0.42 : 0.26)
    let m = this.mats.get(col)
    if (!m) this.mats.set(col, (m = this.ctx.lam(col)))
    return m
  }
  glow(c: string) {
    const key = 'g' + c
    let m = this.mats.get(key)
    if (!m) this.mats.set(key, (m = this.ctx.basic(c)))
    return m
  }
  add<T extends THREE.Object3D>(o: T, x: number, y: number, z: number) {
    o.position.set(x, y, z)
    this.g.add(o)
    return o
  }
  box(w: number, h: number, d: number, c: string | THREE.Material, x: number, y: number, z: number) {
    return this.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? this.m(c) : c), x, y, z)
  }
  cyl(rt: number, rb: number, h: number, seg: number, c: string | THREE.Material, x: number, y: number, z: number) {
    return this.add(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof c === 'string' ? this.m(c) : c), x, y, z)
  }
  ball(rad: number, c: string | THREE.Material, x: number, y: number, z: number, det = 0) {
    return this.add(new THREE.Mesh(new THREE.IcosahedronGeometry(rad, det), typeof c === 'string' ? this.m(c) : c), x, y, z)
  }
  rock(rad: number, c: string, x: number, y: number, z: number) {
    const o = this.add(new THREE.Mesh(new THREE.DodecahedronGeometry(rad, 0), this.m(c)), x, y, z)
    o.rotation.set(this.r() * 3, this.r() * 3, this.r() * 3)
    o.scale.y = 0.7
    return o
  }
  /** 石づみ・れんがの かべ：箱の 表に ずれた 石を ちりばめる */
  masonry(w: number, h: number, d: number, c: string, x: number, y: number, z: number, n = 14) {
    this.box(w, h, d, c, x, y, z)
    const lt = mix(c, '#ffffff', 0.22)
    const dk = mix(c, '#20222a', 0.28)
    for (let i = 0; i < n; i++) {
      const side = i % 3 === 2
      const sw = 0.14 + this.r() * 0.12
      const sy = y - h / 2 + 0.08 + Math.floor(this.r() * (h / 0.13)) * 0.13
      if (sy > y + h / 2 - 0.05) continue
      if (side) this.box(0.025, 0.09, sw, i % 2 ? lt : dk, x + (this.r() < 0.5 ? -1 : 1) * (w / 2 + 0.008), sy, z + (this.r() - 0.5) * (d - sw))
      else this.box(sw, 0.09, 0.025, i % 2 ? lt : dk, x + (this.r() - 0.5) * (w - sw), sy, z + d / 2 + 0.008)
    }
    // かどの 石
    for (let yy = y - h / 2 + 0.1; yy < y + h / 2 - 0.05; yy += 0.26) for (const sx of [-1, 1]) this.box(0.1, 0.12, 0.1, lt, x + sx * (w / 2 - 0.03), yy, z + d / 2 - 0.03)
  }
  /** まるい塔の 石：表に ずれた 石 */
  roundStones(R: number, y0: number, y1: number, c: string, n = 16) {
    const lt = mix(c, '#ffffff', 0.2)
    const dk = mix(c, '#20222a', 0.26)
    for (let i = 0; i < n; i++) {
      const a = this.r() * Math.PI * 2
      const o = this.box(0.16 + this.r() * 0.1, 0.09, 0.03, i % 2 ? lt : dk, Math.cos(a) * R, y0 + this.r() * (y1 - y0), Math.sin(a) * R)
      o.rotation.y = -a + Math.PI / 2
    }
  }
  /** しっくい + 木の 骨組み（柱・はり・すじかい） */
  timber(w: number, h: number, d: number, plaster: string, x: number, y: number, z: number) {
    this.box(w, h, d, plaster, x, y, z)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(0.09, h + 0.02, 0.09, DARK, x + sx * w / 2, y, z + sz * d / 2)
    for (const yy of [y - h / 2 + 0.04, y + h / 2 - 0.04]) {
      for (const sz of [-1, 1]) this.box(w + 0.04, 0.07, 0.04, DARK, x, yy, z + sz * (d / 2 + 0.01))
      for (const sx of [-1, 1]) this.box(0.04, 0.07, d + 0.04, DARK, x + sx * (w / 2 + 0.01), yy, z)
    }
    this.box(0.06, h, 0.04, DARK, x - w * 0.18, y, z + d / 2 + 0.01)
    this.box(0.06, h, 0.04, DARK, x + w * 0.2, y, z + d / 2 + 0.01)
    for (const sx of [-1, 1]) {
      const b = this.box(0.05, Math.hypot(w * 0.3, h * 0.8), 0.035, DARK, x + sx * w * 0.34, y, z + d / 2 + 0.012)
      b.rotation.z = sx * Math.atan2(w * 0.3, h * 0.8)
      this.box(0.04, h, 0.06, DARK, x + sx * (w / 2 + 0.01), y, z)
    }
  }
  /** きりづま屋根：ななめの 板 2 まい + かわらの 列 + むな木 + 三角の かべ。くずれると 片がわが ぬけて たる木が 見える */
  gable(w: number, d: number, h: number, c: string, y: number, wall: string, x = 0, z = 0, over = 0.14) {
    const half = w / 2 + over
    const slope = Math.hypot(half, h)
    const ang = Math.atan2(h, half)
    const len = d + over * 2
    const alt = mix(c, '#20181c', 0.3)
    const lite = mix(c, '#ffffff', 0.14)
    for (const sg of [-1, 1]) {
      const gone = this.ruin && sg === 1
      const at = (t: number, off: number) => [x + sg * half * (1 - t) + sg * Math.sin(ang) * off, y + h * t + Math.cos(ang) * off] as const
      if (gone) {
        // たる木だけ のこる + のきに かわらが 少し
        for (let i = 0; i < 5; i++) {
          const [px, py] = at(0.5, 0)
          const o = this.box(slope, 0.045, 0.05, DARK, px, py, z - len / 2 + 0.1 + (i / 4) * (len - 0.2))
          o.rotation.z = -sg * ang
        }
        const [ex, ey] = at(0.14, 0.04)
        const o = this.box(slope * 0.28, 0.05, len * 0.6, c, ex, ey, z - len * 0.15)
        o.rotation.z = -sg * ang
        continue
      }
      const [px, py] = at(0.5, 0)
      const slab = this.box(slope, 0.06, len, c, px, py, z)
      slab.rotation.z = -sg * ang
      const rows = Math.max(3, Math.round(slope / 0.22))
      for (let rw = 0; rw < rows; rw++) {
        if (this.old && this.r() < 0.22) continue
        const [sx, sy] = at((rw + 0.5) / rows, 0.04)
        const o = this.box((slope / rows) * 0.62, 0.035, len + 0.04, rw % 2 ? alt : lite, sx, sy, z)
        o.rotation.z = -sg * ang
      }
    }
    this.box(0.08, 0.08, len + 0.06, DARK, x, y + h + 0.02, z)
    const tri = new THREE.Shape()
    tri.moveTo(-w / 2, 0)
    tri.lineTo(w / 2, 0)
    tri.lineTo(0, h * (w / 2 / half))
    for (const sz of [-1, 1]) this.add(new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.04, bevelEnabled: false }), this.m(wall)), x, y, z + sz * d / 2 - 0.02)
  }
  /** とんがり屋根（かさねた 輪）。くずれると 上が ぬけて ほねが のこる */
  spire(R: number, h: number, sides: number, c: string, y: number, tiers = 4, rot = 0, x = 0, z = 0) {
    const a = this.m(c)
    const b = this.m(mix(c, '#20181c', 0.3))
    const keep = this.ruin ? Math.ceil(tiers / 2) : tiers
    for (let i = 0; i < keep; i++) {
      const rb = R * (1 - i / (tiers + 0.15)) + (i ? 0.07 : 0)
      const rt = i === tiers - 1 ? 0.02 : R * (1 - (i + 1) / (tiers + 0.15))
      const t = this.cyl(rt, rb, h / tiers + 0.02, sides, i % 2 ? b : a, x, y + (i + 0.5) * (h / tiers), z)
      t.rotation.y = rot
    }
    if (this.ruin) {
      // のこった ほね
      for (let i = 0; i < 4; i++) {
        const an = rot + (i / 4) * Math.PI * 2 + 0.4
        const rr = R * (1 - keep / (tiers + 0.15)) * 0.8
        const o = this.box(0.04, h * 0.5, 0.04, DARK, x + Math.cos(an) * rr * 0.5, y + (keep / tiers) * h + h * 0.2, z + Math.sin(an) * rr * 0.5)
        o.rotation.set(Math.sin(an) * 0.5, 0, -Math.cos(an) * 0.5)
      }
    } else if (this.old) {
      this.box(R * 0.5, 0.05, R * 0.4, '#5f8a3c', x + R * 0.3, y + h * 0.22, z + R * 0.35)
    }
  }
  /** のこぎり形の 胸かべ。古いと 歯が ぬける */
  crenel(R: number, y: number, c: string, n = 8, x = 0, z = 0) {
    for (let i = 0; i < n; i++) {
      if (this.old && this.r() < (this.ruin ? 0.55 : 0.2)) continue
      const a = (i / n) * Math.PI * 2
      const o = this.box(R * 0.42, 0.22, 0.14, c, x + Math.cos(a) * R, y, z + Math.sin(a) * R)
      o.rotation.y = -a + Math.PI / 2
    }
  }
  /** くずれた てっぺん：ふぞろいな 壁の のこり */
  brokenRim(R: number, y: number, c: string, n = 9, x = 0, z = 0) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const hh = 0.15 + this.r() * 0.9 * (0.5 + 0.5 * Math.sin(a + 1))
      if (hh < 0.25) continue
      const o = this.box(R * 0.7, hh, 0.16, c, x + Math.cos(a) * R, y + hh / 2, z + Math.sin(a) * R)
      o.rotation.y = -a + Math.PI / 2
    }
  }
  /** 窓：わく・ガラス・さん。opts：shut = よろい戸 / sill = 花ばこ / arch = まるい 上 */
  win(w: number, h: number, x: number, y: number, z: number, o: { lit?: string; shut?: boolean; sill?: boolean; arch?: boolean; frame?: string } = {}) {
    const fr = o.frame ?? DARK
    this.box(w + 0.09, h + 0.09, 0.04, fr, x, y, z)
    if (o.arch) this.cyl((w + 0.09) / 2, (w + 0.09) / 2, 0.04, 8, fr, x, y + h / 2, z).rotation.x = Math.PI / 2
    const broken = this.ruin || (this.old && this.r() < 0.5)
    const pane = this.box(w, h, 0.05, this.glow(broken ? '#2c3238' : (o.lit ?? '#ffd27a')), x, y, z + 0.008)
    pane.name = 'lit'
    this.box(0.025, h, 0.02, fr, x, y, z + 0.04)
    this.box(w, 0.025, 0.02, fr, x, y + h * 0.1, z + 0.04)
    if (o.shut) {
      for (const sx of [-1, 1]) {
        if (this.ruin && sx === 1) continue
        const s = this.box(w * 0.5, h + 0.04, 0.03, '#5a7a5a', x + sx * (w * 0.78 + 0.03), y, z + 0.02)
        if (this.old) s.rotation.z = sx * 0.12
      }
    }
    if (o.sill && !this.ruin) {
      this.box(w + 0.14, 0.07, 0.1, WOOD, x, y - h / 2 - 0.08, z + 0.06)
      for (let i = 0; i < 3; i++) this.box(0.06, 0.06, 0.06, this.glow(this.old ? '#7a9a5a' : ['#ff8fb1', '#ffe08a', '#ff8fb1'][i]), x - w * 0.36 + i * w * 0.36, y - h / 2 - 0.02, z + 0.07)
    }
  }
  door(w: number, h: number, x: number, z: number, c = '#5a3a22', arch = false, y0 = 0) {
    this.box(w + 0.1, h + 0.06, 0.05, DARK, x, y0 + h / 2, z)
    if (arch) this.cyl((w + 0.1) / 2, (w + 0.1) / 2, 0.05, 8, DARK, x, y0 + h, z).rotation.x = Math.PI / 2
    if (this.ruin) return void this.box(w, h, 0.03, this.glow('#15171c'), x, y0 + h / 2, z + 0.02)
    const d = this.box(w, h, 0.05, c, x, y0 + h / 2, z + 0.015)
    if (this.old) d.rotation.y = 0.35
    for (const yy of [0.25, 0.75]) this.box(w, 0.03, 0.02, IRON, x, y0 + h * yy, z + 0.045)
    this.box(0.04, 0.04, 0.03, this.glow('#ffd23f'), x + w * 0.3, y0 + h * 0.5, z + 0.05)
    this.box(w + 0.3, 0.08, 0.22, STONE, x, y0 + 0.04, z + 0.12)
  }
  chimney(x: number, y: number, z: number, h: number, c = STONE) {
    if (this.ruin) return void this.box(0.22, h * 0.4, 0.22, c, x, y - h * 0.3, z)
    this.box(0.2, h, 0.2, c, x, y, z)
    this.box(0.26, 0.06, 0.26, mix(c, '#20222a', 0.3), x, y + h / 2, z)
    this.cyl(0.05, 0.06, 0.14, 6, '#8a4a3a', x, y + h / 2 + 0.1, z).name = this.W ? '' : 'chimney'
  }
  lantern(x: number, y: number, z: number) {
    this.box(0.03, 0.03, 0.16, IRON, x, y + 0.12, z - 0.06)
    this.box(0.1, 0.13, 0.1, this.glow(this.old ? '#4a4640' : '#ffcf7a'), x, y, z).name = 'lit'
    this.box(0.13, 0.03, 0.13, IRON, x, y + 0.08, z)
  }
  flag(x: number, y: number, z: number, c: string, len = 0.5) {
    this.cyl(0.015, 0.015, len, 4, DARK, x, y + len / 2, z)
    if (this.ruin) return
    const f = this.box(0.3, 0.17, 0.02, this.glow(this.old ? mix(c, '#6a6a60', 0.5) : c), x + 0.16, y + len - 0.1, z)
    f.name = 'flag'
    if (this.old) this.box(0.1, 0.1, 0.025, this.glow('#15171c'), x + 0.24, y + len - 0.14, z)
  }
  barrel(x: number, z: number, s = 1) {
    this.cyl(0.11 * s, 0.11 * s, 0.26 * s, 8, WOOD, x, 0.13 * s, z)
    for (const yy of [0.06, 0.2]) this.cyl(0.116 * s, 0.116 * s, 0.03, 8, IRON, x, yy * s, z)
  }
  crate(x: number, z: number, s = 0.22) {
    const o = this.box(s, s, s, '#8a6038', x, s / 2, z)
    this.box(s + 0.02, 0.03, s + 0.02, DARK, x, s / 2, z)
    return o
  }
  /** がれき（くずれた 時だけ） */
  rubble(x: number, z: number, n: number, c: string, spread = 0.6) {
    if (!this.ruin) return
    for (let i = 0; i < n; i++) this.rock(0.08 + this.r() * 0.14, i % 2 ? c : mix(c, '#20222a', 0.2), x + (this.r() - 0.5) * spread, 0.06, z + (this.r() - 0.5) * spread)
  }
  /** くずれた すきまから 生える 木 */
  sprout(x: number, y: number, z: number, s = 1) {
    if (!this.ruin) return
    this.cyl(0.03 * s, 0.05 * s, 0.5 * s, 5, '#5a4030', x, y + 0.25 * s, z).rotation.z = 0.2
    for (const [dx, dy, dz, rr] of [[0.05, 0.6, 0, 0.26], [-0.14, 0.5, 0.1, 0.18], [0.2, 0.48, -0.08, 0.17]]) this.ball(rr * s, this.m(dy > 0.55 ? '#6fa848' : '#4c8436', true), x + dx * s, y + dy * s, z + dz * s, 1)
  }
  /** こけ・つた・ひび（かべの 表に）。古いほど 多い */
  overgrow(w: number, h: number, d: number, y0 = 0) {
    if (!this.W) return
    const moss = this.m('#5f8a3c', true)
    const moss2 = this.m('#3f6e34', true)
    const n = this.ruin ? 12 : 6
    for (let i = 0; i < n; i++) {
      const s = 0.12 + this.r() * 0.2
      this.box(s, 0.05 + this.r() * 0.05, 0.03, i % 2 ? moss : moss2, (this.r() - 0.5) * w, y0 + this.r() * h, d / 2 + 0.02)
      if (i % 2) {
        const len = 0.25 + this.r() * h * (this.ruin ? 0.8 : 0.45)
        const vx = (this.r() - 0.5) * w * 0.95
        const side = i % 4 === 1
        this.box(side ? 0.04 : 0.05, len, side ? 0.05 : 0.04, moss2, side ? w / 2 + 0.03 : vx, y0 + h - len / 2, side ? vx * (d / w) : d / 2 + 0.03)
        if (!side) for (let k = 0; k < 3; k++) this.box(0.1, 0.07, 0.05, moss, vx + (k % 2 ? 0.06 : -0.05), y0 + h - (k / 3) * len - 0.05, d / 2 + 0.045)
      }
    }
    for (let i = 0; i < (this.ruin ? 5 : 2); i++) {
      const o = this.box(0.03, 0.25 + this.r() * 0.35, 0.02, this.m('#24201c', true), (this.r() - 0.5) * w * 0.8, y0 + h * (0.25 + this.r() * 0.5), d / 2 + 0.016)
      o.rotation.z = (this.r() - 0.5) * 1.3
    }
    // 足もとの 草と こけ
    for (let i = 0; i < 4; i++) this.box(0.2 + this.r() * 0.3, 0.04, 0.2, i % 2 ? moss : moss2, (this.r() - 0.5) * (w + 0.4), 0.02, d / 2 + 0.1 + this.r() * 0.25)
    if (this.ruin) {
      // かべの あな
      for (let i = 0; i < 2; i++) this.box(0.2 + this.r() * 0.2, 0.2 + this.r() * 0.25, 0.03, this.glow('#15171c'), (this.r() - 0.5) * w * 0.6, y0 + h * (0.3 + this.r() * 0.4), d / 2 + 0.012)
    }
  }
  /** 銅の パイプ：点を つないで、つぎ目に 輪 */
  pipe(pts: [number, number, number][], rad = 0.05, c = COPPER) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = new THREE.Vector3(...pts[i])
      const b = new THREE.Vector3(...pts[i + 1])
      const len = a.distanceTo(b)
      const o = this.cyl(rad, rad, len, 6, c, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
      o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
      this.ball(rad * 1.5, mix(c, '#ffffff', 0.15), a.x, a.y, a.z)
    }
    const e = pts[pts.length - 1]
    this.ball(rad * 1.5, mix(c, '#ffffff', 0.15), e[0], e[1], e[2])
  }
  /** はぐるま（かべで まわる。古いと 止まって かたむく） */
  gear(rad: number, x: number, y: number, z: number, c = BRASS, teeth = 8) {
    const g = new THREE.Group()
    if (!this.W) g.name = 'blades'
    const gm = this.m(c)
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, 0.06, 12), gm)
    hub.rotation.x = Math.PI / 2
    g.add(hub)
    for (let i = 0; i < teeth; i++) {
      if (this.ruin && i % 3 === 0) continue
      const t = new THREE.Mesh(new THREE.BoxGeometry(rad * 0.34, rad * 0.4, 0.06), gm)
      t.position.set(Math.cos((i / teeth) * 6.283) * rad * 1.12, Math.sin((i / teeth) * 6.283) * rad * 1.12, 0)
      t.rotation.z = (i / teeth) * 6.283 + Math.PI / 2
      g.add(t)
    }
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.3, rad * 0.3, 0.07, 8), this.m(IRON))
    hole.rotation.x = Math.PI / 2
    g.add(hole)
    if (this.ruin) g.rotation.set(0.3, 0, 0.5)
    return this.add(g, x, y, z)
  }
  /** 光る 画面（わく つき）。古いと ちらつき（消える）・くずれると われる */
  screen(w: number, h: number, x: number, y: number, z: number, c = '#5ef2ff') {
    this.box(w + 0.08, h + 0.08, 0.05, IRON, x, y, z)
    const s = this.box(w, h, 0.03, this.glow(this.ruin ? '#15171c' : this.old ? mix(c, '#203038', 0.6) : c), x, y, z + 0.02)
    s.name = 'lit'
    if (!this.ruin) for (let i = 0; i < 3; i++) this.box(w * (0.3 + this.r() * 0.5), 0.02, 0.01, this.glow(this.old ? '#203038' : '#ffffff'), x - w * 0.1, y - h * 0.3 + i * h * 0.3, z + 0.04)
    else this.box(0.03, h, 0.02, this.m('#5a6068', true), x, y, z + 0.04).rotation.z = 0.6
  }
  /**
   * やぶれ目（まざりの町）：かべが かけた所が まっ黒で、中に 緑の 文字の 列が 流れて見える。
   * 古いほど 大きく・多い。ふちに ばらけた 四角い かけら。side = 横の かべ（x 向き）
   */
  tear(w: number, h: number, x: number, y: number, z: number, side = false) {
    const put = (bw: number, bh: number, c: string | THREE.Material, dx: number, dy: number, dz: number, name = '') => {
      const o = side ? this.box(0.02, bh, bw, c, x + dz, y + dy, z + dx) : this.box(bw, bh, 0.02, c, x + dx, y + dy, z + dz)
      if (name) o.name = name
      return o
    }
    put(w, h, this.glow('#040807'), 0, 0, 0)
    // ふちを ぎざぎざに：かべ色の 四角で 欠けを かくす / 黒い 四角が はみ出す
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + this.r()
      const s = 0.06 + this.r() * 0.08
      put(s, s, this.glow('#040807'), Math.cos(a) * w * 0.52, Math.sin(a) * h * 0.52, 0.002)
    }
    // 文字の 列：上が 暗く、先頭（下）が 明るい
    const cols = Math.max(3, Math.round(w / 0.07))
    for (let c = 0; c < cols; c++) {
      const cx = -w / 2 + (c + 0.5) * (w / cols)
      const len = h * (0.3 + this.r() * 0.6)
      const top = h / 2 - this.r() * (h - len)
      const n = Math.max(2, Math.round(len / 0.05))
      for (let i = 0; i < n; i++) {
        if (this.r() < 0.25) continue
        const head = i === n - 1
        put(0.035, 0.03, this.glow(head ? '#d8ffe4' : i > n * 0.5 ? '#3dff7a' : '#1a8a40'), cx, top - (i + 0.5) * (len / n), 0.012, 'lit')
      }
    }
    // ういた かけら（かべから はがれた 四角）
    for (let i = 0; i < 4; i++) put(0.05, 0.05, this.glow(i % 2 ? '#3dff7a' : '#040807'), (this.r() - 0.5) * w * 1.5, (this.r() - 0.5) * h * 1.5, 0.05 + this.r() * 0.12, i % 2 ? 'lit' : '')
  }
  /** たれさがる ケーブル */
  cable(x0: number, y0: number, x1: number, y1: number, z: number, sag = 0.2) {
    const n = 6
    for (let i = 0; i < n; i++) {
      const t0 = i / n
      const t1 = (i + 1) / n
      const p = (t: number) => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * sag] as const
      const [ax, ay] = p(t0)
      const [bx, by] = p(t1)
      const o = this.box(Math.hypot(bx - ax, by - ay) + 0.01, 0.025, 0.025, '#22262e', (ax + bx) / 2, (ay + by) / 2, z)
      o.rotation.z = Math.atan2(by - ay, bx - ax)
    }
  }
  antenna(x: number, y: number, z: number, h = 0.7) {
    const o = this.cyl(0.015, 0.015, h, 4, '#c8d2e0', x, y + h / 2, z)
    if (this.ruin) o.rotation.z = 0.6
    for (const t of [0.5, 0.75]) this.box(0.24 * (1.2 - t), 0.02, 0.02, '#c8d2e0', x, y + h * t, z)
    this.box(0.07, 0.07, 0.07, this.glow(this.W ? '#5a2a2a' : '#ff4d6d'), x, y + h + 0.03, z).name = 'lit'
  }
  /** さび（機械の 古び） */
  rust(w: number, h: number, d: number, y0 = 0) {
    if (!this.W) return
    for (let i = 0; i < (this.ruin ? 10 : 5); i++) this.box(0.14 + this.r() * 0.22, 0.1 + this.r() * 0.14, 0.02, this.m(i % 2 ? '#8a4a2a' : '#6a3a24', true), (this.r() - 0.5) * w * 0.9, y0 + this.r() * h, d / 2 + 0.014)
  }
  /** 同じ色の 形を 1 つに まとめる（名前つき・グループは 残す） */
  done() {
    const by = new Map<THREE.Material, THREE.BufferGeometry[]>()
    const keep: THREE.Object3D[] = []
    for (const o of [...this.g.children]) {
      const m = o as THREE.Mesh
      if (!m.isMesh || o.name || Array.isArray(m.material)) {
        keep.push(o)
        continue
      }
      o.updateMatrix()
      const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(o.matrix)
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k)
      m.geometry.dispose()
      const list = by.get(m.material as THREE.Material)
      if (list) list.push(geo)
      else by.set(m.material as THREE.Material, [geo])
    }
    const out = new THREE.Group()
    for (const [mat, list] of by) {
      const merged = mergeGeometries(list)
      for (const gg of list) gg.dispose()
      if (merged) out.add(new THREE.Mesh(merged, mat))
    }
    for (const o of keep) out.add(o)
    return out
  }
}

/** 家（住む所）。1.5〜1.8 マスほど。正面は +z */
export function eraHouse(era: Era, ctx: EraCtx, wear: Wear = 0, seed = 1): THREE.Group {
  const k = new Kit(ctx, wear, seed)
  switch (era) {
    case 1: {
      // テント（布を 4 まい・支えの 木）と たき火・ほし肉の さお・にもつ
      if (!k.ruin) {
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4
          if (i === 0) continue // 入口は あける
          const p = k.box(0.86, 1.05, 0.03, i % 2 ? '#d8c49a' : '#c8b288', Math.cos(a) * 0.3, 0.46, Math.sin(a) * 0.3)
          p.rotation.set(0, -a + Math.PI / 2, 0)
          p.rotateX(-0.56)
        }
        k.box(0.5, 0.04, 0.5, '#b89a6a', 0, 0.03, 0)
      } else {
        // つぶれた テント
        k.box(1.0, 0.03, 0.8, '#b8a680', 0.05, 0.06, 0).rotation.set(0.1, 0.4, 0.08)
        k.box(0.5, 0.03, 0.5, '#a89670', -0.2, 0.14, 0.1).rotation.set(0.5, 0.2, 0.3)
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        const pole = k.cyl(0.02, 0.025, 1.3, 4, WOOD, Math.cos(a) * 0.36, 0.58, Math.sin(a) * 0.36)
        pole.rotation.set(Math.sin(a) * (k.ruin ? 1.2 : 0.56), 0, -Math.cos(a) * (k.ruin ? 1.2 : 0.56))
      }
      for (const a of [0.2, 1.8, 3.3, 4.9]) k.cyl(0.02, 0.03, 0.2, 4, WOOD, Math.cos(a) * 0.95, 0.1, Math.sin(a) * 0.95)
      // たき火：石の輪・まき・火
      for (let i = 0; i < 7; i++) k.rock(0.07, STONE, 0.95 + Math.cos(i * 0.9) * 0.2, 0.04, 0.6 + Math.sin(i * 0.9) * 0.2)
      for (let i = 0; i < 3; i++) k.cyl(0.035, 0.035, 0.3, 5, '#5a3d28', 0.95, 0.07, 0.6).rotation.set(Math.PI / 2, 0, i * 1.05)
      if (!k.old) k.cyl(0.02, 0.09, 0.22, 5, k.glow('#ffb347'), 0.95, 0.2, 0.6).name = 'lit'
      // ほし肉の さお
      for (const sx of [-1, 1]) k.cyl(0.02, 0.02, 0.6, 4, WOOD, -0.9 + sx * 0.3, 0.3, 0.7).rotation.z = sx * 0.12
      k.cyl(0.015, 0.015, 0.7, 4, WOOD, -0.9, 0.58, 0.7).rotation.z = Math.PI / 2
      if (!k.ruin) for (let i = 0; i < 3; i++) k.box(0.06, 0.14, 0.03, '#b05a3a', -1.1 + i * 0.2, 0.48, 0.7)
      k.crate(-0.6, -0.5)
      k.barrel(0.7, -0.5, 0.8)
      k.overgrow(1.2, 0.6, 1.2)
      k.sprout(-0.1, 0, -0.1, 0.9)
      break
    }
    case 2: {
      // 丸太小屋：横に つんだ 丸太・かどの 組み手・石の えんとつ・わらの きりづま・ポーチ・まきの山
      const rows = k.ruin ? 3 : 5
      for (let i = 0; i < rows; i++) {
        for (const z of [-0.5, 0.5]) k.cyl(0.085, 0.085, 1.6, 6, i % 2 ? '#8a6038' : '#7a5230', 0, 0.1 + i * 0.16, z).rotation.z = Math.PI / 2
        for (const x of [-0.66, 0.66]) k.cyl(0.085, 0.085, 1.25, 6, i % 2 ? '#7a5230' : '#8a6038', x, 0.18 + i * 0.16, 0).rotation.x = Math.PI / 2
      }
      for (const z of [-0.5, 0.5]) for (const x of [-0.8, 0.8]) for (let i = 0; i < rows; i++) k.cyl(0.07, 0.07, 0.03, 6, '#d8b888', x, 0.1 + i * 0.16, z).rotation.z = Math.PI / 2
      k.door(0.3, 0.52, -0.2, 0.57, '#5a3a22')
      k.win(0.2, 0.18, 0.38, 0.5, 0.59, { shut: true })
      if (!k.ruin) {
        k.gable(1.5, 1.2, 0.62, '#c9a850', 0.88, '#8a6038')
        // ポーチの ひさし と 柱
        k.box(0.7, 0.04, 0.4, '#b8964a', -0.2, 0.82, 0.8).rotation.x = 0.3
        for (const x of [-0.5, 0.1]) k.cyl(0.03, 0.03, 0.78, 5, WOOD, x, 0.39, 0.95)
      } else {
        for (let i = 0; i < 3; i++) k.cyl(0.07, 0.07, 1.2, 6, '#7a5230', 0.3 + i * 0.2, 0.5 + i * 0.1, 0).rotation.set(0.4, 0.3 * i, 1.1)
        k.box(0.8, 0.05, 0.9, '#a88a40', -0.3, 0.52, 0).rotation.z = 0.5
      }
      k.chimney(0.6, 1.0, -0.3, 1.1)
      for (let i = 0; i < 5; i++) k.cyl(0.05, 0.05, 0.3, 5, '#8a6038', 0.9, 0.06 + Math.floor(i / 3) * 0.1, 0.2 + (i % 3) * 0.11).rotation.x = Math.PI / 2
      k.cyl(0.14, 0.16, 0.12, 8, '#7a5230', -0.95, 0.06, 0.5)
      k.box(0.03, 0.26, 0.05, IRON, -0.95, 0.24, 0.5).rotation.z = 0.5
      k.overgrow(1.4, 0.85, 1.1)
      k.rubble(0.4, 0.7, 4, '#7a5230')
      k.sprout(0.1, 0.4, 0, 1.1)
      break
    }
    case 3: {
      // 木組みの家：石の土台・しっくいと 骨組み・はり出した 2 階・かわらの きりづま・出窓・看板
      k.masonry(1.5, 0.3, 1.3, '#9aa1ab', 0, 0.15, 0, 8)
      k.timber(1.3, 0.72, 1.1, '#eadcba', 0, 0.66, 0)
      k.door(0.3, 0.5, -0.3, 0.57, '#5a3a22', false, 0.3)
      k.win(0.24, 0.22, 0.3, 0.7, 0.57, { shut: true, sill: true })
      if (!k.ruin) {
        k.timber(1.5, 0.6, 1.26, '#f0e4c6', 0, 1.34, 0)
        for (const x of [-0.6, 0, 0.6]) k.box(0.07, 0.1, 0.14, DARK, x, 1.0, 0.6)
        k.win(0.2, 0.22, -0.38, 1.36, 0.65, { sill: true })
        k.win(0.2, 0.22, 0.38, 1.36, 0.65, { shut: true })
        k.gable(1.5, 1.26, 0.8, '#b85a4a', 1.64, '#f0e4c6')
        // 屋根の 出窓
        k.box(0.3, 0.26, 0.3, '#f0e4c6', 0.45, 2.0, 0.5)
        k.box(0.36, 0.05, 0.36, '#9a4a3c', 0.45, 2.16, 0.5)
        k.box(0.16, 0.14, 0.02, k.glow(k.old ? '#2c3238' : '#ffd27a'), 0.45, 2.0, 0.66).name = 'lit'
      } else {
        // 2 階は 柱だけ のこる・屋根は 半分 ぬけた
        for (const [x, z, hh] of [[-0.72, 0.6, 0.6], [0.72, 0.6, 0.3], [-0.72, -0.6, 0.7], [0.72, -0.6, 0.5]]) k.box(0.09, hh, 0.09, DARK, x, 1.04 + hh / 2, z)
        k.box(1.5, 0.07, 0.05, DARK, 0, 1.68, -0.6).rotation.z = 0.1
        k.box(0.7, 0.5, 0.05, '#e0d2b0', -0.36, 1.3, -0.62)
        k.gable(1.5, 0.5, 0.6, '#b85a4a', 1.66, '#e0d2b0', 0, -0.4)
      }
      k.chimney(-0.45, k.ruin ? 1.3 : 2.1, -0.3, 0.7)
      k.lantern(-0.05, 0.86, 0.66)
      // 看板
      k.box(0.03, 0.03, 0.3, IRON, 0.66, 1.0, 0.72)
      if (!k.ruin) k.box(0.03, 0.2, 0.22, '#c9a850', 0.66, 0.86, 0.78)
      k.barrel(0.78, 0.72)
      k.crate(-0.85, 0.6, 0.2)
      k.overgrow(1.3, 1.5, 1.14, 0.3)
      k.rubble(0.5, 0.8, 6, '#b85a4a', 0.9)
      k.sprout(0.3, 1.0, 0.1, 1.2)
      break
    }
    case 4: {
      // 石の 町家：切り石の 2 階だて・アーチの戸・スレートの きりづま・ひかえ壁・外階段・ひさしの 店先
      k.masonry(1.6, 1.0, 1.3, STONE, 0, 0.5, 0, 22)
      for (const x of [-0.82, 0.82]) {
        const b = k.box(0.14, 0.9, 0.3, '#8e949e', x, 0.42, 0.4)
        b.rotation.z = x > 0 ? 0.12 : -0.12
      }
      k.door(0.36, 0.56, -0.35, 0.66, '#4a3222', true)
      k.win(0.22, 0.26, 0.35, 0.6, 0.66, { arch: true, sill: true })
      // 店先の ひさし（しまの 布）
      if (!k.ruin) for (let i = 0; i < 4; i++) k.box(0.16, 0.03, 0.34, i % 2 ? '#c8483e' : '#f0e8d8', 0.11 + i * 0.16, 0.9, 0.84).rotation.x = 0.4
      if (!k.ruin) {
        k.masonry(1.6, 0.7, 1.3, '#b0b5bc', 0, 1.35, 0, 14)
        k.box(1.68, 0.07, 1.38, '#7e848e', 0, 1.0, 0)
        for (const x of [-0.45, 0.45]) k.win(0.2, 0.28, x, 1.38, 0.66, { arch: true, shut: true })
        k.gable(1.6, 1.3, 0.85, '#5a6478', 1.7, '#b0b5bc')
        k.chimney(0.5, 2.3, -0.3, 0.8, '#8e949e')
      } else {
        // 2 階は ぎざぎざに くずれ、ゆかの はりが 見える
        for (const [x, w, hh] of [[-0.62, 0.36, 0.7], [-0.25, 0.3, 0.35], [0.5, 0.5, 0.5]]) k.box(w, hh, 0.16, '#b0b5bc', x, 1.0 + hh / 2, -0.57)
        k.box(0.16, 0.6, 0.5, '#b0b5bc', -0.72, 1.3, -0.3)
        for (let i = 0; i < 4; i++) k.box(0.06, 0.06, 1.3, DARK, -0.6 + i * 0.4, 1.02, 0)
        k.chimney(0.5, 1.3, -0.3, 0.8, '#8e949e')
      }
      // 外階段
      for (let i = 0; i < 4; i++) k.box(0.3, 0.1, 0.16, '#8e949e', 0.98, 0.05 + i * 0.1, 0.5 - i * 0.16)
      k.lantern(-0.02, 0.9, 0.74)
      k.barrel(-0.95, 0.5)
      k.barrel(-0.98, 0.26, 0.85)
      k.overgrow(1.6, 1.6, 1.34)
      k.rubble(0.3, 0.9, 9, STONE, 1.3)
      k.sprout(0.2, 1.0, 0, 1.3)
      break
    }
    case 5: {
      // 城の やかた：石の 1 階 + 木組みの はり出し 2 階 + 高い 急な屋根・かどの 小塔・紋章の 旗・馬つなぎ
      k.masonry(1.7, 0.95, 1.4, '#9aa0aa', 0, 0.48, 0, 20)
      k.door(0.42, 0.64, 0, 0.71, '#3d2a1e', true)
      for (const x of [-0.55, 0.55]) k.win(0.14, 0.3, x, 0.56, 0.71, { arch: true })
      if (!k.ruin) {
        k.timber(1.9, 0.75, 1.6, '#d8cfb8', 0, 1.36, 0)
        for (const x of [-0.8, -0.27, 0.27, 0.8]) k.box(0.08, 0.14, 0.18, DARK, x, 0.94, 0.76)
        for (const x of [-0.5, 0.5]) k.win(0.22, 0.3, x, 1.38, 0.82, { shut: true, sill: true })
        k.gable(1.9, 1.6, 1.25, '#7a3a34', 1.74, '#d8cfb8')
        k.box(0.3, 0.3, 0.3, '#d8cfb8', -0.5, 2.3, 0.6)
        k.box(0.36, 0.05, 0.4, '#6a302c', -0.5, 2.48, 0.6)
        k.flag(0, 3.0, 0, '#ffd23f', 0.55)
      } else {
        k.timber(0.9, 0.75, 1.6, '#d8cfb8', -0.5, 1.36, 0)
        for (let i = 0; i < 4; i++) k.box(0.06, 0.06, 1.5, DARK, -0.1 + i * 0.34, 0.98, 0)
        k.gable(0.9, 1.6, 0.7, '#7a3a34', 1.74, '#d8cfb8', -0.5, 0)
        k.box(0.08, 1.0, 0.08, DARK, 0.9, 1.4, 0.75).rotation.z = -0.3
      }
      // かどの 小塔
      k.cyl(0.26, 0.3, 2.3, 8, '#8e949e', 0.92, 1.15, -0.62)
      if (!k.ruin) k.spire(0.34, 0.7, 8, '#7a3a34', 2.3, 3, 0, 0.92, -0.62)
      else k.brokenRim(0.24, 2.2, '#8e949e', 6, 0.92, -0.62)
      k.chimney(-0.6, k.ruin ? 1.6 : 2.6, -0.3, 0.9)
      k.lantern(-0.34, 1.0, 0.8)
      k.lantern(0.34, 1.0, 0.8)
      k.box(0.7, 0.04, 0.04, WOOD, -1.0, 0.4, 0.5)
      for (const dx of [-0.3, 0.3]) k.cyl(0.025, 0.03, 0.4, 5, WOOD, -1.0 + dx, 0.2, 0.5)
      k.overgrow(1.7, 2.0, 1.44)
      k.rubble(0.7, 0.9, 10, '#9aa0aa', 1.4)
      k.sprout(0.5, 1.0, 0.2, 1.4)
      break
    }
    case 6: {
      // 白い やかた：白い石・金の ふち・青い 屋根・円柱の 玄関・バルコニー・色ガラス・ふたつの 小さな 尖塔
      k.box(1.9, 0.24, 1.6, '#d8dce6', 0, 0.12, 0)
      for (let i = 0; i < 3; i++) k.box(0.8 - i * 0.12, 0.08, 0.2, '#e8eaf0', 0, 0.04 + i * 0.08, 0.86 - i * 0.07)
      k.box(1.6, 1.3, 1.3, '#f6f4ee', 0, 0.89, 0)
      k.box(1.66, 0.07, 1.36, BRASS, 0, 0.3, 0)
      k.box(1.66, 0.07, 1.36, BRASS, 0, 1.56, 0)
      for (const x of [-0.42, 0.42]) {
        const col = k.cyl(0.07, 0.08, 1.0, 8, '#ecebe6', x, 0.76, 0.8)
        if (k.ruin && x > 0) {
          col.scale.y = 0.4
          col.position.y = 0.44
          k.cyl(0.07, 0.07, 0.5, 8, '#ecebe6', 0.7, 0.08, 1.05).rotation.z = Math.PI / 2
        }
        k.box(0.2, 0.06, 0.2, '#ecebe6', x, 0.28, 0.8)
      }
      if (!k.ruin) {
        // バルコニー
        k.box(1.1, 0.07, 0.36, '#e4e2dc', 0, 1.28, 0.82)
        for (let i = 0; i < 6; i++) k.cyl(0.02, 0.025, 0.2, 5, '#f6f4ee', -0.5 + i * 0.2, 1.42, 0.98)
        k.box(1.1, 0.03, 0.04, BRASS, 0, 1.53, 0.98)
      }
      k.door(0.36, 0.66, 0, 0.66, '#3a4a78', true, 0.24)
      for (const [x, c] of [[-0.55, '#7fd8ff'], [0.55, '#ff9ecb']] as const) k.win(0.18, 0.4, x, 0.9, 0.66, { arch: true, lit: c, frame: BRASS })
      if (!k.ruin) {
        k.box(1.3, 0.5, 1.0, '#f6f4ee', 0, 1.84, 0)
        k.win(0.3, 0.3, 0, 1.86, 0.51, { arch: true, lit: '#ffe27a', frame: BRASS })
        k.spire(0.95, 1.2, 8, '#3f6fc8', 2.08, 5)
        k.cyl(0.02, 0.07, 0.3, 5, k.glow('#ffe27a'), 0, 3.42, 0)
      } else {
        k.brokenRim(0.6, 1.6, '#f6f4ee', 8)
        k.spire(0.6, 0.6, 8, '#3f6fc8', 0.02, 2, 0, 1.2, 0.7)
      }
      for (const x of [-0.86, 0.86]) {
        k.cyl(0.16, 0.18, 2.0, 8, '#f0eee8', x, 1.0, -0.5)
        k.cyl(0.2, 0.2, 0.05, 8, BRASS, x, 2.0, -0.5)
        if (!(k.ruin && x > 0)) k.spire(0.24, 0.8, 8, '#3f6fc8', 2.02, 3, 0, x, -0.5)
      }
      k.overgrow(1.6, 1.5, 1.34, 0.24)
      k.rubble(0.6, 1.0, 9, '#e4e2dc', 1.4)
      k.sprout(-0.2, 1.5, 0, 1.3)
      break
    }
    case 7: {
      // じょうきの家：れんが + 木組み・銅の パイプと ボイラー・かべの 大きな はぐるま・高い えんとつ・丸い 時計・ガスの あかり
      k.masonry(1.6, 1.0, 1.3, '#a05a44', 0, 0.5, 0, 24)
      k.box(1.66, 0.08, 1.36, IRON, 0, 1.0, 0)
      k.door(0.34, 0.56, -0.38, 0.66, '#4a3222', true)
      k.box(0.14, 0.14, 0.03, BRASS, -0.38, 0.78, 0.69)
      k.win(0.26, 0.26, 0.3, 0.6, 0.66, { arch: true, frame: BRASS, lit: '#ffc46a' })
      if (!k.ruin) {
        k.timber(1.5, 0.66, 1.2, '#d8c8a8', 0, 1.37, 0)
        k.win(0.18, 0.24, -0.4, 1.38, 0.62, { frame: BRASS, lit: '#ffc46a' })
        k.gable(1.5, 1.2, 0.7, '#4a4448', 1.7, '#d8c8a8')
        // 丸い 時計
        k.cyl(0.2, 0.2, 0.05, 12, BRASS, 0.25, 1.4, 0.63).rotation.x = Math.PI / 2
        k.cyl(0.16, 0.16, 0.06, 12, k.glow(k.old ? '#8a8674' : '#fff4d8'), 0.25, 1.4, 0.64).rotation.x = Math.PI / 2
        k.box(0.02, 0.13, 0.02, IRON, 0.25, 1.45, 0.68)
        k.box(0.09, 0.02, 0.02, IRON, 0.29, 1.4, 0.68)
      } else {
        k.timber(0.7, 0.66, 1.2, '#d8c8a8', -0.4, 1.37, 0)
        for (let i = 0; i < 4; i++) k.box(0.06, 0.06, 1.2, DARK, 0.1 + i * 0.22, 1.06, 0)
        k.box(0.9, 0.05, 1.0, '#4a4448', 0.4, 1.2, 0).rotation.z = -0.6
      }
      // ボイラーと パイプ
      k.cyl(0.24, 0.24, 0.7, 10, COPPER, 0.98, 0.42, -0.1)
      k.ball(0.24, COPPER, 0.98, 0.77, -0.1, 1)
      for (const yy of [0.2, 0.6]) k.cyl(0.25, 0.25, 0.04, 10, BRASS, 0.98, yy, -0.1)
      k.cyl(0.07, 0.07, 0.04, 8, k.glow(k.W ? '#3a3028' : '#ff8a3a'), 0.98, 0.3, 0.15).rotation.x = Math.PI / 2
      k.pipe([[0.98, 0.95, -0.1], [0.98, 1.3, -0.1], [0.78, 1.3, -0.1], [0.78, 1.3, 0.5]])
      k.pipe([[-0.83, 0.2, 0.4], [-0.83, 1.1, 0.4], [-0.83, 1.1, -0.2]], 0.04)
      k.gear(0.26, 0.42, 0.62, 0.7)
      k.gear(0.14, 0.1, 0.36, 0.69, IRON, 6)
      // 高い えんとつ（鉄の 輪）
      const ch = k.ruin ? 1.0 : 2.0
      k.cyl(0.11, 0.16, ch, 8, '#7a4436', -0.5, (k.ruin ? 1.0 : 1.7) + ch / 2 - 0.4, -0.35)
      if (!k.ruin) {
        for (const yy of [2.0, 2.6]) k.cyl(0.14, 0.14, 0.05, 8, IRON, -0.5, yy, -0.35)
        k.cyl(0.13, 0.11, 0.08, 8, IRON, -0.5, 3.32, -0.35).name = k.W ? '' : 'chimney'
      }
      k.lantern(-0.05, 0.9, 0.74)
      k.barrel(-0.98, 0.6)
      k.crate(0.3, 0.92, 0.2)
      k.overgrow(1.6, 1.6, 1.34)
      k.rust(1.6, 1.5, 1.34)
      k.rubble(0.4, 0.9, 9, '#a05a44', 1.3)
      k.sprout(0.4, 1.0, 0, 1.2)
      break
    }
    case 8: {
      // まざりの家：こけた 石と 木の 家に、画面・ケーブル・アンテナ・光る きのこ・太い木の根と パイプが からむ
      k.masonry(1.6, 0.95, 1.3, '#8f9a8c', 0, 0.48, 0, 18)
      k.door(0.34, 0.56, -0.4, 0.66, '#4a3a2a', true)
      k.box(0.1, 0.06, 0.02, k.glow(k.W ? '#2a4a40' : '#7dffc0'), -0.4, 0.7, 0.7).name = 'lit'
      k.screen(0.36, 0.26, 0.3, 0.62, 0.67, '#7dffc0')
      // やぶれ目：新しくても 1 つ・古いほど 大きく 多い
      k.tear(0.24 + k.W * 0.1, 0.3 + k.W * 0.12, 0.82, 0.55, 0, true)
      if (k.old) k.tear(0.3, 0.34, -0.05, 0.5, 0.67)
      if (k.ruin) k.tear(0.5, 0.4, 0.45, 0.3, 0.672)
      if (!k.ruin) {
        k.timber(1.4, 0.6, 1.1, '#d6d2bc', 0, 1.3, 0)
        if (k.old) k.tear(0.3, 0.26, -0.1, 1.42, 0.58)
        k.win(0.2, 0.22, -0.4, 1.3, 0.57, { shut: true })
        k.screen(0.3, 0.2, 0.3, 1.32, 0.57, '#5ef2ff')
        k.gable(1.4, 1.1, 0.7, '#5a7a5a', 1.6, '#d6d2bc')
        k.box(0.6, 0.05, 0.4, '#3a4a5a', -0.3, 2.0, 0.3).rotation.z = 0.62 // ひかりを うける 板
        k.box(0.5, 0.02, 0.3, k.glow(k.old ? '#24303a' : '#3f6fc8'), -0.31, 2.03, 0.3).rotation.z = 0.62
      } else {
        for (const [x, z, hh] of [[-0.66, 0.5, 0.5], [0.66, -0.5, 0.6], [-0.66, -0.5, 0.3]]) k.box(0.09, hh, 0.09, DARK, x, 0.96 + hh / 2, z)
        k.box(1.0, 0.05, 0.9, '#5a7a5a', 0.3, 1.1, 0).rotation.z = -0.5
        k.screen(0.3, 0.2, -0.2, 0.2, 0.95, '#5ef2ff')
      }
      // 木の根（家に からむ）と 木
      k.cyl(0.14, 0.2, 1.9, 6, '#5a4030', 0.92, 0.95, -0.4).rotation.z = -0.1
      for (const [dx, dy, dz, rr] of [[0, 2.1, 0, 0.5], [-0.35, 1.9, 0.2, 0.36], [0.3, 1.85, -0.2, 0.34], [-0.1, 2.4, 0.1, 0.3]]) k.ball(rr, k.m(dy > 2 ? '#6fa848' : '#4c8436', true), 0.92 + dx, dy, -0.4 + dz, 1)
      k.pipe([[0.92, 0.3, 0.2], [0.6, 0.5, 0.67], [0.6, 0.95, 0.67]], 0.045, '#5a4030')
      // ケーブルと アンテナ
      k.cable(-0.7, 1.5, 0.9, 1.8, 0.6, 0.3)
      k.cable(-0.75, 1.0, -0.2, 0.9, 0.68, 0.15)
      k.antenna(-0.5, k.ruin ? 1.0 : 2.1, -0.2, 0.7)
      // 光る きのこ と 小さな 機械
      for (const [x, z, s] of [[-0.95, 0.6, 1], [-0.8, 0.8, 0.7], [0.75, 0.9, 0.8]]) {
        k.cyl(0.02 * s, 0.03 * s, 0.14 * s, 5, '#e8e4d0', x, 0.07 * s, z)
        k.cyl(0.02, 0.09 * s, 0.07 * s, 7, k.glow(k.ruin ? '#7dffc0' : k.old ? '#5fbf98' : '#7dffc0'), x, 0.17 * s, z).name = 'lit'
      }
      k.box(0.24, 0.3, 0.2, '#4a6078', 0.05, 0.15, 0.85)
      k.box(0.16, 0.08, 0.02, k.glow(k.W ? '#3a2a2a' : '#ffb347'), 0.05, 0.2, 0.96).name = 'lit'
      k.overgrow(1.6, 1.5, 1.34)
      k.rust(1.2, 0.9, 1.34)
      k.rubble(0.3, 0.9, 7, '#8f9a8c', 1.2)
      k.sprout(-0.2, 0.95, 0.1, 1.3)
      break
    }
    default: {
      // きかいの すみか：金ぞくの 板と リベット・光る 回路・自動ドア・まわる 換気・パイプ・アンテナ・光る しん
      const glow = k.ruin ? '#1c2a30' : k.old ? '#3f7a80' : '#5ef2ff'
      k.box(1.7, 0.2, 1.5, '#2e3848', 0, 0.1, 0)
      k.box(1.4, 1.15, 1.2, '#4a6078', 0, 0.77, 0)
      for (const yy of [0.5, 1.05]) k.box(1.46, 0.07, 1.26, '#2e3848', 0, yy, 0)
      for (let i = 0; i < 8; i++) for (const yy of [0.5, 1.05]) k.box(0.04, 0.04, 0.02, '#c8d2e0', -0.63 + i * 0.18, yy, 0.64)
      for (const [w, h, x, y] of [[0.5, 0.03, -0.25, 1.22], [0.03, 0.36, 0.0, 1.05], [0.36, 0.03, 0.18, 0.76], [0.03, 0.3, 0.36, 0.62], [0.2, 0.03, 0.46, 0.32]] as const) k.box(w, h, 0.02, k.glow(glow), x, y, 0.61).name = 'lit'
      k.box(0.4, 0.62, 0.05, '#1e2632', -0.36, 0.51, 0.61)
      k.box(0.02, 0.6, 0.02, k.glow(glow), -0.36, 0.51, 0.645).name = 'lit'
      if (k.ruin) k.box(0.2, 0.6, 0.04, '#3a4a5c', -0.6, 0.3, 0.8).rotation.set(0.5, 0.3, 0.3)
      if (!k.ruin) {
        k.box(1.1, 0.55, 1.0, '#5a7490', 0, 1.62, 0)
        k.box(1.16, 0.06, 1.06, '#2e3848', 0, 1.9, 0)
        k.screen(0.44, 0.26, 0.2, 1.62, 0.51)
        // しん（光る 柱）
        k.cyl(0.14, 0.14, 0.5, 8, k.glow(glow), -0.3, 2.15, 0).name = 'lit'
        for (const yy of [1.95, 2.38]) k.cyl(0.2, 0.2, 0.06, 8, '#2e3848', -0.3, yy, 0)
      } else {
        k.box(0.6, 0.55, 1.0, '#5a7490', -0.3, 1.62, 0).rotation.z = 0.12
        k.box(0.7, 0.06, 0.9, '#2e3848', 0.5, 1.2, 0).rotation.z = -0.7
        k.cyl(0.14, 0.14, 0.5, 8, '#2a3440', 0.9, 0.14, 0.7).rotation.z = Math.PI / 2
      }
      const fan = k.gear(0.2, 0.42, 0.86, 0.63, '#c8d2e0', 6)
      fan.scale.setScalar(0.9)
      k.pipe([[-0.78, 0.2, 0.3], [-0.78, 1.5, 0.3], [-0.5, 1.5, 0.3]], 0.06, '#8a94a4')
      k.pipe([[0.78, 0.2, -0.3], [0.78, 0.9, -0.3]], 0.08, '#8a94a4')
      k.antenna(0.35, k.ruin ? 1.3 : 1.93, -0.3, 0.8)
      k.cable(-0.7, 1.3, 0.3, 1.1, 0.64, 0.12)
      k.overgrow(1.4, 1.2, 1.24)
      k.rust(1.4, 1.8, 1.24)
      k.rubble(0.5, 0.9, 8, '#4a6078', 1.3)
      k.sprout(0.3, 1.3, 0, 1.2)
    }
  }
  return k.done()
}

/** 塔（みはり・城の かど）。時代が 進むほど 高く */
export function eraTower(era: Era, ctx: EraCtx, wear: Wear = 0, seed = 2): THREE.Group {
  const k = new Kit(ctx, wear, seed)
  switch (era) {
    case 1: {
      // みはりの 木：3 本の 支え・台・なわばしご・のろしの かご
      const pole = k.cyl(0.05, 0.07, k.ruin ? 1.0 : 2.0, 5, WOOD, 0, k.ruin ? 0.5 : 1.0, 0)
      if (k.ruin) {
        k.cyl(0.05, 0.05, 1.0, 5, WOOD, 0.5, 0.08, 0.2).rotation.z = Math.PI / 2
        pole.rotation.z = 0.15
      } else {
        k.box(0.6, 0.05, 0.6, '#8a6038', 0, 1.6, 0)
        for (const [x, z] of [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]]) k.cyl(0.02, 0.02, 0.3, 4, WOOD, x, 1.77, z)
        for (const z of [-0.28, 0.28]) k.box(0.6, 0.03, 0.03, WOOD, 0, 1.9, z)
        k.cyl(0.12, 0.08, 0.14, 6, IRON, 0, 2.1, 0)
        if (!k.old) k.cyl(0.02, 0.09, 0.2, 5, k.glow('#ffb347'), 0, 2.26, 0).name = 'lit'
        k.flag(0.25, 1.9, 0.25, '#ffd23f', 0.5)
      }
      for (const a of [0.8, 2.9, 5.0]) k.cyl(0.025, 0.025, 1.2, 4, WOOD, Math.cos(a) * 0.34, 0.5, Math.sin(a) * 0.34).rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55)
      for (let i = 0; i < 6; i++) k.box(0.2, 0.025, 0.025, '#b89a6a', 0.14, 0.2 + i * 0.24, 0.1)
      k.overgrow(0.5, 1.4, 0.4)
      k.rubble(0, 0.3, 3, WOOD, 0.6)
      break
    }
    case 2: {
      // 木の やぐら：4 本足・X の すじかい・はしご・手すりの 台・わらの 屋根・かね
      const H = k.ruin ? 1.2 : 2.0
      for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) k.cyl(0.05, 0.07, H + (k.ruin ? (x + z) * 0.4 : 0), 5, '#7a5230', x, H / 2, z)
      for (const y of [0.6, 1.3]) {
        if (y > H) continue
        for (const z of [-0.42, 0.42]) k.box(0.9, 0.05, 0.05, '#8a6038', 0, y, z)
        for (const x of [-0.42, 0.42]) k.box(0.05, 0.05, 0.9, '#8a6038', x, y, 0)
      }
      for (const sg of [-1, 1]) k.box(0.045, 1.1, 0.04, '#8a6038', 0, 0.95, 0.43).rotation.z = sg * 0.72
      for (let i = 0; i < 7; i++) k.box(0.22, 0.025, 0.03, '#b89a6a', -0.42, 0.2 + i * 0.26, 0.5)
      if (!k.ruin) {
        k.box(1.2, 0.07, 1.2, '#8a6038', 0, 2.0, 0)
        for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) k.cyl(0.03, 0.03, 0.75, 4, '#7a5230', x, 2.4, z)
        for (const z of [-0.55, 0.55]) k.box(1.1, 0.04, 0.04, '#7a5230', 0, 2.3, z)
        for (const x of [-0.55, 0.55]) k.box(0.04, 0.04, 1.1, '#7a5230', x, 2.3, 0)
        k.gable(1.1, 1.1, 0.55, '#c9a850', 2.76, '#8a6038')
        k.cyl(0.07, 0.1, 0.14, 6, BRASS, 0, 2.62, 0)
      } else {
        k.box(1.0, 0.07, 0.8, '#8a6038', 0.3, 0.9, 0.2).rotation.set(0.2, 0.3, -0.7)
        k.box(0.9, 0.05, 0.9, '#b8964a', 0.8, 0.12, 0.5).rotation.set(0.1, 0.5, 0.1)
      }
      k.overgrow(0.9, 1.9, 0.9)
      k.rubble(0.5, 0.5, 5, '#7a5230', 1.0)
      k.sprout(0, 0, 0, 1.3)
      break
    }
    case 3: {
      // 木組みの 時計塔：石の土台・2 だんの 木組み・はり出し・時計・とんがり屋根・風見
      k.masonry(1.1, 0.9, 1.1, '#9aa1ab', 0, 0.45, 0, 12)
      k.door(0.3, 0.5, 0, 0.56, '#5a3a22', true)
      k.timber(1.0, 1.1, 1.0, '#eadcba', 0, 1.45, 0)
      k.win(0.18, 0.26, 0, 1.4, 0.52, { shut: true })
      if (!k.ruin) {
        for (const x of [-0.4, 0.4]) k.box(0.07, 0.12, 0.16, DARK, x, 2.0, 0.55)
        k.timber(1.3, 0.6, 1.3, '#f0e4c6', 0, 2.32, 0)
        k.cyl(0.2, 0.2, 0.05, 12, DARK, 0, 2.34, 0.67).rotation.x = Math.PI / 2
        k.cyl(0.16, 0.16, 0.06, 12, k.glow(k.old ? '#8a8674' : '#fff4d8'), 0, 2.34, 0.68).rotation.x = Math.PI / 2
        k.box(0.02, 0.13, 0.02, DARK, 0, 2.39, 0.72)
        k.spire(1.05, 1.1, 4, '#b85a4a', 2.62, 5, Math.PI / 4)
        k.cyl(0.012, 0.012, 0.4, 4, IRON, 0, 3.9, 0)
        k.box(0.22, 0.08, 0.02, IRON, 0.06, 4.0, 0)
      } else {
        for (const [x, z, hh] of [[-0.5, 0.5, 0.8], [0.5, 0.5, 0.3], [-0.5, -0.5, 1.0], [0.5, -0.5, 0.6]]) k.box(0.09, hh, 0.09, DARK, x, 2.0 + hh / 2, z)
        k.box(1.0, 0.07, 0.05, DARK, 0, 2.6, -0.5).rotation.z = -0.15
        k.box(0.5, 0.5, 0.05, '#e0d2b0', -0.25, 2.3, -0.52)
      }
      k.lantern(0.3, 0.8, 0.62)
      k.overgrow(1.0, 2.4, 1.04)
      k.rubble(0.4, 0.8, 7, '#b85a4a', 1.2)
      k.sprout(0.1, 2.0, 0, 1.3)
      break
    }
    case 4: {
      // 石の 丸い塔：すそ広がり・石の 帯・矢の窓・はり出しの 胸かべ・木の やぐら屋根・たいまつ
      const H = k.ruin ? 1.9 : 2.7
      k.cyl(0.66, 0.84, 0.5, 10, '#8e949e', 0, 0.25, 0)
      k.cyl(0.62, 0.68, H, 10, STONE, 0, H / 2 + 0.3, 0)
      k.roundStones(0.66, 0.5, H, STONE, 22)
      for (const yy of [1.1, 2.0]) if (yy < H) k.cyl(0.67, 0.67, 0.06, 10, '#8e949e', 0, yy, 0)
      for (const yy of [0.9, 1.6, 2.3]) if (yy < H) k.box(0.07, 0.3, 0.04, k.glow('#1c1e24'), 0, yy, 0.66)
      k.door(0.32, 0.5, 0, 0.82, DARK, true)
      if (!k.ruin) {
        k.cyl(0.84, 0.64, 0.26, 10, '#8e949e', 0, H + 0.36, 0)
        for (let i = 0; i < 10; i++) k.box(0.08, 0.16, 0.12, '#7e848e', Math.cos((i / 10) * 6.283) * 0.72, H + 0.2, Math.sin((i / 10) * 6.283) * 0.72)
        k.crenel(0.78, H + 0.6, STONE, 10)
        for (const a of [0.8, 2.4, 4.0, 5.5]) k.cyl(0.03, 0.03, 0.6, 4, WOOD, Math.cos(a) * 0.5, H + 0.8, Math.sin(a) * 0.5)
        k.spire(0.72, 0.55, 8, '#6a4a34', H + 1.08, 3)
        k.flag(0, H + 1.6, 0, '#5a9aff', 0.5)
      } else {
        k.brokenRim(0.6, H + 0.25, STONE, 10)
        k.box(0.5, 0.4, 0.03, k.glow('#15171c'), 0.2, 1.5, 0.66).rotation.z = 0.3
      }
      k.lantern(0.34, 0.85, 0.86)
      k.overgrow(1.0, H, 1.38)
      k.rubble(0.5, 0.9, 11, STONE, 1.5)
      k.sprout(0.1, H + 0.2, 0, 1.4)
      break
    }
    case 5: {
      // 城の 天守の塔：四角い 石の 大塔 + かどの 小塔・石落とし・二重の 胸かべ・急な屋根・旗・つりあげ橋の くさり
      const H = k.ruin ? 2.4 : 3.3
      k.masonry(1.5, 0.6, 1.5, '#868c96', 0, 0.3, 0, 10)
      k.masonry(1.3, H, 1.3, '#9aa0aa', 0, H / 2 + 0.5, 0, 30)
      k.door(0.4, 0.7, 0, 0.76, DARK, true)
      for (const sx of [-1, 1]) k.box(0.02, 0.9, 0.02, IRON, sx * 0.24, 1.2, 0.72).rotation.x = -0.25
      for (const [x, y] of [[-0.35, 1.6], [0.35, 1.6], [0, 2.4]]) if (y < H) k.win(0.14, 0.32, x, y, 0.66, { arch: true })
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const dead = k.ruin && sx === 1 && sz === 1
        k.cyl(0.2, 0.22, dead ? H * 0.6 : H + 0.9, 8, '#8e949e', sx * 0.66, (dead ? H * 0.6 : H + 0.9) / 2 + 0.4, sz * 0.66)
        if (!k.ruin) k.spire(0.26, 0.6, 8, '#7a3a34', H + 1.3, 3, 0, sx * 0.66, sz * 0.66)
        else if (!dead) k.brokenRim(0.18, H + 1.25, '#8e949e', 5, sx * 0.66, sz * 0.66)
      }
      if (!k.ruin) {
        k.box(1.6, 0.3, 1.6, '#868c96', 0, H + 0.6, 0)
        for (let i = 0; i < 7; i++) k.box(0.1, 0.18, 0.1, '#767c86', -0.66 + i * 0.22, H + 0.38, 0.78)
        for (let i = 0; i < 6; i++) for (const sz of [-1, 1]) k.box(0.18, 0.22, 0.12, '#9aa0aa', -0.55 + i * 0.22, H + 0.86, sz * 0.76)
        for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) k.box(0.12, 0.22, 0.18, '#9aa0aa', sx * 0.76, H + 0.86, -0.55 + i * 0.22)
        k.masonry(0.9, 0.6, 0.9, '#a8adb6', 0, H + 1.05, 0, 6)
        k.gable(0.9, 0.9, 0.9, '#7a3a34', H + 1.35, '#a8adb6')
        k.flag(0, H + 2.3, 0, '#ff5a5a', 0.6)
      } else {
        // 上が ななめに くずれ落ちた
        for (const [x, w, hh] of [[-0.45, 0.4, 0.9], [-0.05, 0.36, 0.4], [0.4, 0.4, 0.2]]) k.box(w, hh, 0.2, '#9aa0aa', x, H + 0.5 + hh / 2, -0.55)
        k.box(0.2, 0.7, 0.6, '#9aa0aa', -0.55, H + 0.85, -0.2)
        k.box(0.6, 0.6, 0.03, k.glow('#15171c'), 0.25, H - 0.1, 0.665).rotation.z = 0.4
        k.box(0.9, 0.5, 0.7, '#8a9098', 0.9, 0.25, 0.9).rotation.set(0.3, 0.5, 0.2)
      }
      k.lantern(-0.36, 1.0, 0.72)
      k.lantern(0.36, 1.0, 0.72)
      k.overgrow(1.3, H, 1.34, 0.5)
      k.rubble(0.6, 1.0, 14, '#9aa0aa', 1.8)
      k.sprout(-0.2, H + 0.5, 0.1, 1.6)
      break
    }
    case 6: {
      // 白い 尖塔：ほそく 高い・金の 帯・らせんの 窓・ひろがる バルコニー・小さな そえ塔・青い とんがり・ほし
      const H = k.ruin ? 2.6 : 3.8
      k.cyl(0.7, 0.8, 0.3, 10, '#d8dce6', 0, 0.15, 0)
      k.cyl(0.5, 0.62, H, 10, '#f6f4ee', 0, H / 2 + 0.3, 0)
      for (const yy of [0.7, 1.9, 3.0]) if (yy < H) k.cyl(0.6 - yy * 0.03, 0.6 - yy * 0.03, 0.07, 10, BRASS, 0, yy, 0)
      k.door(0.3, 0.6, 0, 0.6, '#3a4a78', true, 0.3)
      const cols = ['#7fd8ff', '#ff9ecb', '#ffe27a', '#b48cff']
      for (let i = 0; i < 4; i++) {
        const yy = 1.2 + i * 0.7
        if (yy > H) continue
        const a = 1.2 - i * 0.5
        const o = new THREE.Group()
        o.rotation.y = a
        k.add(o, 0, 0, 0)
        const rr = 0.6 - yy * 0.028
        const pane = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.36, 0.04), k.glow(k.W ? '#2c3238' : cols[i]))
        pane.name = 'lit'
        pane.position.set(0, yy, rr)
        const fr = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.44, 0.03), k.m(BRASS))
        fr.position.set(0, yy, rr - 0.01)
        o.add(fr, pane)
      }
      // そえ塔
      for (const [x, z, hh] of [[-0.62, 0.3, 1.6], [0.6, -0.36, 2.1]] as const) {
        k.cyl(0.16, 0.2, hh, 8, '#f0eee8', x, hh / 2, z)
        k.cyl(0.2, 0.2, 0.05, 8, BRASS, x, hh, z)
        if (!(k.ruin && x > 0)) k.spire(0.24, 0.7, 8, '#3f6fc8', hh + 0.02, 3, 0, x, z)
      }
      if (!k.ruin) {
        k.cyl(0.86, 0.5, 0.34, 10, '#e4e2dc', 0, H + 0.42, 0)
        k.cyl(0.88, 0.88, 0.06, 10, BRASS, 0, H + 0.62, 0)
        for (let i = 0; i < 12; i++) k.cyl(0.02, 0.025, 0.22, 5, '#f6f4ee', Math.cos((i / 12) * 6.283) * 0.82, H + 0.76, Math.sin((i / 12) * 6.283) * 0.82)
        k.cyl(0.86, 0.86, 0.04, 12, BRASS, 0, H + 0.88, 0)
        k.cyl(0.44, 0.46, 0.8, 10, '#f6f4ee', 0, H + 1.0, 0)
        k.win(0.16, 0.36, 0, H + 1.05, 0.45, { arch: true, lit: '#ffe27a', frame: BRASS })
        k.spire(0.62, 1.9, 10, '#3f6fc8', H + 1.4, 5)
        k.cyl(0.02, 0.1, 0.36, 4, k.glow('#ffe27a'), 0, H + 3.45, 0)
      } else {
        k.brokenRim(0.46, H + 0.3, '#f6f4ee', 9)
        // 落ちた 尖塔の さき
        const tip = k.cyl(0.02, 0.5, 1.3, 10, '#3f6fc8', 1.1, 0.3, 0.9)
        tip.rotation.set(0.3, 0, 1.35)
      }
      k.overgrow(1.0, H, 1.2, 0.3)
      k.rubble(0.6, 1.0, 12, '#e4e2dc', 1.7)
      k.sprout(0.1, H + 0.3, 0, 1.5)
      break
    }
    case 7: {
      // じょうきの 時計塔：れんがの 塔・鉄の 帯・大きな 時計・むき出しの はぐるま・銅の タンクと パイプ・2 本の えんとつ・つりあげ機
      const H = k.ruin ? 2.5 : 3.6
      k.masonry(1.4, 0.5, 1.4, '#7a4436', 0, 0.25, 0, 8)
      k.masonry(1.2, H, 1.2, '#a05a44', 0, H / 2 + 0.5, 0, 34)
      for (const yy of [1.2, 2.3, 3.3]) if (yy < H + 0.4) k.box(1.26, 0.08, 1.26, IRON, 0, yy, 0)
      k.door(0.36, 0.6, 0, 0.71, '#4a3222', true)
      k.win(0.2, 0.28, 0, 1.7, 0.61, { arch: true, frame: BRASS, lit: '#ffc46a' })
      k.gear(0.34, -0.3, 2.7 > H ? 1.9 : 2.75, 0.66)
      k.gear(0.2, 0.26, 2.7 > H ? 1.6 : 2.45, 0.67, IRON, 7)
      // タンクと パイプ
      k.cyl(0.26, 0.26, 0.8, 10, COPPER, 0.92, 0.9, 0)
      k.ball(0.26, COPPER, 0.92, 1.3, 0, 1)
      for (const yy of [0.6, 1.2]) k.cyl(0.27, 0.27, 0.04, 10, BRASS, 0.92, yy, 0)
      for (const sx of [-1, 1]) k.cyl(0.03, 0.03, 0.5, 4, IRON, 0.92 + sx * 0.18, 0.25, 0.14)
      k.pipe([[0.92, 1.5, 0], [0.92, 2.0, 0], [0.62, 2.0, 0]])
      k.pipe([[-0.63, 0.3, 0.3], [-0.63, 2.2, 0.3], [-0.63, 2.2, -0.2]], 0.045)
      k.cyl(0.07, 0.07, 0.04, 8, k.glow(k.W ? '#3a3028' : '#ff8a3a'), 0.92, 0.8, 0.27).rotation.x = Math.PI / 2
      if (!k.ruin) {
        k.masonry(1.4, 0.9, 1.4, '#8a4e3c', 0, H + 0.95, 0, 10)
        // 時計
        k.cyl(0.42, 0.42, 0.06, 14, BRASS, 0, H + 0.95, 0.71).rotation.x = Math.PI / 2
        k.cyl(0.36, 0.36, 0.07, 14, k.glow(k.old ? '#8a8674' : '#fff4d8'), 0, H + 0.95, 0.72).rotation.x = Math.PI / 2
        k.box(0.03, 0.28, 0.02, IRON, 0, H + 1.07, 0.77)
        k.box(0.2, 0.03, 0.02, IRON, 0.08, H + 0.95, 0.77)
        for (let i = 0; i < 12; i++) k.box(0.03, 0.03, 0.02, IRON, Math.sin((i / 12) * 6.283) * 0.3, H + 0.95 + Math.cos((i / 12) * 6.283) * 0.3, 0.765)
        k.gable(1.4, 1.4, 0.8, '#4a4448', H + 1.4, '#8a4e3c')
        for (const x of [-0.4, 0.4]) {
          k.cyl(0.09, 0.12, 1.0, 8, '#6a3a2e', x, H + 2.2, -0.3)
          k.cyl(0.12, 0.12, 0.05, 8, IRON, x, H + 2.4, -0.3)
          k.cyl(0.11, 0.09, 0.07, 8, IRON, x, H + 2.72, -0.3).name = k.W ? '' : 'chimney'
        }
        // つりあげ機
        k.box(0.06, 0.06, 0.9, IRON, -0.5, H + 0.4, 0.9)
        k.box(0.015, 0.7, 0.015, IRON, -0.5, H + 0.05, 1.3)
        k.crate(-0.5, 1.3, 0.2).position.y = H - 0.4
      } else {
        for (const [x, w, hh] of [[-0.4, 0.4, 0.8], [0.05, 0.4, 0.3], [0.45, 0.3, 0.5]]) k.box(w, hh, 0.2, '#8a4e3c', x, H + 0.5 + hh / 2, -0.5)
        k.box(0.2, 0.6, 0.5, '#8a4e3c', -0.5, H + 0.8, -0.2)
        // 落ちた 時計
        const ck = k.cyl(0.4, 0.4, 0.07, 14, BRASS, 0.3, 0.3, 1.1)
        ck.rotation.set(1.1, 0.2, 0.3)
        k.box(0.7, 0.7, 0.03, k.glow('#15171c'), 0.15, H - 0.2, 0.615).rotation.z = 0.5
      }
      k.lantern(0.34, 0.95, 0.72)
      k.overgrow(1.2, H, 1.24, 0.5)
      k.rust(1.2, H, 1.24, 0.5)
      k.rubble(0.5, 1.0, 13, '#a05a44', 1.7)
      k.sprout(-0.1, H + 0.5, 0.1, 1.5)
      break
    }
    case 8: {
      // まざりの 塔：古い 石の塔に 大きな木が からみ、てっぺんに 皿の アンテナと 光る 柱、まわりに 画面と ケーブルと 風車
      const H = k.ruin ? 2.4 : 3.4
      k.cyl(0.7, 0.86, 0.5, 10, '#7e8a80', 0, 0.25, 0)
      k.cyl(0.6, 0.68, H, 10, '#8f9a8c', 0, H / 2 + 0.3, 0)
      k.roundStones(0.65, 0.5, H, '#8f9a8c', 20)
      k.door(0.32, 0.5, 0, 0.84, '#4a3a2a', true)
      k.screen(0.34, 0.24, 0, 1.3, 0.66, '#7dffc0')
      if (H > 2.5) k.screen(0.26, 0.2, 0, 2.3, 0.63, '#5ef2ff')
      k.tear(0.3 + k.W * 0.08, 0.5 + k.W * 0.2, 0.3, 1.9, 0.6)
      if (k.old) k.tear(0.26, 0.4, -0.34, 0.9, 0.62)
      if (k.ruin) k.tear(0.4, 0.6, -0.2, 1.7, 0.6)
      // からむ 木（幹が らせんに のぼる）
      const trunk: [number, number, number][] = []
      for (let i = 0; i <= 7; i++) {
        const a = 2.2 + i * 0.75
        trunk.push([Math.cos(a) * (0.74 - i * 0.02), 0.1 + i * (H / 8), Math.sin(a) * (0.74 - i * 0.02)])
      }
      k.pipe(trunk, 0.1, '#5a4030')
      for (const [dx, dy, dz, rr] of [[-0.7, 0.3, -0.2, 0.5], [-0.2, 0.7, 0.3, 0.44], [0.5, 0.4, 0.2, 0.42], [0.2, 0.9, -0.4, 0.38], [-0.6, 0.8, 0.4, 0.3]]) k.ball(rr, k.m(dy > 0.6 ? '#6fa848' : '#4c8436', true), dx, H - 0.2 + dy, dz, 1)
      if (!k.ruin) {
        k.cyl(0.74, 0.62, 0.2, 10, '#5a6a70', 0, H + 0.4, 0)
        k.crenel(0.7, H + 0.6, '#8f9a8c', 10)
        // 光る 柱 と 皿
        k.cyl(0.12, 0.12, 0.9, 8, k.glow(k.old ? '#3f8a70' : '#7dffc0'), 0.1, H + 1.5, 0).name = 'lit'
        for (const yy of [1.0, 1.95]) k.cyl(0.18, 0.18, 0.06, 8, IRON, 0.1, H + yy, 0)
        const dish = k.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2.6), k.m('#c8d2e0')), 0.1, H + 2.45, 0)
        dish.rotation.set(Math.PI - 0.7, 0.4, 0)
        k.cyl(0.015, 0.015, 0.4, 4, '#c8d2e0', 0.2, H + 2.4, 0.2).rotation.x = 0.7
        // 風車（小さな 羽根）
        const mill = k.gear(0.22, -0.72, H - 0.3, 0.3, '#d8dce6', 4)
        mill.rotation.y = -0.9
      } else {
        k.brokenRim(0.58, H + 0.25, '#8f9a8c', 10)
        const dish = k.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2.6), k.m('#c8d2e0')), 1.1, 0.25, 0.8)
        dish.rotation.set(2.2, 0.4, 0.5)
      }
      k.cable(-0.5, H + 0.2, 0.9, 0.9, 0.5, 0.5)
      k.cable(-0.9, 1.4, 0.2, 1.2, 0.72, 0.2)
      for (const [x, z, s] of [[0.8, 0.7, 1], [0.95, 0.5, 0.7], [-0.85, 0.75, 0.9], [0.4, 1.0, 0.6]]) {
        k.cyl(0.02 * s, 0.03 * s, 0.16 * s, 5, '#e8e4d0', x, 0.08 * s, z)
        k.cyl(0.02, 0.1 * s, 0.08 * s, 7, k.glow(k.old && !k.ruin ? '#5fbf98' : '#7dffc0'), x, 0.19 * s, z).name = 'lit'
      }
      k.overgrow(1.0, H, 1.38)
      k.rust(0.9, 1.5, 1.34, 0.8)
      k.rubble(0.5, 0.9, 10, '#8f9a8c', 1.5)
      k.sprout(0.2, H + 0.2, -0.1, 1.2)
      break
    }
    default: {
      // きかいの 塔：かさねた 金ぞくの 筒・むき出しの 光る しん・ささえの うで・まわる 輪・うかぶ かけら・アンテナ・足もとの 機械
      const glow = k.ruin ? '#1c2a30' : k.old ? '#3f7a80' : '#5ef2ff'
      k.cyl(0.9, 1.0, 0.4, 8, '#2e3848', 0, 0.2, 0)
      for (let i = 0; i < 8; i++) k.box(0.2, 0.06, 0.03, k.glow(glow), Math.cos((i / 8) * 6.283 + 0.39) * 0.92, 0.22, Math.sin((i / 8) * 6.283 + 0.39) * 0.92).rotation.y = -(i / 8) * 6.283 - 0.39 + Math.PI / 2
      k.cyl(0.62, 0.74, 1.5, 8, '#4a6078', 0, 1.15, 0)
      for (const yy of [0.6, 1.2, 1.8]) k.cyl(0.7 - yy * 0.04, 0.7 - yy * 0.04, 0.06, 8, '#2e3848', 0, yy, 0)
      k.screen(0.4, 0.3, 0, 1.2, 0.66)
      k.box(0.3, 0.5, 0.05, '#1e2632', 0, 0.66, 0.72)
      // むき出しの しん
      k.cyl(0.3, 0.3, 1.1, 8, k.glow(glow), 0, 2.45, 0).name = 'lit'
      for (const a of [0.39, 1.96, 3.53, 5.1]) {
        const arm = k.box(0.1, 1.2, 0.12, '#2e3848', Math.cos(a) * 0.44, 2.45, Math.sin(a) * 0.44)
        if (k.ruin && a > 3) arm.rotation.set(0.4, 0, 0.5)
      }
      k.cyl(0.5, 0.36, 0.2, 8, '#2e3848', 0, 1.98, 0)
      if (!k.ruin) {
        k.cyl(0.7, 0.56, 0.9, 8, '#5a7490', 0, 3.45, 0)
        k.cyl(0.76, 0.76, 0.08, 8, BRASS, 0, 3.02, 0)
        for (let i = 0; i < 8; i++) k.box(0.05, 0.4, 0.02, k.glow(glow), Math.cos((i / 8) * 6.283) * 0.66, 3.5, Math.sin((i / 8) * 6.283) * 0.66).name = 'lit'
        const ring = k.add(new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.05, 5, 16), k.m(BRASS)), 0, 4.15, 0)
        ring.rotation.x = Math.PI / 2 + (k.old ? 0.35 : 0)
        ring.name = k.W ? '' : 'blades'
        k.cyl(0.2, 0.44, 0.5, 8, '#2e3848', 0, 4.15, 0)
        k.antenna(0, 4.4, 0, 1.0)
        // うかぶ かけら
        if (!k.old) for (const [x, y, z] of [[1.0, 3.2, 0.3], [-0.9, 2.6, -0.4], [0.6, 4.6, -0.6]]) k.box(0.14, 0.14, 0.14, k.glow('#9af8ff'), x, y, z).rotation.set(0.6, 0.7, 0.2)
      } else {
        // 上の 筒が 落ちて ころがる・輪が ひっかかる
        k.cyl(0.7, 0.56, 0.9, 8, '#5a7490', 1.3, 0.5, 0.6).rotation.set(0.3, 0, 1.4)
        const ring = k.add(new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.05, 5, 16), k.m(BRASS)), 0.3, 1.9, 0.2)
        ring.rotation.set(1.1, 0.3, 0.2)
      }
      k.pipe([[0.8, 0.4, 0.3], [0.8, 1.8, 0.3], [0.5, 1.8, 0.3]], 0.07, '#8a94a4')
      k.pipe([[-0.82, 0.4, -0.2], [-0.82, 1.2, -0.2]], 0.09, '#8a94a4')
      k.box(0.3, 0.36, 0.3, '#4a6078', -0.95, 0.18, 0.6)
      k.box(0.2, 0.1, 0.02, k.glow(k.W ? '#3a2a2a' : '#ffb347'), -0.95, 0.24, 0.76).name = 'lit'
      k.cable(-0.9, 0.4, -0.4, 1.4, 0.7, 0.25)
      k.overgrow(1.0, 2.0, 1.4)
      k.rust(1.0, 3.0, 1.4)
      k.rubble(0.6, 1.0, 10, '#4a6078', 1.6)
      k.sprout(-0.3, 3.0, 0, 1.3)
    }
  }
  return k.done()
}

// ======================= 城壁（計画 B4） =======================
/** 城壁の 高さ（時代ごと・BUILD_SCALE を 掛ける前） */
export const WALL_H: Record<Era, number> = { 1: 0.5, 2: 1.1, 3: 1.2, 4: 1.5, 5: 1.8, 6: 1.8, 7: 1.7, 8: 1.6, 9: 1.8 }

/**
 * 城壁の 1 区切り（x 方向に 長さ len・まんなかが 原点・外がわは -z）。
 * 2 丸太の さく / 3 石の 足もとに 丸太と 通路 / 4・5 石の かべと 胸かべ / 6 白い かべと 金の ふち / 7 れんがと 鉄の 帯・パイプ / 8 こけた 石と ケーブル・やぶれ目 / 9 金ぞくの 板と 光る すじ
 * wear 2 = くずれて 低い・がれき（そこは 通れる 扱いに する）
 */
export function eraWall(era: Era, ctx: EraCtx, wear: Wear, len: number, seed: number): THREE.Group {
  const k = new Kit(ctx, wear, seed)
  const H = WALL_H[era] * (k.ruin ? 0.25 + k.r() * 0.35 : 1)
  if (era <= 3) {
    // 丸太の さく：とがった 先・横木
    const n = Math.max(2, Math.round(len / 0.2))
    for (let i = 0; i < n; i++) {
      const x = -len / 2 + (i + 0.5) * (len / n)
      const hh = H * (0.9 + k.r() * 0.2) * (k.ruin && k.r() < 0.5 ? 0.3 : 1)
      const o = k.cyl(0.085, 0.095, hh, 6, i % 2 ? '#7a5230' : '#8a6038', x, hh / 2, 0)
      if (k.old) o.rotation.z = (k.r() - 0.5) * 0.25
      if (!k.ruin) k.cyl(0.0, 0.085, 0.16, 6, '#9a7048', x, hh + 0.08, 0)
    }
    for (const y of [0.3, H - 0.25]) if (!k.ruin) k.box(len, 0.06, 0.06, DARK, 0, y, 0.1)
    if (era === 3) {
      k.masonry(len, 0.3, 0.4, '#9aa1ab', 0, 0.15, 0, 4)
      if (!k.ruin) {
        k.box(len, 0.06, 0.4, '#8a6038', 0, H - 0.3, 0.3)
        for (const x of [-len / 2 + 0.1, len / 2 - 0.1]) k.box(0.07, H - 0.3, 0.07, DARK, x, (H - 0.3) / 2, 0.45)
      }
    }
  } else {
    const c = era === 6 ? '#f2f0e8' : era === 7 ? '#a05a44' : era === 8 ? '#8f9a8c' : era === 9 ? '#4a6078' : era === 5 ? '#9aa0aa' : STONE
    const T = 0.5
    if (era === 9) {
      k.box(len, H, T, c, 0, H / 2, 0)
      for (let i = 0; i < Math.round(len / 0.5); i++) k.box(0.03, H * 0.9, 0.02, IRON, -len / 2 + 0.25 + i * 0.5, H / 2, -T / 2 - 0.01)
      if (!k.ruin) for (const y of [0.4, H - 0.3]) k.box(len, 0.04, 0.02, k.glow(k.old ? '#3f7a80' : '#5ef2ff'), 0, y, -T / 2 - 0.02).name = 'lit'
    } else {
      k.masonry(len, H, T, c, 0, H / 2, 0, Math.round(len * 5))
      // 外がわにも 石目
      for (let i = 0; i < Math.round(len * 3); i++) k.box(0.16 + k.r() * 0.1, 0.09, 0.025, mix(c, i % 2 ? '#ffffff' : '#20222a', 0.22), (k.r() - 0.5) * (len - 0.2), 0.1 + k.r() * (H - 0.2), -T / 2 - 0.008)
    }
    if (!k.ruin) {
      // 胸かべ（外がわ）と 通路（内がわ）
      const merl = era === 9 ? 0.6 : 0.34
      for (let x = -len / 2 + merl / 2; x < len / 2; x += merl * 2) {
        if (k.old && k.r() < 0.25) continue
        k.box(merl, 0.24, 0.16, c, x, H + 0.12, -T / 2 + 0.08)
      }
      k.box(len, 0.06, 0.24, era === 6 ? BRASS : mix(c, '#20222a', 0.25), 0, H - 0.02, 0.06)
      if (era === 6) k.box(len, 0.05, 0.03, BRASS, 0, H * 0.35, -T / 2 - 0.02)
      if (era === 7) {
        for (const y of [0.35, H - 0.3]) k.box(len, 0.06, 0.03, IRON, 0, y, -T / 2 - 0.02)
        k.pipe([[-len / 2, H * 0.6, T / 2 + 0.06], [len / 2, H * 0.6, T / 2 + 0.06]], 0.05)
      }
      if (era === 8) {
        k.cable(-len / 2, H * 0.8, len / 2, H * 0.7, T / 2 + 0.05, 0.25)
        if (k.r() < 0.5) k.tear(0.3, 0.36, (k.r() - 0.5) * len * 0.5, H * 0.5, -T / 2 - 0.02)
      }
    } else {
      k.rubble(0, -0.5, 5, c, len)
      k.rubble(0, 0.5, 4, c, len)
      if (era === 8) k.tear(0.36, 0.3, 0, H * 0.5, -T / 2 - 0.02)
    }
    if (k.old) {
      const moss = k.m('#4f7a3a', true)
      for (let i = 0; i < (k.ruin ? 4 : 2); i++) {
        const vl = 0.3 + k.r() * H * 0.6
        k.box(0.06, vl, 0.04, moss, (k.r() - 0.5) * len * 0.9, H - vl / 2, -T / 2 - 0.03)
      }
      k.box(len * 0.6, 0.05, 0.3, moss, (k.r() - 0.5) * 0.4, H + 0.01, 0)
    }
  }
  k.sprout((k.r() - 0.5) * len * 0.5, k.ruin ? 0.1 : WALL_H[era], 0, 0.8)
  return k.done()
}

/** 門：両わきの 塔 + アーチ + とびら。正面は -z（外がわ）。はば w（通り道） */
export function eraGate(era: Era, ctx: EraCtx, wear: Wear, w: number, seed: number): THREE.Group {
  const k = new Kit(ctx, wear, seed)
  const H = WALL_H[era] + (era <= 3 ? 0.8 : 1.2)
  const wood = era <= 3
  const c = era === 6 ? '#f2f0e8' : era === 7 ? '#a05a44' : era === 8 ? '#8f9a8c' : era === 9 ? '#4a6078' : STONE
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 + 0.35)
    if (wood) {
      for (const [dx, dz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) k.cyl(0.07, 0.08, H, 6, '#7a5230', x + dx, H / 2, dz)
      k.box(0.8, 0.07, 0.8, '#8a6038', x, H, 0)
      if (!k.ruin) k.gable(0.8, 0.8, 0.4, '#c9a850', H + 0.02, '#8a6038', x, 0)
    } else {
      const hh = k.ruin && sx > 0 ? H * 0.5 : H
      k.cyl(0.42, 0.48, hh, 10, c, x, hh / 2, 0)
      k.roundStones(0.46, 0.2, hh, c, 10)
      if (!(k.ruin && sx > 0)) {
        k.crenel(0.46, hh + 0.12, c, 8, x, 0)
        if (era === 6) k.spire(0.5, 0.9, 10, '#3f6fc8', hh + 0.02, 4, 0, x, 0)
        if (era === 5) k.spire(0.5, 0.7, 10, '#7a3a34', hh + 0.02, 3, 0, x, 0)
        if (era === 9) k.cyl(0.18, 0.18, 0.4, 8, k.glow(k.old ? '#3f7a80' : '#5ef2ff'), x, hh + 0.3, 0).name = 'lit'
      }
      k.box(0.08, 0.3, 0.04, k.glow('#1c1e24'), x, hh * 0.6, -0.46)
    }
    k.lantern(x - sx * 0.5, 1.0, -0.45)
    k.flag(x, H + (wood ? 0.4 : 0.6), 0, era === 6 ? '#5a9aff' : '#ff5a5a', 0.5)
  }
  if (!k.ruin) {
    // アーチ（上の はり）
    k.box(w + 0.7, 0.3, 0.6, wood ? '#8a6038' : c, 0, H - 0.15, 0)
    if (!wood) for (let i = 0; i < 6; i++) k.box(0.18, 0.2, 0.16, c, -w / 2 + (i + 0.5) * (w / 6), H + 0.1, -0.24)
    // あいた とびら
    for (const sx of [-1, 1]) {
      const d = k.box(w / 2, H - 0.4, 0.06, wood ? '#6a4a30' : '#5a3a22', sx * (w / 2 + 0.1), (H - 0.4) / 2, -0.3 - w * 0.2)
      d.rotation.y = sx * -1.1
    }
    if (era === 7) k.gear(0.3, 0, H - 0.15, -0.32)
    if (era === 8) k.tear(0.3, 0.2, w * 0.2, H - 0.15, -0.31)
  } else k.rubble(0, 0, 7, wood ? '#7a5230' : c, w)
  k.overgrow(w + 1.4, H, 0.9)
  return k.done()
}

/** 色ごとに 形を まとめる（たくさんの 区切りを 1 つの 輪に する時。名前つきは まとめない） */
export function mergeByColor(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true)
  const by = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>()
  const keep: THREE.Object3D[] = []
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    if (o.name || Array.isArray(m.material)) {
      keep.push(o)
      return
    }
    const mat = m.material as THREE.MeshLambertMaterial
    const key = mat.type + (mat.color ? mat.color.getHexString() : '') + (mat.map ? 'm' : '')
    const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(o.matrixWorld)
    for (const a of Object.keys(geo.attributes)) if (a !== 'position' && a !== 'normal' && a !== 'uv') geo.deleteAttribute(a)
    const e = by.get(key)
    if (e) e.geos.push(geo)
    else by.set(key, { mat, geos: [geo] })
  })
  const out = new THREE.Group()
  for (const { mat, geos } of by.values()) {
    const merged = mergeGeometries(geos)
    for (const g of geos) g.dispose()
    if (merged) out.add(new THREE.Mesh(merged, mat))
  }
  for (const o of keep) {
    const m = o as THREE.Mesh
    const n = new THREE.Mesh(m.geometry.clone().applyMatrix4(o.matrixWorld), m.material)
    n.name = o.name
    out.add(n)
  }
  return out
}
