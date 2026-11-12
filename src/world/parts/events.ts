/** World.ts から分けた「events」のメソッド。this は World（World.ts のクラスのつなぎの行から呼ばれる） */
import * as THREE from 'three'
import { RES } from '../psx'
import { SpriteAnim, iconSheet } from '../sprites'
import { EGG_COLORS, FAMILY_NAME, armyBoss, armyMember, familyOf, type Care, type EggKind, type SpeciesId } from '../monsters'
import { Tex } from '../textures'
import { fxU } from '../fx'
import { fxLod } from '../fxprops'
import { HALF, STAGES } from '../stages'
import { EAT_KEYS, EVENT_IDS, SECRET_EVENTS, SECRET_FORMS, hintLines, hintMask, isSecretId, secretById, secretForm, type EventCtx, type EventFx, type SecretCtx, type SecretEvent } from '../secrets'
import { STRUCTS, type StructKind } from '../structures'
import { SHOP } from '../shop'
import { ACHIEVEMENTS, ALL_CLEAR_BONUS, DIFF_NAME, SEASONS, SEASON_INFO, STAT_KEY, missionText, seasonNow, type BookEvent, type Gauges, type Season } from '../../missions'
import { BOSS_CHAPTER, bossReady, roadStep, roadView, type Chapter, type RoadState } from '../../roadmap'
import type { World } from '../World'
import { Creature, ResKind, Struct, Army, Weather, FoodKind, LIFESPAN, SparSide, isSpecies, num, syncSeasonShop, SEASON_WEATHER, MAX_RES, WEATHER_MSG, WEATHER_W, WX, WX_TINT, EMBER_SUN, TMP, BOW_LEN, BOSSES } from '../World'

export function makeAmbient(this: World) {
  for (const a of this.ambient) {
    this.scene.remove(a.s.sprite)
    a.s.dispose()
  }
  this.ambient = []
  const bfSheets = ['#ffd23f', '#ff8fb1', '#9fd8ff', '#ffffff', '#b48cff'].map((col) => iconSheet(['.....', 'oo.oo', 'ooxoo', 'oo.oo', '.....'], { o: col, x: '#3d2a1e' }))
  const ff = iconSheet(['.....', '..o..', '.ooo.', '..o..', '.....'], { o: '#d8ff7a' })
  const ice = iconSheet(['.....', '..o..', '.ooo.', '..o..', '.....'], { o: this.stageIndex === 5 ? '#ffb347' : '#aef0ff' })
  for (let i = 0; i < 12; i++) {
    const kind: 'bf' | 'ff' | 'ice' = this.stageIndex === 4 || this.stageIndex === 5 ? 'ice' : i < 7 ? 'bf' : 'ff'
    const sheet = kind === 'bf' ? bfSheets[i % bfSheets.length] : kind === 'ff' ? ff : ice
    const s = new SpriteAnim(sheet, kind === 'bf' ? 0.32 : kind === 'ff' ? 0.3 : 0.22)
    s.sprite.center.set(0.5, 0.5)
    s.sprite.visible = false
    this.scene.add(s.sprite)
    this.ambient.push({ s, kind, cx: (Math.random() * 2 - 1) * HALF * 0.8, cz: (Math.random() * 2 - 1) * HALF * 0.8, r: 0.8 + Math.random() * 1.6, ph: Math.random() * 10, sp: 0.5 + Math.random() * 0.6, y: 0.7 + Math.random() * 0.8, bx: s.sprite.scale.x, by: s.sprite.scale.y })
  }
  // 春は花びら、秋は落ち葉がひらひら舞い落ちる
  if (this.season === 'spring' || this.season === 'autumn') {
    const petal = this.season === 'spring'
    const cols = petal ? ['#ffb3d1', '#ffd6e6', '#ffffff'] : ['#ff9a3c', '#d9531e', '#e8c030']
    const sheets = cols.map((col) => iconSheet(petal ? ['.....', '.oo..', 'ooooo', '..oo.', '.....'] : ['..o..', '.ooo.', 'ooooo', '.ooo.', '..o..'], { o: col }))
    for (let i = 0; i < 26; i++) {
      const kind = petal ? 'petal' : 'leaf'
      const s = new SpriteAnim(sheets[i % sheets.length], petal ? 0.36 : 0.44)
      s.sprite.center.set(0.5, 0.5)
      s.sprite.visible = false
      this.scene.add(s.sprite)
      this.ambient.push({ s, kind, cx: (Math.random() * 2 - 1) * HALF, cz: (Math.random() * 2 - 1) * HALF, r: 0.4 + Math.random() * 0.9, ph: Math.random() * 10, sp: 0.5 + Math.random() * 0.5, y: 0, bx: s.sprite.scale.x, by: s.sprite.scale.y })
    }
  }
}

/** 季節を変える（見た目・ショップ・天気の重みが切り替わる）。ふだんは日付から自動で呼ばれる */
export function setSeason(this: World, season: Season) {
  if (season === this.season && this.seasonDeco !== null) return
  this.season = season
  syncSeasonShop(season)
  this.shopCursor = Math.min(this.shopCursor, SHOP.length - 1)
  this.makeAmbient()
  this.buildSeasonDeco()
}

/** 夏まつりのちょうちん（夜に明るくなる）。ほかの季節は何も置かない */
export function buildSeasonDeco(this: World) {
  if (this.seasonDeco) {
    this.scene.remove(this.seasonDeco)
    this.seasonDeco.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      ;(m.material as THREE.Material | undefined)?.dispose?.()
    })
  }
  const g = new THREE.Group()
  this.seasonDeco = g
  this.scene.add(g)
  if (this.season !== 'summer') return
  const wood = this.lam('#6d4c41')
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.3
    let x = THREE.MathUtils.clamp(Math.cos(a) * HALF * 1.2, -HALF * 0.9, HALF * 0.9)
    let z = THREE.MathUtils.clamp(Math.sin(a) * HALF * 1.2, -HALF * 0.9, HALF * 0.9)
    // 木や岩・水とかさなる所は、すこし内側にずらす
    for (let tries = 0; tries < 6; tries++) {
      const hit = this.stage.obstacles.find((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.5)
      if (!hit) break
      x *= 0.92
      z *= 0.92
    }
    const lamp = new THREE.Group()
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.5, 5), wood)
    pole.position.y = 0.75
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: '#c0502f' }))
    body.scale.set(1, 1.25, 1)
    body.position.y = 1.5
    body.name = 'lamp'
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
    halo.position.y = 1.5
    halo.name = 'halo'
    lamp.add(pole, body, halo)
    lamp.position.set(x, this.stage.heightAt(x, z), z)
    g.add(lamp)
  }
}

export function updateSeasonDeco(this: World) {
  if (this.season !== 'summer' || !this.seasonDeco) return
  const dim = new THREE.Color('#9a4a30')
  const lit = new THREE.Color('#ffb347')
  for (const lamp of this.seasonDeco.children) {
    lamp.traverse((o) => {
      const m = o as THREE.Mesh
      if (o.name === 'lamp') (m.material as THREE.MeshBasicMaterial).color.copy(dim).lerp(lit, this.night)
      else if (o.name === 'halo') (m.material as THREE.MeshBasicMaterial).opacity = this.night * (0.2 + 0.05 * Math.sin(this.time * 3 + lamp.position.x))
    })
  }
}

export function updateAmbient(this: World, dt: number) {
  const calm = this.weather === 'sun' || this.weather === 'cloud'
  const beds = this.items.filter((it) => it.stage === this.stageIndex && it.kind === 'flowerbed' && it.mesh)
  for (const a of this.ambient) {
    const show =
      a.kind === 'bf' ? this.night < 0.4 && calm && this.season !== 'winter'
      : a.kind === 'ff' ? this.night > 0.5 && this.weather !== 'rain'
      : a.kind === 'petal' || a.kind === 'leaf' ? this.weather !== 'ember' && this.weather !== 'rain'
      : this.weather !== 'ember'
    a.s.sprite.visible = show
    if (!show) continue
    if (a.kind === 'petal' || a.kind === 'leaf') {
      // ゆっくり落ちながら左右にゆれる（地面につくと上にもどる）
      const t = this.time * a.sp + a.ph
      const fall = (this.time * 0.18 * a.sp + a.ph * 0.37) % 1
      const x = THREE.MathUtils.clamp(a.cx + Math.sin(t * 1.4) * a.r, -HALF, HALF)
      const z = THREE.MathUtils.clamp(a.cz + Math.cos(t * 1.1) * a.r, -HALF, HALF)
      a.s.sprite.position.set(x, this.stage.heightAt(x, z) + 0.1 + (1 - fall) * 3.4, z)
      a.s.material.rotation = Math.sin(t * 2.2) * 0.9
      a.s.sprite.scale.x = a.bx * (0.5 + 0.5 * Math.abs(Math.cos(t * 3.1)))
      continue
    }
    a.cx += Math.sin(this.time * 0.13 + a.ph) * dt * 0.4
    a.cz += Math.cos(this.time * 0.11 + a.ph) * dt * 0.4
    // はなだんの ちかくへ ちょうちょが あつまる
    if (a.kind === 'bf' && beds.length) {
      const bed = beds[Math.floor(a.ph) % beds.length]
      a.cx += (bed.x - a.cx) * dt * 0.35
      a.cz += (bed.z - a.cz) * dt * 0.35
      a.r = Math.min(a.r, 0.9)
    }
    a.cx = THREE.MathUtils.clamp(a.cx, -HALF, HALF)
    a.cz = THREE.MathUtils.clamp(a.cz, -HALF, HALF)
    const t = this.time * a.sp + a.ph
    const x = a.cx + Math.cos(t) * a.r
    const z = a.cz + Math.sin(t * 1.3) * a.r
    a.s.sprite.position.set(x, this.stage.heightAt(x, z) + a.y + Math.sin(t * 2.3) * 0.15, z)
    if (a.kind === 'bf') a.s.sprite.scale.x = a.bx * (0.35 + 0.65 * Math.abs(Math.sin(this.time * 13 + a.ph)))
    else a.s.sprite.scale.setScalar(a.bx * (0.7 + 0.5 * Math.sin(this.time * 5 + a.ph * 3)))
  }
}

export function applyLight(this: World, dt = 0.03) {
  const s = this.stage
  const k = (1 - this.night * 0.68) * this.weatherDim
  this.hemi.intensity = s.hemi[2] * k
  this.sun.intensity = s.sun.intensity * k
  const fog = this.scene.fog as THREE.Fog
  fog.color.set(s.fog)
  // 天気で空気の色を変える（色も強さも なめらかに追いかける）
  const tint = WX_TINT[this.weather]
  const k2 = 1 - Math.exp(-dt * 0.9)
  if (tint) this.tintC.lerp(TMP.set(tint), k2)
  const tk = tint ? (1 - this.weatherDim) * 1.6 + (this.weather === 'snow' ? 0.35 : 0) : 0
  this.tintK += (tk - this.tintK) * k2
  if (this.tintK > 0.001) fog.color.lerp(this.tintC, Math.min(1, this.tintK))
  fog.color.multiplyScalar(1 - this.night * 0.7)
  // 朝もや・雨・ゆきで、遠くがかすむ
  fog.near = 14 - 5 * this.wx.mist
  fog.far = 34 - 8 * this.wx.mist
  this.sun.color.set(s.sun.color)
  this.hemi.color.set(s.hemi[0])
  if (this.wx.ember > 0.001) {
    this.sun.color.lerp(EMBER_SUN, 0.55 * this.wx.ember)
    this.hemi.color.lerp(EMBER_SUN, 0.35 * this.wx.ember)
  }
  this.scene.background = fog.color
}

/** ゲーム内コインを使う（足りなければ false） */
export function spendCoins(this: World, n: number): boolean {
  n = Math.floor(n)
  if (!(n >= 0) || this.coins < n) return false
  this.coins -= n
  return true
}

/** ゲーム内コインをもらう（音を出さない時は quiet） */
export function addCoins(this: World, n: number, quiet = false) {
  n = Math.floor(n)
  if (!(n > 0)) return
  this.coins = Math.min(999999, this.coins + n)
  if (!quiet) this.onSfx('coin')
}

/** たまごを置ける空き（箱庭に置けるのは 3 こまで） */
export function eggRoom(this: World) {
  return Math.max(0, 3 - this.eggs.length)
}

/** うんだめしのたまごを、ペットのそばに置く（luck: 0 = ふつう / 1 = レア / 2 = スーパーレア）。置けなければ false */
export function giveEgg(this: World, kind: EggKind, luck = 0): boolean {
  if (this.eggRoom() <= 0 || !Object.prototype.hasOwnProperty.call(EGG_COLORS, kind)) return false
  const pt = this.pet
  const a = Math.random() * Math.PI * 2
  this.layEgg(pt.x + Math.cos(a) * 1.3, pt.z + Math.sin(a) * 1.3, [], luck >= 2 ? 25 : luck === 1 ? 32 : 40, kind)
  this.eggs[this.eggs.length - 1].luck = luck === 1 || luck === 2 ? luck : undefined
  this.burst(pt.x, this.ground(pt) + 0.6, pt.z, 'spark', luck ? 16 : 6, 2.5)
  return true
}

/** メッセージ欄に出す（うんだめし用） */
export function luckySay(this: World, text: string) {
  this.say(text)
}

/** うんだめしのたまごから生まれた子へのごほうび */
export function luckyHatch(this: World, baby: Creature, luck: number) {
  const k = luck >= 2 ? 1.5 : 1.25
  baby.maxHp = Math.round(baby.maxHp * k)
  baby.hp = baby.maxHp
  baby.atk += luck >= 2 ? 3 : 1
  this.gainXp(baby, luck >= 2 ? 20 : 8)
  this.colorBurst(baby.x, this.ground(baby) + 0.6, baby.z, luck >= 2 ? '#ffd23f' : '#9be0ff', 14, 3)
}

export function sparSide(this: World, c: Creature): SparSide {
  return { name: c.sp.name, fam: familyOf(c.sp.id), tier: c.sp.tier, hp: Math.round(c.hp), maxHp: Math.round(c.maxHp), atk: c.atk, cheer: c.cheer, mine: c.team !== 'wild' }
}

/** 判定に使ういまの数字。条件は roadmap.ts の表にあり、ここは読み取るだけ */
export function roadState(this: World): RoadState {
  const built = Object.fromEntries(Object.keys(STRUCTS).map((k) => [k, 0])) as Record<StructKind, number>
  for (const b of this.structs) if (this.structDone(b)) built[b.kind]++
  const dex = this.dexInfo()
  let stages = 0
  for (let i = 0; i < STAGES.length; i++) if (this.road.visited & (1 << i)) stages++
  return {
    time: (this.stats.gen - 1) * LIFESPAN + this.stats.petAge,
    houses: this.houses.filter((h) => h.level >= 3).length,
    vLv: this.vLv,
    built,
    friends: this.creatures.filter((c) => c.team === 'friend' && c.state !== 'dead').length,
    children: this.stats.children,
    wins: this.stats.wins,
    dexOwned: dex.owned,
    dexTotal: dex.total,
    gen: this.stats.gen,
    land: this.land,
    stages,
    armyWins: this.road.wins,
    bossWins: this.road.bossWins,
  }
}

/** 1 秒に 1 回：目標の判定・章のクリア・大軍勢のきっかけ */
export function updateRoad(this: World) {
  this.road.visited |= 1 << this.stageIndex
  const ev = roadStep(this.road, this.roadState())
  for (const g of ev.goals) {
    if (ev.clear) break
    this.say(`もくひょう たっせい！ ${g.text}`)
    this.confettiBurst(8)
    this.onSfx('win')
  }
  if (ev.clear) this.roadClear(ev.clear)
  if (ev.intro) this.cards.push({ title: `だい${ev.intro.no}しょう ${ev.intro.name}`, sub: 'あたらしい しょう', lines: ev.intro.intro, color: '#9fd8ff', at: this.time + (ev.intro.no === 1 ? 6 : 3), t0: 0 })
  // 第 9 章のじゅんびが終わったら、予告のあと自動で大軍勢が来る（負けたあとは「もくひょう」から自分でいどむ）
  const ok = bossReady(this.road) && this.road.bossTry === 0 && this.road.bossWins === 0 && this.vScore >= 5 && this.alive(this.pet)
  if (!ok) this.bossT = -1
  else if (!this.army) {
    if (this.bossT < 0) {
      this.bossT = 60
      this.cards.push({ title: 'ノイズの おうが めざめた…', sub: 'いちぶんごに だいぐんぜいが くる', lines: ['きたと ひがしから、おおぜいの', 'ノイズが せめてくる。', 'おしろと みはりを かためておこう。'], color: '#ff9a9a', at: this.time, t0: 0 })
      this.say('だいぐんぜいの よかん… じゅんびを いそごう')
      this.onSfx('boom')
    } else if (--this.bossT <= 0) {
      this.bossT = -1
      this.callArmy(undefined, true)
    }
  }
}

export function confettiBurst(this: World, n: number) {
  const x = this.look.x
  const z = this.look.z
  const y = this.stage.heightAt(x, z) + 1
  this.burst(x, y, z, 'coin', Math.ceil(n / 2), 3)
  this.burst(x, y, z, 'spark', n, 3)
  this.burst(x, y, z, 'heart', Math.ceil(n / 3), 2.5)
}

export function roadClear(this: World, c: Chapter) {
  const w = c.reward
  this.earn(w.coins)
  if (w.egg) {
    const p = this.freePos(1.2, this.look.x, this.look.z, 3)
    this.layEgg(p.x, p.z, [], 40, w.egg)
  }
  if (w.crown && !this.road.crown) {
    this.road.crown = true
    this.placeItem('crown')
  }
  this.cards.push({
    title: `だい${c.no}しょう クリア！`, sub: `しょうごう「${w.title}」`, color: '#ffe27a', at: this.time, t0: 0,
    lines: [...c.outro, `コイン+${w.coins}${w.egg ? ' ・たまご' : ''}${w.crown ? ' ・おうかん' : ''}`],
  })
  this.say(`だい${c.no}しょう「${c.name}」クリア！ しょうごう「${w.title}」`)
  this.confettiBurst(22)
  this.onSfx('evolve')
  this.shake = Math.max(this.shake, 0.2)
  this.save()
}

/** パネル用：章の一覧と、大軍勢にいどむ ボタンの状態 */
export function roadInfo(this: World) {
  const view = roadView(this.road, this.roadState())
  return { ...view, boss: this.bossStatus() }
}

export function bossStatus(this: World): { can: boolean; label: string; note: string } | null {
  if (this.road.cleared !== BOSS_CHAPTER) return null
  if (this.army?.boss) return { can: false, label: 'たたかい ちゅう！', note: this.army.phase === 'warn' ? `あと ${Math.ceil(this.army.t)}びょうで せめてくる` : `のこり ${this.army.left.length}たい` }
  if (!bossReady(this.road)) return { can: false, label: 'じゅんびちゅう', note: 'うえの じゅんびの もくひょうを たっせいすると いどめる' }
  if (this.vScore < 5) return { can: false, label: 'いどめない', note: 'むらの ある ばしょ（★5いじょう）で いどもう' }
  if (this.army) return { can: false, label: 'いどめない', note: 'いまの てきぐんが おわってから' }
  return { can: true, label: this.road.bossTry ? 'もういちど いどむ' : 'いま いどむ', note: this.bossT > 0 ? `なにも しなければ あと ${this.bossT}びょうで はじまる` : 'おしろと みはりを かためて、よびだそう' }
}

/** 大軍勢をよぶ（パネルのボタン）。よべたら true */
export function challengeBoss(this: World): boolean {
  if (!this.bossStatus()?.can) return false
  this.bossT = -1
  this.callArmy(undefined, true)
  return true
}

/** 出来事を数える（ミッションと実績が使う）。例：`world.stat('wins')` */
export function stat(this: World, key: string, n = 1) {
  if (!STAT_KEY.test(key) || !Number.isFinite(n)) return
  this.counters[key] = Math.min(1e9, (this.counters[key] ?? 0) + n)
}

/** いまの状態の値（ミッションの「〜にする」と実績が見る） */
export function gauges(this: World): Gauges {
  const friends = this.creatures.filter((c) => c.team === 'friend' && c.state !== 'dead')
  const allies = [this.pet, ...friends]
  const fam: Record<string, number> = {}
  let sameFam = 0
  for (const c of allies) {
    const f = familyOf(c.sp.id)
    if (f === 'plain') continue
    fam[f] = (fam[f] ?? 0) + 1
    sameFam = Math.max(sameFam, fam[f])
  }
  const info = this.dexInfo()
  return {
    friends: friends.length, sameFam, dexOwned: info.owned, dexSeen: info.seen, dexTotal: info.all,
    houses3: this.houses.filter((h) => h.level >= 3).length, houses4: this.houses.filter((h) => h.level >= 4).length,
    village: this.vLv, vscore: this.vScore, land: this.land, tier4: allies.filter((c) => c.sp.tier >= 4).length,
    coins: this.coins, streak: this.book.streak, gen: this.stats.gen,
  }
}

export function notify(this: World, title: string, sub: string, color: string) {
  this.notices.push({ title, sub, color })
  if (this.notices.length === 1) this.noticeT = 3.4
}

export function handleBookEvent(this: World, e: BookEvent) {
  if (e.type === 'mission') {
    this.earn(e.coins)
    this.notify('おねがい たっせい！', `${e.text}  コイン+${e.coins}`, '#7cf29b')
    this.say(`おねがい たっせい！ ${e.text} コイン+${e.coins}`)
  } else if (e.type === 'streak') {
    if (e.coins > 0) {
      this.earn(e.coins)
      this.say(`${e.streak}にち れんぞく！ ボーナス コイン+${e.coins}`)
    }
  } else if (e.type === 'allclear') {
    this.stat('allClear')
    this.earn(e.coins)
    this.notify('きょうの おねがい ぜんぶ！', `ボーナス コイン+${e.coins}`, '#ffd23f')
    this.say(`きょうの おねがいを ぜんぶ たっせい！ コイン+${e.coins}`)
  } else {
    this.earn(e.coins)
    this.onSfx('win')
    this.notify('バッジを てにいれた！', `${e.name}  コイン+${e.coins}`, '#ffb3d1')
    this.say(`バッジ「${e.name}」を てにいれた！ コイン+${e.coins}`)
  }
}

export function updateMissions(this: World, dt: number) {
  // コインの出入りを数える（ミッションの「ためる」「つかう」）
  const dc = this.coins - this.coinMark
  if (dc > 0) this.stat('earned', dc)
  else if (dc < 0) this.stat('spent', -dc)
  this.coinMark = this.coins
  if (this.noticeT > 0) {
    this.noticeT -= dt
    if (this.noticeT <= 0) {
      this.notices.shift()
      if (this.notices.length) this.noticeT = 3.4
    }
  }
  this.missionT -= dt
  if (this.missionT > 0) return
  this.missionT = 1
  const now = new Date()
  // 季節：変わったらお知らせして見た目を切り替える
  const season = seasonNow(now)
  if (season !== this.season) this.setSeason(season)
  if (this.book.season !== season) {
    if (this.book.season) {
      this.say(SEASON_INFO[season].msg)
      this.notify(`${SEASON_INFO[season].name}に なった`, SEASON_INFO[season].event, SEASON_INFO[season].color)
    }
    this.book.season = season
  }
  if (!this.counters[`seen_${season}`]) this.counters[`seen_${season}`] = 1
  const g = this.gauges()
  const evs = [...this.book.tick(now, this.counters, g), ...this.book.checkBadges(this.counters, g)]
  if (!evs.length) return
  for (const e of evs) this.handleBookEvent(e)
  // ごほうびはミッションの「ためる」に数えない
  this.coinMark = this.coins
  this.save()
}

/** パネル用：きょうのミッション・連続日数・季節・バッジ */
export function missionInfo(this: World) {
  const g = this.gauges()
  const b = this.book
  return {
    day: b.day,
    streak: b.streak,
    allDone: b.allDone,
    allClearBonus: ALL_CLEAR_BONUS,
    season: this.season,
    seasonName: SEASON_INFO[this.season].name,
    seasonEvent: SEASON_INFO[this.season].event,
    missions: b.missions.map((m, i) => ({
      text: missionText(m), diff: DIFF_NAME[m.diff], diffIndex: m.diff, target: m.target,
      value: b.progress(i, this.counters, g), done: b.done[i],
      reward: [20, 40, 80][m.diff],
    })),
    badges: ACHIEVEMENTS.map((a) => ({ id: a.id, name: a.name, desc: a.desc, coins: a.coins, got: !!b.badges[a.id] })),
    seasons: SEASONS.map((k) => ({ id: k, name: SEASON_INFO[k].name, event: SEASON_INFO[k].event, seen: (this.counters[`seen_${k}`] ?? 0) > 0 })),
  }
}

/** 敵軍をよぶ（村がある程度育つと自分でも来る）。n = 敵の数 */
export function callArmy(this: World, n?: number, boss = false) {
  if (this.army) return
  this.armyWave++
  this.calcVillage()
  const castle = this.structs.some((b) => b.stage === this.stageIndex && b.kind === 'castle')
  const big = boss ? 15 + Math.min(5, Math.floor(this.vScore / 6)) : 0
  // とうだいがあると はやく気づける（水べなら さらに長い）
  const lh = this.lighthouse()
  this.army = { phase: 'warn', t: (boss ? 25 : 18) + (lh ? (lh.water ? 16 : 10) : 0), left: [], n: n ?? (boss ? big : Math.min(12, 3 + Math.floor(this.vScore * 0.7))), castle, wave: this.armyWave, boss }
  if (this.festival) this.endFestival(true)
  this.say(boss ? 'だいぐんぜいが ちかづいている…！ きたと ひがしから くるぞ' : lh ? 'とうだいが てきぐんを みつけた！ そなえよう' : 'てきぐんが ちかづいている…！ そなえよう')
  this.onSfx('alarm')
  this.shake = Math.max(this.shake, 0.3)
}

export function launchArmy(this: World, a: Army) {
  if (a.boss) return this.launchBoss(a)
  a.phase = 'on'
  a.t = 150
  const mult = 1 + 0.15 * (a.wave - 1)
  for (let i = 0; i < a.n; i++) {
    const boss = i === 0 && a.wave % 3 === 0
    // 編成：ふつうの兵は もとの敵 + そのステージの亜種、3 回に 1 回は専用の姿のボス
    const id: SpeciesId = boss ? armyBoss(this.stageIndex, a.wave) : armyMember(this.stageIndex, a.wave)
    const x = THREE.MathUtils.clamp((Math.random() * 2 - 1) * (HALF - 1), -HALF, HALF)
    const z = -HALF + 0.6 + Math.random() * 1.2
    const c = this.spawn(id, 'wild', x, z)
    c.army = true
    c.maxHp = Math.round(c.sp.hp * mult * (boss ? 2.5 : 1))
    c.hp = c.maxHp
    c.atk = c.sp.atk * mult * (boss ? 1.4 : 1)
    if (boss) {
      this.ring(x, z, '#ff7a2a', 3.4, 1)
      this.popups.push({ pos: new THREE.Vector3(x, this.size(c) + 0.6, z), text: `ボス ${c.sp.name}！`, color: '#ff7a2a', t: 0, big: true })
      BOSSES.add(c)
    }
    this.setState(c, 'march', 8)
    a.left.push(c)
  }
  const bossName = a.left.find((c) => c.sp.boss)?.sp.name
  this.say(`てきぐん ${a.n}たいが せめてきた！${bossName ? ` ボス ${bossName}もいる！` : ''}`)
  this.onSfx(bossName ? 'boss' : 'boom')
  this.shake = Math.max(this.shake, 0.4)
}

export function updateArmy(this: World, dt: number) {
  const a = this.army
  if (!a) {
    this.armyCd -= dt
    if (this.armyCd <= 0) {
      if (this.vScore >= 5 && this.alive(this.pet) && !this.calm) this.callArmy()
      else this.armyCd = 40
    }
    return
  }
  a.t -= dt
  if (a.phase === 'warn') {
    if (a.t <= 0) this.launchArmy(a)
    return
  }
  a.left = a.left.filter((c) => this.creatures.includes(c) && c.state !== 'dead')
  if (a.boss && this.updateBoss(a)) return
  for (const c of a.left) {
    c.energy = Math.max(c.energy, 60)
    c.hunger = Math.max(c.hunger, 50)
  }
  if (!a.left.length) {
    const reward = 20 + a.n * 5 + (a.castle && this.structs.some((b) => b.kind === 'castle' && b.stage === this.stageIndex) ? 20 : 0)
    this.stat('armies')
    this.say(`てきぐんを おいはらった！ コイン+${reward}`)
    this.road.wins++
    this.earn(reward)
    this.onSfx('victory')
    for (let i = 0; i < 3; i++) this.spawnResource(undefined, undefined, undefined, true)
    this.army = null
    this.armyCd = 200 + Math.random() * 60
  } else if (a.t <= 0) {
    for (const c of a.left) this.setState(c, 'dead', 0.8)
    this.say('てきぐんは ひきあげていった')
    this.army = null
    this.armyCd = 200 + Math.random() * 60
  }
}

// ---- 大軍勢（最終章のボス戦）----
/** 北と東から、数が多くて強い敵軍。さいしょの 1 体が大ボス（ノイズの おう） */
export function launchBoss(this: World, a: Army) {
  a.phase = 'on'
  a.t = 240
  const mult = Math.max(1.5, 1 + 0.15 * (a.wave - 1))
  for (let i = 0; i < a.n; i++) {
    const king = i === 0
    const elite = !king && i < 4
    const r = Math.random()
    const id: SpeciesId = king || elite ? 'gougan' : r < 0.55 ? 'noiz' : 'togebug'
    const east = !king && i % 2 === 1
    const x = east ? HALF - 0.6 - Math.random() * 1.2 : king ? 0 : THREE.MathUtils.clamp((Math.random() * 2 - 1) * (HALF - 1), -HALF, HALF)
    const z = east ? THREE.MathUtils.clamp((Math.random() * 2 - 1) * (HALF - 2), -HALF, HALF) : -HALF + 0.6 + Math.random() * 1.2
    const c = this.spawn(id, 'wild', x, z)
    c.army = true
    c.boss = king
    c.maxHp = Math.round(c.sp.hp * mult * (king ? 7 : elite ? 1.4 : 1))
    c.hp = c.maxHp
    c.atk = c.sp.atk * mult * (king ? 1.5 : elite ? 1.1 : 1)
    c.anim.setHeight(this.size(c))
    if (king) {
      this.ring(x, z, '#ff3a3a', 4.2, 1.2)
      this.popups.push({ pos: new THREE.Vector3(x, this.size(c) + 0.6, z), text: 'ノイズの おう！', color: '#ff5a5a', t: 0, big: true })
    }
    this.setState(c, 'march', 8)
    a.left.push(c)
  }
  this.say(`だいぐんぜい ${a.n}たい！ ノイズの おうが あらわれた！`)
  this.onSfx('boom')
  this.shake = Math.max(this.shake, 0.6)
}

/** 大軍勢の勝ち負け。おうを たおせば勝ち（のこりは にげる）。おしろが おちる・時間切れで負け（ペナルティは軽い）。扱ったら true */
export function updateBoss(this: World, a: Army): boolean {
  const castleLost = a.castle && !this.structs.some((b) => b.stage === this.stageIndex && b.kind === 'castle')
  const kingDown = !a.left.some((c) => c.boss)
  if (kingDown || castleLost || a.t <= 0) for (const c of a.left) this.setState(c, 'dead', 0.8)
  if (kingDown) {
    const reward = 100 + a.n * 5
    this.say(`ノイズの おうを たおした！ コイン+${reward}`)
    this.earn(reward)
    this.onSfx('win')
    this.shake = Math.max(this.shake, 0.5)
    for (let i = 0; i < 4; i++) this.spawnResource(undefined, undefined, undefined, true)
    this.road.wins++
    this.road.bossWins++
    this.army = null
    this.armyCd = 240
    return true
  }
  if (castleLost || a.t <= 0) {
    const lost = Math.min(40, Math.floor(this.coins * 0.1))
    this.coins -= lost
    this.road.bossTry++
    this.say(castleLost ? 'おしろが おちた… でも あきらめない！ もういちど いどもう' : 'だいぐんぜいは ひいていった… もういちど いどもう')
    this.onSfx('lose')
    this.army = null
    this.armyCd = 240
    return true
  }
  return false
}

export function spawnResource(this: World, x?: number, z?: number, want?: ResKind, force = false) {
  if (this.resources.length >= MAX_RES + (force ? 8 : 0)) return
  const kind: ResKind = want ?? (Math.random() < 0.55 ? 'wood' : 'stone')
  if (x === undefined || z === undefined) {
    // 木や岩のそばに落ちている
    const land = this.stage.obstacles.filter((o) => !o.water)
    const o = land[Math.floor(Math.random() * land.length)]
    if (!o) return
    const a = Math.random() * Math.PI * 2
    x = o.x + Math.cos(a) * (o.r + 0.6 + Math.random() * 0.7)
    z = o.z + Math.sin(a) * (o.r + 0.6 + Math.random() * 0.7)
  }
  x = THREE.MathUtils.clamp(x, -HALF, HALF)
  z = THREE.MathUtils.clamp(z, -HALF, HALF)
  if (!force && this.obstacles().some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.2)) return
  const mesh =
    kind === 'wood'
      ? new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.5, 6).rotateZ(Math.PI / 2), this.lam('#8a5a34', { map: Tex.bark() }))
      : new THREE.Mesh(new THREE.DodecahedronGeometry(0.15, 0), this.lam('#9aa1ab', { map: Tex.rock() }))
  mesh.position.set(x, this.stage.heightAt(x, z) + 0.08, z)
  mesh.rotation.y = Math.random() * Math.PI
  this.scene.add(mesh)
  this.resources.push({ kind, x, z, mesh, taken: null })
}

export function updateResources(this: World, dt: number) {
  this.resT += dt
  if (this.resT > (this.structs.some((b) => b.stage === this.stageIndex && b.mats < STRUCTS[b.kind].need) ? 3.2 : 6)) {
    this.resT = 0
    this.spawnResource()
  }
}

/** 運んでいた資材をその場に落とす（落とした物はまた拾える） */
export function dropCarry(this: World, c: Creature, leave: boolean) {
  if (!c.carryMesh) {
    c.carry = null
    return
  }
  this.scene.remove(c.carryMesh)
  if (leave && c.carry && this.resources.length < MAX_RES) {
    c.carryMesh.scale.setScalar(1)
    c.carryMesh.position.set(c.x, this.stage.heightAt(c.x, c.z) + 0.08, c.z)
    this.scene.add(c.carryMesh)
    this.resources.push({ kind: c.carry, x: c.x, z: c.z, mesh: c.carryMesh, taken: null })
  } else {
    c.carryMesh.geometry.dispose()
    ;(c.carryMesh.material as THREE.Material).dispose()
  }
  c.carry = null
  c.carryMesh = null
}

export function pickWeather(this: World): Weather {
  const w = WEATHER_W[this.stageIndex] ?? WEATHER_W[0]
  const list = (Object.keys(w) as Weather[]).filter((k) => k !== this.weather || Math.random() < 0.3)
  const sw = SEASON_WEATHER[this.season]
  const wt = (k: Weather) => (w[k] ?? 0) * (sw[k] ?? 1)
  const total = list.reduce((a, k) => a + wt(k), 0)
  let r = Math.random() * total
  for (const k of list) {
    r -= wt(k)
    if (r <= 0) return k
  }
  return 'sun'
}

export function setWeather(this: World, w: Weather, quiet = false) {
  const changed = w !== this.weather
  if (changed && !quiet && this.weather === 'rain') this.secret.rainEnd = this.time
  // 雨あがりににじ（まだ雨がのこっている間に はれた時）
  if (changed && this.weather === 'rain' && w === 'sun' && this.wx.rain > 0.3 && this.night < 0.5) {
    this.wx.bowT = BOW_LEN
    // にじは、そのとき見ている向きに かかる
    const d = this.camera.getWorldDirection(new THREE.Vector3())
    const h = Math.hypot(d.x, d.z)
    fxU.uBowDir.value.set(h > 0.2 ? d.x / h : 0, 0, h > 0.2 ? d.z / h : -1)
    if (!quiet) this.after(2.5, () => this.say('にじが かかった！'))
  }
  this.weather = w
  this.weatherT = 60 + Math.random() * 90
  // ステージを切りかえた時は、粒と空を すぐ今の天気に合わせる（ワープの画面のゆがみでかくれる）
  if (quiet) {
    const T = WX[w]
    Object.assign(this.wx, { rain: T.rain, snow: T.snow, ember: T.ember, wind: T.wind, cloud: T.cloud, grey: T.grey, mist: Math.max(T.mist, this.morning ? 0.85 : 0) })
  }
  if (changed && !quiet) this.say(WEATHER_MSG[w])
}

/** 朝はもやが出る（main.ts が時間帯を渡す） */
export function setDayPart(this: World, part: string) {
  this.morning = part === 'morning'
}

/** 画質。低 = 雨・雪・火の粉を減らし、雲の影・水たまり・波紋・風のゆれ・もや・熱のゆらぎ・水面のきらめきを切る */
export function setQuality(this: World, q: 'high' | 'low') {
  this.high = q === 'high'
  fxU.uHigh.value = this.high ? 1 : 0
  this.wfx.setQuality(this.high)
  fxLod(this.stage.group, this.high)
  this.setItemQuality(q)
}

export function updateWeather(this: World, dt: number) {
  this.weatherT -= dt
  if (this.weatherT <= 0) this.setWeather(this.pickWeather())
  const target = { sun: 1, cloud: 0.72, rain: 0.6, snow: 0.86, ember: 0.78 }[this.weather]
  this.weatherDim += (target - this.weatherDim) * Math.min(1, dt * 0.8)

  // 天気の強さを目標へ なめらかに（約 4 秒で入れかわる）
  const T = WX[this.weather]
  const wx = this.wx
  const k = 1 - Math.exp(-dt * 0.7)
  wx.rain += (T.rain - wx.rain) * k
  wx.snow += (T.snow - wx.snow) * k
  wx.ember += (T.ember - wx.ember) * k
  wx.wind += (T.wind - wx.wind) * k * 0.6
  wx.cloud += (T.cloud - wx.cloud) * k * 0.5
  wx.grey += (T.grey - wx.grey) * k * 0.5
  wx.mist += (Math.max(T.mist, this.morning ? 0.85 : 0) - wx.mist) * k * 0.4
  // ぬれ：雨で上がり、止むとゆっくりかわく / 雪：降るほど積もり、止むと溶ける（ひのこ・はれは早い）
  wx.wet = THREE.MathUtils.clamp(wx.wet + (this.weather === 'rain' ? dt / 14 : this.weather === 'ember' ? -dt / 25 : -dt / 70), 0, 1)
  const melt = this.weather === 'ember' ? 22 : this.weather === 'sun' ? 50 : 80
  wx.cover = THREE.MathUtils.clamp(wx.cover + (this.weather === 'snow' ? (dt / 80) * wx.snow : -dt / melt), 0, 1)
  // にじ（出て、しばらくして消える）
  if (wx.bowT > 0) {
    wx.bowT = Math.max(0, wx.bowT - dt)
    wx.bow = Math.pow(Math.sin(Math.PI * (1 - wx.bowT / BOW_LEN)), 0.6)
  } else wx.bow = 0

  // 共通の uniform（地形・木・水・空のシェーダーが読む）
  const ang = 0.55 + Math.sin(this.time * 0.04) * 0.5
  fxU.uWindDir.value.set(Math.cos(ang), Math.sin(ang))
  fxU.uDrift.value.addScaledVector(fxU.uWindDir.value, (0.18 + wx.wind * 0.5) * dt)
  fxU.uTime.value = this.time
  fxU.uWind.value = wx.wind
  fxU.uWet.value = wx.wet
  fxU.uRain.value = wx.rain
  fxU.uSnow.value = wx.cover
  fxU.uCloud.value = wx.cloud * (1 - this.night) * (1 - wx.grey * 0.6)
  fxU.uNight.value = this.night
  fxU.uGlint.value = (1 - this.night * 0.5) * Math.max(0, 1 - wx.grey * 1.15)
  fxU.uGrey.value = wx.grey
  fxU.uEmber.value = wx.ember
  fxU.uBow.value = wx.bow
  this.post.uniforms.heat.value = this.high ? wx.ember : 0
  const fog = this.scene.fog as THREE.Fog
  this.wfx.update(this.look, this.stage.heightAt(this.look.x, this.look.z), { rain: wx.rain, snow: wx.snow, ember: wx.ember, mist: wx.mist }, fog.color)
}

export function noteEaten(this: World, c: Creature, kind: FoodKind) {
  const e = this.eatenOf.get(c) ?? {}
  e[kind] = Math.min(999, (e[kind] ?? 0) + 1)
  this.eatenOf.set(c, e)
}

/** 水ぞくの池の半径（はしが かかっている池） */
export function bridgeSpan(this: World, b: Struct) {
  const o = this.stage.obstacles.find((q) => q.water && Math.hypot(b.x - q.x, b.z - q.z) < 0.7)
  return o ? o.r : 1.5
}

/** 進化の瞬間（とヒントの判定）の まわりのようす */
export function secretCtx(this: World, c: Creature, top?: Care): SecretCtx {
  const care = this.careOf(c)
  const t: Care = top ?? (['power', 'guard', 'spirit'] as Care[]).sort((a, b) => care[b] + (c !== this.pet && c.bias === b ? 3 : 0) - (care[a] + (c !== this.pet && c.bias === a ? 3 : 0)))[0]
  const here = (b: Struct) => b.stage === this.stageIndex && this.structDone(b)
  const st = (k: StructKind, r: number) => this.structs.some((b) => b.kind === k && here(b) && Math.hypot(b.x - c.x, b.z - c.z) < r)
  const fam = familyOf(c.sp.id)
  return {
    isPet: c === this.pet,
    night: this.night > 0.55,
    weather: this.weather,
    rainedLately: this.time - this.secret.rainEnd < 120,
    stage: this.stageIndex,
    gen: this.stats.gen,
    coins: this.coins,
    mood: this.stats.mood,
    role: c.role,
    top: t,
    eaten: this.eatenOf.get(c) ?? {},
    homeLv: this.homeOf(c)?.level ?? 0,
    kin: this.creatures.filter((o) => o !== c && this.ally(o) && this.alive(o) && familyOf(o.sp.id) === fam && Math.hypot(o.x - c.x, o.z - c.z) < 6).length,
    village: this.vLv,
    near: {
      tower: st('tower', 8),
      castle: st('castle', 8),
      bridge: this.structs.some((b) => b.kind === 'bridge' && here(b) && Math.hypot(b.x - c.x, b.z - c.z) < this.bridgeSpan(b) + 3),
      farm: st('farm', 6),
      fire: this.nearItem('fire', c.x, c.z, 5),
      memorial: this.nearItem('memorial', c.x, c.z, 4),
      tools: this.nearItem('tools', c.x, c.z, 6),
      water: this.stage.obstacles.some((o) => o.water && Math.hypot(o.x - c.x, o.z - c.z) < o.r + 2.5),
    },
  }
}

/** 条件がそろった 隠しの姿（仲間だけ。ペットは必ず、ほかの子は 8 割） */
export function pickSecret(this: World, c: Creature, top: Care): SpeciesId | null {
  if (!this.ally(c)) return null
  const f = secretForm(familyOf(c.sp.id), c.sp.tier, this.secretCtx(c, top))
  if (!f) return null
  if (c !== this.pet && Math.random() > 0.8) return null
  return f.id
}

/** 隠しの姿に進化した時の 大きな演出 */
export function foundSecretForm(this: World, c: Creature) {
  const f = secretById(c.sp.id)
  if (!f) return
  const first = !this.secret.forms.has(f.id)
  this.secret.forms.add(f.id)
  this.secret.hints[f.id] = 0x87
  const y = this.ground(c) + 0.8
  this.flash = 1
  this.shake = Math.max(this.shake, 0.3)
  this.ring(c.x, c.z, '#ffd23f', 5, 1.2)
  this.after(0.25, () => this.ring(c.x, c.z, '#ffffff', 7, 1.4))
  this.after(0.5, () => this.ring(c.x, c.z, '#ff9ecb', 9, 1.6))
  this.burst(c.x, y, c.z, 'spark', 40, 5, 3)
  this.burst(c.x, y, c.z, 'coin', 12, 4, 6)
  this.glow(c.x, y, c.z, '#ffd23f', 18, { life: 2.4, spread: 2.2, rise: 1.2 })
  this.onSfx('win')
  this.after(0.4, () => this.onSfx('evolve'))
  this.say(`ひみつの すがた！ ${f.name}に しんかした！`)
  this.say(f.story)
  this.secret.card = { title: first ? '★ ひみつの すがた はっけん！' : '★ ひみつの すがた', sub: `${f.name}　${f.kind}`, t: 5 }
  if (first) this.earn(c === this.pet ? 200 : 120)
  this.save()
}

/** ふわふわ漂う光の粒（ほたる・花びら・オーロラなど）。grav 0 でゆっくり動く */
export function glow(this: World, x: number, y: number, z: number, color: string, n: number, o: { life: number; spread: number; rise: number; size?: number; fall?: number }) {
  for (let i = 0; i < n; i++) {
    if (this.fx.length > 230) return
    const a = new SpriteAnim(this.orb(color), (o.size ?? 0.16) * (0.7 + Math.random() * 0.6))
    a.sprite.center.set(0.5, 0.5)
    const ang = Math.random() * Math.PI * 2
    const d = Math.random() * o.spread
    a.sprite.position.set(x + Math.cos(ang) * d, y + Math.random() * 0.6, z + Math.sin(ang) * d)
    this.scene.add(a.sprite)
    const life = o.life * (0.7 + Math.random() * 0.6)
    this.fx.push({ sprite: a.sprite, vx: (Math.random() - 0.5) * 0.5, vz: (Math.random() - 0.5) * 0.5, vy: o.rise * (0.3 + Math.random() * 0.7), life, max: life, grav: o.fall ?? 0 })
  }
}

/** 1 秒に 1 回：ヒントの進み具合と、ひみつのできごとの判定 */
export function updateSecrets(this: World) {
  const s = this.secret
  // ヒント：この系統の成長期・成熟期の仲間が、いま条件のどれかを満たしていれば その行が増える
  for (const c of this.creatures) {
    if (!this.ally(c) || c.grow > 0 || c.sp.tier < 2 || c.sp.tier > 3 || !this.alive(c)) continue
    const fam = familyOf(c.sp.id)
    if (fam === 'plain') continue
    for (const [id, mask] of hintMask(fam, this.secretCtx(c))) {
      const cur = s.hints[id] ?? 0
      if ((cur | mask) !== cur) {
        s.hints[id] = cur | mask
        if (cur !== 0 && !s.forms.has(id)) this.say('なにか ありそうな きがする… （ずかんの ひみつ）')
      }
    }
  }
  if (this.eventsLeft() === 0) return
  // できごと
  const ctx = this.eventCtx()
  for (const e of SECRET_EVENTS) {
    if (s.events.has(e.id)) continue
    s.evT[e.id] = e.test(ctx) ? (s.evT[e.id] ?? 0) + 1 : 0
    if (s.evT[e.id] >= e.dwell) this.foundEvent(e)
  }
}

export function eventsLeft(this: World) {
  return SECRET_EVENTS.length - this.secret.events.size
}

export function eventCtx(this: World): EventCtx {
  const al = this.creatures.filter((c) => this.ally(c) && this.alive(c) && !c.army)
  const here = <T extends { stage: number }>(a: T[]) => a.filter((x) => x.stage === this.stageIndex)
  const fires = here(this.items).filter((it) => it.kind === 'fire' && it.mesh)
  const mem = here(this.items).filter((it) => it.kind === 'memorial' && it.mesh)
  const done = (k: StructKind) => here(this.structs).filter((b) => b.kind === k && this.structDone(b))
  const castles = done('castle')
  const cradles = done('cradle')
  const bridges = done('bridge')
  const within = (c: Creature, p: { x: number; z: number }, r: number) => Math.hypot(p.x - c.x, p.z - c.z) < r
  const birds = al.filter((c) => familyOf(c.sp.id) === 'bird')
  return {
    night: this.night > 0.55,
    weather: this.weather,
    stage: this.stageIndex,
    gen: this.stats.gen,
    village: this.vLv,
    allies: al.length,
    nearFire: al.filter((c) => fires.some((f) => within(c, f, 5))).length,
    fires: fires.length,
    onBridge: al.filter((c) => bridges.some((b) => within(c, b, Math.max(1.2, this.bridgeSpan(b) * 0.9)))).length,
    petAtMemorial: this.alive(this.pet) && mem.some((m) => within(this.pet, m, 3)),
    atCastle: al.filter((c) => castles.some((b) => within(c, b, 4.5))).length,
    castles: castles.length,
    trees: here(this.items).filter((it) => it.kind === 'sapling' && it.grow >= 1).length,
    waterAwake: al.filter((c) => familyOf(c.sp.id) === 'water' && c.state !== 'sleep' && c.state !== 'rest' && c.sp.tier > 0).length,
    sleepCradle: al.filter((c) => c.state === 'sleep' && cradles.some((b) => within(c, b, 5))).length,
    cradles: cradles.length,
    birds: Math.max(0, ...birds.map((c) => birds.filter((o) => within(o, c, 5)).length)),
    inside: al.filter((c) => c.inside).length,
  }
}

/** できごとが起きた：札・メッセージ・コイン・演出 */
export function foundEvent(this: World, e: SecretEvent) {
  this.secret.events.add(e.id)
  const al = this.creatures.filter((c) => this.ally(c) && this.alive(c))
  const pet = this.pet
  this.playEventFx(e.fx, al)
  this.say(e.msg)
  this.secret.card = { title: '★ ひみつを みつけた！', sub: `${e.name}　コイン+${e.reward}`, t: 5 }
  this.flash = Math.max(this.flash, 0.55)
  this.earn(e.reward, pet.x, pet.z)
  this.onSfx('win')
  this.save()
}

export function playEventFx(this: World, fx: EventFx, al: Creature[]) {
  const p = this.pet
  const find = <T extends { stage: number; x: number; z: number }>(a: T[], pred: (x: T) => boolean = () => true) => a.find((x) => x.stage === this.stageIndex && pred(x))
  const at = (o: { x: number; z: number } | undefined) => o ?? { x: p.x, z: p.z }
  const gy = (o: { x: number; z: number }) => this.stage.heightAt(o.x, o.z)
  switch (fx) {
    case 'hotaru': {
      const f = at(find(this.items, (it) => it.kind === 'fire'))
      for (let k = 0; k < 10; k++) this.after(k * 0.8, () => this.glow(f.x, gy(f) + 0.5, f.z, k % 2 ? '#e8ff7a' : '#b8ff9a', 7, { life: 7, spread: 4, rise: 0.35, size: 0.14 }))
      this.ring(f.x, f.z, '#e8ff7a', 6, 2)
      break
    }
    case 'rainbow': {
      const b = at(find(this.structs, (s) => s.kind === 'bridge'))
      this.rainbow(b.x, b.z)
      this.burst(b.x, gy(b) + 1, b.z, 'spark', 14, 3, 2)
      break
    }
    case 'meteor': {
      const m = at(find(this.items, (it) => it.kind === 'memorial'))
      for (let k = 0; k < 14; k++)
        this.after(k * 0.35, () => {
          const sx = m.x - 4 + Math.random() * 8
          const sz = m.z - 4 + Math.random() * 8
          const a = new SpriteAnim(this.fxSheets.spark, 0.3)
          a.sprite.center.set(0.5, 0.5)
          a.sprite.position.set(sx + 3, 9, sz)
          this.scene.add(a.sprite)
          this.fx.push({ sprite: a.sprite, vx: -5, vy: -6.5, vz: 0, life: 1.3, max: 1.3, grav: 0 })
          this.glow(sx + 1.5, 6, sz, '#fff6c0', 3, { life: 0.9, spread: 1.2, rise: -1, size: 0.1 })
        })
      this.ring(m.x, m.z, '#ffe27a', 5, 2.4)
      break
    }
    case 'confetti': {
      const c = at(find(this.structs, (s) => s.kind === 'castle'))
      for (let k = 0; k < 8; k++)
        this.after(k * 0.3, () => {
          for (const col of ['#ff5e7a', '#ffd23f', '#6fe7ff', '#7cf29b', '#c9a8ff']) this.colorBurst(c.x + (Math.random() - 0.5) * 3, gy(c) + 2.5, c.z + 1 + Math.random(), col, 3, 2.6)
          this.burst(c.x, gy(c) + 1.5, c.z + 1.5, 'coin', 3, 3)
        })
      this.ring(c.x, c.z + 1.5, '#ffd23f', 6, 1.6)
      for (const a of al) if (Math.hypot(a.x - c.x, a.z - c.z) < 4.5) this.setState(a, 'happy', 2.5)
      break
    }
    case 'petals': {
      for (const it of this.items) if (it.stage === this.stageIndex && it.kind === 'sapling' && it.grow >= 1) {
        for (let k = 0; k < 5; k++) this.after(k * 0.9, () => this.glow(it.x, gy(it) + 2, it.z, k % 2 ? '#ffb8d8' : '#ffffff', 5, { life: 4, spread: 1.4, rise: -0.1, size: 0.13, fall: 0.18 }))
        this.burst(it.x, gy(it) + 1.6, it.z, 'heart', 3, 1.2, 1.2)
      }
      break
    }
    case 'dance': {
      const cols = ['#6fe7ff', '#a8fff0', '#ff9ecb', '#ffe27a']
      al.filter((c) => familyOf(c.sp.id) === 'water').forEach((c, i) => {
        this.setState(c, 'happy', 6)
        this.after(i * 0.3, () => this.ring(c.x, c.z, cols[i % cols.length], 3.5, 1.4))
        for (let k = 0; k < 4; k++) this.after(k * 1.1 + i * 0.2, () => this.burst(c.x, this.ground(c) + this.size(c), c.z, 'heart', 2, 1.5))
        this.glow(c.x, this.ground(c) + 0.4, c.z, '#a8fff0', 8, { life: 4, spread: 1.4, rise: 0.5 })
      })
      break
    }
    case 'egg': {
      const cr = at(find(this.structs, (s) => s.kind === 'cradle'))
      if (this.eggs.length < 6) this.layEgg(cr.x + 0.9, cr.z + 0.9, [], 30, this.stageEggKind(), true)
      this.glow(cr.x, gy(cr) + 0.8, cr.z, '#fff6c0', 14, { life: 3.5, spread: 2, rise: 0.6 })
      this.ring(cr.x, cr.z, '#fff6c0', 5, 1.8)
      break
    }
    case 'aurora': {
      const cols = ['#7cf29b', '#5ef2ff', '#b48cff', '#ff9ecb', '#7cf29b']
      cols.forEach((col, i) => {
        this.after(i * 1.2, () => this.ring(p.x, p.z, col, 12 + i * 2, 3.5))
        for (let k = 0; k < 6; k++) this.after(i * 1.2 + k * 0.5, () => this.glow(p.x - 5 + k * 2, 5 + i * 0.5, p.z - 3, col, 5, { life: 5, spread: 1.5, rise: 0.15, size: 0.3 }))
      })
      this.flash = 0.8
      break
    }
    case 'chorus': {
      const birds = al.filter((c) => familyOf(c.sp.id) === 'bird')
      birds.forEach((c, i) => {
        this.setState(c, 'happy', 4)
        for (let k = 0; k < 5; k++) this.after(k * 0.7 + i * 0.15, () => {
          this.burst(c.x, this.ground(c) + this.size(c) + 0.3, c.z, 'spark', 2, 1.4, 1)
          this.popups.push({ pos: new THREE.Vector3(c.x, this.ground(c) + this.size(c) + 0.5, c.z), text: k % 2 ? 'ぴよ' : 'ちゅん', color: '#ffe27a', t: 0 })
        })
      })
      break
    }
    case 'festival': {
      al.forEach((c, i) => {
        this.setState(c, 'happy', 5)
        this.after(i * 0.15, () => {
          c.vy = 4
          this.colorBurst(c.x, this.ground(c) + 1, c.z, ['#ff5e7a', '#ffd23f', '#6fe7ff', '#7cf29b'][i % 4], 4, 3)
        })
      })
      for (let k = 0; k < 8; k++) this.after(k * 0.4, () => this.burst(p.x + (Math.random() - 0.5) * 6, 3, p.z + (Math.random() - 0.5) * 6, 'coin', 4, 2.5, 5))
      this.ring(p.x, p.z, '#ffd23f', 9, 2)
      break
    }
    case 'cozy': {
      for (const h of this.houses) if (h.stage === this.stageIndex && h.level >= 1) {
        this.glow(h.x, this.stage.heightAt(h.x, h.z) + 1.2, h.z, '#ffd8a8', 8, { life: 5, spread: 0.8, rise: 0.4 })
        this.burst(h.x, this.stage.heightAt(h.x, h.z) + 1.4, h.z, 'heart', 3, 1)
      }
      break
    }
  }
}

/** にじ：かたむけた半円のおび（7 色）。ゆっくり現れて、しばらくして消える */
export function rainbow(this: World, x: number, z: number) {
  const geo = new THREE.RingGeometry(3.2, 4.4, 40, 7, 0, Math.PI)
  const cols = ['#ff4d4d', '#ff9a3d', '#ffe03d', '#6be86b', '#4dc8ff', '#5a6cff', '#b45aff', '#b45aff'].map((c) => new THREE.Color(c))
  const n = geo.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const j = Math.floor(i / 41)
    arr.set([cols[Math.min(j, 7)].r, cols[Math.min(j, 7)].g, cols[Math.min(j, 7)].b], i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }))
  const cx = this.camera.position.x
  const cz = this.camera.position.z
  const dir = Math.atan2(cx - x, cz - z)
  // カメラから見て、はしの うしろに立てる
  mesh.position.set(x - Math.sin(dir) * 2.5, this.stage.heightAt(x, z) + 0.05, z - Math.cos(dir) * 2.5)
  mesh.rotation.set(-0.28, dir, 0)
  this.scene.add(mesh)
  this.secretMeshes.push({ obj: mesh, t: 0, dur: 14, hold: 0.6 })
}

/** 毎フレーム：にじの出入り・札のタイマー */
export function updateSecretFx(this: World, dt: number) {
  for (const m of [...this.secretMeshes]) {
    m.t += dt
    const k = m.t / m.dur
    const a = k < 0.12 ? k / 0.12 : k > 0.8 ? Math.max(0, (1 - k) / 0.2) : 1
    ;(m.obj.material as THREE.MeshBasicMaterial).opacity = a * m.hold
    if (k >= 1) {
      this.scene.remove(m.obj)
      m.obj.geometry.dispose()
      ;(m.obj.material as THREE.Material).dispose()
      this.secretMeshes.splice(this.secretMeshes.indexOf(m), 1)
    }
  }
  if (this.secret.card) {
    this.secret.card.t -= dt
    if (this.secret.card.t <= 0) this.secret.card = null
  }
}

/** 札：ひみつを みつけた時に 画面の上に出る */
export function drawSecretCard(this: World) {
  const k = this.secret.card
  if (!k) return
  const age = 5 - k.t
  const y = Math.round(64 - Math.max(0, 1 - age * 4) * 60 - Math.max(0, 0.5 - k.t) * 120)
  this.win(24, y, RES.w - 48, 40)
  const g = this.hudCtx
  g.strokeStyle = '#ffd23f'
  g.strokeRect(25.5, y + 1.5, RES.w - 51, 37)
  this.text(k.title, RES.w / 2, y + 7, '#ffd23f', 11, 'center')
  this.text(k.sub, RES.w / 2, y + 23, '#ffffff', 10, 'center')
}

/** ずかんの「ひみつ」欄に出す 情報 */
export function secretInfo(this: World) {
  const forms = SECRET_FORMS.map((s) => {
    const found = this.secret.forms.has(s.id)
    const mask = this.secret.hints[s.id] ?? 0
    return {
      id: s.id, name: s.name, kind: s.kind, family: FAMILY_NAME[s.family], found,
      lines: hintLines(s, mask, found),
      known: s.conds.filter((_, i) => mask & (1 << i)).length,
      total: s.conds.length,
      story: found ? s.story : '',
    }
  })
  const events = SECRET_EVENTS.map((e) => {
    const found = this.secret.events.has(e.id)
    return { id: e.id, name: found ? e.name : '？？？', found, text: found ? e.msg : e.riddle }
  })
  return { forms, events, formsFound: forms.filter((f) => f.found).length, eventsFound: events.filter((e) => e.found).length }
}

export function saveSecrets(this: World, friends: Creature[]) {
  const s = this.secret
  return {
    forms: [...s.forms], events: [...s.events], hints: s.hints,
    eaten: { pet: this.eatenOf.get(this.pet) ?? {}, friends: friends.map((c) => this.eatenOf.get(c) ?? {}) },
  }
}

/** 読み込み：ID は表と照合、数字は範囲に収める */
export function loadSecrets(this: World, d: any, friends: Creature[], savedFriends: unknown[]) {
  const s = this.secret
  const o = d && typeof d === 'object' ? d : {}
  s.forms = new Set((Array.isArray(o.forms) ? o.forms : []).filter(isSecretId).slice(0, 40))
  s.events = new Set((Array.isArray(o.events) ? o.events : []).filter((v: unknown): v is string => typeof v === 'string' && EVENT_IDS.has(v)).slice(0, 60))
  s.hints = {}
  if (o.hints && typeof o.hints === 'object' && !Array.isArray(o.hints))
    for (const [k, v] of Object.entries(o.hints)) if (isSecretId(k)) s.hints[k] = Math.round(num(v, 0, 255, 0)) & 0x87
  const clean = (v: unknown) => {
    const r: Record<string, number> = {}
    if (v && typeof v === 'object' && !Array.isArray(v)) for (const k of EAT_KEYS) r[k] = Math.round(num((v as Record<string, unknown>)[k], 0, 999, 0))
    return r
  }
  const e = o.eaten && typeof o.eaten === 'object' ? o.eaten : {}
  this.eatenOf.set(this.pet, clean(e.pet))
  const list: unknown[] = Array.isArray(e.friends) ? e.friends : []
  // 保存した友だちのうち 読み込めた子だけが friends に入っているので、同じ条件でそろえる
  const ok = savedFriends.map((f, i) => ({ f: f as { sp?: unknown } | null, i })).filter((x) => x.f && isSpecies(x.f.sp))
  friends.forEach((c, i) => this.eatenOf.set(c, clean(list[ok[i]?.i ?? -1])))
}
