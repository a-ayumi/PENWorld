import * as THREE from 'three'

/**
 * ドットマトリクス液晶の描画。
 * - 32×16 ドット + 上下 4 個ずつのアイコン（印刷セグメント風）
 * - 点灯/消灯に応答遅れ（残像）を付け、ドットの影を背面に落とす
 */
export const COLS = 32
export const ROWS = 16

const W = 720
const H = 490
const PITCH = 20
const DOT = 17
const OX = (W - COLS * PITCH) / 2 + (PITCH - DOT) / 2
const OY = 86

// 液晶の色（ドット ON / OFF / 背景）
const LCD_BG_TOP = '#b3bea3'
const LCD_BG_BOTTOM = '#9eab8f'
const ON: [number, number, number] = [28, 38, 26]
const OFF: [number, number, number] = [160, 172, 146]

type Bitmap = string[]

/** アイコン（オリジナルの 9×9 ドット） */
const ICONS: Bitmap[] = [
  // ごはん
  ['..#.#.#..', '...#.#...', '.........', '#########', '#.......#', '#.......#', '.#.....#.', '..#####..', '...###...'],
  // トレーニング
  ['.........', '##.....##', '##.....##', '##.....##', '#########', '##.....##', '##.....##', '##.....##', '.........'],
  // バトル
  ['....#....', '#...#...#', '.#.###.#.', '..#####..', '#########', '..#####..', '.#.###.#.', '#...#...#', '....#....'],
  // ステータス
  ['.##...##.', '####.####', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....', '.........'],
  // ライト
  ['...###...', '..#...#..', '.#.....#.', '.#.....#.', '.#.....#.', '..#...#..', '...###...', '...###...', '....#....'],
  // おそうじ
  ['....#....', '....#....', '...###...', '..#####..', '..#####..', '.#######.', '.#######.', '..#####..', '...###...'],
  // つうしん
  ['......#..', '.......#.', '#########', '.......#.', '..#...#..', '.#.......', '#########', '.#.......', '..#......'],
  // よびだし
  ['...###...', '..#####..', '..#####..', '..#####..', '...###...', '...###...', '.........', '...###...', '...###...'],
]

/** 3×5 の数字フォント（時計表示用） */
const DIGITS: Bitmap[] = [
  ['###', '#.#', '#.#', '#.#', '###'], ['.#.', '##.', '.#.', '.#.', '###'], ['###', '..#', '###', '#..', '###'],
  ['###', '..#', '###', '..#', '###'], ['#.#', '#.#', '###', '..#', '..#'], ['###', '#..', '###', '..#', '###'],
  ['###', '#..', '###', '#.#', '###'], ['###', '..#', '.#.', '.#.', '.#.'], ['###', '#.#', '###', '#.#', '###'],
  ['###', '#.#', '###', '..#', '###'],
]

export class LCD {
  readonly canvas = document.createElement('canvas')
  readonly texture: THREE.CanvasTexture
  private readonly ctx: CanvasRenderingContext2D
  private readonly backdrop: HTMLCanvasElement
  /** 書き込み先（0/1） */
  private readonly target = new Uint8Array(COLS * ROWS)
  /** 表示中の濃さ（残像付き） */
  private readonly level = new Float32Array(COLS * ROWS)
  private readonly iconLevel = new Float32Array(8)
  readonly iconOn = new Array<boolean>(8).fill(false)

  constructor() {
    this.canvas.width = W
    this.canvas.height = H
    this.ctx = this.canvas.getContext('2d')!
    this.backdrop = this.makeBackdrop()
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.anisotropy = 8
  }

  /** 液晶の地（グラデーション + うっすらムラ） */
  private makeBackdrop() {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const g = c.getContext('2d')!
    const grad = g.createLinearGradient(0, 0, W * 0.3, H)
    grad.addColorStop(0, LCD_BG_TOP)
    grad.addColorStop(1, LCD_BG_BOTTOM)
    g.fillStyle = grad
    g.fillRect(0, 0, W, H)
    const img = g.getImageData(0, 0, W, H)
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 6
      img.data[i] += n
      img.data[i + 1] += n
      img.data[i + 2] += n
    }
    g.putImageData(img, 0, 0)
    // アイコン行とドット領域の境目に細い印刷ライン
    g.fillStyle = 'rgba(28,38,26,0.12)'
    g.fillRect(24, OY - 10, W - 48, 2)
    g.fillRect(24, OY + ROWS * PITCH + 6, W - 48, 2)
    return c
  }

  clear() {
    this.target.fill(0)
  }

  set(x: number, y: number, on = true) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return
    this.target[y * COLS + x] = on ? 1 : 0
  }

  /** '#' が点灯のビットマップを描く。flip で左右反転 */
  blit(bmp: Bitmap, x: number, y: number, flip = false) {
    const w = bmp[0].length
    for (let j = 0; j < bmp.length; j++)
      for (let i = 0; i < w; i++) if (bmp[j][flip ? w - 1 - i : i] === '#') this.set(x + i, y + j)
  }

  drawTime(h: number, m: number, colon: boolean) {
    const s = `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`
    const x0 = 7
    const y0 = 5
    ;[0, 1, 2, 3].forEach((k) => this.blit(DIGITS[Number(s[k])], x0 + k * 4 + (k >= 2 ? 3 : 0), y0))
    if (colon) {
      this.set(x0 + 8 + 1, y0 + 1)
      this.set(x0 + 8 + 1, y0 + 3)
    }
  }

  update(dt: number) {
    // 液晶の応答速度：点くのは速く、消えるのはゆっくり
    const up = Math.min(1, dt * 22)
    const down = Math.min(1, dt * 8)
    for (let i = 0; i < this.level.length; i++) {
      const t = this.target[i]
      this.level[i] += (t - this.level[i]) * (t ? up : down)
    }
    for (let i = 0; i < 8; i++) {
      const t = this.iconOn[i] ? 1 : 0
      this.iconLevel[i] += (t - this.iconLevel[i]) * (t ? up : down)
    }
    this.paint()
  }

  private dotColor(l: number) {
    const r = OFF[0] + (ON[0] - OFF[0]) * l
    const g = OFF[1] + (ON[1] - OFF[1]) * l
    const b = OFF[2] + (ON[2] - OFF[2]) * l
    return `rgb(${r | 0},${g | 0},${b | 0})`
  }

  private paint() {
    const c = this.ctx
    c.drawImage(this.backdrop, 0, 0)

    // ドットの影（液晶の層の奥に落ちる影）
    c.fillStyle = 'rgba(20,30,18,0.2)'
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const l = this.level[y * COLS + x]
        if (l < 0.05) continue
        c.globalAlpha = l
        c.fillRect(OX + x * PITCH + 3, OY + y * PITCH + 4, DOT, DOT)
      }
    c.globalAlpha = 1

    // ドット本体（消灯ドットもうっすら見える）
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const l = this.level[y * COLS + x]
        c.fillStyle = this.dotColor(0.07 + l * 0.93)
        c.fillRect(OX + x * PITCH, OY + y * PITCH, DOT, DOT)
      }

    // アイコン（上 4 / 下 4）
    for (let i = 0; i < 8; i++) {
      const col = i % 4
      const top = i < 4
      const cx = 90 + col * 180
      const cy = top ? 42 : H - 40
      this.paintIcon(ICONS[i], cx, cy, this.iconLevel[i])
    }
  }

  private paintIcon(bmp: Bitmap, cx: number, cy: number, l: number) {
    const c = this.ctx
    const p = 6
    const s = 5
    const x0 = cx - (9 * p) / 2
    const y0 = cy - (9 * p) / 2
    for (const pass of [0, 1]) {
      for (let j = 0; j < 9; j++)
        for (let i = 0; i < 9; i++) {
          if (bmp[j][i] !== '#') continue
          if (pass === 0) {
            if (l < 0.05) continue
            c.fillStyle = `rgba(20,30,18,${0.2 * l})`
            c.fillRect(x0 + i * p + 2, y0 + j * p + 3, s, s)
          } else {
            c.fillStyle = this.dotColor(0.1 + l * 0.9)
            c.fillRect(x0 + i * p, y0 + j * p, s, s)
          }
        }
    }
  }

  /** 表示を毎フレーム GPU へ送る */
  commit() {
    this.texture.needsUpdate = true
  }
}
