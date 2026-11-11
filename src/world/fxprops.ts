import * as THREE from 'three'
import { psx, SNAP_GLSL, snapUniform } from './psx'
import { fxU, FX_PARS, fxOf } from './fx'
import { rng } from './textures'

/**
 * 天気・風・水の「部品」。ステージからは 1〜2 行で呼べる（使い方は docs/TECHNIQUES.md の「天気と風と水」）。
 *   swayify(tree)            … 木・ヤシ・草の風のゆれ（頂点に重みを焼く）
 *   grass(heightAt, ...)     … 風にゆれる草むらと花（1 本の Mesh）
 *   floaters(group, ...)     … 水に浮く物（はす・流木）の上下
 *   waterSurface({...})      … さざ波・泡・きらめき・雨の波紋つきの水面
 *   WeatherFx                … 雨（線）・雪・火の粉・しぶき・もや（World が持つ）
 *   fxLod(group, high)       … 画質「低」で草の数をへらす
 */

// ---------- 風のゆれ ----------

/**
 * `obj` の頂点に「ゆれの重み」を焼く。重み = 高さに比例（根もとは 0、いちばん高い所が 1）。
 * 材質は psx() を通したものだけが対象で、同じ材質を家などが使っていても重みの無いメッシュはゆれない。
 * 呼ぶのは obj の中身を作り終わったあと（obj の位置・大きさを決める前でも後でもよい）。
 */
export function swayify(obj: THREE.Object3D, amount = 1, phase = Math.random() * 6.28) {
  obj.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert()
  const m = new THREE.Matrix4()
  const v = new THREE.Vector3()
  const meshes: THREE.Mesh[] = []
  obj.traverse((o) => {
    const me = o as THREE.Mesh
    if (me.isMesh && me.geometry.attributes.position && !me.geometry.attributes.aFx) meshes.push(me)
  })
  let top = 0.001
  for (const me of meshes) {
    m.multiplyMatrices(inv, me.matrixWorld)
    const pos = me.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) top = Math.max(top, v.fromBufferAttribute(pos, i).applyMatrix4(m).y)
  }
  for (const me of meshes) {
    m.multiplyMatrices(inv, me.matrixWorld)
    const pos = me.geometry.attributes.position
    const a = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const y = v.fromBufferAttribute(pos, i).applyMatrix4(m).y
      a[i * 3] = amount * Math.pow(THREE.MathUtils.clamp(y / top, 0, 1), 1.7)
      a[i * 3 + 1] = phase
    }
    me.geometry.setAttribute('aFx', new THREE.BufferAttribute(a, 3))
    const mats = Array.isArray(me.material) ? me.material : [me.material]
    for (const mt of mats) {
      const o = fxOf(mt)
      if (o) o.sway = true
    }
  }
  return obj
}

/** ゆれるメッシュ（草むらなど）用に、頂点属性 aFx を作る */
function fxAttr(n: number) {
  return new Float32Array(n * 3)
}

// ---------- 草むらと花 ----------

export interface GrassOpt {
  /** 草むらの数（面積に比例させたいときは呼ぶ側で掛ける） */
  count: number
  /** 根もと → 先の色 */
  colors: [string, string]
  /** 花の色（無ければ花なし）と、草むらのうち花になる割合 */
  flowers?: string[]
  flowerRate?: number
  /** 草の高さ（ふつう 0.2〜0.3） */
  height?: number
  seed?: number
  /** 雪が積もる材質にするか */
  snow?: boolean
}

/**
 * 風にゆれる草むらと花。1 本の Mesh（描画 1 回）。障害物・水場・中央のそばは避ける。
 * 画質「低」では fxLod() が先頭の一部だけを描く（順番はランダムなので、まばらになるだけ）。
 */
export function grass(
  heightAt: (x: number, z: number) => number,
  obstacles: { x: number; z: number; r: number; water?: boolean }[],
  size: number,
  o: GrassOpt,
) {
  const r = rng(o.seed ?? 303)
  const half = size / 2 - 1.2
  const H = o.height ?? 0.26
  const pos: number[] = []
  const col: number[] = []
  const fx: number[] = []
  const c0 = new THREE.Color(o.colors[0])
  const c1 = new THREE.Color(o.colors[1])
  const tri = (a: number[], b: number[], c: number[], ca: THREE.Color, cb: THREE.Color, cc: THREE.Color, wa: number, wb: number, wc: number, ph: number) => {
    // 表と裏の 2 まいを重ねる（DoubleSide だと裏面の法線が反転して黒くなるため）
    pos.push(...a, ...b, ...c, ...a, ...c, ...b)
    col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b, ca.r, ca.g, ca.b, cc.r, cc.g, cc.b, cb.r, cb.g, cb.b)
    fx.push(wa, ph, 0, wb, ph, 0, wc, ph, 0, wa, ph, 0, wc, ph, 0, wb, ph, 0)
  }
  let made = 0
  for (let tries = 0; made < o.count && tries < o.count * 6; tries++) {
    const x = (r() * 2 - 1) * half
    const z = (r() * 2 - 1) * half
    if (Math.hypot(x, z) < 1.2) continue
    if (obstacles.some((ob) => Math.hypot(ob.x - x, ob.z - z) < ob.r + (ob.water ? 0.9 : 0.25))) continue
    const y = heightAt(x, z)
    if (y < 0.27) continue
    made++
    const ph = r() * 6.28
    const flower = o.flowers && r() < (o.flowerRate ?? 0.18)
    if (flower) {
      // くき + ひし形の花
      const h = H * (1.0 + r() * 0.5)
      const fc = new THREE.Color(o.flowers![Math.floor(r() * o.flowers!.length)])
      const w = 0.025
      const lean = (r() - 0.5) * 0.08
      tri([x - w, y, z], [x + w, y, z], [x + lean, y + h, z], c0, c0, c1, 0, 0, 1, ph)
      tri([x, y, z - w], [x, y, z + w], [x + lean, y + h, z], c0, c0, c1, 0, 0, 1, ph)
      const R = 0.07 + r() * 0.03
      const cx = x + lean
      const cy = y + h
      const dim = fc.clone().multiplyScalar(0.7)
      const top: number[] = [cx, cy + R * 0.9, z]
      const ring = [[cx - R, cy, z], [cx, cy, z + R], [cx + R, cy, z], [cx, cy, z - R]]
      for (let k = 0; k < 4; k++) {
        tri(top, ring[k], ring[(k + 1) % 4], fc, dim, dim, 1, 1, 1, ph)
        tri([cx, cy - R * 0.5, z], ring[(k + 1) % 4], ring[k], dim, dim, dim, 1, 1, 1, ph)
      }
    } else {
      const blades = 3 + Math.floor(r() * 3)
      for (let b = 0; b < blades; b++) {
        const a = r() * 6.28
        const dx = Math.cos(a)
        const dz = Math.sin(a)
        const off = r() * 0.1
        const bx = x + dx * off
        const bz = z + dz * off
        const h = H * (0.6 + r() * 0.7)
        const w = 0.045 + r() * 0.02
        const lean = 0.05 + r() * 0.09
        const tx = -dz
        const tz = dx
        tri([bx - tx * w, y - 0.02, bz - tz * w], [bx + tx * w, y - 0.02, bz + tz * w], [bx + dx * lean, y + h, bz + dz * lean], c0, c0, c1, 0, 0, 1, ph + b * 0.3)
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.setAttribute('aFx', new THREE.Float32BufferAttribute(fx, 3))
  const nrm = fxAttr(pos.length / 3)
  for (let i = 0; i < nrm.length; i += 3) nrm[i + 1] = 1
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  const mat = psx(new THREE.MeshLambertMaterial({ vertexColors: true }), { sway: true, snow: o.snow ?? true })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.userData.fxLod = pos.length / 3
  return mesh
}

/** 画質で草の数を切りかえる（高 = ぜんぶ / 低 = 約 45%）。ステージを作ったあと・画質を変えたときに呼ぶ */
export function fxLod(group: THREE.Object3D, high: boolean) {
  group.traverse((o) => {
    const full = o.userData.fxLod as number | undefined
    if (full) (o as THREE.Mesh).geometry.setDrawRange(0, high ? full : Math.floor((full * 0.45) / 6) * 6)
  })
}

// ---------- 水に浮く物 ----------

/**
 * 水に浮く物（はすの葉 + 花 / 流木）を `pool`（円）の中に n 個。上下にゆれ、まわりに白い泡の輪がある。
 * `y` は水面の高さ。上下は頂点シェーダー（aFx.z）で、ステージの update は要らない。
 */
export function floaters(group: THREE.Group, pool: { x: number; z: number; r: number }, y: number, kind: 'pad' | 'log', n: number, seed = 5) {
  const r = rng(seed)
  const padMat = psx(new THREE.MeshLambertMaterial({ color: '#3fae5a', flatShading: true }), { snow: true })
  const flowerMat = psx(new THREE.MeshLambertMaterial({ color: '#ff9ecb', flatShading: true }))
  const logMat = psx(new THREE.MeshLambertMaterial({ color: '#8a5a33', flatShading: true }))
  const foamMat = new THREE.MeshBasicMaterial({ color: '#f4ffff', transparent: true, opacity: 0.7, depthWrite: false, fog: true })
  psx(foamMat)
  const bobAttr = (g: THREE.BufferGeometry, ph: number, amp: number) => {
    const a = new Float32Array(g.attributes.position.count * 3)
    for (let i = 0; i < a.length; i += 3) {
      a[i + 1] = ph
      a[i + 2] = amp
    }
    g.setAttribute('aFx', new THREE.BufferAttribute(a, 3))
  }
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28
    const d = pool.r * (0.25 + r() * 0.55)
    const x = pool.x + Math.cos(a) * d
    const z = pool.z + Math.sin(a) * d
    const ph = r() * 6.28
    const amp = 0.018
    const parts: THREE.Mesh[] = []
    if (kind === 'pad') {
      const s = 0.8 + r() * 0.5
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * s, 0.24 * s, 0.03, 9, 1), padMat)
      pad.position.y = 0.02
      parts.push(pad)
      if (r() < 0.45) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 5), flowerMat)
        f.position.set((r() - 0.5) * 0.1, 0.1, (r() - 0.5) * 0.1)
        parts.push(f)
      }
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.25 * s, 0.33 * s, 9).rotateX(-Math.PI / 2), foamMat)
      ring.position.y = 0.012
      parts.push(ring)
    } else {
      const len = 0.7 + r() * 0.5
      const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, len, 6).rotateZ(Math.PI / 2), logMat)
      lg.position.y = 0.04
      lg.rotation.y = r() * 3
      parts.push(lg)
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, 8).rotateX(-Math.PI / 2).scale(len * 1.3, 1, 1), foamMat)
      ring.position.y = 0.012
      ring.rotation.y = lg.rotation.y
      parts.push(ring)
    }
    const g = new THREE.Group()
    for (const p of parts) {
      bobAttr(p.geometry, ph, amp)
      g.add(p)
      const o = fxOf(p.material as THREE.Material)
      if (o) o.sway = true
    }
    g.position.set(x, y, z)
    group.add(g)
  }
}

// ---------- 水面 ----------

export interface WaterOpt {
  deep: string
  shallow: string
  /** 同心円のゆらぎ（光る泉用） */
  rings?: boolean
}

/**
 * 水面（CircleGeometry 用。uv の中心が円の中心）。
 * さざ波（2 層・マス目に量子化してスクロール）+ ふちの泡 + 太陽/月のきらめき（高画質）+ 雨の波紋（高画質）。
 * 夜は暗くなる。時刻などは fxU を共有するので、ステージの update で `uniforms.time` を更新しなくてもよい。
 */
export function waterSurface(o: WaterOpt) {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: fxU.uTime, deep: { value: new THREE.Color(o.deep) }, shallow: { value: new THREE.Color(o.shallow) }, uSnap: snapUniform,
      uTime: fxU.uTime, uHigh: fxU.uHigh, uWind: fxU.uWind, uWindDir: fxU.uWindDir, uDrift: fxU.uDrift, uWet: fxU.uWet, uRain: fxU.uRain,
      uSnow: fxU.uSnow, uCloud: fxU.uCloud, uGlint: fxU.uGlint, uNight: fxU.uNight,
    },
    defines: o.rings ? { RINGS: '' } : {},
    vertexShader: `${SNAP_GLSL} varying vec2 vUv; varying vec3 vW;
      void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
        gl_Position = psxSnap(projectionMatrix * viewMatrix * wp); }`,
    fragmentShader: /* glsl */ `
      ${FX_PARS}
      uniform vec3 deep; uniform vec3 shallow; varying vec2 vUv; varying vec3 vW;
      void main(){
        vec2 wp = vW.xz;
        float d = distance(vUv, vec2(0.5)) * 2.0;
        float flow = uTime * (0.7 + uWind * 0.8);
        // さざ波：2 層をマス目に量子化してスクロール（風で速くなる）
        vec2 q = floor(wp * 6.0) / 6.0;
        float w1 = sin(q.x * 3.1 + flow * 1.3 + sin(q.y * 2.3 + flow * 0.8) * 1.6);
        float w2 = sin(q.y * 3.7 - flow * 1.0 + sin(q.x * 2.9 - flow * 0.7) * 1.4);
        float w = w1 * w2;
        vec3 c = mix(deep, shallow, smoothstep(0.15, 0.95, d));
        c *= 1.0 - 0.16 * step(0.35, w);
        c += step(0.72, w) * 0.1;
        #ifdef RINGS
          float ring = step(0.5, fract(d * 9.0 - uTime * 0.8));
          c = mix(c, c + vec3(0.3, 0.4, 0.15), ring * 0.45);
        #endif
        // ふちの泡（波にあわせてゆれる）と、そのすぐ内側のあわつぶ
        float edge = d + sin(atan(vUv.y - 0.5, vUv.x - 0.5) * 9.0 + uTime * 2.0) * 0.03 + sin(wp.x * 5.0 + uTime * 1.8) * 0.012;
        float spray = step(0.62, fxHash(floor(wp * 11.0) + floor(uTime * 1.5))) * step(0.82, edge) * step(edge, 0.9);
        c = mix(c, vec3(0.95, 1.0, 1.0), max(step(0.9, edge), spray * 0.8));
        // きらめき（太陽・月が波の頂に映る）。雨の波紋
        if (uHigh > 0.5) {
          vec2 gc = floor(wp * 9.0);
          float gh = fxHash(gc + floor(uTime * 2.0 + fxHash(gc.yx) * 3.0));
          c += step(0.985, gh) * step(0.15, w) * uGlint * mix(vec3(1.0, 0.98, 0.82), vec3(0.75, 0.85, 1.0), uNight);
          float rg = fxRings(wp, 0.9) + fxRings(wp + 3.0, 0.65) * 0.8;
          c += vec3(0.5, 0.6, 0.7) * rg * uRain * 0.55;
        }
        c *= 1.0 - uNight * 0.5;
        gl_FragColor = vec4(c, 1.0);
      }`,
  })
}

// ---------- 雨・雪・火の粉・しぶき・もや ----------

const BOX = 9
const WHITE = new THREE.Color('#ffffff')
const N_DROP = 1300
const N_FLAKE = 1100
const N_SPARK = 700

/**
 * 天気の粒子と、地面のもや。World が 1 つ持ち、毎フレーム `update()` する。
 * 各粒子は強さ（0〜1）に応じて **数が増える・減る**（seed < 強さ のものだけ描く）ので、
 * 天気が変わる時はなめらかに入れかわる。
 */
export class WeatherFx {
  readonly group = new THREE.Group()
  private rain: THREE.LineSegments
  private snow: THREE.Points
  private spark: THREE.Points
  private splash: THREE.Points
  private mist: THREE.Mesh
  private mistMat: THREE.ShaderMaterial
  private high = true
  private k = { rain: { value: 0 }, snow: { value: 0 }, ember: { value: 0 }, splash: { value: 0 }, mist: { value: 0 }, mistColor: { value: new THREE.Color('#ffffff') } }
  private splashN = 0

  constructor() {
    const r = Math.random
    const shared = { uTime: fxU.uTime, uWind: fxU.uWind, uWindDir: fxU.uWindDir, uSnap: snapUniform }

    // 雨：長めの線（頭が明るく、しっぽが消える）。風で斜めになる
    const rp = new Float32Array(N_DROP * 6)
    const rs = new Float32Array(N_DROP * 2)
    const re = new Float32Array(N_DROP * 2)
    for (let i = 0; i < N_DROP; i++) {
      const x = (r() - 0.5) * 26
      const y = r() * BOX
      const z = (r() - 0.5) * 26
      const s = r()
      for (let e = 0; e < 2; e++) {
        rp.set([x, y, z], (i * 2 + e) * 3)
        rs[i * 2 + e] = s
        re[i * 2 + e] = e
      }
    }
    const rg = new THREE.BufferGeometry()
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3))
    rg.setAttribute('seed', new THREE.BufferAttribute(rs, 1))
    rg.setAttribute('aEnd', new THREE.BufferAttribute(re, 1))
    this.rain = new THREE.LineSegments(
      rg,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { ...shared, uI: this.k.rain },
        vertexShader: /* glsl */ `
          ${SNAP_GLSL}
          uniform float uTime; uniform float uWind; uniform vec2 uWindDir; uniform float uI;
          attribute float seed; attribute float aEnd; varying float vA;
          void main() {
            vec3 p = position;
            float speed = 13.0 + seed * 4.0;
            p.y = mod(p.y - uTime * speed - seed * ${BOX}.0, ${BOX}.0);
            vec2 slant = uWindDir * (0.1 + uWind * 0.22);
            p.xz += slant * p.y;
            float len = 0.6 + seed * 0.45;
            p += vec3(slant.x, 1.0, slant.y) * len * aEnd;
            vA = (1.0 - aEnd * 0.85) * step(seed, uI);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = vA > 0.0 ? psxSnap(projectionMatrix * mv) : vec4(2.0, 2.0, 2.0, 1.0);
          }`,
        fragmentShader: /* glsl */ `varying float vA; void main() { gl_FragColor = vec4(0.78, 0.88, 1.0, vA * 0.8); }`,
      }),
    )

    // 雪：大きさがばらばら（小・中・大）。風でゆっくり流れる
    const sp = new Float32Array(N_FLAKE * 3)
    const ss = new Float32Array(N_FLAKE)
    for (let i = 0; i < N_FLAKE; i++) {
      sp.set([(r() - 0.5) * 26, r() * BOX, (r() - 0.5) * 26], i * 3)
      ss[i] = r()
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3))
    sg.setAttribute('seed', new THREE.BufferAttribute(ss, 1))
    this.snow = new THREE.Points(
      sg,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { ...shared, uI: this.k.snow },
        vertexShader: /* glsl */ `
          ${SNAP_GLSL}
          uniform float uTime; uniform float uWind; uniform vec2 uWindDir; uniform float uI;
          attribute float seed; varying float vA; varying float vBig;
          void main() {
            vec3 p = position;
            float big = floor(fract(seed * 91.7) * 3.0);
            float fall = 0.7 + (2.0 - big) * 0.25 + fract(seed * 13.1) * 0.3;
            p.y = mod(p.y - uTime * fall - seed * ${BOX}.0, ${BOX}.0);
            p.xz += uWindDir * (p.y * (0.1 + uWind * 0.55) + sin(uTime * 0.5) * uWind);
            p.x += sin(uTime * 0.8 + seed * 40.0) * 0.45;
            p.z += cos(uTime * 0.6 + seed * 30.0) * 0.35;
            vA = step(seed, uI) * smoothstep(0.0, 0.8, p.y);
            vBig = big;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = vA > 0.0 ? psxSnap(projectionMatrix * mv) : vec4(2.0, 2.0, 2.0, 1.0);
            gl_PointSize = 2.5 + big * 1.8;
          }`,
        fragmentShader: /* glsl */ `
          varying float vA; varying float vBig;
          void main() {
            vec2 q = gl_PointCoord - 0.5;
            if (vBig > 0.5 && length(q) > 0.5) discard;
            gl_FragColor = vec4(1.0, 1.0, 1.0, 0.95 * vA);
          }`,
      }),
    )

    // 火の粉：上へ舞い、のぼるほど赤く暗く消える。風でなびく
    const fp = new Float32Array(N_SPARK * 3)
    const fs = new Float32Array(N_SPARK)
    for (let i = 0; i < N_SPARK; i++) {
      fp.set([(r() - 0.5) * 26, r() * BOX, (r() - 0.5) * 26], i * 3)
      fs[i] = r()
    }
    const fg = new THREE.BufferGeometry()
    fg.setAttribute('position', new THREE.BufferAttribute(fp, 3))
    fg.setAttribute('seed', new THREE.BufferAttribute(fs, 1))
    this.spark = new THREE.Points(
      fg,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { ...shared, uI: this.k.ember },
        vertexShader: /* glsl */ `
          ${SNAP_GLSL}
          uniform float uTime; uniform float uWind; uniform vec2 uWindDir; uniform float uI;
          attribute float seed; varying float vA; varying float vH; varying float vF;
          void main() {
            vec3 p = position;
            float rise = 0.9 + fract(seed * 17.3) * 1.5;
            float h = mod(p.y + uTime * rise + seed * ${BOX}.0, ${BOX}.0);
            p.y = h;
            p.xz += uWindDir * h * (0.15 + uWind * 0.5);
            p.x += sin(uTime * 1.4 + seed * 50.0 + h * 0.8) * (0.3 + h * 0.08);
            p.z += cos(uTime * 1.1 + seed * 31.0 + h * 0.6) * 0.3;
            vH = h / ${BOX}.0;
            vF = 0.6 + 0.4 * sin(uTime * 9.0 + seed * 60.0);
            vA = step(seed, uI) * (1.0 - smoothstep(0.55, 1.0, vH)) * smoothstep(0.0, 0.5, h);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = vA > 0.0 ? psxSnap(projectionMatrix * mv) : vec4(2.0, 2.0, 2.0, 1.0);
            gl_PointSize = 3.0 + fract(seed * 7.7) * 4.0 * (1.0 - vH * 0.4);
          }`,
        fragmentShader: /* glsl */ `
          varying float vA; varying float vH; varying float vF;
          void main() {
            vec2 q = gl_PointCoord - 0.5;
            if (length(q) > 0.5) discard;
            vec3 hot = vec3(1.0, 0.82, 0.3); vec3 cool = vec3(0.9, 0.2, 0.06);
            gl_FragColor = vec4(mix(hot, cool, smoothstep(0.0, 0.7, vH)) * (0.7 + 0.5 * vF), vA * (0.55 + 0.45 * vF));
          }`,
      }),
    )

    // しぶき：地面に当たった雨が小さく跳ねる（地面の高さは setGround で入れる）
    this.splash = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { ...shared, uI: this.k.splash },
        vertexShader: /* glsl */ `
          ${SNAP_GLSL}
          uniform float uTime; uniform float uI; attribute float seed; varying float vP;
          void main() {
            float ph = fract(uTime * (1.3 + seed * 1.2) + seed * 9.0);
            float p = ph / 0.25;
            vP = p;
            bool live = ph < 0.25 && fract(seed * 53.7) < uI;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = live ? psxSnap(projectionMatrix * mv) : vec4(2.0, 2.0, 2.0, 1.0);
            gl_PointSize = live ? 10.0 : 0.0;
          }`,
        fragmentShader: /* glsl */ `
          varying float vP;
          void main() {
            vec2 q = (gl_PointCoord - 0.5) * 10.0;       // 1 = 1 ドット（中心 = 当たった場所）
            float fade = 1.0 - vP;
            float hit = 0.0;
            // しぶき 4 つ：左右へ弧をえがいて跳ねる
            for (int i = 0; i < 4; i++) {
              float s = float(i) - 1.5;
              float h = 4.0 * vP * (1.0 - vP) * 2.6 * (1.0 - 0.2 * abs(s));
              hit += step(length(q - vec2(s * vP * 2.2, -h)), 0.75);
            }
            if (hit < 0.5) discard;
            gl_FragColor = vec4(0.85, 0.94, 1.0, 0.9 * fade);
          }`,
      }),
    )

    // 地面近くのもや：低い所に 1 まいの面。ゆっくり流れる
    this.mistMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: fxU.uTime, uDrift: fxU.uDrift, uSnap: snapUniform, uI: this.k.mist, uColor: this.k.mistColor },
      vertexShader: `${SNAP_GLSL} varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = psxSnap(projectionMatrix * viewMatrix * w); }`,
      fragmentShader: /* glsl */ `
        ${FX_PARS}
        uniform float uI; uniform vec3 uColor; varying vec3 vW;
        void main() {
          vec2 p = vW.xz * 0.16 - uDrift * 0.25;
          float n = fxNoise(p) * 0.6 + fxNoise(p * 2.3 + 4.0) * 0.4;
          float a = smoothstep(0.32, 0.72, n);
          a = floor(a * 4.0 + 0.5) / 4.0;
          gl_FragColor = vec4(uColor, a * uI * 0.36);
        }`,
    })
    this.mist = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.mistMat)
    this.mist.renderOrder = 5
    this.mist.frustumCulled = false

    for (const o of [this.rain, this.snow, this.spark, this.splash]) {
      o.frustumCulled = false
      o.visible = false
      this.group.add(o)
    }
    this.group.add(this.mist)
    this.mist.visible = false
  }

  /** 地面の高さを調べて、しぶきの場所をばらまく（ステージを作ったあとに呼ぶ）。water = 水場の円 */
  setGround(heightAt: (x: number, z: number) => number, size: number, water: { x: number; z: number; r: number }[]) {
    const n = Math.round(260 * (size / 20) ** 2)
    const pos = new Float32Array(n * 3)
    const seed = new Float32Array(n)
    const half = size / 2 - 1
    for (let i = 0; i < n; i++) {
      const x = (Math.random() * 2 - 1) * half
      const z = (Math.random() * 2 - 1) * half
      const wet = water.find((w) => Math.hypot(w.x - x, w.z - z) < w.r + 0.4)
      pos.set([x, (wet ? 0.36 : Math.max(0.27, heightAt(x, z))) + 0.04, z], i * 3)
      seed[i] = Math.random()
    }
    this.splash.geometry.dispose()
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1))
    this.splash.geometry = g
    this.splashN = n
    this.mist.scale.set(size + 10, 1, size + 10)
    this.applyQuality()
  }

  setQuality(high: boolean) {
    this.high = high
    this.applyQuality()
  }

  private applyQuality() {
    const f = this.high ? 1 : 0.5
    this.rain.geometry.setDrawRange(0, Math.floor(N_DROP * f) * 2)
    this.snow.geometry.setDrawRange(0, Math.floor(N_FLAKE * (this.high ? 1 : 0.6)))
    this.spark.geometry.setDrawRange(0, Math.floor(N_SPARK * (this.high ? 1 : 0.6)))
    this.splash.geometry.setDrawRange(0, Math.floor(this.splashN * (this.high ? 1 : 0.4)))
  }

  /**
   * center = 見ている場所、ground = そこの地面の高さ。
   * rain / snow / ember / mist は 0〜1 の強さ。fogColor = もやの色。
   */
  update(center: THREE.Vector3, ground: number, s: { rain: number; snow: number; ember: number; mist: number }, fogColor: THREE.Color) {
    this.k.rain.value = s.rain
    this.k.snow.value = s.snow
    this.k.ember.value = s.ember
    this.k.splash.value = s.rain
    this.k.mist.value = s.mist
    this.k.mistColor.value.copy(fogColor).lerp(WHITE, 0.35)
    this.rain.visible = s.rain > 0.01
    this.snow.visible = s.snow > 0.01
    this.spark.visible = s.ember > 0.01
    this.splash.visible = s.rain > 0.05 && this.splashN > 0
    // 雨・雪・火の粉の箱は見ている場所についていく
    for (const o of [this.rain, this.snow, this.spark]) o.position.set(center.x, ground - 1, center.z)
    // もや（高画質のみ）
    this.mist.visible = this.high && s.mist > 0.03
    if (this.mist.visible) this.mist.position.set(0, 0.55, 0)
  }
}
