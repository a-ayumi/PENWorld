import * as THREE from 'three'
import { RES, makePostMaterial, psx } from './psx'
import { SpriteAnim, iconSheet, type Sheet } from './sprites'
import { SPECIES, sheetFor, type Species, type SpeciesId } from './monsters'
import { HALF, STAGES, type Stage } from './stages'

/**
 * 箱庭の世界。モンスターが自分で考えて暮らす（歩く・食べる・眠る・戦う）。
 * 描画は 320×240 の RenderTarget → PS1 風の仕上げ → 本体の液晶 / 全画面 に使う。
 */

export type Sfx = 'select' | 'ok' | 'cancel' | 'hit' | 'crit' | 'win' | 'lose' | 'eat' | 'warp' | 'evolve' | 'train'
type Team = 'pet' | 'wild'
type State = 'idle' | 'wander' | 'hunt' | 'fight' | 'seek' | 'eat' | 'sleep' | 'happy' | 'faint' | 'dead' | 'train' | 'come'

interface Creature {
  sp: Species; team: Team; anim: SpriteAnim; shadow: THREE.Mesh
  x: number; z: number; jy: number; vy: number; kx: number; kz: number
  hp: number; maxHp: number; atk: number; hunger: number; energy: number
  state: State; t: number; tx: number; tz: number; foe: Creature | null; food: Food | null
  cd: number; lunge: number; hurt: number; fx: number; phase: number
}
interface Food { mesh: THREE.Group; x: number; z: number; y: number; vy: number; landed: boolean; taken: Creature | null; bite: number }
interface Popup { pos: THREE.Vector3; text: string; color: string; t: number }
interface Fx { sprite: THREE.Sprite; vx: number; vy: number; vz: number; life: number; max: number; grav: number }

export const ICONS = ['ごはん', 'トレーニング', 'バトル', 'ステータス', 'ライト', 'おそうじ', 'ワープ', 'よびだし']
const ICON_COLORS = ['#ff9f43', '#ff5e5e', '#ffd23f', '#ff7eb6', '#fff27a', '#6fe7ff', '#a98bff', '#7cf29b']
const ICON_BMP = [
  ['..#.#.#..', '...#.#...', '.........', '#########', '#.......#', '#.......#', '.#.....#.', '..#####..', '...###...'],
  ['.........', '##.....##', '##.....##', '##.....##', '#########', '##.....##', '##.....##', '##.....##', '.........'],
  ['....#....', '#...#...#', '.#.###.#.', '..#####..', '#########', '..#####..', '.#.###.#.', '#...#...#', '....#....'],
  ['.##...##.', '####.####', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....', '.........'],
  ['...###...', '..#...#..', '.#.....#.', '.#.....#.', '.#.....#.', '..#...#..', '...###...', '...###...', '....#....'],
  ['....#....', '....#....', '...###...', '..#####..', '..#####..', '.#######.', '.#######.', '..#####..', '...###...'],
  ['..#####..', '.#.....#.', '#..###..#', '#.#...#.#', '#.#.#.#.#', '#.#..##.#', '#..#....#', '.#..####.', '..#......'],
  ['...###...', '..#####..', '..#####..', '..#####..', '...###...', '...###...', '.........', '...###...', '...###...'],
]

const FX_SHEETS = () => ({
  heart: iconSheet(['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'], { '#': '#ff4d7a' }),
  spark: iconSheet(['...#...', '...#...', '..###..', '#######', '..###..', '...#...', '...#...'], { '#': '#fff27a' }),
  zzz: iconSheet(['#####', '...#.', '..#..', '.#...', '#####'], { '#': '#cfe6ff' }),
  cube: iconSheet(['###', '###', '###'], { '#': '#5ef2ff' }),
  hit: iconSheet(['#...#', '.#.#.', '..#..', '.#.#.', '#...#'], { '#': '#ffffff' }),
})

/** 少し見下ろす箱庭カメラ（手前の木でキャラが隠れにくい角度） */
const CAM_OFF = new THREE.Vector3(0, 6.6, 5.8)
const FONT = '"DotGothic16", ui-monospace, monospace'

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
  private popups: Popup[] = []
  private fx: Fx[] = []
  private fxSheets = FX_SHEETS()
  private shadowGeo = new THREE.CircleGeometry(0.5, 10).rotateX(-Math.PI / 2)
  private shadowMat = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3, depthWrite: false })

  cursor = -1
  private messages: string[] = []
  private msgT = 0
  private showStatus = false
  private banner = 0
  night = 0
  private nightTarget = 0
  private time = 0
  private foodT = 0
  private respawn: { id: SpeciesId; t: number }[] = []
  private warp = 0
  private warpSwitched = true
  private flash = 0
  private look = new THREE.Vector3()
  stats = { trains: 0, wins: 0, mood: 80, born: Date.now() }
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
    this.loadStage(0)
    this.pet = this.spawn('mebu', 'pet', 0, 1.5)
    this.say('メブが うまれた！')
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
    for (const c of this.creatures.filter((c) => c.team !== 'pet')) this.remove(c)
    this.creatures = this.creatures.filter((c) => c.team === 'pet')
    for (const f of this.foods) this.scene.remove(f.mesh)
    this.foods = []
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
    s.residents.forEach((id) => {
      const p = this.freePos(3)
      this.spawn(id, 'wild', p.x, p.z)
    })
    for (let k = 0; k < 3; k++) this.dropFood()
    if (this.pet) {
      this.pet.x = 0
      this.pet.z = 1.5
      this.pet.state = 'happy'
      this.pet.t = 1.5
      this.pet.foe = null
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
  private spawn(id: SpeciesId, team: Team, x: number, z: number): Creature {
    const sp = SPECIES[id]
    const anim = new SpriteAnim(sheetFor(id), sp.height, 'idle')
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat)
    shadow.scale.setScalar(sp.height * 0.9)
    this.scene.add(anim.sprite, shadow)
    const c: Creature = {
      sp, team, anim, shadow, x, z, jy: 0, vy: 0, kx: 0, kz: 0,
      hp: sp.hp, maxHp: sp.hp, atk: sp.atk, hunger: 60 + Math.random() * 40, energy: 60 + Math.random() * 40,
      state: 'idle', t: Math.random() * 2, tx: x, tz: z, foe: null, food: null, cd: 0, lunge: 0, hurt: 0, fx: 0,
      phase: Math.random() * 10,
    }
    this.creatures.push(c)
    // 出現演出
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

  private ground(c: Creature) {
    return this.stage.heightAt(c.x, c.z) + (c.sp.float ? 0.35 + Math.sin(this.time * 2 + c.phase) * 0.12 : 0)
  }

  private moveTo(c: Creature, tx: number, tz: number, speed: number, dt: number) {
    const dx = tx - c.x
    const dz = tz - c.z
    const d = Math.hypot(dx, dz)
    if (d < 0.05) return d
    const step = Math.min(d, speed * dt)
    // 進む先にある木や岩をよける（簡易ステアリング）
    let ux = dx / d
    let uz = dz / d
    for (const o of this.stage.obstacles) {
      if (o.water && c.sp.float) continue
      const vx = o.x - c.x
      const vz = o.z - c.z
      const ahead = vx * ux + vz * uz
      if (ahead <= 0 || ahead > 1.6 || ahead > d) continue
      // 障害物の中心から進路へ向かう横方向のずれ
      const px = vx - ahead * ux
      const pz = vz - ahead * uz
      const side = Math.hypot(px, pz)
      const clear = o.r + 0.5
      if (side < clear) {
        const push = (1 - side / clear) * 1.8
        // ちょうど正面なら右へ逃げる
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

  private collide(c: Creature) {
    for (const o of this.stage.obstacles) {
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

  /** 何をするか決める（お腹・眠気・性格・まわりの状況から） */
  private think(c: Creature) {
    const wild = c.sp.temper === 'wild'
    if (wild && c.energy > 25) {
      const prey = this.nearest(c, (o) => o.team === 'pet' || o.sp.temper === 'calm', 4.5)
      if (prey) {
        c.foe = prey
        return this.setState(c, 'hunt', 6)
      }
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
    if (c.energy < 20 || (this.night > 0.5 && Math.random() < 0.5)) return this.setState(c, 'sleep', 6 + Math.random() * 6)
    const r = Math.random()
    if (r < 0.6) {
      const p = this.freePos(0, c.x, c.z, 4)
      c.tx = p.x
      c.tz = p.z
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
    if (a.food) {
      a.food.taken = null
      a.food = null
    }
    if (b.food) {
      b.food.taken = null
      b.food = null
    }
  }

  private attack(a: Creature, b: Creature) {
    a.lunge = 0.22
    const crit = Math.random() < 0.12
    const dmg = Math.max(1, Math.round(a.atk * (0.75 + Math.random() * 0.5) * (crit ? 1.8 : 1)))
    b.hp -= dmg
    b.hurt = 0.28
    const dx = b.x - a.x
    const dz = b.z - a.z
    const d = Math.hypot(dx, dz) || 1
    b.kx = (dx / d) * (crit ? 7 : 4)
    b.kz = (dz / d) * (crit ? 7 : 4)
    const y = this.ground(b) + b.sp.height
    this.popups.push({ pos: new THREE.Vector3(b.x, y, b.z), text: crit ? `${dmg}!` : `${dmg}`, color: crit ? '#ffd23f' : '#ffffff', t: 0 })
    this.burst(b.x, y * 0.7, b.z, 'hit', crit ? 6 : 3, 2.5)
    if (a.team === 'pet' || b.team === 'pet') this.onSfx(crit ? 'crit' : 'hit')
    if (b.hp <= 0) this.defeat(b, a)
  }

  private defeat(loser: Creature, winner: Creature) {
    winner.foe = null
    this.setState(winner, 'happy', 1.8)
    loser.foe = null
    if (loser.team === 'pet') {
      loser.hp = 1
      this.setState(loser, 'faint', 6)
      this.say(`${loser.sp.name}は たおれてしまった…`)
      this.onSfx('lose')
      return
    }
    this.setState(loser, 'dead', 1)
    this.respawn.push({ id: loser.sp.id, t: 14 + Math.random() * 10 })
    if (winner.team === 'pet') {
      this.stats.wins++
      winner.atk += 1
      winner.maxHp += 3
      this.say(`${winner.sp.name}の かち！ ちから+1`)
      this.onSfx('win')
    }
  }

  // ================= たべもの =================
  private makeFoodMesh() {
    const f = this.stage.food
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), psx(new THREE.MeshLambertMaterial({ color: f.color, flatShading: true, emissive: f.color, emissiveIntensity: 0.15 })))
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.06), psx(new THREE.MeshLambertMaterial({ color: f.leaf })))
    leaf.position.set(0.05, 0.16, 0)
    leaf.rotation.z = 0.5
    g.add(body, leaf)
    return g
  }

  dropFood(x?: number, z?: number, from = 2.5) {
    if (x === undefined || z === undefined) {
      const spots = this.stage.foodSpots
      const s = spots[Math.floor(Math.random() * spots.length)] ?? { x: 0, z: 0 }
      const a = Math.random() * Math.PI * 2
      x = THREE.MathUtils.clamp(s.x + Math.cos(a) * (0.7 + Math.random() * 0.6), -HALF, HALF)
      z = THREE.MathUtils.clamp(s.z + Math.sin(a) * (0.7 + Math.random() * 0.6), -HALF, HALF)
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
    const mesh = this.makeFoodMesh()
    const y = this.stage.heightAt(x, z) + from
    mesh.position.set(x, y, z)
    this.scene.add(mesh)
    const food: Food = { mesh, x, z, y, vy: 0, landed: false, taken: null, bite: 0 }
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
    this.foods.splice(this.foods.indexOf(f), 1)
  }

  // ================= ボタン =================
  /** 戻り値 false = この画面では使わなかった（本体側で処理してよい） */
  press(key: 'A' | 'B' | 'C'): boolean {
    if (this.warp > 0) return true
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
        this.burst(p.x, this.ground(p) + 0.4, p.z, 'spark', 14, 2.5)
        this.stats.mood = Math.min(100, this.stats.mood + 20)
        return this.say('ピカピカに なった！')
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

    // ワープ（グリッチで画面が崩れて別の箱庭へ）
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

    // たべものが落ちる / 実る
    this.foodT += dt
    if (this.foodT > 7 && this.foods.length < 5) {
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

    // 再出現
    for (const r of [...this.respawn]) {
      r.t -= dt
      if (r.t <= 0) {
        this.respawn.splice(this.respawn.indexOf(r), 1)
        const p = this.freePos(4)
        this.spawn(r.id, 'wild', p.x, p.z)
      }
    }

    for (const c of [...this.creatures]) this.updateCreature(c, dt)
    this.updateFx(dt)
    this.updateCamera(dt)

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
          // 相手が取り込み中：ペットは割り込む、野生は待つ
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
          if (f && this.foods.includes(f)) this.removeFood(f)
          c.food = null
          c.hunger = Math.min(100, c.hunger + 50)
          c.hp = Math.min(c.maxHp, c.hp + 8)
          this.burst(c.x, this.ground(c) + sp.height, c.z, 'heart', 3, 1.2)
          if (c.team === 'pet') {
            this.say(`${sp.name}は おいしそうに たべた！`)
            this.stats.mood = Math.min(100, this.stats.mood + 10)
            this.onSfx('eat')
          }
          this.setState(c, 'happy', 1.2)
        }
        break
      }
      case 'sleep':
        anim = 'sleep'
        c.energy = Math.min(100, c.energy + dt * 9)
        c.hp = Math.min(c.maxHp, c.hp + dt * 2)
        c.fx -= dt
        if (c.fx <= 0) {
          c.fx = 1.3
          this.burst(c.x + 0.2, this.ground(c) + sp.height, c.z, 'zzz', 1, 0.4, -0.2)
        }
        if ((c.t <= 0 && this.night < 0.5) || c.energy >= 100) this.setState(c, 'idle', 0.5)
        break
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
          this.say(`ちからが あがった！ (${this.stats.trains})`)
          this.setState(c, 'idle', 0.4)
          if (this.stats.trains % 3 === 0 && c.sp.next) this.evolve(c, c.sp.next)
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
        if (Math.random() < 0.5) this.burst(c.x, this.ground(c) + Math.random() * sp.height, c.z, 'cube', 1, 1.5, 1)
        if (c.t <= 0) {
          this.remove(c)
          this.creatures.splice(this.creatures.indexOf(c), 1)
          return
        }
        break
    }
    if (c.hurt > 0) anim = 'hurt'

    // ジャンプ・ノックバック
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
    c.shadow.scale.setScalar(c.sp.height * 0.9 * (1 - Math.min(0.5, c.jy * 0.4)))
  }

  private evolve(c: Creature, to: SpeciesId) {
    const from = c.sp.name
    const sp = SPECIES[to]
    c.sp = sp
    c.maxHp = Math.max(c.maxHp + 10, sp.hp)
    c.hp = c.maxHp
    c.atk = Math.max(c.atk + 2, sp.atk)
    c.anim.setSheet(sheetFor(to) as Sheet, sp.height)
    this.flash = 1
    this.burst(c.x, this.ground(c) + 0.6, c.z, 'spark', 18, 3)
    this.say(`${from}は ${sp.name}に しんかした！`)
    this.onSfx('evolve')
  }

  // ================= エフェクト =================
  private burst(x: number, y: number, z: number, kind: keyof ReturnType<typeof FX_SHEETS>, n: number, power: number, grav = 6) {
    for (let i = 0; i < n; i++) {
      if (this.fx.length > 120) return
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
    const target = new THREE.Vector3(p.x, 0.5, p.z)
    if (p.state === 'fight' && p.foe) target.set((p.x + p.foe.x) / 2, 0.5, (p.z + p.foe.z) / 2)
    const lim = HALF - 3
    target.x = THREE.MathUtils.clamp(target.x, -lim, lim)
    target.z = THREE.MathUtils.clamp(target.z, -lim, lim + 1)
    this.look.lerp(target, 1 - Math.exp(-dt * 2.5))
    this.camera.position.copy(this.look).add(CAM_OFF)
    this.camera.lookAt(this.look)
  }

  private freePos(minFromPet: number, cx = 0, cz = 0, radius = 99) {
    for (let i = 0; i < 80; i++) {
      const x = THREE.MathUtils.clamp(cx + (Math.random() * 2 - 1) * Math.min(radius, HALF), -HALF, HALF)
      const z = THREE.MathUtils.clamp(cz + (Math.random() * 2 - 1) * Math.min(radius, HALF), -HALF, HALF)
      if (this.pet && Math.hypot(x - this.pet.x, z - this.pet.z) < minFromPet) continue
      if (this.stage.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.6)) continue
      return { x, z }
    }
    return { x: 0, z: 0 }
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

  private drawHud() {
    const g = this.hudCtx
    g.clearRect(0, 0, RES.w, RES.h)
    g.imageSmoothingEnabled = false

    // 上下のアイコン帯
    for (const [y, row] of [[0, 0], [RES.h - 24, 1]] as const) {
      const grad = g.createLinearGradient(0, y, 0, y + 24)
      grad.addColorStop(0, 'rgba(10,14,40,0.75)')
      grad.addColorStop(1, 'rgba(10,14,40,0.45)')
      g.fillStyle = grad
      g.fillRect(0, y, RES.w, 24)
      for (let k = 0; k < 4; k++) this.icon(row * 4 + k, 40 + k * 80, y + 12, this.cursor === row * 4 + k)
    }

    // ペットの目印 + HP バー
    for (const c of this.creatures) {
      if (c.state === 'dead') continue
      const top = this.project(new THREE.Vector3(c.x, this.ground(c) + c.jy + c.sp.height + 0.15, c.z))
      if (!top.on) continue
      if (c.team === 'pet') {
        const by = top.y - 9 + Math.round(Math.sin(this.time * 5) * 1.5)
        g.fillStyle = '#10122a'
        g.fillRect(top.x - 4, by - 1, 9, 2)
        g.fillStyle = '#ffd23f'
        for (let i = 0; i < 3; i++) g.fillRect(top.x - 3 + i, by + i, 7 - i * 2, 1)
      }
      if (c.state === 'fight' || c.hp < c.maxHp - 0.5 || c.team === 'pet') this.bar(top.x - 10, top.y - 2, 20, c.hp / c.maxHp)
    }

    // ダメージ数字
    for (const p of this.popups) {
      const s = this.project(p.pos)
      if (s.on) this.text(p.text, s.x, s.y - 6, p.color, p.text.endsWith('!') ? 12 : 10, 'center')
    }

    // ステージ名
    if (this.banner > 0) {
      const x = this.banner > 3 ? -120 + (3.5 - this.banner) * 240 : 8
      this.win(x, 30, 116, 30)
      this.text(this.stage.name, x + 8, 34, '#ffffff', 11)
      this.text(this.stage.sub, x + 8, 47, '#9fd8ff', 8)
    }

    // メッセージ
    const label = this.cursor >= 0 && !this.messages.length ? `▶ ${ICONS[this.cursor]}` : this.messages[0]
    if (label) {
      this.win(8, RES.h - 60, RES.w - 16, 32)
      this.text(label, 18, RES.h - 50, '#ffffff', 11)
    }

    // ステータス
    if (this.showStatus) {
      const p = this.pet
      const x = 50
      const y = 36
      this.win(x, y, 220, 124)
      this.text(p.sp.name, x + 12, y + 9, '#ffffff', 13)
      this.text(p.sp.kind, x + 12, y + 26, '#9fd8ff', 9)
      const age = Math.floor((Date.now() - this.stats.born) / 60000)
      this.text(`${age}ふん`, x + 208, y + 10, '#ffd23f', 9, 'right')
      const rows: [string, number, number, string?][] = [
        ['たいりょく', p.hp, p.maxHp], ['おなか', p.hunger, 100, '#ff9f43'], ['げんき', p.energy, 100, '#6fe7ff'], ['きげん', this.stats.mood, 100, '#ff7eb6'],
      ]
      rows.forEach(([n, v, m, col], i) => {
        this.text(n, x + 12, y + 42 + i * 15, '#e8eeff', 9)
        this.bar(x + 80, y + 46 + i * 15, 120, v / m, col)
      })
      this.text(`ちから ${p.atk}   かち ${this.stats.wins}   トレーニング ${this.stats.trains}`, x + 12, y + 104, '#ffffff', 9)
    }

    // 夜は画面の端を少し暗く
    if (this.night > 0.05) {
      g.fillStyle = `rgba(8,10,40,${this.night * 0.18})`
      g.fillRect(0, 24, RES.w, RES.h - 48)
    }
    this.hudTex.needsUpdate = true
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
      cursor: this.cursor,
      pet: { sp: this.pet.sp.name, state: this.pet.state, hp: Math.round(this.pet.hp), atk: this.pet.atk },
      creatures: this.creatures.map((c) => `${c.sp.name}:${c.state}`),
      foods: this.foods.length,
    }
  }
}
