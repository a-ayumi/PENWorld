import * as THREE from 'three'
import { psx, SNAP_GLSL, snapUniform } from './psx'
import { Tex, rng } from './textures'
import type { SpeciesId } from './monsters'

/**
 * オリジナルのステージ 3 種。どれも「デジタル空間に浮かぶ四角い箱庭」。
 * 地形・小物はローポリ + Gouraud（頂点ライティング）+ Nearest テクスチャで PS1 風に。
 */
export const SIZE = 20
export const HALF = SIZE / 2 - 0.8

export interface Obstacle { x: number; z: number; r: number }
export interface FoodSpot { x: number; z: number }

export interface Stage {
  id: number
  name: string
  sub: string
  group: THREE.Group
  heightAt(x: number, z: number): number
  obstacles: Obstacle[]
  /** 食べ物が実る場所（木の根元・結晶のそば など） */
  foodSpots: FoodSpot[]
  food: { name: string; color: string; leaf: string }
  residents: SpeciesId[]
  fog: string
  sky: [string, string, string]
  sun: { color: string; intensity: number; dir: [number, number, number] }
  hemi: [string, string, number]
  update(t: number, night: number): void
  dispose(): void
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}
/** 箱庭のふちに向かって平らにする */
const edge = (x: number, z: number) => smooth(SIZE / 2, SIZE / 2 - 2.5, Math.max(Math.abs(x), Math.abs(z)))

// ---------- 共通パーツ ----------
function terrain(heightAt: (x: number, z: number) => number, map: THREE.Texture, tint: [string, string]) {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SIZE, SIZE).rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  const colors: number[] = []
  const a = new THREE.Color(tint[0])
  const b = new THREE.Color(tint[1])
  const r = rng(42)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    // 土台の上面（y=0.2）より下に地面が沈まないようにする
    pos.setY(i, Math.max(0.24, heightAt(x, z)))
    const c = a.clone().lerp(b, r())
    colors.push(c.r, c.g, c.b)
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, psx(new THREE.MeshLambertMaterial({ map, vertexColors: true })))
  return mesh
}

function base(kind: 'grass' | 'sand' | 'snow') {
  const side = psx(new THREE.MeshLambertMaterial({ map: Tex.side(kind) }))
  const bottom = new THREE.MeshBasicMaterial({ color: '#0d1530' })
  const box = new THREE.Mesh(new THREE.BoxGeometry(SIZE, 3, SIZE), [side, side, bottom, bottom, side, side])
  box.position.y = -1.5 + 0.2
  return box
}

/** 箱庭の下に広がるデジタル空間（格子 + 漂うキューブ） */
function voidSpace(color: string) {
  const g = new THREE.Group()
  const grid = new THREE.GridHelper(160, 80, color, color)
  grid.position.y = -9
  const gm = grid.material as THREE.LineBasicMaterial
  gm.transparent = true
  gm.opacity = 0.45
  g.add(grid)
  const cubes = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    psx(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })),
    36,
  )
  const r = rng(9)
  const data = Array.from({ length: 36 }, () => {
    const a = r() * Math.PI * 2
    const d = 13 + r() * 14
    return { x: Math.cos(a) * d, z: Math.sin(a) * d, y: -6 + r() * 12, s: 0.4 + r() * 1.2, p: r() * 10 }
  })
  g.add(cubes)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const update = (t: number) => {
    data.forEach((c, i) => {
      e.set(t * 0.3 + c.p, t * 0.5 + c.p, 0)
      q.setFromEuler(e)
      m.compose(new THREE.Vector3(c.x, c.y + Math.sin(t * 0.6 + c.p) * 0.6, c.z), q, new THREE.Vector3(c.s, c.s, c.s))
      cubes.setMatrixAt(i, m)
    })
    cubes.instanceMatrix.needsUpdate = true
  }
  return { group: g, update }
}

/** グラデーションの空（夜は星、雪原はオーロラ） */
function skyDome(colors: [string, string, string], aurora: number) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(colors[0]) }, mid: { value: new THREE.Color(colors[1]) }, bot: { value: new THREE.Color(colors[2]) },
      time: { value: 0 }, night: { value: 0 }, aurora: { value: aurora }, uSnap: snapUniform,
    },
    vertexShader: /* glsl */ `
      ${SNAP_GLSL}
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = psxSnap(projectionMatrix * modelViewMatrix * vec4(position, 1.0)); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform float time; uniform float night; uniform float aurora;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        float y = vDir.y;
        vec3 c = y > 0.0 ? mix(mid, top, smoothstep(0.0, 0.6, y)) : mix(mid, bot, smoothstep(0.0, -0.4, y));
        c = mix(c, c * vec3(0.18, 0.22, 0.45), night);
        // 星
        vec2 g = floor(vec2(atan(vDir.z, vDir.x) * 60.0, y * 60.0));
        float s = step(0.992, hash(g)) * smoothstep(0.05, 0.4, y);
        c += vec3(s) * (night * 0.9 + aurora * 0.6) * (0.6 + 0.4 * sin(time * 2.0 + hash(g) * 30.0));
        // オーロラ
        float band = sin(atan(vDir.z, vDir.x) * 5.0 + time * 0.25) * 0.08 + 0.32;
        float a = smoothstep(0.12, 0.0, abs(y - band)) * aurora;
        c += a * mix(vec3(0.2, 1.0, 0.7), vec3(0.6, 0.4, 1.0), sin(time * 0.3 + vDir.x * 3.0) * 0.5 + 0.5) * 0.7;
        gl_FragColor = vec4(c, 1.0);
      }`,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(70, 16, 12), mat)
  return { mesh, mat }
}

/** 地面から立ちのぼるデータの粒 */
function motes(color: string, count = 60, fall = false) {
  const geo = new THREE.BufferGeometry()
  const p = new Float32Array(count * 3)
  const r = rng(5)
  for (let i = 0; i < count; i++) {
    p[i * 3] = (r() - 0.5) * SIZE
    p[i * 3 + 1] = r() * 6
    p[i * 3 + 2] = (r() - 0.5) * SIZE
  }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3))
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 }, color: { value: new THREE.Color(color) }, fall: { value: fall ? 1 : 0 }, uSnap: snapUniform },
    vertexShader: /* glsl */ `
      ${SNAP_GLSL}
      uniform float time; uniform float fall;
      void main() {
        vec3 q = position;
        float sp = mix(0.35, -0.9, fall);
        q.y = mod(q.y + time * sp, 6.0);
        q.x += sin(time * 0.7 + position.z) * mix(0.2, 0.6, fall);
        vec4 mv = modelViewMatrix * vec4(q, 1.0);
        gl_Position = psxSnap(projectionMatrix * mv);
        gl_PointSize = mix(2.0, 3.0, fall);
      }`,
    fragmentShader: /* glsl */ `uniform vec3 color; void main(){ gl_FragColor = vec4(color, 0.9); }`,
  })
  return new THREE.Points(geo, mat)
}

function lambert(color: string, extra: THREE.MeshLambertMaterialParameters = {}) {
  return psx(new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }))
}

/** 小物の置き場所を選ぶ（中央と既存の物を避ける） */
function placer(seed: number, obstacles: Obstacle[], avoid: { x: number; z: number; r: number }[] = []) {
  const r = rng(seed)
  return (rad: number, minCenter = 2.5) => {
    for (let i = 0; i < 300; i++) {
      const x = (r() * 2 - 1) * (HALF - 0.6)
      const z = (r() * 2 - 1) * (HALF - 0.6)
      if (Math.hypot(x, z) < minCenter) continue
      if ([...obstacles, ...avoid].some((o) => Math.hypot(o.x - x, o.z - z) < o.r + rad + 0.9)) continue
      return { x, z, r }
    }
    return null
  }
}

// =====================================================================
// 1. はじまりの森（Seed Grove）
// =====================================================================
function seedGrove(): Stage {
  const spring = { x: 4.5, z: -3.5, r: 1.6 }
  const heightAt = (x: number, z: number) => {
    let h = 0.25 + (Math.sin(x * 0.42) * Math.cos(z * 0.36) * 0.55 + Math.sin(x * 0.9 + z * 0.7) * 0.18) * edge(x, z)
    const ds = Math.hypot(x - spring.x, z - spring.z)
    h = THREE.MathUtils.lerp(0.24, h, smooth(spring.r, spring.r + 1.2, ds))
    return Math.max(0.24, h)
  }
  const group = new THREE.Group()
  group.add(terrain(heightAt, Tex.grass(), ['#ffffff', '#d8f0c8']), base('grass'))
  const obstacles: Obstacle[] = [{ ...spring, r: spring.r - 0.2 }]
  const foodSpots: FoodSpot[] = []
  const put = placer(11, obstacles)

  // データの泉（光る水面）
  const springMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, uSnap: snapUniform },
    vertexShader: `${SNAP_GLSL} varying vec2 vUv; void main(){ vUv = uv; gl_Position = psxSnap(projectionMatrix * modelViewMatrix * vec4(position,1.0)); }`,
    fragmentShader: /* glsl */ `
      uniform float time; varying vec2 vUv;
      void main(){
        float d = distance(vUv, vec2(0.5));
        float ring = step(0.5, fract(d * 9.0 - time * 0.8));
        vec3 c = mix(vec3(0.12, 0.55, 0.85), vec3(0.45, 0.95, 1.0), ring * 0.6);
        c += step(0.47, d) * 0.4;
        gl_FragColor = vec4(c, 1.0);
      }`,
  })
  const water = new THREE.Mesh(new THREE.CircleGeometry(spring.r, 10).rotateX(-Math.PI / 2), springMat)
  water.position.set(spring.x, 0.27, spring.z)
  group.add(water)
  const stoneMat = lambert('#9aa1ab', { map: Tex.rock() })
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), stoneMat)
    s.position.set(spring.x + Math.cos(a) * (spring.r + 0.15), 0.3, spring.z + Math.sin(a) * (spring.r + 0.15))
    group.add(s)
  }

  // 木（実がなる）
  const bark = lambert('#6d4c41', { map: Tex.bark() })
  const leafA = lambert('#3f9e4a')
  const leafB = lambert('#5cc25a')
  for (let i = 0; i < 7; i++) {
    const p = put(0.6)
    if (!p) break
    const s = 0.9 + p.r() * 0.5
    const t = new THREE.Group()
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 1.1, 6), bark)
    trunk.position.y = 0.55
    const f1 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 0), leafA)
    f1.position.y = 1.55
    const f2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), leafB)
    f2.position.set(0.25, 2.05, 0.1)
    t.add(trunk, f1, f2)
    // 実（飾り）
    for (let k = 0; k < 3; k++) {
      const fr = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), lambert('#ff5a6e'))
      const a = k * 2.1 + p.r()
      fr.position.set(Math.cos(a) * 0.7, 1.4 + k * 0.15, Math.sin(a) * 0.7)
      t.add(fr)
    }
    t.scale.setScalar(s)
    t.position.set(p.x, heightAt(p.x, p.z) - 0.05, p.z)
    t.rotation.y = p.r() * Math.PI
    group.add(t)
    obstacles.push({ x: p.x, z: p.z, r: 0.35 * s })
    foodSpots.push({ x: p.x, z: p.z })
  }
  // きのこ・岩
  const capMat = psx(new THREE.MeshLambertMaterial({ map: Tex.mushroom() }))
  const stemMat = lambert('#f4ead6')
  for (let i = 0; i < 7; i++) {
    const p = put(0.25, 1.5)
    if (!p) break
    const m = new THREE.Group()
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.3, 5), stemMat)
    st.position.y = 0.15
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), capMat)
    cap.position.y = 0.28
    m.add(st, cap)
    m.scale.setScalar(0.8 + p.r() * 0.9)
    m.position.set(p.x, heightAt(p.x, p.z), p.z)
    group.add(m)
  }
  for (let i = 0; i < 5; i++) {
    const p = put(0.5)
    if (!p) break
    const s = 0.35 + p.r() * 0.35
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), stoneMat)
    rock.scale.set(s * 1.2, s * 0.8, s)
    rock.position.set(p.x, heightAt(p.x, p.z) + s * 0.3, p.z)
    rock.rotation.set(p.r(), p.r() * 3, p.r())
    group.add(rock)
    obstacles.push({ x: p.x, z: p.z, r: s })
  }
  // 看板
  const sign = new THREE.Group()
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), bark)
  post.position.y = 0.4
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.06), [bark, bark, bark, bark, psx(new THREE.MeshLambertMaterial({ map: Tex.sign('SEED') })), bark])
  board.position.y = 0.85
  sign.add(post, board)
  sign.position.set(-2.2, heightAt(-2.2, 2.4), 2.4)
  sign.rotation.y = 0.3
  group.add(sign)
  obstacles.push({ x: -2.2, z: 2.4, r: 0.3 })

  const sky = skyDome(['#3f7fe0', '#a8dcff', '#1b2a5a'], 0)
  const vs = voidSpace('#5ef2ff')
  const mt = motes('#c8fff4', 50)
  group.add(sky.mesh, vs.group, mt)

  return {
    id: 0, name: 'はじまりの森', sub: 'SEED GROVE', group, heightAt, obstacles, foodSpots,
    food: { name: 'ほしリンゴ', color: '#ff5a6e', leaf: '#5cc25a' },
    residents: ['mebu', 'mebu', 'pikori', 'noiz'],
    fog: '#bfe6ff', sky: ['#3f7fe0', '#a8dcff', '#1b2a5a'],
    sun: { color: '#fff1d6', intensity: 2.2, dir: [5, 9, 4] }, hemi: ['#d8efff', '#4a7a3a', 1.4],
    update(t, night) {
      springMat.uniforms.time.value = t
      sky.mat.uniforms.time.value = t
      sky.mat.uniforms.night.value = night
      ;(mt.material as THREE.ShaderMaterial).uniforms.time.value = t
      vs.update(t)
    },
    dispose: () => disposeTree(group),
  }
}

// =====================================================================
// 2. ガラスの砂丘（Glass Dunes）— むかしの建物の跡が残る
// =====================================================================
function glassDunes(): Stage {
  const heightAt = (x: number, z: number) =>
    0.26 + (Math.pow(Math.sin(x * 0.28 + z * 0.17), 2) * 1.1 + Math.sin(z * 0.6 + x * 0.2) * 0.2) * edge(x, z)
  const group = new THREE.Group()
  group.add(terrain(heightAt, Tex.sand(), ['#ffffff', '#ffe2c4']), base('sand'))
  const obstacles: Obstacle[] = []
  const foodSpots: FoodSpot[] = []
  const put = placer(23, obstacles)

  // けっしょう
  const crystalMats = [
    lambert('#5ef2ff', { emissive: '#1a6f88' }),
    lambert('#ff7ad9', { emissive: '#7a1f68' }),
  ]
  for (let i = 0; i < 8; i++) {
    const p = put(0.6)
    if (!p) break
    const c = new THREE.Group()
    const mat = crystalMats[i % 2]
    for (let k = 0; k < 3 + Math.floor(p.r() * 2); k++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), mat)
      m.scale.y = 2 + p.r() * 1.6
      m.position.set((p.r() - 0.5) * 0.7, 0.35, (p.r() - 0.5) * 0.7)
      m.rotation.set((p.r() - 0.5) * 0.7, p.r() * 3, (p.r() - 0.5) * 0.7)
      c.add(m)
    }
    c.position.set(p.x, heightAt(p.x, p.z), p.z)
    group.add(c)
    obstacles.push({ x: p.x, z: p.z, r: 0.5 })
    foodSpots.push({ x: p.x, z: p.z })
  }
  // 遺跡の柱とアーチ
  const ruin = psx(new THREE.MeshLambertMaterial({ map: Tex.ruin() }))
  const pillar = (x: number, z: number, h: number, tilt: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.55, h, 0.55), ruin)
    m.position.set(x, heightAt(x, z) + h / 2 - 0.2, z)
    m.rotation.z = tilt
    group.add(m)
    obstacles.push({ x, z, r: 0.45 })
  }
  pillar(-3.5, -3, 2.6, 0)
  pillar(-1.3, -3, 2.6, 0)
  const beam = new THREE.Mesh(new THREE.BoxGeometry(3, 0.45, 0.6), ruin)
  beam.position.set(-2.4, heightAt(-2.4, -3) + 2.5, -3)
  beam.rotation.z = 0.05
  group.add(beam)
  for (let i = 0; i < 4; i++) {
    const p = put(0.5)
    if (!p) break
    pillar(p.x, p.z, 0.8 + p.r() * 1.6, (p.r() - 0.5) * 0.5)
  }
  // 倒れた柱
  const fallen = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.5), ruin)
  fallen.position.set(3.2, heightAt(3.2, 3.5) + 0.15, 3.5)
  fallen.rotation.set(0, 0.6, 0.08)
  group.add(fallen)
  obstacles.push({ x: 3.2, z: 3.5, r: 0.8 })

  const sky = skyDome(['#5b3a8a', '#ff9b6a', '#2a1a3a'], 0)
  const vs = voidSpace('#ff7ad9')
  const mt = motes('#ffe6a8', 40)
  group.add(sky.mesh, vs.group, mt)

  return {
    id: 1, name: 'ガラスの砂丘', sub: 'GLASS DUNES', group, heightAt, obstacles, foodSpots,
    food: { name: 'けっしょう糖', color: '#5ef2ff', leaf: '#ff7ad9' },
    residents: ['gorota', 'gorota', 'giaru', 'noiz', 'noiz'],
    fog: '#f0a878', sky: ['#5b3a8a', '#ff9b6a', '#2a1a3a'],
    sun: { color: '#ffb27a', intensity: 2.4, dir: [-6, 5, 3] }, hemi: ['#ffd2b0', '#7a4a3a', 1.2],
    update(t, night) {
      sky.mat.uniforms.time.value = t
      sky.mat.uniforms.night.value = night
      ;(mt.material as THREE.ShaderMaterial).uniforms.time.value = t
      vs.update(t)
    },
    dispose: () => disposeTree(group),
  }
}

// =====================================================================
// 3. こおりの回路峰（Frost Circuit）
// =====================================================================
function frostCircuit(): Stage {
  const heightAt = (x: number, z: number) => {
    const hill = Math.max(0, 1.6 - Math.hypot(x + 3, z + 3) * 0.35)
    return 0.3 + (hill + Math.sin(x * 0.5) * Math.sin(z * 0.45) * 0.25) * edge(x, z)
  }
  const group = new THREE.Group()
  group.add(terrain(heightAt, Tex.snow(), ['#ffffff', '#dfe9ff']), base('snow'))
  const obstacles: Obstacle[] = []
  const foodSpots: FoodSpot[] = []
  const put = placer(37, obstacles)

  const pineD = lambert('#1f5a4a')
  const pineL = lambert('#2e7a5e')
  const snow = lambert('#f4f8ff')
  const trunk = lambert('#5d4037')
  for (let i = 0; i < 10; i++) {
    const p = put(0.5)
    if (!p) break
    const t = new THREE.Group()
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.5, 5), trunk)
    tr.position.y = 0.25
    t.add(tr)
    ;[[0.75, 0.5, pineD], [0.58, 1.05, pineL], [0.4, 1.55, pineD]].forEach(([r, y, m]) => {
      const c = new THREE.Mesh(new THREE.ConeGeometry(r as number, 0.8, 7), m as THREE.Material)
      c.position.y = y as number
      t.add(c)
    })
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.35, 7), snow)
    cap.position.y = 1.9
    t.add(cap)
    const s = 0.9 + p.r() * 0.6
    t.scale.setScalar(s)
    t.position.set(p.x, heightAt(p.x, p.z) - 0.05, p.z)
    group.add(t)
    obstacles.push({ x: p.x, z: p.z, r: 0.35 * s })
    if (i % 2 === 0) foodSpots.push({ x: p.x, z: p.z })
  }
  // こおりのトゲ
  const ice = lambert('#9be7ff', { emissive: '#1d5a78' })
  for (let i = 0; i < 7; i++) {
    const p = put(0.4)
    if (!p) break
    const g = new THREE.Group()
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.8 + p.r() * 0.9, 5), ice)
      m.position.set((p.r() - 0.5) * 0.4, 0.4, (p.r() - 0.5) * 0.4)
      m.rotation.set((p.r() - 0.5) * 0.5, 0, (p.r() - 0.5) * 0.5)
      g.add(m)
    }
    g.position.set(p.x, heightAt(p.x, p.z), p.z)
    group.add(g)
    obstacles.push({ x: p.x, z: p.z, r: 0.35 })
    foodSpots.push({ x: p.x, z: p.z })
  }
  // 雪に半分うまった古いアンテナ塔
  const metal = lambert('#7c8794')
  const tower = new THREE.Group()
  for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3, 0.08), metal)
    leg.position.set(x * 0.7, 1.5, z * 0.7)
    leg.rotation.set(z * 0.12, 0, -x * 0.12)
    tower.add(leg)
  }
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2.5), metal)
  dish.position.y = 3
  dish.rotation.x = 1.1
  const blink = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), new THREE.MeshBasicMaterial({ color: '#ff4d6d' }))
  blink.position.y = 3.2
  tower.add(dish, blink)
  tower.position.set(-3, heightAt(-3, -3) - 0.3, -3)
  tower.rotation.z = 0.08
  group.add(tower)
  obstacles.push({ x: -3, z: -3, r: 0.7 })

  const sky = skyDome(['#0d1a3a', '#3a5a9a', '#0a1028'], 1)
  const vs = voidSpace('#9be7ff')
  const flakes = motes('#ffffff', 140, true)
  group.add(sky.mesh, vs.group, flakes)

  return {
    id: 2, name: 'こおりの回路峰', sub: 'FROST CIRCUIT', group, heightAt, obstacles, foodSpots,
    food: { name: 'ゆきベリー', color: '#b48cff', leaf: '#2e7a5e' },
    residents: ['fuwari', 'fuwari', 'pikori', 'noiz'],
    fog: '#7a90c0', sky: ['#0d1a3a', '#3a5a9a', '#0a1028'],
    sun: { color: '#cfe0ff', intensity: 1.6, dir: [4, 8, -3] }, hemi: ['#a8c8ff', '#3a4a6a', 1.3],
    update(t, night) {
      sky.mat.uniforms.time.value = t
      sky.mat.uniforms.night.value = night * 0.6
      ;(flakes.material as THREE.ShaderMaterial).uniforms.time.value = t
      blink.visible = Math.floor(t * 1.5) % 2 === 0
      vs.update(t)
    },
    dispose: () => disposeTree(group),
  }
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh
    m.geometry?.dispose()
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []
    mats.forEach((x) => {
      ;(x as THREE.MeshBasicMaterial).map?.dispose()
      x.dispose()
    })
  })
}

export const STAGES = [seedGrove, glassDunes, frostCircuit]
