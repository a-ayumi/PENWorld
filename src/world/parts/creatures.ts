/** World.ts から分けた「creatures」のメソッド。this は World（World.ts のクラスのつなぎの行から呼ばれる） */
import * as THREE from 'three'
import { SpriteAnim, iconSheet } from '../sprites'
import { MonsterModel, hasModel } from '../models'
import { BABY, FAMILY_NAME, SPECIES, STAGE_EGGS, SpriteMonster, XP_NEED, familyOf, newSeed, nextForm, variantOf, type Care, type EggKind, type MonsterView, type Species, type SpeciesId } from '../monsters'
import { HALF } from '../stages'
import { isSecretId } from '../secrets'
import { STRUCTS, type StructKind } from '../structures'
import { ITEM_SPEC, type ItemKind } from '../items'
import { SEASON_INFO, type Season } from '../../missions'
import type { World } from '../World'
import { Team, State, Creature, Evo, Skill, SKILLS, Struct, Role, ROLE_NAME, LIFESPAN, newLife, Item, DECO_SHEET, houseMaxHp, MAX_FRIENDS, BOSSES, RARE_RATE, RARE_RATE_LUCKY } from '../World'

export function spawn(this: World, id: SpeciesId, team: Team, x: number, z: number, grow = 0, look?: { seed: number; rare: boolean }): Creature {
  const sp = SPECIES[id]
  // 個体差：もようと色のゆらぎのシード。なかまになれる種族は約 3% で色ちがい（ボスは いつもの姿）
  const seed = sp.boss ? 0 : look?.seed ?? newSeed()
  const rare = sp.tier > 0 && (look ? look.rare : Math.random() < RARE_RATE)
  const anim = this.makeView(id, sp.height, variantOf(seed, rare))
  const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat)
  this.scene.add(anim.sprite, shadow)
  const c: Creature = {
    sp, team, anim, shadow, x, z, jy: 0, vy: 0, kx: 0, kz: 0,
    hp: sp.hp, maxHp: sp.hp, atk: sp.atk, hunger: 60 + Math.random() * 40, energy: 60 + Math.random() * 40,
    state: 'idle', t: Math.random() * 2, tx: x, tz: z, foe: null, food: null, cd: 0, lunge: 0, hurt: 0, fx: 0,
    phase: Math.random() * 10, affinity: 0, grow,
    xp: 0, care: { power: 0, guard: 0, spirit: 0 }, bias: (['power', 'guard', 'spirit'] as Care[])[Math.floor(Math.random() * 3)],
    spar: false, carry: null, carryMesh: null, res: null, raid: null, inside: false,
    skillCd: 3 + Math.random() * 5, cheer: false, sleepFrom: null, site: null, army: false, squash: 0, pj: 0, finish: null, role: 'free', tendTo: null, spot: null, dAng: 0, dR: 2, lx: x, lz: z, mvT: 0, stuck: 0, detourN: 0, detour: null, avoid: Math.random() < 0.5 ? 1 : -1,
    seed, rare, evo: null, glint: 1 + Math.random() * 2,
    age: 0, life: sp.temper === 'wild' || team === 'pet' ? 0 : newLife(),
  }
  this.creatures.push(c)
  this.burst(x, this.ground(c) + 0.5, z, 'cube', 8, 2)
  return c
}

export function makeView(this: World, id: SpeciesId, h: number, variant = 0): MonsterView {
  return this.style === 'model' && hasModel(id) ? new MonsterModel(id, h) : new SpriteMonster(id, h, variant)
}

/** スプライトの種類（もよう 0〜7 + 色ちがい 8） */
export function variant(this: World, c: Creature) {
  return variantOf(c.seed, c.rare)
}

/** なまえ（色ちがいは ★ がつく） */
export function nm(this: World, c: Creature) {
  return (c.rare ? '★' : '') + c.sp.name
}

export function setStyle(this: World, style: 'sprite' | 'model') {
  if (style === this.style) return
  this.style = style
  for (const c of this.creatures) {
    if (c.evo) {
      if (!c.evo.said) this.evolved(c, SPECIES[c.evo.from].name)
      c.evo = null
    }
    const old = c.anim
    this.scene.remove(old.sprite)
    old.dispose()
    c.anim = this.makeView(c.sp.id, this.size(c), this.variant(c))
    c.anim.facing = old.facing
    c.anim.sprite.visible = old.sprite.visible
    this.scene.add(c.anim.sprite)
  }
}

export function remove(this: World, c: Creature) {
  this.dropCarry(c, false)
  for (const h of this.houses) if (h.owner === c) h.owner = null
  this.scene.remove(c.anim.sprite, c.shadow)
  c.anim.dispose()
}

export function alive(this: World, c: Creature | null): c is Creature {
  return !!c && c.state !== 'dead' && c.state !== 'faint' && this.creatures.includes(c)
}

export function ally(this: World, c: Creature) {
  return c.team === 'pet' || c.team === 'friend'
}

export function size(this: World, c: Creature) {
  return c.sp.height * (c.grow > 0 ? 0.55 + 0.45 * c.grow : 1) * (c.boss ? 1.7 : 1)
}

export function ground(this: World, c: Creature) {
  return this.stage.heightAt(c.x, c.z) + (c.sp.float ? 0.35 + Math.sin(this.time * 2 + c.phase) * 0.12 : 0)
}

/**
 * 目的地へ歩く。木・岩・さく・かべ・建物をよけながら進み、ひっかかったら回りこむ。
 * 戻り値 = 目的地までの距離。hold = 目的地のすぐそばで立ち止まっている（ひっかかり判定をしない）
 */
export function moveTo(this: World, c: Creature, tx: number, tz: number, speed: number, dt: number, hold = false) {
  const dReal = Math.hypot(tx - c.x, tz - c.z)
  if (dReal < 0.05) {
    c.stuck = 0
    c.detour = null
    return dReal
  }
  // ひっかかり検知：0.5 秒ごとに進んだ距離を見て、ほとんど動けていなければ回りこむ・あきらめる
  c.mvT += dt
  if (hold) {
    c.stuck = 0
    c.mvT = 0
  } else if (c.mvT > 0.5) {
    const moved = Math.hypot(c.x - c.lx, c.z - c.lz)
    c.lx = c.x
    c.lz = c.z
    c.mvT = 0
    if (moved < speed * 0.5 * 0.3) c.stuck++
    else {
      c.stuck = 0
      if (c.detour && c.detour.t <= 0) c.detour = null
    }
    if (c.stuck >= 2 && !c.detour) {
      // 進行方向に対して横へ回りこむ。うまくいかないたびに、遠くまで回る（長いかべ・さくの輪の外へ出る）
      c.detourN++
      const dist = Math.min(11, 2.2 + c.detourN * 2.6)
      const ux = (tx - c.x) / dReal
      const uz = (tz - c.z) / dReal
      const obs = this.obstacles()
      for (const sd of [c.avoid, -c.avoid]) {
        const wx = THREE.MathUtils.clamp(c.x - uz * sd * dist + ux * 0.8, -HALF, HALF)
        const wz = THREE.MathUtils.clamp(c.z + ux * sd * dist + uz * 0.8, -HALF, HALF)
        if (!obs.some((o) => Math.hypot(o.x - wx, o.z - wz) < o.r + 0.5)) {
          c.detour = { x: wx, z: wz, t: dist / Math.max(0.5, speed) * 1.4 + 0.8 }
          c.avoid = sd as 1 | -1
          break
        }
      }
      if (!c.detour) c.avoid = (c.avoid * -1) as 1 | -1
      if (c.detourN === 3) c.avoid = (c.avoid * -1) as 1 | -1
      c.stuck = 0
    } else if (c.detourN >= 5 && c.stuck >= 2) {
      // 何度回りこんでも進めない：その作業はあきらめる
      c.stuck = 0
      c.detour = null
      this.dropCarry(c, true)
      if (c.res) c.res.taken = null
      c.res = null
      c.site = null
      c.tendTo = null
      c.raid = null
      this.setState(c, 'idle', 0.4)
      return 99
    }
  }
  if (c.detour) {
    c.detour.t -= dt
    if (c.detour.t <= 0 || Math.hypot(c.detour.x - c.x, c.detour.z - c.z) < 0.4) c.detour = null
  }
  const gx = c.detour ? c.detour.x : tx
  const gz = c.detour ? c.detour.z : tz
  const dx = gx - c.x
  const dz = gz - c.z
  const d = Math.hypot(dx, dz) || 1
  // 坂道を登るときは少し遅くなる
  const slope = this.stage.heightAt(c.x + (dx / d) * 0.3, c.z + (dz / d) * 0.3) - this.stage.heightAt(c.x, c.z)
  const step = Math.min(d, speed * dt * (slope > 0 ? Math.max(0.55, 1 - slope * 1.5) : 1))
  // 進む先にある物を、横へそれてよける（まっすぐ当たる時は、その子がいつも使う側へ）
  const bx = dx / d
  const bz = dz / d
  let ux = bx
  let uz = bz
  for (const o of this.obstacles()) {
    if (o.water && c.sp.float) continue
    const vx = o.x - c.x
    const vz = o.z - c.z
    const ahead = vx * bx + vz * bz
    if (ahead <= -0.2 || ahead > 2.4 || ahead > d + o.r) continue
    const cross = bx * vz - bz * vx // 物が進行方向の左(+)か右(-)か
    const side = Math.abs(cross)
    const clear = o.r + 0.75
    if (side < clear) {
      // 物がある側と反対へ、進行方向に直角に曲がる
      const dir = side > 0.08 ? (cross > 0 ? -1 : 1) : c.avoid
      const k = (1 - side / clear) * 2.6 * (ahead > 0 ? 1 : 0.4)
      ux += -bz * dir * k
      uz += bx * dir * k
    }
  }
  const ul = Math.hypot(ux, uz) || 1
  c.x += (ux / ul) * step
  c.z += (uz / ul) * step
  if (Math.abs(ux) > 0.05) c.anim.facing = ux > 0 ? 1 : -1
  return dReal
}

export function obstacles(this: World) {
  const key = `${this.obsFrame}|${this.stageIndex}|${this.items.length}|${this.houses.length}|${this.structs.length}|${this.stage.obstacles.length}`
  if (key === this.obsKey && this.obsTick === this.obsFrame) return this.obsCache
  this.obsKey = key
  this.obsTick = this.obsFrame
  const extra = this.items
    .filter((it) => it.stage === this.stageIndex && ITEM_SPEC[it.kind].r > 0 && (it.kind !== 'sapling' || it.grow >= 1))
    .map((it) => ({ x: it.x, z: it.z, r: ITEM_SPEC[it.kind].r, water: false }))
  const homes = this.houses.filter((h) => h.stage === this.stageIndex && h.level >= 1).map((h) => ({ x: h.x, z: h.z, r: 0.85, water: false }))
  const bridged = (o: { x: number; z: number; water?: boolean }) =>
    !!o.water && this.structs.some((b) => b.kind === 'bridge' && b.stage === this.stageIndex && b.mats >= STRUCTS.bridge.need && Math.hypot(b.x - o.x, b.z - o.z) < 0.6)
  const land = this.stage.obstacles.filter((o) => !bridged(o))
  const builds = this.structs.filter((b) => b.stage === this.stageIndex && STRUCTS[b.kind].r > 0 && b.mesh).map((b) => ({ x: b.x, z: b.z, r: STRUCTS[b.kind].r, water: false }))
  this.obsCache = [...land, ...extra, ...homes, ...builds]
  return this.obsCache
}

export function collide(this: World, c: Creature) {
  for (const o of this.obstacles()) {
    if (o.water && c.sp.float) continue
    const dx = c.x - o.x
    const dz = c.z - o.z
    const min = o.r + 0.3
    const d = Math.hypot(dx, dz)
    if (d < min && d > 0) {
      c.x = o.x + (dx / d) * min
      c.z = o.z + (dz / d) * min
    }
  }
  for (const o of this.creatures) {
    if (o === c || o.state === 'dead') continue
    const dx = c.x - o.x
    const dz = c.z - o.z
    const d = Math.hypot(dx, dz)
    const min = c.state === 'fight' && o === c.foe ? 0.55 : 0.7
    if (d < min && d > 0) {
      c.x += (dx / d) * (min - d) * 0.5
      c.z += (dz / d) * (min - d) * 0.5
    }
  }
  c.x = THREE.MathUtils.clamp(c.x, -HALF, HALF)
  c.z = THREE.MathUtils.clamp(c.z, -HALF, HALF)
}

export function setState(this: World, c: Creature, s: State, t = 0) {
  if (s === 'sleep' && c.state !== 'sleep') c.sleepFrom = { e: c.energy, h: c.hp }
  c.state = s
  c.t = t
  c.detourN = 0
  c.stuck = 0
}

export function item(this: World, kind: ItemKind) {
  return this.items.find((it) => it.kind === kind && it.stage === this.stageIndex && it.mesh)
}

export function hasItem(this: World, kind: ItemKind) {
  return this.items.some((it) => it.kind === kind && it.stage === this.stageIndex)
}

/** 何をするか決める（お腹・眠気・性格・まわりの状況・置き物から） */
export function think(this: World, c: Creature) {
  const wild = c.sp.temper === 'wild'
  const p = this.pet
  // 敵軍：近くの味方がいれば戦い、いなければ建物を目指して進む
  if (c.army) {
    const prey = this.nearest(c, (o) => this.ally(o) || o.sp.temper === 'calm', 3.2)
    if (prey) {
      c.foe = prey
      return this.setState(c, 'hunt', 6)
    }
    return this.setState(c, 'march', 8)
  }
  // 敵軍が攻めてきたら、ペットと仲間は迎えうつ
  if (this.army?.phase === 'on' && !wild && c.team !== 'wild' && c.grow === 0 && c.hp > c.maxHp * 0.4 && c.energy > 15) {
    const foe = this.nearest(c, (o) => o.army, 10)
    if (foe) {
      c.foe = foe
      return this.setState(c, 'hunt', 8)
    }
  }
  // 家をこわしたがる敵（ゴウガン）・ひのこの日の敵は家をねらう
  if (wild && c.energy > 25 && this.peaceT <= 0 && !this.calm && (c.sp.habit === 'raid' || (this.weather === 'ember' && Math.random() < 0.3) || Math.random() < 0.08)) {
    const h = this.nearestHouse(c, (h) => h.level >= 1, c.sp.habit === 'raid' ? 14 : 7)
    if (h) {
      c.raid = h
      return this.setState(c, 'raid', 16)
    }
  }
  if (wild && c.energy > 25 && this.peaceT <= 0 && !this.calm) {
    const range = this.hasItem('charm') ? 2.2 : 4.5
    // 赤ちゃん（1 だんめ）・こどもは、すぐそばに来た時だけ ねらう
    const prey = this.nearest(c, (o) => (this.ally(o) || o.sp.temper === 'calm') && (o.sp.tier >= 2 && o.grow === 0 || Math.hypot(o.x - c.x, o.z - c.z) < 1.8), range)
    if (prey) {
      c.foe = prey
      return this.setState(c, 'hunt', 6)
    }
  }
  // 仲間：ペットが戦っていたら助けに行く
  if (c.team === 'friend' && c.grow === 0 && p.state === 'fight' && this.alive(p.foe) && Math.hypot(p.x - c.x, p.z - c.z) < 7) {
    c.foe = p.foe
    return this.setState(c, 'assist', 8)
  }
  // ペットから けんかを しかけるのは 2 だんめ（成長期）から
  if (c.team === 'pet' && !this.calm && c.sp.tier >= 2 && c.hp > c.maxHp * 0.5 && c.energy > 30) {
    const enemy = this.nearest(c, (o) => o.sp.temper === 'wild', 3)
    if (enemy) {
      c.foe = enemy
      return this.setState(c, 'hunt', 6)
    }
  }
  // みはり：持ち場の近くの敵は、すこし遠くからでも見つけて追いはらう
  if (c.role === 'guard' && !this.calm && c.hp > c.maxHp * 0.4 && c.energy > 20) {
    const foe = this.nearest(c, (o) => o.sp.temper === 'wild' && !o.inside, this.guardRange(c))
    if (foe) {
      c.foe = foe
      return this.setState(c, 'hunt', 8)
    }
  }
  // 雨・ひのこ・夜は自分の家に入って休む
  const home = this.homeOf(c)
  if (!wild && home && home.level >= 2 && (this.weather === 'rain' || this.weather === 'ember' || this.night > 0.5) && Math.random() < 0.7) {
    c.tx = home.x
    c.tz = home.z + 0.95
    c.inside = true
    return this.setState(c, 'rest', 10)
  }
  // じゃれあいバトル：おとなしい子どうしも、ときどき勝手に力くらべをする
  if (!wild && c.grow === 0 && c.energy > 55 && c.hp > c.maxHp * 0.7 && Math.random() < (c.team === 'pet' ? 0.03 : 0.08)) {
    const rival = this.nearest(
      c,
      (o) => o.sp.temper === 'calm' && o.grow === 0 && o.hp > o.maxHp * 0.6 && o.state !== 'fight' && o.state !== 'sleep' && !o.inside,
      3.5,
    )
    if (rival) {
      c.foe = rival
      c.spar = true
      return this.setState(c, 'hunt', 6)
    }
  }
  if (c.hunger < 45 && !wild) {
    const f = this.foods
      .filter((f) => f.landed && !f.taken)
      .sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0]
    if (f) {
      f.taken = c
      c.food = f
      return this.setState(c, 'seek', 10)
    }
  }
  if (c.energy < 20 || (this.night > 0.5 && Math.random() < 0.5)) {
    // たき火があればそのそばで眠る
    const fire = this.item('fire')
    if (fire && !wild) {
      const a = Math.random() * Math.PI * 2
      c.tx = fire.x + Math.cos(a) * (0.9 + Math.random() * 0.6)
      c.tz = fire.z + Math.sin(a) * (0.9 + Math.random() * 0.6)
      return this.setState(c, 'rest', 8)
    }
    // ベンチがあればそこで休む（げんきが はやく もどる）
    const bench = wild ? null : this.nearestItem('bench', c.x, c.z, 14)
    if (bench) return this.restAtBench(c, bench)
    return this.setState(c, 'sleep', 6 + Math.random() * 6)
  }
  // すこし疲れたら、ベンチで ひと休み
  if (!wild && c.energy < 45 && Math.random() < 0.35) {
    const bench = this.nearestItem('bench', c.x, c.z, 10)
    if (bench) return this.restAtBench(c, bench)
  }
  // おもちゃ（ボール・すべりだい・ぬいぐるみ）で遊ぶ
  const toy = wild ? null : this.playToy(c)
  if (toy && c.energy > 40 && Math.random() < toy.p) {
    this.playAt.set(c, toy.it)
    this.rideT.delete(c)
    return this.setState(c, 'play', toy.it.kind === 'slide' ? 9 : 6)
  }
  // あそびば：こどもはよく遊ぶ。おとなもときどき（おせわがかりは こどもの そばで）
  if (!wild && c.team !== 'wild' && c.energy > 35 && c.hunger > 35) {
    const pg = this.playgroundFor(c)
    if (pg && Math.random() < (c.grow > 0 ? 0.5 : c.role === 'carer' ? 0.55 : 0.12)) {
      const q = this.frolicSlot(pg)
      c.spot = pg
      c.tx = q.x
      c.tz = q.z
      return this.setState(c, 'frolic', 7 + Math.random() * 4)
    }
  }
  // よるは ランタンのまわりに あつまる
  if (!wild && this.night > 0.5 && Math.random() < 0.4) {
    const lamp = this.nearestItem('lantern', c.x, c.z, 14)
    if (lamp) {
      const a = Math.random() * Math.PI * 2
      c.tx = lamp.x + Math.cos(a) * (0.8 + Math.random() * 0.9)
      c.tz = lamp.z + Math.sin(a) * (0.8 + Math.random() * 0.9)
      return this.setState(c, 'wander', 5)
    }
  }
  // はたけがかり：はたけの世話をして、みのりを早める
  if (c.role === 'farmer' && c.energy > 25 && Math.random() < 0.5) {
    const farm = this.structs.find((b) => b.stage === this.stageIndex && b.kind === 'farm' && this.structDone(b))
    if (farm) {
      c.tendTo = farm
      return this.setState(c, 'tend', 12)
    }
  }
  // 家づくり：資材を集めて自分の家を建てる・直す
  if (!wild && c.grow === 0 && c.energy > 30 && Math.random() < (c.role === 'builder' ? 0.95 : c.role === 'free' ? 0.85 : 0.5)) {
    let h = home
    if (!h) h = this.claimHouse(c)
    const site = this.openSite(c)
    const wantHouse = !!h && (h.level < 4 || h.hp < houseMaxHp(h.level))
    if (site || wantHouse) {
      const r = this.resources
        .filter((r) => !r.taken)
        .sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0]
      if (r && Math.hypot(r.x - c.x, r.z - c.z) < 14) {
        r.taken = c
        c.res = r
        c.site = site && (!wantHouse || c.role === 'builder' || Math.random() < 0.7) ? site : null
        return this.setState(c, 'gather', 14)
      }
    }
  }
  // いたずら：ちからの強い野生の子は、ほかの子の家を少しこわすことがある
  if (wild === false && c.team === 'wild' && c.care.power > c.care.guard + 2 && Math.random() < 0.04) {
    const h = this.nearestHouse(c, (h) => h.level >= 1 && h.owner !== c, 6)
    if (h) {
      c.raid = h
      return this.setState(c, 'raid', 6)
    }
  }
  // あいさつ：近くの子どうしが、ときどき ぴょんと挨拶する
  if (!wild && c.grow === 0 && Math.random() < 0.1) {
    const b = this.nearest(c, (o) => !o.army && o.grow === 0 && o.sp.temper === 'calm' && (o.state === 'idle' || o.state === 'wander') && (o.team === 'wild') === (c.team === 'wild'), 2)
    if (b) {
      c.anim.facing = b.x > c.x ? 1 : -1
      b.anim.facing = c.x > b.x ? 1 : -1
      this.burst((c.x + b.x) / 2, this.ground(c) + this.size(c) + 0.2, (c.z + b.z) / 2, 'heart', 2, 1)
      this.popups.push({ pos: new THREE.Vector3(c.x, this.ground(c) + this.size(c) + 0.3, c.z), text: 'やあ！', color: '#ffd0e6', t: 0 })
      this.setState(c, 'happy', 1.1)
      this.setState(b, 'happy', 1.1)
      return
    }
  }
  if (c.energy < 28 && c.state !== 'sleep' && Math.random() < 0.25)
    this.popups.push({ pos: new THREE.Vector3(c.x, this.ground(c) + this.size(c) + 0.3, c.z), text: 'ふぁ…', color: '#9fd8ff', t: 0 })
  // みはり：みはりとう・おしろのそばで見まわる
  if (c.role === 'guard' && Math.random() < 0.7) {
    const post = this.guardPost(c)
    if (post) {
      if (Math.hypot(post.x - c.x, post.z - c.z) > 2.4) {
        c.tx = post.x + (Math.random() - 0.5) * 1.6
        c.tz = post.z + 1.5 + Math.random()
        return this.setState(c, 'wander', 4)
      }
      c.anim.facing = Math.random() < 0.5 ? 1 : -1
      return this.setState(c, 'idle', 3 + Math.random() * 3)
    }
  }
  // うりこ：いちばの店先に立つ
  if (c.role === 'seller' && Math.random() < 0.7) {
    const mk = this.doneStruct('market', c.x, c.z)
    if (mk) {
      if (Math.hypot(mk.x - c.x, mk.z - c.z) > 2.6) {
        c.tx = mk.x + (Math.random() - 0.5) * 1.6
        c.tz = mk.z + 1.5 + Math.random() * 0.6
        return this.setState(c, 'wander', 4)
      }
      c.anim.facing = Math.random() < 0.5 ? 1 : -1
      if (Math.random() < 0.25) this.popups.push({ pos: new THREE.Vector3(c.x, this.ground(c) + this.size(c) + 0.3, c.z), text: 'いらっしゃい！', color: '#ffe9a8', t: 0 })
      return this.setState(c, Math.random() < 0.3 ? 'happy' : 'idle', 2 + Math.random() * 3)
    }
  }
  // 仲間はペットのそばを離れすぎない
  if (c.team === 'friend' && Math.hypot(p.x - c.x, p.z - c.z) > 3.5) {
    c.tx = p.x + (Math.random() - 0.5) * 2.5
    c.tz = p.z + (Math.random() - 0.5) * 2.5
    return this.setState(c, 'wander', 3)
  }
  const r = Math.random()
  if (r < 0.6) {
    const q = this.freePos(0, c.x, c.z, 4)
    c.tx = q.x
    c.tz = q.z
    this.setState(c, 'wander', 2 + Math.random() * 3)
  } else if (r < 0.9) this.setState(c, 'idle', 1 + Math.random() * 2.5)
  else this.setState(c, 'happy', 1.2)
}

/** ベンチのまえで ひと休み（着いたら 眠る。ベンチの近くだと回復が はやい） */
export function restAtBench(this: World, c: Creature, bench: Item) {
  const p = this.itemLocal(bench, (Math.random() - 0.5) * 0.9, 0.78)
  c.tx = p.x
  c.tz = p.z
  c.inside = false
  return this.setState(c, 'rest', 8)
}

export function nearest(this: World, c: Creature, pred: (o: Creature) => boolean, range: number) {
  let best: Creature | null = null
  let bd = range
  for (const o of this.creatures) {
    if (o === c || !this.alive(o)) continue
    const dx = o.x - c.x
    const dz = o.z - c.z
    const d2 = dx * dx + dz * dz
    if (d2 >= bd * bd || !pred(o)) continue // 遠い子は条件の関数を呼ぶ前に外す
    bd = Math.sqrt(d2)
    best = o
  }
  return best
}

export function startFight(this: World, a: Creature, b: Creature) {
  const spar = a.spar && a.sp.temper === 'calm' && b.sp.temper === 'calm'
  a.spar = b.spar = spar
  a.foe = b
  b.foe = a
  for (const c of [a, b]) {
    this.dropCarry(c, true)
    c.raid = null
    if (c.res) c.res.taken = null
    c.res = null
  }
  this.setState(a, 'fight')
  this.setState(b, 'fight')
  a.cd = 0.4
  b.cd = 0.9
  if (spar && !this.sparBook.some((m) => (m.a === a && m.b === b) || (m.a === b && m.b === a))) {
    const id = ++this.sparSeq
    this.sparBook = [...this.sparBook.slice(-5), { id, a, b }]
    this.onSparStart({ id, a: this.sparSide(a), b: this.sparSide(b) })
  }
  if (a.team === 'pet' || b.team === 'pet') {
    const other = a.team === 'pet' ? b : a
    this.say(spar ? `${other.sp.name}と じゃれあいバトル！` : `${other.sp.name}と バトル！`)
    this.onSfx('ok')
  }
  for (const c of [a, b])
    if (c.food) {
      c.food.taken = null
      c.food = null
    }
}

export function attack(this: World, a: Creature, b: Creature) {
  a.lunge = 0.22
  const crit = Math.random() < 0.12
  // まもりの傾向が強いペットは少し硬い
  const guard = b.sp.tier > 0 ? 1 - Math.min(0.3, this.careOf(b).guard * 0.01) : 1
  const dmg = Math.max(1, Math.round(this.power(a) * (0.75 + Math.random() * 0.5) * (crit ? 1.8 : 1) * guard * this.bannerBoost(a)))
  b.hp -= dmg
  b.hurt = 0.28
  const dx = b.x - a.x
  const dz = b.z - a.z
  const d = Math.hypot(dx, dz) || 1
  b.kx = (dx / d) * (crit ? 7 : 4)
  b.kz = (dz / d) * (crit ? 7 : 4)
  const y = this.ground(b) + this.size(b)
  this.popups.push({ pos: new THREE.Vector3(b.x, y, b.z), text: crit ? `${dmg}!` : `${dmg}`, color: crit ? '#ffd23f' : '#ffffff', t: 0 })
  this.burst(b.x, y * 0.7, b.z, 'hit', crit ? 6 : 3, 2.5)
  if (this.ally(a) || this.ally(b)) this.onSfx(crit ? 'crit' : 'hit')
  if (crit && (this.ally(a) || this.ally(b))) this.hitStop = Math.max(this.hitStop, 0.06)
  if (b.hp <= 0) this.defeat(b, a)
}

export function defeat(this: World, loser: Creature, winner: Creature) {
  winner.foe = null
  this.setState(winner, 'happy', 1.8)
  loser.foe = null
  // じゃれあいバトル：負けた子もたおれるだけ。どちらも少し強くなる
  if (loser.spar) {
    const m = this.sparBook.find((m) => (m.a === winner && m.b === loser) || (m.a === loser && m.b === winner))
    if (m) {
      this.sparBook = this.sparBook.filter((o) => o !== m)
      this.onSparEnd(m.id, m.a === winner ? 0 : 1)
    }
    loser.spar = winner.spar = false
    loser.hp = 1
    this.setState(loser, 'faint', 4)
    this.addCare(winner, 'power', 1)
    this.gainXp(winner, 4)
    this.gainXp(loser, 2)
    winner.atk += 0.5
    if (this.ally(winner) || this.ally(loser)) this.say(`じゃれあいバトルは ${winner.sp.name}の かち！`)
    return
  }
  if (this.ally(loser)) {
    loser.hp = 1
    this.setState(loser, 'faint', 6)
    this.say(`${loser.sp.name}は たおれてしまった…`)
    if (loser.team === 'pet') this.onSfx('lose')
    return
  }
  this.setState(loser, 'dead', 1)
  const enemy = loser.sp.temper === 'wild'
  if (loser.sp.habit !== 'night' && !loser.army && !(enemy && this.hasItem('charm') && Math.random() < 0.6))
    this.respawn.push({ id: loser.sp.id, t: (loser.sp.habit === 'raid' ? 40 : 14) + Math.random() * 10 })
  // 勝った子は（仲間でも野生でも）それぞれ強くなる
  winner.atk += 1
  winner.maxHp += 3
  this.addCare(winner, 'power', 1)
  this.gainXp(winner, 5)
  if (this.ally(winner)) {
    const p = this.pet
    this.stats.wins++
    this.stat('wins')
    if (BOSSES.has(loser)) this.stat('bosses')
    this.earn(10, loser.x, loser.z)
    this.say(`${winner.sp.name}の かち！ ちから+1`)
    this.onSfx('win')
    // 守ってもらった野生の子は仲良し度が上がる
    for (const o of this.creatures) if (o.team === 'wild' && o.sp.temper === 'calm' && Math.hypot(o.x - p.x, o.z - p.z) < 5) o.affinity += 25
  }
}

export function canSkill(this: World, c: Creature) {
  if (c.skillCd > 0 || c.grow > 0) return false
  // おうえんされたら必ず、ふだんは時々。強い段階ほど技を出しやすい
  return c.cheer || Math.random() < 0.3 + c.sp.tier * 0.06
}

export function orb(this: World, color: string) {
  let sh = this.orbSheets.get(color)
  if (!sh) {
    sh = iconSheet(['.ooo.', 'oowoo', 'owwwo', 'oowoo', '.ooo.'], { o: color, w: '#ffffff' })
    this.orbSheets.set(color, sh)
  }
  return sh
}

/** 技名をさけんで、種族ごとの演出で攻撃する */
export function useSkill(this: World, c: Creature, f: Creature) {
  const sk = SKILLS[c.sp.id]
  c.skillCd = 7 + Math.random() * 4
  c.cheer = false
  c.lunge = 0.3
  const top = this.ground(c) + this.size(c) + 0.35
  // 技名はいつものメッセージ欄に（仲間がからむ時と、カメラの近くの時だけ）
  const near = Math.hypot(c.x - this.look.x, c.z - this.look.z) < 8
  if (this.ally(c) || this.ally(f)) {
    this.say(`${c.team === 'wild' ? 'てきの ' : ''}${c.sp.name}の ${sk.name}！`)
    this.onSfx('skill')
  } else if (near) this.say(`やせいの ${c.sp.name}の ${sk.name}！`)
  const dmg = Math.max(2, Math.round(this.power(c) * sk.mult * (0.9 + Math.random() * 0.2) * this.bannerBoost(c)))
  const at = (x: number, z: number, y = 0.5) => new THREE.Vector3(x, this.stage.heightAt(x, z) + y, z)
  switch (sk.kind) {
    case 'shot': {
      // 弾がまっすぐ（強い技は大きく）飛んでいく
      const n = c.sp.tier >= 3 ? 3 : 1
      for (let i = 0; i < n; i++) {
        const a = new SpriteAnim(this.orb(sk.color), c.sp.tier >= 3 ? 0.42 : 0.3)
        a.sprite.center.set(0.5, 0.5)
        const from = at(c.x, c.z, this.size(c) * 0.55)
        a.sprite.position.copy(from)
        this.scene.add(a.sprite)
        this.shots.push({ sprite: a.sprite, from, src: c, dst: f, t: -i * 0.1, dur: 0.38, dmg: i === 0 ? dmg : Math.round(dmg * 0.3), skill: sk, arc: c.sp.id === 'gorota' ? 0.8 : 0.15 })
      }
      break
    }
    case 'burst':
      // その場でまぶしく光って、まわりをはじく
      this.ring(c.x, c.z, sk.color, 2.6, 0.45)
      this.colorBurst(c.x, top - 0.3, c.z, sk.color, 16, 4)
      if (c.sp.id === 'pikori') this.flash = Math.max(this.flash, this.ally(c) ? 0.25 : 0)
      this.after(0.12, () => this.splash(c, f, dmg, 2.6))
      break
    case 'dash':
      // いきおいよく突っこむ
      c.kx = ((f.x - c.x) / (Math.hypot(f.x - c.x, f.z - c.z) || 1)) * 14
      c.kz = ((f.z - c.z) / (Math.hypot(f.x - c.x, f.z - c.z) || 1)) * 14
      for (let i = 0; i < 5; i++) this.after(i * 0.04, () => this.colorBurst(c.x, this.ground(c) + 0.4, c.z, sk.color, 3, 1))
      this.after(0.2, () => this.hitWith(c, f, dmg, sk))
      break
    case 'rain':
      // 空から星がふりそそぐ
      for (let i = 0; i < 7; i++)
        this.after(i * 0.07, () => {
          const a = new SpriteAnim(this.orb(sk.color), 0.32)
          a.sprite.center.set(0.5, 0.5)
          const ox = (Math.random() - 0.5) * 1.6
          const oz = (Math.random() - 0.5) * 1.6
          const from = at(f.x + ox - 1.2, f.z + oz, 5)
          a.sprite.position.copy(from)
          this.scene.add(a.sprite)
          this.shots.push({ sprite: a.sprite, from, src: c, dst: f, t: 0, dur: 0.45, dmg: i === 3 ? dmg : 0, skill: sk, arc: 0 })
        })
      this.shake = Math.max(this.shake, 0.35)
      break
    case 'heal': {
      // 自分とまわりの味方を回復
      const friends = this.creatures.filter((o) => this.alive(o) && o.sp.temper === c.sp.temper && Math.hypot(o.x - c.x, o.z - c.z) < 3.5)
      for (const o of friends) {
        const amt = Math.round(o.maxHp * 0.3)
        o.hp = Math.min(o.maxHp, o.hp + amt)
        this.popups.push({ pos: at(o.x, o.z, this.size(o) + 0.1), text: `+${amt}`, color: '#7cf29b', t: 0 })
        this.colorBurst(o.x, this.ground(o) + 0.8, o.z, sk.color, 6, 1.2)
      }
      this.ring(c.x, c.z, sk.color, 3.5, 0.6)
      // ついでに軽く攻撃も
      this.after(0.2, () => this.hitWith(c, f, Math.max(1, Math.round(this.power(c) * 0.8)), sk))
      break
    }
    case 'wave':
      // 地面を伝わる波（ゴウガンは家もゆらす）
      this.ring(f.x, f.z, sk.color, 3, 0.55)
      this.after(0.25, () => this.ring(f.x, f.z, sk.color, 2, 0.45))
      this.shake = Math.max(this.shake, 0.4)
      this.after(0.2, () => {
        this.splash(c, f, dmg, 2.2)
        if (c.sp.id === 'gougan') for (const h of this.houses) if (h.stage === this.stageIndex && h.level > 0 && Math.hypot(h.x - f.x, h.z - f.z) < 3) this.damageHouse(h, dmg * 0.5, c)
      })
      break
  }
  if (c.sp.tier >= 3 || c.sp.habit === 'raid') this.shake = Math.max(this.shake, 0.25)
}

/** 相手と、そのまわりにいる敵側にもダメージ */
export function splash(this: World, c: Creature, f: Creature, dmg: number, range: number) {
  const sk = SKILLS[c.sp.id]
  if (this.alive(f)) this.hitWith(c, f, dmg, sk)
  if (c.spar) return
  for (const o of [...this.creatures]) {
    if (o === f || o === c || !this.alive(o)) continue
    const hostile = c.sp.temper === 'wild' ? o.sp.temper === 'calm' : o.sp.temper === 'wild'
    if (hostile && Math.hypot(o.x - f.x, o.z - f.z) < range) this.hitWith(c, o, Math.round(dmg * 0.5), sk)
  }
}

/** 技が当たった */
export function hitWith(this: World, a: Creature, b: Creature, dmg: number, sk: Skill) {
  if (!this.alive(b) || !this.creatures.includes(a)) return
  const guard = b.sp.tier > 0 ? 1 - Math.min(0.3, this.careOf(b).guard * 0.01) : 1
  dmg = Math.max(1, Math.round(dmg * guard))
  b.hp -= dmg
  b.hurt = 0.4
  const dx = b.x - a.x
  const dz = b.z - a.z
  const d = Math.hypot(dx, dz) || 1
  b.kx = (dx / d) * 9
  b.kz = (dz / d) * 9
  const y = this.ground(b) + this.size(b)
  this.popups.push({ pos: new THREE.Vector3(b.x, y, b.z), text: `${dmg}!!`, color: sk.color, t: 0 })
  this.colorBurst(b.x, y * 0.7, b.z, sk.color, 10, 3.5)
  this.burst(b.x, y * 0.7, b.z, 'hit', 4, 3)
  if (this.ally(a) || this.ally(b)) {
    this.onSfx('boom')
    this.hitStop = Math.max(this.hitStop, 0.09)
  }
  if (b.hp <= 0) {
    // 技で倒されたら、その場でいったん戦いをほどく
    if (b.foe && b.foe !== a && b.foe.foe === b) {
      b.foe.foe = null
      this.setState(b.foe, 'idle', 0.4)
    }
    this.defeat(b, a)
  }
}

export function colorBurst(this: World, x: number, y: number, z: number, color: string, n: number, power: number) {
  for (let i = 0; i < n; i++) {
    if (this.fx.length > 180) return
    const a = new SpriteAnim(this.orb(color), 0.14 + Math.random() * 0.08)
    a.sprite.center.set(0.5, 0.5)
    a.sprite.position.set(x, y, z)
    this.scene.add(a.sprite)
    const ang = Math.random() * Math.PI * 2
    const sp = power * (0.3 + Math.random() * 0.7)
    const life = 0.4 + Math.random() * 0.35
    this.fx.push({ sprite: a.sprite, vx: Math.cos(ang) * sp * 0.6, vz: Math.sin(ang) * sp * 0.6, vy: sp * 0.7, life, max: life, grav: 5 })
  }
}

/** 地面に広がる光の輪 */
export function ring(this: World, x: number, z: number, color: string, size: number, dur: number) {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.75, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  )
  mesh.position.set(x, this.stage.heightAt(x, z) + 0.06, z)
  mesh.scale.setScalar(0.1)
  this.scene.add(mesh)
  this.rings.push({ mesh, t: 0, dur, size })
}

export function after(this: World, t: number, run: () => void) {
  this.later.push({ t, run })
}

export function updateSkills(this: World, dt: number) {
  for (const l of [...this.later]) {
    l.t -= dt
    if (l.t <= 0) {
      this.later.splice(this.later.indexOf(l), 1)
      l.run()
    }
  }
  for (const sh of [...this.shots]) {
    sh.t += dt
    if (sh.t < 0) continue
    const k = Math.min(1, sh.t / sh.dur)
    const to = new THREE.Vector3(sh.dst.x, this.ground(sh.dst) + this.size(sh.dst) * 0.5, sh.dst.z)
    sh.sprite.position.lerpVectors(sh.from, to, k)
    sh.sprite.position.y += Math.sin(k * Math.PI) * sh.arc
    // 通ったあとに光の粒
    if (Math.random() < 0.6) this.colorBurst(sh.sprite.position.x, sh.sprite.position.y, sh.sprite.position.z, sh.skill.color, 1, 0.4)
    if (k >= 1) {
      this.scene.remove(sh.sprite)
      ;(sh.sprite.material as THREE.SpriteMaterial).map?.dispose()
      sh.sprite.material.dispose()
      this.shots.splice(this.shots.indexOf(sh), 1)
      if (sh.dmg > 0) this.hitWith(sh.src, sh.dst, sh.dmg, sh.skill)
      else this.colorBurst(to.x, to.y, to.z, sh.skill.color, 4, 2)
    }
  }
  for (const r of [...this.rings]) {
    r.t += dt
    const k = r.t / r.dur
    r.mesh.scale.setScalar(0.1 + k * r.size)
    ;(r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - k))
    if (k >= 1) {
      this.scene.remove(r.mesh)
      r.mesh.geometry.dispose()
      ;(r.mesh.material as THREE.Material).dispose()
      this.rings.splice(this.rings.indexOf(r), 1)
    }
  }
}

/** 傾向（ペットは World.care、ほかの子は自分の care） */
export function careOf(this: World, c: Creature) {
  return c === this.pet ? this.care : c.care
}

export function addCare(this: World, c: Creature, k: Care, n: number) {
  this.careOf(c)[k] += n
}

/** 経験値を足して、条件を満たしたら進化（1 匹ずつ自分の傾向で進化先が決まる） */
export function gainXp(this: World, c: Creature, n: number) {
  if (c.sp.tier === 0) return
  if (c === this.pet) this.xp += n
  else c.xp += n
  const xp = c === this.pet ? this.xp : c.xp
  const tier = c.sp.tier
  if (tier !== 1 && tier !== 2 && tier !== 3) return
  if (xp < XP_NEED[tier] || c.grow > 0 || c.state === 'fight' || !this.alive(c)) return
  const care = this.careOf(c)
  // ペットは育て方どおり。ほかの子は生まれつきの性格と気まぐれも入る
  const score = (k: Care) => care[k] + (c === this.pet ? 0 : (c.bias === k ? 3 : 0) + Math.random() * 2.5)
  const top = (['power', 'guard', 'spirit'] as Care[]).sort((a, b) => score(b) - score(a))[0]
  this.evolve(c, this.pickSecret(c, top) ?? nextForm(c.sp.id, tier, top))
}

export function evolve(this: World, c: Creature, to: SpeciesId) {
  const fromId = c.sp.id
  const h0 = this.size(c)
  const sp = SPECIES[to]
  c.sp = sp
  c.maxHp = Math.max(c.maxHp + 10, sp.hp)
  c.hp = c.maxHp
  c.atk = Math.max(c.atk + 2, sp.atk)
  // 見えている 2.5D の子は、白いシルエットの演出をはさむ（見えない・3D モデルはすぐ切りかえ）
  if (c.anim.silhouette && c.anim.sprite.visible && !c.evo) {
    c.evo = { t: 0, from: fromId, to, h0, shown: 'old', said: false }
    if (this.ally(c)) this.onSfx('evolve')
    return
  }
  c.anim.setSpecies(to, this.size(c), this.variant(c))
  this.evolved(c, SPECIES[fromId].name)
}

/** 進化がおわった時のメッセージ・コイン（演出のあとに 1 回だけ） */
export function evolved(this: World, c: Creature, from: string) {
  const sp = c.sp
  this.mark(c.x, c.z, this.ally(c) ? 3 : 1)
  this.burst(c.x, this.ground(c) + 0.6, c.z, 'spark', 18, 3)
  const near = Math.hypot(c.x - this.look.x, c.z - this.look.z) < 9
  if (this.ally(c)) {
    if (c === this.pet) this.flash = 1
    this.say(`${c.rare ? '★' : ''}${from}は ${sp.name}に しんかした！`)
    if (!c.evo) this.onSfx('evolve')
    this.stat('evolves')
    this.earn(c === this.pet ? 30 : 15)
  } else if (near) this.say(`やせいの ${from}が ${sp.name}に しんかした！`)
  if (isSecretId(sp.id) && this.ally(c)) this.foundSecretForm(c)
}

/**
 * 進化の演出（約 1.8 秒）：
 * 0〜0.65 ちかちか白く光ってふるえる → 0.65〜1.3 白いシルエットがふくらむ → 1.3 新しい姿のシルエットに（光の輪）→ 〜1.8 ちぢんで新しい姿
 */
export function updateEvo(this: World, c: Creature, dt: number) {
  const e = c.evo!
  e.t += dt
  const t = e.t
  const v = this.variant(c)
  const hNew = this.size(c)
  const show = (what: Evo['shown']) => {
    if (e.shown === what) return
    e.shown = what
    if (what === 'old') c.anim.setSpecies(e.from, e.h0, v)
    else if (what === 'white-old') c.anim.silhouette!(e.from, e.h0)
    else if (what === 'white-new') c.anim.silhouette!(e.to, hNew)
    else c.anim.setSpecies(e.to, hNew, v)
  }
  // ジャンプ中ならその場で着地まで
  c.vy -= 16 * dt
  c.jy = Math.max(0, c.jy + c.vy * dt)
  if (c.jy === 0 && c.vy < 0) c.vy = 0
  let h = e.h0
  let sx = 1
  let sy = 1
  let shake = 0
  const ease = (k: number) => 1 - (1 - Math.min(1, Math.max(0, k))) ** 3
  if (t < 0.65) {
    show(Math.floor(t * (9 + t * 26)) % 2 === 0 ? 'white-old' : 'old')
    shake = Math.sin(t * 70) * 0.04 * (0.4 + t)
    sy = 1 + Math.sin(t * 24) * 0.03
  } else if (t < 1.3) {
    show('white-old')
    const k = ease((t - 0.65) / 0.65)
    sx = 1 + 0.45 * k
    sy = 1 + 0.6 * k
    shake = Math.sin(t * 90) * 0.03
    if (e.t - dt < 0.65) this.ring(c.x, c.z, '#ffffff', 2.6, 0.7)
  } else {
    if (!e.said) {
      // 新しい姿のシルエットへ：光の輪とキラキラ・ペットは画面もフラッシュ
      e.said = true
      this.ring(c.x, c.z, '#ffe27a', 3.4, 0.8)
      this.evolved(c, SPECIES[e.from].name)
    }
    if (t < 1.8) {
      show('white-new')
      const k = ease((t - 1.3) / 0.5)
      const s0 = THREE.MathUtils.clamp((e.h0 * 1.5) / hNew, 1.05, 1.6)
      h = hNew
      sx = sy = s0 + (1 - s0) * k
    } else {
      show('new')
      c.evo = null
      c.squash = 0.35
      this.burst(c.x, this.ground(c) + hNew * 0.6, c.z, 'heart', 4, 1.6)
      if (this.ally(c)) this.setState(c, 'happy', 1.4)
      h = hNew
    }
  }
  if (t < 1.3 && Math.random() < dt * 14) this.burst(c.x + (Math.random() - 0.5) * 0.8, this.ground(c) + Math.random() * e.h0, c.z, 'spark', 1, 1.2, -1)
  c.anim.update(dt)
  c.anim.setHeight(h)
  c.anim.sprite.scale.x *= sx
  c.anim.sprite.scale.y *= sy
  const gy = this.ground(c)
  c.anim.sprite.position.set(c.x + shake * h, gy + c.jy, c.z)
  c.shadow.position.set(c.x, this.stage.heightAt(c.x, c.z) + 0.03, c.z)
  c.shadow.scale.setScalar(h * 0.9 * (1 + (sx - 1) * 0.6))
}

export function earn(this: World, n: number, x?: number, z?: number) {
  this.coins += n
  if (x !== undefined && z !== undefined) this.burst(x, this.stage.heightAt(x, z) + 0.6, z, 'coin', Math.min(6, 1 + Math.floor(n / 5)), 2)
  this.onSfx('coin')
}

export function updateDex(this: World) {
  const add = (id: string, lv: 1 | 2) => {
    const cur: number = this.dex[id] ?? 0
    if (cur < lv) {
      this.dex[id] = lv
      if (cur === 0) {
        this.dexNew.push(id)
        this.stat('dex')
      }
    }
  }
  for (const c of this.creatures) {
    if (c.state === 'dead') continue
    add(c.sp.id, this.ally(c) ? 2 : 1)
    if (c.rare) this.addRareDex(c)
  }
  if (this.dexNew.length && --this.dexMsgT <= 0) {
    const names = this.dexNew.splice(0).map((id) => SPECIES[id as SpeciesId].name)
    this.say(`ずかんに とうろく：${names.slice(0, 3).join('・')}${names.length > 3 ? ' ほか' : ''}`)
    this.onSfx('dex')
    this.dexMsgT = 4
  }
  const TH = [5, 10, 20, 30, 40, 49]
  const RW = [30, 50, 100, 150, 200, 500]
  const owned = Object.entries(this.dex).filter(([k, v]) => v === 2 && !isSecretId(k)).length
  while (this.dexClaimed < TH.length && owned >= TH[this.dexClaimed]) {
    this.say(`ずかん ${TH[this.dexClaimed]}しゅ たっせい！ コイン+${RW[this.dexClaimed]}`)
    this.earn(RW[this.dexClaimed])
    this.dexClaimed++
  }
}

/** 色ちがいをずかんに記録する（みつけた = 1 / なかまにした = 2。はじめての時だけ知らせる） */
export function addRareDex(this: World, c: Creature) {
  const id = c.sp.id
  const lv: 1 | 2 = this.ally(c) ? 2 : 1
  const cur: number = this.dexRare[id] ?? 0
  if (cur >= lv) return
  this.dexRare[id] = lv
  if (cur === 0) this.say(`★ いろちがいの ${c.sp.name}を みつけた！ ずかんに のった`)
  if (lv === 2) {
    this.say(`★ いろちがいの ${c.sp.name}が なかまに！ コイン+20`)
    this.earn(20)
  }
}

/** ずかんの一覧（系統ごと・段階の順） */
export function dexList(this: World) {
  const order = ['めばえ', 'きかい', 'りゅう', 'ねこ', 'いぬ', 'とり', 'みず', 'モンスター', 'てき']
  const fam = (id: SpeciesId) => (SPECIES[id].tier ? FAMILY_NAME[familyOf(id)] : 'てき')
  return (Object.values(SPECIES) as Species[])
    .filter((sp) => !isSecretId(sp.id))
    .map((sp) => ({ id: sp.id, name: sp.name, kind: sp.kind, tier: sp.tier, family: fam(sp.id), state: this.dex[sp.id] ?? 0, rare: this.dexRare[sp.id] ?? 0 }))
    .sort((a, b) => order.indexOf(a.family) - order.indexOf(b.family) || a.tier - b.tier)
}

export function dexInfo(this: World) {
  const all = (Object.values(SPECIES) as Species[]).filter((sp) => !isSecretId(sp.id))
  return {
    owned: Object.entries(this.dex).filter(([k, v]) => v === 2 && !isSecretId(k)).length,
    total: all.filter((s) => s.tier > 0).length,
    seen: Object.keys(this.dex).filter((k) => !isSecretId(k)).length,
    rareSeen: Object.keys(this.dexRare).length,
    rareOwned: Object.values(this.dexRare).filter((v) => v === 2).length,
    all: all.length,
    gen: this.stats.gen,
    lineage: this.stats.lineage,
    pet: this.pet.sp.name,
    life: Math.min(1, this.stats.petAge / LIFESPAN),
  }
}

/** 仲間を だいく・はたけがかり・みはりに わりふる（性格と、村に何が足りないかで決める） */
export function assignRoles(this: World) {
  const allies = this.creatures.filter((c) => c.team === 'friend' && c.grow === 0 && c.sp.tier >= 2 && this.alive(c))
  const done = (k: StructKind) => this.structs.filter((b) => b.stage === this.stageIndex && b.kind === k && this.structDone(b)).length
  const want: Record<Role, number> = {
    farmer: done('farm'),
    guard: done('tower') + done('castle') * 2 + done('fort') * 2 + done('lighthouse') + (this.vLv >= 1 ? 1 : 0),
    carer: done('playground'),
    seller: this.vLv >= 1 ? done('market') : 0,
    builder: 99,
    free: 0,
  }
  const count: Record<Role, number> = { free: 0, builder: 0, farmer: 0, guard: 0, carer: 0, seller: 0 }
  let said = false
  for (const c of allies) {
    // 性格ごとの希望順（だいくは何人でも入れる受け皿なので、ほかの役を先に並べる）
    const pref: Role[] =
      c.bias === 'power' ? ['guard', 'seller', 'builder', 'carer', 'farmer'] : c.bias === 'guard' ? ['carer', 'builder', 'guard', 'farmer', 'seller'] : ['farmer', 'carer', 'seller', 'builder', 'guard']
    const role = pref.find((r) => count[r] < want[r]) ?? 'free'
    count[role]++
    if (role !== c.role) {
      c.role = role
      if (!said && role !== 'free' && Math.hypot(c.x - this.look.x, c.z - this.look.z) < 10) {
        said = true
        this.say(`${c.sp.name}は ${ROLE_NAME[role]}に なった`)
        this.onSfx('role')
      }
    }
  }
  for (const c of this.creatures) if (!allies.includes(c)) c.role = 'free'
}

/** みはりの立つ場所（みはりとう・おしろ・いしのとりで・とうだいのそば） */
export function guardPost(this: World, c: Creature) {
  let best: Struct | null = null
  let bd = 99
  for (const b of this.structs) {
    if (b.stage !== this.stageIndex || !this.structDone(b) || (b.kind !== 'tower' && b.kind !== 'castle' && b.kind !== 'fort' && b.kind !== 'lighthouse')) continue
    const d = Math.hypot(b.x - c.x, b.z - c.z)
    if (d < bd) {
      bd = d
      best = b
    }
  }
  return best
}

/** あそんだ時間をすすめる（テスト用：minutes 分ぶん） */
export function ageUp(this: World, minutes: number) {
  this.stats.petAge += minutes * 60
}

export function updateAge(this: World, dt: number) {
  this.peaceT = Math.max(0, this.peaceT - dt)
  // 1 秒ごと：なかまの としと、進化のし忘れ（たたかい中に経験値がたまった など）を見る
  this.ageT += dt
  if (this.ageT >= 1) {
    const step = this.ageT
    this.ageT = 0
    for (const c of [...this.creatures]) {
      if (c === this.pet || c.state === 'dead') continue
      if (c.life > 0 && !this.noAging) {
        c.age += step
        if (c.age >= c.life && c.grow === 0 && c.state !== 'fight' && !c.evo) this.retireFriend(c)
      }
    }
    for (const c of this.creatures) if (c.state !== 'dead' && c.sp.tier >= 1 && c.sp.tier <= 3) this.gainXp(c, 0)
  }
  if (this.retiring || !this.alive(this.pet)) return
  this.stats.petAge += dt
  const life = this.stats.petAge / LIFESPAN
  if (!this.oldWarned && life > 0.85) {
    this.oldWarned = true
    this.say(`${this.pet.sp.name}も ずいぶん としを とった… そろそろ じゅみょうが ちかい`)
  }
  if (life >= 1 && this.pet.state !== 'fight' && this.pet.grow === 0) this.retirePet()
}

export function friendCount(this: World) {
  return this.creatures.filter((c) => c.team === 'friend' && c.state !== 'dead').length
}

/** できごとの場所を おぼえる（おまかせカメラ用。w = 見に行きたさ） */
export function mark(this: World, x: number, z: number, w: number) {
  this.marks.push({ x, z, w, t: this.time })
  if (this.marks.length > 24) this.marks.shift()
}

/** カメラ：ペットについていく */
export function setFollow(this: World, on: boolean) {
  this.follow = on
  if (on) this.auto = false
  this.camPan.set(0, 0)
}

/** カメラ：おまかせ（何か起きた所へ ゆっくり移る。しばらく何もなければ 仲間や村を順に見る） */
export function setAuto(this: World, on: boolean) {
  this.auto = on
  if (on) {
    this.follow = false
    this.freeLook.copy(this.look)
    this.autoT = 0
  }
}

/** カメラを 90° 回す（新しい見た目だけ） */
export function rotateView(this: World, d: number) {
  this.diorama?.setYaw(this.diorama.yaw + d)
}

/** いまのカメラの状態（ボタンの表示用） */
export function camState(this: World) {
  return { follow: this.follow, auto: this.auto, free: !!this.diorama }
}

/** おまかせ：次に見に行く場所 */
export function pickAutoSpot(this: World) {
  const recent = this.marks.filter((m) => this.time - m.t < 90)
  if (recent.length) {
    const m = recent.reduce((a, b) => (b.w * 2 + (b.t - this.time) / 30 > a.w * 2 + (a.t - this.time) / 30 ? b : a))
    this.marks.splice(this.marks.indexOf(m), 1)
    return { x: m.x, z: m.z }
  }
  // できごとが無ければ：仲間・家・建物のどれかを のんびり見てまわる
  const spots: { x: number; z: number }[] = this.creatures.filter((c) => this.ally(c) && !c.inside).map((c) => ({ x: c.x, z: c.z }))
  for (const h of this.houses) if (h.stage === this.stageIndex) spots.push({ x: h.x, z: h.z })
  for (const b of this.structs) if (b.stage === this.stageIndex) spots.push({ x: b.x, z: b.z })
  return spots.length ? spots[Math.floor(Math.random() * spots.length)] : { x: 0, z: 0 }
}

/** なかま（と、野生のおとなしい子）が じゅみょうで ねむりにつく。なかまは ときどき 同じ系統の たまごを のこす */
export function retireFriend(this: World, c: Creature) {
  const near = Math.hypot(c.x - this.look.x, c.z - this.look.z) < 10
  if (c.team === 'friend' || near) this.say(`${this.nm(c)}は じゅみょうを むかえ… しずかに ねむりについた`)
  this.burst(c.x, this.ground(c) + 0.8, c.z, 'heart', 5, 1.6)
  if (c.team === 'friend' && this.eggs.length < 5 && this.friendCount() + this.eggs.filter((e) => !e.wild).length <= MAX_FRIENDS && Math.random() < 0.6) {
    this.layEgg(c.x + 0.6, c.z + 0.3, [c.sp.id], 30)
    this.say(`${c.sp.name}の いたところに たまごが のこっていた`)
  }
  c.retired = true
  c.foe = null
  this.setState(c, 'dead', 1.8)
}

/** ペットが ねんれいで ねむり、たまごから 次の代が うまれる */
export function retirePet(this: World) {
  const p = this.pet
  const old = p.sp
  this.retiring = true
  this.say(`${old.name}は ねんれいを むかえ… やすらかに ねむりについた`)
  this.onSfx('lose')
  this.flash = 0.7
  this.setState(p, 'sleep', 4)
  this.placeMemorial(p.x, p.z)
  this.burst(p.x, this.ground(p) + 0.8, p.z, 'heart', 8, 2)
  this.after(3.4, () => this.rebirth(old))
}

export function rebirth(this: World, old: Species) {
  const p = this.pet
  const fam = familyOf(old.id)
  // 親の系統の赤ちゃん（ときどき、その場所らしい系統に突然変異）
  let kind: EggKind = fam === 'plain' ? 'inherit' : (fam as EggKind)
  if (Math.random() < 0.25) kind = this.stageEggKind()
  const id = (kind === 'inherit' ? 'mebu' : BABY[kind]) as SpeciesId
  const sp = SPECIES[id]
  this.stats.lineage = [...this.stats.lineage, old.name].slice(-12)
  this.stats.gen++
  this.stat('rebirths')
  this.stats.petAge = 0
  this.oldWarned = false
  // 育ちの傾向は 3 割だけ引きつぐ。代をかさねるほど少し強く生まれる
  this.care = { power: this.care.power * 0.3, guard: this.care.guard * 0.3, spirit: this.care.spirit * 0.3 }
  this.xp = 0
  this.eatenOf.set(p, {})
  const legacy = 1 + Math.min(0.4, 0.05 * (this.stats.gen - 1))
  p.sp = sp
  // 次の代は見た目も新しく（もようのシード・3% で色ちがい）
  p.evo = null
  p.seed = newSeed()
  p.rare = Math.random() < RARE_RATE
  p.grow = 0.01
  p.maxHp = Math.round(sp.hp * 0.6 * legacy)
  p.hp = p.maxHp
  p.atk = Math.round(sp.atk * legacy * 10) / 10
  p.hunger = 100
  p.energy = 100
  p.anim.setSpecies(id, this.size(p), this.variant(p))
  this.setState(p, 'happy', 2)
  this.burst(p.x, this.ground(p) + 0.8, p.z, 'spark', 20, 3)
  this.ring(p.x, p.z, '#ffe27a', 3, 0.9)
  this.flash = 1
  this.onSfx('generation')
  this.say(`たまごが ひかり ${p.rare ? '★ いろちがいの ' : ''}${sp.name}が うまれた！ だい${this.stats.gen}せだい`)
  this.earn(50)
  this.retiring = false
}

/** おはか（ほしの かざり）。4 つまで */
export function placeMemorial(this: World, x: number, z: number) {
  const here = this.items.filter((it) => it.kind === 'memorial')
  if (here.length >= 4) {
    const old = here[0]
    this.unmountItem(old)
    this.items.splice(this.items.indexOf(old), 1)
  }
  const it: Item = { kind: 'memorial', stage: this.stageIndex, x: x + 0.9, z, grow: 1, vx: 0, vz: 0, mesh: null, rot: 0, sq: 0, tick: 0 }
  this.items.push(it)
  this.mountItem(it)
}

export function updateVillage(this: World, dt: number) {
  this.villageT += dt
  if (this.villageT < 1) return
  this.villageT = 0
  this.calcVillage()
  this.updateDex()
  this.updateRoad()
  this.updateSecrets()
  this.roleT += 1
  if (this.roleT >= 15) {
    this.roleT = 0
    this.assignRoles()
  }
  if (this.vLv > this.villageSeen) {
    this.say(this.vLv === 1 ? `${this.villageName()}が うまれた！` : this.vLv === 2 ? `${this.villageName()}に はったつした！` : `${this.villageName()}が さかえている！`)
    this.earn(this.vLv * 15)
    this.onSfx('win')
  }
  this.villageSeen = this.vLv
  // みんなで勝手に はたけ・いどを つくる（人が何もしなくても村は少しずつ育つ）
  this.autoPlanT += 1
  if (this.autoPlanT >= 20 && !this.openSite(null)) {
    this.autoPlanT = 0
    const homes = this.houses.filter((h) => h.stage === this.stageIndex && h.level >= 3).length
    const has = (k: StructKind) => this.structs.some((b) => b.stage === this.stageIndex && b.kind === k)
    // やることが何もない時は、村に足りない建物を自分たちで計画する（おしろ・はし・とうだい・いちば・とりでは人がせっけいずを買った時だけ）
    const next: [StructKind, number, number][] = [['farm', 2, 0], ['well', 3, 0], ['tower', 3, 0], ['cradle', 4, 0], ['fountain', 4, 7], ['playground', 4, 8], ['windmill', 5, 9]]
    const want = next.find(([k, n, sc]) => homes >= n && this.vScore >= sc && !has(k))
    if (want) this.planStruct(want[0], this.pet.x, this.pet.z, true)
  }
}

export function tryBreed(this: World, dt: number) {
  this.breedT += dt
  this.breedCd -= dt
  const cradle = this.structs.some((b) => b.kind === 'cradle' && b.stage === this.stageIndex && b.mats >= STRUCTS.cradle.need)
  if (this.breedT < 8 || this.breedCd > 0 || this.eggs.length >= (cradle ? 3 : 2)) return
  this.breedT = 0
  const p = this.pet
  const ready = (c: Creature) => this.alive(c) && c.grow === 0 && c.sp.tier >= 2 && c.hunger > 50 && c.energy > 35 && c.state !== 'fight'
  if (!ready(p) || this.stats.mood < 55) return
  const mate = this.creatures.find((c) => c.team === 'friend' && ready(c) && Math.hypot(c.x - p.x, c.z - p.z) < 3)
  if (!mate) return
  // なかまと（かえる前の）たまごで いっぱいなら、もう たまごは できない
  if (this.friendCount() + this.eggs.filter((e) => !e.wild).length >= MAX_FRIENDS) return
  const fire = this.item('fire')
  const nearFire = fire && Math.hypot(fire.x - p.x, fire.z - p.z) < 3
  const chance = 0.22 * (nearFire ? 2 : 1) * (this.night > 0.5 ? 1.5 : 1) * (cradle ? 1.8 : 1)
  if (Math.random() > chance) return
  this.breedCd = 90
  // たまごの系統：親の系統を受けつぐ（ときどき この場所らしい系統に突然変異）
  const fams = [familyOf(p.sp.id), familyOf(mate.sp.id)].filter((f) => f !== 'plain') as EggKind[]
  let kind: EggKind = 'inherit'
  const r = Math.random()
  if (fams.length && r < 0.6) kind = fams[Math.floor(Math.random() * fams.length)]
  else if (r > 0.75) kind = this.stageEggKind()
  this.layEgg((p.x + mate.x) / 2, (p.z + mate.z) / 2, [p.sp.id, mate.sp.id], 35, kind)
  this.burst(p.x, this.ground(p) + 1, p.z, 'heart', 6, 1.5)
  this.stat('eggs')
  this.say(`${p.sp.name}と ${mate.sp.name}に たまごが できた！`)
  this.onSfx('egg')
}

/** この場所でよく見つかる系統のたまご */
export function stageEggKind(this: World): EggKind {
  const pool = STAGE_EGGS[this.stageIndex] ?? STAGE_EGGS[0]
  return pool[Math.floor(Math.random() * pool.length)]
}

export function layEgg(this: World, x: number, z: number, parents: SpeciesId[], t = 35, kind: EggKind = 'inherit', wild = false, lucky = false, deco?: Season) {
  const sheet = deco ? (this.decoSheets[deco] ??= DECO_SHEET(deco)) : this.eggSheets[kind]
  const anim = new SpriteAnim(sheet, deco ? 0.7 : kind === 'inherit' ? 0.6 : 0.68)
  const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat)
  shadow.scale.setScalar(0.5)
  this.scene.add(anim.sprite, shadow)
  this.eggs.push({ x, z, t, anim, shadow, parents, kind, wild, lucky, deco })
}

/** ときどき、その場所らしい系統のたまごが野原に落ちている（かえった子は野生で、仲良くなると仲間に） */
export function updateWildEgg(this: World, dt: number) {
  this.wildEggT -= dt
  if (this.wildEggT > 0) return
  this.wildEggT = 150 + Math.random() * 100
  if (this.eggs.length >= 3) return
  const q = this.freePos(3)
  const kind = this.stageEggKind()
  this.layEgg(q.x, q.z, [], 60, kind, true)
  if (Math.hypot(q.x - this.look.x, q.z - this.look.z) < 10) this.say(`${FAMILY_NAME[kind]}のたまごが おちている！`)
}

export function updateEggs(this: World, dt: number) {
  this.updateWildEgg(dt)
  for (const e of [...this.eggs]) {
    e.t -= dt
    const y = this.stage.heightAt(e.x, e.z)
    e.anim.sprite.position.set(e.x, y, e.z)
    e.shadow.position.set(e.x, y + 0.03, e.z)
    // 生まれそうになると揺れる
    e.anim.material.rotation = e.t < 8 ? Math.sin(this.time * (e.t < 3 ? 30 : 14)) * 0.25 : 0
    if (e.luck && Math.random() < dt * 2) this.burst(e.x, y + 0.5, e.z, 'spark', 1, 0.8)
    if (e.t <= 0) {
      this.scene.remove(e.anim.sprite, e.shadow)
      e.anim.dispose()
      this.eggs.splice(this.eggs.indexOf(e), 1)
      const fam = e.kind !== 'inherit'
      const id = (fam ? BABY[e.kind] : e.parents[Math.floor(Math.random() * e.parents.length)]) as SpeciesId
      // 色ちがい：ふつう 3%、ふしぎなたまごは 8%
      const rare = SPECIES[id].tier > 0 && Math.random() < (e.lucky ? RARE_RATE_LUCKY : RARE_RATE)
      // なかまが いっぱいなら、うまれた子は のはらで くらす（あとで空きができれば なかよくなって なかまに）
      const full = !e.wild && this.friendCount() >= MAX_FRIENDS
      if (full) this.say('なかまが いっぱいなので、うまれた子は のはらで くらすことに')
      const baby = this.spawn(id, e.wild || full ? 'wild' : 'friend', e.x, e.z, e.wild || full ? 0 : 0.01, { seed: newSeed(), rare })
      baby.anim.setHeight(this.size(baby))
      const star = rare ? '★ いろちがいの ' : ''
      if (rare) {
        this.burst(e.x, y + 0.6, e.z, 'spark', 10, 3, -1)
        this.ring(e.x, e.z, '#ffe27a', 2.6, 0.9)
      }
      baby.maxHp = Math.round(SPECIES[id].hp * (e.wild ? 1 : 0.6))
      baby.hp = baby.maxHp
      this.burst(e.x, y + 0.3, e.z, 'spark', 14, 2.5)
      this.mark(e.x, e.z, e.wild ? 1 : 2)
      if (e.luck) this.luckyHatch(baby, e.luck)
      if (e.wild) {
        if (Math.hypot(e.x - this.look.x, e.z - this.look.z) < 10) {
          this.say(`${FAMILY_NAME[e.kind]}のたまごから ${star}${SPECIES[id].name}が うまれた！ なかよく なれるかな`)
          this.onSfx('hatch')
        }
      } else {
        this.stats.children++
        this.stat('hatched')
        if (e.deco) this.earn(10)
        this.say(e.deco ? `${SEASON_INFO[e.deco].egg}から ${star}${SPECIES[id].name}が うまれた！` : fam ? `${FAMILY_NAME[e.kind]}のたまごから ${star}${SPECIES[id].name}が うまれた！` : `たまごから ${star}${SPECIES[id].name}の こどもが うまれた！`)
        this.onSfx('hatch')
        this.earn(20)
      }
    }
  }
}
