import * as THREE from 'three'
import { fxU } from './fx'
import { psx } from './psx'
import { waterSurface } from './fxprops'

/**
 * 水べの 下ごしらえ（2026-11-16・SpriteCook の 記事「pixel art pond with reflections and ripples」の 考え方）。
 *
 * ステージを 読んだ 時に 1 回だけ、世界の 上に 0.5 マスの 升目を はって 1 まいの テクスチャに 焼く：
 * - R = 岸からの 距離（水の 中は ＋・陸は −。1/16 マス きざみ・±8 マス）。水の 色の 段・手前の 空の 明るさ・岸の 波・ぬれた 土に 使う
 * - G / B = 木の 葉の いちばん 上 / いちばん 下の 高さ（木の 映りこみを 水の シェーダーが 後ろへ たどって 探す）
 * - A = 255 なら 池や 川（ふつうの 水）・0 なら 海
 * 水の かたちは ステージの 中の 水面（`waterSurface()` の 材質に `userData.water`）と 地面の 高さから 決める。
 * あわせて 岸に あし（がまの ほ）・池に はすの 葉を 置く（`props`）。
 */
export const POND_CELL = 0.5
const SD_SCALE = 16
const H_SCALE = 12

export interface PondBake {
  tex: THREE.DataTexture
  props: THREE.Group
}


export function bakePond(group: THREE.Object3D, heightAt: (x: number, z: number) => number, size: number, high: boolean): PondBake {
  group.updateMatrixWorld(true)
  const half = size / 2 + 4
  const N = Math.ceil((half * 2) / POND_CELL)
  const x0 = -half
  const z0 = -half
  const level = new Float32Array(N * N).fill(-Infinity)
  const fresh = new Uint8Array(N * N)
  const inv = new THREE.Matrix4()
  const p = new THREE.Vector3()
  const box = new THREE.Box3()
  const hCache = new Float32Array(N * N).fill(NaN)
  const hAt = (i: number, j: number) => {
    const k = j * N + i
    if (Number.isNaN(hCache[k])) hCache[k] = heightAt(x0 + (i + 0.5) * POND_CELL, z0 + (j + 0.5) * POND_CELL)
    return hCache[k]
  }
  // 1. 水の かたち：水面の 形の 中で、地面より 水が 高い 所
  const olds: THREE.Mesh[] = []
  group.traverse((o) => {
    const m = o as THREE.Mesh
    const mat = m.material as THREE.Material | undefined
    if (!m.isMesh || !mat?.userData?.water) return
    olds.push(m)
    const g = m.geometry as THREE.BufferGeometry & { parameters?: Record<string, number> }
    const par = g.parameters ?? {}
    box.setFromObject(m)
    inv.copy(m.matrixWorld).invert()
    const y = box.max.y
    const sea = !!mat.userData.sea
    const i0 = Math.max(0, Math.floor((box.min.x - x0) / POND_CELL))
    const i1 = Math.min(N - 1, Math.ceil((box.max.x - x0) / POND_CELL))
    const j0 = Math.max(0, Math.floor((box.min.z - z0) / POND_CELL))
    const j1 = Math.min(N - 1, Math.ceil((box.max.z - z0) / POND_CELL))
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        p.set(x0 + (i + 0.5) * POND_CELL, y, z0 + (j + 0.5) * POND_CELL).applyMatrix4(inv)
        const inside = par.radius !== undefined ? Math.hypot(p.x, p.z) <= par.radius : Math.abs(p.x) <= (par.width ?? 0) / 2 && Math.abs(p.z) <= (par.height ?? 0) / 2
        if (!inside) continue
        const k = j * N + i
        if (y <= level[k]) continue
        if (y > hAt(i, j) + 0.005) {
          level[k] = y
          fresh[k] = sea ? 0 : 255
        }
      }
  })
  // 2. 岸からの 距離（2 回の なめで ちかい 反対がわの 升目を 数える・ななめは √2）
  const wet = (k: number) => level[k] > -Infinity
  const dIn = chamfer(N, (k) => !wet(k))
  const dOut = chamfer(N, wet)
  // 3. 木の 高さ
  const top = new Uint8Array(N * N)
  const bot = new Uint8Array(N * N)
  const trees: { x: number; z: number; r: number; y0: number; y1: number }[] = []
  group.traverse((o) => {
    if (!o.userData.tree) return
    box.setFromObject(o)
    const h = box.max.y - box.min.y
    trees.push({ x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2, r: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2, y0: box.min.y + h * 0.32, y1: box.max.y })
  })
  for (const t of trees) {
    // 水べから 遠い 木は 映らない
    const ci = Math.floor((t.x - x0) / POND_CELL)
    const cj = Math.floor((t.z - z0) / POND_CELL)
    if (ci < 0 || cj < 0 || ci >= N || cj >= N || dOut[cj * N + ci] * POND_CELL > 9) continue
    const rr = Math.ceil(t.r / POND_CELL)
    for (let j = cj - rr; j <= cj + rr; j++)
      for (let i = ci - rr; i <= ci + rr; i++) {
        if (i < 0 || j < 0 || i >= N || j >= N) continue
        const d = Math.hypot(i - ci, j - cj) * POND_CELL
        if (d > t.r * 0.95) continue
        const k = j * N + i
        // まるい 葉の かたまり：ふちは 上と 下が せまく なる
        const f = Math.sqrt(1 - (d / t.r) ** 2)
        const mid = (t.y0 + t.y1) / 2
        const hh = ((t.y1 - t.y0) / 2) * (0.35 + 0.65 * f)
        top[k] = Math.max(top[k], Math.min(255, Math.round(((mid + hh) / H_SCALE) * 255)))
        const b = Math.max(1, Math.round(((mid - hh) / H_SCALE) * 255))
        bot[k] = bot[k] ? Math.min(bot[k], b) : b
      }
  }
  const data = new Uint8Array(N * N * 4)
  for (let k = 0; k < N * N; k++) {
    const sd = wet(k) ? dIn[k] * POND_CELL - POND_CELL / 2 : -(dOut[k] * POND_CELL - POND_CELL / 2)
    data[k * 4] = Math.max(0, Math.min(255, Math.round(128 + sd * SD_SCALE)))
    data[k * 4 + 1] = top[k]
    data[k * 4 + 2] = bot[k]
    data[k * 4 + 3] = wet(k) ? fresh[k] : nearFresh(k)
  }
  function nearFresh(k: number) {
    // 陸の 升目は となりの 水の 種類（ぬれた 土の 色を 海べと 池べで かえない ので 目安）
    const i = k % N
    const j = (k - i) / N
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di
      const b = j + dj
      if (a >= 0 && b >= 0 && a < N && b < N && wet(b * N + a)) return fresh[b * N + a]
    }
    return 255
  }
  // 5. ひとつづきの 水面：ステージの 丸い 水面（坂で 段に なって 継ぎ目が 見えた）の かわりに、升目から 1 まいずつ 作る
  for (const m of olds) m.visible = false
  const surf = waterMesh(N, x0, z0, level, fresh)
  const tex = new THREE.DataTexture(data, N, N)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  const old = fxU.uPond.value
  fxU.uPond.value = tex
  fxU.uPondBox.value.set(x0, z0, 1 / (N * POND_CELL), 1)
  if (old !== tex && old.image && (old.image as { width: number }).width > 1) old.dispose()
  const props = shoreProps(N, x0, z0, level, fresh, dIn, dOut, high)
  props.add(surf)
  return { tex, props }
}

/**
 * 水の 升目（と その まわり 1 つ）を 四角で うめた 水面。高さは 升目の 水の 高さを ならして 角で まぜる（坂の 川も なめらか）。
 * 池や 川と 海で 色の 組が ちがう ので 2 つに わける
 */
function waterMesh(N: number, x0: number, z0: number, level: Float32Array, fresh: Uint8Array) {
  const lv = new Float32Array(N * N).fill(NaN)
  const kind = new Uint8Array(N * N)
  for (let k = 0; k < N * N; k++) if (level[k] > -Infinity) {
    lv[k] = level[k]
    kind[k] = fresh[k] ? 1 : 2
  }
  // ならす（水の 升目どうしで 3×3 の 平均を 2 回）
  for (let pass = 0; pass < 2; pass++) {
    const nx = lv.slice()
    for (let j = 1; j < N - 1; j++)
      for (let i = 1; i < N - 1; i++) {
        const k = j * N + i
        if (Number.isNaN(lv[k])) continue
        let a = 0
        let n = 0
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const v = lv[k + dj * N + di]
          if (!Number.isNaN(v)) { a += v; n++ }
        }
        nx[k] = a / n
      }
    lv.set(nx)
  }
  // まわり 1 つ ひろげる（岸の ぎざぎざは シェーダーが けずる）
  const ext = lv.slice()
  const ek = kind.slice()
  for (let j = 1; j < N - 1; j++)
    for (let i = 1; i < N - 1; i++) {
      const k = j * N + i
      if (!Number.isNaN(lv[k])) continue
      let a = 0
      let n = 0
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const q = k + dj * N + di
        if (!Number.isNaN(lv[q])) { a += lv[q]; n++; ek[k] = kind[q] }
      }
      if (n) ext[k] = a / n
    }
  const g = new THREE.Group()
  g.name = 'pond-water'
  for (const want of [1, 2]) {
    const pos: number[] = []
    const idx: number[] = []
    const vmap = new Map<number, number>()
    const corner = (ci: number, cj: number) => {
      const key = cj * (N + 1) + ci
      const got = vmap.get(key)
      if (got !== undefined) return got
      let a = 0
      let n = 0
      for (const [di, dj] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const i = ci + di
        const j = cj + dj
        if (i < 0 || j < 0 || i >= N || j >= N) continue
        const v = ext[j * N + i]
        if (!Number.isNaN(v)) { a += v; n++ }
      }
      const id = pos.length / 3
      pos.push(x0 + ci * POND_CELL, n ? a / n : 0, z0 + cj * POND_CELL)
      vmap.set(key, id)
      return id
    }
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const k = j * N + i
        if (Number.isNaN(ext[k]) || ek[k] !== want) continue
        const a = corner(i, j)
        const b = corner(i + 1, j)
        const c = corner(i, j + 1)
        const d = corner(i + 1, j + 1)
        idx.push(a, c, b, b, c, d)
      }
    if (!idx.length) continue
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setIndex(idx)
    geo.computeBoundingSphere()
    const m = new THREE.Mesh(geo, waterSurface({ deep: '', shallow: '', sea: want === 2 }))
    m.userData.surf = true
    g.add(m)
  }
  return g
}

/** 升目の 距離（升目の 数）。src = 「ここが 反対がわ」の 升目 */
function chamfer(N: number, src: (k: number) => boolean) {
  const D = 1
  const DD = Math.SQRT2
  const d = new Float32Array(N * N)
  for (let k = 0; k < N * N; k++) d[k] = src(k) ? 0 : 1e6
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const k = j * N + i
      if (!d[k]) continue
      let v = d[k]
      if (i > 0) v = Math.min(v, d[k - 1] + D)
      if (j > 0) {
        v = Math.min(v, d[k - N] + D)
        if (i > 0) v = Math.min(v, d[k - N - 1] + DD)
        if (i < N - 1) v = Math.min(v, d[k - N + 1] + DD)
      }
      d[k] = v
    }
  for (let j = N - 1; j >= 0; j--)
    for (let i = N - 1; i >= 0; i--) {
      const k = j * N + i
      if (!d[k]) continue
      let v = d[k]
      if (i < N - 1) v = Math.min(v, d[k + 1] + D)
      if (j < N - 1) {
        v = Math.min(v, d[k + N] + D)
        if (i < N - 1) v = Math.min(v, d[k + N + 1] + DD)
        if (i > 0) v = Math.min(v, d[k + N - 1] + DD)
      }
      d[k] = v
    }
  // 外がわ（升目の そと）は 遠い あつかい
  for (let k = 0; k < N * N; k++) if (d[k] > 1e5) d[k] = 64
  return d
}

/** 岸の あし（がまの ほ）と、池の はすの 葉。海べには 置かない */
function shoreProps(N: number, x0: number, z0: number, level: Float32Array, fresh: Uint8Array, dIn: Float32Array, dOut: Float32Array, high: boolean) {
  const g = new THREE.Group()
  g.name = 'pond-props'
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const reeds: [number, number, number][] = []
  const pads: [number, number, number][] = []
  const freshNear = (i: number, j: number) => {
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const k = (j + dj) * N + (i + di)
      if (level[k] > -Infinity && fresh[k]) return level[k]
    }
    return -Infinity
  }
  for (let j = 1; j < N - 1; j++)
    for (let i = 1; i < N - 1; i++) {
      const k = j * N + i
      const x = x0 + (i + 0.5) * POND_CELL
      const z = z0 + (j + 0.5) * POND_CELL
      if (level[k] === -Infinity) {
        // 水の となりの 陸に あしの むら（かたまって 生える）
        if (dOut[k] > 1.01) continue
        const lv = freshNear(i, j)
        if (lv === -Infinity) continue
        const patch = Math.sin(x * 0.7 + z * 0.3) + Math.sin(z * 0.9 - x * 0.4)
        if (patch > 0.6 && rnd() < 0.55) reeds.push([x + (rnd() - 0.5) * 0.4, lv, z + (rnd() - 0.5) * 0.4])
      } else if (fresh[k] && dIn[k] >= 2 && dIn[k] <= 5 && rnd() < 0.035) pads.push([x, level[k], z])
    }
  const cap = high ? 1 : 0.5
  const pick = <T,>(a: T[], n: number) => (a.length <= n ? a : a.filter((_, i) => i % Math.ceil(a.length / n) === 0))
  const R = pick(reeds, Math.round(700 * cap))
  const P = pick(pads, Math.round(160 * cap))
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const v = new THREE.Vector3()
  if (R.length) {
    // あし 1 本 = ほそい 葉 + 茶色の ほ。3 本で 1 むら
    const stem = new THREE.BoxGeometry(0.035, 0.7, 0.035).translate(0, 0.35, 0)
    const head = new THREE.BoxGeometry(0.07, 0.17, 0.07).translate(0, 0.66, 0)
    const blade = new THREE.BoxGeometry(0.02, 0.55, 0.06).translate(0, 0.27, 0)
    const stems = new THREE.InstancedMesh(stem, psx(new THREE.MeshLambertMaterial({ color: '#5d8a3e' })), R.length * 3)
    const heads = new THREE.InstancedMesh(head, psx(new THREE.MeshLambertMaterial({ color: '#6b3f22' })), R.length * 2)
    const blades = new THREE.InstancedMesh(blade, psx(new THREE.MeshLambertMaterial({ color: '#7ba64a' })), R.length * 2)
    let hi = 0
    let bi = 0
    R.forEach(([x, y, z], n) => {
      for (let t = 0; t < 3; t++) {
        const a = rnd() * Math.PI * 2
        const h = 0.7 + rnd() * 0.6
        q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.25, a, (rnd() - 0.5) * 0.25))
        v.set(x + Math.cos(a) * 0.12, y - 0.05, z + Math.sin(a) * 0.12)
        s.set(1, h, 1)
        m4.compose(v, q, s)
        stems.setMatrixAt(n * 3 + t, m4)
        if (t < 2) {
          heads.setMatrixAt(hi++, m4)
          q.setFromEuler(new THREE.Euler(0, a + 1, (rnd() - 0.5) * 0.7))
          m4.compose(v, q, s)
          blades.setMatrixAt(bi++, m4)
        }
      }
    })
    heads.count = hi
    blades.count = bi
    for (const m of [stems, heads, blades]) {
      m.castShadow = false
      m.receiveShadow = true
      m.userData.small = true
      g.add(m)
    }
  }
  if (P.length) {
    // はすの 葉：きりこみの ある まるい 葉（3 つに 1 つ 花）
    const leaf = new THREE.CircleGeometry(0.3, 9, 0.5, Math.PI * 2 - 0.9).rotateX(-Math.PI / 2)
    const pads2 = new THREE.InstancedMesh(leaf, psx(new THREE.MeshLambertMaterial({ color: '#4f8a3c', side: THREE.DoubleSide })), P.length)
    const bloom = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.09, 0), psx(new THREE.MeshLambertMaterial({ color: '#e89ab0' })), P.length)
    let fi = 0
    P.forEach(([x, y, z], n) => {
      const sc = 0.7 + rnd() * 0.6
      q.setFromEuler(new THREE.Euler(0, rnd() * Math.PI * 2, 0))
      m4.compose(v.set(x + (rnd() - 0.5) * 0.3, y + 0.012, z + (rnd() - 0.5) * 0.3), q, s.set(sc, 1, sc))
      pads2.setMatrixAt(n, m4)
      if (n % 3 === 0) {
        m4.compose(v.set(v.x + 0.05, y + 0.07, v.z), q, s.set(1, 0.7, 1))
        bloom.setMatrixAt(fi++, m4)
      }
    })
    bloom.count = fi
    for (const m of [pads2, bloom]) {
      m.receiveShadow = true
      m.userData.small = true
      g.add(m)
    }
  }
  return g
}
