import * as THREE from 'three'
import { Tex } from './textures'
import { STAGES, SIZE, base, setLandSize, terrain } from './stages'
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
  const heightAt = (x: number, z: number) => 0.32 + (hill ? Math.sin(x * 0.16 + 1) * Math.cos(z * 0.14) * 0.5 + 0.5 : Math.sin(x * 0.3) * Math.sin(z * 0.27) * 0.1 + 0.1) * Math.min(1, Math.max(0, (TILE / 2 - Math.max(Math.abs(x), Math.abs(z))) / 2.5))
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
  const tileAt = (x: number, z: number) => {
    const i = Math.min(2, Math.max(0, Math.floor((x + WORLD_SIZE / 2) / TILE)))
    const j = Math.min(2, Math.max(0, Math.floor((z + WORLD_SIZE / 2) / TILE)))
    return tiles[j * 3 + i]
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
  const heightAt = (x: number, z: number) => {
    const t = tileAt(x, z)
    return inTile(() => t.s.heightAt(x - t.ox, z - t.oz))
  }
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
