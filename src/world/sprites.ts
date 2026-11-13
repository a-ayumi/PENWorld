import * as THREE from 'three'
import { psx } from './psx'

/** キャンバスに描いた絵 → アルファ 2 値化 → 色付きアウトライン */
export const PAD = 2
type Draw = (g: CanvasRenderingContext2D) => void

export interface PixelOpts {
  /** 左上から光が当たる想定で、ふちに明暗・網点の影・足元の暗がりを自動で付ける */
  shade?: boolean
}

export function pixelSprite(w: number, h: number, draw: Draw, outline = '#1a1530', opts: PixelOpts = {}): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w + PAD * 2
  c.height = h + PAD * 2
  // 何度も getImageData で読むので、CPU 側で持つ（色ちがい・もよう・陰影・輪郭のため）
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.translate(PAD, PAD)
  draw(g)
  const W = c.width
  const H = c.height
  const img = g.getImageData(0, 0, W, H)
  const d = img.data
  const solid = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) {
    if (d[i * 4 + 3] >= 128) {
      solid[i] = 1
      d[i * 4 + 3] = 255
    } else d[i * 4 + 3] = 0
  }
  const S = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && solid[y * W + x] === 1
  if (opts.shade) {
    // 立体の陰影：ふちからの距離で「ふくらみ」を作り、左上の光で 4 段にぬる。
    // 影は 色相を 寒色（青むらさき）へ、光は 暖色へ ずらす（ただ暗く・明るくするより ドット絵らしい）
    const R = 7
    const D = new Float32Array(W * H)
    for (let i = 0; i < W * H; i++) D[i] = solid[i] ? 99 : 0
    const relax = (x: number, y: number, ox: number, oy: number, c: number) => {
      const xx = x + ox
      const yy = y + oy
      const v = (xx < 0 || yy < 0 || xx >= W || yy >= H ? 0 : D[yy * W + xx]) + c
      if (v < D[y * W + x]) D[y * W + x] = v
    }
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!solid[y * W + x]) continue
        relax(x, y, -1, 0, 1); relax(x, y, 0, -1, 1); relax(x, y, -1, -1, 1.414); relax(x, y, 1, -1, 1.414)
      }
    for (let y = H - 1; y >= 0; y--)
      for (let x = W - 1; x >= 0; x--) {
        if (!solid[y * W + x]) continue
        relax(x, y, 1, 0, 1); relax(x, y, 0, 1, 1); relax(x, y, 1, 1, 1.414); relax(x, y, -1, 1, 1.414)
      }
    const dAt = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : Math.min(R, D[y * W + x]))
    const src = new Uint8ClampedArray(d)
    const LX = -0.6
    const LY = -0.8
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        if (!solid[i]) continue
        const gx = (dAt(x + 2, y) - dAt(x - 2, y)) / 4
        const gy = (dAt(x, y + 2) - dAt(x, y - 2)) / 4
        // 光の当たりぐあい（+ = 光の側のふち、- = 影の側のふち、まんなかは 0）
        const v = -(gx * LX + gy * LY)
        const dist = D[i]
        let r = src[i * 4]
        let gch = src[i * 4 + 1]
        let b = src[i * 4 + 2]
        const dark = r + gch + b < 150
        if (v > 0.42 && dist <= 3.2 && !dark) {
          // ふちの光（あたたかく）
          r = r * 1.14 + 12; gch = gch * 1.1 + 8; b = b * 0.98 + 2
        } else if (v < -0.62 && dist <= 3.4) {
          // 深い影（寒色へ）
          r *= 0.58; gch *= 0.56; b = b * 0.74 + 6
        } else if (v < -0.3 && (dist <= 5.2 || (x + y) % 2 === 0)) {
          // 影（外がわは べた・内がわは 網点で ぼかす）
          r *= 0.78; gch *= 0.76; b = b * 0.88 + 3
        }
        // 足元の暗がり
        if (!S(x, y + 2) && S(x, y - 2)) { r *= 0.88; gch *= 0.86; b *= 0.92 }
        d[i * 4] = r
        d[i * 4 + 1] = gch
        d[i * 4 + 2] = b
      }
  }
  if (outline) {
    const n = parseInt(outline.slice(1), 16)
    const or = (n >> 16) & 255
    const og = (n >> 8) & 255
    const ob = n & 255
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        if (solid[i]) continue
        const nb = [i - 1, i + 1, i - W, i + W].find((j, q) => (q === 0 ? x > 0 : q === 1 ? x < W - 1 : q === 2 ? y > 0 : y < H - 1) && solid[j])
        if (nb === undefined) continue
        if (opts.shade) {
          // 色付きの輪郭：隣の色を暗くして基本の輪郭色と混ぜる
          // 輪郭の強弱：光の側（左・上）は 体の色に近く うすく、影の側（右・下）は こく
          const q = [i - 1, i + 1, i - W, i + W].indexOf(nb)
          const lit = q === 1 || q === 3
          const kn = lit ? 0.5 : 0.24
          const ko = lit ? 0.34 : 0.56
          d[i * 4] = d[nb * 4] * kn + or * ko
          d[i * 4 + 1] = d[nb * 4 + 1] * kn + og * ko
          d[i * 4 + 2] = d[nb * 4 + 2] * kn + ob * ko
        } else {
          d[i * 4] = or
          d[i * 4 + 1] = og
          d[i * 4 + 2] = ob
        }
        d[i * 4 + 3] = 255
      }
  }
  g.putImageData(img, 0, 0)
  return c
}

export interface AnimDef { frames: number[]; fps: number; loop: boolean }
export interface Sheet {
  texture: THREE.Texture; cols: number; rows: number; cellW: number; cellH: number; footPx: number
  anims: Record<string, AnimDef>
}

/** 1 行目 = 右向き、2 行目 = 左右反転 */
export function buildSheet(frames: HTMLCanvasElement[], anims: Record<string, AnimDef>, mirror = true): Sheet {
  const cellW = Math.max(...frames.map((f) => f.width))
  const cellH = Math.max(...frames.map((f) => f.height))
  const rows = mirror ? 2 : 1
  const atlas = document.createElement('canvas')
  atlas.width = cellW * frames.length
  atlas.height = cellH * rows
  const g = atlas.getContext('2d')!
  frames.forEach((f, i) => {
    const ox = i * cellW + Math.floor((cellW - f.width) / 2)
    const oy = cellH - f.height
    g.drawImage(f, ox, oy)
    if (mirror) {
      g.save()
      g.translate(i * cellW + cellW, cellH)
      g.scale(-1, 1)
      g.drawImage(f, Math.floor((cellW - f.width) / 2), oy)
      g.restore()
    }
  })
  const tex = new THREE.CanvasTexture(atlas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  return { texture: tex, cols: frames.length, rows, cellW, cellH, footPx: PAD - 1, anims }
}

/** 3D 空間に立つ 2D キャラ（足元が原点、alphaTest で不透明描画） */
export class SpriteAnim {
  readonly sprite: THREE.Sprite
  readonly material: THREE.SpriteMaterial
  private readonly tex: THREE.Texture
  private current = ''
  private time = 0
  facing: 1 | -1 = 1
  private sheet: Sheet

  constructor(sheet: Sheet, private height: number, initial?: string) {
    this.sheet = sheet
    this.tex = sheet.texture.clone()
    this.tex.needsUpdate = true
    this.material = psx(new THREE.SpriteMaterial({ map: this.tex, alphaTest: 0.5, transparent: false, fog: true }))
    this.sprite = new THREE.Sprite(this.material)
    this.applySheet()
    this.play(initial ?? Object.keys(sheet.anims)[0], true)
    this.update(0)
  }

  private applySheet() {
    const s = this.sheet
    this.tex.repeat.set(1 / s.cols, 1 / s.rows)
    this.sprite.center.set(0.5, s.footPx / s.cellH)
    this.setHeight(this.height)
  }

  /** 進化などで見た目ごと差し替える */
  setSheet(sheet: Sheet, height: number) {
    this.sheet = sheet
    this.height = height
    this.tex.image = sheet.texture.image
    this.tex.needsUpdate = true
    this.applySheet()
    this.play(this.current in sheet.anims ? this.current : 'idle', true)
  }

  setHeight(h: number) {
    this.sprite.scale.set((h * this.sheet.cellW) / this.sheet.cellH, h, 1)
  }

  has(name: string) {
    return name in this.sheet.anims
  }

  play(name: string, restart = false) {
    if (!(name in this.sheet.anims)) name = 'idle'
    if (name === this.current && !restart) return
    this.current = name
    this.time = 0
  }

  update(dt: number) {
    this.time += dt
    const a = this.sheet.anims[this.current]
    let i = Math.floor(this.time * a.fps)
    i = a.loop ? i % a.frames.length : Math.min(i, a.frames.length - 1)
    const row = this.facing === -1 && this.sheet.rows > 1 ? 1 : 0
    this.tex.offset.set(a.frames[i] / this.sheet.cols, 1 - (row + 1) / this.sheet.rows)
  }

  dispose() {
    this.tex.dispose()
    this.material.dispose()
  }
}

/** 小さなアイコン系スプライト（ハート・キラキラ・Zzz など）を作る */
export function iconSheet(bmp: string[], palette: Record<string, string>): Sheet {
  const w = bmp[0].length
  const h = bmp.length
  const f = pixelSprite(w, h, (g) => {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const ch = bmp[y][x]
        if (ch === '.') continue
        g.fillStyle = palette[ch]
        g.fillRect(x, y, 1, 1)
      }
  })
  return buildSheet([f], { idle: { frames: [0], fps: 1, loop: true } }, false)
}
