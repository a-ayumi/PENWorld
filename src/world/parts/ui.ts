/** World.ts から分けた「ui」のメソッド。this は World（World.ts のクラスのつなぎの行から呼ばれる） */
import * as THREE from 'three'
import { RES, SCENE } from '../psx'
import { FAMILY_NAME, LOOK_NAME, SPECIES, XP_NEED, familyOf, lookOf, portraitFor, type Care, type EggKind } from '../monsters'
import { HALF, type Stage } from '../stages'
import { STRUCTS, STRUCT_H, type StructKind } from '../structures'
import { ITEM_INFO, ITEM_SPEC, type ItemKind } from '../items'
import { SHOP, drawShop as drawShopWindow, type ShopCheck, type ShopItem } from '../shop'
import { CHAPTERS, bossReady, nowGoal } from '../../roadmap'
import type { World } from '../World'
import { Creature, Res, House, Struct, Food, ROLE_NAME, ROLE_COLOR, LIFESPAN, Item, Egg, Pick, STATE_NAME, STRUCT_DESC, ICONS, ICON_COLORS, ICON_BMP, FOODS, CARE_NAME, SeasonShop, FONT, HOUSE_STEPS, MAX_STRUCTS, FORT_RANGE, houseMaxHp, WEATHER_NAME, MAX_FRIENDS } from '../World'

/** タップした場所（液晶の座標）にいちばん近い物をさがす */
export function pickAt(this: World, x: number, y: number): Pick | null {
  const here = this.stageIndex
  let best: Pick | null = null
  let bs = 1
  // 地面の点と上の点を画面に投影して、見た目の大きさから当たりの半径を決める
  const test = (px: number, pz: number, h: number, pick: Pick, minR = 9) => {
    const gy = this.stage.heightAt(px, pz)
    const a = this.projectXYZ(px, gy + h * 0.5, pz)
    if (!a.on) return
    const b = this.projectXYZ(px, gy + h, pz)
    const r = Math.max(minR, Math.hypot(a.x - b.x, a.y - b.y) * 1.15)
    const score = Math.hypot(a.x - x, a.y - y) / r
    if (score < bs) {
      bs = score
      best = pick
    }
  }
  for (const c of this.creatures) if (c.state !== 'dead' && !(c.inside && c.state === 'sleep')) test(c.x, c.z, this.size(c) + c.jy, { type: 'creature', ref: c, armed: false }, 10)
  for (const h of this.houses) if (h.stage === here && h.mesh) test(h.x, h.z, h.level >= 4 ? 2.2 : h.level >= 3 ? 1.7 : 1, { type: 'house', ref: h, armed: false }, 14)
  for (const b of this.structs) {
    if (b.stage !== here || !b.mesh) continue
    test(b.x, b.z, STRUCT_H[b.kind][0], { type: 'struct', ref: b, armed: false }, 12)
  }
  for (const it of this.items) if (it.stage === here && it.mesh) test(it.x, it.z, it.kind === 'sapling' ? 0.5 + it.grow : ITEM_SPEC[it.kind].pickH, { type: 'item', ref: it, armed: false }, 11)
  for (const e of this.eggs) test(e.x, e.z, 0.6, { type: 'egg', ref: e, armed: false }, 10)
  for (const r of this.resources) test(r.x, r.z, 0.25, { type: 'res', ref: r, armed: false }, 8)
  for (const f of this.foods) test(f.x, f.z, 0.3, { type: 'food', ref: f, armed: false }, 8)
  return best
}

export function pickValid(this: World, p: Pick) {
  switch (p.type) {
    case 'creature': return this.creatures.includes(p.ref) && p.ref.state !== 'dead'
    case 'house': return this.houses.includes(p.ref)
    case 'struct': return this.structs.includes(p.ref)
    case 'item': return this.items.includes(p.ref)
    case 'egg': return this.eggs.includes(p.ref)
    case 'res': return this.resources.includes(p.ref)
    case 'food': return this.foods.includes(p.ref)
  }
}

export function pickPos(this: World, p: Pick): { x: number; z: number; h: number } {
  const r = p.ref
  switch (p.type) {
    case 'creature': return { x: r.x, z: r.z, h: this.size(r) + r.jy + 0.4 }
    case 'house': return { x: r.x, z: r.z, h: r.level >= 4 ? 2.6 : r.level >= 3 ? 2.1 : 1.4 }
    case 'struct': return { x: r.x, z: r.z, h: STRUCT_H[r.kind as StructKind][1] }
    case 'item': return { x: r.x, z: r.z, h: (r.kind === 'sapling' ? 1.0 + r.grow * 1.3 : ITEM_SPEC[r.kind as ItemKind].pickH) + 0.4 + (r.fall ?? 0) }
    default: return { x: r.x, z: r.z, h: 1.2 }
  }
}

/** ひょうじする内容：なまえ・ひとこと・説明・ゲージ・けせるか */
export function describe(this: World, p: Pick): { title: string; sub: string; lines: string[]; bars: [string, number, string][]; del: string | null } {
  const bars: [string, number, string][] = []
  const lines: string[] = []
  switch (p.type) {
    case 'creature': {
      const c: Creature = p.ref
      const team = c.team === 'pet' ? 'ペット' : c.team === 'friend' ? 'なかま' : c.army ? 'てきぐん' : c.sp.temper === 'wild' ? 'てき' : 'やせい'
      const fam = c.sp.tier ? FAMILY_NAME[familyOf(c.sp.id)] : 'てき'
      lines.push(`${team}・${fam}・ランク${c.sp.tier || '-'}${c.grow > 0 ? '・こども' : ''}`)
      if (c.rare) lines.push('★ いろちがい（めずらしい！）' + (lookOf(c.seed) ? `・${LOOK_NAME[lookOf(c.seed)]}` : ''))
      else if (c.sp.tier > 0 && lookOf(c.seed)) lines.push(`からだ：${LOOK_NAME[lookOf(c.seed)]}`)
      lines.push(`こうげき ${Math.round(c.atk)}  すばやさ ${c.sp.speed.toFixed(1)}  ${c.role !== 'free' ? 'やくわり ' + ROLE_NAME[c.role] : ''}`)
      lines.push(`いま：${STATE_NAME[c.state] ?? c.state}`)
      if (this.fortBoost(c) > 1) lines.push('いしのとりでの ちから：こうげき UP！')
      bars.push(['たいりょく', c.hp / c.maxHp, '#7cf29b'])
      if (c.team === 'wild' && c.sp.temper === 'calm') bars.push(['なかよし', Math.min(1, c.affinity / 100), '#ff7eb6'])
      else if (this.ally(c) && c.sp.tier >= 1 && c.sp.tier <= 3) bars.push(['しんか', Math.min(1, (c === this.pet ? this.xp : c.xp) / XP_NEED[c.sp.tier as 1 | 2 | 3]), '#c9a8ff'])
      if (c !== this.pet && c.life > 0) bars.push(['じゅみょう', Math.max(0, 1 - c.age / c.life), '#9be28a'])
      return { title: (c.rare ? '★' : '') + c.sp.name + (c === this.pet ? ' ★' : ''), sub: c.sp.kind, lines, bars, del: null }
    }
    case 'house': {
      const h: House = p.ref
      const lv = ['たてはじめ', 'どだい', 'かべ', 'かんせい', 'ぞうちく'][h.level]
      lines.push(`しざい ${h.mats}/${HOUSE_STEPS[4]}（${lv}）`)
      lines.push(h.owner ? `すんでいる：${h.owner.sp.name}` : 'あきや（だれかが すみつく）')
      if (h.level >= 1) bars.push(['じょうぶさ', h.hp / houseMaxHp(h.level), '#ff9f43'])
      bars.push(['できあがり', h.mats / HOUSE_STEPS[4], '#c8955a'])
      return { title: `${h.owner ? h.owner.sp.name : SPECIES[h.ownerSp].name}の いえ`, sub: '家', lines, bars, del: 'かいたい' }
    }
    case 'struct': {
      const b: Struct = p.ref
      const spec = STRUCTS[b.kind]
      const done = this.structDone(b)
      lines.push(done ? STRUCT_DESC[b.kind] : `けんせつちゅう：しざい ${b.mats}/${spec.need}`)
      if (!done) lines.push(STRUCT_DESC[b.kind])
      else {
        const extra = this.structStatus(b)
        if (extra) lines.push(extra)
      }
      bars.push(done ? ['じょうぶさ', b.hp / spec.hp, '#ff9f43'] : ['できあがり', b.mats / spec.need, '#c8955a'])
      return { title: spec.name, sub: done ? 'たてもの' : 'けんせつちゅう', lines, bars, del: 'かいたい' }
    }
    case 'item': {
      const it: Item = p.ref
      const info = ITEM_INFO[it.kind] ?? { name: it.kind, desc: '' }
      lines.push(...info.desc.split('\n'))
      if (it.kind === 'sapling') {
        lines.push(`いま：${['めばえ', 'わかぎ', 'みのる木'][it.st ?? 0]}`)
        bars.push(['せいちょう', it.grow, '#7cf29b'])
      }
      return { title: info.name, sub: 'おきもの', lines, bars, del: it.kind === 'crown' ? null : 'かたづける' }
    }
    case 'egg': {
      const e: Egg = p.ref
      lines.push(e.wild ? 'のはらで みつけた たまご' : e.kind === 'inherit' ? `おやの こ（${e.parents.map((id) => SPECIES[id].name).join('・')}）` : 'あたらしい けいとうの たまご')
      lines.push(`かえるまで あと ${Math.max(0, Math.ceil(e.t))}びょう`)
      return { title: `${FAMILY_NAME[e.kind]}のたまご`, sub: 'たまご', lines, bars, del: 'どける' }
    }
    case 'res': {
      const r: Res = p.ref
      lines.push('いえや たてものの ざいりょう。だれかが ひろっていく')
      return { title: r.kind === 'wood' ? 'もくざい' : 'いし', sub: 'しざい', lines, bars, del: 'かたづける' }
    }
    case 'food': {
      const f: Food = p.ref
      const name = f.kind === 'stage' ? this.stage.food.name : FOODS[f.kind].name
      lines.push('おなかが すいた子が たべにくる')
      return { title: name, sub: 'たべもの', lines, bars, del: 'かたづける' }
    }
  }
}

/** できあがった建物の いまのようす（情報ウィンドウの 2 行目） */
export function structStatus(this: World, b: Struct): string {
  switch (b.kind) {
    case 'fountain':
      return this.festival ? 'いま：おまつりちゅう！' : 'むらの ひろば（おまつりの ばしょ）'
    case 'windmill':
      return `つぎの しざいまで あと ${Math.max(0, Math.ceil(38 - b.t))}びょう`
    case 'lighthouse': {
      const lh = this.lighthouse()
      return lh?.water ? 'みずべで ひかりが つよい（よこく+16びょう）' : 'よこく +10びょう・みはりの め ひろい'
    }
    case 'market': {
      if (this.vLv < 1) return 'むらが うまれるまで おやすみ'
      return this.peddler ? 'やどかりが きている！' : `しゅうにゅう +${2 + this.vLv}（うりこで もっと）`
    }
    case 'playground': {
      const n = this.creatures.filter((c) => c.state === 'frolic' && c.spot === b).length
      return n ? `いま ${n}ひきが あそんでいる` : 'こどもが ちかくに いると はやく そだつ'
    }
    case 'fort':
      return `はんい ${FORT_RANGE}マス・こうげき x1.3`
    default:
      return ''
  }
}

/** かいたい・かたづける。家や建物は しざいがのこる */
export function removePick(this: World, p: Pick) {
  this.onSfx('demolish')
  const rubble = (x: number, z: number, mats: number) => {
    for (let i = 0; i < Math.min(4, Math.ceil(mats / 3)); i++) this.spawnResource(x + (Math.random() - 0.5) * 2, z + 1 + Math.random(), undefined, true)
  }
  switch (p.type) {
    case 'house': {
      const h: House = p.ref
      this.unmountHouse(h)
      this.houses.splice(this.houses.indexOf(h), 1)
      for (const c of this.creatures) if (c.raid === h) c.raid = null
      rubble(h.x, h.z, h.mats)
      this.burst(h.x, this.stage.heightAt(h.x, h.z) + 0.8, h.z, 'cube', 10, 3)
      this.say('いえを かいたいした')
      break
    }
    case 'struct': {
      const b: Struct = p.ref
      this.unmountStruct(b)
      this.structs.splice(this.structs.indexOf(b), 1)
      for (const c of this.creatures) {
        if (c.site === b) c.site = null
        if (c.tendTo === b) c.tendTo = null
        if (c.spot === b) c.spot = null
      }
      rubble(b.x, b.z, b.mats)
      this.burst(b.x, this.stage.heightAt(b.x, b.z) + 0.8, b.z, 'cube', 10, 3)
      this.say(`${STRUCTS[b.kind].name}を かいたいした`)
      break
    }
    case 'item': {
      const it: Item = p.ref
      this.unmountItem(it)
      this.items.splice(this.items.indexOf(it), 1)
      this.burst(it.x, this.stage.heightAt(it.x, it.z) + 0.5, it.z, 'cube', 6, 2)
      this.say(`${(ITEM_INFO[it.kind] ?? { name: 'おきもの' }).name}を かたづけた`)
      break
    }
    case 'egg': {
      const e: Egg = p.ref
      this.scene.remove(e.anim.sprite, e.shadow)
      e.anim.dispose()
      this.eggs.splice(this.eggs.indexOf(e), 1)
      this.say('たまごを どけた')
      break
    }
    case 'res': {
      const r: Res = p.ref
      this.scene.remove(r.mesh)
      this.resources.splice(this.resources.indexOf(r), 1)
      for (const c of this.creatures) if (c.res === r) c.res = null
      break
    }
    case 'food': {
      const f: Food = p.ref
      for (const c of this.creatures) if (c.food === f) c.food = null
      this.removeFood(f)
      break
    }
    default:
      return
  }
  this.onSfx('cancel')
  this.picked = null
  this.infoBox = null
  this.save()
}

/** 情報ウィンドウ（下がわ）と、えらんだ物のしるし */
export function drawInfo(this: World) {
  const p = this.picked
  if (!p) return
  if (!this.pickValid(p)) {
    this.picked = null
    this.infoBox = null
    return
  }
  if (p.armed && this.time > this.armUntil) p.armed = false
  const g = this.hudCtx
  const pos = this.pickPos(p)
  const s = this.projectXYZ(pos.x, this.stage.heightAt(pos.x, pos.z) + pos.h, pos.z)
  if (s.on) {
    const by = s.y - 4 + Math.round(Math.sin(this.time * 6) * 2)
    g.fillStyle = '#10122a'
    g.fillRect(s.x - 5, by - 1, 11, 2)
    g.fillStyle = '#ffd23f'
    for (let i = 0; i < 4; i++) g.fillRect(s.x - 4 + i, by + i, 9 - i * 2, 1)
  }
  const d = this.describe(p)
  const w = 244
  const rows = d.lines.length + d.bars.length
  const h = 36 + rows * 13 + 24
  const x = (RES.w - w) / 2
  const y = RES.h - 28 - h
  this.win(x, y, w, h)
  this.text(d.title, x + 10, y + 7, '#ffffff', 12)
  this.text(d.sub, x + w - 10, y + 9, '#9fd8ff', 9, 'right')
  let ry = y + 25
  for (const l of d.lines) {
    this.text(l, x + 10, ry, '#e8eeff', 9)
    ry += 13
  }
  for (const [n, v, col] of d.bars) {
    this.text(n, x + 10, ry, '#e8eeff', 9)
    this.bar(x + 74, ry + 4, 150, Math.max(0, Math.min(1, v)), col)
    ry += 13
  }
  // ボタン
  const by2 = y + h - 21
  const close = { x: x + (d.del ? w - 88 : w - 88), y: by2, w: 78, h: 15 }
  const del = d.del ? { x: x + 10, y: by2, w: 120, h: 15 } : null
  for (const [b, label, col] of [[close, 'とじる', 'rgba(255,255,255,0.18)'], [del, p.armed ? 'ほんとうに？ もういちど' : d.del ?? '', p.armed ? 'rgba(232,90,90,0.95)' : 'rgba(180,70,70,0.7)']] as const) {
    if (!b) continue
    g.fillStyle = col
    g.fillRect(b.x, b.y, b.w, b.h)
    g.strokeStyle = 'rgba(255,255,255,0.6)'
    g.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1)
    this.text(label, b.x + b.w / 2, b.y + 3, '#ffffff', 9, 'center')
  }
  this.infoBox = { x, y, w, h, del, close }
}

/** 情報ウィンドウが開いている時のタップ */
export function tapInfo(this: World, x: number, y: number): boolean {
  const b = this.infoBox
  const p = this.picked
  if (!b || !p) return false
  const inside = (r: { x: number; y: number; w: number; h: number }) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
  if (b.del && inside(b.del)) {
    if (p.armed) this.removePick(p)
    else {
      p.armed = true
      this.armUntil = this.time + 3
      this.onSfx('select')
    }
    return true
  }
  if (inside(b.close)) {
    this.picked = null
    this.infoBox = null
    this.onSfx('cancel')
    return true
  }
  if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true
  // ウィンドウの外：べつの物をえらぶ / 何もなければ閉じる
  const next = this.pickAt(x, y)
  if (next) {
    this.picked = next
    this.onSfx('select')
  } else {
    this.picked = null
    this.infoBox = null
    this.onSfx('cancel')
  }
  return true
}

/** 戻り値 false = この画面では使わなかった（本体側で処理してよい） */
export function press(this: World, key: 'A' | 'B' | 'C'): boolean {
  this.hudNow = true
  if (this.warp > 0) return true
  if (this.shopOpen) {
    if (key === 'A') {
      this.shopCursor = (this.shopCursor + 1) % SHOP.length
      this.onSfx('select')
    } else if (key === 'B') this.buy(SHOP[this.shopCursor])
    else {
      this.shopOpen = false
      this.onSfx('cancel')
    }
    return true
  }
  if (key === 'A') {
    this.cursor = (this.cursor + 1) % ICONS.length
    this.showStatus = false
    this.onSfx('select')
    return true
  }
  if (key === 'C') {
    if (this.showStatus) this.showStatus = false
    else if (this.cursor >= 0) this.cursor = -1
    else return false
    this.onSfx('cancel')
    return true
  }
  if (this.cursor < 0) {
    this.showStatus = !this.showStatus
    this.onSfx('ok')
    return true
  }
  this.run(this.cursor)
  return true
}

/** 買い物（コインの出入りは update() が数える。ここでは買った回数だけ） */
export function buy(this: World, s: ShopItem) {
  const c0 = this.coins
  this.buyItem(s)
  if (this.coins < c0) this.stat('buys')
}

/** 買えるか と、買えない理由（ショップの色分けと「かえない」メッセージの元） */
export function shopCheck(this: World, s: ShopItem): ShopCheck {
  let have: number | undefined
  let max: number | undefined
  const no = (tone: ShopCheck['tone'], why: string): ShopCheck => ({ ok: false, tone, why, have, max })
  if (s.land) {
    if (this.land >= s.land) return no('done', 'この かいたくは もう すんでいる')
    if (this.land < s.land - 1) return no('lock', 'さきに かいたく ① を しよう')
  }
  if (s.item) {
    max = ITEM_SPEC[s.item].max
    have = this.items.filter((it) => it.kind === s.item && it.stage === this.stageIndex).length
    if (have >= max) return no('full', `この箱庭には もう おけない（${have}/${max}）`)
  }
  if (s.egg) {
    max = 3
    have = this.eggs.length
    if (have >= max) return no('full', `たまごは いっぱい（${have}/${max}）`)
  }
  if (s.plan) {
    const here = this.structs.filter((b) => b.stage === this.stageIndex)
    have = here.filter((b) => b.kind === s.plan).length
    max = s.plan === 'castle' ? 1 : s.plan === 'wall' ? undefined : 3
    if (here.length >= MAX_STRUCTS) return no('full', 'もう たてる ばしょが ない')
    if (max !== undefined && have >= max) return no('full', s.plan === 'castle' ? 'おしろは ひとつだけ' : `${STRUCTS[s.plan].name}は これいじょう いらない（${have}/${max}）`)
    if (s.plan === 'bridge' && !this.stage.obstacles.some((o) => o.water && !here.some((b) => b.kind === 'bridge' && Math.hypot(b.x - o.x, b.z - o.z) < 0.6)))
      return no('lock', 'この箱庭には わたる みずうみが ない')
  }
  if (this.coins < s.price) return no('coin', `コインが たりない（あと ${s.price - this.coins}）`)
  return { ok: true, tone: 'ok', why: '', have, max }
}

export function pay(this: World, s: ShopItem) {
  this.coins -= s.price
  this.coinPop = { t: 1.4, n: s.price }
  this.onSfx('buy')
}

export function buyItem(this: World, s: ShopItem) {
  const ck = this.shopCheck(s)
  if (!ck.ok) {
    this.say(ck.why)
    return this.onSfx('cancel')
  }
  if (s.land) {
    this.pay(s)
    this.expandLand(s.land)
    this.shopOpen = false
    return
  }
  if (s.egg) {
    const kind: EggKind = s.egg === 'random' ? (['machine', 'dragon', 'cat', 'dog', 'bird', 'water', 'monster'] as EggKind[])[Math.floor(Math.random() * 7)] : s.egg
    const deco = (s as SeasonShop).deco ? (s as SeasonShop).season : undefined
    this.pay(s)
    const pt = this.pet
    const ex = pt.x + pt.anim.facing * 1.1
    const ez = pt.z + 0.4
    this.layEgg(ex, ez, [], 40, kind, false, s.egg === 'random' && !deco, deco)
    this.buyFx(ex, ez, 0.4)
    this.stat('eggs')
    this.say(deco ? `${s.name}を おいた！` : s.egg === 'random' ? 'ふしぎなたまごを おいた！' : `${FAMILY_NAME[kind]}のたまごを おいた！`)
    this.shopOpen = false
    return
  }
  if (s.plan) {
    // せっけいず：見ている所のまわりに建設現場ができる（みんなが資材を運んで建てる）
    const site = this.planStruct(s.plan)
    if (!site) return this.onSfx('cancel')
    this.pay(s)
    this.buyFx(site.x, site.z, 0.8)
    this.say(`${STRUCTS[s.plan].name}の せっけいず！ みんなが たてはじめる`)
    this.shopOpen = false
    return
  }
  this.pay(s)
  if (s.kit) {
    // 木 3 つと石 2 つを、見ている所のまわりに置く
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      this.spawnResource(this.look.x + Math.cos(a) * 1.2, this.look.z + Math.sin(a) * 1.2, i < 3 ? 'wood' : 'stone', true)
    }
    this.buyFx(this.look.x, this.look.z, 0.5)
    this.burst(this.look.x, this.stage.heightAt(this.look.x, this.look.z) + 0.5, this.look.z, 'spark', 8, 2)
    this.say('ざいもくセットを おいた（木3・石2）')
  } else if (s.food) {
    const p = this.pet
    const f = this.dropFood(p.x + p.anim.facing * 0.9, p.z + 0.2, 3, s.food)
    if (p.state !== 'fight' && p.state !== 'faint') {
      if (p.food) p.food.taken = null
      f.taken = p
      p.food = f
      this.setState(p, 'seek', 10)
    }
    this.buyFx(f.x, f.z, 0.3)
    this.say(`${s.name}を おいた`)
  } else if (s.item) {
    const it = this.placeItem(s.item)
    this.buyFx(it.x, it.z, 0.6)
    this.say(`${s.name}を 箱庭に おいた`)
  }
  this.shopOpen = false
}

export function run(this: World, i: number) {
  const p = this.pet
  const busy = p.state === 'fight' || p.state === 'faint'
  this.onSfx('ok')
  switch (i) {
    case 0: {
      if (busy) return this.say('いまは それどころじゃない！')
      const f = this.dropFood(p.x + p.anim.facing * 0.9, p.z + 0.2, 3)
      if (p.food) p.food.taken = null
      f.taken = p
      p.food = f
      this.setState(p, 'seek', 10)
      return this.say(`${this.stage.food.name}を あげた`)
    }
    case 1:
      if (busy) return this.say('いまは それどころじゃない！')
      if (p.energy < 15) return this.say(`${p.sp.name}は つかれている…`)
      this.setState(p, 'train', 2.4)
      return this.say('トレーニング かいし！')
    case 2: {
      // たたかっている時は「おうえん」：つぎの攻撃で技を出す
      if (p.state === 'fight') {
        p.cheer = true
        this.burst(p.x, this.ground(p) + this.size(p) + 0.2, p.z, 'spark', 6, 1.5)
        return this.say(`がんばれ ${p.sp.name}！ わざを だせ！`)
      }
      if (busy) return this.say('いまは うごけない…')
      let foe = this.nearest(p, (o) => o.sp.temper === 'wild', 99)
      if (!foe) {
        const a = Math.random() * Math.PI * 2
        foe = this.spawn('noiz', 'wild', THREE.MathUtils.clamp(p.x + Math.cos(a) * 3, -HALF, HALF), THREE.MathUtils.clamp(p.z + Math.sin(a) * 3, -HALF, HALF))
        this.say('ノイズが あらわれた！')
      }
      p.foe = foe
      this.setState(p, 'hunt', 12)
      return
    }
    case 3:
      this.showStatus = !this.showStatus
      return
    case 4:
      this.nightTarget = this.nightTarget > 0.5 ? 0 : 1
      return this.say(this.nightTarget ? 'ライトを けした おやすみ…' : 'ライトを つけた おはよう！')
    case 5:
      this.shopOpen = true
      this.showStatus = false
      return
    case 6:
      this.warp = 1.6
      this.warpSwitched = false
      this.cursor = -1
      this.onSfx('warp')
      return
    case 7:
      if (busy) return this.say('いまは よびだせない！')
      this.setState(p, 'come', 4)
      return this.say(`${p.sp.name}を よんだ`)
  }
}

/** 「おなか+25」「げんき-15」のような増減の文字（変化が無ければ空） */
export function delta(this: World, name: string, v: number) {
  const n = Math.round(v)
  if (!n) return ''
  return `${name}${n > 0 ? '+' : ''}${n}`
}

export function say(this: World, text: string) {
  this.onNote?.(text)
  this.messages.push(text)
  if (this.messages.length > 4) this.messages.shift()
  if (this.messages.length === 1) this.msgT = 2.8
}

export function project(this: World, v: THREE.Vector3) {
  return this.projectXYZ(v.x, v.y, v.z)
}

/** 3D の点を HUD の座標へ（使い捨ての Vector3 を作らない） */
export function projectXYZ(this: World, x: number, y: number, z: number) {
  const p = this.pv.set(x, y, z).project(this.viewCam)
  return { x: Math.round((p.x + 1) * 0.5 * RES.w), y: Math.round((1 - p.y) * 0.5 * RES.h), on: p.z < 1 }
}

export function text(this: World, s: string, x: number, y: number, color = '#ffffff', size = 10, align: CanvasTextAlign = 'left') {
  const g = this.hudCtx
  g.font = `${size}px ${FONT}`
  g.textAlign = align
  g.textBaseline = 'top'
  g.fillStyle = '#10122a'
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]]) g.fillText(s, x + dx, y + dy)
  g.fillStyle = color
  g.fillText(s, x, y)
}

/** 青いグラデーションのウィンドウ（白い 2 重枠） */
export function win(this: World, x: number, y: number, w: number, h: number) {
  const g = this.hudCtx
  const grad = g.createLinearGradient(0, y, 0, y + h)
  grad.addColorStop(0, 'rgba(46,72,170,0.92)')
  grad.addColorStop(1, 'rgba(16,24,80,0.92)')
  g.fillStyle = grad
  g.fillRect(x, y, w, h)
  g.strokeStyle = '#e8eeff'
  g.lineWidth = 1
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  g.strokeStyle = 'rgba(120,150,255,0.8)'
  g.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5)
}

/** 章のはじめ・おわりの物語カード（しばらくしたら消える。タップでも消える） */
export function drawCard(this: World) {
  const c = this.cards[0]
  if (!c || this.time < c.at) return
  if (!c.t0) c.t0 = this.time
  const age = this.time - c.t0
  if (age > 9) return void this.cards.shift()
  const g = this.hudCtx
  const h = 34 + c.lines.length * 12
  const slide = Math.min(1, age / 0.35)
  const y = Math.round(104 - (1 - slide) * 20)
  g.globalAlpha = Math.min(1, slide * 1.2) * (age > 8.4 ? (9 - age) / 0.6 : 1)
  this.win(12, y, RES.w - 24, h)
  this.text(c.title, RES.w / 2, y + 7, c.color, 11, 'center')
  this.text(c.sub, RES.w / 2, y + 20, '#9fd8ff', 8, 'center')
  c.lines.forEach((l, i) => this.text(l, RES.w / 2, y + 34 + i * 12, '#ffffff', 9, 'center'))
  g.globalAlpha = 1
}

export function bar(this: World, x: number, y: number, w: number, ratio: number, color?: string) {
  const g = this.hudCtx
  g.fillStyle = '#10122a'
  g.fillRect(x - 1, y - 1, w + 2, 5)
  g.fillStyle = '#3a3f66'
  g.fillRect(x, y, w, 3)
  g.fillStyle = color ?? (ratio > 0.5 ? '#5ef28a' : ratio > 0.25 ? '#ffd23f' : '#ff4d6d')
  g.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, ratio))), 3)
}

export function icon(this: World, i: number, cx: number, cy: number, on: boolean) {
  const g = this.hudCtx
  const bmp = ICON_BMP[i]
  const x0 = cx - 9
  const y0 = cy - 9
  if (on) {
    const blink = Math.floor(this.time * 4) % 2 === 0
    g.fillStyle = blink ? '#ffd23f' : '#fff6c8'
    g.fillRect(x0 - 3, y0 - 3, 24, 24)
    g.fillStyle = '#10122a'
    g.fillRect(x0 - 2, y0 - 2, 22, 22)
  }
  for (const pass of [0, 1])
    for (let y = 0; y < 9; y++)
      for (let x = 0; x < 9; x++) {
        if (bmp[y][x] !== '#') continue
        if (pass === 0) {
          g.fillStyle = '#10122a'
          g.fillRect(x0 + x * 2 - 1, y0 + y * 2 - 1, 4, 4)
        } else {
          g.fillStyle = on ? ICON_COLORS[i] : this.cursor < 0 ? ICON_COLORS[i] : 'rgba(200,210,240,0.7)'
          g.fillRect(x0 + x * 2, y0 + y * 2, 2, 2)
        }
      }
}

/** 色ちがいの目印（小さな金の ★） */
export function starMark(this: World, x: number, y: number) {
  const g = this.hudCtx
  g.fillStyle = '#10122a'
  g.fillRect(x - 3, y - 2, 7, 7)
  g.fillStyle = Math.floor(this.time * 3) % 2 ? '#ffd23f' : '#fff6b0'
  for (const [dx, dy, w] of [[0, -1, 1], [-1, 0, 3], [-2, 1, 5], [-1, 2, 3], [-2, 3, 1], [2, 3, 1]]) g.fillRect(x + dx, y + dy, w, 1)
}

/** ボスの大きな HP バー（画面の上のまんなか）。ボスが出ている間だけ */
export function drawBossBar(this: World) {
  const boss = this.creatures.find((c) => c.sp.boss && this.alive(c))
  if (!boss) return
  const g = this.hudCtx
  const w = 208
  const x = Math.round((RES.w - w) / 2)
  const y = 46
  g.fillStyle = 'rgba(10,14,40,0.82)'
  g.fillRect(x, y, w, 25)
  g.strokeStyle = '#ff9a3a'
  g.strokeRect(x + 0.5, y + 0.5, w - 1, 24)
  this.text(`ボス ${boss.sp.name}`, x + 8, y + 3, '#ffd0a0', 10)
  this.text(`${Math.max(0, Math.ceil(boss.hp))}/${boss.maxHp}`, x + w - 8, y + 4, '#ffffff', 8, 'right')
  const r = Math.max(0, Math.min(1, boss.hp / boss.maxHp))
  g.fillStyle = '#10122a'
  g.fillRect(x + 6, y + 15, w - 12, 7)
  g.fillStyle = '#3a2030'
  g.fillRect(x + 7, y + 16, w - 14, 5)
  g.fillStyle = r > 0.5 ? '#ff5e3a' : r > 0.25 ? '#ff9a3a' : '#ffd23f'
  g.fillRect(x + 7, y + 16, Math.round((w - 14) * r), 5)
  g.fillStyle = 'rgba(255,255,255,0.35)'
  g.fillRect(x + 7, y + 16, Math.round((w - 14) * r), 1)
  for (const k of [0.25, 0.5, 0.75]) {
    g.fillStyle = 'rgba(16,18,42,0.8)'
    g.fillRect(x + 7 + Math.round((w - 14) * k), y + 16, 1, 5)
  }
}

export function heartMark(this: World, x: number, y: number) {
  const g = this.hudCtx
  g.fillStyle = '#10122a'
  g.fillRect(x - 3, y - 1, 7, 6)
  g.fillStyle = '#ff7eb6'
  for (const [dx, dy, w] of [[-2, 0, 2], [1, 0, 2], [-2, 1, 5], [-1, 2, 3], [0, 3, 1]]) g.fillRect(x + dx, y + dy, w, 1)
}

export function drawHud(this: World) {
  const g = this.hudCtx
  g.clearRect(0, 0, RES.w, RES.h)
  g.imageSmoothingEnabled = false
  if (this.cleanView) {
    // 眺めるモード：何も描かない
    this.hudTex.needsUpdate = true
    return
  }

  for (const [y, row] of [[0, 0], [RES.h - 24, 1]] as const) {
    const grad = g.createLinearGradient(0, y, 0, y + 24)
    grad.addColorStop(0, 'rgba(10,14,40,0.75)')
    grad.addColorStop(1, 'rgba(10,14,40,0.45)')
    g.fillStyle = grad
    g.fillRect(0, y, RES.w, 24)
    for (let k = 0; k < 4; k++) this.icon(row * 4 + k, 40 + k * 80, y + 12, this.cursor === row * 4 + k)
  }

  // コイン
  const coinText = `${this.coins}`
  g.font = `10px ${FONT}`
  const cw = Math.ceil(g.measureText(coinText).width) + 20
  g.fillStyle = 'rgba(10,14,40,0.7)'
  g.fillRect(RES.w - cw - 4, 27, cw, 14)
  g.fillStyle = '#ffd23f'
  g.beginPath()
  g.arc(RES.w - cw + 4, 34, 4, 0, Math.PI * 2)
  g.fill()
  this.text(coinText, RES.w - 8, 29, '#ffe9a8', 10, 'right')
  if (this.coinPop.t > 0) {
    // 買った分が ふわっと 引かれる
    const k = 1 - this.coinPop.t / 1.4
    g.save()
    g.globalAlpha = Math.min(1, this.coinPop.t * 2.5)
    this.text(`-${this.coinPop.n}`, RES.w - 8, Math.round(43 + k * 8), '#ff9a9a', 10, 'right')
    g.restore()
  }
  // 天気
  const wt = WEATHER_NAME[this.weather]
  const ww = Math.ceil(g.measureText(wt).width) + 12
  g.fillStyle = 'rgba(10,14,40,0.7)'
  g.fillRect(RES.w - cw - ww - 8, 27, ww, 14)
  this.text(wt, RES.w - cw - 8 - ww / 2, 29, { sun: '#ffe9a8', cloud: '#d8dee8', rain: '#9fd8ff', snow: '#ffffff', ember: '#ffa86b' }[this.weather], 10, 'center')

  // 村の名前と にぎわい、敵軍の知らせ
  if (this.vLv > 0 && this.banner <= 0) {
    const t = `${this.villageName()} ★${Math.floor(this.vScore)}`
    g.font = `9px ${FONT}`
    const vw = Math.ceil(g.measureText(t).width) + 10
    g.fillStyle = 'rgba(10,14,40,0.7)'
    g.fillRect(6, 27, vw, 14)
    this.text(t, 11, 29, '#ffe9a8', 9)
  }
  // いまの もくひょう（村の名前の下に 1 行）
  if (this.banner <= 0 && this.road.cleared < CHAPTERS.length) {
    const ng = nowGoal(this.road, this.roadState())
    if (ng) {
      let t = bossReady(this.road) && !this.army ? 'だいぐんぜいに そなえよう' : ng.goal.text + (ng.need > 1 ? ` ${Math.floor(ng.val)}/${ng.need}` : '')
      g.font = `9px ${FONT}`
      const full = `もくひょう ${t}`
      let w = Math.ceil(g.measureText(full).width) + 10
      while (w > RES.w - 12 && t.length > 4) {
        t = t.slice(0, -2) + '…'
        w = Math.ceil(g.measureText(`もくひょう ${t}`).width) + 10
      }
      g.fillStyle = 'rgba(10,14,40,0.7)'
      g.fillRect(6, 43, w, 14)
      this.text('もくひょう', 11, 45, '#9fd8ff', 9)
      this.text(t, 11 + Math.ceil(g.measureText('もくひょう ').width), 45, '#ffffff', 9)
    }
  }
  if (this.army) {
    const a = this.army
    const nm = a.boss ? 'だいぐんぜい' : 'てきぐん'
    const t = a.phase === 'warn' ? `${nm} せっきん！ ${Math.ceil(a.t)}` : `${nm} のこり ${a.left.length}`
    g.font = `9px ${FONT}`
    const aw = Math.ceil(g.measureText(t).width) + 10
    g.fillStyle = Math.floor(this.time * 3) % 2 ? 'rgba(120,20,30,0.85)' : 'rgba(80,14,24,0.85)'
    g.fillRect(6, 59, aw, 14)
    this.text(t, 11, 61, '#ffd0d0', 9)
    const king = a.left.find((c) => c.boss)
    if (a.phase === 'on' && king) {
      this.text('ノイズの おう', 6, 75, '#ff9a9a', 9)
      this.bar(6, 87, 96, king.hp / king.maxHp, '#ff4d6d')
    }
  }
  if (this.festival) {
    const t = `おまつり！ ${Math.ceil(this.festival.t)}`
    g.font = `9px ${FONT}`
    const fw = Math.ceil(g.measureText(t).width) + 10
    const fy = this.army ? 59 : 43
    g.fillStyle = Math.floor(this.time * 3) % 2 ? 'rgba(190,60,120,0.88)' : 'rgba(150,40,100,0.88)'
    g.fillRect(6, fy, fw, 14)
    this.text(t, 11, fy + 2, '#fff0f6', 9)
  }
  // 建物：建てている途中はできあがり具合、こわされていれば残り
  for (const b of this.structs) {
    if (b.stage !== this.stageIndex || !b.mesh) continue
    const done = this.structDone(b)
    if (b.kind === 'wall' && (done ? b.hp >= STRUCTS.wall.hp - 1 : b.mats === 0)) continue
    if (done && b.hp >= STRUCTS[b.kind].hp - 1) continue
    const p = this.projectXYZ(b.x, this.stage.heightAt(b.x, b.z) + STRUCT_H[b.kind][2], b.z)
    if (!p.on) continue
    if (!done) this.bar(p.x - 10, p.y, 20, b.mats / STRUCTS[b.kind].need, '#c8955a')
    else this.bar(p.x - 10, p.y, 20, b.hp / STRUCTS[b.kind].hp, '#ff9f43')
  }
  // 家：建てている途中はできあがり具合、こわされていれば残り
  for (const h of this.houses) {
    if (h.stage !== this.stageIndex || !h.mesh) continue
    const s = this.projectXYZ(h.x, this.stage.heightAt(h.x, h.z) + (h.level >= 4 ? 2.4 : h.level >= 3 ? 1.9 : 1.1), h.z)
    if (!s.on) continue
    if (h.level < 3) this.bar(s.x - 10, s.y, 20, h.mats / HOUSE_STEPS[3], '#c8955a')
    else if (h.hp < houseMaxHp(h.level) - 1) this.bar(s.x - 10, s.y, 20, h.hp / houseMaxHp(h.level), '#ff9f43')
  }

  // 頭の上の目印 + HP バー
  for (const c of this.creatures) {
    if (c.state === 'dead' || (c.inside && c.state === 'sleep')) continue
    const top = this.projectXYZ(c.x, this.ground(c) + c.jy + this.size(c) + 0.15, c.z)
    if (!top.on) continue
    if (c.team === 'pet' && this.view === 'eye') continue
    if (c.team === 'pet') {
      const by = top.y - 9 + Math.round(Math.sin(this.time * 5) * 1.5)
      g.fillStyle = '#10122a'
      g.fillRect(top.x - 4, by - 1, 9, 2)
      g.fillStyle = '#ffd23f'
      for (let i = 0; i < 3; i++) g.fillRect(top.x - 3 + i, by + i, 7 - i * 2, 1)
    } else if (c.team === 'friend') {
      this.heartMark(top.x, top.y - 9)
      if (c.role !== 'free') {
        // 色だけに頼らないよう、役割ごとに形も変える（だいく = ■ / はたけがかり = ▲ / みはり = ✚）
        const rx = top.x + 6
        const ry = top.y - 9
        g.fillStyle = '#10122a'
        g.fillRect(rx - 1, ry - 1, 5, 5)
        g.fillStyle = ROLE_COLOR[c.role]
        if (c.role === 'builder') g.fillRect(rx, ry, 3, 3)
        else if (c.role === 'farmer') {
          g.fillRect(rx + 1, ry, 1, 1)
          g.fillRect(rx, ry + 1, 3, 2)
        } else {
          g.fillRect(rx + 1, ry, 1, 3)
          g.fillRect(rx, ry + 1, 3, 1)
        }
      }
    }
    else if (c.affinity > 30 && c.sp.temper === 'calm') {
      // 仲良くなりかけ：小さなハートゲージ
      g.fillStyle = 'rgba(255,126,182,0.85)'
      g.fillRect(top.x - 5, top.y - 6, Math.round(10 * Math.min(1, c.affinity / 100)), 2)
    }
    if (c.rare) this.starMark(top.x - 11, top.y - 8)
    if (c.sp.boss) continue
    if (c.state === 'fight' || c.state === 'assist' || c.hp < c.maxHp - 0.5 || c.team === 'pet') this.bar(top.x - 10, top.y - 2, 20, c.hp / c.maxHp)
  }
  this.drawBossBar()
  // たまごの残り時間
  for (const e of this.eggs) {
    const s = this.projectXYZ(e.x, this.stage.heightAt(e.x, e.z) + 0.75, e.z)
    if (s.on) this.bar(s.x - 8, s.y, 16, 1 - e.t / 35, '#7fd1ff')
  }

  for (const p of this.popups) {
    if (p.t < 0) continue
    const s = this.project(p.pos)
    if (!s.on) continue
    if (p.big) {
      // 技名：小さな札に入れて大きめに
      g.font = `11px ${FONT}`
      const w = Math.ceil(g.measureText(p.text).width) + 12
      g.fillStyle = 'rgba(10,14,40,0.8)'
      g.fillRect(s.x - w / 2, s.y - 16, w, 15)
      g.fillStyle = p.color
      g.fillRect(s.x - w / 2, s.y - 2, w, 1)
      this.text(p.text, s.x, s.y - 14, '#ffffff', 11, 'center')
    } else this.text(p.text, s.x, s.y - 6, p.color, p.text.endsWith('!') ? 12 : 10, 'center')
  }

  if (this.banner > 0) {
    const x = this.banner > 3 ? -120 + (3.5 - this.banner) * 240 : 8
    this.win(x, 30, 124, 30)
    this.text(this.stage.name, x + 8, 34, '#ffffff', 11)
    this.text(this.stage.sub, x + 8, 47, '#9fd8ff', 8)
  }

  if (this.notices.length) {
    const n = this.notices[0]
    const slide = Math.min(1, (3.4 - this.noticeT) * 5, this.noticeT * 5)
    const y = 62 - Math.round(20 * (1 - slide))
    g.font = `9px ${FONT}`
    const w = Math.min(RES.w - 16, Math.max(150, Math.ceil(g.measureText(n.sub).width) + 24))
    this.win(Math.round((RES.w - w) / 2), y, w, 30)
    this.text(n.title, RES.w / 2, y + 5, n.color, 11, 'center')
    this.text(n.sub, RES.w / 2, y + 18, '#e8eeff', 8, 'center')
  }
  this.drawSecretCard()

  const label = this.cursor >= 0 && !this.messages.length && !this.shopOpen ? `▶ ${ICONS[this.cursor]}` : this.messages[0]
  if (label) {
    this.win(8, RES.h - 60, RES.w - 16, 32)
    this.text(label, 18, RES.h - 50, '#ffffff', 11)
  }

  this.drawCard()
  if (this.showStatus) this.drawStatus()
  if (this.shopOpen) this.drawShop()
  this.drawInfo()

  if (this.night > 0.05) {
    g.fillStyle = `rgba(8,10,40,${this.night * 0.18})`
    g.fillRect(0, 24, RES.w, RES.h - 48)
  }
  this.hudTex.needsUpdate = true
}

export function drawStatus(this: World) {
  const p = this.pet
  const x = 40
  const y = 28
  this.win(x, y, 240, 178)
  this.text(this.nm(p), x + 12, y + 8, '#ffffff', 13)
  this.text(p.sp.kind, x + 12, y + 25, '#9fd8ff', 9)
  this.text(`だい${this.stats.gen}せだい`, x + 228, y + 9, '#ffd23f', 9, 'right')
  const need = p.sp.tier >= 1 && p.sp.tier <= 3 ? XP_NEED[p.sp.tier as 1 | 2 | 3] : 0
  const rows: [string, number, number, string?][] = [
    ['たいりょく', p.hp, p.maxHp], ['おなか', p.hunger, 100, '#ff9f43'], ['げんき', p.energy, 100, '#6fe7ff'],
    ['きげん', this.stats.mood, 100, '#ff7eb6'], ['しんか', need ? this.xp : 1, need || 1, '#c9a8ff'], ['じゅみょう', Math.max(0, 1 - this.stats.petAge / LIFESPAN), 1, '#9be28a'],
  ]
  rows.forEach(([n, v, m, col], i) => {
    this.text(n, x + 12, y + 40 + i * 14, '#e8eeff', 9)
    this.bar(x + 80, y + 44 + i * 14, 140, v / m, col)
  })
  const top = (Object.keys(this.care) as Care[]).sort((a, b) => this.care[b] - this.care[a])[0]
  const hint = this.care[top] > 0 ? CARE_NAME[top] : 'まだ ふつう'
  this.text(`けいこう ${hint}   こうげき ${Math.round(p.atk)}   かち ${this.stats.wins}`, x + 12, y + 130, '#ffffff', 9)
  const friends = this.creatures.filter((c) => c.team === 'friend').length
  const home = this.homeOf(p)
  const homeText = home ? ['たてはじめ', 'どだい', 'かべ', 'かんせい', 'ぞうちく'][home.level] ?? 'かんせい' : 'なし'
  this.text(`なかま ${friends}/${MAX_FRIENDS}  こども ${this.stats.children}  いえ ${homeText}`, x + 12, y + 152, '#ffe9a8', 9)
}

export function drawShop(this: World) {
  const g = this.hudCtx
  drawShopWindow(
    {
      g,
      text: (t, x, y, color, size, align) => this.text(t, x, y, color, size, align),
      win: (x, y, w, h) => this.win(x, y, w, h),
      measure: (t, size) => {
        g.font = `${size}px ${FONT}`
        return g.measureText(t).width
      },
    },
    { coins: this.coins, cursor: this.shopCursor, time: this.time, check: (it) => this.shopCheck(it) },
  )
}

export function render(this: World, renderer: THREE.WebGLRenderer) {
  if (this.diorama && this.view === 'top') {
    const s = this.stage
    this.diorama.render(renderer, this.scene, this.sun, this.hemi, {
      dt: 1 / 30, time: this.time, focus: this.look, span: Math.max(12, 11 * this.camZoom), shadows: true, shadowRes: this.high ? 1024 : 512,
      sky: this.dioSky(s), night: this.night, haze: s.fog, flash: this.flash,
    }, this.rtOut)
    return
  }
  const prev = renderer.getRenderTarget()
  renderer.setRenderTarget(this.rtScene)
  // 目線モードでは自分の体は映さない
  const self = this.pet.anim.sprite
  const was = self.visible
  if (this.view === 'eye') {
    self.visible = false
    this.pet.shadow.visible = false
  }
  renderer.render(this.scene, this.camera)
  self.visible = was
  this.pet.shadow.visible = true
  renderer.setRenderTarget(this.rtOut)
  renderer.render(this.postScene, this.postCam)
  renderer.setRenderTarget(prev)
}

/** ジオラマの空の色：くもり・あめは灰色へ、ひのこは赤へ */
export function dioSky(this: World, s: Stage): [string, string] {
  const g = new THREE.Color('#8d96ab')
  const e = new THREE.Color('#c8583a')
  const f = (c: string) => new THREE.Color(c).lerp(g, this.wx.grey * 0.8).lerp(e, this.wx.ember * 0.5).getHexString()
  return ['#' + f(s.sky[0]), '#' + f(s.sky[1])]
}

/** BGM が曲を選ぶための場面（night: 夜の度合い / army: 0 なし・1 予告・2 交戦 / villageLv: 0〜3） */
export function musicState(this: World) {
  return { night: this.night, weather: this.weather as string, stage: this.stageIndex, army: this.army ? (this.army.phase === 'warn' ? 1 : 2) : 0, villageLv: this.vLv }
}

/**
 * iPhone のウィジェット（Scriptable）用のデータ。生き物を消した「いまの景色」（PS1 風の仕上げつき）と、
 * 生き物を立たせられる場所（画面上の位置と、1 マスの高さが画面の何割か）、顔ぶれとドット絵。
 * 箱庭の動きはウィジェット側が時刻から作るので、ここは今のようすを写すだけ。
 */
export function widgetData(this: World, renderer: THREE.WebGLRenderer) {
  const S = SCENE.w
  // 生き物・飛んでいる効果・ちょうちょ などのスプライトを一時的に消す（たまごは残す）
  const keep = new Set<THREE.Object3D>(this.eggs.map((e) => e.anim.sprite))
  const hidden: THREE.Object3D[] = []
  const hide = (o: THREE.Object3D | null | undefined) => {
    if (o && o.visible) {
      o.visible = false
      hidden.push(o)
    }
  }
  for (const o of this.scene.children) if ((o as THREE.Sprite).isSprite && !keep.has(o)) hide(o)
  for (const c of this.creatures) {
    hide(c.anim.sprite)
    hide(c.shadow)
    hide(c.carryMesh)
  }
  const rt = new THREE.WebGLRenderTarget(S, S)
  const prev = renderer.getRenderTarget()
  const px = new Uint8Array(S * S * 4)
  try {
    renderer.setRenderTarget(rt)
    renderer.render(this.scene, this.camera)
    renderer.readRenderTargetPixels(rt, 0, 0, S, S, px)
  } finally {
    renderer.setRenderTarget(prev)
    rt.dispose()
    for (const o of hidden) o.visible = true
  }
  // 仕上げ（psx.ts の makePostMaterial と同じ：sRGB にして 4×4 のディザ → 15bit 色）。上下を反転
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const g = cv.getContext('2d')!
  const img = g.createImageData(S, S)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = ((S - 1 - y) * S + x) * 4
      const o = (y * S + x) * 4
      const d = (BAYER[(x & 3) + ((S - 1 - y) & 3) * 4] / 16 - 0.5) / 22
      for (let k = 0; k < 3; k++) {
        const c = Math.pow(px[i + k] / 255, 1 / 2.2) + d
        img.data[o + k] = Math.round(Math.round(Math.min(1, Math.max(0, c)) * 31) / 31 * 255)
      }
      img.data[o + 3] = 255
    }
  g.putImageData(img, 0, 0)

  // 立たせる場所：いまいる生き物の足もと + 見ている所のまわりの空いた所
  const v = new THREE.Vector3()
  const spots: { u: number; v: number; k: number }[] = []
  const addSpot = (x: number, z: number) => {
    const y = this.stage.heightAt(x, z)
    v.set(x, y, z).project(this.camera)
    if (v.z > 1 || Math.abs(v.x) > 0.92 || v.y < -0.95 || v.y > 0.75) return
    const u = (v.x + 1) / 2
    const vv = (1 - v.y) / 2
    v.set(x, y + 1, z).project(this.camera)
    const k = (1 - v.y) / 2
    const unit = vv - k
    if (unit <= 0.005 || unit > 0.6) return
    spots.push({ u: +u.toFixed(4), v: +vv.toFixed(4), k: +unit.toFixed(4) })
  }
  for (const c of this.creatures) if (c.state !== 'dead' && !c.inside) addSpot(c.x, c.z)
  for (let i = 0; i < 40 && spots.length < 24; i++) {
    const p = this.freePos(0, this.look.x, this.look.z, 6)
    addSpot(p.x, p.z)
  }

  // 顔ぶれ：ペット → 仲間 → 野生（多すぎると重いので 10 匹まで）
  const order = { pet: 0, friend: 1, wild: 2 }
  const list = this.creatures
    .filter((c) => c.state !== 'dead' && c.state !== 'faint')
    .sort((a, b) => order[a.team] - order[b.team])
    .slice(0, 10)
  const sprites: Record<string, string> = {}
  const who = list.map((c) => {
    const key = `${c.sp.id}:${this.variant(c)}`
    if (!sprites[key]) sprites[key] = portraitFor(c.sp.id, this.variant(c)).toDataURL('image/png')
    return {
      name: this.nm(c),
      sprite: key,
      team: c.team,
      foe: c.team === 'wild' && c.sp.temper === 'wild',
      night: c.sp.habit === 'night',
      float: !!c.sp.float,
      h: +this.size(c).toFixed(2),
    }
  })
  return {
    v: 1,
    at: Date.now(),
    url: location.origin + location.pathname,
    stage: this.stage.name,
    village: this.vLv > 0 ? this.villageName() : '',
    weather: this.weather,
    night: +this.night.toFixed(2),
    gen: this.stats.gen,
    houses: this.houses.filter((h) => h.stage === this.stageIndex).length,
    image: cv.toDataURL('image/jpeg', 0.86),
    spots,
    who,
    sprites,
  }
}

export function debug(this: World) {
  return {
    stage: this.stage.name,
    coins: this.coins,
    xp: this.xp,
    care: this.care,
    pet: { sp: this.pet.sp.name, state: this.pet.state, hp: Math.round(this.pet.hp), atk: this.pet.atk },
    creatures: this.creatures.map((c) => `${c.sp.name}:${c.team}:${c.state}${c.grow ? ':child' : ''}`),
    items: this.items.map((it) => `${it.kind}@${it.stage}:${it.grow.toFixed(2)}`),
    weather: this.weather,
    houses: this.houses.map((h) => `${h.ownerSp}${h.owner ? '' : '(空き家)'}@${h.stage}:L${h.level}:${h.mats}/8:hp${Math.round(h.hp)}`),
    structs: this.structs.map((b) => `${b.kind}@${b.stage}:${b.mats}/${STRUCTS[b.kind].need}:hp${Math.round(b.hp)}`),
    gen: `だい${this.stats.gen}せだい age=${Math.round(this.stats.petAge)}s dex=${Object.keys(this.dex).length} land=${this.land}`,
    roles: this.creatures.filter((c) => c.role !== 'free').map((c) => `${c.sp.name}:${c.role}`),
    village: `${this.villageName()} ★${this.vScore} L${this.vLv}`,
    road: `ch${this.road.cleared} wins=${this.road.wins} boss=${this.road.bossWins}/${this.road.bossTry} done=${[...this.road.done].join(',')}`,
    army: this.army ? `${this.army.phase}:${Math.ceil(this.army.t)}s:${this.army.left.length}/${this.army.n}` : null,
    festival: this.festival ? `${Math.ceil(this.festival.t)}s dancers=${this.creatures.filter((c) => c.state === 'dance').length}` : `cd=${Math.round(this.festivalCd)}`,
    peddler: this.peddler ? `${this.peddler.phase}:${this.peddler.t.toFixed(1)}` : `cd=${Math.round(this.peddlerCd)}`,
    resources: this.resources.length,
    eggs: this.eggs.length,
    foods: this.foods.length,
  }
}
