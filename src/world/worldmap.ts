import * as THREE from 'three'
import { Tex } from './textures'
import { STAGES, SIZE, base, edge, setEdgeOff, setLandSize, smooth, terrain } from './stages'
import type { FoodSpot, Obstacle, Stage } from './stages'

/**
 * ひとつづきの世界の 見本（計画 C の 1 歩め）。`?world=1` を つけた時だけ 使う（セーブは しない）。
 * いまの 7 ステージ + 新しい 2 つ（城の丘・浅瀬）を 3×3 に ならべて 1 枚の地面に する。
 * まだ やっていないこと：さかいめの 地形と色の なじませ・近くだけ描く・地方ごとの 天気と BGM・セーブ。
 * まずは「スマホで どのくらいの 速さで 動くか」を はかるための もの。
 */
export const TILE = 40
/** 北 → 南・西 → 東 の ならび（-1 = 城の丘 / -2 = 浅瀬） */
const LAYOUT = [
  [3, 4, 6],
  [-1, 0, 5],
  [2, 1, -2],
]
export const WORLD_SIZE = TILE * 3

/** 新しい地方：なだらかな 草の丘（町が育つ所）/ 砂の浅瀬 */
function plainTile(kind: 'hill' | 'shoal'): Stage {
  const hill = kind === 'hill'
  const heightAt = (x: number, z: number) => 0.32 + (hill ? Math.sin(x * 0.16 + 1) * Math.cos(z * 0.14) * 0.5 + 0.5 : Math.sin(x * 0.3) * Math.sin(z * 0.27) * 0.1 + 0.1) * edge(x, z)
  const group = new THREE.Group()
  group.add(hill ? terrain(heightAt, Tex.grass(), ['#b4c898', '#96b07c']) : terrain(heightAt, Tex.beach(), ['#ffffff', '#ffeccc']), base(hill ? 'grass' : 'sand'))
  return {
    id: 0, name: '', sub: '', group, heightAt, obstacles: [], foodSpots: [],
    food: { name: '', color: '#fff', leaf: '#fff' }, residents: [],
    fog: '#fff', sky: ['#fff', '#fff', '#fff'], sun: { color: '#fff', intensity: 1, dir: [0, 1, 0] }, hemi: ['#fff', '#fff', 1],
    update() {},
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
      })
    },
  }
}

export function buildWorldMap(): Stage {
  // 地方は いつもの広さ（40）で 作り、世界ぜんたいは 120 に する
  setLandSize(TILE)
  const tiles: { s: Stage; ox: number; oz: number }[] = []
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3; i++) {
      const n = LAYOUT[j][i]
      const s = n === -1 ? plainTile('hill') : n === -2 ? plainTile('shoal') : STAGES[n]()
      tiles.push({ s, ox: (i - 1) * TILE, oz: (j - 1) * TILE })
    }
  setLandSize(WORLD_SIZE)
  const group = new THREE.Group()
  const obstacles: Obstacle[] = []
  const foodSpots: FoodSpot[] = []
  const treasures: { x: number; z: number; mesh: THREE.Object3D }[] = []
  for (const t of tiles) {
    t.s.group.position.set(t.ox, 0, t.oz)
    group.add(t.s.group)
    for (const o of t.s.obstacles) obstacles.push({ ...o, x: o.x + t.ox, z: o.z + t.oz })
    for (const f of t.s.foodSpots) foodSpots.push({ ...f, x: f.x + t.ox, z: f.z + t.oz })
    for (const c of t.s.treasures ?? []) treasures.push({ x: c.x + t.ox, z: c.z + t.oz, mesh: c.mesh })
  }
  // 地方の 高さの式は「広さ 40」の つもりで 書いてあるので、聞く間だけ 広さを もどす
  const inTile = <T>(f: () => T): T => {
    const keep = SIZE
    setLandSize(TILE)
    try {
      return f()
    } finally {
      setLandSize(keep)
    }
  }
  // ---- つなぎ目を なくす（2026-11-15）----
  // 地方の ふちを 下げずに（setEdgeOff）、さかいめの まわり BLEND の はばで となりの 地方と 高さを まぜる。
  // 山は となりの 山と つながる。地面の 模様は さかいめで まだらに まざる（どちらの 地方の 面かを ゆらす）
  const BLEND = 7
  const H0 = TILE / 2 + BLEND
  const clamp = (v: number) => Math.max(-H0, Math.min(H0, v))
  const weight = (t: (typeof tiles)[number], x: number, z: number) => smooth(BLEND, -BLEND, Math.max(Math.abs(x - t.ox), Math.abs(z - t.oz)) - TILE / 2)
  const tileH = (t: (typeof tiles)[number], x: number, z: number, off: boolean) => {
    setEdgeOff(off)
    try {
      return inTile(() => t.s.heightAt(clamp(x - t.ox), clamp(z - t.oz)))
    } finally {
      setEdgeOff(false)
    }
  }
  const heightAt = (x: number, z: number) => {
    let sum = 0
    let wsum = 0
    for (const t of tiles) {
      const w = weight(t, x, z)
      if (w <= 0) continue
      sum += Math.min(22, tileH(t, x, z, true)) * w
      wsum += w
    }
    const h = wsum ? sum / wsum : 0.3
    // 世界の いちばん 外がわだけ 下げる
    return Math.max(0.24, 0.3 + (h - 0.3) * smooth(WORLD_SIZE / 2, WORLD_SIZE / 2 - 2.5, Math.max(Math.abs(x), Math.abs(z))))
  }
  // 面の もちぬし：重み + 升目ごとの ゆらぎ で いちばん 大きい 地方
  const jit = (x: number, z: number) => {
    const n = Math.sin(Math.floor(x * 1.3) * 127.1 + Math.floor(z * 1.3) * 311.7) * 43758.5453
    return (n - Math.floor(n) - 0.5) * 0.7
  }
  const owner = (x: number, z: number) => {
    let best = -1
    let bw = -9
    tiles.forEach((t, i) => {
      const w = weight(t, x, z) + jit(x + i * 3.1, z - i * 1.7)
      if (w > bw) {
        bw = w
        best = i
      }
    })
    return best
  }
  // 地方ごとの 岩の 色と 雪の 高さ（stages.ts の 値と そろえる）
  const ROCK: Record<number, [string, string] | undefined> = { 1: ['#f0b48a', '#d89470'], 2: ['#e6c9a4', '#c4a07c'], 3: ['#b4c2d8', '#8c9cb8'], 4: ['#8fa8cc', '#6a84b0'], 5: ['#4a4250', '#332c3a'], 6: ['#93a694', '#6f8474'] }
  const SNOW: Record<number, number> = { 1: Infinity, 2: Infinity, 3: 4.5, 4: 5, 5: Infinity, 6: Infinity }
  tiles.forEach((t, ti) => {
    const n = LAYOUT[Math.floor(ti / 3)][ti % 3]
    // 地方の 地面・土台・空を はずし、地面だけ 世界の 高さで 作りなおす
    let mats: THREE.Material[] | null = null
    let tint: [string, string] = ['#ffffff', '#e8e8e8']
    for (const c of [...t.s.group.children]) {
      const m = c as THREE.Mesh
      if (c.userData.backdrop) {
        if (ti !== 4) c.visible = false
        continue
      }
      if (!m.isMesh || !Array.isArray(m.material)) continue
      if (m.material.length === 3 && !mats) {
        mats = m.material
        // 地面の 色の 組を 元の 面から ひろう（いちばん 暗い / 明るい）
        const col = m.geometry.attributes.color
        if (col) {
          let lo = 9
          let hi = -1
          let cl = '#ffffff'
          let ch = '#ffffff'
          const k = new THREE.Color()
          for (let i = 0; i < Math.min(col.count, 3000); i += 3) {
            k.setRGB(col.getX(i), col.getY(i), col.getZ(i))
            const l = k.r + k.g + k.b
            if (l < lo) (lo = l), (cl = '#' + k.getHexString())
            if (l > hi) (hi = l), (ch = '#' + k.getHexString())
          }
          tint = [ch, cl]
        }
        t.s.group.remove(m)
        m.geometry.dispose()
      } else if (m.material.length === 6) {
        // 土台の 箱（世界の ふちで 1 つに する）
        t.s.group.remove(m)
        m.geometry.dispose()
      }
    }
    if (!mats) return
    const map = (mats[0] as THREE.MeshLambertMaterial).map ?? undefined
    const ground = terrain(heightAt, map as THREE.Texture, tint, true, {
      rock: ROCK[n], snowLine: SNOW[n],
      area: { cx: t.ox, cz: t.oz, size: TILE + BLEND * 2, keep: (x, z) => owner(x, z) === ti && Math.abs(x) < WORLD_SIZE / 2 && Math.abs(z) < WORLD_SIZE / 2 },
    })
    group.add(ground)
    // さかいめの 近くの 小物は 新しい 高さに のせなおす
    for (const c of t.s.group.children) {
      if (c.userData.backdrop) continue
      const wx = c.position.x + t.ox
      const wz = c.position.z + t.oz
      const d = Math.max(Math.abs(c.position.x), Math.abs(c.position.z)) - TILE / 2
      if (d < -BLEND - 1) continue
      c.position.y += heightAt(wx, wz) - tileH(t, wx, wz, false)
    }
  })
  // 世界の 土台（1 つの 箱）
  const box = base('grass')
  group.add(box)
  const home = tiles[4].s
  return {
    id: 0, name: 'ひとつづきの世界', sub: 'ONE WORLD (PROTOTYPE)', group, heightAt, obstacles, foodSpots, treasures,
    food: home.food, residents: home.residents, fog: home.fog, sky: home.sky, sun: home.sun, hemi: home.hemi,
    fogRange: [30, 90],
    update(t, night) {
      inTile(() => {
        for (const k of tiles) k.s.update(t, night)
      })
    },
    dispose() {
      for (const k of tiles) k.s.dispose()
    },
  }
}
