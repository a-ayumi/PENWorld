import * as THREE from 'three'
import { psx } from './psx'

/**
 * ふみかためた 道（けものみち）。
 *
 * なかまが 歩くと、足もとの 1 マスの 升目に「ふんだ 数」が たまる（`tread()`、0.5 秒に 1 回）。
 * たくさん ふまれた 升目は 土の 道に なり（うすい 道 → はっきりした 道）、道の 上は すこし 速く 歩ける。
 * 歩かなくなった 所は ゆっくり 草に もどる（`decay()`）。だれも 道を 決めていないのに、
 * 家と 畑と 森の あいだに 道が できていく（アリの 巣の 通り道と 同じ しくみ）。
 */
export const PATH_CELL = 1
/** うすい 道 / はっきりした 道 に なる ふんだ 数 */
export const PATH_FAINT = 12
export const PATH_CLEAR = 40
const CAP = 220
const key = (ix: number, iz: number) => (ix + 1024) * 2048 + (iz + 1024)
const unkey = (k: number) => [Math.floor(k / 2048) - 1024, (k % 2048) - 1024]

export class Paths {
  traffic = new Map<number, number>()
  mesh: THREE.Mesh | null = null
  private sig = ''
  private mat: THREE.Material | null = null

  /** その 場所の 道の 段（0 = 草 / 1 = うすい 道 / 2 = はっきりした 道） */
  level(x: number, z: number) {
    const v = this.traffic.get(key(Math.floor(x / PATH_CELL), Math.floor(z / PATH_CELL))) ?? 0
    return v >= PATH_CLEAR ? 2 : v >= PATH_FAINT ? 1 : 0
  }

  tread(x: number, z: number) {
    const k = key(Math.floor(x / PATH_CELL), Math.floor(z / PATH_CELL))
    this.traffic.set(k, Math.min(CAP, (this.traffic.get(k) ?? 0) + 1))
  }

  /** 30 秒ごと：ふまれない 所は すこしずつ 草に もどる（半分に なるまで 45 分 ほど） */
  decay() {
    for (const [k, v] of this.traffic) {
      const n = v * 0.992
      if (n < 1) this.traffic.delete(k)
      else this.traffic.set(k, n)
    }
  }

  /** 道の 形を 作りなおす（段が かわった 升目が ある時だけ）。skip = 家や 水の 上など 道を 描かない 所 */
  rebuild(scene: THREE.Scene, heightAt: (x: number, z: number) => number, skip: (x: number, z: number) => boolean) {
    const cells: [number, number, number][] = []
    for (const [k, v] of this.traffic) {
      if (v < PATH_FAINT) continue
      const [ix, iz] = unkey(k)
      cells.push([ix, iz, v >= PATH_CLEAR ? 2 : 1])
    }
    const sig = cells.map((c) => c.join(',')).sort().join(';')
    if (sig === this.sig) return
    this.sig = sig
    if (this.mesh) {
      scene.remove(this.mesh)
      this.mesh.geometry.dispose()
      this.mesh = null
    }
    if (!cells.length) return
    const pos: number[] = []
    const col: number[] = []
    const faint = new THREE.Color('#9a8156')
    const clear = new THREE.Color('#7a6142')
    const tmp = new THREE.Color()
    for (const [ix, iz, lv] of cells) {
      const cx = (ix + 0.5) * PATH_CELL
      const cz = (iz + 0.5) * PATH_CELL
      if (skip(cx, cz)) continue
      // となりも 道なら つながるように 大きめ・うすい 道は 小さめで まだら
      const r = (lv === 2 ? 0.78 : 0.56) * PATH_CELL
      const jx = (((ix * 73856093) ^ (iz * 19349663)) & 255) / 255 - 0.5
      const jz = (((ix * 83492791) ^ (iz * 2971215)) & 255) / 255 - 0.5
      const x0 = cx + jx * 0.18
      const z0 = cz + jz * 0.18
      const a = (jx + jz) * 0.8
      // ひし形を すこし まわした 4 点 + まんなか（でこぼこの 地面に そわせる）
      const pts: [number, number][] = []
      for (let i = 0; i < 6; i++) {
        const t = a + (i / 6) * Math.PI * 2
        const rr = r * (0.85 + 0.3 * ((((ix + i) * 2654435761) >>> 0) % 100) / 100)
        pts.push([x0 + Math.cos(t) * rr, z0 + Math.sin(t) * rr])
      }
      const y = (x: number, z: number) => heightAt(x, z) + 0.035
      tmp.copy(lv === 2 ? clear : faint).offsetHSL(0, 0, jx * 0.04)
      const cy = y(x0, z0)
      for (let i = 0; i < 6; i++) {
        const [ax, az] = pts[i]
        const [bx, bz] = pts[(i + 1) % 6]
        pos.push(x0, cy, z0, bx, y(bx, bz), bz, ax, y(ax, az), az)
        for (let k = 0; k < 3; k++) col.push(tmp.r, tmp.g, tmp.b)
      }
    }
    if (!pos.length) return
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.computeVertexNormals()
    this.mat ??= psx(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { ground: true, snow: true })
    this.mesh = new THREE.Mesh(g, this.mat)
    this.mesh.receiveShadow = true
    this.mesh.name = 'paths'
    scene.add(this.mesh)
  }

  /** セーブ：ふんだ 数が 5 より 多い 升目だけ（[x, z, 数] の 列） */
  save(): number[] {
    const out: number[] = []
    for (const [k, v] of this.traffic) {
      if (v < 5) continue
      const [ix, iz] = unkey(k)
      out.push(ix, iz, Math.round(v))
    }
    return out
  }

  load(d: unknown) {
    this.traffic.clear()
    this.sig = ''
    if (!Array.isArray(d)) return
    for (let i = 0; i + 2 < d.length && i < 3 * 4000; i += 3) {
      const [ix, iz, v] = [d[i], d[i + 1], d[i + 2]]
      if (![ix, iz, v].every((n) => typeof n === 'number' && Number.isFinite(n))) continue
      if (Math.abs(ix) > 1000 || Math.abs(iz) > 1000) continue
      this.traffic.set(key(Math.round(ix), Math.round(iz)), Math.max(0, Math.min(CAP, v)))
    }
  }

  clear(scene: THREE.Scene) {
    this.traffic.clear()
    this.sig = ''
    if (this.mesh) {
      scene.remove(this.mesh)
      this.mesh.geometry.dispose()
      this.mesh = null
    }
  }
}
