import * as THREE from 'three'
import { psx } from './psx'
import { Tex, rng } from './textures'

/**
 * 置き物（箱庭に置く物）の定義・説明・3D モデル・見た目のアニメ。
 * モデルは箱・筒・円すい・二十面体だけのローポリ。色・小物・陰影で作り込む（材質は psx() で包む）。
 * 効果（考え方や育ち）は World.ts 側。ここは「見た目」と「データ」だけ。
 */
export type ItemKind =
  | 'sapling' | 'ball' | 'fire' | 'charm' | 'tools' | 'fence' | 'memorial'
  | 'bench' | 'lantern' | 'plush' | 'banner' | 'flowerbed' | 'slide'

export const ITEM_KINDS: ItemKind[] = [
  'sapling', 'ball', 'fire', 'charm', 'tools', 'fence', 'memorial',
  'bench', 'lantern', 'plush', 'banner', 'flowerbed', 'slide',
]
/** セーブデータ・読み込んだ値は信用しない */
export const isItemKind = (v: unknown): v is ItemKind => typeof v === 'string' && (ITEM_KINDS as string[]).includes(v)

export interface ItemSpec {
  /** 箱庭に置ける数（ステージごと） */
  max: number
  /** 歩く子がよける半径（0 = 通りぬけられる） */
  r: number
  /** タップで選ぶ時の高さ */
  pickH: number
  /** 置いた時の向きをランダムにふる */
  turn: boolean
}

export const ITEM_SPEC: Record<ItemKind, ItemSpec> = {
  sapling: { max: 4, r: 0.35, pickH: 1.0, turn: false },
  ball: { max: 1, r: 0, pickH: 0.5, turn: false },
  fire: { max: 1, r: 0.3, pickH: 0.8, turn: false },
  charm: { max: 1, r: 0.3, pickH: 1.2, turn: false },
  tools: { max: 1, r: 0.45, pickH: 0.8, turn: true },
  fence: { max: 2, r: 0.55, pickH: 0.8, turn: true },
  memorial: { max: 4, r: 0.3, pickH: 1.1, turn: false },
  bench: { max: 2, r: 0.5, pickH: 0.8, turn: true },
  lantern: { max: 2, r: 0.2, pickH: 1.3, turn: false },
  plush: { max: 2, r: 0, pickH: 0.7, turn: true },
  banner: { max: 2, r: 0.2, pickH: 1.8, turn: false },
  flowerbed: { max: 3, r: 0.45, pickH: 0.6, turn: true },
  slide: { max: 1, r: 0, pickH: 1.0, turn: true },
}

/** タップで出る説明（\n で行をわける。1 行は 24 文字くらいまで） */
export const ITEM_INFO: Record<ItemKind, { name: string; desc: string }> = {
  sapling: { name: 'なえ・き', desc: 'めばえ→わかぎ→みのる木に そだつ\nそだつと たべものが ふえる' },
  ball: { name: 'ボール', desc: 'みんなが かってに けって あそぶ\nあそぶと こころが そだつ' },
  fire: { name: 'たき火', desc: 'よる そばで ねむる・こころが そだつ\nたまごが できやすい' },
  charm: { name: 'おまもり', desc: 'ノイズが あらわれにくくなる\nてきの こうげきも よわまる' },
  tools: { name: 'だいくどうぐ', desc: 'ちかくの 家づくりが 2ばい\n家や たてものが すこしずつ なおる' },
  fence: { name: 'まもりのさく', desc: 'ちかくの 家の ダメージが はんぶん' },
  memorial: { name: 'おはか', desc: 'まえの だいの ペットを しのぶ\nほしの かざり' },
  bench: { name: 'ベンチ', desc: 'つかれた子が ひと休み\nげんきが はやく もどる・きげん UP' },
  lantern: { name: 'ランタン', desc: 'よる あかるく ひかる\nみんなが あつまって こころが そだつ' },
  plush: { name: 'ぬいぐるみ', desc: 'こどもが だっこして あそぶ\nそだつのが はやくなる' },
  banner: { name: 'おうえんばた', desc: 'ちかくで たたかう なかまの\nこうげきが 2わり つよくなる' },
  flowerbed: { name: 'はなだん', desc: 'たべものが みのるのが はやくなる\nひるは ちょうちょが あつまる' },
  slide: { name: 'ミニすべりだい', desc: 'のぼって すべって あそぶ\nあそぶと こころと けいけんが そだつ' },
}

// ------------------------------------------------------------------ 材質まわり
const texCache: { bark?: THREE.Texture; rock?: THREE.Texture } = {}
const bark = () => (texCache.bark ??= Tex.bark())
const rock = () => (texCache.rock ??= Tex.rock())

/** やわらかい光のにじみ（ランタンの光）：1 枚の板に 1 つの共有テクスチャ */
let glowTex: THREE.CanvasTexture | null = null
function glowTexture() {
  if (glowTex) return glowTex
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(16, 16, 1, 16, 16, 16)
  grad.addColorStop(0, 'rgba(255,236,170,1)')
  grad.addColorStop(0.35, 'rgba(255,200,110,0.55)')
  grad.addColorStop(1, 'rgba(255,170,80,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 32, 32)
  glowTex = new THREE.CanvasTexture(c)
  glowTex.colorSpace = THREE.SRGBColorSpace
  return glowTex
}

class Kit {
  private mats = new Map<string, THREE.Material>()
  constructor(readonly root: THREE.Group, readonly low: boolean) {}

  lam(color: string, map?: THREE.Texture) {
    const k = color + (map ? '+' + map.uuid : '')
    let m = this.mats.get(k)
    if (!m) {
      m = psx(new THREE.MeshLambertMaterial({ color, flatShading: true, map }))
      this.mats.set(k, m)
    }
    return m
  }

  /** 光らない色（炎・宝石・光の輪） */
  bas(color: string, extra: THREE.MeshBasicMaterialParameters = {}) {
    return new THREE.MeshBasicMaterial({ color, ...extra })
  }

  add<T extends THREE.Object3D>(o: T, parent: THREE.Object3D = this.root, x = 0, y = 0, z = 0): T {
    o.position.set(x, y, z)
    parent.add(o)
    return o
  }

  box(w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0, parent?: THREE.Object3D, map?: THREE.Texture) {
    return this.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.lam(color, map)), parent, x, y, z)
  }

  cyl(rt: number, rb: number, h: number, color: string, x = 0, y = 0, z = 0, seg = 6, parent?: THREE.Object3D, map?: THREE.Texture) {
    return this.add(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), this.lam(color, map)), parent, x, y, z)
  }

  cone(r: number, h: number, color: string, x = 0, y = 0, z = 0, seg = 6, parent?: THREE.Object3D) {
    return this.add(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), this.lam(color)), parent, x, y, z)
  }

  ico(r: number, color: string, x = 0, y = 0, z = 0, parent?: THREE.Object3D, map?: THREE.Texture) {
    return this.add(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), this.lam(color, map)), parent, x, y, z)
  }

  ball(r: number, color: string, x = 0, y = 0, z = 0, parent?: THREE.Object3D, seg = 8) {
    return this.add(new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2)), this.lam(color)), parent, x, y, z)
  }

  /** 2 点をむすぶ細い棒（はしご・ひも） */
  link(a: THREE.Vector3, b: THREE.Vector3, w: number, color: string, parent?: THREE.Object3D, map?: THREE.Texture) {
    const len = a.distanceTo(b)
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, w, len), this.lam(color, map))
    m.position.copy(a).lerp(b, 0.5)
    m.lookAt(b)
    return this.add(m, parent, m.position.x, m.position.y, m.position.z)
  }

  /** 地面にしく平たい円（光だまり・灰） */
  disc(r: number, color: string, y: number, extra: THREE.MeshBasicMaterialParameters = {}, seg = 16) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2), this.bas(color, extra))
    return this.add(m, undefined, 0, y, 0)
  }
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

// ------------------------------------------------------------------ すべりだいの通り道
/**
 * すべりだいを のぼって すべる道すじ（u = 0〜1）。ローカル座標 lx, lz と、足もとの高さ h。
 * モデルの坂と同じ式なので、遊ぶ子がちゃんと坂の上を すべって見える。
 */
export function slidePath(u: number): { lx: number; lz: number; h: number } {
  if (u < 0.3) {
    const k = u / 0.3
    return { lx: 0, lz: -0.95 + k * 0.38, h: k * 0.6 }
  }
  if (u < 0.42) return { lx: 0, lz: -0.57 + ((u - 0.3) / 0.12) * 0.39, h: 0.62 }
  const s = (u - 0.42) / 0.58
  return { lx: 0, lz: -0.18 + s * 1.13, h: slideSurface(s) }
}
const slideSurface = (s: number) => 0.06 + 0.56 * Math.pow(1 - s, 1.8)

// ------------------------------------------------------------------ モデル
export interface ItemBuild {
  /** 画質「低」：光源・ふえる小物を減らす */
  low: boolean
  /** なえの実の色（ステージの食べ物の色） */
  fruit: string
}

export function buildItem(kind: ItemKind, o: ItemBuild): THREE.Group {
  const g = new THREE.Group()
  const k = new Kit(g, o.low)
  switch (kind) {
    case 'sapling': return sapling(k, g, o.fruit)
    case 'ball': return ballModel(k, g)
    case 'fire': return fire(k, g)
    case 'charm': return charm(k, g)
    case 'tools': return tools(k, g)
    case 'fence': return fence(k, g)
    case 'memorial': return memorial(k, g)
    case 'bench': return bench(k, g)
    case 'lantern': return lantern(k, g)
    case 'plush': return plush(k, g)
    case 'banner': return banner(k, g)
    case 'flowerbed': return flowerbed(k, g)
    case 'slide': return slide(k, g)
  }
}

/** なえ：めばえ → わかぎ → みのる木（成長で見た目が変わる） */
function sapling(k: Kit, g: THREE.Group, fruit: string) {
  k.cyl(0.3, 0.4, 0.1, '#6b4a2f', 0, 0.05, 0, 7)
  // 1) めばえ
  const sprout = new THREE.Group()
  k.cyl(0.022, 0.034, 0.34, '#6fcf5a', 0, 0.2, 0, 5, sprout)
  const leafA = k.box(0.24, 0.025, 0.12, '#8ae26a', 0.1, 0.36, 0, sprout)
  leafA.rotation.z = 0.5
  const leafB = k.box(0.24, 0.025, 0.12, '#5cc25a', -0.1, 0.34, 0.02, sprout)
  leafB.rotation.z = -0.5
  k.ico(0.05, '#c4f58a', 0, 0.42, 0, sprout)
  g.add(sprout)
  // 2) わかぎ
  const young = new THREE.Group()
  k.cyl(0.05, 0.085, 0.85, '#7a5638', 0, 0.45, 0, 6, young, bark())
  k.cyl(0.014, 0.014, 0.7, '#c9a46a', 0.17, 0.35, 0.02, 4, young)
  k.box(0.12, 0.025, 0.025, '#e8cf9a', 0.1, 0.5, 0.02, young)
  const yCrown = new THREE.Group()
  yCrown.position.y = 0.85
  k.ico(0.4, '#5cc25a', 0, 0.12, 0, yCrown)
  k.ico(0.27, '#7fd05a', -0.08, 0.42, 0.03, yCrown)
  k.ico(0.2, '#4faa4c', 0.26, 0.04, 0.1, yCrown)
  young.add(yCrown)
  g.add(young)
  // 3) みのる木
  const tree = new THREE.Group()
  k.cyl(0.11, 0.2, 1.0, '#7a5638', 0, 0.5, 0, 7, tree, bark())
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + 0.4
    const root = k.box(0.1, 0.08, 0.26, '#6d4c41', Math.cos(a) * 0.2, 0.05, Math.sin(a) * 0.2, tree, bark())
    root.rotation.y = -a + Math.PI / 2
  }
  const br = k.cyl(0.03, 0.045, 0.45, '#7a5638', 0.2, 0.85, 0, 5, tree, bark())
  br.rotation.z = -0.9
  const tCrown = new THREE.Group()
  tCrown.position.y = 1.0
  k.ico(0.8, '#4faa4c', 0, 0.38, 0, tCrown)
  k.ico(0.52, '#5cc25a', 0.5, 0.1, 0.1, tCrown)
  k.ico(0.5, '#6cd05a', -0.46, 0.2, -0.1, tCrown)
  k.ico(0.4, '#7fd05a', 0.02, 0.98, 0, tCrown)
  tree.add(tCrown)
  const fm = k.lam(fruit)
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + 0.5
    const fr = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), fm)
    fr.position.set(Math.cos(a) * 0.72, 0.28 + (i % 2) * 0.22, Math.sin(a) * 0.72)
    fr.name = 'fruit'
    tCrown.add(fr)
  }
  g.add(tree)
  g.userData = { sprout, young, tree, yCrown, tCrown, stage: -1, pop: 0 }
  return g
}

function ballModel(k: Kit, g: THREE.Group) {
  const shadow = k.disc(0.26, '#000000', 0.03, { transparent: true, opacity: 0.32, depthWrite: false }, 10)
  const pivot = new THREE.Group()
  pivot.position.y = 0.2
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), k.lam('#3fa9e0'))
  const bot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), k.lam('#ffd23f'))
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.022, 4, 12).rotateX(Math.PI / 2), k.lam('#ffffff'))
  pivot.add(top, bot, belt)
  // ころがると回るのが見える しるし
  for (const [x, y, z] of [[0.2, 0.0, 0], [-0.2, 0, 0], [0, 0, 0.2], [0, 0, -0.2]] as const) {
    const dot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), k.lam('#ff9f43'))
    dot.position.set(x, y, z)
    pivot.add(dot)
  }
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), k.lam('#ffffff'))
  star.position.set(0, 0.2, 0)
  star.scale.y = 0.4
  pivot.add(star)
  g.add(pivot)
  g.userData = { pivot, shadow, phase: 0 }
  return g
}

function fire(k: Kit, g: THREE.Group) {
  // 地面を照らす光だまり（夜に強くなる）
  const glow = k.disc(2.1, '#ff8a3a', 0.07, { transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }, 20)
  k.disc(0.62, '#2e2622', 0.04, {}, 9)
  // まわりの石
  const rr = rng(11)
  const tones = ['#8a919b', '#9aa1ab', '#757c86', '#adb4bd']
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rr() * 0.2
    const s = k.ico(0.12 + rr() * 0.05, tones[i % 4], Math.cos(a) * 0.66, 0.07, Math.sin(a) * 0.66, undefined, rock())
    s.scale.set(1, 0.7 + rr() * 0.3, 1)
    s.rotation.y = rr() * 3
  }
  // 薪（三方向から組んだ）：内がわが高く、外がわが低い
  for (let i = 0; i < 3; i++) {
    const pv = new THREE.Group()
    pv.rotation.y = (i / 3) * Math.PI * 2 + 0.5
    g.add(pv)
    const log = k.cyl(0.065, 0.07, 0.8, '#7a4e2d', 0, 0.2, 0.25, 6, pv, bark())
    log.rotation.x = Math.PI / 2 + 0.3
    const tip = k.cyl(0.055, 0.055, 0.02, '#2b2320', 0, 0, 0, 5, log)
    tip.position.y = 0.4
  }
  // 炎（層になってゆらぐ）：外 → 内
  const layers: THREE.Mesh[] = []
  const spec: [string, number, number][] = [['#ff4d2a', 0.3, 0.5], ['#ff8a2a', 0.22, 0.68], ['#ffd23f', 0.14, 0.84], ['#fff4b0', 0.06, 0.56]]
  spec.forEach(([c, r, h], i) => {
    const fl = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), k.bas(c))
    fl.position.y = 0.2 + h / 2
    fl.name = 'flame'
    fl.userData = { base: 0.2 + h / 2, h, i }
    g.add(fl)
    layers.push(fl)
  })
  for (const [x, z, s] of [[0.15, 0.08, 0.6], [-0.14, -0.06, 0.5]] as const) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 5), k.bas('#ff6b2a'))
    t.position.set(x, 0.38, z)
    t.scale.setScalar(s + 0.4)
    t.name = 'tongue'
    t.userData = { base: 0.38, x, z }
    g.add(t)
  }
  // 火の粉
  const embers: THREE.Mesh[] = []
  for (let i = 0; i < 6; i++) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), k.bas(i % 2 ? '#ffb347' : '#ff7a2a'))
    e.visible = !k.low || i < 3
    g.add(e)
    embers.push(e)
  }
  let light: THREE.PointLight | null = null
  if (!k.low) {
    light = new THREE.PointLight('#ff9a4a', 0, 6.5, 1.5)
    light.position.y = 0.7
    g.add(light)
  }
  g.userData = { glow, layers, embers, light }
  return g
}

function charm(k: Kit, g: THREE.Group) {
  const pulse = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.54, 24).rotateX(-Math.PI / 2), k.bas('#5ef2ff', { transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }))
  pulse.position.y = 0.05
  g.add(pulse)
  k.cyl(0.32, 0.4, 0.1, '#8a919b', 0, 0.05, 0, 8, undefined, rock())
  k.cyl(0.22, 0.28, 0.14, '#9aa1ab', 0, 0.17, 0, 8, undefined, rock())
  k.cyl(0.13, 0.17, 0.55, '#adb4bd', 0, 0.52, 0, 6, undefined, rock())
  // ほりこまれた文字（光る）
  for (let i = 0; i < 3; i++) {
    const a = i * 2.09
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.012), k.bas('#5ef2ff'))
    r.position.set(Math.sin(a) * 0.15, 0.5 + (i % 2) * 0.07, Math.cos(a) * 0.15)
    r.rotation.y = a
    g.add(r)
  }
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), k.bas('#5ef2ff'))
  gem.position.y = 1.15
  const shell = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), k.bas('#9ff6ff', { transparent: true, opacity: 0.22, depthWrite: false }))
  shell.position.y = 1.15
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.014, 4, 20), k.bas('#7ff2ff'))
  halo.position.y = 1.15
  const halo2 = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.012, 4, 16), k.bas('#b8f8ff'))
  halo2.position.y = 1.15
  g.add(gem, shell, halo, halo2)
  const orbit: THREE.Mesh[] = []
  for (let i = 0; i < 3; i++) {
    const o = new THREE.Mesh(new THREE.OctahedronGeometry(0.04, 0), k.bas('#e8ffff'))
    g.add(o)
    orbit.push(o)
  }
  g.userData = { gem, shell, halo, halo2, orbit, pulse }
  return g
}

function tools(k: Kit, g: THREE.Group) {
  const wood = '#b07a45'
  k.box(0.92, 0.07, 0.54, wood, 0, 0.52, 0, undefined, bark())
  for (const [x, z] of [[-0.38, -0.2], [0.38, -0.2], [-0.38, 0.2], [0.38, 0.2]]) k.box(0.07, 0.5, 0.07, '#8a5a34', x, 0.25, z, undefined, bark())
  k.box(0.8, 0.04, 0.05, '#8a5a34', 0, 0.2, 0.2)
  k.box(0.8, 0.04, 0.05, '#8a5a34', 0, 0.2, -0.2)
  k.box(0.8, 0.03, 0.4, '#a0703f', 0, 0.22, 0, undefined, bark())
  // かなづち（ふると かたかた鳴る）
  const hammer = new THREE.Group()
  hammer.position.set(-0.24, 0.57, 0.1)
  hammer.rotation.y = 0.35
  k.cyl(0.022, 0.022, 0.36, '#6d4c41', 0.12, 0, 0, 6, hammer).rotation.z = Math.PI / 2
  k.box(0.1, 0.1, 0.07, '#9aa1ab', 0.3, 0.02, 0, hammer)
  k.box(0.04, 0.08, 0.07, '#cfd5de', 0.36, 0.02, 0, hammer)
  g.add(hammer)
  // のこぎり
  const saw = new THREE.Group()
  saw.position.set(0.18, 0.57, -0.1)
  saw.rotation.y = 0.45
  k.box(0.4, 0.09, 0.012, '#c9ced6', 0.06, 0.05, 0, saw)
  for (let i = 0; i < 7; i++) k.box(0.025, 0.025, 0.014, '#9aa1ab', -0.13 + i * 0.055, -0.005, 0, saw).rotation.z = 0.78
  k.box(0.08, 0.12, 0.035, '#8a3b2b', -0.18, 0.06, 0, saw)
  g.add(saw)
  // 木くず・丸太・板
  const rr = rng(5)
  for (let i = 0; i < 9; i++) {
    const c = k.box(0.07, 0.015, 0.04, i % 2 ? '#e8cf9a' : '#d9b97a', (rr() - 0.5) * 1.3, 0.012, 0.3 + rr() * 0.3)
    c.rotation.y = rr() * 3
  }
  for (let i = 0; i < 3; i++) k.box(0.06, 0.012, 0.035, '#e8cf9a', -0.1 + i * 0.12, 0.566, 0.2 - i * 0.04).rotation.y = i
  const log = k.cyl(0.12, 0.12, 0.46, '#8a5a34', -0.66, 0.12, 0.2, 7, undefined, bark())
  log.rotation.z = Math.PI / 2
  log.rotation.y = 0.3
  const cap = k.cyl(0.1, 0.1, 0.01, '#e8cf9a', -0.89, 0.12, 0.26, 7)
  cap.rotation.z = Math.PI / 2
  for (let i = 0; i < 3; i++) k.box(0.5 - i * 0.05, 0.035, 0.15, i % 2 ? '#c4955c' : '#b8884f', 0.62, 0.02 + i * 0.037, 0.12 + i * 0.03).rotation.y = 0.2 - i * 0.15
  g.userData = { hammer, saw }
  return g
}

function fence(k: Kit, g: THREE.Group) {
  const rr = rng(21)
  const tones = ['#8a5a34', '#7d5130', '#946238']
  const posts: THREE.Vector3[] = []
  const N = 7
  for (let i = 0; i < N; i++) {
    const a = -0.95 + (i / (N - 1)) * 1.9
    const h = 0.5 + rr() * 0.22
    const x = Math.sin(a) * 0.62
    const z = Math.cos(a) * 0.62 - 0.35
    const post = k.cyl(0.05, 0.062, h, tones[i % 3], x, h / 2, z, 6, undefined, bark())
    post.rotation.z = (rr() - 0.5) * 0.08
    if (i % 3 === 1) k.box(0.1, 0.06, 0.1, tones[i % 3], x, h + 0.02, z).rotation.y = 0.78
    else k.cone(0.062, 0.13, tones[i % 3], x, h + 0.06, z, 6)
    posts.push(V(x, h, z))
  }
  // ひも（2 本）：たるませて、赤い札をさげる
  const tags: THREE.Mesh[] = []
  for (const f of [0.82, 0.45]) {
    for (let i = 0; i < N - 1; i++) {
      const a = posts[i]
      const b = posts[i + 1]
      const mid = a.clone().lerp(b, 0.5)
      const A = V(a.x, a.y * f, a.z)
      const B = V(b.x, b.y * f, b.z)
      const M = V(mid.x, mid.y * f - 0.045, mid.z)
      k.link(A, M, 0.02, '#d9c28a')
      k.link(M, B, 0.02, '#d9c28a')
      if (f > 0.8 && i % 2 === 0) {
        const t = k.box(0.07, 0.1, 0.012, i % 4 === 0 ? '#e8707a' : '#ffd23f', M.x, M.y - 0.07, M.z)
        t.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x)
        t.userData = { sway: i }
        tags.push(t)
      }
    }
  }
  g.userData = { tags }
  return g
}

function memorial(k: Kit, g: THREE.Group) {
  const aura = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), k.bas('#ffe27a', { transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }))
  aura.position.y = 1.1
  g.add(aura)
  k.box(0.8, 0.06, 0.56, '#b9c0ca', 0, 0.03, 0, undefined, rock())
  k.box(0.56, 0.06, 0.38, '#c9ced6', 0, 0.09, 0, undefined, rock())
  k.box(0.32, 0.48, 0.14, '#c9ced6', 0, 0.36, 0, undefined, rock())
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 8, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), k.lam('#d4d9e0', rock()))
  arch.position.y = 0.6
  g.add(arch)
  const mark = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), k.bas('#ffd23f'))
  mark.position.set(0, 0.5, 0.075)
  mark.scale.z = 0.25
  g.add(mark)
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), k.bas('#ffe27a'))
  gem.position.y = 1.1
  g.add(gem)
  // まわりの花
  const cols = ['#ff8fb1', '#ffffff', '#ffd23f', '#b48cff', '#ff8fb1']
  cols.forEach((c, i) => {
    const x = -0.34 + i * 0.17
    const z = 0.28 + (i % 2) * 0.08
    k.cyl(0.01, 0.012, 0.14, '#4fa04a', x, 0.1, z, 4)
    const h = k.ico(0.05, c, x, 0.2, z)
    h.scale.y = 0.6
  })
  g.userData = { gem, aura }
  return g
}

function bench(k: Kit, g: THREE.Group) {
  const boards = ['#b88a54', '#c4955c', '#ad7f4c']
  for (let i = 0; i < 3; i++) k.box(0.86, 0.04, 0.12, boards[i], 0, 0.35, -0.13 + i * 0.14, undefined, bark())
  for (const sx of [-1, 1]) {
    // 横から見た脚
    for (const z of [-0.2, 0.2]) k.box(0.05, 0.34, 0.05, '#7d5130', sx * 0.38, 0.17, z, undefined, bark())
    k.box(0.045, 0.045, 0.5, '#7d5130', sx * 0.38, 0.5, -0.02, undefined, bark())
    const sup = k.box(0.045, 0.34, 0.045, '#7d5130', sx * 0.38, 0.52, -0.22, undefined, bark())
    sup.rotation.x = -0.12
    k.box(0.05, 0.05, 0.4, '#7d5130', sx * 0.38, 0.12, 0, undefined, bark())
  }
  for (let i = 0; i < 2; i++) {
    const b = k.box(0.86, 0.1, 0.03, boards[(i + 1) % 3], 0, 0.56 + i * 0.13, -0.24 - i * 0.015, undefined, bark())
    b.rotation.x = -0.12
  }
  k.box(0.26, 0.055, 0.2, '#e8707a', 0.24, 0.402, 0.02)
  k.ball(0.022, '#ffd23f', 0.24, 0.44, 0.02, undefined, 5)
  k.box(0.13, 0.025, 0.09, '#3fc1c9', -0.22, 0.382, 0.06).rotation.y = 0.4
  k.box(0.12, 0.012, 0.08, '#ffffff', -0.22, 0.396, 0.06).rotation.y = 0.4
  return g
}

function lantern(k: Kit, g: THREE.Group) {
  const glow = k.disc(1.5, '#ffb45a', 0.06, { transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }, 16)
  k.cyl(0.14, 0.18, 0.1, '#8a919b', 0, 0.05, 0, 7, undefined, rock())
  k.cyl(0.04, 0.055, 1.2, '#5a4030', 0, 0.68, 0, 6, undefined, bark())
  const arm = k.box(0.34, 0.04, 0.04, '#5a4030', 0.15, 1.27, 0)
  arm.rotation.z = 0.06
  const brace = k.box(0.22, 0.03, 0.03, '#5a4030', 0.1, 1.15, 0)
  brace.rotation.z = 0.7
  k.ball(0.04, '#ffd23f', 0, 1.3, 0, undefined, 5)
  // つるされた ランタン（風でゆれる）
  const swing = new THREE.Group()
  swing.position.set(0.32, 1.25, 0)
  k.cyl(0.006, 0.006, 0.12, '#9aa1ab', 0, -0.06, 0, 4, swing)
  k.cone(0.14, 0.1, '#3a3f66', 0, -0.17, 0, 4, swing).rotation.y = 0.78
  k.box(0.2, 0.025, 0.2, '#3a3f66', 0, -0.38, 0, swing)
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.17, 0.12), k.bas('#b8a070'))
  core.position.y = -0.275
  swing.add(core)
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 5), k.bas('#ff9a2a'))
  flame.position.y = -0.3
  swing.add(flame)
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) k.box(0.014, 0.19, 0.014, '#2b2f4a', x * 0.075, -0.275, z * 0.075, swing)
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
  halo.scale.setScalar(1.3)
  halo.position.y = -0.28
  swing.add(halo)
  let light: THREE.PointLight | null = null
  if (!k.low) {
    light = new THREE.PointLight('#ffb45a', 0, 6, 1.4)
    light.position.y = -0.28
    swing.add(light)
  }
  g.add(swing)
  g.userData = { swing, core, flame, halo, glow, light }
  return g
}

function plush(k: Kit, g: THREE.Group) {
  // しいたクッション
  k.cyl(0.34, 0.38, 0.06, '#8fd3ff', 0, 0.03, 0, 10)
  k.cyl(0.3, 0.3, 0.012, '#d9f0ff', 0, 0.065, 0, 10)
  const body = new THREE.Group()
  body.position.y = 0.065
  g.add(body)
  const fur = '#fff1e0'
  const b = k.ball(0.2, fur, 0, 0.2, 0, body, 9)
  b.scale.set(1, 0.92, 0.9)
  k.ball(0.17, fur, 0, 0.5, 0.01, body, 9)
  // ながい耳：片方は立って、片方は折れている
  const e1 = k.ball(0.065, fur, -0.1, 0.72, 0, body, 6)
  e1.scale.set(0.8, 2.3, 0.6)
  e1.rotation.z = 0.12
  const e1i = k.ball(0.04, '#ffb3c8', -0.1, 0.72, 0.03, body, 5)
  e1i.scale.set(0.7, 2.1, 0.3)
  e1i.rotation.z = 0.12
  const e2 = k.ball(0.065, fur, 0.17, 0.62, 0, body, 6)
  e2.scale.set(0.8, 2.1, 0.6)
  e2.rotation.z = -1.1
  const e2i = k.ball(0.04, '#ffb3c8', 0.17, 0.62, 0.03, body, 5)
  e2i.scale.set(0.7, 1.9, 0.3)
  e2i.rotation.z = -1.1
  // 顔：ねむそうな目・ほっぺ・鼻
  for (const x of [-0.065, 0.065]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.012, 0.01), k.bas('#2b2f4a'))
    eye.position.set(x, 0.53, 0.165)
    body.add(eye)
    const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.03, 6), k.bas('#ff9eb5'))
    cheek.position.set(x * 1.8, 0.47, 0.162)
    body.add(cheek)
  }
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.01), k.bas('#e8707a'))
  nose.position.set(0, 0.49, 0.172)
  body.add(nose)
  // うで・あし・マフラー・おなかの星
  for (const x of [-1, 1]) {
    k.ball(0.06, fur, x * 0.2, 0.23, 0.07, body, 6).scale.set(0.8, 1.2, 0.8)
    k.ball(0.07, fur, x * 0.11, 0.04, 0.12, body, 6).scale.set(1, 0.7, 1.3)
  }
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.035, 4, 10).rotateX(Math.PI / 2), k.lam('#e8707a'))
  scarf.position.y = 0.37
  body.add(scarf)
  k.box(0.05, 0.1, 0.03, '#e8707a', 0.1, 0.3, 0.12, body).rotation.z = 0.2
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), k.bas('#ffd23f'))
  star.position.set(0, 0.2, 0.18)
  star.scale.z = 0.25
  body.add(star)
  g.userData = { body }
  return g
}

function banner(k: Kit, g: THREE.Group) {
  // ささえの石
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    k.ico(0.1, i % 2 ? '#9aa1ab' : '#8a919b', Math.cos(a) * 0.17, 0.07, Math.sin(a) * 0.17, undefined, rock())
  }
  k.cone(0.2, 0.2, '#6b4a2f', 0, 0.1, 0, 7)
  k.cyl(0.03, 0.045, 1.7, '#8a5a34', 0, 0.9, 0, 6, undefined, bark())
  k.ball(0.065, '#ffd23f', 0, 1.78, 0, undefined, 6)
  k.box(0.07, 0.025, 0.07, '#ffd23f', 0, 1.7, 0)
  // 旗：くさり状のはたに つなげて、波のようにゆらす
  const segs: THREE.Group[] = []
  let parent: THREE.Object3D = g
  const SEG = 5
  for (let i = 0; i < SEG; i++) {
    const p = new THREE.Group()
    p.position.set(i === 0 ? 0.035 : 0.15, i === 0 ? 1.62 : 0, 0)
    parent.add(p)
    const w = i === SEG - 1 ? 0.12 : 0.15
    const h = 0.42 - i * 0.045
    k.box(w, h, 0.012, i % 2 ? '#e0525a' : '#ea636a', w / 2, -h / 2, 0, p)
    if (i === 1) {
      const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), k.bas('#ffd23f'))
      st.position.set(0.09, -0.12, 0)
      st.scale.z = 0.2
      p.add(st)
    }
    segs.push(p)
    parent = p
  }
  g.userData = { segs }
  return g
}

function flowerbed(k: Kit, g: THREE.Group) {
  k.cyl(0.5, 0.56, 0.1, '#6b4a2f', 0, 0.05, 0, 10)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 4, 10).rotateX(Math.PI / 2), k.lam('#b9c0ca', rock()))
  ring.position.y = 0.08
  g.add(ring)
  const rr = rng(33)
  const cols = ['#ff8fb1', '#ffd23f', '#ffffff', '#b48cff', '#ff9f43', '#ff8fb1']
  const flowers: THREE.Group[] = []
  const N = 8
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + rr() * 0.5
    const rad = 0.12 + rr() * 0.3
    const p = new THREE.Group()
    p.position.set(Math.cos(a) * rad, 0.1, Math.sin(a) * rad)
    const h = 0.2 + rr() * 0.2
    k.cyl(0.011, 0.014, h, '#4fa04a', 0, h / 2, 0, 4, p)
    const leaf = k.box(0.06, 0.012, 0.03, '#5cc25a', 0.03, h * 0.35, 0, p)
    leaf.rotation.z = 0.5
    const head = k.ico(0.07, cols[i % cols.length], 0, h + 0.02, 0, p)
    head.scale.y = 0.55
    k.ico(0.032, i % 2 ? '#ffd23f' : '#8a5a34', 0, h + 0.05, 0, p)
    p.userData = { head, h, i }
    g.add(p)
    flowers.push(p)
  }
  g.userData = { flowers }
  return g
}

function slide(k: Kit, g: THREE.Group) {
  const wood = '#c4955c'
  // 台
  for (const [x, z] of [[-0.22, -0.55], [0.22, -0.55], [-0.22, -0.17], [0.22, -0.17]]) k.cyl(0.035, 0.04, 0.6, '#8a5a34', x, 0.3, z, 6, undefined, bark())
  k.box(0.56, 0.05, 0.46, wood, 0, 0.62, -0.36, undefined, bark())
  for (const x of [-0.27, 0.27]) k.box(0.025, 0.2, 0.44, '#ff9f43', x, 0.74, -0.36)
  k.box(0.52, 0.18, 0.025, '#ff9f43', 0, 0.74, -0.58)
  // 旗（てっぺん）
  k.cyl(0.012, 0.012, 0.3, '#5a4030', 0.22, 0.82, -0.55, 4)
  const flag = k.cone(0.07, 0.18, '#ff5e5e', 0.3, 1.0, -0.55, 3)
  flag.rotation.z = -Math.PI / 2
  // はしご
  const foot = (x: number) => V(x, 0, -0.98)
  const top = (x: number) => V(x, 0.6, -0.62)
  for (const x of [-0.17, 0.17]) k.link(foot(x), top(x), 0.04, '#8a5a34', undefined, bark())
  for (let i = 1; i <= 4; i++) {
    const t = i / 5
    const a = foot(-0.17).lerp(top(-0.17), t)
    const b = foot(0.17).lerp(top(0.17), t)
    k.link(a, b, 0.025, '#e8cf9a')
  }
  // 坂（曲がっている）：色つきの板 + 両がわの手すり
  const N = 6
  for (let i = 0; i < N; i++) {
    const s0 = i / N
    const s1 = (i + 1) / N
    const z0 = -0.18 + s0 * 1.13
    const z1 = -0.18 + s1 * 1.13
    const y0 = slideSurface(s0)
    const y1 = slideSurface(s1)
    const len = Math.hypot(z1 - z0, y1 - y0) + 0.02
    const ang = -Math.atan2(y1 - y0, z1 - z0)
    const seg = k.box(0.38, 0.03, len, i % 2 ? '#7fe0c0' : '#8eead0', 0, (y0 + y1) / 2 - 0.015, (z0 + z1) / 2)
    seg.rotation.x = ang
    for (const x of [-0.2, 0.2]) {
      const rail = k.box(0.025, 0.07, len, '#ff9f43', x, (y0 + y1) / 2 + 0.03, (z0 + z1) / 2)
      rail.rotation.x = ang
    }
  }
  k.box(0.38, 0.02, 0.1, '#6fcfae', 0, 0.04, 1.0)
  // 地面におさえの杭
  for (const x of [-0.2, 0.2]) k.cyl(0.02, 0.02, 0.1, '#5a4030', x, 0.05, 0.96, 4)
  return g
}

// ------------------------------------------------------------------ アニメ
export interface ItemTick {
  /** 世界の時間（秒）と、このフレームの経過 */
  t: number
  dt: number
  /** 夜の濃さ 0〜1 */
  night: number
  /** 風の強さ（ふつう 1、雨やひのこは強い） */
  wind: number
  /** そだち具合（なえ）0〜1 */
  grow: number
  /** ボールの速さ */
  vx: number
  vz: number
  /** 近くで誰かが 作業・遊びをしている */
  busy: boolean
  /** 近くの花だんで ちょうちょが飛んでいる、など（昼） */
  day: boolean
}

const _q = new THREE.Quaternion()
const _ax = new THREE.Vector3()

export function tickItem(kind: ItemKind, g: THREE.Group, s: ItemTick) {
  const u = g.userData
  const t = s.t
  switch (kind) {
    case 'sapling': {
      const st = s.grow < 0.34 ? 0 : s.grow < 1 ? 1 : 2
      if (u.stage !== st) {
        if (u.stage >= 0) u.pop = 0.55
        u.stage = st
        u.sprout.visible = st === 0
        u.young.visible = st === 1
        u.tree.visible = st === 2
      }
      u.pop = Math.max(0, u.pop - s.dt)
      const pop = 1 + Math.sin((1 - u.pop / 0.55) * Math.PI) * 0.22 * (u.pop > 0 ? 1 : 0)
      const sc = st === 0 ? 0.7 + 0.5 * (s.grow / 0.34) : st === 1 ? 0.6 + 0.4 * ((s.grow - 0.34) / 0.66) : 1
      const A = 0.03 * s.wind
      const stage = st === 0 ? u.sprout : st === 1 ? u.young : u.tree
      stage.scale.setScalar(sc * pop)
      stage.rotation.z = Math.sin(t * 1.3 + g.position.x * 2) * A * (st === 0 ? 1.4 : 0.5)
      stage.rotation.x = Math.cos(t * 1.1 + g.position.z) * A * 0.4
      const crown = st === 1 ? u.yCrown : st === 2 ? u.tCrown : null
      if (crown) {
        crown.rotation.z = Math.sin(t * 1.9 + 1.3 + g.position.x) * A * 1.4
        crown.rotation.x = Math.cos(t * 1.6 + g.position.z) * A
      }
      return
    }
    case 'ball': {
      const sp = Math.hypot(s.vx, s.vz)
      let hop = 0
      if (sp > 0.35) {
        u.phase += s.dt * (3 + sp * 2.2)
        hop = Math.abs(Math.sin(u.phase)) * Math.min(0.2, sp * 0.045)
        _ax.set(s.vz, 0, -s.vx).normalize()
        _q.setFromAxisAngle(_ax, (sp * s.dt) / 0.2)
        u.pivot.quaternion.premultiply(_q)
      }
      u.pivot.position.y = 0.2 + hop
      const land = hop < 0.03 && sp > 1.2 ? 0.88 : 1
      u.pivot.scale.set(1 / Math.sqrt(land), land, 1 / Math.sqrt(land))
      u.pivot.position.y -= (1 - land) * 0.2
      const sh = 1 - Math.min(0.5, hop * 1.6)
      u.shadow.scale.setScalar(sh)
      ;(u.shadow.material as THREE.MeshBasicMaterial).opacity = 0.32 * sh
      return
    }
    case 'fire': {
      const lean = Math.sin(t * 2.1) * 0.05 * s.wind
      for (const fl of u.layers as THREE.Mesh[]) {
        const i = fl.userData.i as number
        const f = 0.86 + Math.sin(t * (17 - i * 2.3) + i * 1.7) * 0.09 + Math.sin(t * 7.3 + i) * 0.07
        const h = 1.05 + Math.sin(t * (11 + i * 1.7) + i) * 0.13 + i * 0.03
        fl.scale.set(f, h, f)
        fl.position.y = fl.userData.base + (fl.userData.h * (h - 1)) / 2
        fl.rotation.z = Math.sin(t * (5 + i) + i * 2) * 0.08 + lean * (1 + i * 0.3)
        fl.rotation.x = Math.cos(t * (4.3 + i) + i) * 0.06
      }
      g.children.forEach((o) => {
        if (o.name !== 'tongue') return
        const ph = o.userData.x * 9
        const f = 0.8 + Math.max(0, Math.sin(t * 13 + ph)) * 0.55
        o.scale.set(0.8, f, 0.8)
        o.position.y = o.userData.base + (f - 0.8) * 0.2
        o.rotation.z = Math.sin(t * 6 + ph) * 0.2
      })
      ;(u.embers as THREE.Mesh[]).forEach((e, i) => {
        if (!e.visible) return
        const p = (t * (0.4 + i * 0.07) + i * 0.37) % 1
        const r = 0.08 + p * 0.28
        e.position.set(Math.sin(i * 2.1 + t * 2.4) * r, 0.4 + p * 1.5, Math.cos(i * 1.7 + t * 2) * r)
        e.scale.setScalar(Math.max(0.01, 1.2 - p * 1.2))
        e.rotation.set(t * 3 + i, t * 2, 0)
      })
      const fl = 0.9 + Math.sin(t * 19) * 0.07 + Math.sin(t * 8.1) * 0.05
      ;(u.glow.material as THREE.MeshBasicMaterial).opacity = (0.06 + s.night * 0.3) * fl
      u.glow.scale.setScalar(0.94 + fl * 0.06)
      if (u.light) u.light.intensity = (0.6 + s.night * 3) * fl
      return
    }
    case 'charm': {
      u.gem.rotation.y = t * 1.3
      u.gem.position.y = 1.15 + Math.sin(t * 2) * 0.06
      u.shell.rotation.y = -t * 0.8
      u.shell.position.y = u.gem.position.y
      u.shell.scale.setScalar(1 + Math.sin(t * 3) * 0.08)
      u.halo.rotation.set(0.5, t * 0.9, 0)
      u.halo.position.y = u.gem.position.y
      u.halo2.rotation.set(-0.4, -t * 1.2, 0.9)
      u.halo2.position.y = u.gem.position.y
      ;(u.orbit as THREE.Mesh[]).forEach((o, i) => {
        const a = t * 1.6 + i * 2.09
        o.position.set(Math.cos(a) * 0.4, u.gem.position.y + Math.sin(t * 2 + i) * 0.1, Math.sin(a) * 0.4)
        o.rotation.y = t * 3
      })
      const p = (t * 0.5) % 1
      u.pulse.scale.setScalar(1 + p * 0.6)
      ;(u.pulse.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - p)
      return
    }
    case 'tools': {
      const w = s.busy ? 1 : 0
      u.hammer.rotation.z = w * Math.max(0, Math.sin(t * 14)) * 0.55
      u.saw.position.x = 0.18 + w * Math.sin(t * 11) * 0.05
      return
    }
    case 'fence': {
      for (const tg of u.tags as THREE.Mesh[]) tg.rotation.z = Math.sin(t * 2.4 + tg.userData.sway) * 0.12 * s.wind
      return
    }
    case 'memorial': {
      u.gem.rotation.y += s.dt * 1.5
      u.gem.position.y = 1.1 + Math.sin(t * 2) * 0.06
      u.aura.position.y = u.gem.position.y
      u.aura.scale.setScalar(1 + Math.sin(t * 2.6) * 0.15)
      return
    }
    case 'lantern': {
      const n = s.night
      u.swing.rotation.z = Math.sin(t * 1.4 + g.position.x) * 0.05 * s.wind
      u.swing.rotation.x = Math.cos(t * 1.1 + g.position.z) * 0.03 * s.wind
      const fl = 0.92 + Math.sin(t * 15) * 0.05 + Math.sin(t * 6.1) * 0.04
      ;(u.core.material as THREE.MeshBasicMaterial).color.set(n > 0.3 ? '#fff0b0' : n > 0.1 ? '#e8d090' : '#b8a070')
      u.flame.scale.set(fl, fl * (1 + Math.sin(t * 9) * 0.15), fl)
      ;(u.halo.material as THREE.SpriteMaterial).opacity = Math.min(1, n * 1.2) * fl
      ;(u.glow.material as THREE.MeshBasicMaterial).opacity = n * 0.2 * fl
      if (u.light) u.light.intensity = n * 2.4 * fl
      return
    }
    case 'plush': {
      const hop = s.busy ? Math.abs(Math.sin(t * 5)) * 0.07 : 0
      const br = Math.sin(t * 1.6 + g.position.x) * 0.015
      u.body.position.y = 0.065 + hop
      u.body.scale.set(1 - br, 1 + br, 1 - br)
      u.body.rotation.z = s.busy ? Math.sin(t * 5) * 0.08 : 0
      return
    }
    case 'banner': {
      let a = 0
      ;(u.segs as THREE.Group[]).forEach((sg, i) => {
        a = Math.sin(t * 3.2 - i * 0.9 + g.position.x) * 0.2 * s.wind
        sg.rotation.y = a
        sg.rotation.z = Math.sin(t * 2.4 - i * 0.7) * 0.05 * s.wind
      })
      return
    }
    case 'flowerbed': {
      const A = 0.07 * s.wind
      const open = s.night < 0.5 ? 1 : 0.6
      for (const f of u.flowers as THREE.Group[]) {
        const i = f.userData.i as number
        f.rotation.z = Math.sin(t * 1.7 + i * 1.3) * A
        f.rotation.x = Math.cos(t * 1.4 + i * 0.9) * A * 0.8
        const head = f.userData.head as THREE.Mesh
        head.scale.set(open, 0.55 * open, open)
      }
      return
    }
    default:
      return
  }
}

/** メッシュの後かたづけ（共有テクスチャ・共有の光のにじみは壊さない） */
export function disposeItem(g: THREE.Object3D) {
  g.traverse((o) => {
    const m = o as THREE.Mesh
    m.geometry?.dispose()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
    else mat?.dispose()
  })
}
