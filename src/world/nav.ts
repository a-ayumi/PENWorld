/**
 * 歩ける所の升目と、道さがし（計画 D）。
 *
 * - 箱庭を 0.5 マスの升目に分け、1 マスずつ「ふさがっている（物・木・岩・建物）」「水」「高さ」を持つ。
 * - 道さがしは A*（8 方向・角の すり抜けなし）。高さが CLIFF より大きく ちがう隣へは進めない（崖）。
 *   泳げる・浮ける子は水も通れる。
 * - 見つけた道は「見通しのきく所まで飛ばす」で角を減らして返す（ぎざぎざ歩かない）。
 * - 物の置き方が変わった時だけ作り直す（World.obstacles() の中身が変わった時）。
 */
export interface Circle {
  x: number
  z: number
  r: number
  water?: boolean
}

/** 隣の升目（0.5 マス）へ のぼれる高さの差。これより高い段差は のぼれない（崖） */
export const CLIFF = 0.75
/** とびおりられる高さの差（降りるのは のぼるより ずっと楽） */
export const DROP = 1.7
const SOLID = 1
const WATER = 2

export class NavGrid {
  readonly cell = 0.5
  readonly n: number
  readonly half: number
  readonly flags: Uint8Array
  readonly h: Float32Array
  /** 道さがしの作業用（毎回 new しない） */
  private readonly g: Float32Array
  private readonly from: Int32Array
  private readonly seen: Uint16Array
  private stamp = 1
  private readonly heap: Int32Array
  /** 待ち行列に入れた時の点数（あとで f が書きかわっても 並びがくずれないように、入れた時の値を持つ） */
  private readonly heapF: Float32Array
  private readonly f: Float32Array

  constructor(size: number, heightAt: (x: number, z: number) => number) {
    this.half = size / 2
    this.n = Math.ceil(size / this.cell)
    const N = this.n * this.n
    this.flags = new Uint8Array(N)
    this.h = new Float32Array(N)
    this.g = new Float32Array(N)
    this.f = new Float32Array(N)
    this.from = new Int32Array(N)
    this.seen = new Uint16Array(N)
    this.heap = new Int32Array(N * 8)
    this.heapF = new Float32Array(N * 8)
    for (let j = 0; j < this.n; j++)
      for (let i = 0; i < this.n; i++) {
        const { x, z } = this.center(i, j)
        this.h[j * this.n + i] = heightAt(x, z)
      }
  }

  center(i: number, j: number) {
    return { x: -this.half + (i + 0.5) * this.cell, z: -this.half + (j + 0.5) * this.cell }
  }
  cellOf(x: number, z: number) {
    const i = Math.min(this.n - 1, Math.max(0, Math.floor((x + this.half) / this.cell)))
    const j = Math.min(this.n - 1, Math.max(0, Math.floor((z + this.half) / this.cell)))
    return { i, j, k: j * this.n + i }
  }

  /** 物の置き方から ふさがっている升目を作り直す（margin = 体の半径） */
  rebuild(obs: Circle[], margin = 0.2) {
    this.flags.fill(0)
    for (const o of obs) {
      const r = o.r + margin
      const a = this.cellOf(o.x - r, o.z - r)
      const b = this.cellOf(o.x + r, o.z + r)
      for (let j = a.j; j <= b.j; j++)
        for (let i = a.i; i <= b.i; i++) {
          const c = this.center(i, j)
          if (Math.hypot(c.x - o.x, c.z - o.z) <= r) this.flags[j * this.n + i] |= o.water ? WATER : SOLID
        }
    }
  }

  private open(k: number, swim: boolean) {
    const f = this.flags[k]
    return !(f & SOLID) && (swim || !(f & WATER))
  }
  /** その点に立てるか */
  standable(x: number, z: number, swim: boolean) {
    return this.open(this.cellOf(x, z).k, swim)
  }
  /** a の升目から b の升目へ 1 歩で行けるか（のぼりは CLIFF まで・とびおりは DROP まで） */
  step(ka: number, kb: number) {
    const d = this.h[kb] - this.h[ka]
    return d <= CLIFF && d >= -DROP
  }
  /** まわりの 8 マスの どこへも行けない（はまっている）か */
  trapped(k: number, swim: boolean) {
    const i0 = k % this.n
    const j0 = (k - i0) / this.n
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const i = i0 + di
        const j = j0 + dj
        if ((!di && !dj) || i < 0 || j < 0 || i >= this.n || j >= this.n) continue
        const nk = j * this.n + i
        if (this.open(nk, swim) && this.step(k, nk)) return false
      }
    return true
  }

  /** 2 点のあいだを まっすぐ歩けるか（0.25 マスごとに見る） */
  lineClear(ax: number, az: number, bx: number, bz: number, swim: boolean) {
    const d = Math.hypot(bx - ax, bz - az)
    const steps = Math.max(1, Math.ceil(d / 0.25))
    let prev = this.cellOf(ax, az).k
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      const k = this.cellOf(ax + (bx - ax) * t, az + (bz - az) * t).k
      if (k === prev) continue
      if (!this.open(k, swim) || !this.step(prev, k)) return false
      prev = k
    }
    return true
  }

  /**
   * 道さがし。見つかれば 曲がり角だけの点の列（最後は目的地）、見つからなければ null。
   * 目的地がふさがっていたら、いちばん近い 立てる升目を目的地にする。
   * maxNodes で 調べる数に上限（重くならないように）。
   */
  findPath(sx: number, sz: number, tx: number, tz: number, swim: boolean, maxNodes = 14000): { x: number; z: number }[] | null {
    const n = this.n
    const s = this.cellOf(sx, sz)
    let t = this.cellOf(tx, tz)
    if (!this.open(t.k, swim)) {
      const alt = this.nearestOpen(t.i, t.j, swim)
      if (!alt) return null
      t = alt
    }
    if (++this.stamp > 65000) {
      this.stamp = 1
      this.seen.fill(0)
    }
    const st = this.stamp
    const heap = this.heap
    const hf = this.heapF
    const cap = heap.length
    let hn = 0
    const swap = (a: number, b: number) => {
      const k = heap[a]
      heap[a] = heap[b]
      heap[b] = k
      const f = hf[a]
      hf[a] = hf[b]
      hf[b] = f
    }
    const push = (k: number) => {
      if (hn >= cap) return
      let i = hn++
      heap[i] = k
      hf[i] = this.f[k]
      while (i > 0) {
        const p = (i - 1) >> 1
        if (hf[p] <= hf[i]) break
        swap(p, i)
        i = p
      }
    }
    const pop = () => {
      const top = heap[0]
      const topF = hf[0]
      hn--
      heap[0] = heap[hn]
      hf[0] = hf[hn]
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < hn && hf[l] < hf[m]) m = l
        if (r < hn && hf[r] < hf[m]) m = r
        if (m === i) break
        swap(m, i)
        i = m
      }
      return { k: top, f: topF }
    }
    const hEst = (i: number, j: number) => {
      const dx = Math.abs(i - t.i)
      const dj = Math.abs(j - t.j)
      return Math.max(dx, dj) + 0.414 * Math.min(dx, dj)
    }
    this.seen[s.k] = st
    this.g[s.k] = 0
    this.f[s.k] = hEst(s.i, s.j)
    this.from[s.k] = -1
    push(s.k)
    let found = -1
    let count = 0
    while (hn > 0 && count++ < maxNodes) {
      const top = pop()
      const k = top.k
      // 古い（あとで もっと良い点数で入れなおした）ものは とばす
      if (top.f > this.f[k] + 1e-6) continue
      if (k === t.k) {
        found = k
        break
      }
      const ci = k % n
      const cj = (k - ci) / n
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue
          const ni = ci + di
          const nj = cj + dj
          if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue
          const nk = nj * n + ni
          if (!this.open(nk, swim) || !this.step(k, nk)) continue
          // ななめは 両どなりが通れる時だけ（角を すり抜けない）
          if (di && dj && (!this.open(cj * n + ni, swim) || !this.open(nj * n + ci, swim))) continue
          const ng = this.g[k] + (di && dj ? 1.414 : 1) + Math.max(0, this.h[nk] - this.h[k]) * 2
          if (this.seen[nk] === st && ng >= this.g[nk]) continue
          this.seen[nk] = st
          this.g[nk] = ng
          this.f[nk] = ng + hEst(ni, nj)
          this.from[nk] = k
          push(nk)
        }
    }
    if (found < 0) return null
    // 升目の列 → 見通しのきく所まで飛ばして、曲がり角だけにする
    const cells: number[] = []
    for (let k = found; k >= 0; k = this.from[k]) cells.push(k)
    cells.reverse()
    const pts = cells.map((k) => this.center(k % n, Math.floor(k / n)))
    const out: { x: number; z: number }[] = []
    let ax = sx
    let az = sz
    let i = 0
    while (i < pts.length - 1) {
      let j = pts.length - 1
      while (j > i + 1 && !this.lineClear(ax, az, pts[j].x, pts[j].z, swim)) j--
      out.push(pts[j])
      ax = pts[j].x
      az = pts[j].z
      i = j
    }
    // 最後は 本当の目的地（立てるなら）
    if (this.open(this.cellOf(tx, tz).k, swim)) {
      if (out.length) out[out.length - 1] = { x: tx, z: tz }
      else out.push({ x: tx, z: tz })
    }
    return out
  }

  /** ふさがった升目のまわりで いちばん近い 立てる升目 */
  private nearestOpen(i0: number, j0: number, swim: boolean) {
    for (let r = 1; r < 8; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue
          const i = i0 + di
          const j = j0 + dj
          if (i < 0 || j < 0 || i >= this.n || j >= this.n) continue
          const k = j * this.n + i
          if (this.open(k, swim)) return { i, j, k }
        }
    return null
  }
}
