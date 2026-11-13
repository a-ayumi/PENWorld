import * as THREE from 'three'
import { psx } from './psx'
import { rng } from './textures'
import type { NavGrid } from './nav'

/**
 * 村の かざり（計画 E3）：家と建物を むすぶ 飛び石の道・段差の石段・家のまわりの小物。
 * セーブしない（家と建物の場所から 毎回 同じ形に作る）。当たり判定は 無い（道も小物も 歩くじゃまをしない）。
 * 建物が ふえた・へった時に World.updateDecor() が 作りなおす。
 */
export interface DecorNode { x: number; z: number; r: number; house: boolean }
export interface DecorInput {
  heightAt: (x: number, z: number) => number
  nav: NavGrid
  nodes: DecorNode[]
  /** 画質「高」= 小物を ぜんぶ置く */
  high: boolean
}

const STONE = ['#cbb690', '#b9a680', '#a9a394', '#d6c6a4', '#bfae8c']
const STEP = ['#b4b8a4', '#a4aa98', '#c0c2ae']

let M: { stone: THREE.Material; wood: THREE.Material; dark: THREE.Material; band: THREE.Material; leaf: THREE.Material; glow: THREE.Material; fl: THREE.Material[] } | null = null
const mats = () =>
  (M ??= {
    stone: psx(new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), { snow: true }),
    wood: psx(new THREE.MeshLambertMaterial({ color: '#8a6a44', flatShading: true }), { snow: true }),
    dark: psx(new THREE.MeshLambertMaterial({ color: '#4a3a30', flatShading: true })),
    band: psx(new THREE.MeshLambertMaterial({ color: '#3c4048', flatShading: true })),
    leaf: psx(new THREE.MeshLambertMaterial({ color: '#4c7a36', flatShading: true })),
    glow: psx(new THREE.MeshBasicMaterial({ color: '#ffd68a' })),
    fl: ['#e86a5a', '#ffd86a', '#cdb8ea', '#f4f0e8'].map((c) => psx(new THREE.MeshLambertMaterial({ color: c, flatShading: true }))),
  })

const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  b.position.set(x, y, z)
  return b
}
const cyl = (r0: number, r1: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 7) => {
  const b = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m)
  b.position.set(x, y, z)
  return b
}

/** 小物 1 つ（原点 = 地面） */
function prop(kind: number, r: () => number): THREE.Group {
  const m = mats()
  const g = new THREE.Group()
  switch (kind) {
    case 0: // がいとう
      g.add(box(0.07, 1.05, 0.07, m.dark, 0, 0.52, 0), box(0.2, 0.2, 0.2, m.glow, 0, 1.12, 0), cyl(0.02, 0.17, 0.12, m.dark, 0, 1.28, 0, 4), box(0.16, 0.05, 0.16, m.dark, 0, 1.0, 0))
      break
    case 1: // 木箱（かさねる）
      g.add(box(0.34, 0.3, 0.34, m.wood, 0, 0.15, 0))
      if (r() < 0.7) {
        const b = box(0.26, 0.24, 0.26, m.wood, 0.04, 0.42, 0.02)
        b.rotation.y = r()
        g.add(b)
      }
      if (r() < 0.5) g.add(box(0.28, 0.26, 0.28, m.wood, 0.4, 0.13, 0.08))
      break
    case 2: // たる
      g.add(cyl(0.15, 0.15, 0.36, m.wood, 0, 0.18, 0), cyl(0.165, 0.165, 0.05, m.band, 0, 0.1, 0), cyl(0.165, 0.165, 0.05, m.band, 0, 0.27, 0))
      if (r() < 0.5) g.add(cyl(0.13, 0.13, 0.3, m.wood, 0.34, 0.15, 0.1), cyl(0.145, 0.145, 0.05, m.band, 0.34, 0.2, 0.1))
      break
    case 3: { // 植木ばち（花）
      g.add(box(0.5, 0.16, 0.22, m.wood, 0, 0.08, 0), box(0.44, 0.08, 0.16, m.leaf, 0, 0.18, 0))
      const f = m.fl[Math.floor(r() * m.fl.length)]
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055, 0), r() < 0.25 ? m.fl[Math.floor(r() * m.fl.length)] : f)
        b.position.set(-0.17 + i * 0.115, 0.25 + r() * 0.04, (r() - 0.5) * 0.08)
        g.add(b)
      }
      break
    }
    case 4: { // まき（まるたを つむ）
      for (let i = 0; i < 3; i++) {
        const l = cyl(0.07, 0.07, 0.5, m.wood, 0, i === 2 ? 0.19 : 0.07, i === 2 ? 0 : i * 0.15 - 0.075, 6)
        l.rotation.z = Math.PI / 2
        g.add(l)
      }
      break
    }
    default: { // さく（みじかい）
      for (const x of [-0.45, 0, 0.45]) g.add(box(0.07, 0.42, 0.07, m.dark, x, 0.21, 0))
      g.add(box(1.0, 0.05, 0.04, m.wood, 0, 0.3, 0), box(1.0, 0.05, 0.04, m.wood, 0, 0.16, 0))
    }
  }
  return g
}

export function buildDecor(inp: DecorInput): THREE.Group {
  const { heightAt, nav, nodes } = inp
  const group = new THREE.Group()
  group.name = 'decor'
  const m = mats()
  // --- 道：近い建物どうしを 木のように つなぐ（いちばん短い つながり）。入口は 建物の手前（+z）
  const door = (n: DecorNode) => ({ x: n.x, z: n.z + n.r + 0.55 })
  const stones: { x: number; z: number; step: boolean; dir: number }[] = []
  const used = new Set<string>()
  const put = (x: number, z: number, step: boolean, dir: number) => {
    const k = Math.round(x * 2.2) + "," + Math.round(z * 2.2)
    if (used.has(k) || !nav.standable(x, z, false)) return
    used.add(k)
    stones.push({ x, z, step, dir })
  }
  const lay = (pts: { x: number; z: number }[], seed: number) => {
    const r = rng(seed)
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      const d = Math.hypot(b.x - a.x, b.z - a.z)
      const dir = Math.atan2(b.x - a.x, b.z - a.z)
      const n = Math.max(1, Math.round(d / 0.46))
      for (let s = 0; s < n; s++) {
        const t = s / n
        const x = a.x + (b.x - a.x) * t
        const z = a.z + (b.z - a.z) * t
        // 坂（0.5 マスで 0.2 より大きく のぼる所）は 石段に
        const rise = Math.abs(heightAt(x + Math.sin(dir) * 0.25, z + Math.cos(dir) * 0.25) - heightAt(x - Math.sin(dir) * 0.25, z - Math.cos(dir) * 0.25))
        if (rise > 0.2) put(x, z, true, dir)
        else put(x + (r() - 0.5) * 0.22, z + (r() - 0.5) * 0.22, false, r() * 6)
      }
    }
  }
  if (nodes.length >= 2) {
    const inTree = [0]
    const rest = nodes.map((_, i) => i).slice(1)
    let guard = 0
    while (rest.length && guard++ < 64) {
      let best = [-1, -1, 1e9]
      for (const a of inTree) for (const b of rest) {
        const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z)
        if (d < best[2]) best = [a, b, d]
      }
      const [a, b, d] = best
      rest.splice(rest.indexOf(b), 1)
      inTree.push(b)
      if (d > 16) continue
      const A = door(nodes[a])
      const B = door(nodes[b])
      const path = nav.findPath(A.x, A.z, B.x, B.z, false, 5000)
      if (path) lay([A, ...path], a * 31 + b * 7 + 1)
    }
  }
  // 家の入口の前に 2〜3 個（道が まだ無くても）
  for (const n of nodes) if (n.house) lay([{ x: n.x, z: n.z + n.r + 0.1 }, door(n), { x: n.x, z: n.z + n.r + 1.1 }], Math.round(n.x * 13 + n.z * 7) + 5)

  const flat = stones.filter((s) => !s.step)
  const steps = stones.filter((s) => s.step)
  const dummy = new THREE.Object3D()
  const col = new THREE.Color()
  const rs = rng(4242)
  if (flat.length) {
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.28, 0.07, 6), m.stone, flat.length)
    flat.forEach((s, i) => {
      dummy.position.set(s.x, heightAt(s.x, s.z) + 0.035, s.z)
      dummy.rotation.set(0, s.dir, 0)
      dummy.scale.set(0.8 + rs() * 0.55, 1, 0.75 + rs() * 0.45)
      dummy.updateMatrix()
      im.setMatrixAt(i, dummy.matrix)
      im.setColorAt(i, col.set(STONE[Math.floor(rs() * STONE.length)]))
    })
    group.add(im)
  }
  if (steps.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.78, 0.14, 0.3), m.stone, steps.length)
    steps.forEach((s, i) => {
      dummy.position.set(s.x, heightAt(s.x, s.z) + 0.05, s.z)
      dummy.rotation.set(0, s.dir, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      im.setMatrixAt(i, dummy.matrix)
      im.setColorAt(i, col.set(STEP[Math.floor(rs() * STEP.length)]))
    })
    group.add(im)
  }
  // --- 小物：家のまわり（入口の正面は あける）。坂・道の上・ほかの物の中には 置かない
  const nearStone = (x: number, z: number) => stones.some((s) => Math.hypot(s.x - x, s.z - z) < 0.45)
  const placed: { x: number; z: number }[] = []
  for (const n of nodes) {
    if (!n.house) continue
    const r = rng(Math.round(n.x * 97 + n.z * 57) + 11)
    const want = inp.high ? 3 + Math.floor(r() * 2) : 2
    // 入口（+z）から 左右と うしろ：角度は +z を 0 として 50°〜310°
    const kinds = [0, 1, 2, 3, 4, 5].sort(() => r() - 0.5)
    let done = 0
    for (let tries = 0; tries < 10 && done < want; tries++) {
      const a = (50 + r() * 260) * (Math.PI / 180)
      const rad = n.r + 0.5 + r() * 0.35
      const x = n.x + Math.sin(a) * rad
      const z = n.z + Math.cos(a) * rad
      if (!nav.standable(x, z, false) || nearStone(x, z)) continue
      if (Math.abs(heightAt(x + 0.3, z) - heightAt(x - 0.3, z)) + Math.abs(heightAt(x, z + 0.3) - heightAt(x, z - 0.3)) > 0.25) continue
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 0.6)) continue
      const p = prop(kinds[done % kinds.length], r)
      p.position.set(x, heightAt(x, z), z)
      // さくは 家に そわせる・ほかは 少し まわす
      p.rotation.y = kinds[done % kinds.length] === 5 ? a + Math.PI / 2 : r() * 0.8 - 0.4
      group.add(p)
      placed.push({ x, z })
      done++
    }
  }
  return group
}

export function disposeDecor(g: THREE.Group) {
  g.traverse((o) => {
    const me = o as THREE.Mesh
    if (me.isMesh) me.geometry.dispose()
  })
}
