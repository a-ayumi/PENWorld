import { COLS, LCD } from './lcd'

/**
 * 液晶の中のペット（オリジナルデザイン：頭に芽が生えた丸いいきもの「メブ」）。
 * 16×16 ドット、2 コマで歩き回る。
 */
const BASE = [
  '................',
  '.......#.#......',
  '........#.......',
  '.....######.....',
  '....#......#....',
  '...#........#...',
  '...#.....#.#.#..',
  '..#......#.#..#.',
  '..#...........#.',
  '..#.##....##..#.',
  '..#.......##..#.',
  '...#.........#..',
  '....#.......#...',
  '.....#######....',
  '.....#.....#....',
  '....##....##....',
]
// 2 コマ目：体が 1 ドット沈む（足を縮める）
const SQUASH = [BASE[0], BASE[0], ...BASE.slice(1, 14), BASE[15]]
// まばたき
const BLINK = BASE.map((r, i) => (i === 6 || i === 7 ? r.replace(/#\.#/g, '...').replace(/\.#\.#\.#/, '.....##') : r))

const SPARK = ['.#.', '###', '.#.']

export class Pet {
  x = 8
  private y = 0
  private facing: 1 | -1 = -1
  private t = 0
  private step = 0
  private hop = 0
  private blink = 0
  private happy = 0

  update(dt: number) {
    this.t += dt
    if (this.blink > 0) this.blink -= dt
    if (this.happy > 0) this.happy -= dt
    if (this.t < 0.5) return
    this.t = 0
    this.step++

    if (this.happy > 0) {
      // うれしい時はその場でぴょんぴょん
      this.hop = this.step % 2 ? 2 : 0
      return
    }
    this.hop = 0
    const r = Math.random()
    if (r < 0.12) this.facing = this.facing === 1 ? -1 : 1
    else if (r < 0.75) this.x += this.facing * (Math.random() < 0.3 ? 2 : 1)
    else if (r < 0.82) this.hop = 1
    if (Math.random() < 0.08) this.blink = 0.18
    if (this.x <= 1) {
      this.x = 1
      this.facing = 1
    } else if (this.x >= COLS - 17) {
      this.x = COLS - 17
      this.facing = -1
    }
  }

  cheer() {
    this.happy = 2
    this.step = 0
  }

  draw(lcd: LCD) {
    const frame = this.blink > 0 ? BLINK : this.step % 2 ? SQUASH : BASE
    // 元絵は左向き。右へ進むときは反転
    lcd.blit(frame, this.x, this.y - this.hop, this.facing === 1)
    if (this.happy > 0) {
      const on = this.step % 2 === 0
      if (on) {
        lcd.blit(SPARK, this.x - 2, 2)
        lcd.blit(SPARK, this.x + 16, 4)
      } else {
        lcd.blit(SPARK, this.x - 1, 6)
        lcd.blit(SPARK, this.x + 15, 1)
      }
    }
  }
}
