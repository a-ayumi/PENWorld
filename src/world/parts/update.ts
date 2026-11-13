/** World.ts から分けた「update」のメソッド。this は World（World.ts のクラスのつなぎの行から呼ばれる） */
import * as THREE from 'three'
import { RES } from '../psx'
import { SpriteAnim } from '../sprites'
import { SPECIES, enemyFor, type Face } from '../monsters'
import { HALF, SIZE, STAGES } from '../stages'
import { STRUCTS } from '../structures'
import { slidePath } from '../items'
import { SHOP, catIndexes, catOf, shopTap } from '../shop'
import type { World } from '../World'
import { Creature, FOODS, CARE_NAME, FX_SHEETS, CAM_OFF, HOUSE_STEPS, MAX_FRIENDS } from '../World'

export function update(this: World, dt: number) {
  this.obsFrame++
  this.pathBudget = 4
  const rawDt = dt
  if (this.hitStop > 0) {
    this.hitStop -= dt
    dt *= this.reducedMotion ? 1 : 0.2
  }
  this.time += dt
  this.night += (this.nightTarget - this.night) * Math.min(1, dt * 2)
  this.updateWeather(dt)
  this.applyLight(dt)
  // くもり・雨の空の暗さ・灰色は fxU（uGrey）で空のシェーダーに入る
  this.stage.update(this.time, this.night)

  if (this.warp > 0) {
    this.warp = Math.max(0, this.warp - dt)
    if (!this.warpSwitched && this.warp < 0.8) {
      this.warpSwitched = true
      this.loadStage((this.stageIndex + 1) % STAGES.length)
    }
  }
  this.post.uniforms.glitch.value = this.warp > 0 ? Math.sin((1 - this.warp / 1.6) * Math.PI) * (this.reducedMotion ? 0.35 : 1) : 0
  this.flash = Math.max(0, this.flash - dt * 1.2)
  this.post.uniforms.flash.value = this.flash * (this.reducedMotion ? 0.3 : 1)
  this.post.uniforms.time.value = this.time

  // たべものが落ちる / 実る（植えた木が多いほどよく落ちる）
  const harvest = this.season === 'autumn' ? 1.5 : 1 // しゅうかくまつり：実りが 1.5 倍
  this.foodT += dt * (this.weather === 'rain' ? 1.8 : 1) * harvest
  const trees = this.items.filter((it) => it.stage === this.stageIndex && it.kind === 'sapling' && it.grow >= 1).length
  const beds = this.items.filter((it) => it.stage === this.stageIndex && it.kind === 'flowerbed').length
  if (this.foodT > 7 / (1 + trees * 0.3 + beds * 0.2) && this.foods.length < Math.floor((5 + trees + beds) * harvest)) {
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
      const p = this.farPos(7)
      this.spawn(r.id, 'wild', p.x, p.z)
    }
  }

  // 夜だけ出てくる敵
  this.nightSpawnT -= dt
  const shadows = this.creatures.filter((c) => c.sp.habit === 'night' && c.state !== 'dead')
  if (this.night > 0.6 && this.nightSpawnT <= 0 && shadows.length < (this.stage.shadows ?? 2)) {
    this.nightSpawnT = this.stage.shadows ? 14 : 25
    const q = this.freePos(6)
    const dark = enemyFor('yamikage', this.stageIndex)
    this.spawn(dark, 'wild', q.x, q.z)
    if (shadows.length === 0) this.say(`くらやみから ${SPECIES[dark].name}が あらわれた…`)
  }
  if (this.night < 0.3) for (const c of shadows) this.setState(c, 'dead', 0.8)

  for (const c of [...this.creatures]) this.updateCreature(c, dt)
  this.updateSkills(dt)
  this.updateResources(dt)
  this.updateHouses(dt)
  this.updateStructs(dt)
  this.updateVillage(dt)
  this.updateFestival(dt)
  this.updateMarket(dt)
  this.updateAge(dt)
  this.updateTreasures(dt)
  this.updateDecor(dt)
  this.updateArmy(dt)
  this.updateItems(dt)
  this.updateSucks(dt)
  this.updateAmbient(dt)
  this.updateSeasonDeco()
  this.coinPop.t = Math.max(0, this.coinPop.t - dt)
  this.updateEggs(dt)
  this.tryBreed(dt)
  this.updateFx(dt)
  this.updateSecretFx(dt)
  this.updateCamera(dt)

  // 見守っているだけでも少しずつコインがたまる（仲間が多いほど多い）
  this.incomeT += dt
  if (this.incomeT > 20) {
    this.incomeT = 0
    this.coins += 1 + Math.floor(this.creatures.filter((c) => c.team === 'friend').length / 2) + this.villageLevel() + this.marketIncome() + this.luckIncome
    // 野生と仲間は、暮らしているだけでも少しずつ育つ（それぞれ自分の性格の方向に）
    for (const c of this.creatures)
      if (c !== this.pet && c.sp.tier > 0 && c.grow === 0 && this.alive(c)) {
        this.addCare(c, c.bias, 0.5)
        this.gainXp(c, 2)
      }
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
  this.updateMissions(dt)
  this.stats.mood = Math.max(0, Math.min(100, this.stats.mood - dt * 0.15 + (this.weather === 'sun' ? dt * 0.08 : 0)))
  // 液晶の絵（HUD）は 30 回/秒まで。60Hz の端末では 1 フレームおきに描けば十分（ボタン・タップの直後はすぐ描く）
  this.hudT += rawDt
  if (this.hudT >= 1 / 30 - 0.002 || this.hudNow) {
    this.hudT = 0
    this.hudNow = false
    this.drawHud()
  }
}

export function updateCreature(this: World, c: Creature, dt: number) {
  const sp = c.sp
  if (c.evo) {
    // 進化の演出中は動かない（倒れたら演出を打ち切る）
    if (c.state === 'dead' || c.state === 'faint') {
      c.anim.setSpecies(c.sp.id, this.size(c), this.variant(c))
      if (!c.evo.said) this.evolved(c, SPECIES[c.evo.from].name)
      c.evo = null
    } else {
      this.updateEvo(c, dt)
      return
    }
  }
  c.t -= dt
  c.cd -= dt
  c.lunge = Math.max(0, c.lunge - dt)
  c.hurt = Math.max(0, c.hurt - dt)
  c.skillCd -= dt
  if (c.state !== 'sleep') c.energy = Math.max(0, c.energy - dt * 0.5)
  // 雪の日は雪の種族が元気、それ以外は少し疲れやすい
  if (this.weather === 'snow') {
    if (sp.id === 'mofuru' || sp.id === 'fuwari' || sp.id === 'hoshikujira') c.energy = Math.min(100, c.energy + dt * 0.8)
    else c.energy = Math.max(0, c.energy - dt * 0.2)
  }
  c.hunger = Math.max(0, c.hunger - dt * 0.9)
  if (c.state !== 'fight' && c.state !== 'dead') c.hp = Math.min(c.maxHp, c.hp + dt * 0.6)

  // こどもの成長
  if (c.grow > 0) {
    c.grow = Math.min(1, c.grow + (dt / 150) * (this.nearItem('plush', c.x, c.z, 2.4) ? 1.8 : 1))
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
    if (Math.hypot(c.x - p.x, c.z - p.z) < 2.6) c.affinity += dt * 1.6 * (this.stats.mood > 50 ? 1.3 : 1) * (1 + 0.2 * this.villageLevel())
    const friends = this.creatures.filter((o) => o.team === 'friend').length
    if (c.affinity >= 100 && friends < MAX_FRIENDS) {
      c.team = 'friend'
      this.burst(c.x, this.ground(c) + this.size(c), c.z, 'heart', 6, 1.5)
      this.say(`${this.nm(c)}が なかまに なった！`)
      this.stat('friends')
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
      if (!this.alive(f) || c.t <= 0 || (c.spar && f.state === 'fight')) {
        c.foe = null
        c.spar = false
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
        c.spar = false
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
        if (this.canSkill(c)) this.useSkill(c, f)
        else this.attack(c, f)
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
        if (this.canSkill(c)) this.useSkill(c, f)
        else this.attack(c, f)
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
        const before = { hunger: c.hunger, hp: c.hp, mood: this.stats.mood }
        c.hunger = Math.min(100, c.hunger + (info?.hunger ?? 50))
        c.hp = Math.min(c.maxHp, c.hp + 8)
        this.burst(c.x, this.ground(c) + this.size(c), c.z, 'heart', 3, 1.2)
        // 食べた物で傾向が育つ（野生・仲間は自分の好みも少し入る）
        if (info) this.addCare(c, info.care, 2)
        else if (c !== this.pet) this.addCare(c, c.bias, 0.5)
        this.noteEaten(c, kind)
        this.gainXp(c, info ? 2 : 1)
        if (c.team === 'pet') {
          this.stats.mood = Math.min(100, this.stats.mood + (info?.mood ?? 10))
          // 何がどれだけ増えたかも出す
          const up = [
            this.delta('おなか', c.hunger - before.hunger),
            this.delta('きげん', this.stats.mood - before.mood),
            this.delta('たいりょく', c.hp - before.hp),
            info ? `${CARE_NAME[info.care]}+2` : '',
          ].filter(Boolean).join(' ')
          this.say(`${sp.name}は ${info ? info.name : this.stage.food.name}を たべた！ ${up}`)
          this.onSfx('eat')
          this.stat('meals')
          this.earn(1)
        } else if (c.team === 'wild') c.affinity += 4
        this.setState(c, 'happy', 1.2)
      }
      break
    }
    case 'rest': {
      anim = 'walk'
      const arrived = this.moveTo(c, c.tx, c.tz, sp.speed * 0.8, dt) < 0.25
      if (arrived || c.t <= 0) {
        // 家に着いたら中に入って眠る（たき火のそばなら こころ が育つ）
        if (c.inside && arrived) {
          c.anim.sprite.visible = false
          c.shadow.visible = false
        } else c.inside = false
        if (this.item('fire')) this.addCare(c, 'spirit', 0.5)
        this.setState(c, 'sleep', 8 + Math.random() * 6)
      }
      break
    }
    case 'sleep':
      anim = 'sleep'
      // ベンチのそばなら げんきが 2 ばい はやく もどる（ペットは きげんも UP）
      const onBench = !c.inside && this.nearItem('bench', c.x, c.z, 1.5)
      c.energy = Math.min(100, c.energy + dt * (onBench ? 20 : 9))
      c.hp = Math.min(c.maxHp, c.hp + dt * (onBench ? 3.5 : 2))
      if (onBench && c === this.pet) this.stats.mood = Math.min(100, this.stats.mood + dt * 0.5)
      c.fx -= dt
      if (c.fx <= 0) {
        c.fx = 1.3
        this.burst(c.x + 0.2, this.ground(c) + this.size(c), c.z, 'zzz', 1, 0.4, -0.2)
      }
      const stormy = c.inside && (this.weather === 'rain' || this.weather === 'ember')
      if (((c.t <= 0 && this.night < 0.5) || c.energy >= 100) && !stormy) {
        if (c === this.pet && c.sleepFrom) {
          const up = [this.delta('げんき', c.energy - c.sleepFrom.e), this.delta('たいりょく', c.hp - c.sleepFrom.h)].filter(Boolean).join(' ')
          this.say(`${sp.name}が めをさました！ ${up || 'すっきり'}`)
          this.stat('sleeps')
        }
        c.sleepFrom = null
        if (c.inside) {
          c.inside = false
          c.anim.sprite.visible = true
          c.shadow.visible = true
        }
        this.setState(c, 'idle', 0.5)
      }
      break
    case 'play': {
      const toy = this.playAt.get(c)
      if (!toy || !this.items.includes(toy) || !toy.mesh || (c.t <= 0 && this.rideT.get(c) === undefined)) {
        this.playAt.delete(c)
        this.rideT.delete(c)
        this.setState(c, 'happy', 1)
        this.addCare(c, 'spirit', 1)
        this.gainXp(c, 1)
        if (c.team === 'pet') {
          const m0 = this.stats.mood
          this.stats.mood = Math.min(100, this.stats.mood + 6)
          this.say(`${sp.name}は たくさん あそんだ！ ${this.delta('きげん', this.stats.mood - m0)} こころ+1`)
          this.stat('plays')
        }
        break
      }
      anim = 'walk'
      if (toy.kind === 'ball') {
        if (this.moveTo(c, toy.x, toy.z, sp.speed * 1.3, dt) < 0.55 && c.cd <= 0) {
          // ボールをける
          const dx = toy.x - c.x
          const dz = toy.z - c.z
          const d = Math.hypot(dx, dz) || 1
          const power = 3 + Math.random() * 2.5
          toy.vx = (dx / d) * power + (Math.random() - 0.5) * 1.5
          toy.vz = (dz / d) * power + (Math.random() - 0.5) * 1.5
          c.cd = 0.8
          c.vy = 2.5
          c.energy = Math.max(0, c.energy - 2)
          if (Math.random() < 0.3) this.burst(toy.x, this.stage.heightAt(toy.x, toy.z) + 0.3, toy.z, 'spark', 2, 1)
        }
      } else if (toy.kind === 'slide') {
        // はしごの下へ行く → のぼる → 台の上から すべりおりる
        const u0 = this.rideT.get(c)
        if (u0 === undefined) {
          const foot = this.itemLocal(toy, 0, -1.1)
          if (this.moveTo(c, foot.x, foot.z, sp.speed * 1.2, dt) < 0.3) this.rideT.set(c, 0)
        } else {
          const u = u0 + dt / 1.6
          if (u >= 1) {
            this.rideT.delete(c)
            c.vy = 2.6
            c.cd = 0.3
            this.addCare(c, 'spirit', 0.4)
            this.burst(c.x, this.ground(c) + 0.5, c.z, Math.random() < 0.5 ? 'heart' : 'spark', 3, 1.5)
            this.setState(c, 'play', Math.max(c.t, 0.5))
          } else {
            this.rideT.set(c, u)
            const pt = slidePath(u)
            const w = this.itemLocal(toy, pt.lx, pt.lz)
            c.x = w.x
            c.z = w.z
            c.jy = pt.h
            c.vy = 0
            c.anim.facing = u < 0.42 ? 1 : c.anim.facing
            anim = u < 0.42 ? 'walk' : 'happy'
          }
        }
      } else {
        // ぬいぐるみ：まわりで ぴょんぴょん はねて だっこ
        const around = this.itemLocal(toy, Math.sin(c.phase * 3) * 0.55, 0.7)
        if (this.moveTo(c, around.x, around.z, sp.speed, dt, true) < 0.35) {
          anim = c.jy > 0 ? 'happy' : 'idle'
          c.anim.facing = toy.x > c.x ? 1 : -1
          if (c.cd <= 0) {
            c.vy = 2.3
            c.cd = 1.1
            if (Math.random() < 0.5) this.burst(c.x, this.ground(c) + this.size(c) + 0.2, c.z, 'heart', 1, 1)
            if (c.grow > 0) this.addCare(c, 'spirit', 0.2)
          }
        }
      }
      break
    }
    case 'gather': {
      // 落ちている木や石をひろいに行く
      anim = 'walk'
      const r = c.res
      if (!r || !this.resources.includes(r) || c.t <= 0) {
        if (r) r.taken = null
        c.res = null
        this.setState(c, 'idle', 0.5)
        break
      }
      if (this.moveTo(c, r.x, r.z, sp.speed, dt) < 0.45) {
        this.scene.remove(r.mesh)
        this.resources.splice(this.resources.indexOf(r), 1)
        c.res = null
        c.carry = r.kind
        c.carryMesh = r.mesh
        c.carryMesh.scale.setScalar(0.8)
        this.scene.add(c.carryMesh)
        this.setState(c, 'build', 16)
      }
      break
    }
    case 'build': {
      // 建設現場か自分の家まで運んで、組み立てる
      anim = 'walk'
      const site = c.site && this.structs.includes(c.site) && c.site.mats < STRUCTS[c.site.kind].need ? c.site : null
      const h = site ? null : this.homeOf(c)
      if ((!site && !h) || c.t <= 0) {
        this.dropCarry(c, true)
        this.setState(c, 'idle', 0.5)
        break
      }
      if (site) {
        const off = STRUCTS[site.kind].r + 0.75
        if (this.moveTo(c, site.x + (c.x < site.x ? -1 : 1) * 0.6, site.z + off, sp.speed * 0.9, dt) < 0.5) {
          c.anim.facing = site.x > c.x ? 1 : -1
          c.finish = () => {
            this.dropCarry(c, false)
            if (this.structs.includes(site)) {
              this.addStructMaterial(site, c)
              this.addCare(c, 'guard', 1)
              this.gainXp(c, 2)
            }
            this.setState(c, 'happy', 0.8)
          }
          this.setState(c, 'work', 1.1)
        }
        break
      }
      if (!h) break
      if (this.moveTo(c, h.x + (c.x < h.x ? -1 : 1) * 0.6, h.z + 0.9, sp.speed * 0.9, dt) < 0.5) {
        c.anim.facing = h.x > c.x ? 1 : -1
        c.finish = () => {
          this.dropCarry(c, false)
          if (this.houses.includes(h)) {
            const m0 = h.mats
            this.addMaterial(h, c)
            this.addCare(c, 'guard', 1)
            this.gainXp(c, 2)
            if (c === this.pet && h.level < 4)
              this.say(`${sp.name}は しざいを はこんだ（いえ ${h.mats}/${HOUSE_STEPS[Math.min(4, h.level + 1)]}${h.mats - m0 > 1 ? ' どうぐで 2ばい' : ''}） まもり+1`)
          }
          this.setState(c, 'happy', 0.8)
        }
        this.setState(c, 'work', 1.1)
      }
      break
    }
    case 'work': {
      // かなづちで トントン：はねて、かけらが とぶ
      anim = c.jy > 0 ? 'happy' : 'idle'
      if (c.cd <= 0) {
        c.cd = 0.28
        c.vy = 2.4
        this.burst(c.x + c.anim.facing * 0.35, this.ground(c) + 0.3, c.z, Math.random() < 0.5 ? 'spark' : 'cube', 2, 1.4)
        if (c === this.pet || Math.hypot(c.x - this.look.x, c.z - this.look.z) < 9) this.onSfx('build')
      }
      if (c.t <= 0) {
        const f = c.finish
        c.finish = null
        if (f) f()
        else this.setState(c, 'idle', 0.3)
      }
      break
    }
    case 'tend': {
      // はたけの世話：行って しゃがんで、みのりを早める
      anim = 'walk'
      const b = c.tendTo
      if (!b || !this.structs.includes(b) || c.t <= 0) {
        c.tendTo = null
        this.setState(c, 'idle', 0.5)
        break
      }
      if (this.moveTo(c, b.x + 0.2, b.z + 1.1, sp.speed * 0.9, dt) < 0.5) {
        c.anim.facing = b.x > c.x ? 1 : -1
        c.tendTo = null
        c.finish = () => {
          if (this.structs.includes(b)) {
            b.t += 9
            this.burst(b.x, this.stage.heightAt(b.x, b.z) + 0.5, b.z, 'heart', 2, 1)
          }
          this.addCare(c, 'spirit', 0.5)
          this.gainXp(c, 1)
          this.setState(c, 'happy', 0.6)
        }
        this.setState(c, 'work', 1.4)
      }
      break
    }
    case 'march': {
      // 敵軍：いちばん近い建物をこわしに進む
      anim = 'walk'
      const tg = this.marchTarget(c)
      if (!tg) {
        this.moveTo(c, this.pet.x, this.pet.z, sp.speed, dt)
        if (c.t <= 0) this.setState(c, 'idle', 0.2)
        break
      }
      const near = Math.hypot(tg.x - c.x, tg.z - c.z) < tg.r + 1.2
      this.moveTo(c, tg.x, tg.z + 0.2, sp.speed * 1.05, dt, near)
      if (Math.hypot(tg.x - c.x, tg.z - c.z) < tg.r + 0.95) {
        c.anim.facing = tg.x > c.x ? 1 : -1
        anim = c.lunge > 0 ? 'attack' : 'idle'
        if (c.cd <= 0) {
          c.lunge = 0.22
          c.cd = 1.4 / sp.speed
          const dmg = c.atk * (0.6 + Math.random() * 0.5) * (sp.id === 'gougan' ? 1.6 : 1)
          if (tg.s) this.damageStruct(tg.s, dmg, c)
          else if (tg.h) this.damageHouse(tg.h, dmg, c)
        }
      }
      if (c.t <= 0) this.setState(c, 'idle', 0.2)
      break
    }
    case 'raid': {
      // 家をこわす
      const h = c.raid
      if (!h || !this.houses.includes(h) || h.level < 1 || c.t <= 0) {
        c.raid = null
        this.setState(c, 'idle', 0.6)
        break
      }
      const side = c.x < h.x ? -1 : 1
      const d = this.moveTo(c, h.x + side * 1.15, h.z + 0.2, sp.speed * 1.1, dt, Math.hypot(h.x - c.x, h.z - c.z) < 1.6)
      anim = d > 0.3 ? 'walk' : c.lunge > 0 ? 'attack' : 'idle'
      if (d < 0.5) {
        c.anim.facing = h.x > c.x ? 1 : -1
        if (c.cd <= 0) {
          c.lunge = 0.22
          c.cd = 1.4 / sp.speed
          this.damageHouse(h, c.atk * (0.6 + Math.random() * 0.5), c)
        }
      }
      break
    }
    case 'dance': {
      // おまつり：ふんすい（広場）のまわりを まわりながら、拍子にあわせて はねる
      const f = this.festival
      if (!f || c.t <= 0) {
        this.setState(c, 'happy', 1)
        break
      }
      c.dAng += dt * 0.5
      const d = this.moveTo(c, f.x + Math.cos(c.dAng) * c.dR, f.z + Math.sin(c.dAng) * c.dR, sp.speed * 1.2, dt, true)
      if (d > 0.6) anim = 'walk'
      else {
        anim = c.jy > 0 ? 'happy' : 'idle'
        if (c.cd <= 0 && c.jy <= 0) {
          c.cd = 0.42
          c.vy = 3.3
          if (Math.random() < 0.12) this.burst(c.x, this.ground(c) + this.size(c) + 0.2, c.z, 'heart', 1, 1)
        }
      }
      c.anim.facing = f.x > c.x ? 1 : -1
      break
    }
    case 'frolic': {
      // あそびば：ブランコやすべりだいの前で はねて遊ぶ
      const pg = c.spot
      if (!pg || !this.structs.includes(pg) || !this.structDone(pg)) {
        c.spot = null
        this.setState(c, 'idle', 0.5)
        break
      }
      if (c.t <= 0) {
        c.spot = null
        this.addCare(c, 'spirit', c.grow > 0 ? 0.4 : 1)
        this.gainXp(c, 1)
        if (c === this.pet) {
          const m0 = this.stats.mood
          this.stats.mood = Math.min(100, this.stats.mood + 4)
          this.say(`${sp.name}は あそびばで あそんだ！ ${this.delta('きげん', this.stats.mood - m0)} こころ+1`)
        }
        this.setState(c, 'happy', 0.8)
        break
      }
      const d = this.moveTo(c, c.tx, c.tz, sp.speed * 0.9, dt, true)
      if (d > 0.35) anim = 'walk'
      else {
        anim = c.jy > 0 ? 'happy' : 'idle'
        if (c.cd <= 0 && c.jy <= 0) {
          c.cd = 0.7 + Math.random() * 0.5
          c.vy = 3
          if (Math.random() < 0.3) this.burst(c.x, this.ground(c) + this.size(c) + 0.2, c.z, 'spark', 1, 1)
          if (Math.random() < 0.35) {
            const q = this.frolicSlot(pg)
            c.tx = q.x
            c.tz = q.z
          }
        }
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
        const a0 = Math.round(c.atk)
        const e0 = c.energy
        c.atk += 1
        c.energy = Math.max(0, c.energy - 15)
        this.stats.trains++
        this.stat('trains')
        this.addCare(c, 'power', 1)
        this.say(`トレーニング おわり！ こうげき ${a0}→${Math.round(c.atk)} ちから+1 ${this.delta('げんき', c.energy - e0)}`)
        this.setState(c, 'idle', 0.4)
        this.gainXp(c, 3)
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
      if (c.retired) {
        // じゅみょう：ねむったまま ゆっくり ちいさくなって、光の粒になる
        anim = 'sleep'
        c.anim.setHeight(this.size(c) * Math.max(0.05, Math.min(1, c.t / 1.6)))
        if (Math.random() < 0.3) this.burst(c.x, this.ground(c) + Math.random() * this.size(c), c.z, 'spark', 1, 1, 1)
      } else {
        anim = 'hurt'
        c.anim.sprite.visible = Math.floor(c.t * 16) % 2 === 0
        if (Math.random() < 0.5) this.burst(c.x, this.ground(c) + Math.random() * this.size(c), c.z, 'cube', 1, 1.5, 1)
      }
      if (c.t <= 0) {
        this.remove(c)
        this.creatures.splice(this.creatures.indexOf(c), 1)
        return
      }
      break
  }
  if (c.hurt > 0) anim = 'hurt'
  else if (anim === 'idle') anim = this.faceOf(c)

  // 色ちがいは ときどきキラッと光る
  if (c.rare && c.anim.sprite.visible && (c.glint -= dt) <= 0) {
    c.glint = 1.2 + Math.random() * 1.6
    if (Math.hypot(c.x - this.look.x, c.z - this.look.z) < 12)
      this.burst(c.x + (Math.random() - 0.5) * this.size(c) * 0.9, this.ground(c) + c.jy + Math.random() * this.size(c), c.z, 'spark', 1, 0.6, -0.8)
  }

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
  // ぷにぷに：歩くと弾み、息をして、ジャンプで伸び、着地でつぶれる
  if (c.pj > 0 && c.jy === 0) c.squash = 0.2
  c.pj = c.jy
  c.squash = Math.max(0, c.squash - dt * 1.6)
  const walking = c.state === 'wander' || c.state === 'hunt' || c.state === 'seek' || c.state === 'gather' || c.state === 'build' || c.state === 'raid' || c.state === 'march' || c.state === 'come' || c.state === 'assist' || c.state === 'rest'
  const wp = this.time * (7 + sp.speed * 2.2) + c.phase
  let sx = 1
  let sy = 1
  let bob = 0
  if (c.jy > 0.01) {
    const up = c.vy > 0 ? 1 : 0.4
    sy = 1 + 0.12 * up
    sx = 1 - 0.08 * up
  } else if (walking) {
    bob = Math.abs(Math.sin(wp)) * 0.05 * this.size(c)
    sy = 1 + Math.cos(wp * 2) * 0.04
    sx = 1 - Math.cos(wp * 2) * 0.03
  } else {
    const br = Math.sin(this.time * (c.state === 'sleep' ? 1.1 : 2.2) + c.phase)
    sy = 1 + br * (c.state === 'sleep' ? 0.035 : 0.02)
    sx = 1 - br * 0.015
  }
  if (c.squash > 0) {
    sy *= 1 - c.squash * 0.9
    sx *= 1 + c.squash * 0.7
  }
  if (c.lunge > 0) {
    const l = Math.sin((c.lunge / 0.22) * Math.PI)
    sx *= 1 + 0.18 * l
    sy *= 1 - 0.08 * l
  }
  if (this.reducedMotion) {
    sx = 1 + (sx - 1) * 0.3
    sy = 1 + (sy - 1) * 0.3
  }
  c.anim.setHeight(this.size(c))
  c.anim.sprite.scale.x *= sx
  c.anim.sprite.scale.y *= sy
  c.anim.sprite.position.set(c.x + lungeOff, gy + c.jy + bob, c.z)
  c.shadow.position.set(c.x + lungeOff, this.stage.heightAt(c.x, c.z) + 0.03, c.z)
  c.shadow.scale.setScalar(this.size(c) * 0.9 * (1 - Math.min(0.5, c.jy * 0.4)))
  if (c.carryMesh) {
    if (c.state === 'work') {
      // 資材をかなづち代わりに ふりおろす
      c.carryMesh.position.set(c.x + c.anim.facing * (0.3 + Math.max(0, Math.sin(this.time * 22)) * 0.15), gy + c.jy + this.size(c) * (0.55 + Math.sin(this.time * 22) * 0.2), c.z)
      c.carryMesh.rotation.z = Math.sin(this.time * 22) * 0.8
    } else {
      c.carryMesh.position.set(c.x, gy + c.jy + this.size(c) * 0.92, c.z)
      c.carryMesh.rotation.z = 0
    }
    c.carryMesh.rotation.y += dt * 2
  }
}

/** 止まっている時の表情：おなかがすいた・ねむい・うれしい・おこっている・こまっている */
export function faceOf(this: World, c: Creature): 'idle' | Face {
  const s = c.state
  if (s === 'fight' || s === 'assist' || s === 'raid' || s === 'march' || s === 'hunt') return 'angry'
  if (c.sp.tier === 0) return c.sp.temper === 'wild' ? 'angry' : 'idle'
  if (c.hp < c.maxHp * 0.3 || c.detour || c.stuck > 0) return 'worry'
  if (c.hunger < 28) return 'hungry'
  if (c.energy < 25) return 'sleepy'
  const wave = Math.sin(this.time * 0.4 + c.phase)
  if ((this.weather === 'rain' || this.weather === 'ember') && !c.inside && c.team !== 'wild' && wave > 0.2) return 'worry'
  if (this.ally(c) && c.hunger > 60 && c.energy > 50 && wave > 0.35) return 'glad'
  return 'idle'
}

export function burst(this: World, x: number, y: number, z: number, kind: keyof ReturnType<typeof FX_SHEETS>, n: number, power: number, grav = 6) {
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

export function updateFx(this: World, dt: number) {
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
    p.pos.y += dt * (p.big ? 0.25 : 0.8)
    if (p.t > (p.big ? 1.1 : 0.9)) this.popups.splice(this.popups.indexOf(p), 1)
  }
}

export function updateCamera(this: World, dt: number) {
  // 霧は「カメラからの距離」でかかるので、みおろしで引いた分だけ 霧の始まりと終わりも遠くへ（引くと白くかすまないように）
  const fog = this.scene.fog as THREE.Fog | null
  if (fog) {
    const [n, f] = this.stage.fogRange ?? [14, 34]
    const extra = this.view === 'top' ? Math.max(0, CAM_OFF.length() * (this.camZoom - 1)) : 0
    fog.near = n + extra
    fog.far = f + extra
  }
  const p = this.pet
  // ペットの向き：動いた方向から求める（止まっている時は前の向きのまま）
  const mx = p.x - this.petLast.x
  const mz = p.z - this.petLast.y
  this.petLast.set(p.x, p.z)
  if (Math.hypot(mx, mz) > dt * 0.4 && Math.hypot(mx, mz) < 1) this.petYaw = Math.atan2(mx, mz)
  if (p.state === 'fight' && p.foe) this.petYaw = Math.atan2(p.foe.x - p.x, p.foe.z - p.z)
  let d = this.petYaw - this.camYaw
  d = Math.atan2(Math.sin(d), Math.cos(d))
  this.camYaw += d * Math.min(1, dt * (this.view === 'eye' ? 4 : 2))
  const fx = Math.sin(this.camYaw)
  const fz = Math.cos(this.camYaw)
  const gy = this.ground(p)

  this.shake = Math.max(0, this.shake - dt)
  const jolt = () => {
    if (this.shake <= 0) return
    const k = this.shake * (this.reducedMotion ? 0.07 : 0.5)
    this.camera.position.x += (Math.random() - 0.5) * k
    this.camera.position.y += (Math.random() - 0.5) * k
  }
  if (this.view === 'top' && this.diorama && !this.follow) {
    // 自由に動かした場所 / おまかせ
    if (this.auto) {
      this.autoT -= dt
      if (this.autoT <= 0) {
        const s = this.pickAutoSpot()
        this.autoTo.set(s.x, 0, s.z)
        this.autoT = 9 + Math.random() * 5
      }
      this.freeLook.lerp(this.autoTo, 1 - Math.exp(-dt * 0.6))
    }
    const target = this.dioLook.set(this.freeLook.x, this.stage.heightAt(this.freeLook.x, this.freeLook.z) + 0.4, this.freeLook.z)
    this.look.lerp(target, 1 - Math.exp(-dt * 6))
    this.camera.position.copy(this.look).addScaledVector(CAM_OFF, this.camZoom)
    this.camera.lookAt(this.look)
    const k = THREE.MathUtils.clamp((this.camZoom - 1) / 0.7, 0, 1)
    this.diorama.aim(this.dioCenter.copy(this.look).lerp(new THREE.Vector3(0, 0.4, 0), k * 0.5), this.camZoom)
    jolt()
    return
  }
  if (this.view === 'top') {
    const target = new THREE.Vector3(p.x, 0, p.z)
    if (p.state === 'fight' && p.foe) target.set((p.x + p.foe.x) / 2, 0, (p.z + p.foe.z) / 2)
    // 2 本指でずらした分を足す（ペットを追いかけつつ、見たい所を見られる）
    target.x += this.camPan.x
    target.z += this.camPan.y
    const lim = HALF - 1.5
    target.x = THREE.MathUtils.clamp(target.x, -lim, lim)
    target.z = THREE.MathUtils.clamp(target.z, -lim, lim + 1)
    // 起伏に合わせて見る高さも変える
    target.y = this.stage.heightAt(target.x, target.z) + 0.4
    this.look.lerp(target, 1 - Math.exp(-dt * 3))
    this.camera.position.copy(this.look).addScaledVector(CAM_OFF, this.camZoom)
    this.camera.lookAt(this.look)
    if (this.diorama) {
      // 引くほど、島のまんなかへ寄せる（いちばん引くと島ぜんたいが画面の中央に）
      const k = THREE.MathUtils.clamp((this.camZoom - 1) / 0.7, 0, 1)
      this.diorama.aim(this.dioLook.copy(this.look).lerp(this.dioCenter.set(0, 0.4, 0), k), this.camZoom)
    }
    jolt()
    return
  }
  // 主人公視点：ペットの後ろ / 目線（2 本指の横ドラッグで向きを回す、縦で見上げ・見下ろし）
  const yaw = this.camYaw + this.camPan.x
  const ex = Math.sin(yaw)
  const ez = Math.cos(yaw)
  const back = this.view === 'behind' ? 3.3 * this.camZoom : -0.15
  const up = this.view === 'behind' ? 2.0 * this.camZoom + this.camPan.y : this.size(p) * 0.7
  const want = new THREE.Vector3(p.x - ex * back, gy + up, p.z - ez * back)
  // 箱庭の外（デジタル空間）へカメラが出ないように
  want.x = THREE.MathUtils.clamp(want.x, -HALF - 0.5, HALF + 0.5)
  want.z = THREE.MathUtils.clamp(want.z, -HALF - 0.5, HALF + 0.5)
  // 地面にめりこまないように
  want.y = Math.max(want.y, this.stage.heightAt(want.x, want.z) + 0.35)
  // うしろ視点はペットが画面の中ほどに来るよう、少し手前の低い所を見る
  const ahead = this.view === 'behind' ? 1.4 : 3
  const lookY = this.view === 'behind' ? 0.25 : up - 0.15 - this.camPan.y
  const lookAt = new THREE.Vector3(p.x + ex * ahead, gy + lookY, p.z + ez * ahead)
  this.camera.position.lerp(want, 1 - Math.exp(-dt * 6))
  this.look.lerp(lookAt, 1 - Math.exp(-dt * 6))
  // めせんはピンチで望遠
  const fov = this.view === 'eye' ? THREE.MathUtils.clamp(42 * this.camZoom, 18, 70) : 42
  if (Math.abs(this.camera.fov - fov) > 0.01) {
    this.camera.fov = fov
    this.camera.updateProjectionMatrix()
  }
  this.camera.lookAt(this.look)
  jolt()
  void fx
  void fz
}

/** ピンチ：f < 1 で寄る、f > 1 で引く */
export function zoomBy(this: World, f: number) {
  // 島が広いほど 大きく引ける（島ぜんたいが見えるまで）
  this.camZoom = THREE.MathUtils.clamp(this.camZoom * f, 0.45, 2.3 * Math.max(1, SIZE / 20))
}

/** 2 本指ドラッグ（画面の高さに対する割合） */
export function panBy(this: World, dx: number, dy: number) {
  if (this.view === 'top' && this.diorama) {
    // 新しい見た目：指でつかんだ地面が指についてくるように、見る所を自由に動かす（ついていく・おまかせは止まる）
    if (this.follow || this.auto) this.freeLook.copy(this.look)
    this.follow = false
    this.auto = false
    const { r, f } = this.diorama.screenAxes()
    const W = 2 * this.diorama.half * this.camZoom
    this.freeLook.addScaledVector(r, -dx * W).addScaledVector(f, dy * W * 2)
    const lim = HALF + 1
    this.freeLook.x = THREE.MathUtils.clamp(this.freeLook.x, -lim, lim)
    this.freeLook.z = THREE.MathUtils.clamp(this.freeLook.z, -lim, lim)
    return
  }
  if (this.view === 'top') {
    // 指を動かした方向に景色がついてくる
    const k = 9 * this.camZoom
    this.camPan.x = THREE.MathUtils.clamp(this.camPan.x - dx * k, -HALF, HALF)
    this.camPan.y = THREE.MathUtils.clamp(this.camPan.y - dy * k, -HALF, HALF)
  } else {
    this.camPan.x = THREE.MathUtils.clamp(this.camPan.x - dx * 3, -Math.PI, Math.PI)
    this.camPan.y = THREE.MathUtils.clamp(this.camPan.y + dy * 3, -1.2, 1.6)
  }
}

export function setView(this: World, v: 'top' | 'behind' | 'eye') {
  this.view = v
  this.camZoom = 1
  this.camPan.set(0, 0)
  this.camera.fov = 42
  // カメラのすぐ前にある木や仲間で画面がふさがらないよう、近くは描かない
  this.camera.near = v === 'behind' ? 1.2 : v === 'eye' ? 0.35 : 0.1
  this.camera.updateProjectionMatrix()
  this.camYaw = this.petYaw
  // 切り替え直後に遠くから飛んでこないよう、すぐ近くへ置く
  const p = this.pet
  if (v === 'top') this.look.set(p.x, this.stage.heightAt(p.x, p.z) + 0.4, p.z)
  else {
    this.camera.position.set(p.x - Math.sin(this.camYaw) * 2.8, this.ground(p) + 1.5, p.z - Math.cos(this.camYaw) * 2.8)
    this.look.set(p.x, this.ground(p) + 0.6, p.z)
  }
  this.say(v === 'top' ? 'してん：みおろし' : v === 'behind' ? `してん：${p.sp.name}の うしろ` : `してん：${p.sp.name}の めせん`)
}

/**
 * 画面のタップ（u, v は 0〜1、v は下が 0）。アイコン・ショップ・ステータスをタッチで操作する。
 * 戻り値 true = HUD で使った
 */
export function tap(this: World, u: number, v: number): boolean {
  this.hudNow = true
  if (this.warp > 0) return true
  if (this.cleanView) return false
  const x = u * RES.w
  const y = (1 - v) * RES.h
  // 物語カードは、しばらく見せたあとならタップで閉じる
  if (this.cards[0]?.t0 && this.time - this.cards[0].t0 > 1) {
    this.cards.shift()
    return true
  }
  if (this.shopOpen) {
    const hit = shopTap(x, y, this.shopCursor)
    if (hit.type === 'outside') {
      this.shopOpen = false
      this.onSfx('cancel')
    } else if (hit.type === 'tab') {
      if (catOf(this.shopCursor) !== hit.cat) {
        this.shopCursor = catIndexes(hit.cat)[0]
        this.onSfx('select')
      }
    } else if (hit.type === 'row') {
      if (hit.index === this.shopCursor) this.buy(SHOP[hit.index])
      else {
        this.shopCursor = hit.index
        this.onSfx('select')
      }
    } else if (hit.type === 'buy') this.buy(SHOP[this.shopCursor])
    return true
  }
  if (this.showStatus) {
    this.showStatus = false
    this.onSfx('cancel')
    return true
  }
  if (y < 24 || y > RES.h - 24) {
    const i = (y < 24 ? 0 : 4) + Math.min(3, Math.floor(x / 80))
    this.cursor = i
    this.run(i)
    return true
  }
  // 箱庭の中の物をタップ：情報を出す（もう一度さがして、べつの物ならそちらへ）
  if (this.picked && this.tapInfo(x, y)) return true
  const hit = this.pickAt(x, y)
  if (hit) {
    this.picked = hit
    if (hit.type === 'chest') this.sendToChest(hit.ref)
    this.onSfx('select')
    return true
  }
  return false
}

/** 敵の出てくる場所：ペットと仲間から min マス以上はなれた所（なるべく島のはし）。見つからなければ freePos */
export function farPos(this: World, min: number) {
  const allies = this.creatures.filter((c) => this.ally(c))
  for (let i = 0; i < 120; i++) {
    // はしに寄せる：片方の座標を外側 3 割から選ぶ
    const edge = (Math.random() < 0.5 ? -1 : 1) * (HALF * (0.7 + Math.random() * 0.3))
    const along = (Math.random() * 2 - 1) * HALF
    const [x, z] = Math.random() < 0.5 ? [edge, along] : [along, edge]
    if (allies.some((a) => Math.hypot(a.x - x, a.z - z) < (a === this.pet ? min : min - 2))) continue
    if (this.obstacles().some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.6)) continue
    // 山・崖・壁の急な坂は えらばない（家や建物が平らな所に建つように。歩く先も）
    const h = this.stage.heightAt
    if (Math.max(Math.abs(h(x + 0.6, z) - h(x - 0.6, z)), Math.abs(h(x, z + 0.6) - h(x, z - 0.6))) > 0.45) continue
    return { x, z }
  }
  return this.freePos(min)
}

export function freePos(this: World, minFromPet: number, cx = 0, cz = 0, radius = 99) {
  for (let i = 0; i < 80; i++) {
    const x = THREE.MathUtils.clamp(cx + (Math.random() * 2 - 1) * Math.min(radius, HALF), -HALF, HALF)
    const z = THREE.MathUtils.clamp(cz + (Math.random() * 2 - 1) * Math.min(radius, HALF), -HALF, HALF)
    if (this.pet && Math.hypot(x - this.pet.x, z - this.pet.z) < minFromPet) continue
    if (this.obstacles().some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.6)) continue
    // 山・崖・壁の急な坂は えらばない（家や建物が平らな所に建つように。歩く先も）
    const h = this.stage.heightAt
    if (Math.max(Math.abs(h(x + 0.6, z) - h(x - 0.6, z)), Math.abs(h(x, z + 0.6) - h(x, z - 0.6))) > 0.45) continue
    return { x, z }
  }
  return { x: 0, z: 0 }
}
