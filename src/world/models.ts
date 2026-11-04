import * as THREE from 'three'
import { psx } from './psx'
import type { SpeciesId } from './monsters'

/**
 * モンスターの 3D モデル（オリジナルデザイン。2D ドット絵版と同じ形・色）。
 * 球・円柱・円錐などの組み合わせで作り、手続きアニメーションで動かす。
 * World からは SpriteAnim と同じ使い方（sprite / facing / play / update / setHeight / dispose）。
 */

interface Rig {
  root: THREE.Group
  /** 体（上下の弾み・つぶれ・傾きをかける） */
  body: THREE.Group
  legs: THREE.Object3D[]
  arms: THREE.Object3D[]
  eyes: THREE.Object3D[]
  mats: THREE.MeshLambertMaterial[]
  /** 種類ごとの追加の動き（羽・しっぽ・触手など） */
  extra?: (t: number, anim: string) => void
}

/** 1 = 体の高さ約 1 で作った模型を、種族の身長に合わせる係数 */
const SCALE = 0.78

class Kit {
  readonly mats: THREE.MeshLambertMaterial[] = []
  mat(color: string, emissive = 0) {
    const m = psx(new THREE.MeshLambertMaterial({ color, emissive: emissive ? color : '#000000', emissiveIntensity: emissive }))
    this.mats.push(m)
    return m
  }
  /** 球（分割数多めでなめらかに） */
  sph(r: number, color: string, pos: [number, number, number], scale: [number, number, number] = [1, 1, 1], emissive = 0) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), this.mat(color, emissive))
    m.position.set(...pos)
    m.scale.set(...scale)
    return m
  }
  cyl(rt: number, rb: number, h: number, color: string, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 12), this.mat(color))
    m.position.set(...pos)
    m.rotation.set(...rot)
    return m
  }
  cone(r: number, h: number, color: string, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], seg = 12, emissive = 0) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), this.mat(color, emissive))
    m.position.set(...pos)
    m.rotation.set(...rot)
    return m
  }
  box(w: number, h: number, d: number, color: string, pos: [number, number, number], emissive = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 2, 2, 2), this.mat(color, emissive))
    m.position.set(...pos)
    return m
  }
  /** 黒目 + 白いハイライトの目（正面 = +z） */
  eye(x: number, y: number, z: number, r = 0.07, color = '#1a1530') {
    const g = new THREE.Group()
    g.position.set(x, y, z)
    g.add(this.sph(r, color, [0, 0, 0], [0.85, 1.15, 0.6]))
    g.add(this.sph(r * 0.35, '#ffffff', [-r * 0.3, r * 0.4, r * 0.4]))
    return g
  }
  /** 足など「付け根で回す」部品：ピボットのグループに入れて返す */
  pivot(x: number, y: number, z: number, ...children: THREE.Object3D[]) {
    const g = new THREE.Group()
    g.position.set(x, y, z)
    g.add(...children)
    return g
  }
}

// ---------------------------------------------------------------------
const BUILD: Record<SpeciesId, (k: Kit) => Omit<Rig, 'root' | 'mats'>> = {
  mebu(k) {
    const body = new THREE.Group()
    body.add(k.sph(0.42, '#6fd26a', [0, 0.42, 0], [1.05, 0.9, 1]))
    body.add(k.sph(0.26, '#b8f0a0', [0, 0.36, 0.22], [1, 0.9, 0.6]))
    body.add(k.cyl(0.025, 0.03, 0.18, '#3f9e4a', [0, 0.86, 0]))
    const leafL = k.sph(0.12, '#8ee86a', [-0.11, 0.97, 0], [1.3, 0.35, 0.7])
    leafL.rotation.z = 0.5
    const leafR = k.sph(0.12, '#a6f27c', [0.12, 1.0, 0], [1.3, 0.35, 0.7])
    leafR.rotation.z = -0.5
    body.add(leafL, leafR)
    const eyes = [k.eye(-0.14, 0.5, 0.36), k.eye(0.14, 0.5, 0.36)]
    body.add(...eyes)
    body.add(k.sph(0.05, '#ff9eb5', [-0.25, 0.4, 0.3], [1, 0.6, 0.4]), k.sph(0.05, '#ff9eb5', [0.25, 0.4, 0.3], [1, 0.6, 0.4]))
    const legs = [-0.17, 0.17].map((x) => k.pivot(x, 0.1, 0.05, k.sph(0.1, '#3f9e4a', [0, -0.03, 0.04], [1, 0.7, 1.3])))
    return {
      body, legs, arms: [], eyes,
      extra: (t) => {
        leafL.rotation.z = 0.5 + Math.sin(t * 3) * 0.12
        leafR.rotation.z = -0.5 - Math.sin(t * 3 + 1) * 0.12
      },
    }
  },
  pikori(k) {
    const body = new THREE.Group()
    body.add(k.sph(0.42, '#ffd23f', [0, 0.45, 0]))
    body.add(k.sph(0.27, '#fff0c2', [0, 0.38, 0.22], [1, 1, 0.6]))
    body.add(k.cone(0.07, 0.18, '#ff8a3d', [0, 0.47, 0.45], [Math.PI / 2, 0, 0]))
    const stem = k.cyl(0.015, 0.02, 0.22, '#5b4a00', [-0.04, 0.95, 0], [0, 0, 0.2])
    const bulb = k.sph(0.09, '#7fe0ff', [-0.07, 1.08, 0], [1, 1, 1], 0.9)
    body.add(stem, bulb)
    const eyes = [k.eye(-0.13, 0.55, 0.37), k.eye(0.13, 0.55, 0.37)]
    body.add(...eyes)
    const arms = [-1, 1].map((s) => k.pivot(s * 0.38, 0.5, 0, k.sph(0.16, '#e0a400', [s * 0.06, -0.08, 0], [0.45, 1, 0.8])))
    body.add(...arms)
    const legs = [-0.14, 0.14].map((x) => k.pivot(x, 0.08, 0.05, k.cone(0.06, 0.12, '#ff8a3d', [0, -0.02, 0.03], [Math.PI, 0, 0])))
    return {
      body, legs, arms, eyes,
      extra: (t) => {
        ;(bulb.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.6 + Math.sin(t * 4) * 0.4
      },
    }
  },
  gorota(k) {
    const body = new THREE.Group()
    body.add(k.sph(0.5, '#8a94a6', [0, 0.32, -0.05], [1.15, 0.6, 1.05]))
    body.add(k.sph(0.36, '#6f7889', [0, 0.18, -0.05], [1.3, 0.35, 1.2]))
    for (const [x, z, h] of [[-0.18, -0.1, 0.45], [0.05, -0.05, 0.6], [0.24, -0.15, 0.38], [-0.02, -0.32, 0.42]] as const) {
      const c = k.cone(0.1, h, '#5ef2ff', [x, 0.55 + h / 2, z], [0, 0, 0], 6, 0.35)
      c.rotation.z = x * 0.6
      body.add(c)
    }
    const head = new THREE.Group()
    head.position.set(0, 0.32, 0.5)
    head.add(k.sph(0.2, '#9aa4b6', [0, 0, 0], [1, 0.9, 1.1]))
    const eyes = [k.eye(-0.09, 0.05, 0.17, 0.05), k.eye(0.09, 0.05, 0.17, 0.05)]
    head.add(...eyes)
    body.add(head)
    const legs = [
      [-0.35, 0.25], [0.35, 0.25], [-0.35, -0.3], [0.35, -0.3],
    ].map(([x, z]) => k.pivot(x, 0.18, z, k.cyl(0.08, 0.09, 0.2, '#5f6878', [0, -0.08, 0])))
    return {
      body, legs, arms: [], eyes,
      extra: (t, anim) => {
        head.rotation.x = anim === 'eat' ? 0.3 + Math.sin(t * 12) * 0.2 : Math.sin(t * 1.5) * 0.05
      },
    }
  },
  fuwari(k) {
    const body = new THREE.Group()
    for (const [x, y, r] of [[-0.24, 0.62, 0.24], [0.24, 0.62, 0.24], [0, 0.72, 0.34], [0, 0.6, 0.28]] as const)
      body.add(k.sph(r, '#fbf6ff', [x, y, 0], [1, 0.9, 0.95]))
    body.add(k.sph(0.2, '#e2d2f6', [0, 0.52, -0.05], [1.6, 0.5, 1.2]))
    const eyes = [k.eye(-0.12, 0.72, 0.3, 0.06, '#4a2d6b'), k.eye(0.12, 0.72, 0.3, 0.06, '#4a2d6b')]
    body.add(...eyes)
    body.add(k.sph(0.05, '#ff9ecb', [-0.24, 0.64, 0.24], [1, 0.6, 0.4]), k.sph(0.05, '#ff9ecb', [0.24, 0.64, 0.24], [1, 0.6, 0.4]))
    // 触手：小さな球のくさり
    const ribbons = [-0.18, 0, 0.18].map((x, i) => {
      const g = new THREE.Group()
      g.position.set(x, 0.45, 0.02)
      for (let j = 0; j < 5; j++) g.add(k.sph(0.045 - j * 0.004, j > 2 ? '#ffd0e6' : '#ff9ecb', [0, -j * 0.08, 0]))
      g.userData.phase = i
      return g
    })
    body.add(...ribbons)
    return {
      body, legs: [], arms: [], eyes,
      extra: (t) => {
        ribbons.forEach((r, i) => {
          r.children.forEach((c, j) => (c.position.x = Math.sin(t * 2.4 + i + j * 0.7) * 0.03 * j))
          r.rotation.x = Math.sin(t * 1.6 + i) * 0.15
        })
      },
    }
  },
  giaru(k) {
    const body = new THREE.Group()
    // 角ばった胴体 + 丸い頭（ロボット型）
    body.add(k.box(0.5, 0.36, 0.38, '#8e6cff', [0, 0.38, 0]))
    body.add(k.box(0.22, 0.14, 0.04, '#2a1a5e', [0, 0.4, 0.2]))
    const panel = k.box(0.16, 0.06, 0.02, '#5ef2ff', [0, 0.41, 0.225], 0.8)
    body.add(panel)
    const head = new THREE.Group()
    head.position.set(0, 0.78, 0)
    head.add(k.sph(0.26, '#a58cff', [0, 0, 0], [1.1, 0.95, 1]))
    // 丸いゴーグルの目（左右 2 つ）
    const eyes = [-1, 1].map((sd) => {
      const g = new THREE.Group()
      g.position.set(sd * 0.11, 0.02, 0.22)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 8, 18), k.mat('#c9ced6'))
      g.add(ring, k.sph(0.06, '#ff4d6d', [0, 0, -0.01], [1, 1, 0.5], 0.7), k.sph(0.02, '#ffffff', [-0.02, 0.025, 0.02]))
      return g
    })
    head.add(...eyes)
    const gear = new THREE.Group()
    gear.position.set(-0.28, 0.06, 0)
    gear.rotation.y = Math.PI / 2
    gear.add(new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.03, 8, 16), k.mat('#c9ced6')))
    for (let i = 0; i < 6; i++) gear.add(k.box(0.045, 0.045, 0.045, '#9aa1ab', [Math.cos((i / 6) * Math.PI * 2) * 0.11, Math.sin((i / 6) * Math.PI * 2) * 0.11, 0]))
    head.add(gear)
    head.add(k.cyl(0.015, 0.015, 0.18, '#c9ced6', [0.12, 0.3, 0]), k.sph(0.04, '#ffd23f', [0.12, 0.41, 0], [1, 1, 1], 0.8))
    body.add(head)
    const tail = new THREE.Group()
    tail.position.set(0, 0.3, -0.2)
    tail.add(k.cyl(0.025, 0.025, 0.3, '#3d2a8a', [0, -0.05, -0.12], [1.1, 0, 0]), k.box(0.12, 0.1, 0.1, '#ffd23f', [0, -0.12, -0.28]))
    body.add(tail)
    const arms = [-1, 1].map((sd) => k.pivot(sd * 0.3, 0.5, 0, k.cyl(0.045, 0.05, 0.26, '#5b3fc9', [0, -0.12, 0]), k.sph(0.06, '#c9ced6', [0, -0.27, 0])))
    body.add(...arms)
    const legs = [-0.13, 0.13].map((x) => k.pivot(x, 0.2, 0, k.box(0.13, 0.2, 0.18, '#3d2a8a', [0, -0.1, 0.02])))
    return {
      body, legs, arms, eyes,
      extra: (t) => {
        gear.rotation.z = t * 1.5
        tail.rotation.y = Math.sin(t * 3) * 0.4
        head.rotation.z = Math.sin(t * 1.2) * 0.06
        panel.visible = Math.sin(t * 5) > -0.3
      },
    }
  },
  noiz(k) {
    const body = new THREE.Group()
    // とげとげの体：二十面体の頂点を外へ押し出す
    const geo = new THREE.IcosahedronGeometry(0.4, 2)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i)
      const n = Math.sin(v.x * 17) * Math.sin(v.y * 13) * Math.sin(v.z * 11)
      v.multiplyScalar(1 + Math.max(0, n) * 0.6)
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    geo.computeVertexNormals()
    const spiky = new THREE.Mesh(geo, k.mat('#2b2350'))
    spiky.position.y = 0.48
    body.add(spiky)
    body.add(k.sph(0.17, '#ffffff', [0, 0.52, 0.32], [1, 0.85, 0.5]))
    const pupil = k.sph(0.09, '#ff3b5c', [0, 0.52, 0.4], [1, 1, 0.5], 0.6)
    body.add(pupil)
    const eyes = [pupil]
    const bits = Array.from({ length: 6 }, (_, i) => {
      const b = k.box(0.07, 0.07, 0.07, i % 2 ? '#ff3bd4' : '#3bf2ff', [0, 0.5, 0], 0.9)
      b.userData.phase = (i / 6) * Math.PI * 2
      body.add(b)
      return b
    })
    return {
      body, legs: [], arms: [], eyes,
      extra: (t) => {
        spiky.rotation.y = Math.sin(t * 1.3) * 0.3
        bits.forEach((b, i) => {
          const a = t * 1.8 + b.userData.phase
          b.position.set(Math.cos(a) * 0.55, 0.5 + Math.sin(t * 3 + i) * 0.15, Math.sin(a) * 0.55)
          b.rotation.set(t * 2, t * 3, 0)
          // ときどき消える（データが壊れている）
          b.visible = Math.sin(t * 7 + i * 3) > -0.6
        })
      },
    }
  },
  hireru(k) {
    const body = new THREE.Group()
    body.add(k.sph(0.38, '#3fc1c9', [0, 0.48, 0], [0.9, 0.85, 1.25]))
    body.add(k.sph(0.25, '#eafcff', [0, 0.38, 0.12], [0.9, 0.6, 1.1]))
    body.add(k.cone(0.16, 0.34, '#ff9f6b', [0, 0.88, -0.05], [-0.3, 0, 0]))
    const tail = new THREE.Group()
    tail.position.set(0, 0.48, -0.45)
    const fin1 = k.cone(0.14, 0.32, '#ff9f6b', [0, 0.1, -0.12], [-2.2, 0, 0])
    const fin2 = k.cone(0.14, 0.32, '#e8743f', [0, -0.1, -0.12], [-0.9, 0, 0])
    fin1.scale.x = fin2.scale.x = 0.3
    tail.add(fin1, fin2)
    body.add(tail)
    const arms = [-1, 1].map((s) => {
      const f = k.cone(0.08, 0.2, '#1f8a9a', [s * 0.05, 0, 0], [0, 0, s * -1.6])
      f.scale.z = 0.4
      return k.pivot(s * 0.32, 0.4, 0.05, f)
    })
    body.add(...arms)
    const eyes = [k.eye(-0.17, 0.56, 0.36, 0.07), k.eye(0.17, 0.56, 0.36, 0.07)]
    body.add(...eyes)
    return {
      body, legs: [], arms, eyes,
      extra: (t, anim) => {
        tail.rotation.y = Math.sin(t * (anim === 'walk' ? 9 : 4)) * 0.45
      },
    }
  },
  mofuru(k) {
    const body = new THREE.Group()
    body.add(k.sph(0.4, '#fbfdff', [0, 0.46, 0]))
    // もこもこ：まわりに小さな球をぐるりと
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2
      const y = 0.46 + Math.sin(i * 1.7) * 0.18
      body.add(k.sph(0.14, i % 2 ? '#eef3fb' : '#ffffff', [Math.cos(a) * 0.38, y, Math.sin(a) * 0.38]))
    }
    const earL = k.cone(0.09, 0.3, '#5b8fe0', [-0.2, 0.92, 0], [0, 0, 0.35])
    const earR = k.cone(0.09, 0.3, '#7fb2ff', [0.2, 0.92, 0], [0, 0, -0.35])
    body.add(earL, earR)
    const eyes = [k.eye(-0.13, 0.55, 0.42, 0.06, '#2a3a6a'), k.eye(0.13, 0.55, 0.42, 0.06, '#2a3a6a')]
    body.add(...eyes)
    body.add(k.sph(0.05, '#ffb3c8', [-0.24, 0.45, 0.38], [1, 0.6, 0.4]), k.sph(0.05, '#ffb3c8', [0.24, 0.45, 0.38], [1, 0.6, 0.4]))
    const legs = [-0.16, 0.16].map((x) => k.pivot(x, 0.08, 0.05, k.sph(0.09, '#9fb4d6', [0, -0.02, 0.03], [1, 0.7, 1.3])))
    return {
      body, legs, arms: [], eyes,
      extra: (t) => {
        earL.rotation.z = 0.35 + Math.sin(t * 2.5) * 0.1
        earR.rotation.z = -0.35 - Math.sin(t * 2.5 + 0.8) * 0.1
      },
    }
  },
}

export class MonsterModel {
  /** World から位置・表示を操作するためのルート（SpriteAnim と同じ名前） */
  readonly sprite = new THREE.Group()
  facing: 1 | -1 = 1
  private rig!: Rig
  private anim = 'idle'
  private t = Math.random() * 10
  private yaw = 0
  private last = new THREE.Vector3()
  private speed = 0

  constructor(private id: SpeciesId, private height: number) {
    this.build()
  }

  private build() {
    const k = new Kit()
    const parts = BUILD[this.id](k)
    const root = new THREE.Group()
    root.add(parts.body, ...parts.legs)
    this.rig = { ...parts, root, mats: k.mats }
    this.sprite.add(root)
    this.setHeight(this.height)
  }

  /** 進化：模型ごと作り直す */
  setSpecies(id: SpeciesId, height: number) {
    this.dispose()
    this.sprite.clear()
    this.id = id
    this.height = height
    this.build()
  }

  setHeight(h: number) {
    this.height = h
    this.rig.root.scale.setScalar(h * SCALE)
  }

  play(name: string) {
    if (name === this.anim) return
    this.anim = name
    this.t = 0
  }

  update(dt: number) {
    this.t += dt
    const t = this.t
    const r = this.rig
    const a = this.anim

    // 向き：歩いている方向へ体ごと回る。止まっている時はカメラ寄りに
    const p = this.sprite.position
    const dx = p.x - this.last.x
    const dz = p.z - this.last.z
    this.last.copy(p)
    const v = dt > 0 ? Math.hypot(dx, dz) / dt : 0
    this.speed += (v - this.speed) * Math.min(1, dt * 10)
    let target = this.yaw
    if (this.speed > 0.3 && v < 20) target = Math.atan2(dx, dz)
    else if (a === 'attack' || a === 'hurt') target = (this.facing * Math.PI) / 2
    else if (a !== 'walk') target = this.facing * 0.5
    let diff = target - this.yaw
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    this.yaw += diff * Math.min(1, dt * 8)
    r.root.rotation.y = this.yaw

    // 基本の姿勢
    let bob = Math.sin(t * 3) * 0.015
    let sy = 1 + Math.sin(t * 3) * 0.025
    let lean = 0
    let roll = 0
    let leg = 0
    let arm = 0
    let eyeY = 1
    switch (a) {
      case 'walk':
        bob = Math.abs(Math.sin(t * 9)) * 0.06
        leg = Math.sin(t * 9) * 0.7
        arm = -Math.sin(t * 9) * 0.6
        roll = Math.sin(t * 4.5) * 0.08
        break
      case 'attack':
        lean = 0.4
        arm = -1.2
        break
      case 'hurt':
        lean = -0.35
        roll = Math.sin(t * 40) * 0.08
        break
      case 'eat':
        lean = 0.2 + Math.sin(t * 11) * 0.15
        break
      case 'sleep':
        sy = 0.86 + Math.sin(t * 1.5) * 0.03
        eyeY = 0.12
        roll = 0.12
        break
      case 'happy':
        arm = -2 + Math.sin(t * 14) * 0.5
        eyeY = 0.45
        r.body.rotation.y = Math.sin(t * 8) * 0.25
        break
    }
    if (a !== 'happy') r.body.rotation.y = 0
    // まばたき
    if (a !== 'sleep' && a !== 'happy' && (t % 3.7) < 0.12) eyeY = 0.1
    r.body.position.y = bob
    r.body.scale.set(1 + (1 - sy) * 0.5, sy, 1 + (1 - sy) * 0.5)
    r.body.rotation.x = lean
    r.body.rotation.z = roll
    r.legs.forEach((l, i) => (l.rotation.x = (i % 2 ? -leg : leg) * (r.legs.length > 2 && i >= 2 ? -1 : 1)))
    r.arms.forEach((l, i) => {
      l.rotation.x = arm * (a === 'walk' ? (i % 2 ? -1 : 1) : 1)
      l.rotation.z = a === 'happy' ? (i ? 1 : -1) * 0.6 : 0
    })
    r.eyes.forEach((e) => (e.scale.y = eyeY))
    // やられた時は赤く光る
    const hurt = a === 'hurt' ? 0.6 : 0
    for (const m of r.mats) {
      if (!m.userData.base) m.userData.base = { e: m.emissive.clone(), i: m.emissiveIntensity }
      if (hurt) {
        m.emissive.set('#ff2a2a')
        m.emissiveIntensity = hurt
      } else {
        m.emissive.copy(m.userData.base.e)
        m.emissiveIntensity = m.userData.base.i
      }
    }
    r.extra?.(t, a)
  }

  dispose() {
    this.rig.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
    this.rig.mats.forEach((m) => m.dispose())
  }
}
