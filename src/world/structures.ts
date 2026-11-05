import * as THREE from 'three'

/**
 * 家のほかの建物（はたけ・いど・みはりとう・ゆりかごごや・へい・おしろ・はし）の定義と 3D モデル。
 * モデルは単純な箱・筒・円すいだけで作る（World 側で psx() の材質に包まれる）。
 * 建設中は World 側で縦に縮めて杭を立てるだけなので、ここでは完成形だけ作る。
 */
export type StructKind = 'farm' | 'well' | 'tower' | 'cradle' | 'wall' | 'castle' | 'bridge'

export interface StructSpec {
  name: string
  /** 完成に必要な資材の数 */
  need: number
  hp: number
  /** 当たり判定の半径（0 = 歩ける） */
  r: number
  /** 村のにぎわい度に足される点 */
  score: number
}

export const STRUCTS: Record<StructKind, StructSpec> = {
  farm: { name: 'はたけ', need: 4, hp: 30, r: 0, score: 1 },
  well: { name: 'いど', need: 3, hp: 40, r: 0.5, score: 1 },
  tower: { name: 'みはりとう', need: 6, hp: 90, r: 0.6, score: 1.5 },
  cradle: { name: 'ゆりかごごや', need: 5, hp: 60, r: 0.7, score: 1 },
  wall: { name: 'へい', need: 2, hp: 60, r: 0.6, score: 0.25 },
  castle: { name: 'おしろ', need: 14, hp: 260, r: 1.5, score: 4 },
  bridge: { name: 'はし', need: 4, hp: 40, r: 0, score: 1 },
}

export const isStructKind = (v: unknown): v is StructKind => typeof v === 'string' && Object.prototype.hasOwnProperty.call(STRUCTS, v)

/** ステージごとの建物の色（家のかべ・石・屋根のもと） */
export interface BuildStyle { wall: string; stone: string; roof: string; accent: string }
export const STYLES: BuildStyle[] = [
  { wall: '#a0703f', stone: '#9aa1ab', roof: '#b85a4a', accent: '#ffd23f' }, // はじまりの森
  { wall: '#d9c38a', stone: '#c9b27a', roof: '#4fb8c8', accent: '#fff27a' }, // ガラスの砂丘
  { wall: '#f2b6a8', stone: '#e6cfc4', roof: '#3fa0c8', accent: '#ff9ecb' }, // さんごの入り江
  { wall: '#f1eee6', stone: '#d6dfea', roof: '#7f9fd8', accent: '#ffffff' }, // わたゆきの原
  { wall: '#bfe3f2', stone: '#9cc4da', roof: '#e8f6ff', accent: '#7fe8ff' }, // こおりの回路峰
]
export const styleOf = (stage: number) => STYLES[stage] ?? STYLES[0]

export interface ModelCtx {
  lam: (color: string, map?: THREE.Texture) => THREE.Material
  basic: (color: string) => THREE.Material
  rock: THREE.Texture
  bark: THREE.Texture
  style: BuildStyle
}

const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  return m
}
const cyl = (rt: number, rb: number, h: number, seg: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat)
  m.position.set(x, y, z)
  return m
}
const cone = (r: number, h: number, seg: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat)
  m.position.set(x, y, z)
  return m
}

function flag(ctx: ModelCtx, x: number, y: number, z: number) {
  const g = new THREE.Group()
  g.add(cyl(0.015, 0.015, 0.5, 4, ctx.lam('#3d2a1e'), 0, 0.25, 0))
  g.add(box(0.28, 0.16, 0.02, ctx.basic(ctx.style.accent), 0.15, 0.42, 0))
  g.position.set(x, y, z)
  return g
}

export function buildStructModel(kind: StructKind, ctx: ModelCtx, len = 3): THREE.Group {
  const g = new THREE.Group()
  // 石は家より明るめにして、遠くからでも見分けやすくする
  const stone = ctx.lam('#' + new THREE.Color(ctx.style.stone).lerp(new THREE.Color('#ffffff'), 0.45).getHexString(), ctx.rock)
  const wood = ctx.lam(ctx.style.wall, ctx.bark)
  const dark = ctx.lam('#3d2a1e')
  const roof = ctx.lam(ctx.style.roof)
  switch (kind) {
    case 'farm': {
      g.add(box(1.9, 0.1, 1.5, ctx.lam('#5a3d28'), 0, 0.05, 0))
      for (const z of [-0.45, 0, 0.45]) {
        g.add(box(1.6, 0.06, 0.16, ctx.lam('#3f2a1b'), 0, 0.12, z))
        for (let i = 0; i < 5; i++) {
          const leaf = cone(0.1, 0.3, 5, ctx.lam(i % 2 ? '#5cc25a' : '#7fd05a'), -0.65 + i * 0.32, 0.27, z)
          g.add(leaf)
          if (i % 2) g.add(box(0.07, 0.07, 0.07, ctx.basic('#ff7a4a'), -0.65 + i * 0.32, 0.12, z + 0.08))
        }
      }
      for (const [x, z] of [[-0.95, -0.75], [0.95, -0.75], [-0.95, 0.75], [0.95, 0.75]]) g.add(cyl(0.04, 0.05, 0.4, 5, wood, x, 0.2, z))
      // かかし
      g.add(cyl(0.03, 0.03, 0.7, 4, wood, 0.8, 0.45, 0))
      g.add(box(0.5, 0.05, 0.05, wood, 0.8, 0.6, 0))
      g.add(box(0.16, 0.16, 0.16, ctx.lam('#e8d9a8'), 0.8, 0.86, 0))
      break
    }
    case 'well': {
      g.add(cyl(0.42, 0.46, 0.4, 10, stone, 0, 0.2, 0))
      const water = new THREE.Mesh(new THREE.CircleGeometry(0.34, 10).rotateX(-Math.PI / 2), ctx.basic('#3fa7e8'))
      water.position.y = 0.36
      g.add(water)
      for (const x of [-0.4, 0.4]) g.add(box(0.07, 0.85, 0.07, wood, x, 0.8, 0))
      g.add(box(0.95, 0.07, 0.07, wood, 0, 1.2, 0))
      const rf = cone(0.62, 0.34, 4, roof, 0, 1.4, 0)
      rf.rotation.y = Math.PI / 4
      g.add(rf)
      g.add(cyl(0.09, 0.07, 0.14, 6, wood, 0, 0.88, 0))
      break
    }
    case 'tower': {
      g.add(cyl(0.42, 0.52, 1.5, 8, stone, 0, 0.75, 0))
      g.add(cyl(0.6, 0.5, 0.2, 8, stone, 0, 1.6, 0))
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        g.add(box(0.2, 0.2, 0.2, stone, Math.cos(a) * 0.52, 1.82, Math.sin(a) * 0.52))
      }
      g.add(cone(0.48, 0.6, 8, roof, 0, 2.15, 0))
      g.add(box(0.1, 0.3, 0.06, ctx.basic('#ffd27a'), 0, 1.1, 0.46))
      g.add(box(0.1, 0.3, 0.06, ctx.basic('#ffd27a'), 0, 1.1, -0.46))
      g.add(flag(ctx, 0, 2.4, 0))
      break
    }
    case 'cradle': {
      g.add(cyl(0.65, 0.72, 0.55, 10, ctx.lam('#f6d6e0'), 0, 0.275, 0))
      g.add(cone(0.9, 0.6, 10, ctx.lam('#ff9ecb'), 0, 0.85, 0))
      g.add(box(0.28, 0.4, 0.05, dark, 0, 0.22, 0.7))
      const egg = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), ctx.lam('#fff3d6'))
      egg.scale.set(1, 1.3, 1)
      egg.position.set(0, 1.28, 0)
      g.add(egg)
      for (let i = 0; i < 3; i++) g.add(box(0.06, 0.06, 0.06, ctx.basic('#7fd1ff'), -0.08 + i * 0.08, 1.22 + i * 0.05, 0.15))
      break
    }
    case 'wall': {
      g.add(box(1.2, 0.7, 0.34, stone, 0, 0.35, 0))
      for (const x of [-0.4, 0, 0.4]) g.add(box(0.26, 0.16, 0.34, stone, x, 0.78, 0))
      break
    }
    case 'castle': {
      g.add(box(2.6, 0.5, 2.2, stone, 0, 0.25, 0))
      g.add(box(1.3, 1.7, 1.2, stone, 0, 1.35, 0))
      for (const [x, z] of [[-0.5, -0.45], [0.5, -0.45], [-0.5, 0.45], [0.5, 0.45], [0, -0.45], [0, 0.45]]) g.add(box(0.22, 0.2, 0.22, stone, x, 2.3, z))
      const kr = cone(0.9, 0.9, 4, roof, 0, 2.75, 0)
      kr.rotation.y = Math.PI / 4
      g.add(kr)
      for (const [x, z] of [[-1.15, -0.95], [1.15, -0.95], [-1.15, 0.95], [1.15, 0.95]]) {
        g.add(cyl(0.32, 0.38, 1.5, 8, stone, x, 1.25, z))
        g.add(cone(0.44, 0.55, 8, roof, x, 2.25, z))
        g.add(box(0.08, 0.22, 0.05, ctx.basic('#ffd27a'), x, 1.4, z + 0.33))
      }
      g.add(box(0.5, 0.62, 0.06, dark, 0, 0.8, 0.62))
      g.add(box(0.2, 0.26, 0.05, ctx.basic('#ffd27a'), -0.3, 1.7, 0.62))
      g.add(box(0.2, 0.26, 0.05, ctx.basic('#ffd27a'), 0.3, 1.7, 0.62))
      g.add(flag(ctx, 0, 3.1, 0))
      g.add(flag(ctx, -1.15, 2.5, -0.95))
      g.add(flag(ctx, 1.15, 2.5, -0.95))
      break
    }
    case 'bridge': {
      const n = Math.max(3, Math.round(len / 0.3))
      for (let i = 0; i < n; i++) g.add(box(0.28, 0.07, 1.0, wood, -len / 2 + (i + 0.5) * (len / n), 0.03, 0))
      for (const z of [-0.5, 0.5]) {
        g.add(box(len, 0.07, 0.06, wood, 0, 0.3, z))
        for (let i = 0; i <= 4; i++) g.add(box(0.07, 0.34, 0.07, wood, -len / 2 + (i / 4) * len, 0.17, z))
      }
      break
    }
  }
  return g
}
