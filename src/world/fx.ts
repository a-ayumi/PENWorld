import * as THREE from 'three'

/**
 * 地形と天気の見た目（風・ぬれ・雪・雲の影・水のきらめき）の共通の仕組み。
 *
 * - すべてのシェーダーが同じ uniform（`fxU`）を参照する。World が毎フレーム値を入れるだけで、
 *   各ステージは何も更新しなくてよい（時刻 `uTime` も共通）。
 * - 材質へは `psx(material, { sway, ground, snow })` で足す（psx.ts）。木などの風のゆれは
 *   `swayify(group)`（fxprops.ts）で頂点に「ゆれの重み」を焼く。家・建物・キャラは足さないのでゆれない。
 * - 画質「低」は `uHigh = 0`。風のゆれ・雲の影・水たまり・波紋・水面のきらめきを切る（分岐は uniform なので軽い）。
 */

/** 共通の uniform（値は World.updateWeather が入れる） */
export const fxU = {
  /** 時間（秒） */
  uTime: { value: 0 },
  /** 画質 高 = 1 / 低 = 0 */
  uHigh: { value: 1 },
  /** 風の強さ 0〜1（はれ 0.25 / あめ・ひのこ 0.9） */
  uWind: { value: 0.3 },
  /** 風の向き（xz の単位ベクトル） */
  uWindDir: { value: new THREE.Vector2(0.86, 0.5) },
  /** 風で流れた距離（雲の影・もやが流れる） */
  uDrift: { value: new THREE.Vector2() },
  /** 地面のぬれ 0〜1（雨で上がり、止むとゆっくりかわく） */
  uWet: { value: 0 },
  /** 雨の強さ 0〜1（波紋の数） */
  uRain: { value: 0 },
  /** 積雪 0〜1（雪が降っている間にふえ、止むと溶ける） */
  uSnow: { value: 0 },
  /** 雲の影の濃さ 0〜1 */
  uCloud: { value: 0 },
  /** 水面のきらめき 0〜1 */
  uGlint: { value: 1 },
  /** 夜 0〜1 */
  uNight: { value: 0 },
  /** 空：くもり・あめの灰色 */
  uGrey: { value: 0 },
  /** 空：ひのこの赤 */
  uEmber: { value: 0 },
  /** 空：にじ */
  uBow: { value: 0 },
  /** にじの向き（横向きの単位ベクトル） */
  uBowDir: { value: new THREE.Vector3(-0.35, 0, -0.94) },
}

/** 材質に足せる効果 */
export interface FxOpt {
  /** 頂点の属性 aFx（ゆれの重み, 位相, 上下のゆれ）で風にゆれる */
  sway?: boolean
  /** 地面：ぬれ・水たまり・波紋・雲の影 */
  ground?: boolean
  /** 上を向いた面に雪が積もる */
  snow?: boolean
}

/** どのシェーダーにも入れる共通部品（hash / noise / 波紋 / きらめき） */
export const FX_PARS = /* glsl */ `
  uniform float uTime; uniform float uHigh; uniform float uWind; uniform vec2 uWindDir; uniform vec2 uDrift;
  uniform float uWet; uniform float uRain; uniform float uSnow; uniform float uCloud; uniform float uGlint; uniform float uNight;
  float fxHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float fxNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(fxHash(i), fxHash(i + vec2(1.0, 0.0)), f.x), mix(fxHash(i + vec2(0.0, 1.0)), fxHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  /** 雨の波紋（1 マス 1 個の輪がひろがって消える）。size = マスの大きさ */
  float fxRings(vec2 p, float size) {
    vec2 g = floor(p / size); vec2 f = fract(p / size);
    float h = fxHash(g); float h2 = fxHash(g + 7.3);
    float live = step(h2, uRain * 0.85);
    float ph = fract(uTime * (0.65 + 0.5 * h) + h2 * 5.0);
    float d = length((f - vec2(0.25 + 0.5 * h, 0.25 + 0.5 * h2)) * size);
    return (1.0 - smoothstep(0.0, 0.05, abs(d - ph * size * 0.42))) * (1.0 - ph) * live;
  }`

/**
 * 風のゆれ（頂点）。aFx = (ゆれの重み 0〜1, 位相, 上下のゆれの大きさ)。
 * 重みは高さに比例（根もとは動かず、先ほど大きくゆれる）。風は World で共通の向き・強さ。
 */
const SWAY_VERT = /* glsl */ `
  #include <begin_vertex>
  {
    float fw = clamp(aFx.x, 0.0, 1.0);
    if (uHigh > 0.5) {
      float org = dot(modelMatrix[3].xz, uWindDir) * 0.4;
      float t = uTime * (1.1 + uWind * 1.7) + aFx.y + org;
      float gust = 0.55 + 0.45 * sin(uTime * 0.31 + org * 0.7);
      float amp = fw * (0.02 + 0.13 * uWind) * (0.6 + 0.6 * gust);
      float s = sin(t) * 0.6 + sin(t * 2.3 + 1.7) * 0.25 + 0.35 + uWind * 0.6;
      vec3 d = vec3(uWindDir.x * s, -abs(s) * 0.12, uWindDir.y * s) * amp;
      d.xz += vec2(-uWindDir.y, uWindDir.x) * cos(t * 1.3) * amp * 0.3;
      // 世界の向きのゆれを、この物の向き・大きさに直して足す
      transformed += (vec4(d, 0.0) * modelMatrix).xyz / dot(modelMatrix[0].xyz, modelMatrix[0].xyz);
    }
    // 水に浮く物の上下
    transformed.y += sin(uTime * 1.6 + aFx.y) * aFx.z;
  }`

/**
 * 地面・雪の見た目（フラグメント）。
 * - ぬれて暗くなる / 水たまり（低い所・つやっぽく空の色を映す）/ 波紋 / 雲の影 …… 高画質のみ（雲の影・波紋・たまり）
 * - 上を向いた面に雪（ぬれ・雪の積もりは低画質でも出る。軽い計算だけ）
 */
function fragmentPatch(o: FxOpt) {
  const ground = !!o.ground
  return {
    head: 'float fxPud = 0.0; float fxShade = 0.0; vec3 fxAdd = vec3(0.0);\n',
    body: /* glsl */ `
      #include <emissivemap_fragment>
      {
        vec2 wp = vFxPos.xz;
        ${
          ground
            ? /* glsl */ `
        if (uWet > 0.01) {
          diffuseColor.rgb *= 1.0 - 0.3 * uWet;
          if (uHigh > 0.5) {
            float n = fxNoise(wp * 0.5 + 3.0) * 0.75 + fxNoise(wp * 1.7) * 0.25;
            fxPud = smoothstep(0.5, 0.58, n) * (1.0 - smoothstep(0.3, 1.7, vFxPos.y)) * uWet;
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.7, 0.95), fxPud * 0.6);
            float rg = fxRings(wp, 1.15) + fxRings(wp + 5.0, 0.8) * 0.8;
            fxAdd += vec3(0.3, 0.38, 0.46) * rg * uRain * (0.25 + 0.75 * fxPud);
            fxAdd += vec3(0.1, 0.14, 0.2) * fxPud * (1.0 - uNight * 0.7);
          }
        }
        if (uCloud > 0.01 && uHigh > 0.5) {
          vec2 cp = wp * 0.085 - uDrift * 0.5;
          float cn = fxNoise(cp) * 0.65 + fxNoise(cp * 2.1 + 7.0) * 0.35;
          float sh = smoothstep(0.5, 0.64, cn);
          fxShade = floor(sh * 3.0 + 0.5) / 3.0 * 0.32 * uCloud;
        }`
            : ''
        }
        ${
          o.snow
            ? /* glsl */ `
        if (uSnow > 0.01) {
          float up = dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
          float pn = fxNoise(wp * 1.3) * 0.7 + fxHash(floor(wp * 4.0)) * 0.3;
          float m = smoothstep(0.35, 0.75, up) * step(pn, uSnow * 1.0 - 0.02);
          vec3 sn = vec3(0.93, 0.96, 1.0) * (0.86 + 0.3 * dot(diffuseColor.rgb, vec3(0.33)));
          diffuseColor.rgb = mix(diffuseColor.rgb, sn, m * 0.9);
        }`
            : ''
        }
      }`,
    tail: ground ? 'outgoingLight *= 1.0 - fxShade; outgoingLight += fxAdd;\n#include <opaque_fragment>' : '',
  }
}

/** psx() から呼ぶ：onBeforeCompile の中で標準材質のシェーダーに効果を足す */
export function fxPatch(shader: { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string }, o: FxOpt) {
  for (const k of Object.keys(fxU) as (keyof typeof fxU)[]) shader.uniforms[k] = fxU[k]
  let v = shader.vertexShader
  let f = shader.fragmentShader
  const needPos = !!(o.ground || o.snow)
  v = 'uniform float uTime; uniform float uHigh; uniform float uWind; uniform vec2 uWindDir;\n' + (o.sway ? 'attribute vec3 aFx;\n' : '') + (needPos ? 'varying vec3 vFxPos;\n' : '') + v
  if (o.sway) v = v.replace('#include <begin_vertex>', SWAY_VERT)
  if (needPos) v = v.replace('#include <project_vertex>', '#include <project_vertex>\n  vFxPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
  if (needPos) {
    const p = fragmentPatch(o)
    f = f.replace('void main() {', `${FX_PARS}\nvarying vec3 vFxPos;\nvoid main() {\n${p.head}`)
    f = f.replace('#include <emissivemap_fragment>', p.body)
    if (p.tail) f = f.replace('#include <opaque_fragment>', p.tail)
  }
  shader.vertexShader = v
  shader.fragmentShader = f
}

/** 材質に付けた効果（psx が userData.fx に入れる。あとから swayify などが足せる） */
export function fxOf(m: THREE.Material): FxOpt | undefined {
  return m.userData.fx as FxOpt | undefined
}
