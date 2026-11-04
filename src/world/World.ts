import * as THREE from 'three'
import { RES, makePostMaterial, psx } from './psx'
import { SpriteAnim, iconSheet, type Sheet } from './sprites'
import { BRANCH, SPECIES, sheetFor, type Care, type Species, type SpeciesId } from './monsters'
import { HALF, STAGES, type Stage } from './stages'

/**
 * 箱庭の世界。モンスターが自分で考えて暮らす（歩く・食べる・眠る・遊ぶ・戦う・仲間になる・たまごを産む）。
 * 人は「環境」を用意して見守る：ショップで食べ物や置き物を買って箱庭に置く。
 * 描画は 320×240 の RenderTarget → PS1 風の仕上げ → 本体の液晶 / 全画面 に使う。
 */

export type Sfx = 'select' | 'ok' | 'cancel' | 'hit' | 'crit' | 'win' | 'lose' | 'eat' | 'warp' | 'evolve' | 'train' | 'coin' | 'friend' | 'egg'
type Team = 'pet' | 'friend' | 'wild'
type State =
  | 'idle' | 'wander' | 'hunt' | 'fight' | 'assist' | 'seek' | 'eat' | 'sleep' | 'rest' | 'play'
  | 'happy' | 'faint' | 'dead' | 'train' | 'come'

interface Creature {
  sp: Species; team: Team; anim: SpriteAnim; shadow: THREE.Mesh
  x: number; z: number; jy: number; vy: number; kx: number; kz: number
  hp: number; maxHp: number; atk: number; hunger: number; energy: number
  state: State; t: number; tx: number; tz: number; foe: Creature | null; food: Food | null
  cd: number; lunge: number; hurt: number; fx: number; phase: number
  /** 仲良し度（100 で仲間になる） */
  affinity: number
  /** こども：0 = おとな、0〜1 = 成長中 */
  grow: number
}
type FoodKind = 'stage' | 'meat' | 'sweet' | 'nut'
interface Food { mesh: THREE.Group; x: number; z: number; y: number; vy: number; landed: boolean; taken: Creature | null; bite: number; kind: FoodKind }
type ItemKind = 'sapling' | 'ball' | 'fire' | 'charm'
interface Item { kind: ItemKind; stage: number; x: number; z: number; grow: number; vx: number; vz: number; mesh: THREE.Group | null; light?: THREE.PointLight }
interface Egg { x: number; z: number; t: number; anim: SpriteAnim; shadow: THREE.Mesh; parents: SpeciesId[] }
interface Popup { pos: THREE.Vector3; text: string; color: string; t: number }
interface Fx { sprite: THREE.Sprite; vx: number; vy: number; vz: number; life: number; max: number; grav: number }

export const ICONS = ['ごはん', 'トレーニング', 'バトル', 'ステータス', 'ライト', 'ショップ', 'ワープ', 'よびだし']
const ICON_COLORS = ['#ff9f43', '#ff5e5e', '#ffd23f', '#ff7eb6', '#fff27a', '#ffb84d', '#a98bff', '#7cf29b']
const ICON_BMP = [
  ['..#.#.#..', '...#.#...', '.........', '#########', '#.......#', '#.......#', '.#.....#.', '..#####..', '...###...'],
  ['.........', '##.....##', '##.....##', '##.....##', '#########', '##.....##', '##.....##', '##.....##', '.........'],
  ['....#....', '#...#...#', '.#.###.#.', '..#####..', '#########', '..#####..', '.#.###.#.', '#...#...#', '....#....'],
  ['.##...##.', '####.####', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....', '.........'],
  ['...###...', '..#...#..', '.#.....#.', '.#.....#.', '.#.....#.', '..#...#..', '...###...', '...###...', '....#....'],
  ['..#...#..', '...###...', '..#####..', '.##...##.', '##.###.##', '##.#...##', '##.###.##', '.##...##.', '..#####..'],
  ['..#####..', '.#.....#.', '#..###..#', '#.#...#.#', '#.#.#.#.#', '#.#..##.#', '#..#....#', '.#..####.', '..#......'],
  ['...###...', '..#####..', '..#####..', '..#####..', '...###...', '...###...', '.........', '...###...', '...###...'],
]

/** 食べ物の種類（何を食べさせるかで育つ傾向が変わる） */
const FOODS: Record<Exclude<FoodKind, 'stage'>, { name: string; color: string; leaf: string; hunger: number; mood: number; care: Care }> = {
  meat: { name: 'スタミナにく', color: '#d9534f', leaf: '#f4ead6', hunger: 45, mood: 5, care: 'power' },
  sweet: { name: 'あまいみ', color: '#ff8fd8', leaf: '#7cf29b', hunger: 25, mood: 20, care: 'spirit' },
  nut: { name: 'かたいナッツ', color: '#b07a3a', leaf: '#6d4c41', hunger: 35, mood: 5, care: 'guard' },
}
const CARE_NAME: Record<Care, string> = { power: 'ちから', guard: 'まもり', spirit: 'こころ' }

interface ShopItem { id: string; name: string; price: number; desc: string; food?: Exclude<FoodKind, 'stage'>; item?: ItemKind; max?: number }
const SHOP: ShopItem[] = [
  { id: 'meat', name: 'スタミナにく', price: 30, desc: 'ちからの けいこうが そだつ', food: 'meat' },
  { id: 'sweet', name: 'あまいみ', price: 20, desc: 'きげん UP・こころが そだつ', food: 'sweet' },
  { id: 'nut', name: 'かたいナッツ', price: 25, desc: 'まもりの けいこうが そだつ', food: 'nut' },
  { id: 'sapling', name: 'なえ', price: 40, desc: 'うえると みのなる木に そだつ', item: 'sapling', max: 4 },
  { id: 'ball', name: 'ボール', price: 30, desc: 'みんなが かってに あそぶ', item: 'ball', max: 1 },
  { id: 'fire', name: 'たき火', price: 50, desc: 'よる あつまって ねむる・たまごが できやすい', item: 'fire', max: 1 },
  { id: 'charm', name: 'おまもり', price: 60, desc: 'ノイズが あらわれにくくなる', item: 'charm', max: 1 },
]

const FX_SHEETS = () => ({
  heart: iconSheet(['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'], { '#': '#ff4d7a' }),
  spark: iconSheet(['...#...', '...#...', '..###..', '#######', '..###..', '...#...', '...#...'], { '#': '#fff27a' }),
  zzz: iconSheet(['#####', '...#.', '..#..', '.#...', '#####'], { '#': '#cfe6ff' }),
  cube: iconSheet(['###', '###', '###'], { '#': '#5ef2ff' }),
  hit: iconSheet(['#...#', '.#.#.', '..#..', '.#.#.', '#...#'], { '#': '#ffffff' }),
  coin: iconSheet(['.###.', '##.##', '#.#.#', '##.##', '.###.'], { '#': '#ffd23f' }),
})
const EGG_SHEET = () =>
  iconSheet(
    ['...###...', '..#####..', '.##o####.', '.#######.', '##o###o##', '#########', '###o#####', '.#######.', '..#####..'],
    { '#': '#fff6e8', o: '#7fd1ff' },
  )

/** 少し見下ろす箱庭カメラ（手前の木でキャラが隠れにくい角度） */
const CAM_OFF = new THREE.Vector3(0, 6.6, 5.8)
const FONT = '"DotGothic16", ui-monospace, monospace'
const SAVE_KEY = 'pulsar-save-v1'
const MAX_FRIENDS = 5

export class World {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(42, RES.w / RES.h, 0.1, 160)
  private readonly rtScene = new THREE.WebGLRenderTarget(RES.w, RES.h, { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter })
  private readonly rtOut = new THREE.WebGLRenderTarget(RES.w, RES.h, { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter })
  private readonly hud = document.createElement('canvas')
  private readonly hudCtx: CanvasRenderingContext2D
  private readonly hudTex: THREE.CanvasTexture
  private readonly post: THREE.ShaderMaterial
  private readonly postScene = new THREE.Scene()
  private readonly postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  private readonly hemi = new THREE.HemisphereLight()
  private readonly sun = new THREE.DirectionalLight()
  private stage!: Stage
  stageIndex = 0
  private creatures: Creature[] = []
  pet!: Creature
  private foods: Food[] = []
  private items: Item[] = []
  private eggs: Egg[] = []
  private popups: Popup[] = []
  private fx: Fx[] = []
  private fxSheets = FX_SHEETS()
  private eggSheet = EGG_SHEET()
  private shadowGeo = new THREE.CircleGeometry(0.5, 10).rotateX(-Math.PI / 2)
  private shadowMat = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3, depthWrite: false })

  cursor = -1
  private messages: string[] = []
  private msgT = 0
  private showStatus = false
  private shopOpen = false
  private shopCursor = 0
  private banner = 0
  night = 0
  private nightTarget = 0
  private time = 0
  private foodT = 0
  private breedT = 0
  private breedCd = 30
  private incomeT = 0
  private saveT = 0
  private respawn: { id: SpeciesId; t: number }[] = []
  private warp = 0
  private warpSwitched = true
  private flash = 0
  private look = new THREE.Vector3()
  coins = 50
  care: Record<Care, number> = { power: 0, guard: 0, spirit: 0 }
  xp = 0
  stats = { trains: 0, wins: 0, mood: 80, born: Date.now(), children: 0 }
  onSfx: (s: Sfx) => void = () => {}

  constructor() {
    this.hud.width = RES.w
    this.hud.height = RES.h
    this.hudCtx = this.hud.getContext('2d')!
    this.hudTex = new THREE.CanvasTexture(this.hud)
    this.hudTex.magFilter = THREE.NearestFilter
    this.hudTex.minFilter = THREE.NearestFilter
    this.post = makePostMaterial(this.rtScene.texture, this.hudTex)
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post))
    this.scene.add(this.hemi, this.sun)
    if (!this.load()) {
      this.loadStage(0)
      this.pet = this.spawn('mebu', 'pet', 0, 1.5)
      this.say('メブが うまれた！')
    }
    document.addEventListener('visibilitychange', () => document.hidden && this.save())
  }

  /** 液晶に貼る最終テクスチャ */
  get texture() {
    return this.rtOut.texture
  }

  // ================= ステージ =================
  private loadStage(i: number) {
    if (this.stage) {
      this.scene.remove(this.stage.group)
      this.stage.dispose()
    }
    // ペットと仲間は一緒にワープする。野生は置いていく
    for (const c of this.creatures.filter((c) => c.team === 'wild')) this.remove(c)
    this.creatures = this.creatures.filter((c) => c.team !== 'wild')
    for (const f of [...this.foods]) this.removeFood(f)
    for (const it of this.items) this.unmountItem(it)
    for (const e of this.eggs) this.scene.remove(e.anim.sprite, e.shadow)
    this.eggs = []
    this.respawn = []
    this.stageIndex = i
    this.stage = STAGES[i]()
    const s = this.stage
    this.scene.add(s.group)
    this.scene.fog = new THREE.Fog(s.fog, 14, 34)
    this.hemi.color.set(s.hemi[0])
    this.hemi.groundColor.set(s.hemi[1])
    this.sun.color.set(s.sun.color)
    this.sun.position.set(...s.sun.dir)
    this.applyLight()
    for (const it of this.items) if (it.stage === i) this.mountItem(it)
    s.residents.forEach((id) => {
      if (id === 'noiz' && this.hasItem('charm') && Math.random() < 0.7) return
      const p = this.freePos(3)
      this.spawn(id, 'wild', p.x, p.z)
    })
    for (let k = 0; k < 3; k++) this.dropFood()
    let k = 0
    for (const c of this.creatures) {
      c.x = (k % 3) - 1
      c.z = 1.5 + Math.floor(k / 3) * 0.8
      c.foe = null
      c.food = null
      this.setState(c, 'happy', 1.5)
      k++
    }
    this.banner = 3.5
  }

  private applyLight() {
    const s = this.stage
    const k = 1 - this.night * 0.68
    this.hemi.intensity = s.hemi[2] * k
    this.sun.intensity = s.sun.intensity * k
    const fog = this.scene.fog as THREE.Fog
    fog.color.set(s.fog).multiplyScalar(1 - this.night * 0.7)
    this.scene.background = fog.color
  }

  // ================= 生き物 =================
  private spawn(id: SpeciesId, team: Team, x: number, z: number, grow = 0): Creature {
    const sp = SPECIES[id]
    const anim = new SpriteAnim(sheetFor(id), sp.height, 'idle')
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat)
    this.scene.add(anim.sprite, shadow)
    const c: Creature = {
      sp, team, anim, shadow, x, z, jy: 0, vy: 0, kx: 0, kz: 0,
      hp: sp.hp, maxHp: sp.hp, atk: sp.atk, hunger: 60 + Math.random() * 40, energy: 60 + Math.random() * 40,
      state: 'idle', t: Math.random() * 2, tx: x, tz: z, foe: null, food: null, cd: 0, lunge: 0, hurt: 0, fx: 0,
      phase: Math.random() * 10, affinity: 0, grow,
    }
    this.creatures.push(c)
    this.burst(x, this.ground(c) + 0.5, z, 'cube', 8, 2)
    return c
  }

  private remove(c: Creature) {
    this.scene.remove(c.anim.sprite, c.shadow)
    c.anim.dispose()
  }

  private alive(c: Creature | null): c is Creature {
    return !!c && c.state !== 'dead' && c.state !== 'faint' && this.creatures.includes(c)
  }

  private ally(c: Creature) {
    return c.team === 'pet' || c.team === 'friend'
  }

  private size(c: Creature) {
    return c.sp.height * (c.grow > 0 ? 0.55 + 0.45 * c.grow : 1)
  }

  private ground(c: Creature) {
    return this.stage.heightAt(c.x, c.z) + (c.sp.float ? 0.35 + Math.sin(this.time * 2 + c.phase) * 0.12 : 0)
  }

  private moveTo(c: Creature, tx: number, tz: number, speed: number, dt: number) {
    const dx = tx - c.x
    const dz = tz - c.z
    const d = Math.hypot(dx, dz)
    if (d < 0.05) return d
    // 坂道を登るときは少し遅くなる
    const slope = this.stage.heightAt(c.x + (dx / d) * 0.3, c.z + (dz / d) * 0.3) - this.stage.heightAt(c.x, c.z)
    const step = Math.min(d, speed * dt * (slope > 0 ? Math.max(0.55, 1 - slope * 1.5) : 1))
    // 進む先にある木や岩をよける（簡易ステアリング）
    let ux = dx / d
    let uz = dz / d
    for (const o of this.obstacles()) {
      if (o.water && c.sp.float) continue
      const vx = o.x - c.x
      const vz = o.z - c.z
      const ahead = vx * ux + vz * uz
      if (ahead <= 0 || ahead > 1.6 || ahead > d) continue
      const px = vx - ahead * ux
      const pz = vz - ahead * uz
      const side = Math.hypot(px, pz)
      const clear = o.r + 0.5
      if (side < clear) {
        const push = (1 - side / clear) * 1.8
        const nx = side > 1e-3 ? px / side : uz
        const nz = side > 1e-3 ? pz / side : -ux
        ux -= nx * push
        uz -= nz * push
      }
    }
    const ul = Math.hypot(ux, uz) || 1
    c.x += (ux / ul) * step
    c.z += (uz / ul) * step
    if (Math.abs(ux) > 0.05) c.anim.facing = ux > 0 ? 1 : -1
    return d
  }

  /** ステージの障害物 + 置き物 */
  private obstacles() {
    const extra = this.items
      .filter((it) => it.stage === this.stageIndex && (it.kind === 'fire' || it.kind === 'charm' || (it.kind === 'sapling' && it.grow >= 1)))
      .map((it) => ({ x: it.x, z: it.z, r: it.kind === 'sapling' ? 0.35 : 0.3, water: false }))
    return [...this.stage.obstacles, ...extra]
  }

  private collide(c: Creature) {
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

  private setState(c: Creature, s: State, t = 0) {
    c.state = s
    c.t = t
  }

  private item(kind: ItemKind) {
    return this.items.find((it) => it.kind === kind && it.stage === this.stageIndex && it.mesh)
  }
  private hasItem(kind: ItemKind) {
    return this.items.some((it) => it.kind === kind && it.stage === this.stageIndex)
  }

  /** 何をするか決める（お腹・眠気・性格・まわりの状況・置き物から） */
  private think(c: Creature) {
    const wild = c.sp.temper === 'wild'
    const p = this.pet
    if (wild && c.energy > 25) {
      const range = this.hasItem('charm') ? 2.2 : 4.5
      const prey = this.nearest(c, (o) => this.ally(o) || o.sp.temper === 'calm', range)
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
    if (c.team === 'pet' && c.hp > c.maxHp * 0.5 && c.energy > 30) {
      const enemy = this.nearest(c, (o) => o.sp.temper === 'wild', 3)
      if (enemy) {
        c.foe = enemy
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
      return this.setState(c, 'sleep', 6 + Math.random() * 6)
    }
    const ball = this.item('ball')
    if (ball && !wild && c.energy > 40 && Math.random() < 0.25 && Math.hypot(ball.x - c.x, ball.z - c.z) < 8) return this.setState(c, 'play', 6)
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

  private nearest(c: Creature, pred: (o: Creature) => boolean, range: number) {
    let best: Creature | null = null
    let bd = range
    for (const o of this.creatures) {
      if (o === c || !this.alive(o) || !pred(o)) continue
      const d = Math.hypot(o.x - c.x, o.z - c.z)
      if (d < bd) {
        bd = d
        best = o
      }
    }
    return best
  }

  private startFight(a: Creature, b: Creature) {
    a.foe = b
    b.foe = a
    this.setState(a, 'fight')
    this.setState(b, 'fight')
    a.cd = 0.4
    b.cd = 0.9
    if (a.team === 'pet' || b.team === 'pet') {
      const other = a.team === 'pet' ? b : a
      this.say(`${other.sp.name}と バトル！`)
      this.onSfx('ok')
    }
    for (const c of [a, b])
      if (c.food) {
        c.food.taken = null
        c.food = null
      }
  }

  private attack(a: Creature, b: Creature) {
    a.lunge = 0.22
    const crit = Math.random() < 0.12
    // まもりの傾向が強いペットは少し硬い
    const guard = b.team === 'pet' ? 1 - Math.min(0.3, this.care.guard * 0.01) : 1
    const dmg = Math.max(1, Math.round(a.atk * (0.75 + Math.random() * 0.5) * (crit ? 1.8 : 1) * guard))
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
    if (b.hp <= 0) this.defeat(b, a)
  }

  private defeat(loser: Creature, winner: Creature) {
    winner.foe = null
    this.setState(winner, 'happy', 1.8)
    loser.foe = null
    if (this.ally(loser)) {
      loser.hp = 1
      this.setState(loser, 'faint', 6)
      this.say(`${loser.sp.name}は たおれてしまった…`)
      if (loser.team === 'pet') this.onSfx('lose')
      return
    }
    this.setState(loser, 'dead', 1)
    if (!(loser.sp.id === 'noiz' && this.hasItem('charm') && Math.random() < 0.6)) this.respawn.push({ id: loser.sp.id, t: 14 + Math.random() * 10 })
    if (this.ally(winner)) {
      const p = this.pet
      this.stats.wins++
      p.atk += 1
      p.maxHp += 3
      this.care.power += 1
      this.gainXp(5)
      this.earn(10, loser.x, loser.z)
      this.say(`${winner.sp.name}の かち！ ちから+1`)
      this.onSfx('win')
      // 守ってもらった野生の子は仲良し度が上がる
      for (const o of this.creatures) if (o.team === 'wild' && o.sp.temper === 'calm' && Math.hypot(o.x - p.x, o.z - p.z) < 5) o.affinity += 25
    }
  }

  // ================= 成長・進化・お金 =================
  private gainXp(n: number) {
    this.xp += n
    const p = this.pet
    const tier = p.sp.tier
    if (tier !== 1 && tier !== 2) return
    const need = tier === 1 ? 15 : 45
    if (this.xp >= need && p.state !== 'fight') {
      const top = (Object.keys(this.care) as Care[]).sort((a, b) => this.care[b] - this.care[a])[0]
      this.evolve(p, BRANCH[tier][top])
    }
  }

  private evolve(c: Creature, to: SpeciesId) {
    const from = c.sp.name
    const sp = SPECIES[to]
    c.sp = sp
    c.maxHp = Math.max(c.maxHp + 10, sp.hp)
    c.hp = c.maxHp
    c.atk = Math.max(c.atk + 2, sp.atk)
    c.anim.setSheet(sheetFor(to) as Sheet, this.size(c))
    this.flash = 1
    this.burst(c.x, this.ground(c) + 0.6, c.z, 'spark', 18, 3)
    this.say(`${from}は ${sp.name}に しんかした！`)
    this.onSfx('evolve')
    this.earn(30)
  }

  private earn(n: number, x?: number, z?: number) {
    this.coins += n
    if (x !== undefined && z !== undefined) this.burst(x, this.stage.heightAt(x, z) + 0.6, z, 'coin', Math.min(6, 1 + Math.floor(n / 5)), 2)
    this.onSfx('coin')
  }

  // ================= たべもの =================
  private makeFoodMesh(kind: FoodKind) {
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

  dropFood(x?: number, z?: number, from = 2.5, kind: FoodKind = 'stage') {
    if (x === undefined || z === undefined) {
      const spots = [...this.stage.foodSpots, ...this.items.filter((it) => it.stage === this.stageIndex && it.kind === 'sapling' && it.grow >= 1)]
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

  private removeFood(f: Food) {
    this.scene.remove(f.mesh)
    f.mesh.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      ;(m.material as THREE.Material | undefined)?.dispose()
    })
    const i = this.foods.indexOf(f)
    if (i >= 0) this.foods.splice(i, 1)
  }

  // ================= 置き物（箱庭づくり）=================
  private lam(color: string, extra: THREE.MeshLambertMaterialParameters = {}) {
    return psx(new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }))
  }

  private mountItem(it: Item) {
    const g = new THREE.Group()
    if (it.kind === 'sapling') {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1, 6), this.lam('#6d4c41'))
      trunk.position.y = 0.5
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), this.lam('#5cc25a'))
      leaf.position.y = 1.4
      g.add(trunk, leaf)
      const fc = this.stage.food.color
      for (let k = 0; k < 3; k++) {
        const fr = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), this.lam(fc))
        fr.position.set(Math.cos(k * 2.1) * 0.62, 1.3 + k * 0.12, Math.sin(k * 2.1) * 0.62)
        fr.name = 'fruit'
        g.add(fr)
      }
    } else if (it.kind === 'ball') {
      const a = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), this.lam('#ff5e5e'))
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), this.lam('#ffffff'))
      g.add(a, b)
    } else if (it.kind === 'fire') {
      const log = this.lam('#7a4e2d')
      for (const r of [0.6, -0.6]) {
        const l = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 5), log)
        l.rotation.set(Math.PI / 2, r, 0)
        l.position.y = 0.08
        g.add(l)
      }
      for (const [c, s, y] of [['#ff6b2a', 0.24, 0.3], ['#ffd23f', 0.15, 0.36]] as const) {
        const fl = new THREE.Mesh(new THREE.ConeGeometry(s, 0.5, 5), new THREE.MeshBasicMaterial({ color: c }))
        fl.position.y = y
        fl.name = 'flame'
        g.add(fl)
      }
      it.light = new THREE.PointLight('#ff9a4a', 0, 6, 1.5)
      it.light.position.y = 0.6
      g.add(it.light)
    } else {
      const stone = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), this.lam('#9aa1ab'))
      stone.position.y = 0.3
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: '#5ef2ff' }))
      gem.position.y = 0.95
      gem.name = 'gem'
      g.add(stone, gem)
    }
    g.position.set(it.x, this.stage.heightAt(it.x, it.z), it.z)
    this.scene.add(g)
    it.mesh = g
  }

  private unmountItem(it: Item) {
    if (!it.mesh) return
    this.scene.remove(it.mesh)
    it.mesh.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      ;(m.material as THREE.Material | undefined)?.dispose?.()
    })
    it.mesh = null
    it.light = undefined
  }

  private placeItem(kind: ItemKind) {
    const p = this.freePos(1.2, this.look.x, this.look.z, 3)
    const it: Item = { kind, stage: this.stageIndex, x: p.x, z: p.z, grow: kind === 'sapling' ? 0 : 1, vx: 0, vz: 0, mesh: null }
    this.items.push(it)
    this.mountItem(it)
    this.burst(it.x, this.stage.heightAt(it.x, it.z) + 0.4, it.z, 'spark', 8, 2)
  }

  private updateItems(dt: number) {
    for (const it of this.items) {
      if (it.stage !== this.stageIndex || !it.mesh) continue
      if (it.kind === 'sapling') {
        if (it.grow < 1) {
          it.grow = Math.min(1, it.grow + dt / 60)
          if (it.grow >= 1) {
            this.say('なえが そだって 木に なった！ みが なるよ')
            this.dropFood(it.x + 0.8, it.z)
          }
        }
        it.mesh.scale.setScalar(0.25 + 0.75 * it.grow)
        it.mesh.children.forEach((o) => o.name === 'fruit' && (o.visible = it.grow >= 1))
      } else if (it.kind === 'ball') {
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
        it.mesh.position.set(it.x, this.stage.heightAt(it.x, it.z) + 0.2, it.z)
        it.mesh.rotation.x += it.vz * dt * 4
        it.mesh.rotation.z -= it.vx * dt * 4
      } else if (it.kind === 'fire') {
        const f = 0.85 + Math.sin(this.time * 17) * 0.1 + Math.sin(this.time * 7.3) * 0.08
        it.mesh.children.forEach((o) => o.name === 'flame' && o.scale.set(f, f * (1.1 + Math.sin(this.time * 11) * 0.1), f))
        if (it.light) it.light.intensity = (0.6 + this.night * 3) * f
      } else {
        const gem = it.mesh.getObjectByName('gem')
        if (gem) {
          gem.rotation.y += dt * 1.5
          gem.position.y = 0.95 + Math.sin(this.time * 2) * 0.06
        }
      }
    }
  }

  // ================= たまご =================
  private tryBreed(dt: number) {
    this.breedT += dt
    this.breedCd -= dt
    if (this.breedT < 8 || this.breedCd > 0 || this.eggs.length >= 2) return
    this.breedT = 0
    const p = this.pet
    const ready = (c: Creature) => this.alive(c) && c.grow === 0 && c.sp.tier >= 2 && c.hunger > 50 && c.energy > 35 && c.state !== 'fight'
    if (!ready(p) || this.stats.mood < 55) return
    const mate = this.creatures.find((c) => c.team === 'friend' && ready(c) && Math.hypot(c.x - p.x, c.z - p.z) < 3)
    if (!mate) return
    const fire = this.item('fire')
    const nearFire = fire && Math.hypot(fire.x - p.x, fire.z - p.z) < 3
    const chance = 0.22 * (nearFire ? 2 : 1) * (this.night > 0.5 ? 1.5 : 1)
    if (Math.random() > chance) return
    this.breedCd = 90
    this.layEgg((p.x + mate.x) / 2, (p.z + mate.z) / 2, [p.sp.id, mate.sp.id])
    this.burst(p.x, this.ground(p) + 1, p.z, 'heart', 6, 1.5)
    this.say(`${p.sp.name}と ${mate.sp.name}に たまごが できた！`)
    this.onSfx('egg')
  }

  private layEgg(x: number, z: number, parents: SpeciesId[], t = 35) {
    const anim = new SpriteAnim(this.eggSheet, 0.6)
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat)
    shadow.scale.setScalar(0.5)
    this.scene.add(anim.sprite, shadow)
    this.eggs.push({ x, z, t, anim, shadow, parents })
  }

  private updateEggs(dt: number) {
    for (const e of [...this.eggs]) {
      e.t -= dt
      const y = this.stage.heightAt(e.x, e.z)
      e.anim.sprite.position.set(e.x, y, e.z)
      e.shadow.position.set(e.x, y + 0.03, e.z)
      // 生まれそうになると揺れる
      e.anim.material.rotation = e.t < 8 ? Math.sin(this.time * (e.t < 3 ? 30 : 14)) * 0.25 : 0
      if (e.t <= 0) {
        this.scene.remove(e.anim.sprite, e.shadow)
        e.anim.dispose()
        this.eggs.splice(this.eggs.indexOf(e), 1)
        const id = e.parents[Math.floor(Math.random() * e.parents.length)]
        const baby = this.spawn(id, 'friend', e.x, e.z, 0.01)
        baby.anim.setHeight(this.size(baby))
        baby.maxHp = Math.round(SPECIES[id].hp * 0.6)
        baby.hp = baby.maxHp
        this.stats.children++
        this.burst(e.x, y + 0.3, e.z, 'spark', 14, 2.5)
        this.say(`たまごから ${SPECIES[id].name}の こどもが うまれた！`)
        this.onSfx('evolve')
        this.earn(20)
      }
    }
  }

  // ================= ボタン =================
  /** 戻り値 false = この画面では使わなかった（本体側で処理してよい） */
  press(key: 'A' | 'B' | 'C'): boolean {
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

  private buy(s: ShopItem) {
    if (this.coins < s.price) {
      this.say('コインが たりない…')
      return this.onSfx('cancel')
    }
    if (s.item && this.items.filter((it) => it.kind === s.item && it.stage === this.stageIndex).length >= (s.max ?? 1)) {
      this.say('この箱庭には もう おけない')
      return this.onSfx('cancel')
    }
    this.coins -= s.price
    this.onSfx('coin')
    if (s.food) {
      const p = this.pet
      const f = this.dropFood(p.x + p.anim.facing * 0.9, p.z + 0.2, 3, s.food)
      if (p.state !== 'fight' && p.state !== 'faint') {
        if (p.food) p.food.taken = null
        f.taken = p
        p.food = f
        this.setState(p, 'seek', 10)
      }
      this.say(`${s.name}を おいた`)
    } else if (s.item) {
      this.placeItem(s.item)
      this.say(`${s.name}を 箱庭に おいた`)
    }
    this.shopOpen = false
  }

  private run(i: number) {
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
        if (busy) return this.say('もう たたかっている！')
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

  private say(text: string) {
    this.messages.push(text)
    if (this.messages.length > 3) this.messages.shift()
    if (this.messages.length === 1) this.msgT = 2.8
  }

  // ================= 更新 =================
  update(dt: number) {
    this.time += dt
    this.night += (this.nightTarget - this.night) * Math.min(1, dt * 2)
    this.applyLight()
    this.stage.update(this.time, this.night)

    if (this.warp > 0) {
      this.warp = Math.max(0, this.warp - dt)
      if (!this.warpSwitched && this.warp < 0.8) {
        this.warpSwitched = true
        this.loadStage((this.stageIndex + 1) % STAGES.length)
      }
    }
    this.post.uniforms.glitch.value = this.warp > 0 ? Math.sin((1 - this.warp / 1.6) * Math.PI) : 0
    this.flash = Math.max(0, this.flash - dt * 1.2)
    this.post.uniforms.flash.value = this.flash
    this.post.uniforms.time.value = this.time

    // たべものが落ちる / 実る（植えた木が多いほどよく落ちる）
    this.foodT += dt
    const trees = this.items.filter((it) => it.stage === this.stageIndex && it.kind === 'sapling' && it.grow >= 1).length
    if (this.foodT > 7 / (1 + trees * 0.3) && this.foods.length < 5 + trees) {
      this.foodT = 0
      this.dropFood()
    }
    for (const f of this.foods) {
      if (!f.landed) {
        f.vy -= 14 * dt
        f.y += f.vy * dt
        const gy = this.stage.heightAt(f.x, f.z) + 0.16
        if (f.y <= gy) {
          f.y = gy
          if (Math.abs(f.vy) > 2) f.vy = -f.vy * 0.35
          else {
            f.vy = 0
            f.landed = true
          }
        }
      }
      f.mesh.position.set(f.x, f.y, f.z)
      f.mesh.rotation.y += dt * 1.5
    }

    for (const r of [...this.respawn]) {
      r.t -= dt
      if (r.t <= 0) {
        this.respawn.splice(this.respawn.indexOf(r), 1)
        const p = this.freePos(4)
        this.spawn(r.id, 'wild', p.x, p.z)
      }
    }

    for (const c of [...this.creatures]) this.updateCreature(c, dt)
    this.updateItems(dt)
    this.updateEggs(dt)
    this.tryBreed(dt)
    this.updateFx(dt)
    this.updateCamera(dt)

    // 見守っているだけでも少しずつコインがたまる（仲間が多いほど多い）
    this.incomeT += dt
    if (this.incomeT > 20) {
      this.incomeT = 0
      this.coins += 1 + Math.floor(this.creatures.filter((c) => c.team === 'friend').length / 2)
    }
    this.saveT += dt
    if (this.saveT > 10) {
      this.saveT = 0
      this.save()
    }

    if (this.msgT > 0) {
      this.msgT -= dt
      if (this.msgT <= 0) {
        this.messages.shift()
        if (this.messages.length) this.msgT = 2.4
      }
    }
    this.banner = Math.max(0, this.banner - dt)
    this.stats.mood = Math.max(0, this.stats.mood - dt * 0.15)
    this.drawHud()
  }

  private updateCreature(c: Creature, dt: number) {
    const sp = c.sp
    c.t -= dt
    c.cd -= dt
    c.lunge = Math.max(0, c.lunge - dt)
    c.hurt = Math.max(0, c.hurt - dt)
    if (c.state !== 'sleep') c.energy = Math.max(0, c.energy - dt * 0.5)
    c.hunger = Math.max(0, c.hunger - dt * 0.9)
    if (c.state !== 'fight' && c.state !== 'dead') c.hp = Math.min(c.maxHp, c.hp + dt * 0.6)

    // こどもの成長
    if (c.grow > 0) {
      c.grow = Math.min(1, c.grow + dt / 150)
      c.anim.setHeight(this.size(c))
      if (c.grow >= 1) {
        c.grow = 0
        c.maxHp = sp.hp
        this.say(`${sp.name}の こどもが おとなに なった！`)
        this.burst(c.x, this.ground(c) + 0.6, c.z, 'spark', 10, 2)
      }
    }

    // 仲良し度：ペットのそばで穏やかに過ごすと上がる
    const p = this.pet
    if (c.team === 'wild' && sp.temper === 'calm' && this.alive(c) && this.alive(p) && p.state !== 'fight') {
      if (Math.hypot(c.x - p.x, c.z - p.z) < 2.6) c.affinity += dt * 1.6 * (this.stats.mood > 50 ? 1.3 : 1)
      const friends = this.creatures.filter((o) => o.team === 'friend').length
      if (c.affinity >= 100 && friends < MAX_FRIENDS) {
        c.team = 'friend'
        this.burst(c.x, this.ground(c) + this.size(c), c.z, 'heart', 6, 1.5)
        this.say(`${sp.name}が なかまに なった！`)
        this.onSfx('friend')
        this.earn(15)
      }
    }

    let anim = 'idle'
    switch (c.state) {
      case 'idle':
        if (c.t <= 0) this.think(c)
        break
      case 'wander':
        anim = 'walk'
        if (this.moveTo(c, c.tx, c.tz, sp.speed * 0.7, dt) < 0.1 || c.t <= 0) this.setState(c, 'idle', 0.5 + Math.random())
        break
      case 'hunt': {
        anim = 'walk'
        const f = c.foe
        if (!this.alive(f) || c.t <= 0) {
          c.foe = null
          this.setState(c, 'idle', 1)
          break
        }
        const dist = this.moveTo(c, f.x, f.z, sp.speed * 1.25, dt)
        if (f.state === 'fight' && f.foe !== c) {
          // 相手が取り込み中：ペットは割り込む、ほかは待つ
          if (c.team !== 'pet') {
            anim = 'idle'
            break
          }
          if (dist < 1.0) {
            const old = f.foe
            if (old && old.foe === f) {
              old.foe = null
              this.setState(old, 'idle', 1)
            }
            this.startFight(c, f)
          }
          break
        }
        if (dist < 1.0) this.startFight(c, f)
        break
      }
      case 'fight': {
        const f = c.foe
        if (!this.alive(f) || f.foe !== c) {
          c.foe = null
          this.setState(c, 'idle', 0.6)
          break
        }
        c.anim.facing = f.x > c.x ? 1 : -1
        const d = Math.hypot(f.x - c.x, f.z - c.z)
        if (d > 1.1) {
          this.moveTo(c, f.x, f.z, sp.speed, dt)
          anim = 'walk'
        } else anim = c.lunge > 0 ? 'attack' : 'idle'
        if (c.cd <= 0 && d < 1.3 && c.hurt <= 0) {
          this.attack(c, f)
          c.cd = (1.5 / sp.speed) * (0.8 + Math.random() * 0.5)
        }
        break
      }
      case 'assist': {
        // 仲間の加勢：相手を取らずに横から攻撃する
        const f = c.foe
        if (!this.alive(f) || c.t <= 0 || !this.alive(p) || p.state !== 'fight') {
          c.foe = null
          this.setState(c, 'idle', 0.6)
          break
        }
        const d = this.moveTo(c, f.x + (c.x < f.x ? -0.9 : 0.9), f.z + 0.3, sp.speed * 1.2, dt)
        anim = d > 0.3 ? 'walk' : c.lunge > 0 ? 'attack' : 'idle'
        if (d < 0.5) c.anim.facing = f.x > c.x ? 1 : -1
        if (c.cd <= 0 && Math.hypot(f.x - c.x, f.z - c.z) < 1.4) {
          this.attack(c, f)
          c.cd = (1.8 / sp.speed) * (0.8 + Math.random() * 0.5)
        }
        break
      }
      case 'seek': {
        anim = 'walk'
        const f = c.food
        if (!f || !this.foods.includes(f) || c.t <= 0) {
          if (f) f.taken = null
          c.food = null
          this.setState(c, 'idle', 0.5)
          break
        }
        if (!f.landed) {
          anim = 'idle'
          break
        }
        if (this.moveTo(c, f.x, f.z, sp.speed, dt) < 0.45) this.setState(c, 'eat', 2.2)
        break
      }
      case 'eat': {
        anim = 'eat'
        const f = c.food
        if (f && this.foods.includes(f)) {
          f.bite += dt
          f.mesh.scale.setScalar(Math.max(0.2, 1 - f.bite / 2.4))
          c.anim.facing = f.x > c.x ? 1 : -1
        }
        if (c.t <= 0) {
          const kind = f?.kind ?? 'stage'
          if (f && this.foods.includes(f)) this.removeFood(f)
          c.food = null
          const info = kind === 'stage' ? null : FOODS[kind]
          c.hunger = Math.min(100, c.hunger + (info?.hunger ?? 50))
          c.hp = Math.min(c.maxHp, c.hp + 8)
          this.burst(c.x, this.ground(c) + this.size(c), c.z, 'heart', 3, 1.2)
          if (c.team === 'pet') {
            this.stats.mood = Math.min(100, this.stats.mood + (info?.mood ?? 10))
            if (info) {
              this.care[info.care] += 2
              this.say(`${sp.name}は ${info.name}を たべた！ ${CARE_NAME[info.care]}+`)
              this.gainXp(2)
            } else {
              this.say(`${sp.name}は おいしそうに たべた！`)
              this.gainXp(1)
            }
            this.onSfx('eat')
            this.earn(1)
          } else if (c.team === 'wild') c.affinity += 4
          this.setState(c, 'happy', 1.2)
        }
        break
      }
      case 'rest':
        anim = 'walk'
        if (this.moveTo(c, c.tx, c.tz, sp.speed * 0.8, dt) < 0.25 || c.t <= 0) this.setState(c, 'sleep', 8 + Math.random() * 6)
        break
      case 'sleep':
        anim = 'sleep'
        c.energy = Math.min(100, c.energy + dt * 9)
        c.hp = Math.min(c.maxHp, c.hp + dt * 2)
        c.fx -= dt
        if (c.fx <= 0) {
          c.fx = 1.3
          this.burst(c.x + 0.2, this.ground(c) + this.size(c), c.z, 'zzz', 1, 0.4, -0.2)
        }
        if ((c.t <= 0 && this.night < 0.5) || c.energy >= 100) this.setState(c, 'idle', 0.5)
        break
      case 'play': {
        const ball = this.item('ball')
        if (!ball || c.t <= 0) {
          this.setState(c, 'happy', 1)
          if (c.team === 'pet') this.stats.mood = Math.min(100, this.stats.mood + 6)
          break
        }
        anim = 'walk'
        if (this.moveTo(c, ball.x, ball.z, sp.speed * 1.3, dt) < 0.55 && c.cd <= 0) {
          // ボールをける
          const dx = ball.x - c.x
          const dz = ball.z - c.z
          const d = Math.hypot(dx, dz) || 1
          const power = 3 + Math.random() * 2.5
          ball.vx = (dx / d) * power + (Math.random() - 0.5) * 1.5
          ball.vz = (dz / d) * power + (Math.random() - 0.5) * 1.5
          c.cd = 0.8
          c.vy = 2.5
          c.energy = Math.max(0, c.energy - 2)
          if (Math.random() < 0.3) this.burst(ball.x, this.stage.heightAt(ball.x, ball.z) + 0.3, ball.z, 'spark', 2, 1)
        }
        break
      }
      case 'happy':
        anim = 'happy'
        if (c.jy <= 0 && c.vy <= 0 && Math.floor(c.t * 3) % 2 === 0) c.vy = 3
        if (c.t <= 0) this.setState(c, 'idle', 0.5)
        break
      case 'train':
        anim = c.jy > 0 ? 'happy' : 'idle'
        if (c.jy <= 0 && c.vy <= 0) {
          c.vy = 4.5
          this.burst(c.x, this.ground(c) + 0.1, c.z, 'spark', 3, 1.5)
          this.onSfx('train')
        }
        if (c.t <= 0) {
          c.atk += 1
          c.energy = Math.max(0, c.energy - 15)
          this.stats.trains++
          this.care.power += 1
          this.say(`ちからが あがった！ (${this.stats.trains})`)
          this.setState(c, 'idle', 0.4)
          this.gainXp(3)
        }
        break
      case 'come': {
        anim = 'walk'
        const tx = THREE.MathUtils.clamp(this.look.x, -HALF, HALF)
        const tz = THREE.MathUtils.clamp(this.look.z + 2.2, -HALF, HALF)
        if (this.moveTo(c, tx, tz, sp.speed * 1.4, dt) < 0.2 || c.t <= 0) {
          c.anim.facing = 1
          this.setState(c, 'happy', 1.5)
        }
        break
      }
      case 'faint':
        anim = 'hurt'
        c.anim.sprite.visible = Math.floor(c.t * 4) % 2 === 0 || c.t > 4
        if (c.t <= 0) {
          c.anim.sprite.visible = true
          c.hp = Math.ceil(c.maxHp * 0.5)
          this.setState(c, 'idle', 0.5)
        }
        break
      case 'dead':
        anim = 'hurt'
        c.anim.sprite.visible = Math.floor(c.t * 16) % 2 === 0
        if (Math.random() < 0.5) this.burst(c.x, this.ground(c) + Math.random() * this.size(c), c.z, 'cube', 1, 1.5, 1)
        if (c.t <= 0) {
          this.remove(c)
          this.creatures.splice(this.creatures.indexOf(c), 1)
          return
        }
        break
    }
    if (c.hurt > 0) anim = 'hurt'

    c.vy -= 16 * dt
    c.jy = Math.max(0, c.jy + c.vy * dt)
    if (c.jy === 0 && c.vy < 0) c.vy = 0
    c.x += c.kx * dt
    c.z += c.kz * dt
    const k = Math.exp(-dt * 8)
    c.kx *= k
    c.kz *= k
    this.collide(c)

    const lungeOff = c.lunge > 0 ? c.anim.facing * Math.sin((c.lunge / 0.22) * Math.PI) * 0.35 : 0
    const gy = this.ground(c)
    c.anim.play(anim)
    c.anim.update(dt)
    c.anim.sprite.position.set(c.x + lungeOff, gy + c.jy, c.z)
    c.shadow.position.set(c.x + lungeOff, this.stage.heightAt(c.x, c.z) + 0.03, c.z)
    c.shadow.scale.setScalar(this.size(c) * 0.9 * (1 - Math.min(0.5, c.jy * 0.4)))
  }

  // ================= エフェクト =================
  private burst(x: number, y: number, z: number, kind: keyof ReturnType<typeof FX_SHEETS>, n: number, power: number, grav = 6) {
    for (let i = 0; i < n; i++) {
      if (this.fx.length > 140) return
      const a = new SpriteAnim(this.fxSheets[kind], kind === 'zzz' ? 0.22 : kind === 'cube' ? 0.12 : 0.2)
      a.sprite.center.set(0.5, 0.5)
      a.sprite.position.set(x, y, z)
      this.scene.add(a.sprite)
      const ang = Math.random() * Math.PI * 2
      const sp = power * (0.3 + Math.random() * 0.7)
      const life = kind === 'zzz' ? 1.4 : 0.6 + Math.random() * 0.4
      this.fx.push({ sprite: a.sprite, vx: Math.cos(ang) * sp * 0.5, vz: Math.sin(ang) * sp * 0.5, vy: kind === 'zzz' ? 0.6 : sp, life, max: life, grav })
    }
  }

  private updateFx(dt: number) {
    for (const f of [...this.fx]) {
      f.life -= dt
      f.vy -= f.grav * dt
      f.sprite.position.x += f.vx * dt
      f.sprite.position.y += f.vy * dt
      f.sprite.position.z += f.vz * dt
      if (f.life <= 0) {
        this.scene.remove(f.sprite)
        ;(f.sprite.material as THREE.SpriteMaterial).map?.dispose()
        f.sprite.material.dispose()
        this.fx.splice(this.fx.indexOf(f), 1)
      }
    }
    for (const p of [...this.popups]) {
      p.t += dt
      p.pos.y += dt * 0.8
      if (p.t > 0.9) this.popups.splice(this.popups.indexOf(p), 1)
    }
  }

  private updateCamera(dt: number) {
    const p = this.pet
    const target = new THREE.Vector3(p.x, 0, p.z)
    if (p.state === 'fight' && p.foe) target.set((p.x + p.foe.x) / 2, 0, (p.z + p.foe.z) / 2)
    const lim = HALF - 3
    target.x = THREE.MathUtils.clamp(target.x, -lim, lim)
    target.z = THREE.MathUtils.clamp(target.z, -lim, lim + 1)
    // 起伏に合わせて見る高さも変える
    target.y = this.stage.heightAt(target.x, target.z) + 0.4
    this.look.lerp(target, 1 - Math.exp(-dt * 2.5))
    this.camera.position.copy(this.look).add(CAM_OFF)
    this.camera.lookAt(this.look)
  }

  private freePos(minFromPet: number, cx = 0, cz = 0, radius = 99) {
    for (let i = 0; i < 80; i++) {
      const x = THREE.MathUtils.clamp(cx + (Math.random() * 2 - 1) * Math.min(radius, HALF), -HALF, HALF)
      const z = THREE.MathUtils.clamp(cz + (Math.random() * 2 - 1) * Math.min(radius, HALF), -HALF, HALF)
      if (this.pet && Math.hypot(x - this.pet.x, z - this.pet.z) < minFromPet) continue
      if (this.obstacles().some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.6)) continue
      return { x, z }
    }
    return { x: 0, z: 0 }
  }

  // ================= セーブ / ロード =================
  save() {
    if (!this.pet) return
    const c2 = (c: Creature) => ({ sp: c.sp.id, hp: Math.round(c.hp), maxHp: c.maxHp, atk: c.atk, hunger: Math.round(c.hunger), energy: Math.round(c.energy), grow: c.grow })
    const data = {
      coins: this.coins, stage: this.stageIndex, care: this.care, xp: this.xp, stats: this.stats, night: this.nightTarget,
      pet: c2(this.pet),
      friends: this.creatures.filter((c) => c.team === 'friend').map(c2),
      items: this.items.map((it) => ({ kind: it.kind, stage: it.stage, x: it.x, z: it.z, grow: it.grow })),
      eggs: this.eggs.map((e) => ({ x: e.x, z: e.z, t: e.t, parents: e.parents })),
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data))
    } catch {
      /* noop */
    }
  }

  private load(): boolean {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(SAVE_KEY)
    } catch {
      return false
    }
    if (!raw) return false
    try {
      const d = JSON.parse(raw)
      if (!d.pet || !(d.pet.sp in SPECIES)) return false
      this.coins = d.coins ?? 50
      this.care = { power: 0, guard: 0, spirit: 0, ...d.care }
      this.xp = d.xp ?? 0
      this.stats = { ...this.stats, ...d.stats }
      this.nightTarget = this.night = d.night ?? 0
      this.items = (d.items ?? []).map((it: Item) => ({ ...it, vx: 0, vz: 0, mesh: null }))
      this.loadStage(Math.min(STAGES.length - 1, d.stage ?? 0))
      type Saved = { sp: SpeciesId; hp: number; maxHp: number; atk: number; hunger: number; energy: number; grow: number }
      const apply = (c: Creature, s: Saved) => {
        Object.assign(c, { hp: s.hp, maxHp: s.maxHp, atk: s.atk, hunger: s.hunger, energy: s.energy, grow: s.grow ?? 0 })
        c.anim.setHeight(this.size(c))
      }
      this.pet = this.spawn(d.pet.sp, 'pet', 0, 1.5)
      apply(this.pet, d.pet)
      for (const f of (d.friends ?? []) as Saved[]) if (f.sp in SPECIES) apply(this.spawn(f.sp, 'friend', (Math.random() - 0.5) * 2, 2.2), f)
      for (const e of d.eggs ?? []) this.layEgg(e.x, e.z, e.parents, e.t)
      this.say(`おかえり！ ${this.pet.sp.name}が まっていたよ`)
      return true
    } catch {
      return false
    }
  }

  /** データを消して最初から */
  reset() {
    try {
      localStorage.removeItem(SAVE_KEY)
    } catch {
      /* noop */
    }
    location.reload()
  }

  // ================= HUD =================
  private project(v: THREE.Vector3) {
    const p = v.clone().project(this.camera)
    return { x: Math.round((p.x + 1) * 0.5 * RES.w), y: Math.round((1 - p.y) * 0.5 * RES.h), on: p.z < 1 }
  }

  private text(s: string, x: number, y: number, color = '#ffffff', size = 10, align: CanvasTextAlign = 'left') {
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
  private win(x: number, y: number, w: number, h: number) {
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

  private bar(x: number, y: number, w: number, ratio: number, color?: string) {
    const g = this.hudCtx
    g.fillStyle = '#10122a'
    g.fillRect(x - 1, y - 1, w + 2, 5)
    g.fillStyle = '#3a3f66'
    g.fillRect(x, y, w, 3)
    g.fillStyle = color ?? (ratio > 0.5 ? '#5ef28a' : ratio > 0.25 ? '#ffd23f' : '#ff4d6d')
    g.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, ratio))), 3)
  }

  private icon(i: number, cx: number, cy: number, on: boolean) {
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

  private heartMark(x: number, y: number) {
    const g = this.hudCtx
    g.fillStyle = '#10122a'
    g.fillRect(x - 3, y - 1, 7, 6)
    g.fillStyle = '#ff7eb6'
    for (const [dx, dy, w] of [[-2, 0, 2], [1, 0, 2], [-2, 1, 5], [-1, 2, 3], [0, 3, 1]]) g.fillRect(x + dx, y + dy, w, 1)
  }

  private drawHud() {
    const g = this.hudCtx
    g.clearRect(0, 0, RES.w, RES.h)
    g.imageSmoothingEnabled = false

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

    // 頭の上の目印 + HP バー
    for (const c of this.creatures) {
      if (c.state === 'dead') continue
      const top = this.project(new THREE.Vector3(c.x, this.ground(c) + c.jy + this.size(c) + 0.15, c.z))
      if (!top.on) continue
      if (c.team === 'pet') {
        const by = top.y - 9 + Math.round(Math.sin(this.time * 5) * 1.5)
        g.fillStyle = '#10122a'
        g.fillRect(top.x - 4, by - 1, 9, 2)
        g.fillStyle = '#ffd23f'
        for (let i = 0; i < 3; i++) g.fillRect(top.x - 3 + i, by + i, 7 - i * 2, 1)
      } else if (c.team === 'friend') this.heartMark(top.x, top.y - 9)
      else if (c.affinity > 30 && c.sp.temper === 'calm') {
        // 仲良くなりかけ：小さなハートゲージ
        g.fillStyle = 'rgba(255,126,182,0.85)'
        g.fillRect(top.x - 5, top.y - 6, Math.round(10 * Math.min(1, c.affinity / 100)), 2)
      }
      if (c.state === 'fight' || c.state === 'assist' || c.hp < c.maxHp - 0.5 || c.team === 'pet') this.bar(top.x - 10, top.y - 2, 20, c.hp / c.maxHp)
    }
    // たまごの残り時間
    for (const e of this.eggs) {
      const s = this.project(new THREE.Vector3(e.x, this.stage.heightAt(e.x, e.z) + 0.75, e.z))
      if (s.on) this.bar(s.x - 8, s.y, 16, 1 - e.t / 35, '#7fd1ff')
    }

    for (const p of this.popups) {
      const s = this.project(p.pos)
      if (s.on) this.text(p.text, s.x, s.y - 6, p.color, p.text.endsWith('!') ? 12 : 10, 'center')
    }

    if (this.banner > 0) {
      const x = this.banner > 3 ? -120 + (3.5 - this.banner) * 240 : 8
      this.win(x, 30, 124, 30)
      this.text(this.stage.name, x + 8, 34, '#ffffff', 11)
      this.text(this.stage.sub, x + 8, 47, '#9fd8ff', 8)
    }

    const label = this.cursor >= 0 && !this.messages.length && !this.shopOpen ? `▶ ${ICONS[this.cursor]}` : this.messages[0]
    if (label) {
      this.win(8, RES.h - 60, RES.w - 16, 32)
      this.text(label, 18, RES.h - 50, '#ffffff', 11)
    }

    if (this.showStatus) this.drawStatus()
    if (this.shopOpen) this.drawShop()

    if (this.night > 0.05) {
      g.fillStyle = `rgba(8,10,40,${this.night * 0.18})`
      g.fillRect(0, 24, RES.w, RES.h - 48)
    }
    this.hudTex.needsUpdate = true
  }

  private drawStatus() {
    const p = this.pet
    const x = 40
    const y = 28
    this.win(x, y, 240, 150)
    this.text(p.sp.name, x + 12, y + 8, '#ffffff', 13)
    this.text(p.sp.kind, x + 12, y + 25, '#9fd8ff', 9)
    const age = Math.floor((Date.now() - this.stats.born) / 60000)
    this.text(`${age}ふん`, x + 228, y + 9, '#ffd23f', 9, 'right')
    const need = p.sp.tier === 1 ? 15 : p.sp.tier === 2 ? 45 : 0
    const rows: [string, number, number, string?][] = [
      ['たいりょく', p.hp, p.maxHp], ['おなか', p.hunger, 100, '#ff9f43'], ['げんき', p.energy, 100, '#6fe7ff'],
      ['きげん', this.stats.mood, 100, '#ff7eb6'], ['しんか', need ? this.xp : 1, need || 1, '#c9a8ff'],
    ]
    rows.forEach(([n, v, m, col], i) => {
      this.text(n, x + 12, y + 40 + i * 14, '#e8eeff', 9)
      this.bar(x + 80, y + 44 + i * 14, 140, v / m, col)
    })
    const top = (Object.keys(this.care) as Care[]).sort((a, b) => this.care[b] - this.care[a])[0]
    const hint = this.care[top] > 0 ? CARE_NAME[top] : 'まだ ふつう'
    this.text(`けいこう ${hint}   ちから ${p.atk}   かち ${this.stats.wins}`, x + 12, y + 112, '#ffffff', 9)
    const friends = this.creatures.filter((c) => c.team === 'friend').length
    this.text(`なかま ${friends}   こども ${this.stats.children}   コイン ${this.coins}`, x + 12, y + 128, '#ffe9a8', 9)
  }

  private drawShop() {
    const x = 24
    const y = 28
    const w = RES.w - 48
    this.win(x, y, w, 150)
    this.text('ショップ', x + 10, y + 7, '#ffffff', 12)
    this.text(`コイン ${this.coins}`, x + w - 10, y + 8, '#ffe9a8', 10, 'right')
    SHOP.forEach((s, i) => {
      const ry = y + 26 + i * 14
      const on = i === this.shopCursor
      if (on) {
        this.hudCtx.fillStyle = 'rgba(255,210,63,0.25)'
        this.hudCtx.fillRect(x + 6, ry - 2, w - 12, 13)
      }
      const can = this.coins >= s.price
      this.text(`${on ? '▶' : ' '} ${s.name}`, x + 10, ry, can ? '#ffffff' : '#8a93b8', 10)
      this.text(`${s.price}`, x + w - 12, ry, can ? '#ffe9a8' : '#8a93b8', 10, 'right')
    })
    this.text(SHOP[this.shopCursor].desc, x + 10, y + 126, '#9fd8ff', 9)
    this.text('A えらぶ  B かう  C とじる', x + w - 10, y + 138, '#c8d0f0', 8, 'right')
  }

  // ================= 描画 =================
  render(renderer: THREE.WebGLRenderer) {
    const prev = renderer.getRenderTarget()
    renderer.setRenderTarget(this.rtScene)
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(this.rtOut)
    renderer.render(this.postScene, this.postCam)
    renderer.setRenderTarget(prev)
  }

  debug() {
    return {
      stage: this.stage.name,
      coins: this.coins,
      xp: this.xp,
      care: this.care,
      pet: { sp: this.pet.sp.name, state: this.pet.state, hp: Math.round(this.pet.hp), atk: this.pet.atk },
      creatures: this.creatures.map((c) => `${c.sp.name}:${c.team}:${c.state}${c.grow ? ':child' : ''}`),
      items: this.items.map((it) => `${it.kind}@${it.stage}:${it.grow.toFixed(2)}`),
      eggs: this.eggs.length,
      foods: this.foods.length,
    }
  }
}
