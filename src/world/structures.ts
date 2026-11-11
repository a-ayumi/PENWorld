import * as THREE from 'three'

/**
 * 家のほかの建物（はたけ・いど・みはりとう・ゆりかごごや・へい・おしろ・はし・ふんすい・ふうしゃ・とうだい・いちば・あそびば・いしのとりで）の定義と 3D モデル。
 * モデルは単純な箱・筒・円すいだけで作る（World 側で psx() の材質に包まれる）。
 * 建設中は World 側で縦に縮めて足場（buildScaffold）を立てるので、ここでは完成形だけ作る。
 *
 * モデルの中の「名前つきの部品」は World が動かす：
 *   flag = 旗（ゆれる） / lit = 窓・ランプ（夜と雨と雪で光る） / snow = 雪の屋根（雪の間だけ見える）
 *   chimney = けむりの出口 / blades = ふうしゃの羽根 / beam = とうだいの光 / jet・water・curtain = ふんすい / swing = ブランコ
 */
export type StructKind = 'farm' | 'well' | 'tower' | 'cradle' | 'wall' | 'castle' | 'bridge' | 'fountain' | 'windmill' | 'lighthouse' | 'market' | 'playground' | 'fort'

export interface StructSpec {
  name: string
  /** 完成に必要な資材の数 */
  need: number
  hp: number
  /** 当たり判定の半径（0 = 歩ける） */
  r: number
  /** 村のにぎわい度に足される点 */
  score: number
  /** 同じ物をいくつまで建てられるか（なければ 3） */
  max?: number
  /** 場所をとる広さ（建てる場所さがしで、ほかの物との間をあける） */
  foot?: number
}

export const STRUCTS: Record<StructKind, StructSpec> = {
  farm: { name: 'はたけ', need: 4, hp: 30, r: 0, score: 1 },
  well: { name: 'いど', need: 3, hp: 40, r: 0.5, score: 1 },
  tower: { name: 'みはりとう', need: 6, hp: 90, r: 0.6, score: 1.5 },
  cradle: { name: 'ゆりかごごや', need: 5, hp: 60, r: 0.7, score: 1 },
  wall: { name: 'へい', need: 2, hp: 60, r: 0.6, score: 0.25 },
  castle: { name: 'おしろ', need: 14, hp: 260, r: 1.5, score: 4 },
  bridge: { name: 'はし', need: 4, hp: 40, r: 0, score: 1 },
  fountain: { name: 'ふんすい', need: 6, hp: 50, r: 0.9, score: 1.5, max: 1, foot: 1.2 },
  windmill: { name: 'ふうしゃ', need: 7, hp: 60, r: 0.7, score: 1.5, max: 2, foot: 1.0 },
  lighthouse: { name: 'とうだい', need: 9, hp: 100, r: 0.6, score: 2, max: 1, foot: 0.9 },
  market: { name: 'いちば', need: 8, hp: 70, r: 1.1, score: 2, max: 1, foot: 1.6 },
  playground: { name: 'あそびば', need: 6, hp: 50, r: 0, score: 1.5, max: 2, foot: 1.4 },
  fort: { name: 'いしのとりで', need: 12, hp: 200, r: 1.1, score: 3, max: 2, foot: 1.5 },
}

/**
 * 建物の高さ [タップの当たり, 情報ウィンドウの矢印, HUD のバー]。
 * 建設中の足場の高さ（バーの 85%）にも使う。
 */
export const STRUCT_H: Record<StructKind, [number, number, number]> = {
  farm: [0.8, 1.2, 1.2],
  well: [1.4, 1.7, 1.6],
  tower: [2.5, 2.9, 2.7],
  cradle: [1.5, 1.8, 1.7],
  wall: [0.9, 1.2, 1.1],
  castle: [3.2, 3.6, 3.5],
  bridge: [0.4, 0.9, 0.9],
  fountain: [1.0, 1.6, 1.5],
  windmill: [2.0, 3.3, 3.2],
  lighthouse: [3.2, 4.2, 4.1],
  market: [1.2, 1.9, 1.8],
  playground: [1.0, 1.7, 1.6],
  fort: [2.2, 3.0, 2.9],
}

export const isStructKind = (v: unknown): v is StructKind => typeof v === 'string' && Object.prototype.hasOwnProperty.call(STRUCTS, v)

/** ステージごとの建物の色（家のかべ・石・屋根のもと） */
export interface BuildStyle { wall: string; stone: string; roof: string; accent: string; water: string }
export const STYLES: BuildStyle[] = [
  { wall: '#a0703f', stone: '#9aa1ab', roof: '#b85a4a', accent: '#ffd23f', water: '#3fa7e8' }, // はじまりの森
  { wall: '#d9c38a', stone: '#c9b27a', roof: '#4fb8c8', accent: '#fff27a', water: '#46c2d8' }, // ガラスの砂丘
  { wall: '#f2b6a8', stone: '#e6cfc4', roof: '#3fa0c8', accent: '#ff9ecb', water: '#35c6c0' }, // さんごの入り江
  { wall: '#f1eee6', stone: '#d6dfea', roof: '#7f9fd8', accent: '#ffffff', water: '#8fc4f0' }, // わたゆきの原
  { wall: '#bfe3f2', stone: '#9cc4da', roof: '#e8f6ff', accent: '#7fe8ff', water: '#7fe8ff' }, // こおりの回路峰
  { wall: '#4a3a3e', stone: '#2e2830', roof: '#c8482a', accent: '#ffb347', water: '#4fb0d8' }, // ほむらのかざん
  { wall: '#b9c4a8', stone: '#8fa08c', roof: '#4f8a6a', accent: '#9dffd0', water: '#5fd0c0' }, // こだいのいせき
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

const mix = (a: string, b: string, t: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()

/** 窓・ランプ：World が夜・雨・雪で明るくする（名前 'lit'） */
function lit(ctx: ModelCtx, w: number, h: number, d: number, x: number, y: number, z: number, color = '#ffd27a') {
  const m = box(w, h, d, ctx.basic(color), x, y, z)
  m.name = 'lit'
  return m
}
/** 雪の屋根（円すいの上半分に白い帽子）。名前 'snow'：雪の天気の間だけ見える */
function snowCap(ctx: ModelCtx, r: number, h: number, y: number, seg: number, x = 0, z = 0, rotY = 0) {
  const m = cone(r * 0.56, h * 0.52, seg, ctx.lam('#f4f8ff'), x, y + h * 0.24, z)
  m.rotation.y = rotY
  m.name = 'snow'
  m.visible = false
  return m
}
/** 雪の平らな屋根（ひさし・板） */
function snowSlab(ctx: ModelCtx, w: number, d: number, x: number, y: number, z: number, rotX = 0) {
  const m = box(w, 0.05, d, ctx.lam('#f4f8ff'), x, y, z)
  m.rotation.x = rotX
  m.name = 'snow'
  m.visible = false
  return m
}

function flag(ctx: ModelCtx, x: number, y: number, z: number) {
  const g = new THREE.Group()
  g.add(cyl(0.015, 0.015, 0.5, 4, ctx.lam('#3d2a1e'), 0, 0.25, 0))
  // 旗は ポールを軸に ゆれる（World が name === 'flag' を回す）
  const pivot = new THREE.Group()
  pivot.name = 'flag'
  pivot.position.set(0, 0, 0)
  pivot.add(box(0.28, 0.16, 0.02, ctx.basic(ctx.style.accent), 0.15, 0.42, 0))
  g.add(pivot)
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
      const water = new THREE.Mesh(new THREE.CircleGeometry(0.34, 10).rotateX(-Math.PI / 2), ctx.basic(ctx.style.water))
      water.position.y = 0.36
      g.add(water)
      for (const x of [-0.4, 0.4]) g.add(box(0.07, 0.85, 0.07, wood, x, 0.8, 0))
      g.add(box(0.95, 0.07, 0.07, wood, 0, 1.2, 0))
      const rf = cone(0.62, 0.34, 4, roof, 0, 1.4, 0)
      rf.rotation.y = Math.PI / 4
      g.add(rf)
      g.add(snowCap(ctx, 0.62, 0.34, 1.4, 4, 0, 0, Math.PI / 4))
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
      g.add(snowCap(ctx, 0.48, 0.6, 2.15, 8))
      g.add(lit(ctx, 0.1, 0.3, 0.06, 0, 1.1, 0.46))
      g.add(lit(ctx, 0.1, 0.3, 0.06, 0, 1.1, -0.46))
      g.add(flag(ctx, 0, 2.4, 0))
      break
    }
    case 'cradle': {
      g.add(cyl(0.65, 0.72, 0.55, 10, ctx.lam('#f6d6e0'), 0, 0.275, 0))
      g.add(cone(0.9, 0.6, 10, ctx.lam(mix(ctx.style.accent, '#ff9ecb', 0.6)), 0, 0.85, 0))
      g.add(snowCap(ctx, 0.9, 0.6, 0.85, 10))
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
      g.add(snowCap(ctx, 0.9, 0.9, 2.75, 4, 0, 0, Math.PI / 4))
      for (const [x, z] of [[-1.15, -0.95], [1.15, -0.95], [-1.15, 0.95], [1.15, 0.95]]) {
        g.add(cyl(0.32, 0.38, 1.5, 8, stone, x, 1.25, z))
        g.add(cone(0.44, 0.55, 8, roof, x, 2.25, z))
        g.add(snowCap(ctx, 0.44, 0.55, 2.25, 8, x, z))
        g.add(lit(ctx, 0.08, 0.22, 0.05, x, 1.4, z + 0.33))
      }
      g.add(box(0.5, 0.62, 0.06, dark, 0, 0.8, 0.62))
      g.add(lit(ctx, 0.2, 0.26, 0.05, -0.3, 1.7, 0.62))
      g.add(lit(ctx, 0.2, 0.26, 0.05, 0.3, 1.7, 0.62))
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
    case 'fountain': {
      const water = ctx.style.water
      g.add(cyl(1.02, 1.1, 0.3, 14, stone, 0, 0.15, 0))
      const w1 = new THREE.Mesh(new THREE.CircleGeometry(0.88, 14).rotateX(-Math.PI / 2), ctx.basic(water))
      w1.position.y = 0.305
      w1.name = 'water'
      g.add(w1)
      // ふちの飾り石と、ランプ柱
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const m = box(0.24, 0.12, 0.2, stone, Math.cos(a) * 1.02, 0.34, Math.sin(a) * 1.02)
        m.rotation.y = -a
        g.add(m)
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        g.add(cyl(0.035, 0.05, 0.75, 5, dark, Math.cos(a) * 1.28, 0.37, Math.sin(a) * 1.28))
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), ctx.basic(ctx.style.accent))
        bulb.position.set(Math.cos(a) * 1.28, 0.8, Math.sin(a) * 1.28)
        bulb.name = 'lit'
        g.add(bulb)
      }
      g.add(cyl(0.2, 0.3, 0.5, 8, stone, 0, 0.5, 0))
      g.add(cyl(0.58, 0.24, 0.16, 12, stone, 0, 0.82, 0))
      const w2 = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2), ctx.basic(water))
      w2.position.y = 0.91
      w2.name = 'water'
      g.add(w2)
      g.add(cyl(0.07, 0.09, 0.4, 6, stone, 0, 1.08, 0))
      // 水のカーテン（上の皿 → 下の池）と、ふきあげ
      const cur = new THREE.Mesh(
        new THREE.CylinderGeometry(0.56, 0.68, 0.5, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: water, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
      )
      cur.position.y = 0.58
      cur.name = 'curtain'
      g.add(cur)
      const jetMat = new THREE.MeshBasicMaterial({ color: mix(water, '#ffffff', 0.45), transparent: true, opacity: 0.85 })
      for (const [x, z, h] of [[0, 0, 0.6], [0.14, 0, 0.4], [-0.14, 0.04, 0.4], [0, -0.14, 0.36]] as const) {
        const j = cyl(0.03, 0.05, h, 5, jetMat, x, 1.28 + h / 2, z)
        j.name = 'jet'
        j.userData.h = h
        g.add(j)
      }
      break
    }
    case 'windmill': {
      g.add(cyl(0.64, 0.72, 0.3, 8, stone, 0, 0.15, 0))
      g.add(cyl(0.4, 0.56, 1.5, 8, wood, 0, 1.05, 0))
      g.add(cyl(0.45, 0.47, 0.1, 8, ctx.lam(ctx.style.accent), 0, 1.0, 0))
      g.add(box(0.3, 0.5, 0.06, dark, 0, 0.55, 0.55))
      g.add(lit(ctx, 0.14, 0.18, 0.05, 0, 1.35, 0.46))
      g.add(cone(0.52, 0.5, 8, roof, 0, 2.05, 0))
      g.add(snowCap(ctx, 0.52, 0.5, 2.05, 8))
      // 羽根の軸と羽根（World が 'blades' を回す）
      const shaft = cyl(0.05, 0.05, 0.5, 6, dark, 0, 1.75, 0.45)
      shaft.rotation.x = Math.PI / 2
      g.add(shaft)
      const blades = new THREE.Group()
      blades.name = 'blades'
      blades.position.set(0, 1.75, 0.72)
      const hub = cyl(0.09, 0.09, 0.14, 6, dark)
      hub.rotation.x = Math.PI / 2
      blades.add(hub)
      for (let i = 0; i < 4; i++) {
        const arm = new THREE.Group()
        arm.rotation.z = (i * Math.PI) / 2
        arm.add(box(0.06, 1.2, 0.04, wood, 0, 0.62, 0))
        arm.add(box(0.3, 0.8, 0.025, ctx.lam(i % 2 ? '#f7f2e6' : ctx.style.accent), 0.17, 0.72, 0.03))
        for (const y of [0.45, 0.72, 0.98]) arm.add(box(0.32, 0.03, 0.03, wood, 0.17, y, 0.03))
        blades.add(arm)
      }
      g.add(blades)
      // 小麦のふくろ
      for (const [x, z, s] of [[0.62, 0.55, 1], [0.8, 0.4, 0.8]] as const) {
        const sack = new THREE.Mesh(new THREE.SphereGeometry(0.15 * s, 6, 5), ctx.lam('#e8d9a8'))
        sack.scale.y = 1.2
        sack.position.set(x, 0.14 * s + 0.02, z)
        g.add(sack)
      }
      break
    }
    case 'lighthouse': {
      const white = ctx.lam('#f2eee4')
      g.add(cyl(0.66, 0.74, 0.3, 8, stone, 0, 0.15, 0))
      g.add(cyl(0.5, 0.6, 0.85, 8, white, 0, 0.72, 0))
      g.add(cyl(0.43, 0.5, 0.8, 8, roof, 0, 1.55, 0))
      g.add(cyl(0.37, 0.43, 0.8, 8, white, 0, 2.35, 0))
      g.add(cyl(0.55, 0.42, 0.14, 8, stone, 0, 2.82, 0))
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        g.add(box(0.04, 0.22, 0.04, dark, Math.cos(a) * 0.52, 3.0, Math.sin(a) * 0.52))
      }
      g.add(box(0.26, 0.4, 0.06, dark, 0, 0.5, 0.6))
      g.add(lit(ctx, 0.1, 0.16, 0.05, 0, 1.55, 0.46))
      g.add(lit(ctx, 0.09, 0.14, 0.05, 0, 2.35, 0.4))
      // ランプ室
      const lamp = cyl(0.27, 0.27, 0.46, 8, ctx.basic('#ffe9a0'), 0, 3.15, 0)
      lamp.name = 'lit'
      g.add(lamp)
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        g.add(box(0.05, 0.5, 0.05, dark, Math.cos(a) * 0.28, 3.15, Math.sin(a) * 0.28))
      }
      g.add(cone(0.4, 0.4, 8, roof, 0, 3.6, 0))
      g.add(snowCap(ctx, 0.4, 0.4, 3.6, 8))
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), ctx.lam('#3d2a1e')).translateY(3.86))
      // 光（夜だけ見える。World が回す）
      const beam = new THREE.Group()
      beam.name = 'beam'
      beam.position.y = 3.15
      const bm = new THREE.MeshBasicMaterial({ color: '#fff2a8', transparent: true, opacity: 0.34, depthWrite: false, blending: THREE.AdditiveBlending })
      beam.add(box(2.6, 0.14, 0.3, bm, 1.55, 0, 0))
      beam.add(box(2.6, 0.14, 0.3, bm, -1.55, 0, 0))
      beam.visible = false
      g.add(beam)
      break
    }
    case 'market': {
      const plank = ctx.lam(mix(ctx.style.wall, '#000000', 0.15), ctx.bark)
      g.add(box(2.7, 0.06, 1.7, plank, 0, 0.03, 0))
      const stall = (x: number, awn: string, goods: string[]) => {
        g.add(box(0.95, 0.5, 0.5, wood, x, 0.31, 0.2))
        g.add(box(1.02, 0.05, 0.58, plank, x, 0.58, 0.2))
        for (const sx of [-0.47, 0.47]) {
          g.add(box(0.05, 1.12, 0.05, wood, x + sx, 0.6, 0.5))
          g.add(box(0.05, 1.3, 0.05, wood, x + sx, 0.69, -0.2))
        }
        // しまもようのひさし（手前が低い）
        for (let i = 0; i < 5; i++) {
          const m = box(0.22, 0.04, 0.9, ctx.lam(i % 2 ? '#f7f2e6' : awn), x - 0.44 + i * 0.22, 1.2, 0.14)
          m.rotation.x = 0.3
          g.add(m)
        }
        g.add(snowSlab(ctx, 1.12, 0.9, x, 1.24, 0.14, 0.3))
        // 売り物
        goods.forEach((col, i) => {
          const px = x - 0.38 + i * 0.19
          if (i % 2) g.add(box(0.12, 0.12, 0.12, ctx.basic(col), px, 0.67, 0.22))
          else g.add(new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), ctx.basic(col)).translateX(px).translateY(0.67).translateZ(0.22))
        })
        g.add(lit(ctx, 0.1, 0.1, 0.1, x + 0.47, 1.02, 0.56))
      }
      stall(-0.72, ctx.style.roof, ['#ff7a4a', '#7fd05a', '#ffd23f', '#ff8fb1', '#ff7a4a'])
      stall(0.72, ctx.style.accent === '#ffffff' ? '#ffb4c8' : ctx.style.accent, ['#9fd8ff', '#ffe9a8', '#c9a8ff', '#7fd05a', '#ffe9a8'])
      // まん中：かまどとたる、看板
      g.add(box(0.42, 0.34, 0.3, stone, 0, 0.23, -0.55))
      g.add(cyl(0.1, 0.09, 0.1, 6, dark, -0.08, 0.45, -0.55))
      const chim = box(0.12, 0.5, 0.12, stone, 0.1, 0.65, -0.6)
      chim.name = 'chimney'
      g.add(chim)
      g.add(cyl(0.14, 0.14, 0.34, 8, wood, 0, 0.23, 0.52))
      g.add(box(0.26, 0.26, 0.26, wood, 0.26, 0.19, 0.62))
      g.add(box(0.04, 1.3, 0.04, dark, 0, 0.68, -0.28))
      g.add(box(0.5, 0.28, 0.04, ctx.lam(ctx.style.accent), 0, 1.3, -0.26))
      const coin = cyl(0.09, 0.09, 0.05, 8, ctx.basic('#ffd23f'), 0, 1.3, -0.22)
      coin.rotation.x = Math.PI / 2
      g.add(coin)
      break
    }
    case 'playground': {
      g.add(box(2.5, 0.05, 2.0, ctx.lam('#e6d29a'), 0, 0.025, 0))
      const sandSnow = box(2.5, 0.02, 2.0, ctx.lam('#f4f8ff'), 0, 0.06, 0)
      sandSnow.name = 'snow'
      sandSnow.visible = false
      g.add(sandSnow)
      for (const z of [-1.0, 1.0]) g.add(box(2.58, 0.13, 0.08, wood, 0, 0.07, z))
      for (const x of [-1.25, 1.25]) g.add(box(0.08, 0.13, 2.0, wood, x, 0.07, 0))
      // ブランコ
      const sw = new THREE.Group()
      sw.position.set(-0.5, 0, -0.25)
      for (const sx of [-0.62, 0.62])
        for (const sz of [-1, 1]) {
          const leg = box(0.06, 1.24, 0.06, wood, sx, 0.6, sz * 0.15)
          leg.rotation.x = -sz * 0.245
          sw.add(leg)
        }
      sw.add(box(1.4, 0.07, 0.07, wood, 0, 1.2, 0))
      for (const sx of [-0.28, 0.28]) {
        const pv = new THREE.Group()
        pv.name = 'swing'
        pv.position.set(sx, 1.2, 0)
        pv.userData.ph = sx > 0 ? 1.7 : 0
        for (const cz of [-0.08, 0.08]) pv.add(box(0.016, 0.82, 0.016, dark, 0, -0.41, cz))
        pv.add(box(0.28, 0.04, 0.2, ctx.lam(sx > 0 ? ctx.style.roof : ctx.style.accent), 0, -0.84, 0))
        sw.add(pv)
      }
      g.add(sw)
      // すべりだい（ミニ屋根つき）
      const sl = new THREE.Group()
      sl.position.set(0.72, 0, -0.45)
      for (const sx of [-0.22, 0.22])
        for (const sz of [-0.22, 0.22]) sl.add(box(0.05, 1.12, 0.05, wood, sx, 0.56, sz))
      sl.add(box(0.55, 0.05, 0.55, wood, 0, 0.65, 0))
      const rf = cone(0.5, 0.32, 4, roof, 0, 1.28, 0)
      rf.rotation.y = Math.PI / 4
      sl.add(rf)
      sl.add(snowCap(ctx, 0.5, 0.32, 1.28, 4, 0, 0, Math.PI / 4))
      for (const sx of [-0.14, 0.14]) {
        const rail = box(0.04, 0.78, 0.04, wood, sx, 0.34, -0.4)
        rail.rotation.x = 0.28
        sl.add(rail)
      }
      for (const y of [0.15, 0.3, 0.45, 0.6]) sl.add(box(0.3, 0.03, 0.03, wood, 0, y, -0.4 + (0.65 - y) * 0.27))
      const slide = new THREE.Group()
      slide.position.set(0, 0.37, 0.52)
      slide.rotation.x = 0.55
      slide.add(box(0.36, 0.04, 1.15, ctx.lam(ctx.style.accent), 0, 0, 0))
      for (const sx of [-0.19, 0.19]) slide.add(box(0.03, 0.1, 1.15, wood, sx, 0.05, 0))
      sl.add(slide)
      g.add(sl)
      // バケツと砂のやま
      g.add(cone(0.16, 0.2, 6, ctx.lam('#d6bf80'), -0.2, 0.15, 0.75))
      g.add(cyl(0.07, 0.06, 0.1, 6, ctx.lam(ctx.style.roof), 0.0, 0.1, 0.8))
      break
    }
    case 'fort': {
      const dstone = ctx.lam(mix(ctx.style.stone, '#44485a', 0.35), ctx.rock)
      g.add(box(2.3, 0.55, 1.9, dstone, 0, 0.275, 0))
      g.add(box(1.7, 0.95, 1.4, stone, 0, 1.025, 0))
      for (const x of [-0.7, -0.35, 0, 0.35, 0.7])
        for (const z of [-0.6, 0.6]) g.add(box(0.2, 0.2, 0.2, stone, x, 1.6, z))
      for (const z of [-0.3, 0, 0.3])
        for (const x of [-0.75, 0.75]) g.add(box(0.2, 0.2, 0.2, stone, x, 1.6, z))
      // 土台の上の歩廊のとっき
      for (const x of [-0.5, -0.17, 0.17, 0.5]) g.add(box(0.2, 0.16, 0.14, dstone, x, 0.63, 0.85))
      // 角の塔（前は高くて屋根つき、うしろは低くて平ら）
      for (const [x, z] of [[-1.0, 0.7], [1.0, 0.7]]) {
        g.add(cyl(0.3, 0.35, 1.55, 8, dstone, x, 0.78, z))
        g.add(cone(0.42, 0.5, 8, roof, x, 1.8, z))
        g.add(snowCap(ctx, 0.42, 0.5, 1.8, 8, x, z))
        g.add(lit(ctx, 0.07, 0.2, 0.05, x, 1.1, z + 0.31))
        g.add(flag(ctx, x, 2.05, z))
      }
      for (const [x, z] of [[-1.0, -0.7], [1.0, -0.7]]) {
        g.add(cyl(0.28, 0.33, 1.2, 8, dstone, x, 0.6, z))
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4
          g.add(box(0.14, 0.14, 0.14, dstone, x + Math.cos(a) * 0.24, 1.27, z + Math.sin(a) * 0.24))
        }
      }
      // 門とはね門、矢狭間、紋章
      g.add(box(0.5, 0.46, 0.06, ctx.lam('#2c2018'), 0, 0.26, 0.96))
      for (const x of [-0.14, 0, 0.14]) g.add(box(0.03, 0.46, 0.08, wood, x, 0.26, 0.97))
      g.add(lit(ctx, 0.07, 0.22, 0.05, -0.42, 1.1, 0.71))
      g.add(lit(ctx, 0.07, 0.22, 0.05, 0.42, 1.1, 0.71))
      g.add(box(0.3, 0.36, 0.04, ctx.lam(ctx.style.accent), 0, 1.05, 0.72))
      g.add(box(0.06, 0.3, 0.05, ctx.lam('#3d2a1e'), 0, 1.05, 0.73))
      g.add(box(0.24, 0.06, 0.05, ctx.lam('#3d2a1e'), 0, 1.1, 0.73))
      // 本丸の上：かがり火、えんとつ、旗
      g.add(cyl(0.1, 0.07, 0.14, 6, ctx.lam('#2c2018'), -0.4, 1.57, -0.2))
      g.add(lit(ctx, 0.1, 0.1, 0.1, -0.4, 1.7, -0.2, '#ff9f43'))
      const chim = box(0.14, 0.4, 0.14, stone, 0.45, 1.7, -0.35)
      chim.name = 'chimney'
      g.add(chim)
      g.add(flag(ctx, 0, 1.5, 0))
      // 木の柵（正面、門だけあけて）
      for (let i = -6; i <= 6; i++) {
        const x = i * 0.2
        if (Math.abs(x) < 0.3) continue
        g.add(cyl(0.05, 0.06, 0.48, 5, wood, x, 0.24, 1.3))
        g.add(cone(0.06, 0.14, 5, wood, x, 0.55, 1.3))
      }
      g.add(box(2.5, 0.05, 0.05, wood, 0, 0.3, 1.3))
      break
    }
  }
  return g
}

/** 建設中の足場：杭・横木・ななめの木・資材の山・旗。進み具合 p（0〜1）で高くなる */
export function buildScaffold(kind: StructKind, ctx: ModelCtx, p: number, len = 3): THREE.Group {
  const g = new THREE.Group()
  const wood = ctx.lam(ctx.style.wall, ctx.bark)
  if (kind === 'bridge') {
    for (const x of [-len / 2, len / 2])
      for (const z of [-0.55, 0.55]) g.add(cyl(0.03, 0.04, 0.5, 5, wood, x, 0.25, z))
    return g
  }
  const spec = STRUCTS[kind]
  const w = spec.foot ? spec.foot * 0.9 + 0.2 : Math.max(0.8, spec.r + 0.35)
  const d = w * 0.8
  const H = Math.max(0.55, STRUCT_H[kind][2] * 0.85 * (0.3 + 0.7 * p) + 0.25)
  for (const [x, z] of [[-w, -d], [w, -d], [-w, d], [w, d]]) g.add(box(0.05, H, 0.05, wood, x, H / 2, z))
  const levels = H > 1.2 ? [0.4, 0.78] : [0.55]
  for (const k of levels) {
    for (const z of [-d, d]) g.add(box(w * 2, 0.04, 0.04, wood, 0, H * k, z))
    for (const x of [-w, w]) g.add(box(0.04, 0.04, d * 2, wood, x, H * k, 0))
  }
  // 正面のななめの木
  const brace = box(0.035, Math.hypot(w * 2, H * 0.4), 0.035, wood, 0, H * 0.2, d)
  brace.rotation.z = -Math.atan2(w * 2, H * 0.4)
  g.add(brace)
  // 資材の山（木 3 本と石 2 こ）
  const bx = w * 0.55
  const bz = d + 0.5
  for (let i = 0; i < 3; i++) {
    const lg = cyl(0.06, 0.07, 0.5, 6, wood, bx + (i % 2) * 0.08, 0.06 + Math.floor(i / 2) * 0.12, bz - 0.06 * i)
    lg.rotation.z = Math.PI / 2
    g.add(lg)
  }
  for (let i = 0; i < 2; i++) g.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.11, 0), ctx.lam(ctx.style.stone, ctx.rock)).translateX(bx - 0.4 - i * 0.2).translateY(0.1).translateZ(bz))
  // てっぺんの小さな旗
  const pv = new THREE.Group()
  pv.name = 'flag'
  pv.position.set(-w, H, -d)
  pv.add(box(0.22, 0.12, 0.02, ctx.basic(ctx.style.accent), 0.12, 0.08, 0))
  g.add(pv)
  return g
}
