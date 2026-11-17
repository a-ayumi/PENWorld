import * as THREE from 'three'
import { psx } from './psx'
import { rng } from './textures'
import { swayify } from './fxprops'

/**
 * ふさふさの木（計画 E2）。葉のかたまり（丸い多面体）を いくつも重ね、面ごとに 上は明るく・下は暗く 色をつける。
 * 1 本の葉は 1 つの形に まとめる（描く回数 = 幹 1 + 葉 1）。風のゆれは swayify。
 *
 * kind：round = まるい木 / bloom = 花の咲く木 / conifer = 針葉樹 / bush = しげみ（花つき）
 */
export type TreeKind = 'round' | 'bloom' | 'conifer' | 'bush'

/** 色の組（暗い → 明るい の 3 色 + 花の色）。ステージごとに かえられる */
export interface FloraPalette { leaf: [string, string, string] | [string, string, string, string]; flower?: [string, string]; bark?: string }
export const FLORA: Record<string, FloraPalette> = {
  // 2026-11-16：下は 深い 青緑の かげ・上は 日の あたる 黄みどり（4 色め）
  round: { leaf: ['#1c3e36', '#2f6a34', '#5b9a3a', '#a8b848'] },
  roundB: { leaf: ['#24432c', '#477a2c', '#7aa63a', '#c4bc4c'] },
  bloom: { leaf: ['#3f6038', '#62865a', '#8fae86'], flower: ['#cdb8ea', '#f2e8ff'] },
  bloomPink: { leaf: ['#3f6038', '#62865a', '#8fae86'], flower: ['#f0b0c4', '#fff0f2'] },
  conifer: { leaf: ['#123a32', '#1d5640', '#2f7448', '#6a9a4a'] },
  bush: { leaf: ['#1f4232', '#3c6e34', '#6a9a40', '#a8b44a'], flower: ['#e86a5a', '#ffd86a'] },
  // ほかのステージ（計画 E5）
  frost: { leaf: ['#1c4a4a', '#2c6c66', '#e4eef8'] }, // 雪を かぶった 針葉樹
  cotton: { leaf: ['#aebcd8', '#dbe5f4', '#ffffff'] }, // わたゆきの木
  cottonBush: { leaf: ['#aebcd8', '#dbe5f4', '#ffffff'], flower: ['#ff9ecb', '#ffd9ea'] },
  tropic: { leaf: ['#1f6a46', '#36a05a', '#72cf70'], flower: ['#ff7ab0', '#ffd84a'] },
  ruin: { leaf: ['#1f5a44', '#2f7a52', '#5aa878'], flower: ['#9dffd0', '#e0fff0'] },
  ember: { leaf: ['#2e2228', '#4e3230', '#7a4432'], flower: ['#ff8a3a', '#ffd84a'] }, // こげた しげみに 火の花
}

let leafMat: THREE.Material | null = null
let barkMat: THREE.Material | null = null
const mats = () => {
  // 2026-11-17：葉は なめらかな 陰（かたまりを 球と して）+ シェーダーの 葉の 房の 模様（ポリゴンの 面を 見せない）
  leafMat ??= psx(new THREE.MeshLambertMaterial({ vertexColors: true }), { snow: true, clump: true, leaf: true })
  barkMat ??= psx(new THREE.MeshLambertMaterial({ color: '#5a4030', flatShading: true }), { snow: false })
  return { leafMat, barkMat }
}

/** 形を足していく入れ物（位置・色を つなげて 1 つの形に） */
class Builder {
  pos: number[] = []
  col: number[] = []
  /** 葉の かたまりの ゆれ（位相・大きさ。0 = ゆれない） */
  clump: number[] = []
  /** g を 置いて、面ごとに pick(面の向きの y, 面のまんなかの y) の色をぬる。cl = かたまりの [位相, 大きさ] */
  nor: number[] = []
  /** 花の 色（面ごとの 色を そのまま 使う） */
  flowers = new Set<THREE.Color>()
  flowerCols: THREE.Color[] = []
  flowerRate = 0
  /**
   * shape = 'blob'（まるい かたまり：球の 向きで 陰・表面を すこし でこぼこに）/ 'cone'（針葉樹の 段：横向き + 上向きの 陰）。
   * 色は 頂点ごとに（面ごとに かえると 多面体の 面が 見える）。花は pick が 面ごとに 返す 色を そのまま
   */
  add(g: THREE.BufferGeometry, m: THREE.Matrix4, pick: (ny: number, y: number) => THREE.Color, cl: [number, number] = [0, 0], shape: 'blob' | 'cone' = 'blob', smooth?: (ny: number, y: number) => THREE.Color) {
    g.computeBoundingSphere()
    const ctr = g.boundingSphere!.center.clone().applyMatrix4(m)
    const geo = (g.index ? g.toNonIndexed() : g).applyMatrix4(m)
    const p = geo.attributes.position
    const v = new THREE.Vector3()
    const n = new THREE.Vector3()
    const pts: THREE.Vector3[] = []
    const ns: THREE.Vector3[] = []
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i)
      const d = v.clone().sub(ctr)
      if (shape === 'blob') {
        n.copy(d).normalize()
        // でこぼこ：向きで きまる ゆらぎ（同じ 頂点は 同じ だけ うごく）
        const bump = Math.sin(n.x * 9.1 + n.y * 4.3) * Math.sin(n.z * 8.3 - n.y * 5.7)
        v.addScaledVector(n, bump * d.length() * 0.12)
      } else n.set(d.x, Math.hypot(d.x, d.z) * 0.9 + 0.2, d.z).normalize()
      pts.push(v.clone())
      ns.push(n.clone())
    }
    for (let i = 0; i < pts.length; i += 3) {
      const fy = (pts[i].y + pts[i + 1].y + pts[i + 2].y) / 3
      const fn = (ns[i].y + ns[i + 1].y + ns[i + 2].y) / 3
      const face = pick(fn, fy)
      for (let k = i; k < i + 3; k++) {
        // 花：同じ 場所の 頂点は 同じ 色（位置の ハッシュ）。面ごとに ぬると 多面体の 面が 見えた
        const P = pts[k]
        const hsh = Math.abs(Math.sin(P.x * 91.7 + P.y * 47.3 + P.z * 63.1) * 43758.5) % 1
        const c = this.flowerCols.length && ns[k].y > 0 && hsh < this.flowerRate ? this.flowerCols[hsh < this.flowerRate * 0.3 ? 1 : 0] : smooth ? smooth(ns[k].y, pts[k].y) : face
        this.pos.push(pts[k].x, pts[k].y, pts[k].z)
        this.nor.push(ns[k].x, ns[k].y, ns[k].z)
        this.col.push(c.r, c.g, c.b)
        this.clump.push(cl[0], cl[1])
      }
    }
    geo.dispose()
    if (geo !== g) g.dispose()
  }
  build() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setAttribute('aClump', new THREE.Float32BufferAttribute(this.clump, 2))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    return g
  }
}

/**
 * 木を 1 本つくる（高さは round でおよそ 2.4。scale は呼ぶ側で）。
 * 葉の形は seed で決まる（同じ seed なら同じ木）。
 */
export function tree(kind: TreeKind, seed: number, pal: FloraPalette = FLORA[kind === 'bloom' ? 'bloom' : kind]): THREE.Group {
  const r = rng(seed * 7919 + 13)
  const { leafMat, barkMat } = mats()
  const cols = pal.leaf.map((c) => new THREE.Color(c))
  const fl = (pal.flower ?? []).map((c) => new THREE.Color(c))
  const B = new Builder()
  const M = new THREE.Matrix4()
  const g = new THREE.Group()
  g.userData.tree = true
  // 面の色：上を向いた面・高い所ほど明るい。花の木は 上の面の一部が 花の色
  const shade = (y0: number, y1: number) => (ny: number, y: number) => {
    const t = ny * 0.55 + ((y - y0) / Math.max(0.01, y1 - y0) - 0.5) * 0.6 + (r() - 0.5) * 0.35
    if (fl.length && ny > 0.1 && r() < (kind === 'bush' ? 0.16 : 0.34)) return fl[r() < 0.3 ? 1 : 0]
    // 4 色の 組は 上を むいた 高い 面に 日の あたる 色
    if (cols.length > 3 && t > 0.62 && ny > 0.45) return cols[3]
    return cols[t > 0.42 ? 2 : t > -0.08 ? 1 : 0]
  }
  for (const c of fl) B.flowers.add(c)
  B.flowerCols = fl
  B.flowerRate = kind === 'bush' ? 0.18 : 0.32
  // 頂点ごとの なめらかな 色：上を むいた 所・高い 所ほど 明るい（左上の 光は ライトが つける）。ゆらぎは 入れない
  const soft = (y0: number, y1: number) => (ny: number, y: number) => {
    const t = ny * 0.6 + ((y - y0) / Math.max(0.01, y1 - y0) - 0.5) * 0.5
    if (cols.length > 3 && t > 0.72 && ny > 0.5) return cols[3]
    return cols[t > 0.42 ? 2 : t > -0.1 ? 1 : 0]
  }
  if (kind === 'conifer') {
    const h = 3.0 + r() * 0.9
    const tiers = 4
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1)
      const rad = 0.95 - t * 0.6
      const hh = 1.15 - t * 0.2
      const y = 0.75 + t * (h - 1.5)
      M.makeRotationY(r() * 6).setPosition((r() - 0.5) * 0.08, y + hh / 2, (r() - 0.5) * 0.08)
      // 針葉樹：上の 段ほど 大きく（幹が しなる かわり）
      B.add(new THREE.ConeGeometry(rad, hh, 9, 2), M, shade(y, y + hh), [r() * 4, 0.3 + t * t * 0.9], 'cone', soft(y, y + hh))
    }
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.0, 6), barkMat)
    trunk.position.y = 0.5
    g.add(trunk)
  } else if (kind === 'bush') {
    for (let i = 0; i < 3; i++) {
      const rad = 0.22 + r() * 0.14
      const a = (i / 3) * 6.28 + r()
      M.makeRotationY(r() * 6).setPosition(Math.cos(a) * 0.2, rad * 0.75, Math.sin(a) * 0.2)
      B.add(new THREE.IcosahedronGeometry(rad, 1), M, shade(0, 0.55), [r() * 4, 0.55 + r() * 0.2], 'blob', soft(0, 0.55))
    }
  } else {
    // まるい木：まんなかの大きな かたまり + まわりと上に 小さな かたまり
    const cy = 1.75
    M.makeRotationY(r() * 6).setPosition(0, cy, 0)
    B.add(new THREE.IcosahedronGeometry(0.72, 2), M, shade(cy - 0.9, cy + 1.0), [r() * 4, 0.35], 'blob', soft(cy - 0.9, cy + 1.0))
    const n = 5 + Math.floor(r() * 3)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.28 + r() * 0.6
      const rad = 0.4 + r() * 0.2
      const d = 0.5 + r() * 0.2
      const y = cy - 0.25 + r() * 0.55
      M.makeRotationY(r() * 6).setPosition(Math.cos(a) * d, y, Math.sin(a) * d)
      B.add(new THREE.IcosahedronGeometry(rad, 1), M, shade(cy - 0.9, cy + 1.0), [r() * 4, 1], 'blob', soft(cy - 0.9, cy + 1.0))
    }
    M.makeRotationY(r() * 6).setPosition((r() - 0.5) * 0.3, cy + 0.6, (r() - 0.5) * 0.3)
    B.add(new THREE.IcosahedronGeometry(0.46, 1), M, shade(cy - 0.9, cy + 1.0), [r() * 4, 1], 'blob', soft(cy - 0.9, cy + 1.0))
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.3, 6), barkMat)
    trunk.position.y = 0.65
    g.add(trunk)
  }
  g.add(new THREE.Mesh(B.build(), leafMat))
  // 木ぜんたいの なめらかな ゆれは ひかえめに（葉の かたまりの 1 ドットの ゆれが 主役）
  // 幹は うごかさない（ゆれは 葉の かたまりの ドットの うごき と 突風の かたむき だけ）
  swayify(g, 0)
  return g
}

/** 木の 葉の かたまり だけ（幹なし）。置き物の「なえ」が そだった 木などに（2026-11-17：森の 木と 同じ 見え方に） */
export function leaves(kind: TreeKind, seed: number): THREE.Mesh {
  const t = tree(kind, seed)
  const m = t.children.find((c) => (c as THREE.Mesh).isMesh && (c as THREE.Mesh).material === leafMat) as THREE.Mesh
  t.remove(m)
  for (const c of t.children) (c as THREE.Mesh).geometry?.dispose()
  return m
}
