import * as THREE from 'three'
import { fxPatch, type FxOpt } from './fx'

/**
 * PS1 風の表現をまとめたモジュール。
 * - 低解像度レンダリング（320×240）
 * - 頂点スナップ（ポリゴンが画面のピクセル格子に吸着してカクつく）
 * - 15bit カラー（各色 5bit）+ 4×4 Bayer ディザ
 * - テクスチャは Nearest（ぼかさない）
 */
/** HUD（文字・アイコン）のキャンバス解像度 */
export const RES = { w: 320, h: 320 }
/** 箱庭を描く解像度（ドット絵の細かさを出すため HUD の 1.5 倍） */
export const SCENE = { w: 480, h: 480 }
/** 最終出力（HUD の 3 倍・箱庭の 2 倍 = どちらもドットが均等に拡大される） */
export const OUT = { w: 960, h: 960 }

/**
 * トゥーン（ピクセル・ジオラマの見た目で使う）：太陽の光を 3 段にする。uToon = 0 の間は何もしない（PS1 風のまま）。
 * uSunLum は いまの太陽の明るさ（光の量を 0〜1 にそろえるため）。diorama.ts が描く直前に入れて、描いたら 0 に戻す。
 */
export const toonU = { uToon: { value: 0 }, uSunLum: { value: 1 } }

/** 頂点スナップの格子（小さいほど揺れが強い） */
const snap = { value: new THREE.Vector2(SCENE.w / 2, SCENE.h / 2) }

/**
 * 任意の three 標準マテリアルに頂点スナップを足す。
 * `fx` を渡すと風のゆれ・ぬれ・雪の積もりなどの天気の見た目も足す（fx.ts）。
 * オプションは材質の userData.fx に入るので、コンパイル前なら後から足してもよい（swayify）。
 */
export function psx<T extends THREE.Material>(m: T, fx?: FxOpt): T {
  const o: FxOpt = fx ?? {}
  m.userData.fx = o
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSnap = snap
    shader.vertexShader =
      'uniform vec2 uSnap;\n' +
      shader.vertexShader.replace(
        '#include <logdepthbuf_vertex>',
        `{ vec4 p = gl_Position; p.xy = floor(p.xy / p.w * uSnap + 0.5) / uSnap * p.w; gl_Position = p; }
        #include <logdepthbuf_vertex>`,
      )
    if (o.sway || o.ground || o.snow) fxPatch(shader, o)
    if (shader.fragmentShader.includes('#include <lights_fragment_end>')) {
      shader.uniforms.uToon = toonU.uToon
      shader.uniforms.uSunLum = toonU.uSunLum
      shader.fragmentShader =
        'uniform float uToon; uniform float uSunLum;\n' +
        shader.fragmentShader.replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
          if (uToon > 0.5) {
            // 太陽の光の量（影も入る）を 0〜1 にそろえて、3 段（かげ・半かげ・ひなた）に丸める
            float dl = dot(reflectedLight.directDiffuse, vec3(0.333));
            float dc = dot(diffuseColor.rgb, vec3(0.333)) * uSunLum * RECIPROCAL_PI + 1e-4;
            float a = dl / dc;
            float q = a < 0.12 ? 0.0 : a < 0.55 ? 0.5 : 1.0;
            reflectedLight.directDiffuse *= a > 1e-3 ? q / a : 0.0;
          }`,
        )
    }
  }
  m.customProgramCacheKey = () => 'psx' + (o.sway ? 'w' : '') + (o.ground ? 'g' : '') + (o.snow ? 's' : '')
  return m
}

/** ShaderMaterial 用：頂点シェーダーの最後に入れる */
export const SNAP_GLSL = /* glsl */ `
  uniform vec2 uSnap;
  vec4 psxSnap(vec4 p) { p.xy = floor(p.xy / p.w * uSnap + 0.5) / uSnap * p.w; return p; }`
export const snapUniform = snap

/** 仕上げ（ディザ + 減色 + HUD 合成 + ワープ時のグリッチ + 進化の白フラッシュ） */
export function makePostMaterial(scene: THREE.Texture, hud: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: scene }, tHud: { value: hud }, glitch: { value: 0 }, flash: { value: 0 }, time: { value: 0 }, heat: { value: 0 },
      res: { value: new THREE.Vector2(SCENE.w, SCENE.h) },
    },
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tScene; uniform sampler2D tHud;
      uniform float glitch; uniform float flash; uniform float time; uniform float heat; uniform vec2 res;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float bayer4(vec2 p) {
        int x = int(mod(p.x, 4.0)); int y = int(mod(p.y, 4.0));
        float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
        return m[x + y * 4] / 16.0;
      }
      vec3 toSRGB(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
      vec3 toLin(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
      void main() {
        vec2 uv = vUv;
        float t = floor(time * 24.0);
        if (glitch > 0.0) {
          float row = floor(uv.y * res.y / 3.0);
          float n = hash(vec2(row, t));
          uv.x += (n - 0.5) * 0.3 * glitch * step(1.0 - glitch * 0.8, n);
        }
        // ひのこ：熱でゆらぐ空気（2px の行ごとに横へずらす。下ほど強い）
        if (heat > 0.0) {
          float row = floor(vUv.y * res.y * 0.5);
          float wob = sin(row * 0.9 + time * 3.1) * 0.6 + sin(row * 0.37 - time * 1.9) * 0.4;
          uv.x += wob * 0.0042 * heat * mix(0.35, 1.0, 1.0 - vUv.y);
        }
        vec3 c = toSRGB(texture2D(tScene, uv).rgb);
        if (glitch > 0.0) {
          c.r = toSRGB(texture2D(tScene, uv + vec2(0.012 * glitch, 0.0)).rgb).r;
          c.b = toSRGB(texture2D(tScene, uv - vec2(0.012 * glitch, 0.0)).rgb).b;
          vec2 b = floor(uv * vec2(24.0, 18.0));
          float bn = hash(b + t);
          if (bn < glitch * 0.45) c = mix(c, vec3(0.25, 1.0, 0.9) * (0.4 + bn), 0.75);
          c = mix(c, vec3(0.05, 0.1, 0.2), smoothstep(0.85, 1.0, glitch));
        }
        vec2 px = floor(vUv * res);
        c += (bayer4(px) - 0.5) / 22.0;
        c = floor(clamp(c, 0.0, 1.0) * 31.0 + 0.5) / 31.0;
        c = mix(c, vec3(1.0), flash);
        vec4 h = texture2D(tHud, vUv);
        c = mix(c, h.rgb, h.a);
        gl_FragColor = vec4(toLin(c), 1.0);
      }`,
  })
}
