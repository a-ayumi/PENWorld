import * as THREE from 'three'
import { psx, SNAP_GLSL, snapUniform } from './psx'
import { rng } from './textures'
import { HALF, SIZE, dens, disposeTree, edge, lambert, mounds, motes, placer, skyDome, smooth, terrain, voidSpace } from './stages'
import type { FoodSpot, Obstacle, Stage } from './stages'

/**
 * 追加ステージ 2 種（どちらもオリジナル）：
 *  6. ほむらのかざん（EMBER CRATER）— 黒い岩盤・溶岩・黒曜石・噴煙
 *  7. こだいのいせき（ANCIENT RUINS）— 苔むした石畳・折れた柱・浮かぶ石板・夜に光る文様
 * 共通の道具（terrain / skyDome / motes / placer など）は stages.ts のものをそのまま使う。
 */

// ---------- この 2 ステージだけで使う小さな道具 ----------
type Draw = (g: CanvasRenderingContext2D, s: number, rnd: () => number) => void
/** 手続きテクスチャ（Nearest・ミップ無し）。textures.ts の make と同じ作り */
function mk(draw: Draw, size = 64, seed = 1, repeat: [number, number] = [1, 1]) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  draw(g, size, rng(seed))
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  t.generateMipmaps = false
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat[0], repeat[1])
  return t
}
function speckle(g: CanvasRenderingContext2D, s: number, rnd: () => number, palette: string[], block = 2) {
  for (let y = 0; y < s; y += block)
    for (let x = 0; x < s; x += block) {
      g.fillStyle = palette[Math.floor(rnd() * palette.length)]
      g.fillRect(x, y, block, block)
    }
}
/** 土台の側面（地層 + 底に光る線） */
function sideTex(soil: string[], top: [string, string], glow: string, seed: number) {
  return mk((g, s, r) => {
    speckle(g, s, r, soil)
    g.fillStyle = 'rgba(0,0,0,0.2)'
    g.fillRect(0, 26, s, 2)
    g.fillRect(0, 44, s, 2)
    for (let i = 0; i < 6; i++) {
      g.fillStyle = soil[0]
      g.fillRect(Math.floor(r() * 30) * 2, 16 + Math.floor(r() * 20) * 2, 4, 2)
    }
    g.fillStyle = top[0]
    g.fillRect(0, 0, s, 6)
    g.fillStyle = top[1]
    for (let x = 0; x < s; x += 4) g.fillRect(x, 6, 2, 2 + (x % 8 === 0 ? 2 : 0))
    g.fillStyle = '#1b1a2a'
    g.fillRect(0, 56, s, 8)
    g.fillStyle = glow
    g.fillRect(0, 58, s, 2)
    for (let x = 4; x < s; x += 16) g.fillRect(x, 58, 4, 6)
  }, 64, seed, [5, 1])
}
function baseBox(tex: THREE.Texture) {
  const side = psx(new THREE.MeshLambertMaterial({ map: tex }))
  const bottom = new THREE.MeshBasicMaterial({ color: '#0d1530' })
  const box = new THREE.Mesh(new THREE.BoxGeometry(SIZE, 3, SIZE), [side, side, bottom, bottom, side, side])
  box.position.y = -1.5 + 0.2
  return box
}
/** 中心がやわらかく光る丸い板用のテクスチャ（段のあるアルファ） */
function glowTex(seed: number) {
  return mk((g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.5, 'rgba(255,255,255,0.45)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, s, s)
  }, 32, seed)
}

// =====================================================================
// 6. ほむらのかざん（Ember Crater）
// =====================================================================
interface LavaPool { x: number; z: number; r: number; crust: number }

function lavaMat(crust: number) {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, night: { value: 0 }, crust: { value: crust }, uSnap: snapUniform },
    vertexShader: /* glsl */ `${SNAP_GLSL}
      varying vec2 vW; varying vec2 vUv;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; gl_Position = psxSnap(projectionMatrix * viewMatrix * w); }`,
    fragmentShader: /* glsl */ `
      uniform float time; uniform float night; uniform float crust; varying vec2 vW; varying vec2 vUv;
      float hs(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 q = floor(vW * 5.0) / 5.0;
        float f = sin(q.x * 2.1 + time * 0.6) + sin(q.y * 2.7 - time * 0.5) + sin((q.x + q.y) * 1.7 + time * 0.4);
        float v = 0.5 + 0.5 * sin(f * 1.4 + hs(floor(vW * 2.5)) * 0.9);
        vec3 c = mix(vec3(0.42, 0.06, 0.03), vec3(0.95, 0.32, 0.06), smoothstep(0.2, 0.7, v));
        c = mix(c, vec3(1.0, 0.82, 0.28), smoothstep(0.82, 0.97, v));
        c *= 1.0 + night * 0.55;
        float d = distance(vUv, vec2(0.5)) * 2.0;
        c = mix(c, vec3(0.16, 0.04, 0.05), crust * smoothstep(0.8, 0.93, d));
        gl_FragColor = vec4(c, 1.0);
      }`,
  })
}

/** 火口や噴気孔から立ちのぼる煙の粒 */
function plume(count: number, rise: number, size: number) {
  const geo = new THREE.BufferGeometry()
  const r = rng(count * 7 + 3)
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  geo.setAttribute('seed', new THREE.BufferAttribute(Float32Array.from({ length: count }, () => r()), 1))
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 }, rise: { value: rise }, size: { value: size }, uSnap: snapUniform },
    vertexShader: /* glsl */ `${SNAP_GLSL}
      uniform float time; uniform float rise; uniform float size;
      attribute float seed; varying float vT;
      void main(){
        float t = fract(time * 0.16 + seed);
        vT = t;
        vec3 q = position;
        q.y += t * rise;
        q.x += sin(t * 5.0 + seed * 40.0) * 0.28 * t + t * 0.5;
        q.z += cos(t * 4.0 + seed * 30.0) * 0.2 * t;
        gl_Position = psxSnap(projectionMatrix * modelViewMatrix * vec4(q, 1.0));
        gl_PointSize = mix(size * 0.5, size * 1.8, t);
      }`,
    fragmentShader: /* glsl */ `
      varying float vT;
      void main(){
        vec2 p = gl_PointCoord - 0.5;
        if (dot(p, p) > 0.25) discard;
        vec3 c = mix(vec3(1.0, 0.55, 0.22), vec3(0.28, 0.24, 0.27), smoothstep(0.0, 0.35, vT));
        gl_FragColor = vec4(c, (1.0 - vT) * 0.85);
      }`,
  })
  const pts = new THREE.Points(geo, mat)
  pts.frustumCulled = false
  return pts
}

function volcano(): Stage {
  const crater = { x: -5, z: -5.2 }
  const pools: LavaPool[] = [
    { x: 4.4, z: -3.2, r: 2.3, crust: 1 },
    // 川（丸をつなぐ。つなぎ目に縁を出さない）
    ...([[-7.4, 2.0], [-6.3, 3.3], [-5.0, 4.4], [-3.5, 5.1], [-2.0, 5.4]] as const).map(([x, z]) => ({ x, z, r: 0.95, crust: 0 })),
  ]
  // かいたくで広くなったら、小さな溶岩だまりも増やす
  const rr = rng(405)
  const extra = Math.max(0, dens(2) - 2)
  for (let n = 0, tries = 0; n < extra && tries < 300; tries++) {
    const x = (rr() * 2 - 1) * (HALF - 2)
    const z = (rr() * 2 - 1) * (HALF - 2)
    const r = 1.0 + rr() * 0.5
    if (Math.hypot(x, z) < 4.5) continue
    if ([...pools, { x: crater.x, z: crater.z, r: 2.8, crust: 0 }].some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r + 1.4)) continue
    pools.push({ x, z, r, crust: 1 })
    n++
  }

  const heightAt = (x: number, z: number) => {
    const dc2 = (x - crater.x) ** 2 + (z - crater.z) ** 2
    const ridge = 1 - Math.abs(Math.sin(x * 0.45 + Math.cos(z * 0.3) * 1.3))
    let h =
      0.3 +
      (ridge * ridge * 0.9 + Math.sin(z * 0.7 + x * 0.35) * 0.18 + Math.cos(x * 1.3) * Math.sin(z * 1.1) * 0.12 +
        mounds(x, z, [[6, 5, 2.4, 1.5], [-7, -1, 2, 1.1], [1, -7, 2.2, 1.3]]) +
        2.4 * Math.exp(-dc2 / (2.3 * 2.3)) - 1.7 * Math.exp(-dc2 / (0.85 * 0.85))) * edge(x, z)
    for (const p of pools) h = THREE.MathUtils.lerp(0.24, h, smooth(p.r - 0.3, p.r + 1.0, Math.hypot(x - p.x, z - p.z)))
    return Math.max(0.24, h)
  }

  const basalt = mk((g, s, r) => {
    speckle(g, s, r, ['#2e2933', '#38323d', '#443d49', '#26212b', '#38323d'])
    for (let i = 0; i < 12; i++) {
      g.fillStyle = ['#ff6a2a', '#c8421c', '#ffb347'][i % 3]
      g.fillRect(Math.floor(r() * 31) * 2, Math.floor(r() * 31) * 2, 2, 2)
    }
    g.fillStyle = 'rgba(255,120,60,0.22)'
    g.fillRect(0, 0, s, 1)
    g.fillRect(0, 0, 1, s)
  }, 64, 61, [6, 6])
  const group = new THREE.Group()
  group.add(
    terrain(heightAt, basalt, ['#ffffff', '#e6d6f0']),
    baseBox(sideTex(['#3a3340', '#2e2833', '#453d4b', '#241f29'], ['#4a4250', '#37303d'], '#ff8a3a', 62)),
  )

  const obstacles: Obstacle[] = pools.map((p) => ({ x: p.x, z: p.z, r: p.r - 0.25, water: true, lava: true }))
  const foodSpots: FoodSpot[] = []
  const put = placer(71, obstacles, [{ x: crater.x, z: crater.z, r: 1.4 }])

  // 溶岩
  const matPool = lavaMat(1)
  const matRiver = lavaMat(0)
  const glowT = glowTex(63)
  const glowMat = new THREE.MeshBasicMaterial({ map: glowT, color: '#ff7a2a', transparent: true, opacity: 0.15, depthWrite: false, blending: THREE.AdditiveBlending })
  for (const p of pools) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(p.r + 0.15, 14).rotateX(-Math.PI / 2), p.crust ? matPool : matRiver)
    m.position.set(p.x, 0.31, p.z)
    group.add(m)
    const gl = new THREE.Mesh(new THREE.CircleGeometry(p.r + 1.5, 14).rotateX(-Math.PI / 2), glowMat)
    gl.position.set(p.x, 0.36, p.z)
    group.add(gl)
  }
  // 溶岩だまりのふちの黒い石
  const rim = lambert('#2c2630', { map: basalt })
  for (const p of pools.filter((q) => q.crust)) {
    const n = Math.round(p.r * 4)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + p.x
      const s = 0.2 + ((i * 7) % 5) * 0.04
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rim)
      st.position.set(p.x + Math.cos(a) * (p.r + 0.05), 0.3, p.z + Math.sin(a) * (p.r + 0.05))
      group.add(st)
    }
  }

  // 火口（山の頂上）
  const craterY = heightAt(crater.x, crater.z)
  const cLava = new THREE.Mesh(new THREE.CircleGeometry(0.7, 10).rotateX(-Math.PI / 2), matRiver)
  cLava.position.set(crater.x, craterY + 0.06, crater.z)
  group.add(cLava)
  obstacles.push({ x: crater.x, z: crater.z, r: 0.55, water: true, lava: true })
  const smokes: THREE.Points[] = []
  const bigSmoke = plume(26, 3.6, 8)
  bigSmoke.position.set(crater.x, craterY + 0.2, crater.z)
  group.add(bigSmoke)
  smokes.push(bigSmoke)

  // 黒曜石の柱
  const obsA = lambert('#231a2e', { emissive: '#1a0a2a' })
  const obsB = lambert('#3a2b4c', { emissive: '#240e3a' })
  for (let i = 0; i < dens(8); i++) {
    const p = put(0.6)
    if (!p) break
    const g = new THREE.Group()
    const n = 2 + Math.floor(p.r() * 3)
    for (let k = 0; k < n; k++) {
      const h = 0.9 + p.r() * 1.5
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.22 + p.r() * 0.08, h, 6), (k + i) % 2 ? obsA : obsB)
      sp.position.set((p.r() - 0.5) * 0.7, h / 2 - 0.05, (p.r() - 0.5) * 0.7)
      sp.rotation.set((p.r() - 0.5) * 0.45, p.r() * 3, (p.r() - 0.5) * 0.45)
      g.add(sp)
    }
    g.position.set(p.x, heightAt(p.x, p.z), p.z)
    group.add(g)
    obstacles.push({ x: p.x, z: p.z, r: 0.5 })
  }
  // 玄武岩のごろ石
  const stoneMat = lambert('#51485a', { map: basalt })
  for (let i = 0; i < dens(6); i++) {
    const p = put(0.5)
    if (!p) break
    const s = 0.35 + p.r() * 0.4
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), stoneMat)
    rock.scale.set(s * 1.2, s * 0.8, s)
    rock.position.set(p.x, heightAt(p.x, p.z) + s * 0.3, p.z)
    rock.rotation.set(p.r(), p.r() * 3, p.r())
    group.add(rock)
    obstacles.push({ x: p.x, z: p.z, r: s })
  }
  // ほのおの結晶（食べ物が実る）
  const crystals = [
    lambert('#ff8a3a', { emissive: '#ff5a1a', emissiveIntensity: 0.6 }),
    lambert('#ffd84a', { emissive: '#ffb21a', emissiveIntensity: 0.6 }),
  ]
  for (let i = 0; i < dens(7); i++) {
    const p = put(0.6)
    if (!p) break
    const c = new THREE.Group()
    const mat = crystals[i % 2]
    for (let k = 0; k < 3 + Math.floor(p.r() * 2); k++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), mat)
      m.scale.y = 1.8 + p.r() * 1.6
      m.position.set((p.r() - 0.5) * 0.7, 0.33, (p.r() - 0.5) * 0.7)
      m.rotation.set((p.r() - 0.5) * 0.7, p.r() * 3, (p.r() - 0.5) * 0.7)
      c.add(m)
    }
    c.position.set(p.x, heightAt(p.x, p.z), p.z)
    group.add(c)
    obstacles.push({ x: p.x, z: p.z, r: 0.5 })
    foodSpots.push({ x: p.x, z: p.z })
  }
  // ふんきこう（小さな噴煙）
  const ventMat = lambert('#3c3440', { map: basalt })
  const ventCore = new THREE.MeshBasicMaterial({ color: '#ff7a2a' })
  for (let i = 0; i < dens(3); i++) {
    const p = put(0.5, 3)
    if (!p) break
    const v = new THREE.Group()
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.34, 0.42, 7), ventMat)
    cone.position.y = 0.2
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 7), ventCore)
    core.position.y = 0.42
    v.add(cone, core)
    const y = heightAt(p.x, p.z)
    v.position.set(p.x, y, p.z)
    group.add(v)
    const sm = plume(10, 1.9, 5)
    sm.position.set(p.x, y + 0.45, p.z)
    group.add(sm)
    smokes.push(sm)
    obstacles.push({ x: p.x, z: p.z, r: 0.35 })
  }

  const sky = skyDome(['#2b0a1c', '#ff6a30', '#1a0a10'], 0)
  const vs = voidSpace('#ff6a3a')
  const embers = motes('#ffb347', 70)
  group.add(sky.mesh, vs.group, embers)

  return {
    id: 5, name: 'ほむらのかざん', sub: 'EMBER CRATER', group, heightAt, obstacles, foodSpots,
    food: { name: 'ほのおのかけら', color: '#ff8a3a', leaf: '#ffd84a' },
    residents: ['noiz', 'gougan', 'noiz', 'gougan'],
    fog: '#8e3a24', sky: ['#2b0a1c', '#ff6a30', '#1a0a10'],
    sun: { color: '#ffb078', intensity: 2.3, dir: [-5, 7, 4] }, hemi: ['#ffc9a0', '#4a2a2a', 1.35],
    fogRange: [12, 30],
    update(t, night) {
      matPool.uniforms.time.value = t
      matRiver.uniforms.time.value = t
      matPool.uniforms.night.value = night
      matRiver.uniforms.night.value = night
      glowMat.opacity = 0.14 + night * 0.5
      const pulse = 0.5 + night * 0.9 + Math.sin(t * 2.2) * 0.12
      crystals.forEach((m, i) => (m.emissiveIntensity = pulse + Math.sin(t * 1.7 + i) * 0.08))
      for (const s of smokes) (s.material as THREE.ShaderMaterial).uniforms.time.value = t
      sky.mat.uniforms.time.value = t
      sky.mat.uniforms.night.value = night * 0.8
      ;(embers.material as THREE.ShaderMaterial).uniforms.time.value = t
      vs.update(t)
    },
    dispose: () => {
      disposeTree(group)
      glowT.dispose()
    },
  }
}

// =====================================================================
// 7. こだいのいせき（Ancient Ruins）— 完全に想像上の遺跡
// =====================================================================
/** 幾何学の文様を 32×32 の升目に描く（4 種）。fg の色で塗る */
function drawGlyph(g: CanvasRenderingContext2D, v: number, fg: string, ox = 0, oy = 0) {
  g.fillStyle = fg
  const px = (x: number, y: number, w = 1, h = 1) => g.fillRect((ox + x) * 2, (oy + y) * 2, w * 2, h * 2)
  // 外わく
  px(2, 2, 28, 1); px(2, 29, 28, 1); px(2, 2, 1, 28); px(29, 2, 1, 28)
  if (v === 0) {
    for (const k of [6, 10]) { px(k, k, 32 - 2 * k, 1); px(k, 31 - k, 32 - 2 * k, 1); px(k, k, 1, 32 - 2 * k); px(31 - k, k, 1, 32 - 2 * k) }
    px(14, 14, 4, 4)
    px(15, 2, 2, 8); px(15, 22, 2, 8); px(2, 15, 8, 2); px(22, 15, 8, 2)
  } else if (v === 1) {
    for (let k = 0; k <= 12; k++) { px(16 + k, 4 + k); px(15 - k, 4 + k); px(16 + k, 27 - k); px(15 - k, 27 - k) }
    px(15, 9, 2, 5); px(15, 18, 2, 5); px(9, 15, 5, 2); px(18, 15, 5, 2)
  } else if (v === 2) {
    const seg: [number, number, number, number][] = [
      [6, 6, 20, 1], [25, 6, 1, 20], [10, 25, 16, 1], [10, 10, 1, 16], [10, 10, 12, 1], [21, 10, 1, 12], [14, 21, 8, 1], [14, 14, 1, 8], [14, 14, 4, 1],
    ]
    for (const [x, y, w, h] of seg) px(x, y, w, h)
  } else {
    for (let i = 0; i < 5; i++) px(16 - (10 - i * 2), 6 + i * 4, 20 - i * 4, 2)
    for (let i = 0; i < 4; i++) { px(6 + i * 7, 27, 2, 2) }
    px(15, 4, 2, 1)
  }
}
function runeTex(v: number, glow: boolean) {
  return mk((g, s, r) => {
    if (glow) {
      g.fillStyle = '#000'
      g.fillRect(0, 0, s, s)
      drawGlyph(g, v, '#a8ffff')
    } else {
      speckle(g, s, r, ['#8a9a8c', '#7d8e80', '#97a898', '#6f8274'])
      g.fillStyle = 'rgba(40,60,50,0.4)'
      g.fillRect(0, 31, s, 2)
      for (let i = 0; i < 9; i++) {
        g.fillStyle = ['#4f7a48', '#5f8c54', '#3f6a40'][i % 3]
        g.fillRect(Math.floor(r() * 30) * 2, Math.floor(r() * 30) * 2, 4, 2)
      }
      drawGlyph(g, v, '#4f6e72')
    }
  }, 64, 80 + v)
}
/** 床の円形の文様（二重の輪 + 8 本の筋） */
function plazaTex(glow: boolean) {
  return mk((g, s, r) => {
    if (glow) { g.fillStyle = '#000'; g.fillRect(0, 0, s, s) } else {
      speckle(g, s, r, ['#9aa89a', '#8c9c8e', '#a6b4a6', '#7f9082'])
    }
    g.fillStyle = glow ? '#a8ffff' : '#587a7c'
    const dot = (x: number, y: number) => g.fillRect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, 2, 2)
    for (const rad of [29, 21, 12]) for (let a = 0; a < Math.PI * 2; a += 0.5 / rad) dot(32 + Math.cos(a) * rad, 32 + Math.sin(a) * rad)
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8
      for (let d = 13; d < 21; d += 2) dot(32 + Math.cos(a) * d, 32 + Math.sin(a) * d)
    }
    g.fillRect(28, 28, 8, 8)
  }, 64, 88)
}
const mossStone = () =>
  mk((g, s, r) => {
    speckle(g, s, r, ['#9aa89a', '#8c9c8e', '#a6b4a6', '#7f9082'])
    g.fillStyle = 'rgba(40,60,50,0.4)'
    for (let y = 0; y < s; y += 16) g.fillRect(0, y, s, 1)
    for (let i = 0; i < 12; i++) {
      g.fillStyle = ['#4f7a48', '#5f8c54', '#3f6a40'][i % 3]
      g.fillRect(Math.floor(r() * 15) * 2, Math.floor(r() * 15) * 2, 4, 2)
    }
  }, 32, 85)
const flute = () =>
  mk((g, s, r) => {
    speckle(g, s, r, ['#aab8a8', '#9cac9c', '#b6c4b4'], 2)
    g.fillStyle = 'rgba(40,60,50,0.35)'
    for (let x = 0; x < s; x += 8) g.fillRect(x, 0, 2, s)
    for (let i = 0; i < 6; i++) {
      g.fillStyle = ['#4f7a48', '#5f8c54'][i % 2]
      g.fillRect(Math.floor(r() * 7) * 4, 20 + Math.floor(r() * 6) * 2, 4, 4)
    }
  }, 32, 86, [1, 1])
const mistTex = () =>
  mk((g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    grad.addColorStop(0, 'rgba(255,255,255,0.9)')
    grad.addColorStop(0.55, 'rgba(255,255,255,0.4)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, s, s)
  }, 16, 89)

function ruins(): Stage {
  const dais = { x: -3.2, z: -4.2, r: 2.3, h: 0.62 }
  const plaza = { x: 4.2, z: 3.6, r: 2.0, h: 0.34 }
  const heightAt = (x: number, z: number) => {
    let h = 0.32 + (Math.sin(x * 0.5) * Math.cos(z * 0.45) * 0.22 + Math.sin(x * 1.1 + z * 0.8) * 0.07 + mounds(x, z, [[6.5, -5, 2.0, 0.8], [-6.5, 5, 2.2, 0.7]])) * edge(x, z)
    h = THREE.MathUtils.lerp(dais.h, h, smooth(dais.r, dais.r + 1.2, Math.hypot(x - dais.x, z - dais.z)))
    h = THREE.MathUtils.lerp(plaza.h, h, smooth(plaza.r, plaza.r + 1.0, Math.hypot(x - plaza.x, z - plaza.z)))
    return Math.max(0.24, h)
  }
  const texs: THREE.Texture[] = []
  const T = <X extends THREE.Texture>(t: X) => (texs.push(t), t)
  const group = new THREE.Group()
  const floorTex = T(mk((g, s, r) => {
    speckle(g, s, r, ['#8fa08f', '#82948a', '#9bac9b', '#788c80'])
    g.fillStyle = 'rgba(30,50,40,0.45)'
    for (let y = 0; y < s; y += 16) g.fillRect(0, y, s, 2)
    for (let y = 0; y < s; y += 16) for (let x = (y / 16) % 2 ? 0 : 8; x < s; x += 16) g.fillRect(x, y, 2, 16)
    for (let i = 0; i < 26; i++) {
      g.fillStyle = ['#4f8a4c', '#5f9c58', '#3f7442', '#74ad5e'][i % 4]
      g.fillRect(Math.floor(r() * 31) * 2, Math.floor(r() * 31) * 2, 2 + (i % 3) * 2, 2)
    }
  }, 64, 83, [6, 6]))
  group.add(
    terrain(heightAt, floorTex, ['#ffffff', '#dfeedd']),
    baseBox(T(sideTex(['#5d6e62', '#506256', '#6a7c6e', '#44564a'], ['#6fae5a', '#4f8a4c'], '#8fe8ff', 84))),
  )

  const obstacles: Obstacle[] = []
  const foodSpots: FoodSpot[] = []
  const put = placer(97, obstacles, [dais, plaza, { x: 0, z: 0, r: 1.2 }])
  const stone = lambert('#b4c4b0', { map: T(mossStone()) })
  const fluted = lambert('#c4d2c0', { map: T(flute()) })
  const moss = lambert('#4f8a4c')
  const vineA = lambert('#3f9a52')
  const vineB = lambert('#2f7a42')

  /** ツタ：細い房にときどき葉がつく */
  const vine = (len: number, seed: number) => {
    const g = new THREE.Group()
    const r = rng(seed)
    let x = 0
    for (let y = 0; y < len; y += 0.2) {
      x += (r() - 0.5) * 0.06
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.04), vineB)
      seg.position.set(x, -y, 0)
      g.add(seg)
      if (r() < 0.45) {
        const leaf = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), vineA)
        leaf.scale.z = 0.4
        leaf.position.set(x + (r() < 0.5 ? -1 : 1) * 0.08, -y, 0.02)
        leaf.rotation.z = r() * 3
        g.add(leaf)
      }
    }
    return g
  }
  /** 苔のこぶ（根元に置く） */
  const mossAt = (g: THREE.Group, rad: number, y = 0.1) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 1.15, 0.22, 8), moss)
    m.position.y = y
    g.add(m)
  }

  // ---- くずれた神殿のアーチ ----
  const arch = (x: number, z: number, rot: number, s: number, gaps: number[], seed: number) => {
    const g = new THREE.Group()
    const R = 1.5
    for (const sx of [-1, 1]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.62, 2.2, 0.62), fluted)
      pier.position.set(sx * R, 1.1, 0)
      pier.rotation.z = sx * 0.02
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.26, 0.86), stone)
      foot.position.set(sx * R, 0.13, 0)
      g.add(pier, foot)
      const v = vine(1.1 + sx * 0.2, seed + sx)
      v.position.set(sx * R + 0.33, 1.9, 0.1)
      g.add(v)
    }
    const N = 9
    for (let i = 0; i < N; i++) {
      const a = (i / (N - 1)) * Math.PI
      if (gaps.includes(i)) {
        // 落ちた石材
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.52, 0.6), stone)
        f.position.set(Math.cos(a) * 1.1 + (i - 4) * 0.25, 0.26, 0.9 + (i % 3) * 0.35)
        f.rotation.set(0.1 * i, i * 1.3, 0.2)
        g.add(f)
        continue
      }
      const b = new THREE.Mesh(new THREE.BoxGeometry(i === 4 ? 0.62 : 0.5, 0.56, 0.62), stone)
      b.position.set(Math.cos(a) * R, 2.2 + Math.sin(a) * R, 0)
      b.rotation.z = a
      g.add(b)
    }
    for (let k = 0; k < 4; k++) {
      const v = vine(0.7 + k * 0.25, seed + 10 + k)
      const a = (0.2 + k * 0.2) * Math.PI
      v.position.set(Math.cos(a) * R, 2.2 + Math.sin(a) * R - 0.3, 0.33)
      g.add(v)
    }
    g.scale.setScalar(s)
    g.rotation.y = rot
    g.position.set(x, heightAt(x, z) - 0.1, z)
    group.add(g)
    for (const sx of [-1, 1]) obstacles.push({ x: x + Math.cos(rot) * sx * R * s, z: z - Math.sin(rot) * sx * R * s, r: 0.5 * s })
  }
  arch(dais.x, dais.z, 0.25, 1, [2, 3], 5)
  const extraArches = Math.max(0, dens(1) - 1)
  for (let i = 0; i < extraArches; i++) {
    const p = put(1.9, 4)
    if (!p) break
    arch(p.x, p.z, p.r() * Math.PI, 0.85, [1 + Math.floor(p.r() * 6)], 20 + i * 3)
  }

  // ---- 折れた石柱 ----
  const pillar = (x: number, z: number, h: number, tilt: number, broken: boolean, seed: number) => {
    const g = new THREE.Group()
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.22, 0.86), stone)
    foot.position.y = 0.11
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, h, 8), fluted)
    shaft.position.y = 0.22 + h / 2
    g.add(foot, shaft)
    if (broken) {
      for (let k = 0; k < 3; k++) {
        const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + k * 0.03, 0), stone)
        c.position.set(Math.cos(k * 2.4 + seed) * 0.6, 0.12, Math.sin(k * 2.4 + seed) * 0.6)
        g.add(c)
      }
    } else {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.8), stone)
      cap.position.y = 0.22 + h + 0.11
      g.add(cap)
    }
    mossAt(g, 0.42)
    if (h > 1.2) {
      const v = vine(Math.min(1.3, h * 0.6), seed)
      v.position.set(0.3, h * 0.8, 0.12)
      g.add(v)
    }
    g.rotation.z = tilt
    g.position.set(x, heightAt(x, z) - 0.05, z)
    group.add(g)
    obstacles.push({ x, z, r: 0.45 })
  }
  pillar(-0.8, -6.2, 2.4, 0.03, false, 31)
  pillar(-6.6, -1.2, 1.1, -0.06, true, 32)
  for (let i = 0; i < dens(5); i++) {
    const p = put(0.5)
    if (!p) break
    const broken = p.r() < 0.6
    pillar(p.x, p.z, broken ? 0.6 + p.r() * 1.0 : 1.8 + p.r() * 0.7, (p.r() - 0.5) * 0.12, broken, 40 + i)
  }
  // 倒れた柱（輪切りの石がころがる）
  const drum = (x: number, z: number, rot: number) => {
    const g = new THREE.Group()
    for (let k = 0; k < 3; k++) {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.62, 8).rotateZ(Math.PI / 2), fluted)
      d.position.set(k * 0.68 - 0.68 + (k === 2 ? 0.1 : 0), 0.3, k === 2 ? 0.12 : 0)
      g.add(d)
    }
    mossAt(g, 0.5, 0.06)
    g.position.set(x, heightAt(x, z), z)
    g.rotation.y = rot
    group.add(g)
    obstacles.push({ x, z, r: 0.9 })
  }
  drum(4.0, -4.4, 0.6)
  for (let i = 0; i < dens(1) - 1; i++) {
    const p = put(1.0)
    if (!p) break
    drum(p.x, p.z, p.r() * 3)
  }

  // ---- 文様の石碑（夜に光る） ----
  const runeMats: THREE.MeshLambertMaterial[] = []
  const runeMat = (v: number) => {
    const m = psx(new THREE.MeshLambertMaterial({ map: T(runeTex(v, false)), emissive: '#ffffff', emissiveMap: T(runeTex(v, true)), emissiveIntensity: 0.12 }))
    runeMats.push(m)
    return m
  }
  const rm = [0, 1, 2, 3].map(runeMat)
  const plain = lambert('#7f9082', { map: T(mossStone()) })
  const monolith = (x: number, z: number, v: number, faceX: number, faceZ: number) => {
    const g = new THREE.Group()
    const face = rm[v % 4]
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.7, 0.3), [plain, plain, plain, plain, face, face])
    body.position.y = 0.85
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.3), plain)
    top.position.set(0.1, 1.74, 0)
    top.rotation.z = -0.12
    g.add(body, top)
    mossAt(g, 0.45)
    g.position.set(x, heightAt(x, z) - 0.05, z)
    g.rotation.y = Math.atan2(faceX - x, faceZ - z)
    group.add(g)
    obstacles.push({ x, z, r: 0.5 })
  }
  // 床の円形文様のまわりに 3 枚
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.6
    monolith(plaza.x + Math.cos(a) * (plaza.r + 0.7), plaza.z + Math.sin(a) * (plaza.r + 0.7), k, plaza.x, plaza.z)
  }
  for (let i = 0; i < dens(2) - 2; i++) {
    const p = put(0.5)
    if (!p) break
    monolith(p.x, p.z, 3 + i, 0, 0)
  }
  const plazaMat = psx(new THREE.MeshLambertMaterial({ map: T(plazaTex(false)), emissive: '#ffffff', emissiveMap: T(plazaTex(true)), emissiveIntensity: 0.12 }))
  runeMats.push(plazaMat)
  const disk = new THREE.Mesh(new THREE.CircleGeometry(plaza.r - 0.1, 16).rotateX(-Math.PI / 2), plazaMat)
  disk.position.set(plaza.x, plaza.h + 0.04, plaza.z)
  group.add(disk)

  // ---- 光る実のなる木 ----
  const bark = lambert('#5b4a3a')
  const leafA = lambert('#2f7a52')
  const leafB = lambert('#46a064')
  const fruit = lambert('#9dffd0', { emissive: '#7dffc0', emissiveIntensity: 0.4 })
  for (let i = 0; i < dens(5); i++) {
    const p = put(0.6)
    if (!p) break
    const t = new THREE.Group()
    const lean = (p.r() - 0.5) * 0.5
    let top = new THREE.Vector3()
    for (let k = 0; k < 4; k++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.1 - k * 0.012, 0.15 - k * 0.012, 0.42, 6), bark)
      seg.position.set(lean * k * 0.3, 0.2 + k * 0.4, 0)
      seg.rotation.z = -lean * 0.4
      t.add(seg)
      top = seg.position.clone().add(new THREE.Vector3(0, 0.2, 0))
    }
    for (const [dx, dy, dz, s, m] of [[0, 0.5, 0, 0.78, leafA], [0.45, 0.2, 0.2, 0.5, leafB], [-0.4, 0.3, -0.25, 0.52, leafB]] as const) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), m)
      c.position.copy(top).add(new THREE.Vector3(dx, dy, dz))
      t.add(c)
    }
    for (let k = 0; k < 5; k++) {
      const f = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), fruit)
      const a = k * 1.3 + p.r()
      f.position.copy(top).add(new THREE.Vector3(Math.cos(a) * 0.72, 0.05 + (k % 3) * 0.2, Math.sin(a) * 0.72))
      t.add(f)
    }
    const s = 0.9 + p.r() * 0.4
    t.scale.setScalar(s)
    t.position.set(p.x, heightAt(p.x, p.z) - 0.05, p.z)
    t.rotation.y = p.r() * 6
    group.add(t)
    obstacles.push({ x: p.x, z: p.z, r: 0.35 * s })
    foodSpots.push({ x: p.x, z: p.z })
  }
  // 苔むした岩
  const rockMat = lambert('#8fa890', { map: T(mossStone()) })
  for (let i = 0; i < dens(4); i++) {
    const p = put(0.5)
    if (!p) break
    const s = 0.35 + p.r() * 0.35
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rockMat)
    rock.scale.set(s * 1.25, s * 0.75, s)
    rock.position.set(p.x, heightAt(p.x, p.z) + s * 0.25, p.z)
    rock.rotation.set(p.r(), p.r() * 3, p.r())
    group.add(rock)
    obstacles.push({ x: p.x, z: p.z, r: s })
  }

  // ---- 宙に浮かぶ石板 ----
  const slabMat = psx(new THREE.MeshLambertMaterial({ map: T(runeTex(1, false)), emissive: '#ffffff', emissiveMap: T(runeTex(1, true)), emissiveIntensity: 0.12 }))
  runeMats.push(slabMat)
  const slabSide = lambert('#7f9082', { map: T(mossStone()) })
  const crystalMat = lambert('#8fe8ff', { emissive: '#4fc8e8', emissiveIntensity: 0.5 })
  const shadowMat = new THREE.MeshBasicMaterial({ color: '#05140f', transparent: true, opacity: 0.28, depthWrite: false })
  const slabs: { g: THREE.Group; sh: THREE.Mesh; y: number; ph: number; gy: number }[] = []
  const slabSpots: { x: number; z: number }[] = [{ x: -1.6, z: 2.4 }, { x: 2.0, z: -1.2 }]
  for (let i = 0; i < dens(4) - 2; i++) {
    const p = put(0.6, 3)
    if (!p) break
    slabSpots.push({ x: p.x, z: p.z })
  }
  slabSpots.forEach((sp, i) => {
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.8), [slabSide, slabSide, slabMat, slabSide, slabSide, slabSide])
    const gem = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.36, 5).rotateX(Math.PI), crystalMat)
    gem.position.y = -0.26
    g.add(body, gem)
    const gy = heightAt(sp.x, sp.z)
    const y = gy + 1.9 + (i % 3) * 0.35
    g.position.set(sp.x, y, sp.z)
    group.add(g)
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.5, 8).rotateX(-Math.PI / 2), shadowMat)
    sh.position.set(sp.x, gy + 0.03, sp.z)
    group.add(sh)
    slabs.push({ g, sh, y, ph: i * 1.7, gy })
  })

  // ---- 低くたなびく霧 ----
  const mistT = T(mistTex())
  const mistMat = new THREE.MeshBasicMaterial({ map: mistT, color: '#e8fff4', transparent: true, opacity: 0.3, depthWrite: false })
  const mists: { m: THREE.Mesh; vx: number; vz: number; ph: number }[] = []
  const mr = rng(311)
  for (let i = 0; i < dens(6); i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2 + mr() * 2.2, 3.2 + mr() * 2.2).rotateX(-Math.PI / 2), mistMat)
    m.position.set((mr() * 2 - 1) * HALF, 0.62 + mr() * 0.5, (mr() * 2 - 1) * HALF)
    group.add(m)
    mists.push({ m, vx: (mr() - 0.3) * 0.25, vz: (mr() - 0.5) * 0.12, ph: mr() * 10 })
  }

  const sky = skyDome(['#274a60', '#b5ddcf', '#0e1e2a'], 0)
  const vs = voidSpace('#8fe8ff')
  const spores = motes('#d8fff0', 50)
  group.add(sky.mesh, vs.group, spores)

  return {
    id: 6, name: 'こだいのいせき', sub: 'ANCIENT RUINS', group, heightAt, obstacles, foodSpots,
    food: { name: 'ひかりのみ', color: '#9dffd0', leaf: '#3f9e6a' },
    residents: ['noiz', 'togebug', 'noiz'],
    fog: '#86b5a3', sky: ['#274a60', '#b5ddcf', '#0e1e2a'],
    sun: { color: '#e9f6d4', intensity: 1.8, dir: [3, 9, -4] }, hemi: ['#cfeee0', '#4a6a4a', 1.3],
    fogRange: [10, 28],
    shadows: 3,
    update(t, night) {
      const glow = 0.12 + night * 1.4 + Math.sin(t * 1.3) * 0.07 * night
      for (const m of runeMats) m.emissiveIntensity = glow
      fruit.emissiveIntensity = 0.4 + night * 0.9
      crystalMat.emissiveIntensity = 0.5 + night * 0.8
      for (const s of slabs) {
        const bob = Math.sin(t * 0.8 + s.ph) * 0.18
        s.g.position.y = s.y + bob
        s.g.rotation.y = t * 0.22 + s.ph
        s.g.rotation.z = Math.sin(t * 0.5 + s.ph) * 0.05
        s.sh.scale.setScalar(1 - bob * 0.5)
      }
      mistMat.opacity = 0.17 + Math.sin(t * 0.3) * 0.03 - night * 0.05
      for (const m of mists) {
        m.m.position.x += m.vx * 0.033
        m.m.position.z += m.vz * 0.033
        if (m.m.position.x > HALF + 2) m.m.position.x = -HALF - 2
        if (m.m.position.x < -HALF - 2) m.m.position.x = HALF + 2
        if (m.m.position.z > HALF + 2) m.m.position.z = -HALF - 2
        if (m.m.position.z < -HALF - 2) m.m.position.z = HALF + 2
        m.m.position.y = 0.62 + Math.sin(t * 0.4 + m.ph) * 0.06
      }
      sky.mat.uniforms.time.value = t
      sky.mat.uniforms.night.value = night
      ;(spores.material as THREE.ShaderMaterial).uniforms.time.value = t
      vs.update(t)
    },
    dispose: () => {
      disposeTree(group)
      texs.forEach((x) => x.dispose())
    },
  }
}

/** stages.ts の STAGES に続けて並べる（ワープの順番：…→ かざん → いせき → 最初へ） */
export const STAGES2 = [volcano, ruins]
