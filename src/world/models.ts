import * as THREE from 'three'
import { psx } from './psx'
import type { SpeciesId } from './monsters'

/**
 * モンスターの 3D モデル（オリジナルデザイン。2D ドット絵版と同じ形・色）。
 * 球・円柱・円錐などの組み合わせで作り、手続きアニメーションで動かす。
 * World からは SpriteAnim と同じ使い方（sprite / facing / play / update / setHeight / dispose）。
 */

interface Rig {
  root: THREE.Group
  /** 体（上下の弾み・つぶれ・傾きをかける） */
  body: THREE.Group
  legs: THREE.Object3D[]
  arms: THREE.Object3D[]
  eyes: THREE.Object3D[]
  mats: THREE.MeshLambertMaterial[]
  /** 種類ごとの追加の動き（羽・しっぽ・触手など） */
  extra?: (t: number, anim: string) => void
}

/** 1 = 体の高さ約 1 で作った模型を、種族の身長に合わせる係数 */
const SCALE = 0.78

class Kit {
  readonly mats: THREE.MeshLambertMaterial[] = []
  /** 角ばった 低ポリ（面ごとに 色が かわる。建物と 同じ 見え方） */
  flat = false
  mat(color: string, emissive = 0) {
    const m = psx(new THREE.MeshLambertMaterial({ color, emissive: emissive ? color : '#000000', emissiveIntensity: emissive, flatShading: this.flat }), { soft: !this.flat })
    this.mats.push(m)
    return m
  }
  /** 角ばった 玉（低ポリの 体・頭） */
  ico(r: number, color: string, pos: [number, number, number], scale: [number, number, number] = [1, 1, 1], emissive = 0, detail = 3) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), this.mat(color, emissive))
    m.position.set(...pos)
    m.scale.set(...scale)
    return m
  }
  /** 球（分割数多めでなめらかに） */
  sph(r: number, color: string, pos: [number, number, number], scale: [number, number, number] = [1, 1, 1], emissive = 0) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), this.mat(color, emissive))
    m.position.set(...pos)
    m.scale.set(...scale)
    return m
  }
  cyl(rt: number, rb: number, h: number, color: string, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 12), this.mat(color))
    m.position.set(...pos)
    m.rotation.set(...rot)
    return m
  }
  cone(r: number, h: number, color: string, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], seg = 12, emissive = 0) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), this.mat(color, emissive))
    m.position.set(...pos)
    m.rotation.set(...rot)
    return m
  }
  box(w: number, h: number, d: number, color: string, pos: [number, number, number], emissive = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 2, 2, 2), this.mat(color, emissive))
    m.position.set(...pos)
    return m
  }
  /** 黒目 + 白いハイライトの目（正面 = +z） */
  eye(x: number, y: number, z: number, r = 0.07, color = '#1a1530') {
    const g = new THREE.Group()
    g.position.set(x, y, z)
    g.add(this.sph(r, color, [0, 0, 0], [0.85, 1.15, 0.6]))
    g.add(this.sph(r * 0.35, '#ffffff', [-r * 0.3, r * 0.4, r * 0.4]))
    return g
  }
  /** 足など「付け根で回す」部品：ピボットのグループに入れて返す */
  pivot(x: number, y: number, z: number, ...children: THREE.Object3D[]) {
    const g = new THREE.Group()
    g.position.set(x, y, z)
    g.add(...children)
    return g
  }
}


// ---------------------------------------------------------------------
/**
 * いぬの 系統（2026-11-16：キャラを 3D に する ためしの 1 本道 ワンコ → キバル → ガルフ → ロウガ）。
 * 建物と 同じ 角ばった 低ポリ（`Kit.flat`）で、ドット化しても 形が 読める 太い つくり。正面 = +z・足もと = y 0・高さ 約 1
 */
interface Dog {
  fur: string; dark: string; light: string; nose?: string
  /** 体の 長さ・あしの 長さ・頭の 大きさ */
  len: number; leg: number; head: number
  ear: 'flop' | 'point'; snout: number
  collar?: string; scarf?: string; mane?: string; fang?: boolean
  /** 完成期の かざり：せなかの けっしょう・かたの よろい・ひたいの けっしょう */
  crystal?: string; plate?: string
}
function dogRig(k: Kit, d: Dog): Omit<Rig, 'root' | 'mats'> {
  // なめらかな 面（ドット化と トゥーンの 段で ドット絵らしい 陰に なる。角ばった 面だと 3D の 模型に 見えた）
  k.flat = false
  const body = new THREE.Group()
  const y0 = d.leg + 0.18
  // 体（むね → おしり）
  body.add(k.ico(0.3, d.fur, [0, y0, 0], [0.95, 0.82, d.len]))
  body.add(k.ico(0.24, d.light, [0, y0 - 0.08, 0.06], [0.85, 0.7, d.len * 0.9]))
  if (d.mane) body.add(k.ico(0.26, d.mane, [0, y0 + 0.06, 0.28 * d.len], [1.05, 1, 0.75]))
  // 頭
  const head = new THREE.Group()
  head.position.set(0, y0 + 0.28, 0.36 * d.len + 0.05)
  const H = d.head
  head.add(k.ico(0.27 * H, d.fur, [0, 0, 0], [1, 0.95, 1]))
  head.add(k.ico(0.13 * H, d.light, [0, -0.07 * H, 0.22 * H], [1.05, 0.8, d.snout]))
  head.add(k.ico(0.05 * H, d.nose ?? '#2a1e1a', [0, -0.02 * H, (0.22 + 0.12 * d.snout) * H], [1.2, 0.9, 1]))
  const eyes = [k.eye(-0.12 * H, 0.06 * H, 0.21 * H, 0.055 * H), k.eye(0.12 * H, 0.06 * H, 0.21 * H, 0.055 * H)]
  head.add(...eyes)
  if (d.fang) for (const x of [-0.05, 0.05]) head.add(k.cone(0.02 * H, 0.07 * H, '#ffffff', [x * H, -0.16 * H, 0.28 * H], [Math.PI, 0, 0], 4))
  const ears: THREE.Object3D[] = []
  for (const s of [-1, 1]) {
    const e = d.ear === 'flop'
      ? k.pivot(s * 0.2 * H, 0.16 * H, 0, k.ico(0.11 * H, d.dark, [s * 0.06 * H, -0.12 * H, 0], [0.55, 1.2, 0.85]))
      : k.pivot(s * 0.14 * H, 0.2 * H, -0.02, k.cone(0.09 * H, 0.24 * H, d.dark, [0, 0.1 * H, 0], [0, 0, 0], 4))
    e.rotation.z = d.ear === 'flop' ? s * 0.5 : s * -0.2
    ears.push(e)
    head.add(e)
  }
  if (d.crystal) head.add(k.cone(0.05, 0.22, d.crystal, [0, 0.3 * H, 0.06], [0.3, 0, 0], 4, 0.5))
  body.add(head)
  // くびわ / スカーフ
  if (d.collar) {
    const c = k.cyl(0.16, 0.19, 0.06, d.collar, [0, y0 + 0.16, 0.3 * d.len], [0.6, 0, 0])
    body.add(c)
    body.add(k.ico(0.04, '#ffd23f', [0, y0 + 0.06, 0.38 * d.len + 0.04], [1, 1, 1], 0.3, 0))
  }
  if (d.scarf) {
    body.add(k.cyl(0.18, 0.21, 0.08, d.scarf, [0, y0 + 0.17, 0.3 * d.len], [0.6, 0, 0]))
    body.add(k.box(0.08, 0.2, 0.04, d.scarf, [0.1, y0 + 0.02, 0.24 * d.len]))
  }
  // 完成期：せなかの けっしょう と かたの よろい
  if (d.crystal) for (let i = 0; i < 4; i++) body.add(k.cone(0.05 + i * 0.008, 0.2 + (i % 2) * 0.08, d.crystal, [0, y0 + 0.24, (0.15 - i * 0.14) * d.len], [-0.4, 0, 0], 4, 0.45))
  if (d.plate) for (const s of [-1, 1]) body.add(k.box(0.12, 0.16, 0.22, d.plate, [s * 0.25, y0 + 0.04, 0.22 * d.len]))
  // しっぽ（付け根で ふる）
  const tail = k.pivot(0, y0 + 0.1, -0.32 * d.len, k.cone(d.mane ? 0.11 : 0.07, 0.38, d.mane ? d.light : d.fur, [0, 0.13, -0.08], [-0.9, 0, 0], 5))
  body.add(tail)
  // 足：まえ ひだり・まえ みぎ・うしろ ひだり・うしろ みぎ（ななめが いっしょに うごく）
  const legs: THREE.Object3D[] = []
  for (const [x, z] of [[-0.14, 0.22], [0.14, 0.22], [-0.14, -0.22], [0.14, -0.22]]) {
    const L = k.pivot(x, d.leg + 0.02, z * d.len,
      k.cyl(0.06, 0.05, d.leg, d.fur, [0, -d.leg / 2, 0]),
      k.ico(0.065, d.light, [0, -d.leg + 0.02, 0.02], [1, 0.7, 1.25], 0, 0))
    legs.push(L)
  }
  return {
    body, legs, arms: [], eyes,
    extra: (t, a) => {
      tail.rotation.x = a === 'sleep' ? 0.6 : -0.2 + Math.sin(t * (a === 'happy' || a === 'walk' ? 16 : 6)) * 0.12
      tail.rotation.y = Math.sin(t * (a === 'happy' ? 18 : 7)) * (a === 'sleep' ? 0.05 : 0.45)
      head.rotation.x = a === 'eat' ? 0.5 : a === 'sleep' ? 0.35 : Math.sin(t * 1.3) * 0.05
      for (const [i, e] of ears.entries()) e.rotation.x = d.ear === 'flop' ? Math.sin(t * 9 + i) * (a === 'walk' ? 0.25 : 0.06) : 0
    },
  }
}

/** 赤ちゃん：顔だけの まるい つぶに たれ耳（体は ない） */
function pupBlob(k: Kit): Omit<Rig, 'root' | 'mats'> {
  k.flat = false
  const body = new THREE.Group()
  body.add(k.ico(0.4, '#d9a46a', [0, 0.42, 0], [1.05, 0.95, 1]))
  body.add(k.ico(0.16, '#f6dcb8', [0, 0.32, 0.32], [1.3, 0.85, 0.8]))
  body.add(k.ico(0.055, '#2a1e1a', [0, 0.38, 0.45], [1.2, 0.9, 1], 0, 0))
  body.add(k.ico(0.12, '#7a4a22', [-0.2, 0.62, -0.12], [1, 0.6, 1], 0, 0))
  const eyes = [k.eye(-0.15, 0.5, 0.33, 0.06), k.eye(0.15, 0.5, 0.33, 0.06)]
  body.add(...eyes)
  const ears = [-1, 1].map((s) => {
    const e = k.pivot(s * 0.3, 0.68, 0.02, k.ico(0.13, '#9a6a3a', [s * 0.07, -0.14, 0], [0.55, 1.25, 0.9]))
    e.rotation.z = s * 0.55
    body.add(e)
    return e
  })
  const tail = k.pivot(0, 0.42, -0.38, k.ico(0.08, '#d9a46a', [0, 0.06, -0.04], [0.8, 1.4, 0.8], 0, 0))
  body.add(tail)
  const legs = [[-0.2, 0.16], [0.2, 0.16], [-0.2, -0.16], [0.2, -0.16]].map(([x, z]) => k.pivot(x, 0.08, z, k.ico(0.09, '#f6dcb8', [0, -0.02, 0], [1, 0.7, 1.2], 0, 0)))
  return {
    body, legs, arms: [], eyes,
    extra: (t, a) => {
      tail.rotation.z = Math.sin(t * (a === 'happy' ? 20 : 8)) * 0.5
      ears.forEach((e, i) => (e.rotation.x = Math.sin(t * 8 + i) * (a === 'walk' ? 0.3 : 0.05)))
    },
  }
}

// ---------------------------------------------------------------------
/** しなる くさり（しっぽ・首）：付け根から n 本の 節を つなぐ。節ごとに 少しずつ おくれて まがる */
function chain(k: Kit, n: number, len: number, r0: number, r1: number, color: string, tip?: THREE.Object3D) {
  const root = new THREE.Group()
  const segs: THREE.Group[] = []
  let parent: THREE.Object3D = root
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group()
    if (i) g.position.y = len
    const r = r0 + (r1 - r0) * (i / Math.max(1, n - 1))
    g.add(k.ico(r, color, [0, len / 2, 0], [1, (len / r) * 0.62, 1], 0, 2))
    parent.add(g)
    segs.push(g)
    parent = g
  }
  if (tip) {
    tip.position.y += len
    parent.add(tip)
  }
  return { root, segs }
}

/**
 * ねこの 系統（3D の 1 本道：ミミコ → ツメル → トラヒメ → ネコマタ）。
 * いぬと 同じ 体の つくりに、まるい 頭・みじかい 口もと・三角の 耳・しなる しっぽ。正面 = +z・高さ 約 1
 */
interface Cat {
  fur: string; dark: string; light: string; nose?: string
  len: number; leg: number; head: number
  stripe?: string; ruff?: string; mane?: string; fang?: boolean
  tails?: number; wisp?: string; gem?: string
}
function catRig(k: Kit, d: Cat): Omit<Rig, 'root' | 'mats'> {
  k.flat = false
  const body = new THREE.Group()
  const y0 = d.leg + 0.16
  const R = 0.28
  body.add(k.ico(R, d.fur, [0, y0, 0], [0.88, 0.78, d.len]))
  body.add(k.ico(R * 0.8, d.light, [0, y0 - 0.07, 0.05], [0.8, 0.68, d.len * 0.9]))
  // しま：体と 同じ だ円の うすい 輪切り（とがった 形に 見えるよう 3 本・せなかの 側だけ 出る）
  if (d.stripe) for (const z of [-0.5, -0.12, 0.26]) {
    const f = Math.sqrt(Math.max(0, 1 - z * z))
    body.add(k.ico(R, d.stripe, [0, y0 + 0.02, z * R * d.len], [0.9 * f, 0.79 * f, 0.13], 0, 2))
  }
  if (d.mane) body.add(k.ico(0.25, d.mane, [0, y0 + 0.07, 0.26 * d.len], [1.1, 1, 0.8]))
  // 頭（まるく 大きめ）
  const head = new THREE.Group()
  head.position.set(0, y0 + 0.26, 0.3 * d.len + 0.06)
  const H = d.head
  head.add(k.ico(0.26 * H, d.fur, [0, 0, 0], [1.1, 0.95, 0.95]))
  if (d.ruff) for (const s of [-1, 1]) head.add(k.cone(0.09 * H, 0.18 * H, d.ruff, [s * 0.26 * H, -0.08 * H, 0.04 * H], [0, 0, s * 1.9], 5))
  head.add(k.ico(0.1 * H, d.light, [0, -0.08 * H, 0.2 * H], [1.35, 0.75, 0.75]))
  head.add(k.ico(0.032 * H, d.nose ?? '#e86a8a', [0, -0.04 * H, 0.27 * H], [1.3, 0.8, 1], 0, 1))
  const eyes = [k.eye(-0.11 * H, 0.04 * H, 0.21 * H, 0.06 * H), k.eye(0.11 * H, 0.04 * H, 0.21 * H, 0.06 * H)]
  eyes[0].rotation.z = -0.25
  eyes[1].rotation.z = 0.25
  head.add(...eyes)
  if (d.fang) for (const x of [-0.04, 0.04]) head.add(k.cone(0.016 * H, 0.05 * H, '#ffffff', [x * H, -0.14 * H, 0.23 * H], [Math.PI, 0, 0], 4))
  if (d.gem) head.add(k.ico(0.04 * H, d.gem, [0, 0.17 * H, 0.2 * H], [1, 1.3, 0.6], 0.6, 0))
  const ears: THREE.Object3D[] = []
  for (const s of [-1, 1]) {
    const e = k.pivot(s * 0.15 * H, 0.17 * H, 0,
      k.cone(0.1 * H, 0.2 * H, d.fur, [0, 0.09 * H, 0], [0, 0, 0], 4),
      k.cone(0.055 * H, 0.12 * H, '#f2a0b4', [0, 0.07 * H, 0.035 * H], [0, 0, 0], 4))
    e.rotation.z = s * -0.3
    ears.push(e)
    head.add(e)
  }
  body.add(head)
  // しっぽ（しなる。ネコマタは 2 本で 先に ひとだま）
  const tails: ReturnType<typeof chain>[] = []
  const nT = d.tails ?? 1
  for (let i = 0; i < nT; i++) {
    const tip = d.wisp ? k.ico(0.07, d.wisp, [0, 0.03, 0], [1, 1.3, 1], 0.8, 1) : undefined
    const c = chain(k, 4, 0.12, 0.05, 0.035, i % 2 ? d.dark : d.fur, tip)
    c.root.position.set((i - (nT - 1) / 2) * 0.08, y0 + 0.05, -R * d.len * 0.92)
    c.root.rotation.x = -0.9
    c.root.rotation.z = (i - (nT - 1) / 2) * 0.5
    tails.push(c)
    body.add(c.root)
  }
  const legs: THREE.Object3D[] = []
  for (const [x, z] of [[-0.12, 0.2], [0.12, 0.2], [-0.12, -0.2], [0.12, -0.2]]) {
    legs.push(k.pivot(x, d.leg + 0.02, z * d.len,
      k.cyl(0.055, 0.045, d.leg, d.fur, [0, -d.leg / 2, 0]),
      k.ico(0.06, d.light, [0, -d.leg + 0.02, 0.02], [1, 0.65, 1.15], 0, 1)))
  }
  return {
    body, legs, arms: [], eyes,
    extra: (t, a) => {
      tails.forEach((c, j) => c.segs.forEach((g, i) => {
        const w = a === 'sleep' ? 0.08 : a === 'happy' ? 0.5 : 0.28
        g.rotation.x = (i ? 0.32 : 0) + (a === 'sleep' ? 0.3 : 0)
        g.rotation.z = Math.sin(t * (a === 'walk' ? 5 : 2.4) - i * 0.9 + j * 1.7) * w
      }))
      head.rotation.x = a === 'eat' ? 0.5 : a === 'sleep' ? 0.4 : Math.sin(t * 1.1) * 0.05
      head.rotation.z = a === 'idle' ? Math.sin(t * 0.7) * 0.12 : 0
      ears.forEach((e, i) => (e.rotation.x = (t + i * 1.3) % 4.2 < 0.15 ? -0.4 : 0))
    },
  }
}

/** ねこの 赤ちゃん：顔だけの まるい つぶに 三角の 耳 */
function kittenBlob(k: Kit): Omit<Rig, 'root' | 'mats'> {
  k.flat = false
  const body = new THREE.Group()
  body.add(k.ico(0.4, '#f2c890', [0, 0.42, 0], [1.1, 0.92, 1]))
  body.add(k.ico(0.14, '#fff3dc', [0, 0.3, 0.33], [1.45, 0.8, 0.7]))
  body.add(k.ico(0.04, '#e86a8a', [0, 0.36, 0.43], [1.3, 0.8, 1], 0, 1))
  body.add(k.ico(0.13, '#c99a60', [0, 0.72, -0.05], [1.4, 0.35, 1], 0, 1))
  const eyes = [k.eye(-0.16, 0.48, 0.32, 0.065), k.eye(0.16, 0.48, 0.32, 0.065)]
  body.add(...eyes)
  for (const s of [-1, 1]) {
    const e = k.pivot(s * 0.24, 0.7, 0, k.cone(0.13, 0.22, '#f2c890', [0, 0.1, 0], [0, 0, 0], 4), k.cone(0.07, 0.13, '#f2a0b4', [0, 0.08, 0.05], [0, 0, 0], 4))
    e.rotation.z = s * -0.35
    body.add(e)
  }
  const tail = chain(k, 3, 0.1, 0.045, 0.035, '#c99a60')
  tail.root.position.set(0, 0.3, -0.36)
  tail.root.rotation.x = -0.7
  body.add(tail.root)
  const legs = [[-0.2, 0.16], [0.2, 0.16], [-0.2, -0.16], [0.2, -0.16]].map(([x, z]) => k.pivot(x, 0.08, z, k.ico(0.085, '#fff3dc', [0, -0.02, 0], [1, 0.7, 1.2], 0, 0)))
  return {
    body, legs, arms: [], eyes,
    extra: (t, a) => tail.segs.forEach((g, i) => (g.rotation.z = Math.sin(t * (a === 'happy' ? 9 : 3) - i) * 0.4)),
  }
}

// ---------------------------------------------------------------------
/** モンスターの 赤ちゃん：なみなみの すその ちびおばけ（ういて ゆれる） */
function ghostBlob(k: Kit): Omit<Rig, 'root' | 'mats'> {
  k.flat = false
  const body = new THREE.Group()
  const C = '#a879d0', L = '#dcc0f4'
  body.add(k.ico(0.38, C, [0, 0.5, 0], [1, 1.05, 0.95]))
  const hem = new THREE.Group()
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    hem.add(k.cone(0.11, 0.2, C, [Math.sin(a) * 0.27, 0.16, Math.cos(a) * 0.25], [Math.PI, 0, 0], 5))
  }
  body.add(hem)
  body.add(k.ico(0.16, L, [0, 0.4, 0.27], [1.3, 0.9, 0.5]))
  const eyes = [k.eye(-0.14, 0.58, 0.31, 0.065), k.eye(0.14, 0.58, 0.31, 0.065)]
  body.add(...eyes)
  for (const x of [-0.06, 0.06]) body.add(k.cone(0.025, 0.07, '#ffffff', [x, 0.36, 0.37], [Math.PI, 0, 0], 4))
  for (const s of [-1, 1]) body.add(k.cone(0.06, 0.16, '#ffe9b8', [s * 0.17, 0.86, 0], [0, 0, s * -0.35], 5))
  const arms = [-1, 1].map((s) => k.pivot(s * 0.34, 0.5, 0.04, k.ico(0.08, C, [s * 0.05, -0.06, 0], [0.8, 1.2, 0.8], 0, 1)))
  body.add(...arms)
  return {
    body, legs: [], arms, eyes,
    extra: (t) => {
      body.position.y += 0.08 + Math.sin(t * 2.2) * 0.05
      hem.rotation.y = Math.sin(t * 1.6) * 0.25
    },
  }
}

/** こおに / おにの だいしょう：二足・つの・とらがらの こし・（だいしょうは）かたの よろいと とげの かなぼう */
interface Oni {
  skin: string; dark: string; light: string; horn: string; hair: string
  h: number; arm: number; leg: number
  armor?: string; club?: boolean
}
function oniRig(k: Kit, d: Oni): Omit<Rig, 'root' | 'mats'> {
  k.flat = false
  const body = new THREE.Group()
  const hip = d.leg + 0.06
  const tor = 0.26 * d.h
  body.add(k.ico(tor, d.skin, [0, hip + tor * 0.9, 0], [1.05, 1, 0.8]))
  body.add(k.ico(tor * 0.75, d.light, [0, hip + tor * 0.75, 0.07], [1, 0.9, 0.7]))
  // とらがらの こし
  body.add(k.ico(tor * 0.9, '#f0b830', [0, hip + 0.04, 0], [1.12, 0.55, 0.88]))
  for (const x of [-0.12, 0, 0.12]) body.add(k.box(0.035, 0.1, 0.3 * d.h, '#2a1e1a', [x * d.h, hip + 0.04, 0]))
  if (d.armor) for (const s of [-1, 1]) body.add(k.ico(0.12 * d.h, d.armor, [s * tor * 1.0, hip + tor * 1.55, 0], [1.2, 0.7, 1.1]))
  // 頭
  const head = new THREE.Group()
  const hy = hip + tor * 1.8 + 0.2 * d.h
  head.position.set(0, hy, 0.02)
  const H = d.h
  head.add(k.ico(0.24 * H, d.skin, [0, 0, 0], [1.05, 1, 0.95]))
  // あばれ髪
  for (let i = 0; i < 6; i++) {
    const a = -1.2 + (i / 5) * 2.4
    head.add(k.cone(0.08 * H, 0.2 * H, d.hair, [Math.sin(a) * 0.17 * H, 0.15 * H, -0.08 * H + Math.cos(a) * -0.05 * H], [-0.6, 0, -a * 0.6], 5))
  }
  head.add(k.ico(0.2 * H, d.hair, [0, 0.06 * H, -0.06 * H], [1.15, 0.85, 1]))
  const eyes = [k.eye(-0.09 * H, 0.03 * H, 0.2 * H, 0.055 * H), k.eye(0.09 * H, 0.03 * H, 0.2 * H, 0.055 * H)]
  head.add(...eyes)
  for (const s of [-1, 1]) head.add(k.box(0.09 * H, 0.025 * H, 0.03, d.dark, [s * 0.09 * H, 0.11 * H, 0.21 * H]))
  for (const x of [-0.06, 0.06]) head.add(k.cone(0.025 * H, 0.07 * H, '#ffffff', [x * H, -0.1 * H, 0.21 * H], [0, 0, 0], 4))
  for (const s of [-1, 1]) head.add(k.cone(0.05 * H, 0.2 * H, d.horn, [s * 0.11 * H, 0.26 * H, 0.04 * H], [0.15, 0, s * -0.3], 5))
  if (d.armor) head.add(k.cone(0.06 * H, 0.26 * H, d.horn, [0, 0.3 * H, 0.06 * H], [0.2, 0, 0], 5))
  body.add(head)
  // うで（かたで 回す）
  const arms = [-1, 1].map((s) => {
    const parts: THREE.Object3D[] = [
      k.cyl(0.07 * d.h, 0.06 * d.h, d.arm, d.skin, [0, -d.arm / 2, 0]),
      k.ico(0.08 * d.h, d.skin, [0, -d.arm, 0.01], [1, 1, 1], 0, 1),
    ]
    if (d.club && s > 0) {
      const club = new THREE.Group()
      club.position.set(0, -d.arm, 0.04)
      club.rotation.x = 1.25
      club.add(k.cyl(0.035, 0.03, 0.3, '#6a4a2a', [0, 0.1, 0]))
      club.add(k.cyl(0.11, 0.07, 0.4, '#4a3a3a', [0, 0.42, 0]))
      for (let i = 0; i < 8; i++) {
        const a = (i / 4) * Math.PI
        club.add(k.cone(0.03, 0.08, '#e8e2d0', [Math.sin(a) * 0.1, 0.34 + (i % 2) * 0.14, Math.cos(a) * 0.1], [Math.cos(a) * 1.57, 0, -Math.sin(a) * 1.57], 4))
      }
      parts.push(club)
    }
    const p = k.pivot(s * tor * 1.08, hip + tor * 1.5, 0, ...parts)
    p.rotation.z = s * 0.25
    return p
  })
  body.add(...arms)
  const legs = [-1, 1].map((s) => k.pivot(s * 0.11 * d.h, hip, 0,
    k.cyl(0.08 * d.h, 0.07 * d.h, d.leg, d.skin, [0, -d.leg / 2, 0]),
    k.ico(0.08 * d.h, d.dark, [0, -d.leg + 0.02, 0.03], [1, 0.6, 1.3], 0, 1)))
  return {
    body, legs, arms, eyes,
    extra: (t, a) => {
      head.rotation.x = a === 'eat' ? 0.4 : a === 'sleep' ? 0.5 : 0
      head.rotation.y = a === 'idle' ? Math.sin(t * 0.8) * 0.3 : 0
    },
  }
}

/** モンスターの 完成期 ヤマタン：うかぶ おばけの 体に 3 つの りゅうの 首・こうもりの はね・むねの たま */
function hydraRig(k: Kit): Omit<Rig, 'root' | 'mats'> {
  k.flat = false
  const C = '#6a4a9a', D = '#3d2a62', L = '#b49ae8', G = '#ff6ad9', Hn = '#ffd23f'
  const body = new THREE.Group()
  body.add(k.ico(0.36, C, [0, 0.5, 0], [1.1, 0.95, 1]))
  body.add(k.ico(0.26, L, [0, 0.45, 0.14], [1.05, 0.9, 0.8]))
  body.add(k.ico(0.08, G, [0, 0.55, 0.36], [1, 1.2, 0.6], 0.7, 1))
  const hem = new THREE.Group()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    hem.add(k.cone(0.12, 0.26, C, [Math.sin(a) * 0.3, 0.14, Math.cos(a) * 0.28], [Math.PI, 0, 0], 5))
  }
  body.add(hem)
  for (let i = 0; i < 4; i++) body.add(k.cone(0.05, 0.18, G, [0, 0.82 - i * 0.07, -0.12 - i * 0.1], [-0.6 - i * 0.2, 0, 0], 4, 0.4))
  // こうもりの はね
  const wings = [-1, 1].map((s) => {
    const w = new THREE.Group()
    w.position.set(s * 0.3, 0.65, -0.12)
    w.add(k.cyl(0.025, 0.02, 0.5, D, [s * 0.22, 0.12, 0], [0, 0, s * -1.1]))
    for (let i = 0; i < 3; i++) w.add(k.cone(0.13, 0.36, D, [s * (0.18 + i * 0.12), 0.08 - i * 0.04, 0], [0, 0, s * (2.4 + i * 0.2)], 3))
    body.add(w)
    return w
  })
  // 3 つの 首（しなる くさり + りゅうの 頭）
  const necks: ReturnType<typeof chain>[] = []
  const eyes: THREE.Object3D[] = []
  for (let i = -1; i <= 1; i++) {
    const h = new THREE.Group()
    h.add(k.ico(0.13, C, [0, 0.06, 0.03], [1, 0.9, 1.15]))
    h.add(k.ico(0.08, L, [0, 0.02, 0.15], [1.1, 0.75, 1.1]))
    for (const s of [-1, 1]) {
      const e = k.eye(s * 0.07, 0.1, 0.1, 0.035, '#ffd23f')
      eyes.push(e)
      h.add(e)
      h.add(k.cone(0.03, 0.14, Hn, [s * 0.06, 0.18, -0.04], [-0.6, 0, s * -0.3], 4))
    }
    for (const x of [-0.04, 0.04]) h.add(k.cone(0.015, 0.05, '#ffffff', [x, -0.03, 0.2], [Math.PI, 0, 0], 4))
    h.scale.setScalar(1.25)
    const c = chain(k, 3, 0.17, 0.085, 0.07, C, h)
    c.root.position.set(i * 0.18, 0.78, 0.05)
    c.root.rotation.z = -i * 0.55
    c.root.rotation.x = 0.15
    necks.push(c)
    body.add(c.root)
  }
  // つきだす 手
  const arms = [-1, 1].map((s) => k.pivot(s * 0.36, 0.5, 0.06, k.ico(0.09, C, [s * 0.05, -0.08, 0], [0.8, 1.3, 0.8], 0, 1)))
  body.add(...arms)
  return {
    body, legs: [], arms, eyes,
    extra: (t, a) => {
      body.position.y += 0.12 + Math.sin(t * 1.8) * 0.05
      hem.rotation.y = Math.sin(t * 1.3) * 0.2
      const f = a === 'sleep' ? 0.05 : a === 'walk' || a === 'attack' ? 0.6 : 0.3
      wings.forEach((w, i) => (w.rotation.y = (i ? -1 : 1) * (0.2 + Math.sin(t * 6) * f)))
      necks.forEach((c, j) => c.segs.forEach((g, i) => {
        g.rotation.x = (a === 'sleep' ? 0.5 : i === 2 ? 0.5 : -0.1) + (a === 'attack' && j === 1 ? 0.35 : 0)
        g.rotation.z = Math.sin(t * 1.7 + j * 2.1 - i * 0.7) * 0.18
      }))
    },
  }
}

// ---------------------------------------------------------------------
/** 3D モデルがある種族（無い種族は World 側でドット絵にする） */
const BUILD: Partial<Record<SpeciesId, (k: Kit) => Omit<Rig, "root" | "mats">>> = {
  wanko: (k) => pupBlob(k),
  mimiko: (k) => kittenBlob(k),
  tsumeru: (k) => catRig(k, { fur: '#f09a50', dark: '#b8561a', light: '#ffe0b8', len: 1.05, leg: 0.26, head: 1.2, stripe: '#7a3a18' }),
  torahime: (k) => catRig(k, { fur: '#f4b040', dark: '#a86a14', light: '#fff0c8', len: 1.4, leg: 0.38, head: 1.05, stripe: '#4a2a14', ruff: '#fff0c8', fang: true }),
  nekomata: (k) => catRig(k, { fur: '#6a4aa8', dark: '#3d2870', light: '#c0a8f0', len: 1.55, leg: 0.44, head: 1.05, mane: '#ffaad2', ruff: '#ffaad2', fang: true, tails: 2, wisp: '#ff7ad9', gem: '#ff7ad9' }),
  gabuko: (k) => ghostBlob(k),
  oniko: (k) => oniRig(k, { skin: '#f07a80', dark: '#a83040', light: '#ffc0c0', horn: '#fff0c2', hair: '#4a2a3a', h: 1, arm: 0.26, leg: 0.22 }),
  ogaran: (k) => oniRig(k, { skin: '#d04a50', dark: '#7a1a28', light: '#ff9aa0', horn: '#ffe9a8', hair: '#2a1a24', h: 1.25, arm: 0.36, leg: 0.3, armor: '#4a3a3a', club: true }),
  yamatan: (k) => hydraRig(k),
  kibaru: (k) => dogRig(k, { fur: '#8a6a4a', dark: '#523a24', light: '#d8b898', len: 1.15, leg: 0.3, head: 1.15, ear: 'flop', snout: 1.2, collar: '#d8483a', fang: true }),
  garufu: (k) => dogRig(k, { fur: '#7a8aa8', dark: '#4a566e', light: '#dfe6f2', len: 1.45, leg: 0.4, head: 1, ear: 'point', snout: 1.7, scarf: '#c8403a', mane: '#eef2fa', fang: true }),
  rouga: (k) => dogRig(k, { fur: '#e2e8f4', dark: '#8a9ac0', light: '#ffffff', len: 1.6, leg: 0.46, head: 1, ear: 'point', snout: 1.8, mane: '#9fdcef', fang: true, crystal: '#7fd1ff', plate: '#8fb4d8' }),
  mebu(k) {
    const body = new THREE.Group()
    body.add(k.sph(0.42, '#6fd26a', [0, 0.42, 0], [1.05, 0.9, 1]))
    body.add(k.sph(0.26, '#b8f0a0', [0, 0.36, 0.22], [1, 0.9, 0.6]))
    body.add(k.cyl(0.025, 0.03, 0.18, '#3f9e4a', [0, 0.86, 0]))
    const leafL = k.sph(0.12, '#8ee86a', [-0.11, 0.97, 0], [1.3, 0.35, 0.7])
    leafL.rotation.z = 0.5
    const leafR = k.sph(0.12, '#a6f27c', [0.12, 1.0, 0], [1.3, 0.35, 0.7])
    leafR.rotation.z = -0.5
    body.add(leafL, leafR)
    const eyes = [k.eye(-0.14, 0.5, 0.36), k.eye(0.14, 0.5, 0.36)]
    body.add(...eyes)
    body.add(k.sph(0.05, '#ff9eb5', [-0.25, 0.4, 0.3], [1, 0.6, 0.4]), k.sph(0.05, '#ff9eb5', [0.25, 0.4, 0.3], [1, 0.6, 0.4]))
    const legs = [-0.17, 0.17].map((x) => k.pivot(x, 0.1, 0.05, k.sph(0.1, '#3f9e4a', [0, -0.03, 0.04], [1, 0.7, 1.3])))
    return {
      body, legs, arms: [], eyes,
      extra: (t) => {
        leafL.rotation.z = 0.5 + Math.sin(t * 3) * 0.12
        leafR.rotation.z = -0.5 - Math.sin(t * 3 + 1) * 0.12
      },
    }
  },
  pikori(k) {
    const body = new THREE.Group()
    body.add(k.sph(0.42, '#ffd23f', [0, 0.45, 0]))
    body.add(k.sph(0.27, '#fff0c2', [0, 0.38, 0.22], [1, 1, 0.6]))
    body.add(k.cone(0.07, 0.18, '#ff8a3d', [0, 0.47, 0.45], [Math.PI / 2, 0, 0]))
    const stem = k.cyl(0.015, 0.02, 0.22, '#5b4a00', [-0.04, 0.95, 0], [0, 0, 0.2])
    const bulb = k.sph(0.09, '#7fe0ff', [-0.07, 1.08, 0], [1, 1, 1], 0.9)
    body.add(stem, bulb)
    const eyes = [k.eye(-0.13, 0.55, 0.37), k.eye(0.13, 0.55, 0.37)]
    body.add(...eyes)
    const arms = [-1, 1].map((s) => k.pivot(s * 0.38, 0.5, 0, k.sph(0.16, '#e0a400', [s * 0.06, -0.08, 0], [0.45, 1, 0.8])))
    body.add(...arms)
    const legs = [-0.14, 0.14].map((x) => k.pivot(x, 0.08, 0.05, k.cone(0.06, 0.12, '#ff8a3d', [0, -0.02, 0.03], [Math.PI, 0, 0])))
    return {
      body, legs, arms, eyes,
      extra: (t) => {
        ;(bulb.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.6 + Math.sin(t * 4) * 0.4
      },
    }
  },
  gorota(k) {
    const body = new THREE.Group()
    body.add(k.sph(0.5, '#8a94a6', [0, 0.32, -0.05], [1.15, 0.6, 1.05]))
    body.add(k.sph(0.36, '#6f7889', [0, 0.18, -0.05], [1.3, 0.35, 1.2]))
    for (const [x, z, h] of [[-0.18, -0.1, 0.45], [0.05, -0.05, 0.6], [0.24, -0.15, 0.38], [-0.02, -0.32, 0.42]] as const) {
      const c = k.cone(0.1, h, '#5ef2ff', [x, 0.55 + h / 2, z], [0, 0, 0], 6, 0.35)
      c.rotation.z = x * 0.6
      body.add(c)
    }
    const head = new THREE.Group()
    head.position.set(0, 0.32, 0.5)
    head.add(k.sph(0.2, '#9aa4b6', [0, 0, 0], [1, 0.9, 1.1]))
    const eyes = [k.eye(-0.09, 0.05, 0.17, 0.05), k.eye(0.09, 0.05, 0.17, 0.05)]
    head.add(...eyes)
    body.add(head)
    const legs = [
      [-0.35, 0.25], [0.35, 0.25], [-0.35, -0.3], [0.35, -0.3],
    ].map(([x, z]) => k.pivot(x, 0.18, z, k.cyl(0.08, 0.09, 0.2, '#5f6878', [0, -0.08, 0])))
    return {
      body, legs, arms: [], eyes,
      extra: (t, anim) => {
        head.rotation.x = anim === 'eat' ? 0.3 + Math.sin(t * 12) * 0.2 : Math.sin(t * 1.5) * 0.05
      },
    }
  },
  fuwari(k) {
    const body = new THREE.Group()
    for (const [x, y, r] of [[-0.24, 0.62, 0.24], [0.24, 0.62, 0.24], [0, 0.72, 0.34], [0, 0.6, 0.28]] as const)
      body.add(k.sph(r, '#fbf6ff', [x, y, 0], [1, 0.9, 0.95]))
    body.add(k.sph(0.2, '#e2d2f6', [0, 0.52, -0.05], [1.6, 0.5, 1.2]))
    const eyes = [k.eye(-0.12, 0.72, 0.3, 0.06, '#4a2d6b'), k.eye(0.12, 0.72, 0.3, 0.06, '#4a2d6b')]
    body.add(...eyes)
    body.add(k.sph(0.05, '#ff9ecb', [-0.24, 0.64, 0.24], [1, 0.6, 0.4]), k.sph(0.05, '#ff9ecb', [0.24, 0.64, 0.24], [1, 0.6, 0.4]))
    // 触手：小さな球のくさり
    const ribbons = [-0.18, 0, 0.18].map((x, i) => {
      const g = new THREE.Group()
      g.position.set(x, 0.45, 0.02)
      for (let j = 0; j < 5; j++) g.add(k.sph(0.045 - j * 0.004, j > 2 ? '#ffd0e6' : '#ff9ecb', [0, -j * 0.08, 0]))
      g.userData.phase = i
      return g
    })
    body.add(...ribbons)
    return {
      body, legs: [], arms: [], eyes,
      extra: (t) => {
        ribbons.forEach((r, i) => {
          r.children.forEach((c, j) => (c.position.x = Math.sin(t * 2.4 + i + j * 0.7) * 0.03 * j))
          r.rotation.x = Math.sin(t * 1.6 + i) * 0.15
        })
      },
    }
  },
  giaru(k) {
    const body = new THREE.Group()
    // 角ばった胴体 + 丸い頭（ロボット型）
    body.add(k.box(0.5, 0.36, 0.38, '#8e6cff', [0, 0.38, 0]))
    body.add(k.box(0.22, 0.14, 0.04, '#2a1a5e', [0, 0.4, 0.2]))
    const panel = k.box(0.16, 0.06, 0.02, '#5ef2ff', [0, 0.41, 0.225], 0.8)
    body.add(panel)
    const head = new THREE.Group()
    head.position.set(0, 0.78, 0)
    head.add(k.sph(0.26, '#a58cff', [0, 0, 0], [1.1, 0.95, 1]))
    // 丸いゴーグルの目（左右 2 つ）
    const eyes = [-1, 1].map((sd) => {
      const g = new THREE.Group()
      g.position.set(sd * 0.11, 0.02, 0.22)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 8, 18), k.mat('#c9ced6'))
      g.add(ring, k.sph(0.06, '#ff4d6d', [0, 0, -0.01], [1, 1, 0.5], 0.7), k.sph(0.02, '#ffffff', [-0.02, 0.025, 0.02]))
      return g
    })
    head.add(...eyes)
    const gear = new THREE.Group()
    gear.position.set(-0.28, 0.06, 0)
    gear.rotation.y = Math.PI / 2
    gear.add(new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.03, 8, 16), k.mat('#c9ced6')))
    for (let i = 0; i < 6; i++) gear.add(k.box(0.045, 0.045, 0.045, '#9aa1ab', [Math.cos((i / 6) * Math.PI * 2) * 0.11, Math.sin((i / 6) * Math.PI * 2) * 0.11, 0]))
    head.add(gear)
    head.add(k.cyl(0.015, 0.015, 0.18, '#c9ced6', [0.12, 0.3, 0]), k.sph(0.04, '#ffd23f', [0.12, 0.41, 0], [1, 1, 1], 0.8))
    body.add(head)
    const tail = new THREE.Group()
    tail.position.set(0, 0.3, -0.2)
    tail.add(k.cyl(0.025, 0.025, 0.3, '#3d2a8a', [0, -0.05, -0.12], [1.1, 0, 0]), k.box(0.12, 0.1, 0.1, '#ffd23f', [0, -0.12, -0.28]))
    body.add(tail)
    const arms = [-1, 1].map((sd) => k.pivot(sd * 0.3, 0.5, 0, k.cyl(0.045, 0.05, 0.26, '#5b3fc9', [0, -0.12, 0]), k.sph(0.06, '#c9ced6', [0, -0.27, 0])))
    body.add(...arms)
    const legs = [-0.13, 0.13].map((x) => k.pivot(x, 0.2, 0, k.box(0.13, 0.2, 0.18, '#3d2a8a', [0, -0.1, 0.02])))
    return {
      body, legs, arms, eyes,
      extra: (t) => {
        gear.rotation.z = t * 1.5
        tail.rotation.y = Math.sin(t * 3) * 0.4
        head.rotation.z = Math.sin(t * 1.2) * 0.06
        panel.visible = Math.sin(t * 5) > -0.3
      },
    }
  },
  noiz(k) {
    const body = new THREE.Group()
    // とげとげの体：二十面体の頂点を外へ押し出す
    const geo = new THREE.IcosahedronGeometry(0.4, 2)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i)
      const n = Math.sin(v.x * 17) * Math.sin(v.y * 13) * Math.sin(v.z * 11)
      v.multiplyScalar(1 + Math.max(0, n) * 0.6)
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    geo.computeVertexNormals()
    const spiky = new THREE.Mesh(geo, k.mat('#2b2350'))
    spiky.position.y = 0.48
    body.add(spiky)
    body.add(k.sph(0.17, '#ffffff', [0, 0.52, 0.32], [1, 0.85, 0.5]))
    const pupil = k.sph(0.09, '#ff3b5c', [0, 0.52, 0.4], [1, 1, 0.5], 0.6)
    body.add(pupil)
    const eyes = [pupil]
    const bits = Array.from({ length: 6 }, (_, i) => {
      const b = k.box(0.07, 0.07, 0.07, i % 2 ? '#ff3bd4' : '#3bf2ff', [0, 0.5, 0], 0.9)
      b.userData.phase = (i / 6) * Math.PI * 2
      body.add(b)
      return b
    })
    return {
      body, legs: [], arms: [], eyes,
      extra: (t) => {
        spiky.rotation.y = Math.sin(t * 1.3) * 0.3
        bits.forEach((b, i) => {
          const a = t * 1.8 + b.userData.phase
          b.position.set(Math.cos(a) * 0.55, 0.5 + Math.sin(t * 3 + i) * 0.15, Math.sin(a) * 0.55)
          b.rotation.set(t * 2, t * 3, 0)
          // ときどき消える（データが壊れている）
          b.visible = Math.sin(t * 7 + i * 3) > -0.6
        })
      },
    }
  },
  hireru(k) {
    const body = new THREE.Group()
    body.add(k.sph(0.38, '#3fc1c9', [0, 0.48, 0], [0.9, 0.85, 1.25]))
    body.add(k.sph(0.25, '#eafcff', [0, 0.38, 0.12], [0.9, 0.6, 1.1]))
    body.add(k.cone(0.16, 0.34, '#ff9f6b', [0, 0.88, -0.05], [-0.3, 0, 0]))
    const tail = new THREE.Group()
    tail.position.set(0, 0.48, -0.45)
    const fin1 = k.cone(0.14, 0.32, '#ff9f6b', [0, 0.1, -0.12], [-2.2, 0, 0])
    const fin2 = k.cone(0.14, 0.32, '#e8743f', [0, -0.1, -0.12], [-0.9, 0, 0])
    fin1.scale.x = fin2.scale.x = 0.3
    tail.add(fin1, fin2)
    body.add(tail)
    const arms = [-1, 1].map((s) => {
      const f = k.cone(0.08, 0.2, '#1f8a9a', [s * 0.05, 0, 0], [0, 0, s * -1.6])
      f.scale.z = 0.4
      return k.pivot(s * 0.32, 0.4, 0.05, f)
    })
    body.add(...arms)
    const eyes = [k.eye(-0.17, 0.56, 0.36, 0.07), k.eye(0.17, 0.56, 0.36, 0.07)]
    body.add(...eyes)
    return {
      body, legs: [], arms, eyes,
      extra: (t, anim) => {
        tail.rotation.y = Math.sin(t * (anim === 'walk' ? 9 : 4)) * 0.45
      },
    }
  },
  mofuru(k) {
    const body = new THREE.Group()
    body.add(k.sph(0.4, '#fbfdff', [0, 0.46, 0]))
    // もこもこ：まわりに小さな球をぐるりと
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2
      const y = 0.46 + Math.sin(i * 1.7) * 0.18
      body.add(k.sph(0.14, i % 2 ? '#eef3fb' : '#ffffff', [Math.cos(a) * 0.38, y, Math.sin(a) * 0.38]))
    }
    const earL = k.cone(0.09, 0.3, '#5b8fe0', [-0.2, 0.92, 0], [0, 0, 0.35])
    const earR = k.cone(0.09, 0.3, '#7fb2ff', [0.2, 0.92, 0], [0, 0, -0.35])
    body.add(earL, earR)
    const eyes = [k.eye(-0.13, 0.55, 0.42, 0.06, '#2a3a6a'), k.eye(0.13, 0.55, 0.42, 0.06, '#2a3a6a')]
    body.add(...eyes)
    body.add(k.sph(0.05, '#ffb3c8', [-0.24, 0.45, 0.38], [1, 0.6, 0.4]), k.sph(0.05, '#ffb3c8', [0.24, 0.45, 0.38], [1, 0.6, 0.4]))
    const legs = [-0.16, 0.16].map((x) => k.pivot(x, 0.08, 0.05, k.sph(0.09, '#9fb4d6', [0, -0.02, 0.03], [1, 0.7, 1.3])))
    return {
      body, legs, arms: [], eyes,
      extra: (t) => {
        earL.rotation.z = 0.35 + Math.sin(t * 2.5) * 0.1
        earR.rotation.z = -0.35 - Math.sin(t * 2.5 + 0.8) * 0.1
      },
    }
  },
}

export const hasModel = (id: SpeciesId) => id in BUILD
/** いつも 3D で 出す 種族（キャラを 3D に する ためし：いぬの 1 本道） */
export const ALWAYS_3D = new Set<string>(['wanko', 'kibaru', 'garufu', 'rouga', 'mimiko', 'tsumeru', 'torahime', 'nekomata', 'gabuko', 'oniko', 'ogaran', 'yamatan'])

export class MonsterModel {
  /** World から位置・表示を操作するためのルート（SpriteAnim と同じ名前） */
  readonly sprite = new THREE.Group()
  facing: 1 | -1 = 1
  private rig!: Rig
  private anim = 'idle'
  private t = Math.random() * 10
  private yaw = 0
  private last = new THREE.Vector3()
  private speed = 0

  constructor(private id: SpeciesId, private height: number) {
    this.build()
  }

  private build() {
    const k = new Kit()
    const parts = (BUILD[this.id] ?? BUILD.mebu!)(k)
    const root = new THREE.Group()
    root.add(parts.body, ...parts.legs)
    this.rig = { ...parts, root, mats: k.mats }
    this.sprite.add(root)
    this.setHeight(this.height)
  }

  /** 進化：模型ごと作り直す */
  setSpecies(id: SpeciesId, height: number) {
    this.dispose()
    this.sprite.clear()
    this.id = id
    this.height = height
    this.build()
  }

  setHeight(h: number) {
    this.height = h
    this.rig.root.scale.setScalar(h * SCALE)
  }

  play(name: string) {
    if (name === this.anim) return
    this.anim = name
    this.t = 0
  }

  update(dt: number) {
    this.t += dt
    const t = this.t
    const r = this.rig
    const a = this.anim

    // 向き：歩いている方向へ体ごと回る。止まっている時はカメラ寄りに
    const p = this.sprite.position
    const dx = p.x - this.last.x
    const dz = p.z - this.last.z
    this.last.copy(p)
    const v = dt > 0 ? Math.hypot(dx, dz) / dt : 0
    this.speed += (v - this.speed) * Math.min(1, dt * 10)
    let target = this.yaw
    if (this.speed > 0.3 && v < 20) target = Math.atan2(dx, dz)
    else if (a === 'attack' || a === 'hurt') target = (this.facing * Math.PI) / 2
    else if (a !== 'walk') target = this.facing * 0.5
    let diff = target - this.yaw
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    this.yaw += diff * Math.min(1, dt * 8)
    r.root.rotation.y = this.yaw

    // 基本の姿勢
    let bob = Math.sin(t * 3) * 0.015
    let sy = 1 + Math.sin(t * 3) * 0.025
    let lean = 0
    let roll = 0
    let leg = 0
    let arm = 0
    let eyeY = 1
    switch (a) {
      case 'walk':
        bob = Math.abs(Math.sin(t * 9)) * 0.06
        leg = Math.sin(t * 9) * 0.7
        arm = -Math.sin(t * 9) * 0.6
        roll = Math.sin(t * 4.5) * 0.08
        break
      case 'attack':
        lean = 0.4
        arm = -1.2
        break
      case 'hurt':
        lean = -0.35
        roll = Math.sin(t * 40) * 0.08
        break
      case 'eat':
        lean = 0.2 + Math.sin(t * 11) * 0.15
        break
      case 'sleep':
        sy = 0.86 + Math.sin(t * 1.5) * 0.03
        eyeY = 0.12
        roll = 0.12
        break
      case 'happy':
        arm = -2 + Math.sin(t * 14) * 0.5
        eyeY = 0.45
        r.body.rotation.y = Math.sin(t * 8) * 0.25
        break
    }
    if (a !== 'happy') r.body.rotation.y = 0
    // まばたき
    if (a !== 'sleep' && a !== 'happy' && (t % 3.7) < 0.12) eyeY = 0.1
    r.body.position.y = bob
    r.body.scale.set(1 + (1 - sy) * 0.5, sy, 1 + (1 - sy) * 0.5)
    r.body.rotation.x = lean
    r.body.rotation.z = roll
    r.legs.forEach((l, i) => (l.rotation.x = (i % 2 ? -leg : leg) * (r.legs.length > 2 && i >= 2 ? -1 : 1)))
    r.arms.forEach((l, i) => {
      l.rotation.x = arm * (a === 'walk' ? (i % 2 ? -1 : 1) : 1)
      l.rotation.z = a === 'happy' ? (i ? 1 : -1) * 0.6 : 0
    })
    r.eyes.forEach((e) => (e.scale.y = eyeY))
    // やられた時は赤く光る
    const hurt = a === 'hurt' ? 0.6 : 0
    for (const m of r.mats) {
      if (!m.userData.base) m.userData.base = { e: m.emissive.clone(), i: m.emissiveIntensity }
      if (hurt) {
        m.emissive.set('#ff2a2a')
        m.emissiveIntensity = hurt
      } else {
        m.emissive.copy(m.userData.base.e)
        m.emissiveIntensity = m.userData.base.i
      }
    }
    r.extra?.(t, a)
  }

  dispose() {
    this.rig.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
    this.rig.mats.forEach((m) => m.dispose())
  }
}
