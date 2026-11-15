import * as THREE from 'three'

/**
 * 町の「時代」ごとの 建物の形（計画 B の 見た目。すべて オリジナル）。
 *  1 のじゅく / 2 丸太の村 / 3 木組みの町 / 4 石の城下町 / 5 城 / 6 白い城 / 7 きかいの城
 * `aged` = 古びた姿（こけ・つた・ひび・欠けた屋根・さび）。同じ時代でも 新しい / 古い が まざる。
 * 材質は World の `lam()`（psx で包んだ Lambert）と、光る所だけ Basic。
 */
export type Era = 1 | 2 | 3 | 4 | 5 | 6 | 7
export const ERA_NAME: Record<Era, string> = { 1: 'のじゅく', 2: 'まるたの村', 3: '木ぐみの町', 4: '石の城下町', 5: '城', 6: '白い城', 7: 'きかいの城' }
export interface EraCtx {
  lam: (color: string) => THREE.Material
  basic: (color: string) => THREE.Material
}

const mix = (a: string, b: string, t: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()

class Kit {
  g = new THREE.Group()
  r: () => number
  constructor(readonly ctx: EraCtx, readonly aged: boolean, seed: number) {
    let a = seed * 9301 + 49297
    this.r = () => ((a = (a * 233280 + 12345) % 2147483647), (a % 10000) / 10000)
  }
  /** 古びると くすんで こけ色に よる */
  col(c: string) {
    return this.aged ? mix(c, '#5f6a52', 0.32) : c
  }
  m(c: string) {
    return this.ctx.lam(this.col(c))
  }
  box(w: number, h: number, d: number, c: string | THREE.Material, x: number, y: number, z: number) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? this.m(c) : c)
    o.position.set(x, y, z)
    this.g.add(o)
    return o
  }
  cyl(rt: number, rb: number, h: number, seg: number, c: string | THREE.Material, x: number, y: number, z: number) {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof c === 'string' ? this.m(c) : c)
    o.position.set(x, y, z)
    this.g.add(o)
    return o
  }
  /** かさねた 屋根（だんだん 小さく）。古びると 1 だん 欠ける */
  roof(R: number, h: number, sides: number, c: string, y: number, tiers = 3, rot = 0, x = 0, z = 0) {
    const a = this.m(c)
    const b = this.m(mix(c, '#20181c', 0.3))
    for (let i = 0; i < tiers; i++) {
      const rb = R * (1 - i / (tiers + 0.2)) + (i ? 0.08 : 0)
      const rt = i === tiers - 1 ? 0.02 : R * (1 - (i + 1) / (tiers + 0.2))
      const t = this.cyl(rt, rb, h / tiers + 0.02, sides, i % 2 ? b : a, x, y + (i + 0.5) * (h / tiers), z)
      t.rotation.y = rot
      if (this.aged && i === tiers - 1) {
        t.rotation.z = 0.35
        t.position.x += 0.1
      }
    }
  }
  /** のこぎり形の 胸かべ（城の てっぺん） */
  crenel(R: number, y: number, c: string, n = 8, x = 0, z = 0) {
    for (let i = 0; i < n; i++) {
      if (this.aged && (i === 2 || i === 5)) continue
      const a = (i / n) * Math.PI * 2
      const o = this.box(R * 0.42, 0.2, 0.14, c, x + Math.cos(a) * R, y, z + Math.sin(a) * R)
      o.rotation.y = -a + Math.PI / 2
    }
  }
  win(w: number, h: number, x: number, y: number, z: number, lit = '#ffd27a') {
    this.box(w + 0.08, h + 0.08, 0.04, '#3a2a20', x, y, z)
    const o = this.box(w, h, 0.05, this.ctx.basic(this.aged ? '#56606a' : lit), x, y, z + 0.01)
    o.name = 'lit'
  }
  /** 古び：こけ・つた・ひび */
  wear(w: number, h: number, d: number, top: number) {
    if (!this.aged) return
    const moss = this.ctx.lam('#5f8a3c')
    const moss2 = this.ctx.lam('#3f6e34')
    const crack = this.ctx.lam('#2a2622')
    for (let i = 0; i < 7; i++) {
      const fx = (this.r() - 0.5) * w
      const s = 0.14 + this.r() * 0.2
      this.box(s, 0.06, s * 0.8, i % 2 ? moss : moss2, fx, top * (0.35 + this.r() * 0.65), d / 2 + 0.02 - this.r() * 0.04)
      // つた（たれさがる）
      if (i < 4) {
        const len = 0.3 + this.r() * h * 0.5
        const vx = (this.r() - 0.5) * w * 0.9
        this.box(0.05, len, 0.04, moss2, vx, h - len / 2 + 0.2, d / 2 + 0.03)
        this.box(0.11, 0.07, 0.05, moss, vx + 0.05, h - len + 0.25, d / 2 + 0.04)
      }
    }
    for (let i = 0; i < 3; i++) {
      const o = this.box(0.03, 0.3 + this.r() * 0.3, 0.02, crack, (this.r() - 0.5) * w * 0.8, h * (0.3 + this.r() * 0.4), d / 2 + 0.015)
      o.rotation.z = (this.r() - 0.5) * 1.2
    }
    this.box(w * 0.5, 0.05, d * 0.5, moss, -w * 0.15, 0.03, d * 0.45)
  }
}

/** 家（住む所）。大きさは 1.5 マスほど */
export function eraHouse(era: Era, ctx: EraCtx, aged = false, seed = 1): THREE.Group {
  const k = new Kit(ctx, aged, seed)
  switch (era) {
    case 1: {
      // テント と たき火・くいとロープ
      const t = k.cyl(0.02, 0.78, 1.0, 4, '#d8c49a', 0, 0.5, 0)
      t.rotation.y = Math.PI / 4
      k.box(0.3, 0.5, 0.04, '#5a4634', 0, 0.25, 0.56).rotation.x = -0.5
      k.cyl(0.02, 0.02, 1.25, 4, '#6a4a30', 0, 0.62, 0)
      for (const a of [0.6, 2.2, 3.9, 5.4]) k.cyl(0.02, 0.03, 0.22, 4, '#6a4a30', Math.cos(a) * 0.95, 0.1, Math.sin(a) * 0.95)
      for (let i = 0; i < 3; i++) k.cyl(0.04, 0.04, 0.34, 5, '#5a3d28', 0.95, 0.06, 0.55).rotation.set(Math.PI / 2, 0, i * 1.05)
      k.cyl(0.02, 0.1, 0.22, 5, ctx.basic(aged ? '#5a5048' : '#ffb347'), 0.95, 0.18, 0.55).name = 'lit'
      if (aged) k.box(0.4, 0.3, 0.02, ctx.lam('#3a3028'), 0.3, 0.55, 0.42).rotation.set(-0.6, 0.6, 0)
      k.wear(1.2, 0.6, 1.1, 0.8)
      break
    }
    case 2: {
      // 丸太小屋：横に つんだ 丸太・わら屋根
      for (let i = 0; i < 5; i++) {
        for (const z of [-0.5, 0.5]) k.cyl(0.085, 0.085, 1.5, 6, i % 2 ? '#8a6038' : '#7a5230', 0, 0.1 + i * 0.16, z).rotation.z = Math.PI / 2
        for (const x of [-0.62, 0.62]) k.cyl(0.085, 0.085, 1.2, 6, i % 2 ? '#7a5230' : '#8a6038', x, 0.18 + i * 0.16, 0).rotation.x = Math.PI / 2
      }
      k.box(0.3, 0.5, 0.06, '#4a3222', -0.15, 0.27, 0.56)
      k.win(0.2, 0.18, 0.35, 0.5, 0.57)
      // わらの きりづま屋根（三角の柱）
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.86, 0.75, 4, 1), k.m('#c9a850'))
      roof.scale.set(1, 1, 1.15)
      roof.rotation.y = Math.PI / 4
      roof.position.y = 1.28
      if (aged) roof.rotation.z = 0.06
      k.g.add(roof)
      k.box(1.7, 0.05, 0.1, '#a8873a', 0, 0.93, 0.78)
      k.wear(1.3, 0.9, 1.1, 1.5)
      break
    }
    case 3: {
      // 木組み：しっくい + 骨組み + かわら
      k.box(1.5, 0.2, 1.3, '#9aa1ab', 0, 0.1, 0)
      k.box(1.2, 0.75, 1.0, '#eadcba', 0, 0.58, 0)
      for (const x of [-0.6, 0.6]) for (const z of [-0.5, 0.5]) k.box(0.1, 0.77, 0.1, '#4a3526', x, 0.58, z)
      for (const y of [0.24, 0.93]) k.box(1.24, 0.07, 0.04, '#4a3526', 0, y, 0.51)
      k.box(0.05, 0.5, 0.035, '#4a3526', -0.42, 0.58, 0.512).rotation.z = 0.62
      k.box(0.32, 0.48, 0.05, '#5a3a22', 0.02, 0.45, 0.52)
      k.win(0.22, 0.2, 0.4, 0.64, 0.52)
      k.roof(1.08, 0.72, 4, '#b85a4a', 0.98, 3, Math.PI / 4)
      k.box(0.18, 0.4, 0.18, '#9aa1ab', -0.34, 1.4, -0.15)
      k.wear(1.2, 0.9, 1.0, 1.6)
      break
    }
    case 4: {
      // 石の家：切り石・スレート屋根・アーチの戸
      k.box(1.5, 1.0, 1.2, '#a9aeb6', 0, 0.5, 0)
      for (let i = 0; i < 4; i++) for (const x of [-0.75, 0.75]) k.box(0.08, 0.14, 0.2, i % 2 ? '#c6cad0' : '#8e949e', x, 0.14 + i * 0.25, 0.52)
      k.box(0.36, 0.5, 0.06, '#3d2a1e', -0.2, 0.25, 0.6)
      k.cyl(0.18, 0.18, 0.06, 8, '#3d2a1e', -0.2, 0.5, 0.6).rotation.x = Math.PI / 2
      k.win(0.2, 0.26, 0.38, 0.6, 0.61)
      k.roof(1.12, 0.8, 4, '#5a6478', 1.0, 3, Math.PI / 4)
      k.box(0.22, 0.55, 0.22, '#8e949e', 0.4, 1.4, -0.2)
      k.wear(1.5, 1.0, 1.2, 1.7)
      break
    }
    case 5: {
      // 城下の やかた：2 階だて・石と はり出し・急な屋根・旗
      k.box(1.5, 0.9, 1.25, '#9aa0aa', 0, 0.45, 0)
      k.box(1.66, 0.8, 1.4, '#b8b2a4', 0, 1.3, 0)
      for (const x of [-0.83, 0.83]) k.box(0.08, 0.8, 0.08, '#4a3526', x, 1.3, 0.7)
      k.box(1.7, 0.07, 0.05, '#4a3526', 0, 0.92, 0.71)
      k.box(0.4, 0.6, 0.06, '#3d2a1e', 0, 0.3, 0.63)
      for (const x of [-0.45, 0.45]) k.win(0.2, 0.28, x, 1.32, 0.71)
      k.roof(1.26, 1.0, 4, '#7a3a34', 1.7, 4, Math.PI / 4)
      k.cyl(0.015, 0.015, 0.5, 4, '#3d2a1e', 0, 2.9, 0)
      if (!aged) k.box(0.26, 0.15, 0.02, ctx.basic('#ffd23f'), 0.14, 3.05, 0).name = 'flag'
      k.wear(1.6, 1.7, 1.4, 2.4)
      break
    }
    case 6: {
      // 白い やかた：白かべ・青い屋根・金の かざり・色ガラス
      k.box(1.5, 0.3, 1.3, '#d8dce6', 0, 0.15, 0)
      k.box(1.3, 1.3, 1.1, '#f6f4ee', 0, 0.95, 0)
      for (const x of [-0.65, 0.65]) k.cyl(0.09, 0.1, 1.3, 8, '#e4e2dc', x, 0.95, 0.55)
      k.box(1.4, 0.08, 1.2, '#d9b84a', 0, 1.62, 0)
      k.box(0.36, 0.62, 0.06, '#3a4a78', 0, 0.61, 0.56)
      k.cyl(0.18, 0.18, 0.06, 8, '#3a4a78', 0, 0.92, 0.56).rotation.x = Math.PI / 2
      for (const [x, c] of [[-0.4, '#7fd8ff'], [0.4, '#ff9ecb']] as const) k.win(0.16, 0.36, x, 1.1, 0.56, c)
      k.roof(1.02, 1.1, 8, '#3f6fc8', 1.66, 4)
      k.cyl(0.02, 0.07, 0.3, 5, ctx.basic('#ffe27a'), aged ? 0.12 : 0, 2.9, 0)
      k.wear(1.3, 1.6, 1.1, 2.4)
      break
    }
    default: {
      // きかいの すみか：金ぞくの板・光る回路・はぐるま・パイプ・アンテナ
      const glow = ctx.basic(aged ? '#3f7a80' : '#5ef2ff')
      k.box(1.5, 0.18, 1.3, '#2e3848', 0, 0.09, 0)
      k.box(1.25, 1.15, 1.05, '#4a6078', 0, 0.75, 0)
      k.box(1.31, 0.1, 1.11, '#2e3848', 0, 0.75, 0)
      k.box(1.0, 0.5, 0.9, '#5a7490', 0, 1.56, 0)
      // 回路の線
      for (const [w, h, x, y] of [[0.5, 0.03, -0.3, 1.05], [0.03, 0.4, -0.05, 0.86], [0.4, 0.03, 0.15, 0.48], [0.03, 0.3, 0.35, 0.62]] as const) k.box(w, h, 0.02, glow, x, y, 0.535).name = 'lit'
      k.box(0.34, 0.5, 0.05, '#1e2632', -0.3, 0.43, 0.53)
      k.box(0.26, 0.04, 0.02, glow, -0.3, 0.72, 0.56).name = 'lit'
      // はぐるま（かべで まわる）
      const gear = new THREE.Group()
      gear.name = 'blades'
      const gm = k.m('#c9a44a')
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10), gm)
      hub.rotation.x = Math.PI / 2
      gear.add(hub)
      for (let i = 0; i < 8; i++) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.06), gm)
        t.position.set(Math.cos((i / 8) * 6.283) * 0.23, Math.sin((i / 8) * 6.283) * 0.23, 0)
        t.rotation.z = (i / 8) * 6.283 + Math.PI / 2
        gear.add(t)
      }
      gear.position.set(0.36, 1.0, 0.56)
      k.g.add(gear)
      // パイプ と アンテナ
      k.cyl(0.06, 0.06, 1.3, 6, '#8a6a4a', -0.68, 0.8, 0.3)
      k.cyl(0.06, 0.06, 0.4, 6, '#8a6a4a', -0.5, 1.45, 0.3).rotation.z = Math.PI / 2
      k.cyl(0.015, 0.015, 0.7, 4, '#c8d2e0', 0.3, 2.15, -0.2)
      k.box(0.08, 0.08, 0.08, ctx.basic(aged ? '#6a3030' : '#ff4d6d'), 0.3, 2.52, -0.2).name = 'lit'
      k.box(1.06, 0.06, 0.96, '#2e3848', 0, 1.83, 0)
      if (aged) for (let i = 0; i < 5; i++) k.box(0.2 + k.r() * 0.2, 0.14, 0.02, ctx.lam('#8a4a2a'), (k.r() - 0.5) * 1.0, 0.3 + k.r() * 1.2, 0.54)
      k.wear(1.25, 1.3, 1.05, 1.9)
    }
  }
  return k.g
}

/** 塔（みはり・城の かど）。時代が 進むほど 高く */
export function eraTower(era: Era, ctx: EraCtx, aged = false, seed = 2): THREE.Group {
  const k = new Kit(ctx, aged, seed)
  switch (era) {
    case 1: {
      // みはりの 木：1 本の柱に 台と 旗
      k.cyl(0.05, 0.07, 1.8, 5, '#6a4a30', 0, 0.9, 0)
      k.box(0.5, 0.05, 0.5, '#8a6038', 0, 1.5, 0)
      for (const a of [0.8, 2.9, 5.0]) k.cyl(0.02, 0.02, 1.0, 4, '#6a4a30', Math.cos(a) * 0.3, 0.45, Math.sin(a) * 0.3).rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5)
      if (!aged) k.box(0.3, 0.18, 0.02, ctx.basic('#ffd23f'), 0.17, 1.72, 0).name = 'flag'
      k.wear(0.5, 1.2, 0.5, 1.5)
      break
    }
    case 2: {
      // 木の やぐら：4 本足・すじかい・わら屋根
      for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) k.cyl(0.05, 0.07, 2.0, 5, '#7a5230', x, 1.0, z)
      for (const y of [0.7, 1.4]) for (const z of [-0.4, 0.4]) k.box(0.86, 0.05, 0.05, '#8a6038', 0, y, z)
      k.box(0.05, 1.0, 0.04, '#8a6038', 0, 1.05, 0.41).rotation.z = 0.85
      k.box(1.1, 0.07, 1.1, '#8a6038', 0, 2.0, 0)
      for (const x of [-0.5, 0.5]) k.box(0.05, 0.3, 1.1, '#7a5230', x, 2.2, 0)
      const r = k.cyl(0.02, 0.85, 0.6, 4, '#c9a850', 0, 2.85, 0)
      r.rotation.y = Math.PI / 4
      for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) k.cyl(0.03, 0.03, 0.55, 4, '#7a5230', x, 2.3, z)
      k.wear(0.9, 2.0, 0.9, 2.2)
      break
    }
    case 3: {
      // 木組みの 塔：石の土台・しっくい・はり出した 上の階
      k.box(1.0, 0.9, 1.0, '#9aa1ab', 0, 0.45, 0)
      k.box(0.9, 1.2, 0.9, '#eadcba', 0, 1.5, 0)
      for (const x of [-0.45, 0.45]) for (const z of [-0.45, 0.45]) k.box(0.09, 1.22, 0.09, '#4a3526', x, 1.5, z)
      k.box(1.2, 0.5, 1.2, '#eadcba', 0, 2.35, 0)
      k.box(1.24, 0.07, 1.24, '#4a3526', 0, 2.1, 0)
      k.win(0.2, 0.22, 0, 2.38, 0.61)
      k.win(0.16, 0.24, 0, 1.5, 0.46)
      k.roof(1.0, 0.9, 4, '#b85a4a', 2.6, 3, Math.PI / 4)
      k.wear(1.0, 2.3, 1.0, 2.6)
      break
    }
    case 4: {
      // 石の 丸い塔：胸かべ・矢の窓
      k.cyl(0.62, 0.72, 2.6, 10, '#a9aeb6', 0, 1.3, 0)
      k.cyl(0.74, 0.66, 0.2, 10, '#8e949e', 0, 2.6, 0)
      k.crenel(0.68, 2.82, '#a9aeb6', 8)
      for (const y of [1.0, 1.9]) k.box(0.08, 0.34, 0.04, '#2a2622', 0, y, 0.66)
      k.box(0.34, 0.5, 0.06, '#3d2a1e', 0, 0.25, 0.7)
      k.wear(1.0, 2.5, 1.36, 2.7)
      break
    }
    case 5: {
      // 城の 天守の塔：はり出した 石落とし・とんがり屋根・旗
      k.cyl(0.7, 0.85, 3.2, 10, '#9aa0aa', 0, 1.6, 0)
      k.cyl(0.95, 0.72, 0.4, 10, '#868c96', 0, 3.3, 0)
      k.crenel(0.9, 3.62, '#9aa0aa', 10)
      k.cyl(0.6, 0.6, 0.5, 10, '#b0b4bc', 0, 3.75, 0)
      k.roof(0.72, 1.1, 10, '#7a3a34', 4.0, 3)
      for (const y of [1.2, 2.2, 2.9]) k.win(0.12, 0.3, 0, y, 0.74 - y * 0.03)
      k.cyl(0.015, 0.015, 0.6, 4, '#3d2a1e', 0, 5.35, 0)
      if (!aged) k.box(0.34, 0.2, 0.02, ctx.basic('#ff5a5a'), 0.18, 5.5, 0).name = 'flag'
      k.wear(1.2, 3.2, 1.6, 3.5)
      break
    }
    case 6: {
      // 白い 尖塔：ほそく 高い・青い とんがり・バルコニー・金の ほし
      k.cyl(0.5, 0.62, 3.6, 10, '#f6f4ee', 0, 1.8, 0)
      k.cyl(0.66, 0.66, 0.1, 10, '#d9b84a', 0, 0.6, 0)
      k.cyl(0.78, 0.52, 0.3, 10, '#e4e2dc', 0, 3.3, 0)
      k.cyl(0.8, 0.8, 0.06, 10, '#d9b84a', 0, 3.47, 0)
      k.crenel(0.76, 3.6, '#f6f4ee', 10)
      k.cyl(0.46, 0.46, 0.7, 10, '#f6f4ee', 0, 3.85, 0)
      k.roof(0.62, 1.7, 10, '#3f6fc8', 4.2, 4)
      for (const [y, c] of [[1.4, '#7fd8ff'], [2.4, '#ff9ecb'], [3.9, '#ffe27a']] as const) k.win(0.14, 0.36, 0, y, y > 3.5 ? 0.47 : 0.6 - y * 0.025, c)
      k.cyl(0.02, 0.09, 0.34, 4, ctx.basic('#ffe27a'), 0, 6.05, 0)
      k.wear(1.0, 3.4, 1.14, 3.6)
      break
    }
    default: {
      // きかいの 塔：かさねた 金ぞくの 筒・光る しん・まわる 輪・アンテナ
      const glow = ctx.basic(aged ? '#3f7a80' : '#5ef2ff')
      k.cyl(0.8, 0.9, 0.5, 8, '#2e3848', 0, 0.25, 0)
      k.cyl(0.6, 0.7, 1.5, 8, '#4a6078', 0, 1.25, 0)
      k.cyl(0.34, 0.34, 1.0, 8, glow, 0, 2.5, 0).name = 'lit'
      for (const a of [0, 1.57, 3.14, 4.71]) k.box(0.1, 1.1, 0.1, '#2e3848', Math.cos(a) * 0.42, 2.5, Math.sin(a) * 0.42)
      k.cyl(0.66, 0.56, 0.9, 8, '#5a7490', 0, 3.45, 0)
      k.cyl(0.72, 0.72, 0.08, 8, '#c9a44a', 0, 3.02, 0)
      // まわる 輪
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.05, 5, 14), k.m('#c9a44a'))
      ring.rotation.x = Math.PI / 2 + (aged ? 0.35 : 0)
      ring.position.y = 4.1
      ring.name = 'blades'
      k.g.add(ring)
      k.cyl(0.2, 0.4, 0.5, 8, '#2e3848', 0, 4.15, 0)
      k.cyl(0.02, 0.02, 1.0, 4, '#c8d2e0', 0, 4.9, 0)
      k.box(0.1, 0.1, 0.1, ctx.basic(aged ? '#6a3030' : '#ff4d6d'), 0, 5.45, 0).name = 'lit'
      for (const y of [0.9, 1.5]) k.box(0.3, 0.03, 0.02, glow, 0, y, 0.67).name = 'lit'
      k.cyl(0.07, 0.07, 1.6, 6, '#8a6a4a', 0.72, 1.0, 0.3)
      if (aged) for (let i = 0; i < 5; i++) k.box(0.22, 0.16, 0.02, ctx.lam('#8a4a2a'), (k.r() - 0.5) * 0.8, 0.6 + k.r() * 1.4, 0.68)
      k.wear(1.0, 2.0, 1.36, 2.2)
    }
  }
  return k.g
}
