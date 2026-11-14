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
export interface FloraPalette { leaf: [string, string, string]; flower?: [string, string]; bark?: string }
export const FLORA: Record<string, FloraPalette> = {
  round: { leaf: ['#235426', '#3a8034', '#5fa840'] },
  roundB: { leaf: ['#2f5a22', '#55862c', '#84ae40'] },
  bloom: { leaf: ['#3f6038', '#62865a', '#8fae86'], flower: ['#cdb8ea', '#f2e8ff'] },
  bloomPink: { leaf: ['#3f6038', '#62865a', '#8fae86'], flower: ['#f0b0c4', '#fff0f2'] },
  conifer: { leaf: ['#143c2c', '#1f583a', '#307648'] },
  bush: { leaf: ['#2f552c', '#4c7a36', '#73994a'], flower: ['#e86a5a', '#ffd86a'] },
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
  leafMat ??= psx(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { snow: true })
  barkMat ??= psx(new THREE.MeshLambertMaterial({ color: '#5a4030', flatShading: true }), { snow: false })
  return { leafMat, barkMat }
}

/** 形を足していく入れ物（位置・色を つなげて 1 つの形に） */
class Builder {
  pos: number[] = []
  col: number[] = []
  /** g を 置いて、面ごとに pick(面の向きの y, 面のまんなかの y) の色をぬる */
  add(g: THREE.BufferGeometry, m: THREE.Matrix4, pick: (ny: number, y: number) => THREE.Color) {
    const geo = (g.index ? g.toNonIndexed() : g).applyMatrix4(m)
    const p = geo.attributes.position
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i)
      b.fromBufferAttribute(p, i + 1)
      c.fromBufferAttribute(p, i + 2)
      const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize()
      const k = pick(n.y, (a.y + b.y + c.y) / 3)
      for (const v of [a, b, c]) {
        this.pos.push(v.x, v.y, v.z)
        this.col.push(k.r, k.g, k.b)
      }
    }
    geo.dispose()
    if (geo !== g) g.dispose()
  }
  build() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.computeVertexNormals()
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
  // 面の色：上を向いた面・高い所ほど明るい。花の木は 上の面の一部が 花の色
  const shade = (y0: number, y1: number) => (ny: number, y: number) => {
    const t = ny * 0.55 + ((y - y0) / Math.max(0.01, y1 - y0) - 0.5) * 0.6 + (r() - 0.5) * 0.35
    if (fl.length && ny > 0.1 && r() < (kind === 'bush' ? 0.16 : 0.34)) return fl[r() < 0.3 ? 1 : 0]
    return cols[t > 0.42 ? 2 : t > -0.08 ? 1 : 0]
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
      B.add(new THREE.ConeGeometry(rad, hh, 7, 1), M, shade(y, y + hh))
    }
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.0, 6), barkMat)
    trunk.position.y = 0.5
    g.add(trunk)
  } else if (kind === 'bush') {
    for (let i = 0; i < 3; i++) {
      const rad = 0.22 + r() * 0.14
      const a = (i / 3) * 6.28 + r()
      M.makeRotationY(r() * 6).setPosition(Math.cos(a) * 0.2, rad * 0.75, Math.sin(a) * 0.2)
      B.add(new THREE.IcosahedronGeometry(rad, 1), M, shade(0, 0.55))
    }
  } else {
    // まるい木：まんなかの大きな かたまり + まわりと上に 小さな かたまり
    const cy = 1.75
    M.makeRotationY(r() * 6).setPosition(0, cy, 0)
    B.add(new THREE.IcosahedronGeometry(0.72, 1), M, shade(cy - 0.9, cy + 1.0))
    const n = 5 + Math.floor(r() * 3)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.28 + r() * 0.6
      const rad = 0.4 + r() * 0.2
      const d = 0.5 + r() * 0.2
      const y = cy - 0.25 + r() * 0.55
      M.makeRotationY(r() * 6).setPosition(Math.cos(a) * d, y, Math.sin(a) * d)
      B.add(new THREE.IcosahedronGeometry(rad, 1), M, shade(cy - 0.9, cy + 1.0))
    }
    M.makeRotationY(r() * 6).setPosition((r() - 0.5) * 0.3, cy + 0.6, (r() - 0.5) * 0.3)
    B.add(new THREE.IcosahedronGeometry(0.46, 1), M, shade(cy - 0.9, cy + 1.0))
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.3, 6), barkMat)
    trunk.position.y = 0.65
    g.add(trunk)
  }
  g.add(new THREE.Mesh(B.build(), leafMat))
  swayify(g, kind === 'bush' ? 0.5 : kind === 'conifer' ? 0.7 : 1)
  return g
}
