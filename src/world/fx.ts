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
const POND_BLANK = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
  t.needsUpdate = true
  return t
})()

export const fxU = {
  /** 水べの 下ごしらえ（pond.ts の `bakePond()`）：岸からの 距離・木の 高さ。範囲は (x0, z0, 1 / 大きさ, 0) */
  uPond: { value: POND_BLANK as THREE.Texture },
  uPondBox: { value: new THREE.Vector4(0, 0, 1, 0) },
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
  /** 生き物（2026-11-16）：頂点スナップと 光の 段を かけず、なめらかな 陰に 毛の つぶを こく のせる（見本の 羊の ような ふわっと した 体） */
  soft?: boolean
  /** 木の 葉の かたまり（2026-11-16）：かたまりごとに 1 ドットずつ カクッと ゆれる。風下へ じゅんばんに（頂点の 属性 aClump = 位相・大きさ） */
  clump?: boolean
  /** 建物（2026-11-17）：かべに れんが・板の 段、屋根に かわらの 段を ドットで 描く（世界の 位置で きまる・ジオラマで 描く 間だけ） */
  build?: boolean
  /** 木の 葉（2026-11-17）：小さな 葉の 房を ならべた ドットの 模様（房の 上は 明るく・さかいは かげ） */
  leaf?: boolean
}

/** どのシェーダーにも入れる共通部品（hash / noise / 波紋 / きらめき） */
export const FX_PARS = /* glsl */ `
  uniform float uTime; uniform float uHigh; uniform float uWind; uniform vec2 uWindDir; uniform vec2 uDrift;
  uniform float uWet; uniform float uRain; uniform float uSnow; uniform float uCloud; uniform float uGlint; uniform float uNight;
  uniform sampler2D uPond; uniform vec4 uPondBox;
  /** 岸からの 距離（マス・水の 中は ＋）と 水の 種類（a = 1 池や 川 / 0 海） */
  vec4 fxPond(vec2 p) { return texture2D(uPond, (p - uPondBox.xy) * uPondBox.z); }
  float fxPondSd(vec4 t) { return (t.r * 255.0 - 128.0) / 16.0; }
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
/**
 * 葉の かたまりの ゆれ（ドット絵の 木の 作り方。参考：SpriteCook「pixel art trees move in the wind」の 考え方）：
 * - 幹は うごかさない。かたまりが まるい ドット単位で「とまる → 上 → 右上 → 右 → もどる」の ループ
 * - ループの 位相は 風の 向きに そった 位置で きまる（波が 木から 木へ わたる。1 周 1.54 秒・山と 山の あいだ 69 ドット）
 * - 風は 地図を よこぎる いくつかの 突風（gust）。突風の 外は 0（しずかな 間が ある = ずっと ゆれると ぶるぶる 見える）
 *   突風の 中は 2〜3 ドットに ひろがり、木ぜんたいが 風下へ かたむく
 * - ポーズを かえるのは 1 秒に 10 回（毎フレーム かえると ふるえて 見える）
 * - かたまりの 大きさ aClump.y：まんなか 0.35 〜 そと 1（まんなかほど うごかない）
 * 1 ドット ≒ 0.05 マス（箱庭 320 で ふつうの ズーム）。天気の 風 uWind で 突風が つよく なる
 */
const CLUMP_BODY = /* glsl */ `
  {
    if (uHigh > 0.5 && aClump.y > 0.0) {
      const float PX = 0.05;
      vec3 wp0 = (modelMatrix * vec4(position, 1.0)).xyz;
      vec3 foot = modelMatrix[3].xyz;
      vec2 wd = normalize(uWindDir + vec2(1e-4));
      float tq = floor(uTime * 10.0) / 10.0;
      // 風に そった 位置（ドット）
      float along = dot(wp0.xz, wd) / PX;
      float alongF = dot(foot.xz, wd) / PX;
      // 突風：3 つの 帯が 風下へ ながれる（20 秒の くりかえし）。spread を ひろげた 方が そよ風
      float gust = 0.0;
      float breeze = 0.0;
      float gF = 0.0;
      for (int k = 0; k < 3; k++) {
        float fk = float(k);
        float sp = 52.0 + fk * 6.0;
        float path = sp * 20.0;
        float len = 30.0 + fk * 7.0;
        float st = (0.7 + 0.25 * fk) * (0.6 + uWind * 0.9);
        float off = fk * 6.7;
        float d = mod(along - sp * (tq - off) + path * 0.5, path) - path * 0.5;
        float dF = mod(alongF - sp * (tq - 0.4 - off) + path * 0.5, path) - path * 0.5;
        gust += st * exp(-(d / len) * (d / len));
        breeze += st * exp(-(d / (len * 2.2)) * (d / (len * 2.2)));
        gF += st * exp(-(dF / len) * (dF / len));
      }
      breeze = min(1.6 * breeze, 1.0);
      float w = aClump.y;
      float a = 6.2832 * (tq / 1.54 - along / 69.0) + aClump.x * 0.6;
      float lean = gF * (aClump.y > 0.5 ? 1.6 : 1.0);
      float dx = lean * w + w * (0.9 * breeze + 1.3 * gust) * (0.5 - 0.5 * cos(a));
      float dy = w * (0.75 * breeze + 0.5 * gust) * max(sin(a), 0.0);
      vec3 d = vec3(wd.x, 0.0, wd.y) * floor(dx + 0.5) * PX + vec3(0.0, floor(dy + 0.5) * PX, 0.0);
      transformed += (vec4(d, 0.0) * modelMatrix).xyz / dot(modelMatrix[0].xyz, modelMatrix[0].xyz);
    }
  }`
const CLUMP_VERT = '#include <begin_vertex>' + CLUMP_BODY

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
        if (uHigh > 0.5) {
          // 草の 穂の ドット（2026-11-17：見本の 町の 地面）：1 ドットほどの 升目で まばらに 明るい 穂と こい 根もと
          vec2 tc = floor(wp / 0.075);
          float th = fxHash(tc);
          float tb = fxHash(tc + vec2(0.0, -1.0));
          float tm = fxNoise(wp * 0.6);
          if (th > 0.94 - tm * 0.05) diffuseColor.rgb *= 1.28;
          else if (tb > 0.94 - tm * 0.05) diffuseColor.rgb *= 0.78;
        }
        {
          // 水べの ぬれた 土（岸から 0.5 マス・すこし 暗く）
          float psd = fxPondSd(fxPond(wp));
          if (psd < 0.0 && psd > -0.5) diffuseColor.rgb *= 0.8;
        }
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
  v = 'uniform float uTime; uniform float uHigh; uniform float uWind; uniform vec2 uWindDir;\n' + (o.sway ? 'attribute vec3 aFx;\n' : '') + (o.clump ? 'attribute vec2 aClump;\n' : '') + (needPos ? 'varying vec3 vFxPos;\n' : '') + v
  if (o.sway) v = v.replace('#include <begin_vertex>', SWAY_VERT)
  // ゆれの 処理の 頭（#include <begin_vertex> の すぐ あと）に 入る
  if (o.clump) v = v.replace('#include <begin_vertex>', CLUMP_VERT)
  // 地面：水の 中の 頂点を すこし 下げる（荒い 三角が 水の 上に かぶって まっすぐな 岸に ならない ように）
  if (o.ground)
    v = 'uniform sampler2D uPond; uniform vec4 uPondBox;\n' + v.replace('#include <project_vertex>', `{ vec2 pw = (modelMatrix * vec4(transformed, 1.0)).xz;
      float psd = (texture2D(uPond, (pw - uPondBox.xy) * uPondBox.z).r * 255.0 - 128.0) / 16.0;
      transformed.y -= smoothstep(0.3, 0.8, psd) * 0.1; }
#include <project_vertex>`)
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
