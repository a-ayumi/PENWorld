/** World.ts から分けた「save」のメソッド。this は World（World.ts のクラスのつなぎの行から呼ばれる） */
/** 中身：セーブと 読みこみ。読んだ 値は 信用せず isSpecies() / num() などで かならず 検査する */
import { EGG_COLORS, SPECIES, familyOf, newSeed, type Care, type EggKind, type SpeciesId } from '../monsters'
import type { Facts } from '../../journal'
import { HALF, LAND_SIZES, STAGES, setLandSize } from '../stages'
import { WORLD_SIZE } from '../worldmap'
import { STRUCTS, isStructKind, type StructKind } from '../structures'
import { ITEM_SPEC, isItemKind, type ItemKind } from '../items'
import { SHOP } from '../shop'
import { MissionBook, isSeason, sanitizeStats } from '../../missions'
import { backfill, loadRoad, newRoad, saveRoad } from '../../roadmap'
import type { World } from '../World'
import { type TownRing, type PetPlan, PET_PLANS, type TownPlan, TOWN_PLANS, Creature, House, LIFESPAN, FRIEND_LIFE, MAX_ORDERS, newLife, isSpecies, num, SAVE_KEY, houseLevel } from '../World'
import { DINER_MAX } from './village'

export function save(this: World) {
  if (!this.pet || this.saveLocked) return
  const c2 = (c: Creature) => ({
    sp: c.sp.id, hp: Math.round(c.hp), maxHp: c.maxHp, atk: c.atk, hunger: Math.round(c.hunger), energy: Math.round(c.energy), grow: c.grow,
    xp: c.xp, care: c.care, bias: c.bias, seed: c.seed, rare: c.rare, age: Math.round(c.age), life: Math.round(c.life),
  })
  const friends = this.creatures.filter((c) => c.team === 'friend')
  const ownerKey = (h: House) => (h.owner === this.pet ? 'pet' : h.owner && friends.includes(h.owner) ? `f${friends.indexOf(h.owner)}` : '')
  const data = {
    land: this.land, dex: this.dex, dexRare: this.dexRare, dexClaimed: this.dexClaimed, road: saveRoad(this.road),
    counters: this.counters, missions: this.book.toJSON(),
    coins: this.coins, stage: this.stageIndex, care: this.care, xp: this.xp, stats: this.stats, night: this.nightTarget,
    pet: c2(this.pet),
    friends: friends.map(c2),
    houses: this.houses.map((h) => ({ stage: h.stage, x: h.x, z: h.z, ownerSp: h.ownerSp, owner: ownerKey(h), mats: h.mats, hp: Math.round(h.hp), era: h.era, age: Math.round(h.age) })),
    eraPath: this.eraPath,
    paths: this.paths.save(),
    pathStage: this.stageIndex,
    petPlan: this.petPlan,
    townPlan: this.townPlan,
    world: this.worldMode || undefined,
    townWalls: this.townWalls,
    foeHouses: this.foeHouses.map((h) => ({ stage: h.stage, x: h.x, z: h.z, mats: h.mats, hp: Math.round(h.hp), era: h.era, age: Math.round(h.age) })),
    foeWalls: this.foeWalls,
    foePath: this.foePath,
    structs: this.structs.map((b) => ({ kind: b.kind, stage: b.stage, x: b.x, z: b.z, rot: b.rot, len: b.len, mats: b.mats, hp: Math.round(b.hp), item: b.item, ordered: b.ordered || undefined, stock: b.stock || undefined })),
    orders: this.orders,
    items: this.items.map((it) => ({ kind: it.kind, stage: it.stage, x: it.x, z: it.z, grow: it.grow, rot: it.rot })),
    eggs: this.eggs.map((e) => ({ x: e.x, z: e.z, t: e.t, parents: e.parents, kind: e.kind, wild: e.wild, lucky: e.lucky, deco: e.deco, luck: e.luck })),
    secrets: this.saveSecrets(friends),
    lucky: this.luckySave,
  }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
  } catch {
    /* noop */
  }
  this.onSave?.()
}

export function load(this: World): boolean {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(SAVE_KEY)
  } catch {
    return false
  }
  if (!raw) return false
  try {
    const d = JSON.parse(raw)
    if (!d || typeof d !== 'object' || !d.pet || !isSpecies(d.pet.sp)) return false
    this.coins = num(d.coins, 0, 999999, 50)
    this.care = { power: 0, guard: 0, spirit: 0, ...d.care }
    this.xp = d.xp ?? 0
    this.stats = { ...this.stats, ...d.stats }
    this.stats.gen = Math.round(num(this.stats.gen, 1, 999, 1))
    this.stats.petAge = num(this.stats.petAge, 0, 1e7, 0)
    this.stats.lineage = (Array.isArray(this.stats.lineage) ? this.stats.lineage : []).filter((n: unknown) => typeof n === 'string').slice(-12).map((n: string) => n.slice(0, 12))
    this.oldWarned = this.stats.petAge / LIFESPAN > 0.85
    this.land = Math.round(num(d.land, 0, LAND_SIZES.length - 1, 0))
    // 大きな 世界の セーブは 世界の 広さで 読む（古い 1 まいの セーブは その 広さで 読んで あとで ずらす）
    setLandSize(this.worldMode && d.world ? WORLD_SIZE : LAND_SIZES[this.land])
    this.dex = {}
    if (d.dex && typeof d.dex === 'object' && !Array.isArray(d.dex))
      for (const [k, v] of Object.entries(d.dex)) if (isSpecies(k) && (v === 1 || v === 2)) this.dex[k] = v
    this.dexRare = {}
    if (d.dexRare && typeof d.dexRare === 'object' && !Array.isArray(d.dexRare))
      for (const [k, v] of Object.entries(d.dexRare)) if (isSpecies(k) && (v === 1 || v === 2)) this.dexRare[k] = v
    this.dexClaimed = Math.round(num(d.dexClaimed, 0, 6, 0))
    this.luckySave = d.lucky ?? null
    this.counters = sanitizeStats(d.counters)
    this.book = MissionBook.from(d.missions)
    this.nightTarget = this.night = d.night ?? 0
    // 置き物：種類・数・場所を検査してから使う（ステージごとの上限つき）
    type SavedItem = { kind: unknown; stage: unknown; x: unknown; z: unknown; grow: unknown; rot: unknown }
    const itemCount = new Map<string, number>()
    this.items = []
    for (const it of ((Array.isArray(d.items) ? d.items : []) as SavedItem[]).slice(0, 80)) {
      if (!it || !isItemKind(it.kind)) continue
      const stage = Math.round(num(it.stage, 0, STAGES.length - 1))
      const key = `${it.kind}@${stage}`
      const n = (itemCount.get(key) ?? 0) + 1
      if (n > ITEM_SPEC[it.kind].max) continue
      itemCount.set(key, n)
      this.items.push({
        kind: it.kind, stage, x: num(it.x, -HALF, HALF, 0), z: num(it.z, -HALF, HALF, 0), grow: num(it.grow, 0, 1, 1),
        rot: num(it.rot, -7, 7, 0), vx: 0, vz: 0, mesh: null, sq: 0, tick: 0,
      })
    }
    type SavedHouse = { stage: number; x: number; z: number; ownerSp: SpeciesId; owner: string; mats: number; hp: number; era?: number; age?: number }
    const savedHouses = ((Array.isArray(d.houses) ? d.houses : []) as SavedHouse[]).filter((h) => h && typeof h.owner === 'string').slice(0, 40)
    this.houses = savedHouses.map((h) => ({ stage: h.stage, x: h.x, z: h.z, owner: null, ownerSp: isSpecies(h.ownerSp) ? h.ownerSp : 'mebu', mats: num(h.mats, 0, 12), hp: num(h.hp, 0, 100), mesh: null, shake: 0, level: houseLevel(h.mats), alerted: 0, era: Math.round(num(h.era, 1, 9, 3)), age: num(h.age, 0, 1e7, 0) }))
    // 城壁の 輪（ステージごと・数は 検査する）
    this.townWalls = {}
    if (d.townWalls && typeof d.townWalls === 'object')
      for (const [k, v] of Object.entries(d.townWalls as Record<string, unknown>)) {
        if (!Number.isInteger(+k) || +k < 0 || +k >= STAGES.length || !Array.isArray(v)) continue
        this.townWalls[+k] = (v as Record<string, number>[]).slice(0, 6).filter((r) => r && typeof r === 'object').map((r) => ({
          r: num(r.r, 2, 80, 10), era: Math.round(num(r.era, 1, 9, 2)), built: Math.round(num(r.built, 0, 400, 0)), age: num(r.age, 0, 1e7, 0),
          cx: num(r.cx, -HALF, HALF, 0), cz: num(r.cz, -HALF, HALF, 0), gate: num(r.gate, -7, 7, 0),
        }))
      }
    // 敵の 町
    const ringsOf = (src: unknown) => {
      const out: Record<number, TownRing[]> = {}
      if (src && typeof src === 'object')
        for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
          if (!Number.isInteger(+k) || +k < 0 || +k >= STAGES.length || !Array.isArray(v)) continue
          out[+k] = (v as Record<string, number>[]).slice(0, 6).filter((r) => r && typeof r === 'object').map((r) => ({
            r: num(r.r, 2, 80, 10), era: Math.round(num(r.era, 1, 9, 2)), built: Math.round(num(r.built, 0, 400, 0)), age: num(r.age, 0, 1e7, 0),
            cx: num(r.cx, -HALF, HALF, 0), cz: num(r.cz, -HALF, HALF, 0), gate: num(r.gate, -7, 7, 0),
          }))
        }
      return out
    }
    this.foeWalls = ringsOf(d.foeWalls)
    this.foeHouses = ((Array.isArray(d.foeHouses) ? d.foeHouses : []) as Record<string, number>[]).slice(0, 40).filter((h) => h && typeof h === 'object').map((h) => {
      const mats = Math.round(num(h.mats, 0, 12, 0))
      return { stage: Math.round(num(h.stage, 0, STAGES.length - 1, 0)), x: num(h.x, -HALF, HALF, 0), z: num(h.z, -HALF, HALF, 0), owner: null, ownerSp: 'noiz' as SpeciesId, mats, hp: num(h.hp, 0, 100, 0), mesh: null, shake: 0, level: houseLevel(mats), alerted: 0, era: Math.round(num(h.era, 1, 9, 1)), age: num(h.age, 0, 1e7, 0), foe: true }
    })
    this.foePath = {}
    if (d.foePath && typeof d.foePath === 'object') for (const [k, v] of Object.entries(d.foePath as Record<string, unknown>)) if ((v === 'white' || v === 'steam') && Number.isInteger(+k) && +k >= 0 && +k < STAGES.length) this.foePath[+k] = v
    // 町の 枝（white / steam だけ）
    this.petPlan = PET_PLANS.includes(d.petPlan as PetPlan) ? (d.petPlan as PetPlan) : 'auto'
    this.townPlan = TOWN_PLANS.includes(d.townPlan as TownPlan) ? (d.townPlan as TownPlan) : 'auto'
    // ふみかためた 道（いまの 箱庭の 分だけ。大きな世界への 引っこしでは 持ってこない）
    if (d.pathStage === this.stageIndex && (d.world === true) === this.worldMode) this.paths.load(d.paths)
    else this.paths.clear(this.scene)
    this.eraPath = {}
    if (d.eraPath && typeof d.eraPath === 'object') for (const [k, v] of Object.entries(d.eraPath as Record<string, unknown>)) if ((v === 'white' || v === 'steam') && Number.isInteger(+k) && +k >= 0 && +k < STAGES.length) this.eraPath[+k] = v
    type SavedStruct = { kind: unknown; stage: number; x: number; z: number; rot: number; len: number; mats: number; hp: number; item?: unknown; ordered?: unknown; stock?: unknown }
    this.structs = ((Array.isArray(d.structs) ? d.structs : []) as SavedStruct[])
      .filter((b) => b && isStructKind(b.kind) && (b.kind !== 'crate' || isItemKind(b.item)))
      .slice(0, 60)
      .map((b) => {
        const kind = b.kind as StructKind
        return {
          kind, stage: Math.round(num(b.stage, 0, STAGES.length - 1)), x: num(b.x, -HALF, HALF), z: num(b.z, -HALF, HALF), rot: num(b.rot, -7, 7, 0),
          len: num(b.len, 0, 12, 0), mats: Math.round(num(b.mats, 0, STRUCTS[kind].need)), hp: num(b.hp, 0, 999, STRUCTS[kind].hp), mesh: null, shake: 0, q: -1, t: 0, alerted: 0,
          item: kind === 'crate' ? (b.item as ItemKind) : undefined, ordered: b.ordered === true || undefined, stock: kind === 'diner' ? Math.round(num(b.stock, 0, DINER_MAX, 0)) : undefined,
        }
      })
    // ちゅうもんの列：ショップに ある品（せっけいず・おきもの）だけ
    this.orders = ((Array.isArray(d.orders) ? d.orders : []) as { id?: unknown; stage?: unknown }[])
      .filter((o) => o && typeof o.id === 'string' && SHOP.some((x) => x.id === o.id && (x.plan || x.item)))
      .slice(0, MAX_ORDERS)
      .map((o) => ({ id: o.id as string, stage: Math.round(num(o.stage as number, 0, STAGES.length - 1)) }))
    // 大きな 世界へ はじめて 読む 古い セーブ：森（ステージ 0）の 町を 世界の 森へ ずらす。ほかの ステージの 物と へい・敵の 町は 持ってこない
    if (this.worldMode && !d.world) {
      const oldK = LAND_SIZES[this.land] / 20
      const to = this.worldForest()
      const mv = (o: { x: number; z: number }) => {
        o.x = o.x + 5.2 * oldK + to.x
        o.z = o.z - 1.0 * oldK + to.z
      }
      this.houses = this.houses.filter((h) => h.stage === 0)
      this.houses.forEach(mv)
      this.structs = this.structs.filter((b) => b.stage === 0 && b.kind !== 'wall' && b.kind !== 'bridge')
      this.structs.forEach(mv)
      this.items = this.items.filter((it) => it.stage === 0)
      this.items.forEach(mv)
      this.townWalls = {}
      this.foeHouses = []
      this.foeWalls = {}
      this.orders = this.orders.filter((o) => o.stage === 0)
    }
    // 古い 1 まいの セーブを 大きな 世界から もどす 時も ステージ 0 から
    this.loadStage(this.worldMode ? 0 : Math.min(STAGES.length - 1, Math.round(num(d.stage, 0, STAGES.length - 1))))
    type Saved = { sp: SpeciesId; hp: number; maxHp: number; atk: number; hunger: number; energy: number; grow: number; xp?: number; care?: Record<Care, number>; bias?: Care; seed?: number; rare?: boolean; age?: number; life?: number }
    /** 見た目のシード（古いセーブには無いので、その時は新しく決める）。色ちがいは 保存されたものだけ */
    const lookOfSaved = (s: Saved) => ({ seed: Math.round(num(s.seed, 0, 0x7fffffff, newSeed())), rare: s.rare === true && SPECIES[s.sp].tier > 0 })
    const apply = (c: Creature, s: Saved) => {
      Object.assign(c, { hp: num(s.hp, 0, 9999), maxHp: num(s.maxHp, 1, 9999, 10), atk: num(s.atk, 0, 9999, 1), hunger: num(s.hunger, 0, 100, 50), energy: num(s.energy, 0, 100, 50), grow: num(s.grow, 0, 1, 0) })
      if (s.xp !== undefined) c.xp = s.xp
      if (s.care) c.care = Object.assign({ power: 0, guard: 0, spirit: 0 }, s.care)
      if (s.bias) c.bias = s.bias
      // じゅみょう（古いセーブには無い：その時は今から数える）
      if (c.team !== 'pet' && c.sp.temper !== 'wild') {
        c.life = num(s.life, FRIEND_LIFE[0] * 0.5, FRIEND_LIFE[1], newLife())
        c.age = num(s.age, 0, c.life, 0)
      }
      c.anim.setHeight(this.size(c))
    }
    const st0 = this.stage.start ?? { x: 0, z: 0 }
    this.pet = this.spawn(d.pet.sp, 'pet', st0.x, st0.z + 1.5, 0, lookOfSaved(d.pet))
    apply(this.pet, d.pet)
    const friends: Creature[] = []
    for (const f of ((Array.isArray(d.friends) ? d.friends : []) as Saved[]).slice(0, 40)) if (f && isSpecies(f.sp)) {
      const c = this.spawn(f.sp, 'friend', st0.x + (Math.random() - 0.5) * 2, st0.z + 2.2, 0, lookOfSaved(f))
      apply(c, f)
      friends.push(c)
    }
    // 家の持ち主をつなぎ直す
    savedHouses.forEach((h, i) => {
      const owner = h.owner === 'pet' ? this.pet : h.owner.startsWith('f') ? friends[Number(h.owner.slice(1))] : undefined
      this.houses[i].owner = owner ?? null
    })
    for (const e of (Array.isArray(d.eggs) ? d.eggs : []).slice(0, 6)) {
      if (!e) continue
      const kind: EggKind = typeof e.kind === 'string' && Object.prototype.hasOwnProperty.call(EGG_COLORS, e.kind) ? e.kind : 'inherit'
      const parents = (Array.isArray(e.parents) ? e.parents : []).filter(isSpecies).slice(0, 2)
      if (kind === 'inherit' && !parents.length) continue
      this.layEgg(num(e.x, -HALF, HALF), num(e.z, -HALF, HALF), parents, num(e.t, 0, 120, 35), kind, !!e.wild, e.lucky === true, isSeason(e.deco) ? e.deco : undefined)
      if (e.luck === 1 || e.luck === 2) this.eggs[this.eggs.length - 1].luck = e.luck
    }
    this.loadRoadState(d.road)
    this.loadSecrets(d.secrets, friends, Array.isArray(d.friends) ? d.friends.slice(0, 40) : [])
    this.say(`おかえり！ ${this.pet.sp.name}が まっていたよ`)
    return true
  } catch {
    return false
  }
}

/** いまの様子。日記の材料と、おかえりレポートの「前後の差」に使う */
export function journalFacts(this: World): Facts {
  const friends = this.creatures.filter((c) => c.team === 'friend')
  const care = (['power', 'guard', 'spirit'] as Care[]).sort((a, b) => this.care[b] - this.care[a])[0]
  return {
    coins: this.coins, gen: this.stats.gen, pet: this.pet.sp.name, family: familyOf(this.pet.sp.id), care, weather: this.weather,
    houses: this.houses.filter((h) => h.level >= 3).length, structs: this.structs.filter((b) => this.structDone(b) && b.kind !== 'wall').length,
    children: this.stats.children, friends: friends.length, friendNames: [...new Set(friends.map((c) => c.sp.name))].slice(0, 4),
    dex: Object.values(this.dex).filter((v) => v === 2).length, vName: this.villageName(), vLv: this.vLv, lineage: this.stats.lineage.slice(-3),
  }
}

/**
 * 留守のあいだを軽く早送りする。実時間ぶんは回さず、dt=0.5 の粗い刻みを最大 1500 回（= 12 分半）だけ進め、
 * 残りは数式で圧縮する（コイン・資材・たまご・成長・経験値・建築）。敵軍と世代交代は起こさない。
 * `run(ms)` を毎フレーム呼ぶと、時間予算のぶんだけ進めて、終わったら true を返す。
 */
export function beginAway(this: World, sec: number, onStep?: (frac: number) => void) {
  const total = Math.max(0, Math.min(sec, 8 * 3600))
  const DT = 0.5
  const steps = Math.min(1500, Math.floor(total / DT))
  const rem = total - steps * DT
  const sfx = this.onSfx
  const petAge = this.stats.petAge
  const armyCd = this.armyCd
  this.onSfx = () => {}
  this.armyCd = 1e9
  this.noAging = true
  // 早送りのあいだに寿命が来て世代交代しないように、年齢だけ手前に留める
  this.stats.petAge = Math.min(petAge, LIFESPAN - 1000)
  let i = 0
  let stage = 0
  const job = {
    steps,
    get frac() {
      return steps ? i / steps : 1
    },
    run: (ms: number) => {
      const t0 = performance.now()
      if (stage === 0) {
        while (i < steps && performance.now() - t0 < ms) {
          onStep?.(i / steps)
          this.update(DT)
          i++
        }
        if (i < steps) return false
        stage = 1
      }
      onStep?.(1)
      this.compressAway(rem)
      this.stats.petAge = petAge
      this.armyCd = Math.max(armyCd, 60)
      this.onSfx = sfx
      this.noAging = false
      this.messages.length = 0
      this.msgT = 0
      return true
    },
  }
  return job
}

/** 早送りで回しきれなかった時間ぶんを、数式で進める */
export function compressAway(this: World, rem: number) {
  const allies = this.creatures.filter((c) => this.ally(c) && this.alive(c))
  const friends = allies.filter((c) => c.team === 'friend')
  if (rem > 0) {
    // コイン：見守り収入の 3 割、300 まで
    const ticks = Math.floor(rem / 20)
    this.coins += Math.min(300, Math.floor(ticks * (1 + Math.floor(friends.length / 2) + this.vLv) * 0.3))
    // 資材の補充
    for (let i = 0, n = Math.min(8, Math.floor(rem / 30)); i < n; i++) this.spawnResource()
    // たまご・こどもの成長
    for (const e of this.eggs) e.t = e.t - rem <= 0 ? 0.05 : e.t - rem
    for (const c of this.creatures) if (c.grow > 0) c.grow = Math.min(1, c.grow + rem / 150)
    // 経験値（1 人 1 回。進化するのは多くて 1 段階）
    const xp = Math.min(60, Math.floor(rem / 30) * 2)
    if (xp > 0) for (const c of allies) if (c.grow === 0 && c.sp.tier > 0) this.gainXp(c, xp)
    // 建築：家と建物を時間に比例して進める（かんせいの演出と文は ふだんの建て方と同じ）
    const k = Math.min(6, Math.floor(rem / 150))
    for (const h of this.houses) {
      const by = h.owner && this.alive(h.owner) ? h.owner : this.pet
      if (h.stage === this.stageIndex && h.level < 4 && h.owner) for (let j = 0; j < k && h.level < 4; j++) this.addMaterial(h, by)
    }
    for (const b of this.structs)
      if (b.stage === this.stageIndex && b.kind !== 'wall' && !this.structDone(b)) for (let j = 0; j < k && !this.structDone(b); j++) this.addStructMaterial(b, this.alive(this.pet) ? this.pet : allies[0] ?? this.pet)
  }
  // ぐっすり休めたことにする
  for (const c of allies) {
    c.hunger = Math.max(c.hunger, 45)
    c.energy = Math.max(c.energy, 60)
    c.hp = Math.max(c.hp, c.maxHp * 0.8)
  }
  this.stats.mood = Math.max(this.stats.mood, 60)
  for (let i = 0; i < 6; i++) this.update(0.5)
}

/** もくひょうの進みを読む。保存が無い（古いセーブ）なら、これまでの実績から章をさかのぼって進める */
export function loadRoadState(this: World, raw: unknown) {
  const saved = loadRoad(raw)
  this.calcVillage()
  if (saved) {
    this.road = saved
    return
  }
  const r = newRoad()
  // 昔のセーブには敵軍の記録が無い：村がにぎわっていれば（★5 から敵軍が来る）1 回は追いはらったとみなす
  r.wins = this.vScore >= 5 ? 1 : 0
  for (const h of this.houses) r.visited |= 1 << h.stage
  for (const b of this.structs) r.visited |= 1 << b.stage
  r.visited |= 1 << this.stageIndex
  this.road = r
  const cleared = backfill(r, this.roadState())
  if (cleared.length) {
    const coins = cleared.reduce((n, c) => n + c.reward.coins + (c.reward.egg ? 20 : 0), 0)
    this.coins += coins
    this.say(`これまでの あゆみから だい${cleared.length}しょうまで すすんだよ！ コイン+${coins}`)
    if (cleared.some((c) => c.reward.crown)) r.crown = true
  }
}

/** データを消して最初から */
export function reset(this: World) {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    /* noop */
  }
  location.reload()
}
