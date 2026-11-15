/** World.ts から分けた「war」のメソッド。this は World（World.ts のクラスのつなぎの行から呼ばれる） */
/**
 * 中身：大きな世界の 戦争（2026-11-15・ぜんぶ 自動）。
 * - 味方の 森と 敵の いせきの ほかの 7 地方の まんなかに 拠点（`Outpost`）。はじめは だれの 物でもなく、その 地方の 敵が まもる
 * - 味方と 敵は ときどき 自分の 城から 部隊（`Creature.squad`）を 出して、自分の 陣地の となりの 拠点を 攻める
 * - 拠点の そばに 相手が いない まま 15 秒 いると とれる（旗の 色が かわる）。相手が 来れば とりかえされる
 * - 味方の 拠点：その 地方の 資材・食べ物が 町に とどき、その 系統の 子も ひっこしてくる / 敵の 拠点：敵の 城が はやく 育つ
 */
import * as THREE from 'three'
import { armyMember, type EggKind, type SpeciesId } from '../monsters'
import type { World } from '../World'
import { Creature } from '../World'

export type Side = 'ally' | 'foe' | 'none'
export interface Outpost { tile: number; x: number; z: number; owner: Side; hold: number; mesh: THREE.Group | null; name: string }

const CAPTURE = 15
const near = (a: { x: number; z: number }, b: { x: number; z: number }, r: number) => Math.hypot(a.x - b.x, a.z - b.z) < r
const adj = (a: number, b: number) => Math.abs((a % 3) - (b % 3)) + Math.abs(Math.floor(a / 3) - Math.floor(b / 3)) === 1

/** 地方の 番号（0〜8） */
export function tileAt(this: World, x: number, z: number) {
  const t = this.stage.tiles
  if (!t) return -1
  let best = 0
  let bd = Infinity
  t.forEach((o, i) => {
    const d = Math.max(Math.abs(o.ox - x), Math.abs(o.oz - z))
    if (d < bd) {
      bd = d
      best = i
    }
  })
  return best
}

/** 大きな世界を 読んだ 時：拠点を 置く（持ち主は セーブから） */
export function setupWar(this: World, saved?: Record<string, Side>) {
  for (const o of this.outposts) if (o.mesh) this.scene.remove(o.mesh)
  this.outposts = []
  const t = this.stage.tiles
  if (!t || !this.stage.start || !this.stage.foeStart) return
  const home = this.tileAt(this.stage.start.x, this.stage.start.z)
  const foe = this.tileAt(this.stage.foeStart.x, this.stage.foeStart.z)
  t.forEach((o, i) => {
    if (i === home || i === foe) return
    const p = this.freePos(0, o.ox, o.oz, 7)
    if (Math.hypot(p.x - o.ox, p.z - o.oz) > 12) return
    const s = saved?.[i]
    const op: Outpost = { tile: i, x: p.x, z: p.z, owner: s === 'ally' || s === 'foe' ? s : 'none', hold: 0, mesh: null, name: o.name }
    this.outposts.push(op)
    this.mountOutpost(op)
  })
}

/** 拠点の 形：石の 台・くいの さく・旗（持ち主の 色） */
export function mountOutpost(this: World, op: Outpost) {
  if (op.mesh) this.scene.remove(op.mesh)
  const g = new THREE.Group()
  const col = op.owner === 'ally' ? '#4a8adf' : op.owner === 'foe' ? '#c8404a' : '#b8b0a0'
  const stone = this.sharedLam('#9a958c')
  const wood = this.sharedLam('#7a5a3a')
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.3, 8), stone)
  base.position.y = 0.15
  g.add(base)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    if (i === 2) continue // 入口
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.9 + (i % 2) * 0.2, 5), wood)
    st.position.set(Math.cos(a) * 1.9, 0.45, Math.sin(a) * 1.9)
    g.add(st)
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.2, 6), wood)
  pole.position.y = 1.6
  g.add(pole)
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.04), this.lam(col))
  flag.position.set(0.48, 2.85, 0)
  flag.name = 'flag'
  g.add(flag)
  g.position.set(op.x, this.stage.heightAt(op.x, op.z) - 0.05, op.z)
  this.scene.add(g)
  op.mesh = g
}

/** 味方が もっている 拠点の 地方の 系統（ひっこしの 子が くる） */
export function ownedFamilies(this: World): EggKind[] {
  return this.outposts.filter((o) => o.owner === 'ally').map((o) => this.stage.region!(o.x, o.z).family)
}

/** その 陣地の となりで、まだ じぶんの でない 拠点（近い 順） */
function targets(w: World, side: 'ally' | 'foe') {
  const st = side === 'ally' ? w.stage.start! : w.stage.foeStart!
  const homeTile = w.tileAt(st.x, st.z)
  const mine = [homeTile, ...w.outposts.filter((o) => o.owner === side).map((o) => o.tile)]
  return w.outposts
    .filter((o) => o.owner !== side && mine.some((m) => adj(m, o.tile)))
    .sort((a, b) => Math.hypot(a.x - st.x, a.z - st.z) - Math.hypot(b.x - st.x, b.z - st.z))
}

/** 1 秒ごと：部隊を 出す・拠点を とる・とった 拠点の めぐみ */
export function updateWar(this: World, dt: number) {
  if (!this.outposts.length) return
  this.warT -= dt
  if (this.warT > 0) return
  this.warT = 1
  const allies = this.creatures.filter((c) => this.ally(c) && this.alive(c))
  // 味方の 部隊：おとなが 3 匹 から。1 匹は 町に のこす
  if ((this.allySquadT -= 1) <= 0) {
    this.allySquadT = 100 + Math.random() * 60
    const tg = targets(this, 'ally')[0]
    const free = allies.filter((c) => c !== this.pet && c.grow === 0 && c.sp.tier >= 2 && c.hp > c.maxHp * 0.6 && (c.squad ?? -1) < 0)
    if (tg && free.length >= 3 && !this.army) {
      const n = Math.min(5, free.length - 1)
      free.sort((a, b) => b.atk - a.atk)
      for (const c of free.slice(0, n)) {
        this.dropCarry(c, true)
        if (c.res) c.res.taken = null
        c.res = null
        c.site = null
        c.squad = this.outposts.indexOf(tg)
        this.setState(c, 'idle', 0.2)
      }
      this.say(`${tg.name}の きょてんへ ${n}ひきの ぶたいが しゅつじん！`)
      this.mark(this.stage.start!.x, this.stage.start!.z, 3)
    }
  }
  // 敵の 部隊：敵の 城の 大きさで ふえる（生きている 部隊は 10 ぴきまで）
  if ((this.foeSquadT -= 1) <= 0) {
    this.foeSquadT = 150 + Math.random() * 70
    const tg = targets(this, 'foe')[0]
    const alive = this.creatures.filter((c) => c.squadFoe && this.alive(c)).length
    if (tg && alive < 10 && this.foeWorkers() > 0) {
      const fs = this.stage.foeStart!
      const n = Math.min(10 - alive, 2 + Math.floor((this.foeRooms[this.stageIndex] ?? 0) / 4))
      const ti = this.outposts.indexOf(tg)
      const a0 = Math.atan2(tg.z - fs.z, tg.x - fs.x)
      for (let i = 0; i < n; i++) {
        const p = this.freePos(0, fs.x + Math.cos(a0) * 8, fs.z + Math.sin(a0) * 8, 3)
        const c = this.spawn(armyMember(this.regionId(tg.x, tg.z), 1) as SpeciesId, 'wild', p.x, p.z)
        c.squad = ti
        c.squadFoe = true
      }
      if (tg.owner === 'ally' || near(tg, this.look, 30)) this.say(`てきの ぶたいが ${tg.name}の きょてんへ むかった…`)
    }
  }
  // 拠点の とりあい
  for (const op of this.outposts) {
    const A = allies.filter((c) => near(c, op, 4)).length
    const F = this.creatures.filter((c) => this.alive(c) && c.sp.temper === 'wild' && near(c, op, 4)).length
    const FS = this.creatures.filter((c) => this.alive(c) && c.squadFoe && near(c, op, 4)).length
    let to: Side | null = null
    if (A > 0 && F === 0 && op.owner !== 'ally') to = 'ally'
    else if (FS > 0 && A === 0 && op.owner !== 'foe') to = 'foe'
    if (!to) {
      op.hold = Math.max(0, op.hold - 1 / CAPTURE)
      continue
    }
    op.hold += (to === 'ally' ? Math.min(3, A) : Math.min(3, FS)) / CAPTURE
    if (op.hold < 1) continue
    op.hold = 0
    const before = op.owner
    op.owner = to
    this.mountOutpost(op)
    this.mark(op.x, op.z, 3)
    this.onSfx(to === 'ally' ? 'win' : 'alarm')
    if (to === 'ally') {
      this.say(`${op.name}の きょてんを とった！ ${this.stage.region!(op.x, op.z).family === 'bird' ? '' : ''}めぐみが まちに とどく`)
      this.stat('outposts')
      this.earn(20, op.x, op.z)
      // 部隊は 町へ かえる
      for (const c of allies) if (c.squad === this.outposts.indexOf(op)) c.squad = -1
    } else this.say(before === 'ally' ? `${op.name}の きょてんを てきに とられた…` : `てきが ${op.name}の きょてんを とった`)
  }
  // めぐみ：60 秒ごとに 味方の 拠点 1 つにつき 資材 1 つと 食べ物 1 つを 町の そばに。敵の 拠点は 敵の 城を 育てる
  if ((this.boonT -= 1) <= 0) {
    this.boonT = 60
    const t = this.townCenter()
    for (const op of this.outposts) {
      if (op.owner === 'ally') {
        this.spawnResource(t.x + (Math.random() - 0.5) * 10, t.z + (Math.random() - 0.5) * 10, undefined, true)
        this.dropFood(t.x + (Math.random() - 0.5) * 8, t.z + (Math.random() - 0.5) * 8)
      } else if (op.owner === 'foe' && Math.random() < 0.3) this.foeT = Math.min(this.foeT, 1)
    }
  }
}

/** 部隊の 子の 考え（think の 頭から）：とちゅうの 敵と たたかい、拠点まで 行って まもる。true = 行動を きめた */
export function squadThink(this: World, c: Creature): boolean {
  const i = c.squad ?? -1
  if (i < 0) return false
  const op = this.outposts[i]
  const mine: Side = c.squadFoe ? 'foe' : 'ally'
  // とれた（味方の 部隊は 町へ かえる）・拠点が ない
  if (!op || (mine === 'ally' && op.owner === 'ally')) {
    c.squad = -1
    return false
  }
  if (mine === 'ally' && (c.hp < c.maxHp * 0.3 || c.hunger < 15 || c.energy < 12)) {
    c.squad = -1
    return false
  }
  const foe = this.nearest(c, (o) => (mine === 'ally' ? o.sp.temper === 'wild' && !o.inside : this.ally(o)), 7)
  if (foe) {
    c.foe = foe
    this.setState(c, 'hunt', 8)
    return true
  }
  if (!near(c, op, 2.6)) {
    c.tx = op.x + (Math.random() - 0.5) * 2.4
    c.tz = op.z + (Math.random() - 0.5) * 2.4
    this.setState(c, 'campaign', 30)
    return true
  }
  // 敵の 部隊は とった あとも しばらく まもる
  this.setState(c, 'idle', 2 + Math.random() * 2)
  return true
}

/** 町の まんなかの 情報ウィンドウに 出す 戦況 */
export function warLine(this: World) {
  if (!this.outposts.length) return ''
  const a = this.outposts.filter((o) => o.owner === 'ally').length
  const f = this.outposts.filter((o) => o.owner === 'foe').length
  return `きょてん みかた ${a}・てき ${f}・のこり ${this.outposts.length - a - f}`
}
