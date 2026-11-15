/**
 * ひとつづきの 大きな 世界（計画 C）。
 *
 * 9 つの 地方（広さ 40 の ステージ）を 3×3 に ならべ、1 つの Stage として かえす。
 * - 高さ：地方ごとの heightAt を そのまま 使い、さかいめ BLEND の はばで 重みつき 平均（山が つながる）
 * - 地面：地方ごとに terrain() を 作りなおし、面の もちぬしを 升目ごとに ゆらして まだらに まぜる
 * - 外がわ：のぼれない 山なみ（海の そばは 海が ふちまで）
 * - 重さ：cull(x, z, r) で 見ている 所から 遠い 地方の 小物と 地面を かくす
 */
import * as THREE from 'three'
import { Tex } from './textures'
import { STAGES, SIZE, base, edge, lambert, setEdgeOff, setLandSize, smooth, terrain } from './stages'
import { waterSurface } from './fxprops'
import { rng } from './textures'
import type { FoodSpot, Obstacle, Stage } from './stages'

/**
 * ひとつづきの世界の 見本（計画 C の 1 歩め）。`?world=1` を つけた時だけ 使う（セーブは しない）。
 * いまの 7 ステージ + 新しい 2 つ（城の丘・浅瀬）を 3×3 に ならべて 1 枚の地面に する。
 * まだ やっていないこと：さかいめの 地形と色の なじませ・近くだけ描く・地方ごとの 天気と BGM・セーブ。
 * まずは「スマホで どのくらいの 速さで 動くか」を はかるための もの。
 */
export const TILE = 40
/** 北 → 南・西 → 東 の ならび（-1 = 城の丘 / -2 = 浅瀬） */
// 2026-11-15：西（左）の まんなかを 森（味方の 町が 始まる）・まんなかは 何もない 丘（戦場）・右上の いせきに 敵の 町・南東は 海
// 2026-11-15（2）：左下（南西）の すみを 森（味方の スタート）・右上（北東）の いせきに 敵。砂浜の 2 つ（入り江・海）は 南に ならべる
const LAYOUT = [
  [3, 4, 6],
  [1, -1, 5],
  [0, 2, -2],
]
/** 海の 地方（ここの 外がわは 山で なく 海が 世界の ふちまで つづく） */
const SEA = -2
export const WORLD_SIZE = TILE * 3
/** 大きな 世界の 森の 地方の まんなか（古い セーブの 森の 町を うつす 先の 目安） */
export function worldForest() {
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (LAYOUT[j][i] === 0) return { x: (i - 1) * TILE - 2, z: (j - 1) * TILE - 2 }
  return { x: 0, z: 0 }
}

/**
 * 海の 地方：ひろい 海に 砂の 小島と 岩・難破船・ブイ・海の 上の さんご。水は 0.3 より 低い 所（地面が 水を かくす）。
 * 当たり判定は 低い 所に 水の 丸を ならべる（浮く 子だけ 入れる）
 */
function seaTile(): Stage {
  const isles: [number, number, number, number][] = [[2, 0, 3.8, 1.2], [11, -6, 2.6, 0.9], [-2, 9, 3.0, 1.0], [12, 11, 2.4, 0.8]]
  const heightAt = (x: number, z: number) => {
    let h = 0.16 + Math.sin(x * 0.4) * Math.sin(z * 0.37) * 0.04
    // 砂浜：陸（西と 北）の がわは 波打ちぎわから なだらかに 上がる
    const shore = Math.max(smooth(-TILE / 2 + 11, -TILE / 2 + 3, x + Math.sin(z * 0.3) * 1.5), smooth(-TILE / 2 + 11, -TILE / 2 + 3, z + Math.sin(x * 0.27) * 1.5))
    h = Math.max(h, 0.16 + shore * 0.55)
    for (const [ix, iz, r, hh] of isles) h = Math.max(h, 0.16 + hh * smooth(r, r * 0.35, Math.hypot(x - ix, z - iz)) + Math.sin(x * 1.3 + z) * 0.05 * smooth(r, 0, Math.hypot(x - ix, z - iz)))
    return h
  }
  const group = new THREE.Group()
  group.add(terrain(heightAt, Tex.beach(), ['#ffffff', '#ffeccc'], true, { snowLine: Infinity }), base('sand'))
  // 海の 面（となりの 地方へ すこし はみ出す：陸が 高い 所では 地面に かくれる）
  // 海は 南東の すみ：西と 北へ だけ はみ出す（世界の 外へは 出さない）
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(TILE + 8, TILE + 8, 8, 8).rotateX(-Math.PI / 2), waterSurface({ deep: '#1468b8', shallow: '#4fd0e0' }))
  sea.position.set(-4, 0.3, -4)
  group.add(sea)
  const obstacles: Obstacle[] = []
  for (let z = -TILE / 2 + 0.8; z < TILE / 2; z += 1.6) for (let x = -TILE / 2 + 0.8; x < TILE / 2; x += 1.6) if (heightAt(x, z) < 0.29) obstacles.push({ x, z, r: 1.05, water: true })
  const r = rng(808)
  // 岩・海の さんご・ブイ・難破船
  const rockM = lambert('#7a8290')
  for (let i = 0; i < 14; i++) {
    const s = 0.4 + r() * 0.9
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockM)
    m.position.set((r() - 0.5) * (TILE - 4), 0.2 + s * 0.3, (r() - 0.5) * (TILE - 4))
    m.rotation.set(r() * 3, r() * 3, r() * 3)
    m.scale.y = 0.6 + r() * 0.8
    group.add(m)
  }
  const coralC = ['#ff7aa8', '#ff9f43', '#b48cff', '#5fe0c0']
  for (let i = 0; i < 18; i++) {
    const cx = (r() - 0.5) * (TILE - 4)
    const cz = (r() - 0.5) * (TILE - 4)
    if (heightAt(cx, cz) > 0.29) continue
    const mat = lambert(coralC[i % 4])
    for (let k = 0; k < 3; k++) {
      const hgt = 0.25 + r() * 0.35
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, hgt, 5), mat)
      b.position.set(cx + (r() - 0.5) * 0.4, 0.2 + hgt / 2, cz + (r() - 0.5) * 0.4)
      b.rotation.set((r() - 0.5) * 0.8, 0, (r() - 0.5) * 0.8)
      group.add(b)
    }
  }
  const buoys: THREE.Group[] = []
  for (const [x, z, c] of [[3, -2, '#ff4d6d'], [-6, 2, '#ffd23f'], [12, 2, '#ff4d6d']] as const) {
    const b = new THREE.Group()
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.5, 8), lambert(c))
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: '#5ef2ff' }))
    lamp.position.y = 0.36
    b.add(body, lamp)
    b.position.set(x, 0.4, z)
    group.add(b)
    buoys.push(b)
  }
  const wood = lambert('#7a4e2d')
  const ship = new THREE.Group()
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.7, 1.2), wood)
  hull.position.y = 0.3
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 5), wood)
  mast.position.set(0.3, 1.4, 0)
  mast.rotation.z = 0.5
  const sail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.0, 1.2), lambert('#d8ccb0'))
  sail.position.set(0.7, 1.7, 0)
  sail.rotation.z = 0.5
  ship.add(hull, mast, sail)
  ship.position.set(7, 0.05, 6)
  ship.rotation.set(0.15, 0.6, 0.25)
  group.add(ship)
  obstacles.push({ x: 7, z: 6, r: 1.6 })
  return {
    id: 0, name: 'ひろい うみ', sub: 'OPEN SEA', group, heightAt, obstacles, foodSpots: [],
    food: { name: '', color: '#fff', leaf: '#fff' }, residents: [],
    fog: '#fff', sky: ['#fff', '#fff', '#fff'], sun: { color: '#fff', intensity: 1, dir: [0, 1, 0] }, hemi: ['#fff', '#fff', 1],
    update(t) {
      buoys.forEach((b, i) => {
        b.position.y = 0.4 + Math.sin(t * 1.6 + i) * 0.06
        b.rotation.z = Math.sin(t * 1.1 + i) * 0.12
      })
    },
    dispose() {
      group.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
    },
  }
}

/** 新しい地方：なだらかな 草の丘（まんなかの 戦場） */
function hillTile(): Stage {
  const heightAt = (x: number, z: number) => 0.32 + (Math.sin(x * 0.16 + 1) * Math.cos(z * 0.14) * 0.5 + 0.5) * edge(x, z)
  const group = new THREE.Group()
  group.add(terrain(heightAt, Tex.grass(), ['#b4c898', '#96b07c']), base('grass'))
  return {
    id: 0, name: 'まんなかの おか', sub: 'CENTER HILLS', group, heightAt, obstacles: [], foodSpots: [],
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
      const s = n === -1 ? hillTile() : n === SEA ? seaTile() : STAGES[n]()
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
  // 海の 地方の 重み（そばでは 外がわの 山を 消す）
  const seaW = (x: number, z: number) => {
    let w = 0
    tiles.forEach((t, i) => {
      // 海の 地方と、南に 海の ある さんごの入り江（2）の そばは 外の 山を 作らない
      const n = LAYOUT[Math.floor(i / 3)][i % 3]
      if (n === SEA || n === 2) w = Math.max(w, smooth(10, -4, Math.max(Math.abs(x - t.ox), Math.abs(z - t.oz)) - TILE / 2))
    })
    return w
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
    // 世界の いちばん 外がわは のぼれない 山なみ（ふちまで のぼりつづける = てっぺんに 平らな所を 作らない）。海の 地方の そばは 海の まま
    const rim = WORLD_SIZE / 2 - Math.max(Math.abs(x), Math.abs(z))
    const sea = seaW(x, z)
    if (rim < 15 && sea < 0.99) {
      const t = Math.max(0, (15 - rim) / 15)
      const ridge = Math.abs(Math.sin(x * 0.11 + 0.7) + 0.6 * Math.sin(z * 0.17 + x * 0.05) + 0.45 * Math.sin((x + z) * 0.29))
      return Math.max(h, 0.3 + (6 + 16 * Math.pow(ridge / 2.05, 1.3)) * Math.pow(t, 1.5) * (1 - sea))
    }
    return Math.max(0.24, h)
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
      // その 場所に とどく 地方（重みが 0 より 大きい）だけから えらぶ。ゆらぎで 遠い 地方が えらばれると、
      // その 地方の 地面は そこまで ないので 穴が あく
      const w0 = weight(t, x, z)
      if (w0 <= 0.001) return
      const w = w0 + jit(x + i * 3.1, z - i * 1.7)
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
  const grounds: (THREE.Object3D | null)[] = tiles.map(() => null)
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
    grounds[ti] = ground
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
  // 味方は 森の はじまりの 場所から、敵は 右上の いせきの まんなかで 町を そだてる
  const forest = tiles.find((_t, i) => LAYOUT[Math.floor(i / 3)][i % 3] === 0)!
  const ruins = tiles.find((_t, i) => LAYOUT[Math.floor(i / 3)][i % 3] === 6)!
  // 森の 地方の 西がわ（外の 山なみに かからない 所）。まわりの 木と 岩は どける（町の 土地）
  const start = { x: forest.ox - 2, z: forest.oz - 2 }
  const CLEAR = 10
  for (let i = obstacles.length - 1; i >= 0; i--) if (!obstacles[i].water && Math.hypot(obstacles[i].x - start.x, obstacles[i].z - start.z) < CLEAR) obstacles.splice(i, 1)
  for (const c of [...forest.s.group.children]) {
    if (c.userData.backdrop) continue
    if (Math.hypot(c.position.x + forest.ox - start.x, c.position.z + forest.oz - start.z) < CLEAR && !(c as THREE.Mesh).geometry?.type?.includes('Plane')) c.visible = false
  }
  for (let i = foodSpots.length - 1; i >= 0; i--) if (Math.hypot(foodSpots[i].x - start.x, foodSpots[i].z - start.z) < CLEAR) foodSpots.splice(i, 1)
  const foeStart = { x: ruins.ox + 1.2, z: ruins.oz + 1.2 }
  const home = forest.s
  return {
    id: 0, name: 'ひとつづきの世界', sub: 'ONE WORLD (PROTOTYPE)', group, heightAt, obstacles, foodSpots, treasures, start, foeStart,
    /**
     * 読みこみ範囲（重さ対策）：見ている 所から 遠い 地方は 描かない。近くは 今の 見た目の まま。
     * 地方の 小物の 箱と 地面を、見える 範囲 r に かからなければ かくす
     */
    region(x: number, z: number) {
      const i = Math.max(0, Math.min(2, Math.floor((x + WORLD_SIZE / 2) / TILE)))
      const j = Math.max(0, Math.min(2, Math.floor((z + WORLD_SIZE / 2) / TILE)))
      const n = LAYOUT[j][i]
      const t = tiles[j * 3 + i].s
      // 丘は 森と、海は 入り江と 同じ 天気・たまご
      return { id: n === -1 ? 0 : n === SEA ? 2 : n, name: t.name, sub: t.sub }
    },
    cull(x: number, z: number, r: number) {
      tiles.forEach((t, i) => {
        const dx = Math.max(0, Math.abs(x - t.ox) - TILE / 2 - BLEND)
        const dz = Math.max(0, Math.abs(z - t.oz) - TILE / 2 - BLEND)
        const vis = Math.hypot(dx, dz) < r
        t.s.group.visible = vis
        if (grounds[i]) grounds[i]!.visible = vis
      })
    },
    // 森の ほかの 地方には その 地方の 敵（2 ひきまで）
    regionResidents: tiles.flatMap((t, i) => {
      const n = LAYOUT[Math.floor(i / 3)][i % 3]
      return n <= 0 ? [] : t.s.residents.slice(0, 2).map((id) => ({ id, region: n, ox: t.ox, oz: t.oz }))
    }),
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
