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
  /** 同心円のゆらぎ（光る泉用・いまは 使わない） */
  rings?: boolean
  /** 海（青い 色の 組・岸に あしや はすを 置かない）。deep が 海の 色なら 自動 */
  sea?: boolean
}

/**
 * 水の 色の 組（記事の 10 色：0〜6 = 暗い → 明るい 水・7 = 浅い 所・8 / 9 = 水に 映る 岸の 土 / 草）。
 * 色を まぜずに この 中から えらぶ（ドット絵の 水が にごらない）
 */
const RAMP_POND = ['#1d3a44', '#24505a', '#2e6468', '#3f8484', '#5d9fa6', '#6fb3a8', '#c4ece2', '#5a9384', '#2c3b36', '#2d5246']
const RAMP_SEA = ['#173452', '#1d4a70', '#245f88', '#3279a0', '#4f98ba', '#6cb4c4', '#d0eef0', '#5a9ca0', '#2c3a44', '#2d5246']

/**
 * 水面（2026-11-16 に 作りなおし：SpriteCook の 記事「pixel art pond with reflections and ripples」の 6 つの 層）。
 * 岸からの 距離と 木の 高さは pond.ts の `bakePond()` が 焼いた テクスチャ（`fxPond()`）から 読む。
 * 1 深さ：岸から はなれるほど 暗い（岸の すぐそばは 明るい ふち）
 * 2 空の 光：奥の 岸から 手前へ 行くほど 明るい（見下ろすと 手前は 空が 映る）
 * 3 木の 映りこみ：カメラと 反対へ たどって 木の 葉に あたれば 暗い 3 段。行ごとに 1 ドット ゆれる
 * 4 岸：奥の 岸の 下に 暗い 線と 岸の 草の 映り・手前の 岸は 浅い 色と 打ちよせる 点線
 * 5 きらめき（横に のびて ちぢむ 線）・水てきの 輪（5 コマ）・雨の 波紋
 * どの 層も 1 ドットの 格子（世界に はりついた 画面の ドット）で 決めて、色は 組から えらぶだけ。ループは 5 秒
 */
export function waterSurface(o: WaterOpt) {
  const sea = o.sea ?? /^#14|^#1d7f/.test(o.deep)
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSnap: snapUniform, ramp: { value: (sea ? RAMP_SEA : RAMP_POND).map((c) => new THREE.Color(c)) },
      uTime: fxU.uTime, uHigh: fxU.uHigh, uWind: fxU.uWind, uWindDir: fxU.uWindDir, uDrift: fxU.uDrift, uWet: fxU.uWet, uRain: fxU.uRain,
      uSnow: fxU.uSnow, uCloud: fxU.uCloud, uGlint: fxU.uGlint, uNight: fxU.uNight, uPond: fxU.uPond, uPondBox: fxU.uPondBox,
    },
    vertexShader: `${SNAP_GLSL} varying vec3 vW; varying float vPx;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
        vPx = projectionMatrix[3][3] > 0.5 ? 2.0 / (projectionMatrix[1][1] * 320.0) : 0.06;
        gl_Position = psxSnap(projectionMatrix * viewMatrix * wp); }`,
    fragmentShader: /* glsl */ `
      ${FX_PARS}
      uniform vec3 ramp[10]; varying vec3 vW; varying float vPx;
      #define LOOP 5.0
      #define TAU 6.2831853
      float ph(float cycles) { return TAU * cycles * uTime / LOOP; }
      vec3 rampC(float t) { vec3 c = ramp[0]; for (int i = 1; i < 10; i++) if (float(i) == t) c = ramp[i]; return c; }
      void main(){
        vec2 P = vW.xz;
        // カメラ：画面の 右・上・カメラへ 向く 向き。1 ドットの 大きさ（平行投影なら 投影から）
        vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 camF = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
        float px = vPx;
        vec2 away = -normalize(camF.xz + vec2(1e-5));
        float sinE = clamp(camF.y, 0.2, 1.0);
        float tanE = camF.y / max(length(camF.xz), 0.05);
        // 世界に はりついた 画面の ドット（カメラは 1 ドットの 格子に 吸わせてある）
        float sx = floor(dot(vW, camR) / px);
        float sy = floor(dot(vW, camU) / px);
        // 岸の 形は 地面の 三角では なく 焼いた 距離で 決める（ドットの ぎざぎざな 岸に なる）
        vec4 T = fxPond(P);
        // 岸に ゆらぎ（まっすぐな 岸を くずす。はなれた 所は かわらない）
        float sd = fxPondSd(T) - 0.32 * fxNoise(P * 0.85 + 2.0) - 0.12 * fxNoise(P * 2.3);
        if (sd < 0.03) discard;
        float tl = mod(uTime, LOOP);
        float loopN = floor(uTime / LOOP);

        // 3 映りこみ ＋ 奥の 岸までの 距離：カメラと 反対へ たどる（行ごとに 1 ドット ゆらす）
        float wob = floor(sin(sy * 0.75 - ph(2.0)) + 0.5);
        vec2 Pw = P + normalize(camR.xz) * wob * px;
        float far = 99.0;
        float refl = 9.0;
        for (int i = 1; i <= 30; i++) {
          if (uHigh < 0.5 && i > 12) break;
          float t = float(i) * 0.28;
          vec4 q = fxPond(Pw + away * t);
          if (far > 90.0 && fxPondSd(q) <= 0.0) far = t;
          if (q.g > 0.0 && uHigh > 0.5) {
            float top = q.g * 12.0;
            float bot = q.b * 12.0;
            float y = vW.y + t * tanE / 0.55;
            if (y >= bot && y <= top) {
              // 葉の むら（世界の 位置で きまる・かたまりの 大きさ）を 足して 3 段に
              vec2 Q = Pw + away * t;
              float f = (y - bot) / max(top - bot, 0.01) + (fxNoise(Q * 2.6) - 0.5) * 0.7;
              refl = min(refl, f < 0.12 ? 0.0 : f < 0.6 ? 1.0 : 2.0);
            }
          }
        }
        float rows = far * sinE / px;

        // 1 深さ と 2 空の 光
        float tone = sd > 0.6 ? 1.0 : 2.0;
        if (sd < 0.22) tone = 3.0;
        else {
          if (far >= 1.1) tone = 3.0;
          if (far >= 2.2 && far < 90.0) tone = 4.0;
          if (far >= 90.0 && sd > 5.0) tone = 2.0;
        }
        tone = min(tone, refl);
        // 4 奥の 岸：水ぎわの 暗い 線と、岸の 草の 映り（ときどき 草が 水へ はみ出す・うすい さざ波）
        if (far < 90.0 && rows < 4.0) {
          float creep = sin(sx * 0.35 - ph(1.0)) + 0.5 * sin(sx * 0.13 + 1.0 - ph(1.0));
          tone = rows < 1.0 || (rows < 2.0 && creep > 0.6) ? 0.0 : 9.0;
          float w = sin(sx * 0.6 - ph(1.0) + floor(rows) * 1.7) + 0.6 * sin(sx * 0.23 + floor(rows) - ph(1.0));
          if (rows >= 2.0 && w > 0.95) tone = 1.0;
        }
        // 手前の 岸：浅い 色と、打ちよせる 点線（ふち ぜんぶを 光らせると 輪郭に 見える）
        float spx = sd / px;
        if (rows > 8.0 && tone >= 3.0) {
          if (sd < 0.18) tone = 7.0;
          float along = sx * 0.9 + sy * 0.4;
          bool dash = sin(along * 0.55 - ph(2.0)) + 0.6 * sin(along * 0.23 + 1.3 - ph(1.0)) > 0.55;
          float ring = sin(ph(2.0)) > 0.35 ? 3.0 : 2.0;
          if (dash && abs(spx - ring) < 0.5) tone = 5.0;
        }
        // 5 きらめき：空の 映る 所に 横の 線が のびて ちぢむ（0.6 秒）。ループごとに 場所を かえる
        if (uHigh > 0.5 && tone >= 3.0 && tone != 7.0 && rows > 10.0) {
          vec2 cell = floor(vec2(sx / 9.0, sy / 7.0));
          float h = fxHash(cell + loopN * 17.13);
          if (h < 0.16 * uGlint) {
            float age = (tl - fxHash(cell * 1.7 + loopN) * (LOOP - 0.6)) / 0.6;
            float cx = cell.x * 9.0 + 2.0 + floor(fxHash(cell + 3.1) * 5.0);
            float cy = cell.y * 7.0 + 3.0;
            float dx = abs(sx - cx);
            if (age >= 0.0 && age < 1.0 && sy == cy) {
              bool on = age < 0.15 ? dx < 0.5 : age < 0.3 ? dx < 1.5 : age < 0.65 ? dx < 2.5 : age < 0.85 ? (dx < 2.5 && dx > 0.5) : (dx > 1.5 && dx < 2.5);
              if (on) tone = dx < 1.5 ? 6.0 : 5.0;
            }
          }
          // 水てきの 輪：5 コマ × 0.2 秒
          vec2 rc = floor(vec2(sx / 40.0, sy / 30.0));
          float rh = fxHash(rc + loopN * 3.7 + 0.5);
          if (rh < 0.45) {
            float f = floor((tl - fxHash(rc * 2.3 + loopN) * (LOOP - 1.0)) / 0.2);
            if (f >= 0.0 && f < 5.0) {
              vec2 c0 = rc * vec2(40.0, 30.0) + vec2(8.0, 6.0) + floor(vec2(fxHash(rc + 9.1), fxHash(rc + 4.7)) * vec2(24.0, 18.0));
              float rx = f < 0.5 ? 1.0 : f < 1.5 ? 2.0 : f < 2.5 ? 4.0 : f < 3.5 ? 6.0 : 8.0;
              float ry = f;
              vec2 d = vec2(sx, sy) - c0;
              float e = ry < 0.5 ? (abs(d.y) < 0.5 ? abs(abs(d.x) - rx) : 9.0) : abs(length(d / vec2(rx, ry)) - 1.0) * ry;
              bool keep = f < 2.5 || abs(d.y) >= ry * 0.5;
              if (e < 0.5 && keep && sd > 0.15) tone = f < 2.5 ? 6.0 : 5.0;
            }
          }
          // 雨の 波紋
          float rg = fxRings(P, 0.9) + fxRings(P + 3.0, 0.65) * 0.8;
          if (rg * uRain > 0.35) tone = 5.0;
        }
        vec3 c = rampC(tone);
        c *= 1.0 - uNight * 0.5;
        gl_FragColor = vec4(c, 1.0);
      }`,
  })
  mat.userData.water = true
  mat.userData.sea = sea
  return mat
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
