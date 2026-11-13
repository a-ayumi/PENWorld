import * as THREE from 'three'
import { SCENE, toonU } from './psx'

/**
 * 「ピクセル・ジオラマ」の見た目（計画 A）。すべての視点で使う（みおろしは平行投影の cam、うしろ・めせんは渡された遠近カメラ）。
 *
 * 描き方：
 * 1. 斜め 30°・45° の平行投影カメラで、箱庭を浮島として見る。カメラは 1 ピクセルの格子に合わせて動かす（止まった絵がちらつかない）
 * 2. 材質は psx() のトゥーン（光を 3 段に。toonU）＋ 太陽と月の影（影の型）
 * 3. 仕上げ（下の DIORAMA_POST）：奥行きの差で輪郭とふちの光 → 空のグラデーション → 遠くのかすみ →
 *    色の調整（陰は紫、光は黄色へ）→ 色数をしぼって 4×4 ディザ → HUD を重ねる
 */
const AZIMUTH = Math.PI / 4
const ELEVATION = THREE.MathUtils.degToRad(30)
const DIST = 60
/** 太陽の高さ（低いほど影が長い） */
const SUN_ELEV = THREE.MathUtils.degToRad(58)
/** 太陽とまわりの光の強さ（いまの見た目に対する倍率） */
const SUN_GAIN = 1.9
const HEMI_GAIN = 0.85

export class DioramaLook {
  readonly cam: THREE.OrthographicCamera
  private readonly rt: THREE.WebGLRenderTarget
  readonly post: THREE.ShaderMaterial
  private readonly postScene = new THREE.Scene()
  private readonly postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly dir = new THREE.Vector3()
  private readonly right = new THREE.Vector3()
  private readonly up = new THREE.Vector3()
  private shadowT = 0
  /** 画面の半分の高さ（ワールドの長さ）。ピンチの camZoom を掛ける */
  half = 8

  constructor(hudTex: THREE.Texture) {
    const h = this.half
    this.cam = new THREE.OrthographicCamera(-h, h, h, -h, 1, DIST * 2.4)
    this.rt = new THREE.WebGLRenderTarget(SCENE.w, SCENE.h, {
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(SCENE.w, SCENE.h),
    })
    this.post = makeDioramaPost(this.rt.texture, this.rt.depthTexture!, hudTex)
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post))
    this.setYaw(0)
  }

  /** 見る向き（0〜3：90° ずつ回す） */
  yaw = 0
  setYaw(k: number) {
    this.yaw = ((k % 4) + 4) % 4
    const az = AZIMUTH + this.yaw * (Math.PI / 2)
    this.dir.set(Math.sin(az) * Math.cos(ELEVATION), Math.sin(ELEVATION), Math.cos(az) * Math.cos(ELEVATION))
    // カメラの向き（右・上）を先に求めておく（ピクセル合わせに使う）
    this.cam.position.copy(this.dir).multiplyScalar(DIST)
    this.cam.lookAt(0, 0, 0)
    this.cam.updateMatrixWorld()
    this.right.setFromMatrixColumn(this.cam.matrixWorld, 0)
    this.up.setFromMatrixColumn(this.cam.matrixWorld, 1)
  }

  /** 画面の右・奥（地面の上の向き）。指でずらす時に使う */
  screenAxes() {
    const r = new THREE.Vector3(this.right.x, 0, this.right.z).normalize()
    const f = new THREE.Vector3(-this.dir.x, 0, -this.dir.z).normalize()
    return { r, f }
  }

  /** 見る所（ペットのまわり）へカメラを置く。1 ピクセルの格子に吸わせる */
  aim(target: THREE.Vector3, zoom: number) {
    const h = this.half * zoom
    if (this.cam.top !== h) {
      this.cam.left = -h
      this.cam.right = h
      this.cam.top = h
      this.cam.bottom = -h
      this.cam.updateProjectionMatrix()
    }
    const px = (2 * h) / SCENE.h
    const r = Math.round(target.dot(this.right) / px) * px
    const u = Math.round(target.dot(this.up) / px) * px
    const f = target.dot(this.dir)
    const t = new THREE.Vector3().addScaledVector(this.right, r).addScaledVector(this.up, u).addScaledVector(this.dir, f)
    this.cam.position.copy(t).addScaledVector(this.dir, DIST)
    this.cam.lookAt(t)
  }

  /**
   * 1 フレーム描く。影・霧・背景（空のドーム・デジタル空間）は、ここでだけ切りかえて元に戻す
   * （いまの PS1 風の描き方には何も残さない）。
   */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, sun: THREE.DirectionalLight, hemi: THREE.HemisphereLight, opt: DioramaFrame, out: THREE.WebGLRenderTarget, camera?: THREE.PerspectiveCamera) {
    const cam: THREE.Camera = camera ?? this.cam
    // 0.5 秒ごとに、影を落とす・受ける物を決めなおす（スプライトと半透明は落とさない）
    if ((this.shadowT -= opt.dt) <= 0) {
      this.shadowT = 0.5
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        const mat = m.material as THREE.Material
        const solid = !Array.isArray(mat) && !mat.transparent && !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial
        m.castShadow = solid && opt.shadows
        m.receiveShadow = solid || Array.isArray(mat)
      })
    }
    const hidden: THREE.Object3D[] = []
    scene.traverse((o) => {
      if (o.userData.backdrop && o.visible) {
        o.visible = false
        hidden.push(o)
      }
    })
    const fog = scene.fog
    scene.fog = null
    const sunPos = sun.position.clone()
    const sunTarget = sun.target.position.clone()
    const cast = sun.castShadow
    // 太陽は画面の左上・少し奥から：影が長く、画面の右下（手前）へ落ちる（物のうしろに隠れない）
    const flat = new THREE.Vector3(this.dir.x, 0, this.dir.z).normalize()
    const sd = this.right.clone().multiplyScalar(-1).addScaledVector(flat, -0.35).setY(0)
    sd.normalize().multiplyScalar(Math.cos(SUN_ELEV)).setY(Math.sin(SUN_ELEV))
    sun.target.position.copy(opt.focus)
    sun.position.copy(opt.focus).addScaledVector(sd, 40)
    sun.target.updateMatrixWorld()
    sun.castShadow = opt.shadows
    const s = sun.shadow
    const span = opt.span
    s.camera.left = -span
    s.camera.right = span
    s.camera.top = span
    s.camera.bottom = -span
    s.camera.near = 1
    s.camera.far = 90
    s.camera.updateProjectionMatrix()
    s.bias = -0.0008
    s.normalBias = 0.03
    if (s.mapSize.x !== opt.shadowRes) {
      s.mapSize.set(opt.shadowRes, opt.shadowRes)
      s.map?.dispose()
      s.map = null
    }
    // 影がはっきり見えるよう、まわりの明るさ（空の光）をおさえて 太陽を強く
    const sunI = sun.intensity
    const hemiI = hemi.intensity
    sun.intensity = sunI * SUN_GAIN
    hemi.intensity = hemiI * HEMI_GAIN
    toonU.uToon.value = 1
    toonU.uSunLum.value = Math.max(0.05, sun.intensity * (sun.color.r * 0.3 + sun.color.g * 0.59 + sun.color.b * 0.11))

    const prev = renderer.getRenderTarget()
    const clear = renderer.getClearColor(new THREE.Color())
    const alpha = renderer.getClearAlpha()
    renderer.setClearColor('#000000', 1)
    renderer.setRenderTarget(this.rt)
    renderer.clear()
    renderer.render(scene, cam)

    const u = this.post.uniforms
    u.skyTop.value.set(opt.sky[0])
    u.skyBot.value.set(opt.sky[1])
    u.night.value = opt.night
    u.haze.value.set(opt.haze)
    u.flash.value = opt.flash
    u.time.value = opt.time
    // 遠近のカメラ（うしろ・めせん）：深度を距離に直して使う
    u.persp.value = camera ? 1 : 0
    if (camera) {
      u.near.value = camera.near
      u.far.value = camera.far
    }
    renderer.setRenderTarget(out)
    renderer.render(this.postScene, this.postCam)
    renderer.setRenderTarget(prev)
    renderer.setClearColor(clear, alpha)

    toonU.uToon.value = 0
    sun.intensity = sunI
    hemi.intensity = hemiI
    sun.position.copy(sunPos)
    sun.target.position.copy(sunTarget)
    sun.target.updateMatrixWorld()
    sun.castShadow = cast
    scene.fog = fog
    for (const o of hidden) o.visible = true
  }

  dispose() {
    this.rt.dispose()
    this.post.dispose()
  }
}

export interface DioramaFrame {
  dt: number
  time: number
  /** 影を落とす中心と広さ */
  focus: THREE.Vector3
  span: number
  shadows: boolean
  shadowRes: number
  /** 空の上と下の色 / 夜の度合い / かすみの色 */
  sky: [string, string]
  night: number
  haze: string
  flash: number
}

/** 仕上げのシェーダー。いまの PS1 風（psx.ts の makePostMaterial）と同じく、HUD はぼかさず最後に重ねる */
function makeDioramaPost(scene: THREE.Texture, depth: THREE.DepthTexture, hud: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: scene }, tDepth: { value: depth }, tHud: { value: hud },
      res: { value: new THREE.Vector2(SCENE.w, SCENE.h) },
      skyTop: { value: new THREE.Color() }, skyBot: { value: new THREE.Color() }, haze: { value: new THREE.Color() },
      night: { value: 0 }, flash: { value: 0 }, time: { value: 0 }, glitch: { value: 0 }, heat: { value: 0 },
      persp: { value: 0 }, near: { value: 0.1 }, far: { value: 160 },
    },
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tScene; uniform sampler2D tDepth; uniform sampler2D tHud;
      uniform vec2 res; uniform vec3 skyTop; uniform vec3 skyBot; uniform vec3 haze;
      uniform float night; uniform float flash; uniform float time; uniform float glitch; uniform float heat;
      uniform float persp; uniform float near; uniform float far;
      varying vec2 vUv;
      float bayer4(vec2 p) {
        int x = int(mod(p.x, 4.0)); int y = int(mod(p.y, 4.0));
        float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
        return m[x + y * 4] / 16.0;
      }
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      vec3 toSRGB(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
      vec3 toLin(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
      vec2 uv;
      // 深度を 0〜1 の距離に（平行投影はそのまま、遠近は 1/z を直す。遠近は 40 マス先を 1 に）
      float lin(float z) {
        if (persp < 0.5) return z;
        if (z >= 0.9999) return 1.0;
        float vz = near * far / (far - z * (far - near));
        return clamp(vz / 40.0, 0.0, 0.9998);
      }
      float D(vec2 o) { return lin(texture2D(tDepth, uv + o / res).x); }
      void main() {
        uv = vUv;
        float tq = floor(time * 24.0);
        // ワープのグリッチ（行ごとに横ずれ）
        if (glitch > 0.0) {
          float row = floor(uv.y * res.y / 3.0);
          float gn = hash(vec2(row, tq));
          uv.x += (gn - 0.5) * 0.3 * glitch * step(1.0 - glitch * 0.8, gn);
        }
        // ひのこ：熱でゆらぐ空気（2px の行ごと・下ほど強い）
        if (heat > 0.0) {
          float row = floor(vUv.y * res.y * 0.5);
          float wob = sin(row * 0.9 + time * 3.1) * 0.6 + sin(row * 0.37 - time * 1.9) * 0.4;
          uv.x += wob * 0.0042 * heat * mix(0.35, 1.0, 1.0 - vUv.y);
        }
        vec2 px = floor(vUv * res);
        float d = D(vec2(0.0));
        vec3 c;
        if (d >= 0.9999) {
          // 空：上から下へのグラデーション + 夜は暗く・星
          vec3 top = mix(skyTop, vec3(0.05, 0.06, 0.16), night * 0.85);
          vec3 bot = mix(skyBot, vec3(0.16, 0.12, 0.28), night * 0.8);
          c = mix(bot, top, smoothstep(0.0, 1.0, vUv.y));
          float st = step(0.996, hash(px)) * night * (0.6 + 0.4 * sin(time * 2.0 + hash(px * 1.7) * 30.0));
          c += vec3(st);
        } else {
          c = toSRGB(texture2D(tScene, uv).rgb);
          // 輪郭：まわりにずっと手前の物があれば（＝自分は奥側のふち）暗く
          float e = persp > 0.5 ? 0.012 + d * 0.06 : 0.0035;
          float n = min(min(D(vec2(1.0, 0.0)), D(vec2(-1.0, 0.0))), min(D(vec2(0.0, 1.0)), D(vec2(0.0, -1.0))));
          if (n < d - e) c = c * vec3(0.66, 0.6, 0.56);
          // ふちの光：左上の隣が ずっと奥なら（＝自分は手前の物の左上のふち）、暖かく明るく
          else if (D(vec2(-1.0, 1.0)) > d + e) c = c * 1.07 + vec3(0.03, 0.02, 0.0);
          // 遠くは空の色へ少しかすむ（奥行き = 平行投影なので d がそのまま距離）
          float fz = persp > 0.5 ? smoothstep(0.35, 0.9, d) : smoothstep(0.48, 0.68, d);
          c = mix(c, mix(haze, skyBot, 0.4), fz * 0.35);
        }
        // 色の調整（計画 E：あたたかい村）：くすんだ色・ひかえめな明暗。陰は 茶〜オリーブ、光は あたたかく
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(l), c, 0.74);
        // 緑は オリーブへ寄せる（緑が ほかより強い所ほど）
        float gr = clamp((c.g - max(c.r, c.b)) * 3.0, 0.0, 1.0);
        c = mix(c, c * vec3(1.08, 0.9, 0.78), gr * 0.55);
        c = mix(c, c * vec3(0.9, 0.84, 0.82) + vec3(0.02, 0.012, 0.0), smoothstep(0.42, 0.08, l) * 0.7);
        c = mix(c, c * vec3(1.05, 1.0, 0.88), smoothstep(0.55, 0.95, l) * 0.6);
        // 明暗を しぼる（まっ白・まっ黒を つくらない）
        c = mix(vec3(0.36, 0.33, 0.28), c, 0.86) * vec3(1.02, 0.99, 0.94);
        // 夜は全体を青く
        c = mix(c, c * vec3(0.55, 0.62, 0.95), night * 0.5);
        // 色数をしぼる（1 チャンネル 20 段）+ 4×4 ディザ
        float L = 20.0;
        c = floor(clamp(c, 0.0, 1.0) * L + bayer4(px)) / L;
        if (glitch > 0.0) c = mix(c, vec3(0.05, 0.1, 0.2), smoothstep(0.85, 1.0, glitch));
        c = mix(c, vec3(1.0), flash);
        vec4 h = texture2D(tHud, vUv);
        c = mix(c, h.rgb, h.a);
        gl_FragColor = vec4(toLin(c), 1.0);
      }`,
  })
}
