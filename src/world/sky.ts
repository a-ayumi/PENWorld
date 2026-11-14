import * as THREE from 'three'
import { psx } from './psx'
import { rng } from './textures'

/**
 * 空の えんしゅつ：島のまわりを ながれる雲・さしこむ 陽の光・雷・天に のぼる 光の柱。
 * - 雲は 島の「外がわ」を ながす（まんなかの村を かくさない）。雨・雪の時は ふえて 灰色に
 * - 陽の光は 晴れた昼に、ななめの うすい 光の帯（加算）。朝・夕・雨あがりは 少し強く。画質「低」は 出さない
 * - 雷は 雨が強い時に ときどき（World が strike() を呼ぶ）。ぎざぎざの線が 0.2 秒
 * - 光の柱は じゅみょうを むかえた子の上に（ascend()）
 */
interface Cloud { g: THREE.Group; x: number; y: number; z: number; v: number; s: number }
interface Beam { m: THREE.Mesh; t: number; dur: number }

export class SkyFx {
  readonly group = new THREE.Group()
  private clouds: Cloud[] = []
  private rays: THREE.Group[] = []
  private bolts: { m: THREE.Mesh; t: number }[] = []
  private beams: Beam[] = []
  private readonly cloudMat = psx(new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }))
  private readonly rayMat = new THREE.MeshBasicMaterial({ color: '#fff2c0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })
  private readonly boltMat = new THREE.MeshBasicMaterial({ color: '#f4f8ff', fog: false })
  private size = 0

  /** 島の広さが かわったら 作りなおす */
  private build(size: number) {
    this.size = size
    for (const c of this.clouds) this.group.remove(c.g)
    for (const r of this.rays) this.group.remove(r)
    this.clouds = []
    this.rays = []
    const r = rng(77)
    const puff = new THREE.IcosahedronGeometry(1, 1)
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group()
      const n = 3 + Math.floor(r() * 3)
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(puff, this.cloudMat)
        const s = 0.8 + r() * 0.9
        m.scale.set(s * 1.5, s * 0.7, s)
        m.position.set((k - n / 2) * 1.3 + r() * 0.5, r() * 0.5, (r() - 0.5) * 1.2)
        g.add(m)
      }
      // 島の外がわ（北と南の帯・東西の はし）を 西から東へ
      const side = i % 2 ? 1 : -1
      const c: Cloud = { g, x: (r() * 2 - 1) * size, y: -1.5 + r() * 7, z: side * (size * 0.5 + 2 + r() * 9), v: 0.25 + r() * 0.35, s: 0.9 + r() * 1.3 }
      g.scale.setScalar(c.s)
      this.clouds.push(c)
      this.group.add(g)
    }
    for (let i = 0; i < 4; i++) {
      // 板を 十字に 2 まい（カメラを まわしても 見える）
      const wd = 1.6 + r() * 2.4
      const m = new THREE.Group()
      for (const ry of [Math.PI * 0.25, -Math.PI * 0.25]) m.add(new THREE.Mesh(new THREE.PlaneGeometry(wd, 46).rotateY(ry), this.rayMat))
      // 左上（-x・+y）から ななめに さしこむ
      m.rotation.set(0, 0, -0.5)
      m.position.set(-size * 0.3 + i * size * 0.2, 8, (i % 2 ? 1 : -1) * size * 0.12)
      m.userData.ph = r() * 6
      this.rays.push(m)
      this.group.add(m)
    }
  }

  /** storm = 雨や雪の強さ（0〜1）、sun = 晴れの強さ（0〜1・夜は 0）、glow = 朝夕・雨あがりの 上のせ */
  update(dt: number, time: number, size: number, storm: number, sun: number, glow: number, high: boolean) {
    if (size !== this.size) this.build(size)
    const lim = size * 0.5 + 16
    this.cloudMat.color.setRGB(1 - storm * 0.45, 1 - storm * 0.42, 1 - storm * 0.36)
    this.clouds.forEach((c, i) => {
      c.x += c.v * dt * (1 + storm * 1.5)
      if (c.x > lim) c.x = -lim
      // 雨の時は 雲が 島の上へ せり出す。晴れは 半分だけ
      const inward = storm * (size * 0.13)
      c.g.position.set(c.x, c.y + Math.sin(time * 0.3 + i) * 0.3 + storm * 2.5, c.z - Math.sign(c.z) * inward)
      c.g.visible = high ? i < 6 + storm * 6 : i < 3 + storm * 3
    })
    const a = high ? sun * (0.1 + glow * 0.1) : 0
    this.rays.forEach((m) => {
      m.visible = a > 0.004
      m.position.x += dt * 0.25
      if (m.position.x > size * 0.4) m.position.x = -size * 0.4
    })
    this.rayMat.opacity = a * (0.8 + Math.sin(time * 0.5) * 0.2)
    for (const b of [...this.bolts]) {
      b.t -= dt
      b.m.visible = b.t > 0.12 || Math.floor(b.t * 40) % 2 === 0
      if (b.t <= 0) {
        this.group.remove(b.m)
        b.m.geometry.dispose()
        this.bolts.splice(this.bolts.indexOf(b), 1)
      }
    }
    for (const b of [...this.beams]) {
      b.t += dt
      const u = b.t / b.dur
      const mat = b.m.material as THREE.MeshBasicMaterial
      mat.opacity = 0.42 * Math.min(1, u * 5) * Math.min(1, (1 - u) * 3)
      b.m.scale.x = b.m.scale.z = 0.7 + Math.sin(b.t * 5) * 0.06 + u * 0.3
      if (u >= 1) {
        this.group.remove(b.m)
        b.m.geometry.dispose()
        mat.dispose()
        this.beams.splice(this.beams.indexOf(b), 1)
      }
    }
  }

  /** 雷：(x, y, z) へ 空から ぎざぎざの線を おとす */
  strike(x: number, y: number, z: number) {
    const pts: THREE.Vector3[] = []
    let px = x + 4
    let pz = z - 2
    for (let h = y + 22; h > y; h -= 2.2) {
      pts.push(new THREE.Vector3(px, h, pz))
      px += (x - px) * 0.25 + (Math.random() - 0.5) * 2.4
      pz += (z - pz) * 0.25 + (Math.random() - 0.5) * 1.2
    }
    pts.push(new THREE.Vector3(x, y, z))
    const pos: number[] = []
    const w = 0.16
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      // 2 まいの板を 十字に（どの向きからも 見える）
      for (const [ox, oz] of [[w, 0], [0, w]] as const)
        pos.push(a.x - ox, a.y, a.z - oz, a.x + ox, a.y, a.z + oz, b.x + ox, b.y, b.z + oz, a.x - ox, a.y, a.z - oz, b.x + ox, b.y, b.z + oz, b.x - ox, b.y, b.z - oz)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    const m = new THREE.Mesh(g, this.boltMat)
    m.material.side = THREE.DoubleSide
    this.group.add(m)
    this.bolts.push({ m, t: 0.24 })
  }

  /** 天に のぼる 光の柱（dur 秒） */
  ascend(x: number, y: number, z: number, dur: number) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.5, 14, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
    )
    m.position.set(x, y + 7, z)
    m.renderOrder = 6
    this.group.add(m)
    this.beams.push({ m, t: 0, dur })
  }

  dispose() {
    this.cloudMat.dispose()
    this.rayMat.dispose()
    this.boltMat.dispose()
  }
}
