/** World.ts から分けた「village」のメソッド。this は World（World.ts のクラスのつなぎの行から呼ばれる） */
import * as THREE from 'three'
import { psx } from '../psx'
import { SpriteAnim } from '../sprites'
import { Tex } from '../textures'
import { HALF, LAND_SIZES, setLandSize } from '../stages'
import { STRUCTS, buildScaffold, buildStructModel, styleOf, type StructKind } from '../structures'
import { ITEM_SPEC, buildItem, disposeItem, tickItem, type ItemKind } from '../items'
import type { World } from '../World'
import { Creature, House, Struct, Festival, Peddler, FoodKind, Food, Item, STRUCT_DONE, FOODS, HOUSE_STEPS, MAX_STRUCTS, FORT_RANGE, MAX_HOUSES, MAX_RES, houseLevel, houseMaxHp, ROOF, BOSSES } from '../World'

export function makeFoodMesh(this: World, kind: FoodKind) {
  const f = kind === 'stage' ? this.stage.food : FOODS[kind]
  const g = new THREE.Group()
  const geo =
    kind === 'meat'
      ? new THREE.CylinderGeometry(0.1, 0.16, 0.28, 6).rotateZ(Math.PI / 2)
      : kind === 'nut'
        ? new THREE.DodecahedronGeometry(0.15, 0)
        : new THREE.IcosahedronGeometry(0.16, 0)
  const body = new THREE.Mesh(geo, psx(new THREE.MeshLambertMaterial({ color: f.color, flatShading: true, emissive: f.color, emissiveIntensity: 0.15 })))
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.06), psx(new THREE.MeshLambertMaterial({ color: f.leaf })))
  leaf.position.set(kind === 'meat' ? 0.18 : 0.05, kind === 'meat' ? 0 : 0.16, 0)
  leaf.rotation.z = 0.5
  g.add(body, leaf)
  return g
}

export function dropFood(this: World, x?: number, z?: number, from = 2.5, kind: FoodKind = 'stage') {
  if (x === undefined || z === undefined) {
    const spots = [...this.stage.foodSpots, ...this.items.filter((it) => it.stage === this.stageIndex && ((it.kind === 'sapling' && it.grow >= 1) || it.kind === 'flowerbed'))]
    const s = spots[Math.floor(Math.random() * spots.length)] ?? { x: 0, z: 0 }
    const a = Math.random() * Math.PI * 2
    x = s.x + Math.cos(a) * (0.7 + Math.random() * 0.6)
    z = s.z + Math.sin(a) * (0.7 + Math.random() * 0.6)
  }
  // 水の上に落ちたら岸へずらす
  for (const o of this.stage.obstacles) {
    if (!o.water) continue
    const d = Math.hypot(x - o.x, z - o.z)
    if (d < o.r + 0.4) {
      const k = (o.r + 0.5) / (d || 1)
      x = o.x + (x - o.x) * k
      z = o.z + (z - o.z) * k
    }
  }
  x = THREE.MathUtils.clamp(x, -HALF, HALF)
  z = THREE.MathUtils.clamp(z, -HALF, HALF)
  const mesh = this.makeFoodMesh(kind)
  const y = this.stage.heightAt(x, z) + from
  mesh.position.set(x, y, z)
  this.scene.add(mesh)
  const food: Food = { mesh, x, z, y, vy: 0, landed: false, taken: null, bite: 0, kind }
  this.foods.push(food)
  return food
}

export function removeFood(this: World, f: Food) {
  this.scene.remove(f.mesh)
  f.mesh.traverse((o) => {
    const m = o as THREE.Mesh
    m.geometry?.dispose()
    ;(m.material as THREE.Material | undefined)?.dispose()
  })
  const i = this.foods.indexOf(f)
  if (i >= 0) this.foods.splice(i, 1)
}

export function lam(this: World, color: string, extra: THREE.MeshLambertMaterialParameters = {}) {
  return psx(new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }))
}

export function mountItem(this: World, it: Item) {
  const g = buildItem(it.kind, { low: this.lowQ, fruit: this.stage.food.color })
  g.position.set(it.x, this.stage.heightAt(it.x, it.z) + (it.fall ?? 0), it.z)
  g.rotation.y = it.rot
  this.scene.add(g)
  it.mesh = g
  it.st = undefined
}

export function unmountItem(this: World, it: Item) {
  if (it.fshadow) {
    this.scene.remove(it.fshadow)
    it.fshadow = undefined
  }
  if (!it.mesh) return
  this.scene.remove(it.mesh)
  disposeItem(it.mesh)
  it.mesh = null
}

/** 画質：「低」では置き物の光源（たき火・ランタン）を作らない。作り直すので今の箱庭だけ入れ替える */
export function setItemQuality(this: World, q: 'high' | 'low') {
  const low = q === 'low'
  if (low === this.lowQ) return
  this.lowQ = low
  for (const it of this.items)
    if (it.stage === this.stageIndex && it.mesh) {
      this.unmountItem(it)
      this.mountItem(it)
    }
}

/** 買った置き物を、見ている所のまわりに「上から落として」置く */
export function placeItem(this: World, kind: ItemKind): Item {
  const p = this.freePos(1.2, this.look.x, this.look.z, 3)
  const it: Item = {
    kind, stage: this.stageIndex, x: p.x, z: p.z, grow: kind === 'sapling' ? 0 : 1, vx: 0, vz: 0, mesh: null,
    rot: ITEM_SPEC[kind].turn ? (Math.random() - 0.5) * 1.1 : 0, fall: 4.4, fvy: 0, sq: 0, tick: 0,
  }
  this.items.push(it)
  this.mountItem(it)
  const sh = new THREE.Mesh(this.shadowGeo, this.shadowMat)
  sh.position.set(it.x, this.stage.heightAt(it.x, it.z) + 0.03, it.z)
  sh.scale.setScalar(0.3)
  this.scene.add(sh)
  it.fshadow = sh
  return it
}

/** 置き物の ローカル座標（右 lx・手前 lz）を、箱庭の座標に直す */
export function itemLocal(this: World, it: Item, lx: number, lz: number) {
  const c = Math.cos(it.rot)
  const s = Math.sin(it.rot)
  return { x: it.x + lx * c + lz * s, z: it.z - lx * s + lz * c }
}

/** その種類の置き物のうち、いちばん近い物（落ちてくる途中のものは数えない） */
export function nearestItem(this: World, kind: ItemKind, x: number, z: number, range = 99) {
  let best: Item | null = null
  let bd = range
  for (const it of this.items) {
    if (it.kind !== kind || it.stage !== this.stageIndex || !it.mesh || it.fall !== undefined) continue
    const d = Math.hypot(it.x - x, it.z - z)
    if (d < bd) {
      bd = d
      best = it
    }
  }
  return best
}

/** あそべる おもちゃ（ボール・すべりだい・ぬいぐるみ）のうち、近くて その子に合う物 */
export function playToy(this: World, c: Creature): { it: Item; p: number } | null {
  const kid = c.grow > 0
  let best: { it: Item; p: number } | null = null
  let bd = 99
  for (const it of this.items) {
    if (it.stage !== this.stageIndex || !it.mesh || it.fall !== undefined) continue
    let p = 0
    let range = 8
    if (it.kind === 'ball') p = 0.25
    else if (it.kind === 'slide') {
      p = kid ? 0.4 : 0.22
      range = 10
    } else if (it.kind === 'plush') {
      p = kid ? 0.55 : 0.06
      range = 10
    } else continue
    const d = Math.hypot(it.x - c.x, it.z - c.z)
    if (d < range && d < bd) {
      bd = d
      best = { it, p }
    }
  }
  return best
}

/** 戦っている なかまの こうげき補正：おうえんばたの近くなら 2 わり UP */
export function bannerBoost(this: World, c: Creature) {
  return this.ally(c) && this.nearItem('banner', c.x, c.z, 4.5) ? 1.2 : 1
}

/** 買った時の演出：コインが 吸いこまれていく */
export function buyFx(this: World, x: number, z: number, h = 0.5) {
  const to = new THREE.Vector3(x, this.stage.heightAt(x, z) + h, z)
  const n = this.lowQ ? 4 : 7
  for (let i = 0; i < n; i++) {
    const a = new SpriteAnim(this.fxSheets.coin, 0.3)
    a.sprite.center.set(0.5, 0.5)
    const ang = (i / n) * Math.PI * 2 + Math.random()
    const from = new THREE.Vector3(to.x + Math.cos(ang) * 2.2, to.y + 1.4 + Math.random() * 1.2, to.z + Math.sin(ang) * 2.2)
    a.sprite.position.copy(from)
    a.sprite.visible = false
    this.scene.add(a.sprite)
    this.sucks.push({ anim: a, from, to, t: -i * 0.05, dur: 0.55, bs: a.sprite.scale.x })
  }
}

export function updateSucks(this: World, dt: number) {
  for (const s of [...this.sucks]) {
    s.t += dt
    if (s.t < 0) continue
    const k = Math.min(1, s.t / s.dur)
    const e = k * k * (1.4 - 0.4 * k)
    const sp = s.anim.sprite
    sp.visible = true
    const rx = s.from.x - s.to.x
    const rz = s.from.z - s.to.z
    const ang = e * 2.4
    const f = 1 - e
    sp.position.set(
      s.to.x + (rx * Math.cos(ang) - rz * Math.sin(ang)) * f,
      s.from.y + (s.to.y - s.from.y) * e + Math.sin(e * Math.PI) * 0.35,
      s.to.z + (rx * Math.sin(ang) + rz * Math.cos(ang)) * f,
    )
    sp.scale.setScalar(s.bs * (1 - e * 0.55))
    if (k >= 1) {
      this.scene.remove(sp)
      s.anim.dispose()
      this.sucks.splice(this.sucks.indexOf(s), 1)
      if (Math.random() < 0.7) this.burst(s.to.x, s.to.y, s.to.z, 'spark', 1, 1)
    }
  }
}

/** 買った置き物が落ちてくる：はずんで、つぶれて、火花 */
export function dropStep(this: World, it: Item, dt: number, gy: number) {
  it.fvy = (it.fvy ?? 0) - 16 * dt
  it.fall = (it.fall ?? 0) + it.fvy * dt
  if (it.fall > 0) {
    if (it.fshadow) {
      it.fshadow.position.set(it.x, gy + 0.03, it.z)
      it.fshadow.scale.setScalar(Math.max(0.25, 0.9 - it.fall * 0.14))
    }
    return
  }
  it.fall = 0
  const v = -it.fvy
  it.sq = Math.min(1, v / 8)
  const big = v > 8
  this.burst(it.x, gy + 0.2, it.z, 'spark', big ? 8 : 3, big ? 2.4 : 1.4)
  if (big) {
    this.ring(it.x, it.z, '#fff6c8', 1.8, 0.5)
    this.onSfx('hit')
  }
  if (v > 2.4) it.fvy = v * 0.36
  else {
    it.fall = undefined
    it.fvy = 0
    if (it.fshadow) {
      this.scene.remove(it.fshadow)
      it.fshadow = undefined
    }
  }
}

export function updateItems(this: World, dt: number) {
  const wind = this.weather === 'rain' || this.weather === 'ember' ? 1.7 : this.weather === 'snow' ? 1.25 : 1
  for (const it of this.items) {
    if (it.stage !== this.stageIndex || !it.mesh) continue
    const gy = this.stage.heightAt(it.x, it.z)
    if (it.fall !== undefined) this.dropStep(it, dt, gy)
    let busy = false
    switch (it.kind) {
      case 'sapling': {
        if (it.grow < 1) it.grow = Math.min(1, it.grow + dt / 60)
        const st = it.grow < 0.34 ? 0 : it.grow < 1 ? 1 : 2
        if (it.st === undefined) it.st = st
        else if (st !== it.st) {
          it.st = st
          this.burst(it.x, gy + 0.9, it.z, 'spark', 5, 1.6)
          if (st === 1) this.say('なえが ぐんぐん のびて わかぎに なった')
          else {
            this.say('なえが そだって 木に なった！ みが なるよ')
            this.dropFood(it.x + 0.8, it.z)
          }
        }
        break
      }
      case 'ball': {
        it.x += it.vx * dt
        it.z += it.vz * dt
        const k = Math.exp(-dt * 1.6)
        it.vx *= k
        it.vz *= k
        for (const o of this.stage.obstacles) {
          const dx = it.x - o.x
          const dz = it.z - o.z
          const d = Math.hypot(dx, dz)
          if (d < o.r + 0.2 && d > 0) {
            it.x = o.x + (dx / d) * (o.r + 0.2)
            it.z = o.z + (dz / d) * (o.r + 0.2)
            const dot = (it.vx * dx + it.vz * dz) / d
            it.vx -= (2 * dot * dx) / d
            it.vz -= (2 * dot * dz) / d
          }
        }
        if (Math.abs(it.x) > HALF) it.vx *= -1
        if (Math.abs(it.z) > HALF) it.vz *= -1
        it.x = THREE.MathUtils.clamp(it.x, -HALF, HALF)
        it.z = THREE.MathUtils.clamp(it.z, -HALF, HALF)
        break
      }
      case 'lantern': {
        // よる、そばに集まった子の こころが育つ
        if (this.night > 0.4 && it.fall === undefined) {
          it.tick += dt
          if (it.tick > 3) {
            it.tick = 0
            for (const c of this.creatures) {
              if (!this.ally(c) || !this.alive(c) || c.state === 'fight' || c.inside || Math.hypot(c.x - it.x, c.z - it.z) > 2.6) continue
              this.addCare(c, 'spirit', 0.25)
              if (c === this.pet) this.stats.mood = Math.min(100, this.stats.mood + 0.8)
              if (Math.random() < 0.3) this.burst(c.x, this.ground(c) + this.size(c) + 0.2, c.z, 'heart', 1, 0.8)
            }
          }
        }
        break
      }
      case 'tools':
        busy = this.creatures.some((c) => c.state === 'work' && Math.hypot(c.x - it.x, c.z - it.z) < 3.4)
        break
      case 'plush':
        busy = this.creatures.some((c) => c.state === 'play' && this.playAt.get(c) === it)
        break
      default:
        break
    }
    it.mesh.position.set(it.x, gy + (it.fall ?? 0), it.z)
    if (it.sq > 0) {
      it.sq = Math.max(0, it.sq - dt * 3.2)
      it.mesh.scale.set(1 + it.sq * 0.22, 1 - it.sq * 0.3, 1 + it.sq * 0.22)
    }
    tickItem(it.kind, it.mesh, { t: this.time, dt, night: this.night, wind, grow: it.grow, vx: it.vx, vz: it.vz, busy, day: this.night < 0.4 })
  }
}

export function homeOf(this: World, c: Creature) {
  return this.houses.find((h) => h.owner === c && h.stage === this.stageIndex) ?? null
}

export function nearestHouse(this: World, c: Creature, pred: (h: House) => boolean, range: number) {
  let best: House | null = null
  let bd = range
  for (const h of this.houses) {
    if (h.stage !== this.stageIndex || !pred(h)) continue
    const d = Math.hypot(h.x - c.x, h.z - c.z)
    if (d < bd) {
      bd = d
      best = h
    }
  }
  return best
}

/** 家を持っていない子：空き家に住みつくか、新しく建てはじめる */
export function claimHouse(this: World, c: Creature): House | null {
  const empty = this.nearestHouse(c, (h) => !h.owner, 12)
  if (empty) {
    empty.owner = c
    empty.ownerSp = c.sp.id
    this.refreshHouse(empty, true)
    return empty
  }
  const here = this.houses.filter((h) => h.stage === this.stageIndex)
  if (here.length >= MAX_HOUSES) return null
  for (let i = 0; i < 40; i++) {
    const q = this.freePos(0, c.x, c.z, 6)
    if (Math.hypot(q.x, q.z) < 2) continue
    if (Math.abs(q.x) > HALF - 1.2 || Math.abs(q.z) > HALF - 1.2) continue
    if (here.some((h) => Math.hypot(h.x - q.x, h.z - q.z) < 3)) continue
    if (this.stage.obstacles.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < o.r + 1.3)) continue
    const h: House = { stage: this.stageIndex, x: q.x, z: q.z, owner: c, ownerSp: c.sp.id, mats: 0, hp: 0, mesh: null, shake: 0, level: 0, alerted: 0 }
    this.houses.push(h)
    this.mountHouse(h)
    if (this.ally(c)) this.say(`${c.sp.name}が いえを たてはじめた`)
    return h
  }
  return null
}

/** 家のちかくに だいくどうぐ / まもりのさく があるか */
export function nearItem(this: World, kind: ItemKind, x: number, z: number, r: number) {
  return this.items.some((it) => it.kind === kind && it.stage === this.stageIndex && it.mesh && Math.hypot(it.x - x, it.z - z) < r)
}

export function addMaterial(this: World, h: House, by: Creature) {
  const before = h.level
  // だいくどうぐ の近くなら 1 回で 2 個分
  const bonus = this.nearItem('tools', h.x, h.z, 6) ? 2 : 1
  if (this.ally(by)) this.stat('mats', bonus)
  h.mats = Math.min(HOUSE_STEPS[4], h.mats + bonus)
  h.level = houseLevel(h.mats)
  h.hp = Math.min(houseMaxHp(h.level), h.hp + 9)
  this.burst(h.x, this.stage.heightAt(h.x, h.z) + 0.8, h.z, 'spark', 4, 1.5)
  if (h.level !== before) {
    this.refreshHouse(h)
    const who = by.sp.name
    if (this.ally(by)) {
      this.say(h.level === 4 ? `${who}の いえが ぞうちくされた！` : h.level === 3 ? `${who}の いえが かんせい！` : h.level === 2 ? `${who}の いえに かべが できた` : `${who}の いえの どだいが できた`)
      if (h.level === 3) this.stat('houseDone')
      if (h.level === 4) this.stat('houseExp')
      if (h.level >= 3) {
        this.earn(h.level === 4 ? 15 : 10, h.x, h.z)
        this.mark(h.x, h.z, 2)
        this.onSfx('built')
      }
    } else if (h.level >= 3 && Math.hypot(h.x - this.look.x, h.z - this.look.z) < 9) this.say(`やせいの ${who}が いえを たてた`)
  }
}

/** 家がこわされる。hp が 0 になると 1 段階くずれ、資材がちらばる */
export function damageHouse(this: World, h: House, dmg: number, by: Creature | null) {
  // まもりのさく の近くは ダメージ半分
  if (this.nearItem('fence', h.x, h.z, 3.2)) dmg *= 0.5
  h.hp -= dmg
  h.shake = 0.3
  const y = this.stage.heightAt(h.x, h.z) + 0.6
  this.burst(h.x, y, h.z, 'hit', 2, 2)
  const owner = h.owner
  if (by && owner && this.alive(owner) && owner.state !== 'fight' && by.sp.temper !== owner.sp.temper) {
    // 持ち主がかけつけて追いはらう
    if (Math.hypot(owner.x - h.x, owner.z - h.z) < 9 && owner.grow === 0) {
      if (owner.inside) {
        owner.inside = false
        owner.anim.sprite.visible = true
        owner.shadow.visible = true
      }
      owner.foe = by
      this.setState(owner, 'hunt', 8)
    }
  }
  if (by && owner && this.ally(owner) && this.time - h.alerted > 12) {
    h.alerted = this.time
    this.say(`${owner.sp.name}の いえが ${by.sp.name}に おそわれている！`)
  }
  if (h.hp > 0) return
  const lv = h.level
  h.mats = HOUSE_STEPS[Math.max(0, lv - 1)]
  h.level = houseLevel(h.mats)
  h.hp = houseMaxHp(h.level) * 0.5
  for (let i = 0; i < 2; i++) this.spawnResource(h.x + (Math.random() - 0.5) * 2, h.z + 1 + Math.random())
  this.burst(h.x, y, h.z, 'cube', 10, 3)
  if (owner && this.ally(owner)) this.say(h.level === 0 ? `${owner.sp.name}の いえが こわされた…` : `${owner.sp.name}の いえが こわれかけている`)
  if (h.level === 0) {
    this.unmountHouse(h)
    this.houses.splice(this.houses.indexOf(h), 1)
    for (const c of this.creatures) if (c.raid === h) c.raid = null
  } else this.refreshHouse(h)
}

export function refreshHouse(this: World, h: House, force = false) {
  if (!force && h.mesh && h.mesh.userData.level === h.level) return
  this.unmountHouse(h)
  if (h.stage === this.stageIndex) this.mountHouse(h)
}

/** 家の見た目：建てた段階ごとに 土台 → かべ → 屋根 */
export function mountHouse(this: World, h: House) {
  h.level = houseLevel(h.mats)
  const g = new THREE.Group()
  g.userData.level = h.level
  const st = styleOf(h.stage)
  const stone = this.lam(st.stone, { map: this.rock() })
  const wood = this.lam(st.wall, { map: this.bark() })
  if (h.level === 0) {
    // 建てる場所の目印：杭と、運びこまれた資材の山
    for (const [x, z] of [[-0.65, -0.55], [0.65, -0.55], [-0.65, 0.55], [0.65, 0.55]]) {
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.4, 5), wood)
      stake.position.set(x, 0.2, z)
      g.add(stake)
    }
    for (let i = 0; i < h.mats; i++) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), stone)
      m.position.set(-0.2 + i * 0.25, 0.1, 0)
      g.add(m)
    }
  }
  if (h.level >= 1) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 1.3), stone)
    base.position.y = 0.11
    g.add(base)
  }
  if (h.level >= 2) {
    const walls = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.75, 1.0), wood)
    walls.position.y = 0.6
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.48, 0.05), this.lam('#3d2a1e'))
    door.position.set(0, 0.46, 0.51)
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.05), new THREE.MeshBasicMaterial({ color: '#ffd27a' }))
    win.position.set(0.38, 0.68, 0.51)
    win.name = 'window'
    g.add(walls, door, win)
  }
  if (h.level >= 3) {
    // 屋根の形は住む種族で変わる（四角・六角・八角）
    const sides = [4, 6, 8][(h.ownerSp.charCodeAt(0) + h.ownerSp.length) % 3]
    const up = h.level >= 4 ? 0.45 : 0
    const roof = new THREE.Mesh(new THREE.ConeGeometry(h.level >= 4 ? 0.95 : 1.05, 0.7, sides), this.lam(ROOF[h.ownerSp] ?? st.roof))
    roof.position.y = 1.32 + up
    if (sides === 4) roof.rotation.y = Math.PI / 4
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.16), stone)
    chimney.position.set(-0.32, 1.45 + up, -0.15)
    g.add(roof, chimney)
  }
  if (h.level >= 4) {
    // 増築：2 階・ベランダ・庭の花・ランプ
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.45, 0.8), wood).translateY(1.2))
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.3), wood).translateY(0.99).translateZ(0.62))
    const win2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.05), new THREE.MeshBasicMaterial({ color: '#ffd27a' }))
    win2.position.set(0, 1.22, 0.41)
    g.add(win2)
    for (const [x, z, col] of [[-0.8, 0.8, '#ff8fb1'], [0.8, 0.85, '#ffd23f'], [-0.55, 0.95, '#ffffff'], [0.45, 0.98, '#ff8fb1'], [0.95, 0.5, '#9fd8ff']] as const) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4), new THREE.MeshBasicMaterial({ color: col }))
      f.position.set(x, 0.1, z)
      g.add(f)
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), new THREE.MeshBasicMaterial({ color: st.accent }))
    lamp.position.set(-0.3, 0.75, 0.56)
    g.add(lamp)
  }
  g.position.set(h.x, this.stage.heightAt(h.x, h.z) - 0.02, h.z)
  g.userData.pop = this.time > 2 ? 0.55 : 0
  this.scene.add(g)
  h.mesh = g
  if (!h.hp) h.hp = houseMaxHp(h.level)
}

export function unmountHouse(this: World, h: House) {
  if (!h.mesh) return
  this.scene.remove(h.mesh)
  h.mesh.traverse((o) => {
    const m = o as THREE.Mesh
    m.geometry?.dispose()
    ;(m.material as THREE.Material | undefined)?.dispose?.()
  })
  h.mesh = null
}

export function updateHouses(this: World, dt: number) {
  for (const h of [...this.houses]) {
    if (h.stage !== this.stageIndex || !h.mesh) continue
    h.shake = Math.max(0, h.shake - dt)
    this.popAnim(h.mesh, dt)
    // えんとつのけむり：夜・雨・雪、または中にだれかいる時
    if (h.level >= 3) {
      const t = ((h.mesh.userData.smoke as number | undefined) ?? 0) - dt
      if (t <= 0) {
        h.mesh.userData.smoke = 0.7 + Math.random() * 0.6
        if (this.night > 0.5 || this.weather === 'rain' || this.weather === 'snow' || this.creatures.some((c) => c.inside && h.owner === c))
          this.smoke(h.x - 0.32, this.stage.heightAt(h.x, h.z) + 1.7 + (h.level >= 4 ? 0.45 : 0), h.z - 0.15)
      } else h.mesh.userData.smoke = t
    }
    // だいくどうぐ の近くの家は少しずつ直る
    if (h.level >= 1 && h.hp < houseMaxHp(h.level) && this.nearItem('tools', h.x, h.z, 6)) {
      h.hp = Math.min(houseMaxHp(h.level), h.hp + dt * 0.8)
      if (Math.random() < dt * 0.4) this.burst(h.x, this.stage.heightAt(h.x, h.z) + 0.9, h.z, 'spark', 1, 0.6)
    }
    h.mesh.position.x = h.x + (h.shake > 0 ? Math.sin(this.time * 60) * 0.05 : 0)
    const win = h.mesh.getObjectByName('window') as THREE.Mesh | undefined
    if (win) {
      // 夜や雨で中にだれかいると窓が光る
      const lit = this.creatures.some((c) => c.inside && h.owner === c)
      ;(win.material as THREE.MeshBasicMaterial).color.set(lit ? '#ffd27a' : '#5a4a3a')
    }
    // ひのこの日は木の家が少しずつ焦げる
    if (this.weather === 'ember' && h.level >= 2) {
      h.hp -= dt * 0.12
      if (Math.random() < dt * 0.6) this.burst(h.x, this.stage.heightAt(h.x, h.z) + 1.2, h.z, 'hit', 1, 0.5, -1)
      if (h.hp <= 0) this.damageHouse(h, 0.01, null)
    }
  }
}

export function rock(this: World) {
  return (this.rockTex ??= Tex.rock())
}

export function bark(this: World) {
  return (this.barkTex ??= Tex.bark())
}

export function structDone(this: World, b: Struct) {
  return b.mats >= STRUCTS[b.kind].need
}

export function structMaxHp(this: World, b: Struct) {
  const spec = STRUCTS[b.kind]
  return this.structDone(b) ? spec.hp : spec.hp * (0.3 + 0.7 * (b.mats / spec.need))
}

/** 建てかけの建物のうち、いちばん近いもの */
export function openSite(this: World, c: Creature | null): Struct | null {
  let best: Struct | null = null
  let bd = 99
  for (const b of this.structs) {
    if (b.stage !== this.stageIndex || this.structDone(b) || !b.mesh) continue
    const d = c ? Math.hypot(b.x - c.x, b.z - c.z) : 0
    if (d < bd) {
      bd = d
      best = b
    }
  }
  return best
}

/** 建てる場所を決めて、建設現場（資材 0）を置く。人がせっけいずを買った時は「見ている所」のまわり */
export function planStruct(this: World, kind: StructKind, nx = this.look.x, nz = this.look.z, quiet = false): Struct | null {
  const spec = STRUCTS[kind]
  const here = this.structs.filter((b) => b.stage === this.stageIndex)
  const fail = (t: string) => {
    if (!quiet) this.say(t)
    return null
  }
  if (here.length >= MAX_STRUCTS) return fail('もう たてる ばしょが ない…')
  if (kind === 'castle' && here.some((b) => b.kind === 'castle')) return fail('おしろは ひとつだけ')
  if (kind === 'market' && this.vLv < 1) return fail('いちばは むらが うまれてから ひらける')
  if (kind !== 'wall' && kind !== 'castle' && here.filter((b) => b.kind === kind).length >= (spec.max ?? 3)) return fail(`${spec.name}は これいじょう いらない`)
  let x = 0
  let z = 0
  let len = 0
  let spread = 3
  if (kind === 'fountain' && quiet) {
    // 自分たちで建てる時は むらの まん中（家のあつまり）に
    const c = this.villageCenter()
    nx = c.x
    nz = c.z
    spread = 1.6
  }
  if (kind === 'lighthouse') {
    // 水べがあれば、その岸に建てる（光が水面にうつって効果アップ）
    let pool: { x: number; z: number; r: number } | null = null
    let pd = 14
    for (const o of this.stage.obstacles) {
      if (!o.water) continue
      const d = Math.hypot(o.x - nx, o.z - nz)
      if (d < pd) {
        pd = d
        pool = o
      }
    }
    if (pool) {
      const a = Math.atan2(nz - pool.z, nx - pool.x)
      nx = pool.x + Math.cos(a) * (pool.r + 2.3)
      nz = pool.z + Math.sin(a) * (pool.r + 2.3)
      spread = 0.9
    }
  }
  if (kind === 'bridge') {
    const pools = this.stage.obstacles.filter((o) => o.water && !here.some((b) => b.kind === 'bridge' && Math.hypot(b.x - o.x, b.z - o.z) < 0.6))
    pools.sort((a, b) => Math.hypot(a.x - nx, a.z - nz) - Math.hypot(b.x - nx, b.z - nz))
    if (!pools[0]) return fail('ここには わたる みずうみが ない')
    x = pools[0].x
    z = pools[0].z
    len = pools[0].r * 2 + 1.6
  } else {
    const big = kind === 'castle'
    const foot = spec.foot ?? 1
    const edge = HALF - (big ? 3.8 : Math.max(1.4, foot + 0.9))
    let ok = false
    for (let i = 0; i < 90 && !ok; i++) {
      x = THREE.MathUtils.clamp(nx + (Math.random() * 2 - 1) * (spread + i * 0.06), -edge, edge)
      z = THREE.MathUtils.clamp(nz + (Math.random() * 2 - 1) * (spread + i * 0.06), -edge, edge)
      const clear = big ? 3.1 : Math.max(2, foot + 1)
      ok =
        !this.houses.some((h) => h.stage === this.stageIndex && Math.hypot(h.x - x, h.z - z) < clear) &&
        !here.some((b) => Math.hypot(b.x - x, b.z - z) < (big || b.kind === 'castle' ? 3.2 : Math.max(2, foot + (STRUCTS[b.kind].foot ?? 1)))) &&
        !this.stage.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + (big ? 2.0 : Math.max(1.3, foot + 0.4)))
    }
    if (!ok) return fail('ここには たてられない（ひろい所へ）')
  }
  const b: Struct = { kind, stage: this.stageIndex, x, z, rot: 0, len, mats: 0, hp: spec.hp * 0.3, mesh: null, shake: 0, q: -1, t: 0, alerted: 0 }
  this.structs.push(b)
  this.mountStruct(b)
  this.burst(x, this.stage.heightAt(x, z) + 0.5, z, 'spark', 8, 2)
  return b
}

export function mountStruct(this: World, b: Struct) {
  const spec = STRUCTS[b.kind]
  const p = Math.min(1, b.mats / spec.need)
  const ctx = {
    lam: (c: string, m?: THREE.Texture) => this.lam(c, m ? { map: m } : {}),
    basic: (c: string) => new THREE.MeshBasicMaterial({ color: c }),
    rock: this.rock(),
    bark: this.bark(),
    style: styleOf(b.stage),
  }
  const model = buildStructModel(b.kind, ctx, b.len || 3)
  b.q = p >= 1 ? 4 : Math.floor(p * 4)
  const g = new THREE.Group()
  g.add(model)
  if (p < 1) {
    // 建設中：低く育っていく + 足場（杭・横木・資材の山・旗）
    model.scale.y = 0.3 + 0.7 * p
    g.add(buildScaffold(b.kind, ctx, p, b.len || 3))
  }
  // 名前つきの部品（旗・窓・雪の屋根・えんとつ・羽根など）を集めておく：毎フレーム探さない
  const parts = new Map<string, THREE.Object3D[]>()
  g.traverse((o) => {
    if (!o.name) return
    const a = parts.get(o.name)
    if (a) a.push(o)
    else parts.set(o.name, [o])
    if (o.name === 'lit') {
      const col = ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).color
      o.userData.on = '#' + col.getHexString()
      o.userData.off = '#' + col.clone().lerp(new THREE.Color('#4a3c30'), 0.78).getHexString()
    }
  })
  g.userData.parts = parts
  g.rotation.y = b.rot
  g.userData.pop = this.time > 2 ? 0.55 : 0
  g.position.set(b.x, b.kind === 'bridge' ? 0.27 : this.stage.heightAt(b.x, b.z) - 0.02, b.z)
  this.scene.add(g)
  b.mesh = g
}

export function unmountStruct(this: World, b: Struct) {
  if (!b.mesh) return
  this.scene.remove(b.mesh)
  b.mesh.traverse((o) => {
    const m = o as THREE.Mesh
    m.geometry?.dispose()
    ;(m.material as THREE.Material | undefined)?.dispose?.()
  })
  b.mesh = null
}

export function refreshStruct(this: World, b: Struct) {
  this.unmountStruct(b)
  if (b.stage === this.stageIndex) this.mountStruct(b)
}

export function addStructMaterial(this: World, b: Struct, by: Creature) {
  const spec = STRUCTS[b.kind]
  const bonus = this.nearItem('tools', b.x, b.z, 6) ? 2 : 1
  if (this.ally(by)) this.stat('mats', bonus)
  const was = this.structDone(b)
  const m0 = b.mats
  b.mats = Math.min(spec.need, b.mats + bonus)
  b.hp = Math.min(this.structMaxHp(b), b.hp + spec.hp * 0.25)
  this.burst(b.x, this.stage.heightAt(b.x, b.z) + 0.8, b.z, 'spark', 4, 1.5)
  if (by === this.pet && !this.structDone(b))
    this.say(`${by.sp.name}は しざいを はこんだ（${spec.name} ${b.mats}/${spec.need}${b.mats - m0 > 1 ? ' どうぐで 2ばい' : ''}） まもり+1`)
  const q = this.structDone(b) ? 4 : Math.floor((b.mats / spec.need) * 4)
  if (q !== b.q) this.refreshStruct(b)
  if (this.structDone(b) && !was) this.onStructDone(b, by)
}

export function onStructDone(this: World, b: Struct, by: Creature) {
  const spec = STRUCTS[b.kind]
  b.hp = spec.hp
  this.burst(b.x, this.stage.heightAt(b.x, b.z) + 1, b.z, 'spark', 12, 2.5)
  if (b.kind === 'wall') return void this.earn(1, b.x, b.z)
  this.stat('structs')
  if (b.kind === 'castle') this.stat('castle')
  this.mark(b.x, b.z, 3)
  this.onSfx('built')
  this.earn(b.kind === 'castle' ? 40 : 10, b.x, b.z)
  if (b.kind === 'castle') {
    this.say('おしろが かんせい！ まわりに へいを たてはじめた')
    this.castleWalls(b)
    this.shake = Math.max(this.shake, 0.4)
  } else {
    this.say(`${by.sp.name}たちが ${spec.name}を かんせいさせた！`)
    const more = STRUCT_DONE[b.kind]
    if (more) this.say(more)
    const col = { fountain: '#9fe3ff', windmill: '#fff2c0', lighthouse: '#ffe27a', market: '#ffd23f', playground: '#ff9ecb', fort: '#ff9f43' }[b.kind as string] ?? '#ffe27a'
    this.ring(b.x, b.z, col, 2.6, 0.7)
    if (b.kind === 'fountain') this.colorBurst(b.x, this.stage.heightAt(b.x, b.z) + 1.4, b.z, col, 14, 3)
    if (b.kind === 'fort') this.shake = Math.max(this.shake, 0.25)
  }
}

/** おしろのまわりに へい（手前だけ門のあき）を建てはじめる */
export function castleWalls(this: World, c: Struct) {
  for (let i = 0; i < 12; i++) {
    if (i === 3) continue
    if (this.structs.filter((b) => b.stage === this.stageIndex).length >= MAX_STRUCTS) break
    const a = (i / 12) * Math.PI * 2
    const x = c.x + Math.cos(a) * 3.3
    const z = c.z + Math.sin(a) * 3.3
    if (Math.abs(x) > HALF - 0.5 || Math.abs(z) > HALF - 0.5) continue
    if (this.houses.some((h) => h.stage === this.stageIndex && Math.hypot(h.x - x, h.z - z) < 1.7)) continue
    if (this.stage.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.8)) continue
    const w: Struct = { kind: 'wall', stage: this.stageIndex, x, z, rot: -(a + Math.PI / 2), len: 0, mats: 0, hp: STRUCTS.wall.hp * 0.3, mesh: null, shake: 0, q: -1, t: 0, alerted: 0 }
    this.structs.push(w)
    this.mountStruct(w)
  }
}

/** 建物がこわされる。完成していた物も、こわれたらがれきの資材になる */
export function damageStruct(this: World, b: Struct, dmg: number, by: Creature | null) {
  if (this.nearItem('fence', b.x, b.z, 3.2)) dmg *= 0.5
  b.hp -= dmg
  b.shake = 0.3
  this.burst(b.x, this.stage.heightAt(b.x, b.z) + 0.7, b.z, 'hit', 2, 2)
  if (b.kind === 'castle' || b.kind === 'fort') this.shake = Math.max(this.shake, 0.12)
  if (by && b.kind !== 'wall' && this.time - b.alerted > 12) {
    b.alerted = this.time
    this.say(`${STRUCTS[b.kind].name}が ${by.sp.name}に おそわれている！`)
  }
  if (b.hp > 0) return
  this.unmountStruct(b)
  this.structs.splice(this.structs.indexOf(b), 1)
  for (let i = 0; i < Math.min(4, Math.ceil(b.mats / 3)); i++) this.spawnResource(b.x + (Math.random() - 0.5) * 2, b.z + 1 + Math.random(), undefined, true)
  this.burst(b.x, this.stage.heightAt(b.x, b.z) + 0.8, b.z, 'cube', 12, 3.5)
  this.shake = Math.max(this.shake, b.kind === 'castle' ? 0.7 : 0.25)
  this.ring(b.x, b.z, '#cfc7b8', b.kind === 'castle' ? 3.2 : 2, 0.6)
  if (b.kind === 'castle' || b.kind === 'tower' || b.kind === 'fort' || b.kind === 'lighthouse') this.hitStop = 0.15
  if (b.kind !== 'wall') this.say(b.kind === 'castle' ? 'おしろが おちてしまった…！' : `${STRUCTS[b.kind].name}が こわされた…`)
}

/** 敵軍が目指す建物（いちばん近い、こわせる物） */
export function marchTarget(this: World, c: Creature): { x: number; z: number; r: number; s?: Struct; h?: House } | null {
  let best: { x: number; z: number; r: number; s?: Struct; h?: House } | null = null
  let bd = 99
  for (const b of this.structs) {
    if (b.stage !== this.stageIndex || !b.mesh || (b.mats === 0 && b.kind !== 'wall')) continue
    const d = Math.hypot(b.x - c.x, b.z - c.z)
    if (d < bd) {
      bd = d
      best = { x: b.x, z: b.z, r: STRUCTS[b.kind].r || 0.7, s: b }
    }
  }
  for (const h of this.houses) {
    if (h.stage !== this.stageIndex || h.level < 1) continue
    const d = Math.hypot(h.x - c.x, h.z - c.z)
    if (d < bd) {
      bd = d
      best = { x: h.x, z: h.z, r: 0.85, h }
    }
  }
  return best
}

export function updateStructs(this: World, dt: number) {
  const lit = this.night > 0.35 || this.weather === 'rain' || this.weather === 'snow'
  const snowy = this.weather === 'snow'
  const smoky = this.night > 0.5 || this.weather === 'rain' || snowy
  const none: THREE.Object3D[] = []
  for (const b of [...this.structs]) {
    if (b.stage !== this.stageIndex || !b.mesh) continue
    b.shake = Math.max(0, b.shake - dt)
    this.popAnim(b.mesh, dt)
    const u = b.mesh.userData
    const parts = u.parts as Map<string, THREE.Object3D[]> | undefined
    const part = (n: string) => parts?.get(n) ?? none
    for (const f of part('flag')) f.rotation.y = Math.sin(this.time * 5 + f.position.x * 3 + b.x) * 0.55
    // 夜・雨・雪で窓とランプが光る / 雪の間だけ屋根に雪
    if (u.litOn !== lit) {
      u.litOn = lit
      for (const m of part('lit')) ((m as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set((lit ? m.userData.on : m.userData.off) as string)
    }
    if (u.snowOn !== snowy) {
      u.snowOn = snowy
      for (const m of part('snow')) m.visible = snowy
    }
    b.mesh.position.x = b.x + (b.shake > 0 ? Math.sin(this.time * 60) * 0.05 : 0)
    const done = this.structDone(b)
    if (done && b.hp < STRUCTS[b.kind].hp && this.nearItem('tools', b.x, b.z, 6)) b.hp = Math.min(STRUCTS[b.kind].hp, b.hp + dt * 1.5)
    if (!done) continue
    const gy = this.stage.heightAt(b.x, b.z)
    // えんとつのけむり（夜・雨・雪）
    const chims = part('chimney')
    if (smoky && chims.length) {
      u.sm = ((u.sm as number | undefined) ?? 0) - dt
      if (u.sm <= 0) {
        u.sm = 0.8 + Math.random() * 0.6
        for (const c of chims) this.smoke(b.x + c.position.x, gy + c.position.y + 0.35, b.z + c.position.z)
      }
    }
    // 毎フレームの動き
    const near = Math.hypot(b.x - this.look.x, b.z - this.look.z) < 16
    switch (b.kind) {
      case 'fountain': {
        const k = this.festival ? 1.7 : 1
        for (const j of part('jet')) {
          const s = (1 + Math.sin(this.time * 7 + j.position.x * 9 + j.position.z * 5) * 0.2) * k
          j.scale.y = s
          j.position.y = 1.28 + ((j.userData.h as number) * s) / 2
        }
        for (const c of part('curtain')) ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.42 + Math.sin(this.time * 9) * 0.08
        for (const w of part('water')) w.scale.setScalar(1 + Math.sin(this.time * 3 + w.position.y * 7) * 0.012)
        u.sp = ((u.sp as number | undefined) ?? 0) - dt
        if (u.sp <= 0 && near) {
          u.sp = this.festival ? 0.045 : 0.1
          this.spray(b.x, gy + 1.55 + 0.2 * k, b.z, styleOf(b.stage).water, k)
        }
        break
      }
      case 'windmill': {
        // 風のつよい日（雨・雪）は はやく回る
        const wind = 0.8 + (this.weather === 'rain' ? 1.4 : this.weather === 'snow' ? 0.8 : this.weather === 'cloud' ? 0.3 : 0)
        for (const bl of part('blades')) bl.rotation.z -= dt * wind
        break
      }
      case 'lighthouse': {
        const on = this.night > 0.3 || this.weather === 'rain' || this.weather === 'cloud'
        for (const bm of part('beam')) {
          bm.visible = on
          bm.rotation.y += dt * 1.5
        }
        break
      }
      case 'playground': {
        const busy = this.creatures.filter((c) => c.state === 'frolic' && c.spot === b).length
        for (const sw of part('swing')) sw.rotation.x = Math.sin(this.time * 1.8 + (sw.userData.ph as number)) * (0.18 + Math.min(1, busy / 2) * 0.45)
        break
      }
    }
    b.t += dt
    switch (b.kind) {
      case 'farm':
        if (b.t > 22 / (this.season === 'autumn' ? 1.5 : 1)) {
          b.t = 0
          if (this.foods.length < (this.season === 'autumn' ? 13 : 9)) {
            this.dropFood(b.x + (Math.random() - 0.5) * 1.2, b.z + 0.9, 1.4)
            this.burst(b.x, this.stage.heightAt(b.x, b.z) + 0.5, b.z, 'spark', 4, 1.2)
          }
        }
        break
      case 'well':
      case 'castle':
      case 'fountain':
        if (b.t > 1) {
          b.t = 0
          const range = b.kind === 'well' ? 3 : b.kind === 'fountain' ? 3.6 : 5
          let cheered = false
          for (const c of this.creatures) {
            if (c.army || c.sp.temper === 'wild' || !this.alive(c) || Math.hypot(c.x - b.x, c.z - b.z) > range) continue
            if (this.ally(c) && !c.inside) cheered = true
            if (c.hp < c.maxHp - 0.5 || c.energy < 99) {
              c.hp = Math.min(c.maxHp, c.hp + (b.kind === 'castle' ? 2 : 3))
              if (b.kind === 'well') c.energy = Math.min(100, c.energy + 3)
              if (b.kind === 'fountain') c.energy = Math.min(100, c.energy + 2)
              if (Math.random() < 0.3) this.burst(c.x, this.ground(c) + this.size(c), c.z, 'heart', 1, 0.8)
            } else if (b.kind === 'fountain' && this.ally(c) && Math.random() < 0.1) this.burst(c.x, this.ground(c) + this.size(c), c.z, 'heart', 1, 0.8)
          }
          // ふんすいのそばは きもちいい：きげんがじわじわ上がる
          if (b.kind === 'fountain' && cheered) this.stats.mood = Math.min(100, this.stats.mood + 0.7)
        }
        break
      case 'tower':
        if (b.t > 1.8) {
          const foe = this.nearest({ x: b.x, z: b.z } as Creature, (o) => o.sp.temper === 'wild' && !o.inside, 7.5)
          if (foe) {
            b.t = 0
            this.towerShot(b, foe)
          } else b.t = 1.5
        }
        break
      case 'windmill':
        // 風車のめぐみ：しばらくごとに 木か石が 1 つ うまれる
        if (b.t > 38) {
          b.t = 0
          if (this.resources.length < MAX_RES) {
            u.n = ((u.n as number | undefined) ?? 0) + 1
            const rx = b.x + (Math.random() - 0.5) * 1.8
            const rz = b.z + 1.3 + Math.random() * 0.5
            this.spawnResource(rx, rz, u.n % 2 ? 'wood' : 'stone', true)
            this.burst(rx, this.stage.heightAt(rx, rz) + 0.4, rz, 'spark', 4, 1.4)
            this.popups.push({ pos: new THREE.Vector3(rx, this.stage.heightAt(rx, rz) + 0.7, rz), text: 'しざい！', color: '#ffe9a8', t: 0 })
          }
        }
        break
      case 'playground':
        if (b.t > 1) {
          b.t = 0
          this.playgroundTick(b)
        }
        break
      case 'fort':
        if (b.t > 1) {
          b.t = 0
          // とりでの力：戦っている味方に ちいさな光
          for (const c of this.creatures) {
            if (!this.ally(c) || !this.alive(c) || Math.hypot(c.x - b.x, c.z - b.z) > FORT_RANGE) continue
            if ((c.state === 'hunt' || c.state === 'fight' || c.state === 'assist') && Math.random() < 0.35) this.colorBurst(c.x, this.ground(c) + this.size(c) + 0.15, c.z, '#ff9f43', 2, 1)
          }
        }
        break
    }
  }
}

/** あそびばの 1 秒ごと：こどもが近くにいると育ちが早まる（遊んでいる・おせわがかりがいるとさらに早い） */
export function playgroundTick(this: World, b: Struct) {
  for (const c of this.creatures) {
    if (c.grow <= 0 || c.grow >= 1 || !this.alive(c) || c.team === 'wild') continue
    const d = Math.hypot(c.x - b.x, c.z - b.z)
    if (d > 3.4) continue
    let k = 0.5
    if (c.state === 'frolic') k += 1.5
    if (this.creatures.some((o) => o.role === 'carer' && o.grow === 0 && this.alive(o) && Math.hypot(o.x - c.x, o.z - c.z) < 3.6)) k += 1
    c.grow = Math.min(1, c.grow + k / 150)
    if (Math.random() < 0.25) this.burst(c.x, this.ground(c) + this.size(c) + 0.1, c.z, 'spark', 1, 0.8)
  }
}

/** ふんすいの水しぶき */
export function spray(this: World, x: number, y: number, z: number, water: string, k = 1) {
  if (this.fx.length > 150) return
  const a = new SpriteAnim(this.orb(new THREE.Color(water).lerp(new THREE.Color('#ffffff'), 0.5).getStyle()), 0.11)
  a.sprite.center.set(0.5, 0.5)
  a.sprite.position.set(x, y, z)
  this.scene.add(a.sprite)
  const ang = Math.random() * Math.PI * 2
  const sp = 0.3 + Math.random() * 0.6
  this.fx.push({ sprite: a.sprite, vx: Math.cos(ang) * sp, vz: Math.sin(ang) * sp, vy: (1.6 + Math.random() * 1.2) * (0.8 + 0.3 * k), life: 0.9, max: 0.9, grav: 7 })
}

/** むらの まん中（家のあつまり） */
export function villageCenter(this: World) {
  const hs = this.houses.filter((h) => h.stage === this.stageIndex && h.level >= 1)
  if (!hs.length) return { x: this.pet.x, z: this.pet.z }
  return { x: hs.reduce((s, h) => s + h.x, 0) / hs.length, z: hs.reduce((s, h) => s + h.z, 0) / hs.length }
}

/** できあがった建物のうち、いちばん近い物（stage は今の箱庭） */
export function doneStruct(this: World, kind: StructKind, x = 0, z = 0): Struct | null {
  let best: Struct | null = null
  let bd = 999
  for (const b of this.structs) {
    if (b.kind !== kind || b.stage !== this.stageIndex || !this.structDone(b)) continue
    const d = Math.hypot(b.x - x, b.z - z)
    if (d < bd) {
      bd = d
      best = b
    }
  }
  return best
}

/** とうだい（水べなら効果アップ） */
export function lighthouse(this: World): { b: Struct; water: boolean } | null {
  const b = this.doneStruct('lighthouse')
  if (!b) return null
  return { b, water: this.stage.obstacles.some((o) => o.water && Math.hypot(o.x - b.x, o.z - b.z) - o.r < 4.2) }
}

/** みはりが 敵を見つける距離（とうだいの近くでは広がる） */
export function guardRange(this: World, c: Creature) {
  const lh = this.lighthouse()
  if (!lh || Math.hypot(lh.b.x - c.x, lh.b.z - c.z) > 11) return 7
  return 7 + (lh.water ? 4 : 2.5)
}

/** いしのとりでの近くの味方は こうげき UP */
export function fortBoost(this: World, c: Creature) {
  if (!this.ally(c)) return 1
  for (const b of this.structs) if (b.kind === 'fort' && b.stage === this.stageIndex && this.structDone(b) && Math.hypot(b.x - c.x, b.z - c.z) < FORT_RANGE) return 1.3
  return 1
}

export function power(this: World, c: Creature) {
  return c.atk * this.fortBoost(c)
}

/** いちばの収入（20 秒ごと）。うりこが店に立っていると増える */
export function marketIncome(this: World) {
  const mk = this.doneStruct('market')
  if (!mk || this.vLv < 1) return 0
  const sellers = this.creatures.filter((c) => c.role === 'seller' && this.alive(c) && Math.hypot(c.x - mk.x, c.z - mk.z) < 4.5).length
  this.burst(mk.x, this.stage.heightAt(mk.x, mk.z) + 1.3, mk.z, 'coin', 2, 1.6)
  return 2 + this.vLv + Math.min(2, sellers) * 2
}

/** 建った瞬間の ぽよん */
export function popAnim(this: World, m: THREE.Group, dt: number) {
  const pk = (m.userData.pop as number | undefined) ?? 0
  if (pk <= 0) return
  m.userData.pop = pk - dt
  const k = Math.max(0, pk) / 0.55
  m.scale.y = pk - dt <= 0 ? 1 : 1 + Math.sin((1 - k) * Math.PI * 2) * 0.16 * k
}

export function smoke(this: World, x: number, y: number, z: number) {
  if (this.fx.length > 120) return
  const a = new SpriteAnim(this.orb('#e6e6e6'), 0.16)
  a.sprite.center.set(0.5, 0.5)
  a.sprite.position.set(x, y, z)
  this.scene.add(a.sprite)
  this.fx.push({ sprite: a.sprite, vx: 0.12 + Math.random() * 0.1, vy: 0.45, vz: 0, life: 1.6, max: 1.6, grav: 0 })
}

export function towerShot(this: World, b: Struct, foe: Creature) {
  const top = this.stage.heightAt(b.x, b.z) + 2.3
  const ty = this.ground(foe) + this.size(foe) * 0.6
  const a = new SpriteAnim(this.orb('#ffe27a'), 0.22)
  a.sprite.center.set(0.5, 0.5)
  a.sprite.position.set(b.x, top, b.z)
  this.scene.add(a.sprite)
  const T = 0.22
  if (Math.hypot(b.x - this.look.x, b.z - this.look.z) < 12) this.onSfx('tower')
  this.fx.push({ sprite: a.sprite, vx: (foe.x - b.x) / T, vy: (ty - top) / T + 0.5 * 9 * T, vz: (foe.z - b.z) / T, life: T, max: T, grav: 9 })
  const dmg = 4 + this.structs.filter((o) => o.kind === 'castle' && o.stage === this.stageIndex && this.structDone(o)).length * 2
  this.after(T, () => {
    if (!this.alive(foe)) return
    foe.hp -= dmg
    foe.hurt = 0.28
    this.popups.push({ pos: new THREE.Vector3(foe.x, ty + 0.3, foe.z), text: `${dmg}`, color: '#ffe27a', t: 0 })
    this.burst(foe.x, ty, foe.z, 'hit', 3, 2.5)
    if (foe.hp > 0) return
    for (const o of this.creatures) if (o.foe === foe) {
      o.foe = null
      if (o.state === 'fight') this.setState(o, 'idle', 0.4)
    }
    foe.foe = null
    this.setState(foe, 'dead', 1)
    if (foe.sp.habit !== 'night' && !foe.army) this.respawn.push({ id: foe.sp.id, t: (foe.sp.habit === 'raid' ? 40 : 14) + Math.random() * 10 })
    if (BOSSES.has(foe)) this.stat('bosses')
    this.earn(6, foe.x, foe.z)
  })
}

export function calcVillage(this: World) {
  let score = this.houses.filter((h) => h.stage === this.stageIndex && h.level >= 3).length
  let castle = false
  for (const b of this.structs) {
    if (b.stage !== this.stageIndex || !this.structDone(b)) continue
    score += STRUCTS[b.kind].score
    if (b.kind === 'castle') castle = true
  }
  this.vScore = score
  this.vLv = castle && score >= 9 ? 3 : score >= 9 ? 2 : score >= 4 ? 1 : 0
}

export function villageLevel(this: World) {
  return this.vLv
}

export function villageName(this: World) {
  const base = ['ミドリ', 'スナハマ', 'サンゴ', 'ワタユキ', 'コオリ', 'ホムラ', 'イシブミ'][this.stageIndex] ?? 'ホシ'
  return base + ['', 'むら', 'まち', 'じょうかまち'][this.vLv]
}

/** 箱庭をひろげる（ステージを作り直す。家・建物・置き物・たまごはそのまま残る） */
export function expandLand(this: World, level: number) {
  const eggs = this.eggs.map((e) => ({ x: e.x, z: e.z, t: e.t, parents: e.parents, kind: e.kind, wild: e.wild, lucky: e.lucky, deco: e.deco }))
  this.land = level
  this.stat('lands')
  setLandSize(LAND_SIZES[level])
  this.flash = 1
  this.loadStage(this.stageIndex)
  for (const e of eggs) this.layEgg(e.x, e.z, e.parents, e.t, e.kind, e.wild, e.lucky, e.deco)
  this.say(`はこにわが ${LAND_SIZES[level]} に ひろがった！`)
  this.onSfx('expand')
  this.save()
}

/** おまつりを はじめる（村レベル2〜で 5〜8 分おきに自動。テストからも呼べる） */
export function startFestival(this: World) {
  if (this.festival) return
  const fo = this.doneStruct('fountain', this.pet.x, this.pet.z)
  const c0 = fo ?? this.villageCenter()
  const x = THREE.MathUtils.clamp(c0.x, -HALF + 2.5, HALF - 2.5)
  const z = THREE.MathUtils.clamp(c0.z, -HALF + 2.5, HALF - 2.5)
  const dur = 26
  this.festival = { x, z, t: dur, dur, n: 0, tick: 0, fx: 0, ring: 0, rad: fo ? 2.1 : 1.5 }
  this.mark(x, z, 4)
  this.festivalCd = 300 + Math.random() * 180
  this.say(`${this.villageName()}の おまつりが はじまった！`)
  this.say('みんなが ひろばに あつまる')
  this.onSfx('win')
  this.ring(x, z, '#ff9ecb', 4.2, 0.9)
  this.popups.push({ pos: new THREE.Vector3(x, this.stage.heightAt(x, z) + 2.3, z), text: 'おまつり！', color: '#ffd23f', t: 0, big: true })
  this.recruitDancers(this.festival)
}

/** あいている子を輪に入れる（さいしょの 14 秒は、手が空いた子もあとから参加） */
export function recruitDancers(this: World, f: Festival) {
  for (const c of this.creatures) {
    if (!this.ally(c) || !this.alive(c) || c.inside || c.army) continue
    if (c.state !== 'idle' && c.state !== 'wander' && c.state !== 'happy' && c.state !== 'play' && c.state !== 'rest' && c.state !== 'frolic') continue
    c.dAng = f.n * 2.4
    c.dR = f.rad + (f.n % 3) * 0.6
    c.cd = Math.random() * 0.3
    c.spot = null
    f.n++
    this.setState(c, 'dance', f.t + 3) // おまつりの終わりは endFestival が決める
  }
}

export function endFestival(this: World, aborted = false) {
  const f = this.festival
  if (!f) return
  this.festival = null
  const dancers = this.creatures.filter((c) => c.state === 'dance')
  for (const c of dancers) {
    if (!aborted) {
      this.addCare(c, 'spirit', 1)
      this.gainXp(c, 3)
      this.burst(c.x, this.ground(c) + this.size(c) + 0.2, c.z, 'heart', 2, 1.2)
    }
    this.setState(c, 'happy', 1.4)
  }
  if (aborted) return void this.say('おまつりは ちゅうだん…')
  const n = dancers.length
  if (!n) return void this.say('おまつりは おわった')
  const reward = 20 + n * 6
  this.earn(reward, f.x, f.z)
  this.ring(f.x, f.z, '#ffd23f', 4.5, 0.9)
  this.colorBurst(f.x, this.stage.heightAt(f.x, f.z) + 2, f.z, '#ff7eb6', 16, 4)
  this.say(`おまつりが おわった！ コイン+${reward}`)
}

export function updateFestival(this: World, dt: number) {
  const f = this.festival
  if (!f) {
    this.festivalCd -= dt
    if (this.festivalCd > 0) return
    // 村レベル2以上・敵軍がいない・ペットが元気・荒れた天気や真夜中でない時だけ
    if (this.vLv < 2 || this.army || !this.alive(this.pet) || this.pet.state === 'fight' || this.retiring || this.warp > 0 || this.weather === 'rain' || this.weather === 'ember' || this.night > 0.6) {
      this.festivalCd = 20
      return
    }
    this.startFestival()
    return
  }
  f.t -= dt
  const gy = this.stage.heightAt(f.x, f.z)
  f.fx -= dt
  if (f.fx <= 0) {
    f.fx = 0.12
    this.confetti(f.x, f.z, gy)
  }
  // 火の粉（ふんすいのまわりから ぱちぱち）
  f.ring -= dt
  if (f.ring <= 0) {
    f.ring = 2.6
    this.ring(f.x, f.z, '#ff9ecb', 3.4, 0.8)
  }
  f.tick -= dt
  if (f.tick <= 0) {
    f.tick = 1
    if (f.t > f.dur - 14) this.recruitDancers(f)
    this.stats.mood = Math.min(100, this.stats.mood + 1.2)
    const a = Math.random() * Math.PI * 2
    this.colorBurst(f.x + Math.cos(a) * f.rad, gy + 0.3, f.z + Math.sin(a) * f.rad, '#ff9f43', 3, 2.6)
  }
  if (f.t <= 0) this.endFestival()
}

/** 紙ふぶき */
export function confetti(this: World, cx: number, cz: number, gy: number) {
  const cols = ['#ff7eb6', '#ffd23f', '#7cf29b', '#6fd6ff', '#c9a8ff']
  for (let i = 0; i < 2; i++) {
    if (this.fx.length > 160) return
    const a = new SpriteAnim(this.orb(cols[Math.floor(Math.random() * cols.length)]), 0.1 + Math.random() * 0.05)
    a.sprite.center.set(0.5, 0.5)
    a.sprite.position.set(cx + (Math.random() - 0.5) * 5.5, gy + 3.4 + Math.random() * 0.8, cz + (Math.random() - 0.5) * 5.5)
    this.scene.add(a.sprite)
    this.fx.push({ sprite: a.sprite, vx: (Math.random() - 0.5) * 0.6, vy: -(0.5 + Math.random() * 0.5), vz: (Math.random() - 0.5) * 0.6, life: 3.6, max: 3.6, grav: 0 })
  }
}

export function updateMarket(this: World, dt: number) {
  const mk = this.doneStruct('market')
  const p = this.peddler
  if (!p) {
    if (!mk || !mk.mesh || this.vLv < 1 || this.army) return
    this.peddlerCd -= dt
    if (this.peddlerCd > 0) return
    this.peddlerCd = 150 + Math.random() * 90
    const side = mk.x > 0 ? -1 : 1
    const sx = side * (HALF - 0.6)
    const sz = THREE.MathUtils.clamp(mk.z + 1.9, -HALF + 0.6, HALF - 0.6)
    const g = this.makeCrab()
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat)
    shadow.scale.setScalar(0.5)
    this.scene.add(g, shadow)
    this.peddler = { g, shadow, x: sx, z: sz, ex: sx, phase: 'in', t: 0, mk, given: false }
    this.say('やどかりの ぎょうしょうにんが きた！')
    return
  }
  // 店がなくなったら帰る
  if (!this.structs.includes(p.mk) || !this.structDone(p.mk) || p.mk.stage !== this.stageIndex || this.army) p.phase = 'out'
  p.t += dt
  const tx = p.phase === 'out' ? p.ex : p.mk.x
  const tz = p.phase === 'out' ? p.z : p.mk.z + 1.9
  let moving = false
  if (p.phase === 'sell') {
    if (!p.given && p.t > 2.2) {
      p.given = true
      this.peddlerGift(p)
    }
    if (p.t > 13) {
      p.phase = 'out'
      p.t = 0
    }
  } else {
    const dx = tx - p.x
    const dz = tz - p.z
    const d = Math.hypot(dx, dz)
    if (d < 0.15) {
      if (p.phase === 'in') {
        p.phase = 'sell'
        p.t = 0
        this.popups.push({ pos: new THREE.Vector3(p.x, this.stage.heightAt(p.x, p.z) + 0.9, p.z), text: 'いらっしゃい！', color: '#ffe9a8', t: 0 })
      } else {
        this.clearPeddler()
        return
      }
    } else {
      const sp = 1.5 * dt
      p.x += (dx / d) * Math.min(d, sp)
      p.z += (dz / d) * Math.min(d, sp)
      p.g.rotation.y = Math.atan2(-dz, dx)
      moving = true
    }
  }
  if (p.phase === 'sell') p.g.rotation.y = Math.atan2(1, 0) // 店のほう（北）をむく
  const gy = this.stage.heightAt(p.x, p.z)
  const hop = moving ? Math.abs(Math.sin(this.time * 11)) * 0.05 : p.phase === 'sell' ? Math.max(0, Math.sin(this.time * 6)) * 0.04 : 0
  p.g.position.set(p.x, gy + hop, p.z)
  p.g.rotation.z = moving ? Math.sin(this.time * 11) * 0.08 : 0
  p.shadow.position.set(p.x, gy + 0.03, p.z)
}

export function peddlerGift(this: World, p: Peddler) {
  const x = p.mk.x
  const z = p.mk.z + 2.5
  this.onSfx('egg')
  this.burst(p.x, this.stage.heightAt(p.x, p.z) + 0.5, p.z, 'spark', 8, 2)
  if (this.eggs.length < 3 && Math.random() < 0.4) {
    this.layEgg(x + 0.5, z, [], 50, this.stageEggKind())
    this.say('やどかりが めずらしい たまごを おいていった！')
  } else {
    const foods: Exclude<FoodKind, 'stage'>[] = ['meat', 'sweet', 'nut']
    const a = foods.splice(Math.floor(Math.random() * foods.length), 1)[0]
    const b = foods[Math.floor(Math.random() * foods.length)]
    this.dropFood(x - 0.6, z, 2.2, a)
    this.dropFood(x + 0.7, z, 2.2, b)
    this.say('やどかりが とくべつな ごはんを おいていった')
  }
}

/** やどかり（小さな行商）。貝がらを背おった かに */
export function makeCrab(this: World) {
  const st = styleOf(this.stageIndex)
  const g = new THREE.Group()
  const body = this.lam('#e8794a')
  const dark = this.lam('#3d2a1e')
  const add = (m: THREE.Mesh, x: number, y: number, z: number) => {
    m.position.set(x, y, z)
    g.add(m)
    return m
  }
  add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.24), body), 0, 0.14, 0)
  const shell = add(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 6), this.lam(st.roof)), -0.05, 0.4, 0)
  shell.rotation.z = 0.2
  add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 5, 4), this.lam('#e8d9a8')), -0.06, 0.66, 0)
  for (const z of [-0.07, 0.07]) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 4), dark), 0.17, 0.27, z)
    add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' })), 0.17, 0.35, z)
  }
  for (const z of [-0.17, 0.17]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.07), body), 0.22, 0.17, z)
    for (const x of [-0.1, 0.02, 0.12]) add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.03), dark), x, 0.05, z * 0.8)
  }
  g.scale.setScalar(1.25)
  return g
}

export function clearPeddler(this: World) {
  const p = this.peddler
  if (!p) return
  this.scene.remove(p.g, p.shadow)
  p.g.traverse((o) => {
    const m = o as THREE.Mesh
    m.geometry?.dispose()
    ;(m.material as THREE.Material | undefined)?.dispose?.()
  })
  this.peddler = null
}

export function playgroundFor(this: World, c: Creature): Struct | null {
  const b = this.doneStruct('playground', c.x, c.z)
  return b && Math.hypot(b.x - c.x, b.z - c.z) < 14 ? b : null
}

/** あそびばの上の「あそぶ場所」（ブランコの前・すべりだいの下・砂場） */
export function frolicSlot(this: World, b: Struct) {
  const slots = [[-0.5, 0.75], [0.7, 1.15], [0.05, 0.95], [-1.0, 0.2], [1.15, 0.1], [-0.25, 1.2]]
  const s = slots[Math.floor(Math.random() * slots.length)]
  return { x: b.x + s[0] + (Math.random() - 0.5) * 0.2, z: b.z + s[1] + (Math.random() - 0.5) * 0.2 }
}
