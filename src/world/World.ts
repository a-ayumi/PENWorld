import * as THREE from 'three'
import { OUT, RES, SCENE, makePostMaterial, psx } from './psx'
import { SpriteAnim, iconSheet } from './sprites'
import { MonsterModel, hasModel } from './models'
import { BABY, EGG_COLORS, FAMILY_NAME, LOOK_NAME, NEW_SKILLS, SPECIES, STAGE_EGGS, SpriteMonster, XP_NEED, armyBoss, armyMember, enemyFor, familyOf, lookOf, newSeed, nextForm, variantOf, type Care, type EggKind, type Face, type MonsterView, type Species, type SpeciesId } from './monsters'
import { Tex } from './textures'
import { fxU } from './fx'
import { WeatherFx, fxLod } from './fxprops'
import { HALF, LAND_SIZES, SIZE, STAGES, setLandSize, type Stage } from './stages'
import { EAT_KEYS, EVENT_IDS, SECRET_EVENTS, SECRET_FORMS, hintLines, hintMask, isSecretId, secretById, secretForm, type EventCtx, type EventFx, type SecretCtx, type SecretEvent } from './secrets'
import { STRUCTS, buildStructModel, isStructKind, styleOf, type StructKind } from './structures'
import { ITEM_INFO, ITEM_SPEC, buildItem, disposeItem, isItemKind, slidePath, tickItem, type ItemKind } from './items'
import { SHOP, catIndexes, catOf, drawShop as drawShopWindow, shopTap, type ShopCheck, type ShopItem } from './shop'

/**
 * 箱庭の世界。モンスターが自分で考えて暮らす（歩く・食べる・眠る・遊ぶ・戦う・仲間になる・たまごを産む）。
 * 人は「環境」を用意して見守る：ショップで食べ物や置き物を買って箱庭に置く。
 * 描画は 320×240 の RenderTarget → PS1 風の仕上げ → 本体の液晶 / 全画面 に使う。
 */

export type Sfx = 'select' | 'ok' | 'cancel' | 'hit' | 'crit' | 'win' | 'lose' | 'eat' | 'warp' | 'evolve' | 'train' | 'coin' | 'friend' | 'egg' | 'skill' | 'boom'
type Team = 'pet' | 'friend' | 'wild'
type State =
  | 'idle' | 'wander' | 'hunt' | 'fight' | 'assist' | 'seek' | 'eat' | 'sleep' | 'rest' | 'play'
  | 'happy' | 'faint' | 'dead' | 'train' | 'come' | 'gather' | 'build' | 'raid' | 'march' | 'work' | 'tend'

interface Creature {
  sp: Species; team: Team; anim: MonsterView; shadow: THREE.Mesh
  x: number; z: number; jy: number; vy: number; kx: number; kz: number
  hp: number; maxHp: number; atk: number; hunger: number; energy: number
  state: State; t: number; tx: number; tz: number; foe: Creature | null; food: Food | null
  cd: number; lunge: number; hurt: number; fx: number; phase: number
  /** 仲良し度（100 で仲間になる） */
  affinity: number
  /** こども：0 = おとな、0〜1 = 成長中 */
  grow: number
  /** 1 匹ずつの経験値と育ちの傾向（ペットは World.xp / World.care を使う） */
  xp: number
  care: Record<Care, number>
  /** 生まれつきの性格（進化先にえいきょうする） */
  bias: Care
  /** じゃれあいバトル中（負けても消えない） */
  spar: boolean
  /** 運んでいる資材 */
  carry: ResKind | null
  carryMesh: THREE.Mesh | null
  res: Res | null
  /** こわしに行く家 */
  raid: House | null
  /** 家の中で眠っている */
  inside: boolean
  /** 技を出せるまでの時間 */
  skillCd: number
  /** おうえんされた（次の攻撃で技を出す） */
  cheer: boolean
  /** 眠りはじめた時の げんき・たいりょく（起きた時に増えた分を出す） */
  sleepFrom: { e: number; h: number } | null
  /** 資材を運んでいく建設現場（なければ自分の家） */
  site: Struct | null
  /** 敵軍の一員 */
  army: boolean
  /** ぷにぷに動き：着地のつぶれ・前の高さ */
  squash: number
  pj: number
  /** 組み立て作業の終わりにやること（かなづちの動きのあと実行） */
  finish: (() => void) | null
  role: Role
  tendTo: Struct | null
  /** ひっかかり対策：前に見た場所・たまった時間・回りこみ先 */
  lx: number
  lz: number
  mvT: number
  stuck: number
  detourN: number
  detour: { x: number; z: number; t: number } | null
  avoid: 1 | -1
  /** 個体の見た目のシード（もよう・色のゆらぎ）と 色ちがい */
  seed: number
  rare: boolean
  /** 進化の演出中（白いシルエット → ふくらむ → 新しい姿） */
  evo: Evo | null
  /** 色ちがいのキラキラを出す間隔 */
  glint: number
}
/** 進化の演出：t = 経過秒 / from = 元の種族 / h0 = 元の大きさ / shown = いま出している絵 */
interface Evo { t: number; from: SpeciesId; to: SpeciesId; h0: number; shown: 'old' | 'white-old' | 'white-new' | 'new'; said: boolean }

/** 技：種族ごとに 1 つ。演出の種類（shot = 弾 / burst = 衝撃 / dash = 突進 / rain = 降りそそぐ / heal = 回復 / wave = 地面の波）*/
interface Skill { name: string; kind: 'shot' | 'burst' | 'dash' | 'rain' | 'heal' | 'wave'; color: string; mult: number }
const SKILLS: Record<string, Skill> = {
  mebu: { name: 'はっぱとばし', kind: 'shot', color: '#7cf29b', mult: 1.6 },
  pikori: { name: 'でんきゅうフラッシュ', kind: 'burst', color: '#fff27a', mult: 1.8 },
  gorota: { name: 'けっしょうつぶて', kind: 'shot', color: '#5ef2ff', mult: 1.8 },
  mofuru: { name: 'ふぶきタックル', kind: 'dash', color: '#e8f4ff', mult: 1.9 },
  giaru: { name: 'ギアスパーク', kind: 'burst', color: '#b48cff', mult: 2.0 },
  hireru: { name: 'みずでっぽう', kind: 'shot', color: '#6fd6ff', mult: 2.0 },
  fuwari: { name: 'いやしのこさめ', kind: 'heal', color: '#ff9ecb', mult: 0 },
  garudora: { name: 'はがねのブレス', kind: 'shot', color: '#8fe0ff', mult: 2.6 },
  shioryu: { name: 'うしおのうず', kind: 'wave', color: '#2fd4e8', mult: 2.4 },
  hoshikujira: { name: 'ほしふらし', kind: 'rain', color: '#fff27a', mult: 2.5 },
  noiz: { name: 'ノイズばくはつ', kind: 'burst', color: '#ff3bd4', mult: 1.7 },
  togebug: { name: 'トゲミサイル', kind: 'shot', color: '#ff5ed9', mult: 1.6 },
  yamikage: { name: 'かげぬい', kind: 'dash', color: '#9a6aff', mult: 1.9 },
  gougan: { name: 'マグマパンチ', kind: 'wave', color: '#ff7a2a', mult: 2.2 },
}
for (const [id, sk] of Object.entries(NEW_SKILLS)) SKILLS[id] = sk
interface Shot { sprite: THREE.Sprite; from: THREE.Vector3; src: Creature; dst: Creature; t: number; dur: number; dmg: number; skill: Skill; arc: number }
interface Ring { mesh: THREE.Mesh; t: number; dur: number; size: number }
interface Later { t: number; run: () => void }
/** 買った時に吸いこまれていくコイン */
interface Suck { anim: SpriteAnim; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; bs: number }
type ResKind = 'wood' | 'stone'
interface Res { kind: ResKind; x: number; z: number; mesh: THREE.Mesh; taken: Creature | null }
interface House {
  stage: number; x: number; z: number; owner: Creature | null; ownerSp: SpeciesId
  /** 運びこまれた資材の数（2 = 土台 / 5 = かべ / 8 = 屋根まで完成） */
  mats: number; hp: number; mesh: THREE.Group | null; shake: number; level: number; alerted: number
}
/** 家のほかの建物（はたけ・いど・みはりとう・ゆりかごごや・へい・おしろ・はし）。mats が need になると完成 */
interface Struct {
  kind: StructKind; stage: number; x: number; z: number; rot: number; len: number
  mats: number; hp: number; mesh: THREE.Group | null; shake: number; q: number; t: number; alerted: number
}
/** 敵軍：warn = 近づいている / on = 攻めてきている */
interface Army { phase: 'warn' | 'on'; t: number; left: Creature[]; n: number; castle: boolean; wave: number }
type Weather = 'sun' | 'cloud' | 'rain' | 'snow' | 'ember'
type FoodKind = 'stage' | 'meat' | 'sweet' | 'nut'
interface Food { mesh: THREE.Group; x: number; z: number; y: number; vy: number; landed: boolean; taken: Creature | null; bite: number; kind: FoodKind }
/** 村での役割（だいく・はたけがかり・みはり） */
type Role = 'free' | 'builder' | 'farmer' | 'guard'
const ROLE_NAME: Record<Role, string> = { free: 'じゆう', builder: 'だいく', farmer: 'はたけがかり', guard: 'みはり' }
const ROLE_COLOR: Record<Role, string> = { free: '#ffffff', builder: '#ffb84d', farmer: '#7cf29b', guard: '#6fd6ff' }
/** ペットの じゅみょう（あそんでいる時間・秒） */
const LIFESPAN = 3 * 3600
interface Item {
  kind: ItemKind; stage: number; x: number; z: number; grow: number; vx: number; vz: number; mesh: THREE.Group | null
  /** 置いた向き（ラジアン） */
  rot: number
  /** 買った直後の「上から落ちてくる」動き：高さと速さ / 着地のつぶれ / 落ちる間の影 */
  fall?: number
  fvy?: number
  sq: number
  fshadow?: THREE.Mesh
  /** なえの成長段階（めばえ・わかぎ・木） */
  st?: number
  /** 効果の周期タイマー */
  tick: number
}
/** lucky = ふしぎなたまご（色ちがいがうまれやすい） */
interface Egg { x: number; z: number; t: number; anim: SpriteAnim; shadow: THREE.Mesh; parents: SpeciesId[]; kind: EggKind; wild: boolean; lucky: boolean }
interface Popup { pos: THREE.Vector3; text: string; color: string; t: number; big?: boolean }
type Pick = { type: 'creature' | 'house' | 'struct' | 'item' | 'egg' | 'res' | 'food'; ref: any; armed: boolean }
const STATE_NAME: Record<string, string> = {
  idle: 'ぼんやり', wander: 'さんぽ', hunt: 'おいかけている', fight: 'たたかっている', seek: 'ごはんへ むかう', eat: 'たべている', sleep: 'ねむっている', rest: 'やすんでいる',
  play: 'あそんでいる', happy: 'うれしい', faint: 'きぜつ', dead: 'たおれた', train: 'トレーニング', come: 'よばれた', gather: 'しざいを ひろう', build: 'しざいを はこぶ',
  raid: 'こわしている', march: 'しんぐん中', work: 'トントン つくっている', tend: 'はたけの せわ', assist: 'たすけに むかう',
}
const STRUCT_DESC: Record<StructKind, string> = {
  farm: 'たべものが みのる。はたけがかりが せわをする',
  well: 'ちかくの みんなの たいりょくが かいふく',
  tower: 'ちかくの てきを うちおとす',
  cradle: 'たまごが できやすくなる',
  wall: 'てきの しんぐんを ふせぐ',
  castle: 'へいに かこまれた おしろ。ちかくで かいふく',
  bridge: 'みずうみを あるいて わたれる',
}
interface Fx { sprite: THREE.Sprite; vx: number; vy: number; vz: number; life: number; max: number; grav: number }

export const ICONS = ['ごはん', 'トレーニング', 'バトル', 'ステータス', 'ライト', 'ショップ', 'ワープ', 'よびだし']
const ICON_COLORS = ['#ff9f43', '#ff5e5e', '#ffd23f', '#ff7eb6', '#fff27a', '#ffb84d', '#a98bff', '#7cf29b']
const ICON_BMP = [
  ['..#.#.#..', '...#.#...', '.........', '#########', '#.......#', '#.......#', '.#.....#.', '..#####..', '...###...'],
  ['.........', '##.....##', '##.....##', '##.....##', '#########', '##.....##', '##.....##', '##.....##', '.........'],
  ['....#....', '#...#...#', '.#.###.#.', '..#####..', '#########', '..#####..', '.#.###.#.', '#...#...#', '....#....'],
  ['.##...##.', '####.####', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....', '.........'],
  ['...###...', '..#...#..', '.#.....#.', '.#.....#.', '.#.....#.', '..#...#..', '...###...', '...###...', '....#....'],
  ['..#...#..', '...###...', '..#####..', '.##...##.', '##.###.##', '##.#...##', '##.###.##', '.##...##.', '..#####..'],
  ['..#####..', '.#.....#.', '#..###..#', '#.#...#.#', '#.#.#.#.#', '#.#..##.#', '#..#....#', '.#..####.', '..#......'],
  ['...###...', '..#####..', '..#####..', '..#####..', '...###...', '...###...', '.........', '...###...', '...###...'],
]

/** 食べ物の種類（何を食べさせるかで育つ傾向が変わる） */
const FOODS: Record<Exclude<FoodKind, 'stage'>, { name: string; color: string; leaf: string; hunger: number; mood: number; care: Care }> = {
  meat: { name: 'スタミナにく', color: '#d9534f', leaf: '#f4ead6', hunger: 45, mood: 5, care: 'power' },
  sweet: { name: 'あまいみ', color: '#ff8fd8', leaf: '#7cf29b', hunger: 25, mood: 20, care: 'spirit' },
  nut: { name: 'かたいナッツ', color: '#b07a3a', leaf: '#6d4c41', hunger: 35, mood: 5, care: 'guard' },
}
const CARE_NAME: Record<Care, string> = { power: 'ちから', guard: 'まもり', spirit: 'こころ' }

/** セーブデータ・読み込んだコードは信用しない：種族は自前のキーだけ、数値は範囲に収める */
const isSpecies = (v: unknown): v is SpeciesId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(SPECIES, v)
const num = (v: unknown, min: number, max: number, def = min) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def)

const FX_SHEETS = () => ({
  heart: iconSheet(['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'], { '#': '#ff4d7a' }),
  spark: iconSheet(['...#...', '...#...', '..###..', '#######', '..###..', '...#...', '...#...'], { '#': '#fff27a' }),
  zzz: iconSheet(['#####', '...#.', '..#..', '.#...', '#####'], { '#': '#cfe6ff' }),
  cube: iconSheet(['###', '###', '###'], { '#': '#5ef2ff' }),
  hit: iconSheet(['#...#', '.#.#.', '..#..', '.#.#.', '#...#'], { '#': '#ffffff' }),
  coin: iconSheet(['.###.', '##.##', '#.#.#', '##.##', '.###.'], { '#': '#ffd23f' }),
})
/** たまごのから（系統ごとに色ともようが違う） */
const EGG_SHEET = (kind: EggKind) => {
  const [shell, shade, light, mark] = EGG_COLORS[kind]
  return iconSheet(
    ['...hh....', '..#####..', '.##o####.', '.#######.', '##o###o##', '#########', '###o####d', '.######dd', '..####ddd'],
    { '#': shell, o: mark, h: light, d: shade },
  )
}

/** 少し見下ろす箱庭カメラ（手前の木でキャラが隠れにくい角度） */
const CAM_OFF = new THREE.Vector3(0, 6.6, 5.8)
const FONT = '"DotGothic16", "Hiragino Sans", "Noto Sans JP", "Yu Gothic", Meiryo, ui-monospace, monospace'
const SAVE_KEY = 'pulsar-save-v1'
const HOUSE_STEPS = [0, 2, 5, 8, 12]
const MAX_STRUCTS = 26
const MAX_HOUSES = 6
const MAX_RES = 12
const houseLevel = (mats: number) => (mats >= 12 ? 4 : mats >= 8 ? 3 : mats >= 5 ? 2 : mats >= 2 ? 1 : 0)
const houseMaxHp = (level: number) => level * 25
/** 家の屋根の色（建てた種族の色） */
const ROOF: Partial<Record<SpeciesId, string>> = {
  mebu: '#5cc25a', pikori: '#ffd23f', gorota: '#8a94a6', mofuru: '#7fb2ff', giaru: '#8e6cff', hireru: '#3fc1c9',
  fuwari: '#ff9ecb', garudora: '#4a6fa5', shioryu: '#2fb5c9', hoshikujira: '#2a3a7a',
}
const WEATHER_NAME: Record<Weather, string> = { sun: 'はれ', cloud: 'くもり', rain: 'あめ', snow: 'ゆき', ember: 'ひのこ' }
const WEATHER_MSG: Record<Weather, string> = {
  sun: 'そらが はれてきた', cloud: 'くもが でてきた', rain: 'あめが ふってきた', snow: 'ゆきが ふってきた', ember: 'ひのこが まいはじめた…',
}
/** ステージごとの天気の出やすさ（森・砂丘・入り江・雪原・雪山・火山・遺跡） */
const WEATHER_W: Partial<Record<Weather, number>>[] = [
  { sun: 4, cloud: 2.5, rain: 2.5, snow: 0.4, ember: 0.6 },
  { sun: 4.5, cloud: 2, ember: 3, rain: 0.5 },
  { sun: 4.5, cloud: 2, rain: 3, ember: 0.5 },
  { snow: 5, cloud: 2.5, sun: 2.5, ember: 0.3 },
  { snow: 6, cloud: 3, sun: 1, ember: 0.6 },
  { ember: 6, cloud: 2.5, sun: 2, rain: 0.2 }, // かざん
  { cloud: 4, rain: 3, sun: 2.5, ember: 0.1 }, // いせき（くもり = きりが深い）
]
/** 天気ごとの「目標」（強さは World.wx が なめらかに近づく） */
const WX: Record<Weather, { rain: number; snow: number; ember: number; wind: number; cloud: number; grey: number; mist: number }> = {
  sun: { rain: 0, snow: 0, ember: 0, wind: 0.22, cloud: 1, grey: 0, mist: 0 },
  cloud: { rain: 0, snow: 0, ember: 0, wind: 0.42, cloud: 0.5, grey: 0.55, mist: 0.2 },
  rain: { rain: 1, snow: 0, ember: 0, wind: 0.8, cloud: 0, grey: 0.85, mist: 0.35 },
  snow: { rain: 0, snow: 1, ember: 0, wind: 0.45, cloud: 0.15, grey: 0.45, mist: 0.3 },
  ember: { rain: 0, snow: 0, ember: 1, wind: 0.95, cloud: 0.2, grey: 0.1, mist: 0 },
}
/** 空気の色（くもり・あめ・ゆき・ひのこ） */
const WX_TINT: Record<Weather, string | null> = { sun: null, cloud: '#9aa3ad', rain: '#7f8c9c', snow: '#e8eef8', ember: '#b8603a' }
const EMBER_SUN = new THREE.Color('#ff7a3a')
const TMP = new THREE.Color()
/** にじの長さ（秒） */
const BOW_LEN = 30
const MAX_FRIENDS = 5
/** 色ちがいの出やすさ（ふつう 3% / ふしぎなたまご 8%） */
const RARE_RATE = 0.03
const RARE_RATE_LUCKY = 0.08

export class World {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(42, RES.w / RES.h, 0.1, 160)
  private readonly rtScene = new THREE.WebGLRenderTarget(SCENE.w, SCENE.h, { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter })
  private readonly rtOut = new THREE.WebGLRenderTarget(OUT.w, OUT.h, { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter })
  private readonly hud = document.createElement('canvas')
  private readonly hudCtx: CanvasRenderingContext2D
  private readonly hudTex: THREE.CanvasTexture
  private readonly post: THREE.ShaderMaterial
  private readonly postScene = new THREE.Scene()
  private readonly postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  private readonly hemi = new THREE.HemisphereLight()
  private readonly sun = new THREE.DirectionalLight()
  private stage!: Stage
  stageIndex = 0
  private creatures: Creature[] = []
  pet!: Creature
  private foods: Food[] = []
  private items: Item[] = []
  /** 画質「低」：置き物の光源を作らない */
  private lowQ = false
  private sucks: Suck[] = []
  /** 遊んでいるおもちゃ / すべりだいを すべっている進み具合（0〜1） */
  private playAt = new WeakMap<Creature, Item>()
  private rideT = new WeakMap<Creature, number>()
  /** 買った直後に コインの横へ出す「-30」 */
  private coinPop = { t: 0, n: 0 }
  private eggs: Egg[] = []
  private popups: Popup[] = []
  private fx: Fx[] = []
  private fxSheets = FX_SHEETS()
  private eggSheets = Object.fromEntries((Object.keys(EGG_COLORS) as EggKind[]).map((k) => [k, EGG_SHEET(k)])) as Record<EggKind, ReturnType<typeof EGG_SHEET>>
  private wildEggT = 45
  private shadowGeo = new THREE.CircleGeometry(0.5, 10).rotateX(-Math.PI / 2)
  private shadowMat = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3, depthWrite: false })

  cursor = -1
  /** 眺めるモード：文字やアイコンを全部かくす */
  cleanView = false
  private messages: string[] = []
  private msgT = 0
  private showStatus = false
  private shopOpen = false
  private shopCursor = 0
  private banner = 0
  night = 0
  private nightTarget = 0
  private time = 0
  private foodT = 0
  private breedT = 0
  private breedCd = 30
  private incomeT = 0
  private saveT = 0
  private respawn: { id: SpeciesId; t: number }[] = []
  private shots: Shot[] = []
  private rings: Ring[] = []
  private later: Later[] = []
  private orbSheets = new Map<string, ReturnType<typeof iconSheet>>()
  private resources: Res[] = []
  private houses: House[] = []
  private structs: Struct[] = []
  /** 当たった瞬間のわずかな止まり（ヒットストップ） */
  private hitStop = 0
  /** 「動きをへらす」：画面ゆれ・フラッシュ・ヒットストップ・ぷにぷにを弱める（main.ts の設定から切り替える） */
  reducedMotion = false
  private ambient: { s: SpriteAnim; kind: 'bf' | 'ff' | 'ice'; cx: number; cz: number; r: number; ph: number; sp: number; y: number; bx: number; by: number }[] = []
  private army: Army | null = null
  private armyCd = 180
  private armyWave = 0
  private villageSeen = 0
  private villageT = 0
  private rockTex: THREE.Texture | null = null
  private barkTex: THREE.Texture | null = null
  private resT = 0
  private nightSpawnT = 0
  weather: Weather = 'sun'
  private weatherT = 50
  private weatherDim = 1
  /** 雨・雪・火の粉・しぶき・もや（fxprops.ts） */
  private wfx!: WeatherFx
  /**
   * なめらかに変わる天気の強さ（0〜1）。天気が変わる時は粒・光・空・地面がこの値で ゆっくり入れかわる。
   * wet = 地面のぬれ（雨で上がり、止むとかわく）/ cover = 雪の積もり（降ると増え、止むと溶ける）/ bow = にじ
   */
  readonly wx = { rain: 0, snow: 0, ember: 0, wind: 0.22, cloud: 1, grey: 0, mist: 0, wet: 0, cover: 0, bow: 0, bowT: 0 }
  private tintC = new THREE.Color('#9aa3ad')
  private tintK = 0
  /** 朝（もやが出る）。main.ts の時間帯から setDayPart で入る */
  private morning = false
  /** 画質（高 = 影・波紋・雲の影・もや・草のゆれ まで / 低 = 粒を減らして切る）。main.ts の applyQuality から */
  high = true
  private warp = 0
  private warpSwitched = true
  private flash = 0
  private look = new THREE.Vector3()
  coins = 50
  care: Record<Care, number> = { power: 0, guard: 0, spirit: 0 }
  xp = 0
  stats = { trains: 0, wins: 0, mood: 80, born: Date.now(), children: 0, gen: 1, petAge: 0, lineage: [] as string[] }
  /** かいたく（0 = 20 / 1 = 26 / 2 = 32）*/
  land = 0
  /** ずかん：1 = みつけた / 2 = なかまにした */
  dex: Record<string, 1 | 2> = {}
  /** ずかん（色ちがい）：1 = みつけた / 2 = なかまにした（dex とは別に記録する） */
  dexRare: Record<string, 1 | 2> = {}
  private dexClaimed = 0
  private dexNew: string[] = []
  private dexMsgT = 6
  private oldWarned = false
  private retiring = false
  private roleT = 0
  /** 視点：top = 見下ろし / behind = ペットの少し後ろ / eye = ペットの目線 */
  view: 'top' | 'behind' | 'eye' = 'top'
  /** ピンチで寄る・引く（1 = ふつう） */
  camZoom = 1
  /** 2 本指ドラッグ：みおろしは前後左右のずらし、うしろ・めせんは向きと高さ */
  private camPan = new THREE.Vector2()
  private shake = 0
  private petYaw = 0
  private camYaw = 0
  private petLast = new THREE.Vector2()
  onSfx: (s: Sfx) => void = () => {}

  constructor(style: 'sprite' | 'model' = 'sprite') {
    this.style = style
    this.hud.width = RES.w
    this.hud.height = RES.h
    this.hudCtx = this.hud.getContext('2d')!
    this.hudTex = new THREE.CanvasTexture(this.hud)
    this.hudTex.magFilter = THREE.NearestFilter
    this.hudTex.minFilter = THREE.NearestFilter
    this.post = makePostMaterial(this.rtScene.texture, this.hudTex)
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post))
    this.scene.add(this.hemi, this.sun)
    this.wfx = new WeatherFx()
    this.scene.add(this.wfx.group)
    if (!this.load()) {
      this.loadStage(0)
      this.pet = this.spawn('mebu', 'pet', 0, 1.5)
      this.say('メブが うまれた！')
    }
    document.addEventListener('visibilitychange', () => document.hidden && this.save())
  }

  /** 液晶に貼る最終テクスチャ */
  get texture() {
    return this.rtOut.texture
  }

  // ================= ステージ =================
  private loadStage(i: number) {
    if (this.stage) {
      this.scene.remove(this.stage.group)
      this.stage.dispose()
    }
    // ペットと仲間は一緒にワープする。野生は置いていく
    for (const c of this.creatures.filter((c) => c.team === 'wild')) this.remove(c)
    this.creatures = this.creatures.filter((c) => c.team !== 'wild')
    for (const f of [...this.foods]) this.removeFood(f)
    for (const it of this.items) this.unmountItem(it)
    for (const e of this.eggs) this.scene.remove(e.anim.sprite, e.shadow)
    this.eggs = []
    this.respawn = []
    for (const r of this.resources) this.scene.remove(r.mesh)
    this.resources = []
    for (const sh of this.shots) this.scene.remove(sh.sprite)
    for (const r of this.rings) this.scene.remove(r.mesh)
    this.shots = []
    this.rings = []
    for (const sk of this.sucks) {
      this.scene.remove(sk.anim.sprite)
      sk.anim.dispose()
    }
    this.sucks = []
    this.later = []
    for (const h of this.houses) this.unmountHouse(h)
    for (const st of this.structs) this.unmountStruct(st)
    this.army = null
    this.picked = null
    for (const c of this.creatures) c.site = null
    for (const c of this.creatures) this.dropCarry(c, false)
    this.stageIndex = i
    this.stage = STAGES[i]()
    const s = this.stage
    this.scene.add(s.group)
    fxLod(s.group, this.high)
    this.wfx.setGround(s.heightAt, SIZE, s.obstacles.filter((o) => o.water))
    this.scene.fog = new THREE.Fog(s.fog, ...(s.fogRange ?? [14, 34]))
    this.hemi.color.set(s.hemi[0])
    this.hemi.groundColor.set(s.hemi[1])
    this.sun.color.set(s.sun.color)
    this.sun.position.set(...s.sun.dir)
    this.applyLight()
    for (const it of this.items) if (it.stage === i) this.mountItem(it)
    // 野生の持ち主はいなくなるので、その家は空き家になる（だれかが住みつく）
    for (const h of this.houses) {
      if (h.owner && h.owner.team === 'wild') h.owner = null
      if (h.stage === i) this.mountHouse(h)
    }
    for (const st of this.structs) if (st.stage === i) this.mountStruct(st)
    this.armyCd = 150
    this.calcVillage()
    this.villageSeen = this.vLv
    for (let k = 0; k < 5; k++) this.spawnResource()
    this.setWeather(this.pickWeather(), true)
    s.residents.forEach((id) => {
      if (id === 'noiz' && this.hasItem('charm') && Math.random() < 0.7) return
      const p = this.freePos(3)
      this.spawn(enemyFor(id, i), 'wild', p.x, p.z)
    })
    for (let k = 0; k < 3; k++) this.dropFood()
    let k = 0
    for (const c of this.creatures) {
      c.x = (k % 3) - 1
      c.z = 1.5 + Math.floor(k / 3) * 0.8
      c.foe = null
      c.food = null
      this.setState(c, 'happy', 1.5)
      k++
    }
    this.makeAmbient()
    this.banner = 3.5
  }

  // ================= ちょうちょ・ほたる =================
  private makeAmbient() {
    for (const a of this.ambient) {
      this.scene.remove(a.s.sprite)
      a.s.dispose()
    }
    this.ambient = []
    const bfSheets = ['#ffd23f', '#ff8fb1', '#9fd8ff', '#ffffff', '#b48cff'].map((col) => iconSheet(['.....', 'oo.oo', 'ooxoo', 'oo.oo', '.....'], { o: col, x: '#3d2a1e' }))
    const ff = iconSheet(['.....', '..o..', '.ooo.', '..o..', '.....'], { o: '#d8ff7a' })
    const ice = iconSheet(['.....', '..o..', '.ooo.', '..o..', '.....'], { o: this.stageIndex === 5 ? '#ffb347' : '#aef0ff' })
    for (let i = 0; i < 12; i++) {
      const kind: 'bf' | 'ff' | 'ice' = this.stageIndex === 4 || this.stageIndex === 5 ? 'ice' : i < 7 ? 'bf' : 'ff'
      const sheet = kind === 'bf' ? bfSheets[i % bfSheets.length] : kind === 'ff' ? ff : ice
      const s = new SpriteAnim(sheet, kind === 'bf' ? 0.32 : kind === 'ff' ? 0.3 : 0.22)
      s.sprite.center.set(0.5, 0.5)
      s.sprite.visible = false
      this.scene.add(s.sprite)
      this.ambient.push({ s, kind, cx: (Math.random() * 2 - 1) * HALF * 0.8, cz: (Math.random() * 2 - 1) * HALF * 0.8, r: 0.8 + Math.random() * 1.6, ph: Math.random() * 10, sp: 0.5 + Math.random() * 0.6, y: 0.7 + Math.random() * 0.8, bx: s.sprite.scale.x, by: s.sprite.scale.y })
    }
  }

  private updateAmbient(dt: number) {
    const calm = this.weather === 'sun' || this.weather === 'cloud'
    const beds = this.items.filter((it) => it.stage === this.stageIndex && it.kind === 'flowerbed' && it.mesh)
    for (const a of this.ambient) {
      const show = a.kind === 'bf' ? this.night < 0.4 && calm : a.kind === 'ff' ? this.night > 0.5 && this.weather !== 'rain' : this.weather !== 'ember'
      a.s.sprite.visible = show
      if (!show) continue
      a.cx += Math.sin(this.time * 0.13 + a.ph) * dt * 0.4
      a.cz += Math.cos(this.time * 0.11 + a.ph) * dt * 0.4
      // はなだんの ちかくへ ちょうちょが あつまる
      if (a.kind === 'bf' && beds.length) {
        const bed = beds[Math.floor(a.ph) % beds.length]
        a.cx += (bed.x - a.cx) * dt * 0.35
        a.cz += (bed.z - a.cz) * dt * 0.35
        a.r = Math.min(a.r, 0.9)
      }
      a.cx = THREE.MathUtils.clamp(a.cx, -HALF, HALF)
      a.cz = THREE.MathUtils.clamp(a.cz, -HALF, HALF)
      const t = this.time * a.sp + a.ph
      const x = a.cx + Math.cos(t) * a.r
      const z = a.cz + Math.sin(t * 1.3) * a.r
      a.s.sprite.position.set(x, this.stage.heightAt(x, z) + a.y + Math.sin(t * 2.3) * 0.15, z)
      if (a.kind === 'bf') a.s.sprite.scale.x = a.bx * (0.35 + 0.65 * Math.abs(Math.sin(this.time * 13 + a.ph)))
      else a.s.sprite.scale.setScalar(a.bx * (0.7 + 0.5 * Math.sin(this.time * 5 + a.ph * 3)))
    }
  }

  private applyLight(dt = 0.03) {
    const s = this.stage
    const k = (1 - this.night * 0.68) * this.weatherDim
    this.hemi.intensity = s.hemi[2] * k
    this.sun.intensity = s.sun.intensity * k
    const fog = this.scene.fog as THREE.Fog
    fog.color.set(s.fog)
    // 天気で空気の色を変える（色も強さも なめらかに追いかける）
    const tint = WX_TINT[this.weather]
    const k2 = 1 - Math.exp(-dt * 0.9)
    if (tint) this.tintC.lerp(TMP.set(tint), k2)
    const tk = tint ? (1 - this.weatherDim) * 1.6 + (this.weather === 'snow' ? 0.35 : 0) : 0
    this.tintK += (tk - this.tintK) * k2
    if (this.tintK > 0.001) fog.color.lerp(this.tintC, Math.min(1, this.tintK))
    fog.color.multiplyScalar(1 - this.night * 0.7)
    // 朝もや・雨・ゆきで、遠くがかすむ
    fog.near = 14 - 5 * this.wx.mist
    fog.far = 34 - 8 * this.wx.mist
    this.sun.color.set(s.sun.color)
    this.hemi.color.set(s.hemi[0])
    if (this.wx.ember > 0.001) {
      this.sun.color.lerp(EMBER_SUN, 0.55 * this.wx.ember)
      this.hemi.color.lerp(EMBER_SUN, 0.35 * this.wx.ember)
    }
    this.scene.background = fog.color
  }

  // ================= 生き物 =================
  private spawn(id: SpeciesId, team: Team, x: number, z: number, grow = 0, look?: { seed: number; rare: boolean }): Creature {
    const sp = SPECIES[id]
    // 個体差：もようと色のゆらぎのシード。なかまになれる種族は約 3% で色ちがい（ボスは いつもの姿）
    const seed = sp.boss ? 0 : look?.seed ?? newSeed()
    const rare = sp.tier > 0 && (look ? look.rare : Math.random() < RARE_RATE)
    const anim = this.makeView(id, sp.height, variantOf(seed, rare))
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat)
    this.scene.add(anim.sprite, shadow)
    const c: Creature = {
      sp, team, anim, shadow, x, z, jy: 0, vy: 0, kx: 0, kz: 0,
      hp: sp.hp, maxHp: sp.hp, atk: sp.atk, hunger: 60 + Math.random() * 40, energy: 60 + Math.random() * 40,
      state: 'idle', t: Math.random() * 2, tx: x, tz: z, foe: null, food: null, cd: 0, lunge: 0, hurt: 0, fx: 0,
      phase: Math.random() * 10, affinity: 0, grow,
      xp: 0, care: { power: 0, guard: 0, spirit: 0 }, bias: (['power', 'guard', 'spirit'] as Care[])[Math.floor(Math.random() * 3)],
      spar: false, carry: null, carryMesh: null, res: null, raid: null, inside: false,
      skillCd: 3 + Math.random() * 5, cheer: false, sleepFrom: null, site: null, army: false, squash: 0, pj: 0, finish: null, role: 'free', tendTo: null, lx: x, lz: z, mvT: 0, stuck: 0, detourN: 0, detour: null, avoid: Math.random() < 0.5 ? 1 : -1,
      seed, rare, evo: null, glint: 1 + Math.random() * 2,
    }
    this.creatures.push(c)
    this.burst(x, this.ground(c) + 0.5, z, 'cube', 8, 2)
    return c
  }

  /** キャラの見た目：'sprite' = 2.5D ドット絵 / 'model' = 3D ポリゴン */
  style: 'sprite' | 'model' = 'sprite'
  private makeView(id: SpeciesId, h: number, variant = 0): MonsterView {
    return this.style === 'model' && hasModel(id) ? new MonsterModel(id, h) : new SpriteMonster(id, h, variant)
  }
  /** スプライトの種類（もよう 0〜7 + 色ちがい 8） */
  private variant(c: Creature) {
    return variantOf(c.seed, c.rare)
  }
  /** なまえ（色ちがいは ★ がつく） */
  private nm(c: Creature) {
    return (c.rare ? '★' : '') + c.sp.name
  }
  setStyle(style: 'sprite' | 'model') {
    if (style === this.style) return
    this.style = style
    for (const c of this.creatures) {
      if (c.evo) {
        if (!c.evo.said) this.evolved(c, SPECIES[c.evo.from].name)
        c.evo = null
      }
      const old = c.anim
      this.scene.remove(old.sprite)
      old.dispose()
      c.anim = this.makeView(c.sp.id, this.size(c), this.variant(c))
      c.anim.facing = old.facing
      c.anim.sprite.visible = old.sprite.visible
      this.scene.add(c.anim.sprite)
    }
  }

  private remove(c: Creature) {
    this.dropCarry(c, false)
    for (const h of this.houses) if (h.owner === c) h.owner = null
    this.scene.remove(c.anim.sprite, c.shadow)
    c.anim.dispose()
  }

  private alive(c: Creature | null): c is Creature {
    return !!c && c.state !== 'dead' && c.state !== 'faint' && this.creatures.includes(c)
  }

  private ally(c: Creature) {
    return c.team === 'pet' || c.team === 'friend'
  }

  private size(c: Creature) {
    return c.sp.height * (c.grow > 0 ? 0.55 + 0.45 * c.grow : 1)
  }

  private ground(c: Creature) {
    return this.stage.heightAt(c.x, c.z) + (c.sp.float ? 0.35 + Math.sin(this.time * 2 + c.phase) * 0.12 : 0)
  }

  /**
   * 目的地へ歩く。木・岩・さく・かべ・建物をよけながら進み、ひっかかったら回りこむ。
   * 戻り値 = 目的地までの距離。hold = 目的地のすぐそばで立ち止まっている（ひっかかり判定をしない）
   */
  private moveTo(c: Creature, tx: number, tz: number, speed: number, dt: number, hold = false) {
    const dReal = Math.hypot(tx - c.x, tz - c.z)
    if (dReal < 0.05) {
      c.stuck = 0
      c.detour = null
      return dReal
    }
    // ひっかかり検知：0.5 秒ごとに進んだ距離を見て、ほとんど動けていなければ回りこむ・あきらめる
    c.mvT += dt
    if (hold) {
      c.stuck = 0
      c.mvT = 0
    } else if (c.mvT > 0.5) {
      const moved = Math.hypot(c.x - c.lx, c.z - c.lz)
      c.lx = c.x
      c.lz = c.z
      c.mvT = 0
      if (moved < speed * 0.5 * 0.3) c.stuck++
      else {
        c.stuck = 0
        if (c.detour && c.detour.t <= 0) c.detour = null
      }
      if (c.stuck >= 2 && !c.detour) {
        // 進行方向に対して横へ回りこむ。うまくいかないたびに、遠くまで回る（長いかべ・さくの輪の外へ出る）
        c.detourN++
        const dist = Math.min(11, 2.2 + c.detourN * 2.6)
        const ux = (tx - c.x) / dReal
        const uz = (tz - c.z) / dReal
        const obs = this.obstacles()
        for (const sd of [c.avoid, -c.avoid]) {
          const wx = THREE.MathUtils.clamp(c.x - uz * sd * dist + ux * 0.8, -HALF, HALF)
          const wz = THREE.MathUtils.clamp(c.z + ux * sd * dist + uz * 0.8, -HALF, HALF)
          if (!obs.some((o) => Math.hypot(o.x - wx, o.z - wz) < o.r + 0.5)) {
            c.detour = { x: wx, z: wz, t: dist / Math.max(0.5, speed) * 1.4 + 0.8 }
            c.avoid = sd as 1 | -1
            break
          }
        }
        if (!c.detour) c.avoid = (c.avoid * -1) as 1 | -1
        if (c.detourN === 3) c.avoid = (c.avoid * -1) as 1 | -1
        c.stuck = 0
      } else if (c.detourN >= 5 && c.stuck >= 2) {
        // 何度回りこんでも進めない：その作業はあきらめる
        c.stuck = 0
        c.detour = null
        this.dropCarry(c, true)
        if (c.res) c.res.taken = null
        c.res = null
        c.site = null
        c.tendTo = null
        c.raid = null
        this.setState(c, 'idle', 0.4)
        return 99
      }
    }
    if (c.detour) {
      c.detour.t -= dt
      if (c.detour.t <= 0 || Math.hypot(c.detour.x - c.x, c.detour.z - c.z) < 0.4) c.detour = null
    }
    const gx = c.detour ? c.detour.x : tx
    const gz = c.detour ? c.detour.z : tz
    const dx = gx - c.x
    const dz = gz - c.z
    const d = Math.hypot(dx, dz) || 1
    // 坂道を登るときは少し遅くなる
    const slope = this.stage.heightAt(c.x + (dx / d) * 0.3, c.z + (dz / d) * 0.3) - this.stage.heightAt(c.x, c.z)
    const step = Math.min(d, speed * dt * (slope > 0 ? Math.max(0.55, 1 - slope * 1.5) : 1))
    // 進む先にある物を、横へそれてよける（まっすぐ当たる時は、その子がいつも使う側へ）
    const bx = dx / d
    const bz = dz / d
    let ux = bx
    let uz = bz
    for (const o of this.obstacles()) {
      if (o.water && c.sp.float) continue
      const vx = o.x - c.x
      const vz = o.z - c.z
      const ahead = vx * bx + vz * bz
      if (ahead <= -0.2 || ahead > 2.4 || ahead > d + o.r) continue
      const cross = bx * vz - bz * vx // 物が進行方向の左(+)か右(-)か
      const side = Math.abs(cross)
      const clear = o.r + 0.75
      if (side < clear) {
        // 物がある側と反対へ、進行方向に直角に曲がる
        const dir = side > 0.08 ? (cross > 0 ? -1 : 1) : c.avoid
        const k = (1 - side / clear) * 2.6 * (ahead > 0 ? 1 : 0.4)
        ux += -bz * dir * k
        uz += bx * dir * k
      }
    }
    const ul = Math.hypot(ux, uz) || 1
    c.x += (ux / ul) * step
    c.z += (uz / ul) * step
    if (Math.abs(ux) > 0.05) c.anim.facing = ux > 0 ? 1 : -1
    return dReal
  }

  /** ステージの障害物 + 置き物。1 フレームに何十回も呼ばれるので、フレームごとに 1 回だけ組み立てて使いまわす（個数が変わったら作り直す） */
  private obsCache: { x: number; z: number; r: number; water?: boolean }[] = []
  private obsKey = ''
  private obsTick = -1
  private obsFrame = 0
  private obstacles() {
    const key = `${this.obsFrame}|${this.stageIndex}|${this.items.length}|${this.houses.length}|${this.structs.length}|${this.stage.obstacles.length}`
    if (key === this.obsKey && this.obsTick === this.obsFrame) return this.obsCache
    this.obsKey = key
    this.obsTick = this.obsFrame
    const extra = this.items
      .filter((it) => it.stage === this.stageIndex && ITEM_SPEC[it.kind].r > 0 && (it.kind !== 'sapling' || it.grow >= 1))
      .map((it) => ({ x: it.x, z: it.z, r: ITEM_SPEC[it.kind].r, water: false }))
    const homes = this.houses.filter((h) => h.stage === this.stageIndex && h.level >= 1).map((h) => ({ x: h.x, z: h.z, r: 0.85, water: false }))
    const bridged = (o: { x: number; z: number; water?: boolean }) =>
      !!o.water && this.structs.some((b) => b.kind === 'bridge' && b.stage === this.stageIndex && b.mats >= STRUCTS.bridge.need && Math.hypot(b.x - o.x, b.z - o.z) < 0.6)
    const land = this.stage.obstacles.filter((o) => !bridged(o))
    const builds = this.structs.filter((b) => b.stage === this.stageIndex && STRUCTS[b.kind].r > 0 && b.mesh).map((b) => ({ x: b.x, z: b.z, r: STRUCTS[b.kind].r, water: false }))
    this.obsCache = [...land, ...extra, ...homes, ...builds]
    return this.obsCache
  }

  private collide(c: Creature) {
    for (const o of this.obstacles()) {
      if (o.water && c.sp.float) continue
      const dx = c.x - o.x
      const dz = c.z - o.z
      const min = o.r + 0.3
      const d = Math.hypot(dx, dz)
      if (d < min && d > 0) {
        c.x = o.x + (dx / d) * min
        c.z = o.z + (dz / d) * min
      }
    }
    for (const o of this.creatures) {
      if (o === c || o.state === 'dead') continue
      const dx = c.x - o.x
      const dz = c.z - o.z
      const d = Math.hypot(dx, dz)
      const min = c.state === 'fight' && o === c.foe ? 0.55 : 0.7
      if (d < min && d > 0) {
        c.x += (dx / d) * (min - d) * 0.5
        c.z += (dz / d) * (min - d) * 0.5
      }
    }
    c.x = THREE.MathUtils.clamp(c.x, -HALF, HALF)
    c.z = THREE.MathUtils.clamp(c.z, -HALF, HALF)
  }

  private setState(c: Creature, s: State, t = 0) {
    if (s === 'sleep' && c.state !== 'sleep') c.sleepFrom = { e: c.energy, h: c.hp }
    c.state = s
    c.t = t
    c.detourN = 0
    c.stuck = 0
  }

  private item(kind: ItemKind) {
    return this.items.find((it) => it.kind === kind && it.stage === this.stageIndex && it.mesh)
  }
  private hasItem(kind: ItemKind) {
    return this.items.some((it) => it.kind === kind && it.stage === this.stageIndex)
  }

  /** 何をするか決める（お腹・眠気・性格・まわりの状況・置き物から） */
  private think(c: Creature) {
    const wild = c.sp.temper === 'wild'
    const p = this.pet
    // 敵軍：近くの味方がいれば戦い、いなければ建物を目指して進む
    if (c.army) {
      const prey = this.nearest(c, (o) => this.ally(o) || o.sp.temper === 'calm', 3.2)
      if (prey) {
        c.foe = prey
        return this.setState(c, 'hunt', 6)
      }
      return this.setState(c, 'march', 8)
    }
    // 敵軍が攻めてきたら、ペットと仲間は迎えうつ
    if (this.army?.phase === 'on' && !wild && c.team !== 'wild' && c.grow === 0 && c.hp > c.maxHp * 0.4 && c.energy > 15) {
      const foe = this.nearest(c, (o) => o.army, 10)
      if (foe) {
        c.foe = foe
        return this.setState(c, 'hunt', 8)
      }
    }
    // 家をこわしたがる敵（ゴウガン）・ひのこの日の敵は家をねらう
    if (wild && c.energy > 25 && (c.sp.habit === 'raid' || (this.weather === 'ember' && Math.random() < 0.3) || Math.random() < 0.08)) {
      const h = this.nearestHouse(c, (h) => h.level >= 1, c.sp.habit === 'raid' ? 14 : 7)
      if (h) {
        c.raid = h
        return this.setState(c, 'raid', 16)
      }
    }
    if (wild && c.energy > 25) {
      const range = this.hasItem('charm') ? 2.2 : 4.5
      const prey = this.nearest(c, (o) => this.ally(o) || o.sp.temper === 'calm', range)
      if (prey) {
        c.foe = prey
        return this.setState(c, 'hunt', 6)
      }
    }
    // 仲間：ペットが戦っていたら助けに行く
    if (c.team === 'friend' && c.grow === 0 && p.state === 'fight' && this.alive(p.foe) && Math.hypot(p.x - c.x, p.z - c.z) < 7) {
      c.foe = p.foe
      return this.setState(c, 'assist', 8)
    }
    if (c.team === 'pet' && c.hp > c.maxHp * 0.5 && c.energy > 30) {
      const enemy = this.nearest(c, (o) => o.sp.temper === 'wild', 3)
      if (enemy) {
        c.foe = enemy
        return this.setState(c, 'hunt', 6)
      }
    }
    // みはり：持ち場の近くの敵は、すこし遠くからでも見つけて追いはらう
    if (c.role === 'guard' && c.hp > c.maxHp * 0.4 && c.energy > 20) {
      const foe = this.nearest(c, (o) => o.sp.temper === 'wild' && !o.inside, 7)
      if (foe) {
        c.foe = foe
        return this.setState(c, 'hunt', 8)
      }
    }
    // 雨・ひのこ・夜は自分の家に入って休む
    const home = this.homeOf(c)
    if (!wild && home && home.level >= 2 && (this.weather === 'rain' || this.weather === 'ember' || this.night > 0.5) && Math.random() < 0.7) {
      c.tx = home.x
      c.tz = home.z + 0.95
      c.inside = true
      return this.setState(c, 'rest', 10)
    }
    // じゃれあいバトル：おとなしい子どうしも、ときどき勝手に力くらべをする
    if (!wild && c.grow === 0 && c.energy > 55 && c.hp > c.maxHp * 0.7 && Math.random() < (c.team === 'pet' ? 0.03 : 0.08)) {
      const rival = this.nearest(
        c,
        (o) => o.sp.temper === 'calm' && o.grow === 0 && o.hp > o.maxHp * 0.6 && o.state !== 'fight' && o.state !== 'sleep' && !o.inside,
        3.5,
      )
      if (rival) {
        c.foe = rival
        c.spar = true
        return this.setState(c, 'hunt', 6)
      }
    }
    if (c.hunger < 45 && !wild) {
      const f = this.foods
        .filter((f) => f.landed && !f.taken)
        .sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0]
      if (f) {
        f.taken = c
        c.food = f
        return this.setState(c, 'seek', 10)
      }
    }
    if (c.energy < 20 || (this.night > 0.5 && Math.random() < 0.5)) {
      // たき火があればそのそばで眠る
      const fire = this.item('fire')
      if (fire && !wild) {
        const a = Math.random() * Math.PI * 2
        c.tx = fire.x + Math.cos(a) * (0.9 + Math.random() * 0.6)
        c.tz = fire.z + Math.sin(a) * (0.9 + Math.random() * 0.6)
        return this.setState(c, 'rest', 8)
      }
      // ベンチがあればそこで休む（げんきが はやく もどる）
      const bench = wild ? null : this.nearestItem('bench', c.x, c.z, 14)
      if (bench) return this.restAtBench(c, bench)
      return this.setState(c, 'sleep', 6 + Math.random() * 6)
    }
    // すこし疲れたら、ベンチで ひと休み
    if (!wild && c.energy < 45 && Math.random() < 0.35) {
      const bench = this.nearestItem('bench', c.x, c.z, 10)
      if (bench) return this.restAtBench(c, bench)
    }
    // おもちゃ（ボール・すべりだい・ぬいぐるみ）で遊ぶ
    const toy = wild ? null : this.playToy(c)
    if (toy && c.energy > 40 && Math.random() < toy.p) {
      this.playAt.set(c, toy.it)
      this.rideT.delete(c)
      return this.setState(c, 'play', toy.it.kind === 'slide' ? 9 : 6)
    }
    // よるは ランタンのまわりに あつまる
    if (!wild && this.night > 0.5 && Math.random() < 0.4) {
      const lamp = this.nearestItem('lantern', c.x, c.z, 14)
      if (lamp) {
        const a = Math.random() * Math.PI * 2
        c.tx = lamp.x + Math.cos(a) * (0.8 + Math.random() * 0.9)
        c.tz = lamp.z + Math.sin(a) * (0.8 + Math.random() * 0.9)
        return this.setState(c, 'wander', 5)
      }
    }
    // はたけがかり：はたけの世話をして、みのりを早める
    if (c.role === 'farmer' && c.energy > 25 && Math.random() < 0.5) {
      const farm = this.structs.find((b) => b.stage === this.stageIndex && b.kind === 'farm' && this.structDone(b))
      if (farm) {
        c.tendTo = farm
        return this.setState(c, 'tend', 12)
      }
    }
    // 家づくり：資材を集めて自分の家を建てる・直す
    if (!wild && c.grow === 0 && c.energy > 30 && Math.random() < (c.role === 'builder' ? 0.95 : c.role === 'free' ? 0.85 : 0.5)) {
      let h = home
      if (!h) h = this.claimHouse(c)
      const site = this.openSite(c)
      const wantHouse = !!h && (h.level < 4 || h.hp < houseMaxHp(h.level))
      if (site || wantHouse) {
        const r = this.resources
          .filter((r) => !r.taken)
          .sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0]
        if (r && Math.hypot(r.x - c.x, r.z - c.z) < 14) {
          r.taken = c
          c.res = r
          c.site = site && (!wantHouse || c.role === 'builder' || Math.random() < 0.7) ? site : null
          return this.setState(c, 'gather', 14)
        }
      }
    }
    // いたずら：ちからの強い野生の子は、ほかの子の家を少しこわすことがある
    if (wild === false && c.team === 'wild' && c.care.power > c.care.guard + 2 && Math.random() < 0.04) {
      const h = this.nearestHouse(c, (h) => h.level >= 1 && h.owner !== c, 6)
      if (h) {
        c.raid = h
        return this.setState(c, 'raid', 6)
      }
    }
    // あいさつ：近くの子どうしが、ときどき ぴょんと挨拶する
    if (!wild && c.grow === 0 && Math.random() < 0.1) {
      const b = this.nearest(c, (o) => !o.army && o.grow === 0 && o.sp.temper === 'calm' && (o.state === 'idle' || o.state === 'wander') && (o.team === 'wild') === (c.team === 'wild'), 2)
      if (b) {
        c.anim.facing = b.x > c.x ? 1 : -1
        b.anim.facing = c.x > b.x ? 1 : -1
        this.burst((c.x + b.x) / 2, this.ground(c) + this.size(c) + 0.2, (c.z + b.z) / 2, 'heart', 2, 1)
        this.popups.push({ pos: new THREE.Vector3(c.x, this.ground(c) + this.size(c) + 0.3, c.z), text: 'やあ！', color: '#ffd0e6', t: 0 })
        this.setState(c, 'happy', 1.1)
        this.setState(b, 'happy', 1.1)
        return
      }
    }
    if (c.energy < 28 && c.state !== 'sleep' && Math.random() < 0.25)
      this.popups.push({ pos: new THREE.Vector3(c.x, this.ground(c) + this.size(c) + 0.3, c.z), text: 'ふぁ…', color: '#9fd8ff', t: 0 })
    // みはり：みはりとう・おしろのそばで見まわる
    if (c.role === 'guard' && Math.random() < 0.7) {
      const post = this.guardPost(c)
      if (post) {
        if (Math.hypot(post.x - c.x, post.z - c.z) > 2.4) {
          c.tx = post.x + (Math.random() - 0.5) * 1.6
          c.tz = post.z + 1.5 + Math.random()
          return this.setState(c, 'wander', 4)
        }
        c.anim.facing = Math.random() < 0.5 ? 1 : -1
        return this.setState(c, 'idle', 3 + Math.random() * 3)
      }
    }
    // 仲間はペットのそばを離れすぎない
    if (c.team === 'friend' && Math.hypot(p.x - c.x, p.z - c.z) > 3.5) {
      c.tx = p.x + (Math.random() - 0.5) * 2.5
      c.tz = p.z + (Math.random() - 0.5) * 2.5
      return this.setState(c, 'wander', 3)
    }
    const r = Math.random()
    if (r < 0.6) {
      const q = this.freePos(0, c.x, c.z, 4)
      c.tx = q.x
      c.tz = q.z
      this.setState(c, 'wander', 2 + Math.random() * 3)
    } else if (r < 0.9) this.setState(c, 'idle', 1 + Math.random() * 2.5)
    else this.setState(c, 'happy', 1.2)
  }

  /** ベンチのまえで ひと休み（着いたら 眠る。ベンチの近くだと回復が はやい） */
  private restAtBench(c: Creature, bench: Item) {
    const p = this.itemLocal(bench, (Math.random() - 0.5) * 0.9, 0.78)
    c.tx = p.x
    c.tz = p.z
    c.inside = false
    return this.setState(c, 'rest', 8)
  }

  private nearest(c: Creature, pred: (o: Creature) => boolean, range: number) {
    let best: Creature | null = null
    let bd = range
    for (const o of this.creatures) {
      if (o === c || !this.alive(o)) continue
      const dx = o.x - c.x
      const dz = o.z - c.z
      const d2 = dx * dx + dz * dz
      if (d2 >= bd * bd || !pred(o)) continue // 遠い子は条件の関数を呼ぶ前に外す
      bd = Math.sqrt(d2)
      best = o
    }
    return best
  }

  private startFight(a: Creature, b: Creature) {
    const spar = a.spar && a.sp.temper === 'calm' && b.sp.temper === 'calm'
    a.spar = b.spar = spar
    a.foe = b
    b.foe = a
    for (const c of [a, b]) {
      this.dropCarry(c, true)
      c.raid = null
      if (c.res) c.res.taken = null
      c.res = null
    }
    this.setState(a, 'fight')
    this.setState(b, 'fight')
    a.cd = 0.4
    b.cd = 0.9
    if (a.team === 'pet' || b.team === 'pet') {
      const other = a.team === 'pet' ? b : a
      this.say(spar ? `${other.sp.name}と じゃれあいバトル！` : `${other.sp.name}と バトル！`)
      this.onSfx('ok')
    }
    for (const c of [a, b])
      if (c.food) {
        c.food.taken = null
        c.food = null
      }
  }

  private attack(a: Creature, b: Creature) {
    a.lunge = 0.22
    const crit = Math.random() < 0.12
    // まもりの傾向が強いペットは少し硬い
    const guard = b.sp.tier > 0 ? 1 - Math.min(0.3, this.careOf(b).guard * 0.01) : 1
    const dmg = Math.max(1, Math.round(a.atk * (0.75 + Math.random() * 0.5) * (crit ? 1.8 : 1) * guard * this.bannerBoost(a)))
    b.hp -= dmg
    b.hurt = 0.28
    const dx = b.x - a.x
    const dz = b.z - a.z
    const d = Math.hypot(dx, dz) || 1
    b.kx = (dx / d) * (crit ? 7 : 4)
    b.kz = (dz / d) * (crit ? 7 : 4)
    const y = this.ground(b) + this.size(b)
    this.popups.push({ pos: new THREE.Vector3(b.x, y, b.z), text: crit ? `${dmg}!` : `${dmg}`, color: crit ? '#ffd23f' : '#ffffff', t: 0 })
    this.burst(b.x, y * 0.7, b.z, 'hit', crit ? 6 : 3, 2.5)
    if (this.ally(a) || this.ally(b)) this.onSfx(crit ? 'crit' : 'hit')
    if (crit && (this.ally(a) || this.ally(b))) this.hitStop = Math.max(this.hitStop, 0.06)
    if (b.hp <= 0) this.defeat(b, a)
  }

  private defeat(loser: Creature, winner: Creature) {
    winner.foe = null
    this.setState(winner, 'happy', 1.8)
    loser.foe = null
    // じゃれあいバトル：負けた子もたおれるだけ。どちらも少し強くなる
    if (loser.spar) {
      loser.spar = winner.spar = false
      loser.hp = 1
      this.setState(loser, 'faint', 4)
      this.addCare(winner, 'power', 1)
      this.gainXp(winner, 4)
      this.gainXp(loser, 2)
      winner.atk += 0.5
      if (this.ally(winner) || this.ally(loser)) this.say(`じゃれあいバトルは ${winner.sp.name}の かち！`)
      return
    }
    if (this.ally(loser)) {
      loser.hp = 1
      this.setState(loser, 'faint', 6)
      this.say(`${loser.sp.name}は たおれてしまった…`)
      if (loser.team === 'pet') this.onSfx('lose')
      return
    }
    this.setState(loser, 'dead', 1)
    const enemy = loser.sp.temper === 'wild'
    if (loser.sp.habit !== 'night' && !loser.army && !(enemy && this.hasItem('charm') && Math.random() < 0.6))
      this.respawn.push({ id: loser.sp.id, t: (loser.sp.habit === 'raid' ? 40 : 14) + Math.random() * 10 })
    // 勝った子は（仲間でも野生でも）それぞれ強くなる
    winner.atk += 1
    winner.maxHp += 3
    this.addCare(winner, 'power', 1)
    this.gainXp(winner, 5)
    if (this.ally(winner)) {
      const p = this.pet
      this.stats.wins++
      this.earn(10, loser.x, loser.z)
      this.say(`${winner.sp.name}の かち！ ちから+1`)
      this.onSfx('win')
      // 守ってもらった野生の子は仲良し度が上がる
      for (const o of this.creatures) if (o.team === 'wild' && o.sp.temper === 'calm' && Math.hypot(o.x - p.x, o.z - p.z) < 5) o.affinity += 25
    }
  }

  // ================= 技 =================
  private canSkill(c: Creature) {
    if (c.skillCd > 0 || c.grow > 0) return false
    // おうえんされたら必ず、ふだんは時々。強い段階ほど技を出しやすい
    return c.cheer || Math.random() < 0.3 + c.sp.tier * 0.06
  }

  private orb(color: string) {
    let sh = this.orbSheets.get(color)
    if (!sh) {
      sh = iconSheet(['.ooo.', 'oowoo', 'owwwo', 'oowoo', '.ooo.'], { o: color, w: '#ffffff' })
      this.orbSheets.set(color, sh)
    }
    return sh
  }

  /** 技名をさけんで、種族ごとの演出で攻撃する */
  private useSkill(c: Creature, f: Creature) {
    const sk = SKILLS[c.sp.id]
    c.skillCd = 7 + Math.random() * 4
    c.cheer = false
    c.lunge = 0.3
    const top = this.ground(c) + this.size(c) + 0.35
    // 技名はいつものメッセージ欄に（仲間がからむ時と、カメラの近くの時だけ）
    const near = Math.hypot(c.x - this.look.x, c.z - this.look.z) < 8
    if (this.ally(c) || this.ally(f)) {
      this.say(`${c.team === 'wild' ? 'てきの ' : ''}${c.sp.name}の ${sk.name}！`)
      this.onSfx('skill')
    } else if (near) this.say(`やせいの ${c.sp.name}の ${sk.name}！`)
    const dmg = Math.max(2, Math.round(c.atk * sk.mult * (0.9 + Math.random() * 0.2) * this.bannerBoost(c)))
    const at = (x: number, z: number, y = 0.5) => new THREE.Vector3(x, this.stage.heightAt(x, z) + y, z)
    switch (sk.kind) {
      case 'shot': {
        // 弾がまっすぐ（強い技は大きく）飛んでいく
        const n = c.sp.tier >= 3 ? 3 : 1
        for (let i = 0; i < n; i++) {
          const a = new SpriteAnim(this.orb(sk.color), c.sp.tier >= 3 ? 0.42 : 0.3)
          a.sprite.center.set(0.5, 0.5)
          const from = at(c.x, c.z, this.size(c) * 0.55)
          a.sprite.position.copy(from)
          this.scene.add(a.sprite)
          this.shots.push({ sprite: a.sprite, from, src: c, dst: f, t: -i * 0.1, dur: 0.38, dmg: i === 0 ? dmg : Math.round(dmg * 0.3), skill: sk, arc: c.sp.id === 'gorota' ? 0.8 : 0.15 })
        }
        break
      }
      case 'burst':
        // その場でまぶしく光って、まわりをはじく
        this.ring(c.x, c.z, sk.color, 2.6, 0.45)
        this.colorBurst(c.x, top - 0.3, c.z, sk.color, 16, 4)
        if (c.sp.id === 'pikori') this.flash = Math.max(this.flash, this.ally(c) ? 0.25 : 0)
        this.after(0.12, () => this.splash(c, f, dmg, 2.6))
        break
      case 'dash':
        // いきおいよく突っこむ
        c.kx = ((f.x - c.x) / (Math.hypot(f.x - c.x, f.z - c.z) || 1)) * 14
        c.kz = ((f.z - c.z) / (Math.hypot(f.x - c.x, f.z - c.z) || 1)) * 14
        for (let i = 0; i < 5; i++) this.after(i * 0.04, () => this.colorBurst(c.x, this.ground(c) + 0.4, c.z, sk.color, 3, 1))
        this.after(0.2, () => this.hitWith(c, f, dmg, sk))
        break
      case 'rain':
        // 空から星がふりそそぐ
        for (let i = 0; i < 7; i++)
          this.after(i * 0.07, () => {
            const a = new SpriteAnim(this.orb(sk.color), 0.32)
            a.sprite.center.set(0.5, 0.5)
            const ox = (Math.random() - 0.5) * 1.6
            const oz = (Math.random() - 0.5) * 1.6
            const from = at(f.x + ox - 1.2, f.z + oz, 5)
            a.sprite.position.copy(from)
            this.scene.add(a.sprite)
            this.shots.push({ sprite: a.sprite, from, src: c, dst: f, t: 0, dur: 0.45, dmg: i === 3 ? dmg : 0, skill: sk, arc: 0 })
          })
        this.shake = Math.max(this.shake, 0.35)
        break
      case 'heal': {
        // 自分とまわりの味方を回復
        const friends = this.creatures.filter((o) => this.alive(o) && o.sp.temper === c.sp.temper && Math.hypot(o.x - c.x, o.z - c.z) < 3.5)
        for (const o of friends) {
          const amt = Math.round(o.maxHp * 0.3)
          o.hp = Math.min(o.maxHp, o.hp + amt)
          this.popups.push({ pos: at(o.x, o.z, this.size(o) + 0.1), text: `+${amt}`, color: '#7cf29b', t: 0 })
          this.colorBurst(o.x, this.ground(o) + 0.8, o.z, sk.color, 6, 1.2)
        }
        this.ring(c.x, c.z, sk.color, 3.5, 0.6)
        // ついでに軽く攻撃も
        this.after(0.2, () => this.hitWith(c, f, Math.max(1, Math.round(c.atk * 0.8)), sk))
        break
      }
      case 'wave':
        // 地面を伝わる波（ゴウガンは家もゆらす）
        this.ring(f.x, f.z, sk.color, 3, 0.55)
        this.after(0.25, () => this.ring(f.x, f.z, sk.color, 2, 0.45))
        this.shake = Math.max(this.shake, 0.4)
        this.after(0.2, () => {
          this.splash(c, f, dmg, 2.2)
          if (c.sp.id === 'gougan') for (const h of this.houses) if (h.stage === this.stageIndex && h.level > 0 && Math.hypot(h.x - f.x, h.z - f.z) < 3) this.damageHouse(h, dmg * 0.5, c)
        })
        break
    }
    if (c.sp.tier >= 3 || c.sp.habit === 'raid') this.shake = Math.max(this.shake, 0.25)
  }

  /** 相手と、そのまわりにいる敵側にもダメージ */
  private splash(c: Creature, f: Creature, dmg: number, range: number) {
    const sk = SKILLS[c.sp.id]
    if (this.alive(f)) this.hitWith(c, f, dmg, sk)
    if (c.spar) return
    for (const o of [...this.creatures]) {
      if (o === f || o === c || !this.alive(o)) continue
      const hostile = c.sp.temper === 'wild' ? o.sp.temper === 'calm' : o.sp.temper === 'wild'
      if (hostile && Math.hypot(o.x - f.x, o.z - f.z) < range) this.hitWith(c, o, Math.round(dmg * 0.5), sk)
    }
  }

  /** 技が当たった */
  private hitWith(a: Creature, b: Creature, dmg: number, sk: Skill) {
    if (!this.alive(b) || !this.creatures.includes(a)) return
    const guard = b.sp.tier > 0 ? 1 - Math.min(0.3, this.careOf(b).guard * 0.01) : 1
    dmg = Math.max(1, Math.round(dmg * guard))
    b.hp -= dmg
    b.hurt = 0.4
    const dx = b.x - a.x
    const dz = b.z - a.z
    const d = Math.hypot(dx, dz) || 1
    b.kx = (dx / d) * 9
    b.kz = (dz / d) * 9
    const y = this.ground(b) + this.size(b)
    this.popups.push({ pos: new THREE.Vector3(b.x, y, b.z), text: `${dmg}!!`, color: sk.color, t: 0 })
    this.colorBurst(b.x, y * 0.7, b.z, sk.color, 10, 3.5)
    this.burst(b.x, y * 0.7, b.z, 'hit', 4, 3)
    if (this.ally(a) || this.ally(b)) {
      this.onSfx('boom')
      this.hitStop = Math.max(this.hitStop, 0.09)
    }
    if (b.hp <= 0) {
      // 技で倒されたら、その場でいったん戦いをほどく
      if (b.foe && b.foe !== a && b.foe.foe === b) {
        b.foe.foe = null
        this.setState(b.foe, 'idle', 0.4)
      }
      this.defeat(b, a)
    }
  }

  private colorBurst(x: number, y: number, z: number, color: string, n: number, power: number) {
    for (let i = 0; i < n; i++) {
      if (this.fx.length > 180) return
      const a = new SpriteAnim(this.orb(color), 0.14 + Math.random() * 0.08)
      a.sprite.center.set(0.5, 0.5)
      a.sprite.position.set(x, y, z)
      this.scene.add(a.sprite)
      const ang = Math.random() * Math.PI * 2
      const sp = power * (0.3 + Math.random() * 0.7)
      const life = 0.4 + Math.random() * 0.35
      this.fx.push({ sprite: a.sprite, vx: Math.cos(ang) * sp * 0.6, vz: Math.sin(ang) * sp * 0.6, vy: sp * 0.7, life, max: life, grav: 5 })
    }
  }

  /** 地面に広がる光の輪 */
  private ring(x: number, z: number, color: string, size: number, dur: number) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.75, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    )
    mesh.position.set(x, this.stage.heightAt(x, z) + 0.06, z)
    mesh.scale.setScalar(0.1)
    this.scene.add(mesh)
    this.rings.push({ mesh, t: 0, dur, size })
  }

  private after(t: number, run: () => void) {
    this.later.push({ t, run })
  }

  private updateSkills(dt: number) {
    for (const l of [...this.later]) {
      l.t -= dt
      if (l.t <= 0) {
        this.later.splice(this.later.indexOf(l), 1)
        l.run()
      }
    }
    for (const sh of [...this.shots]) {
      sh.t += dt
      if (sh.t < 0) continue
      const k = Math.min(1, sh.t / sh.dur)
      const to = new THREE.Vector3(sh.dst.x, this.ground(sh.dst) + this.size(sh.dst) * 0.5, sh.dst.z)
      sh.sprite.position.lerpVectors(sh.from, to, k)
      sh.sprite.position.y += Math.sin(k * Math.PI) * sh.arc
      // 通ったあとに光の粒
      if (Math.random() < 0.6) this.colorBurst(sh.sprite.position.x, sh.sprite.position.y, sh.sprite.position.z, sh.skill.color, 1, 0.4)
      if (k >= 1) {
        this.scene.remove(sh.sprite)
        ;(sh.sprite.material as THREE.SpriteMaterial).map?.dispose()
        sh.sprite.material.dispose()
        this.shots.splice(this.shots.indexOf(sh), 1)
        if (sh.dmg > 0) this.hitWith(sh.src, sh.dst, sh.dmg, sh.skill)
        else this.colorBurst(to.x, to.y, to.z, sh.skill.color, 4, 2)
      }
    }
    for (const r of [...this.rings]) {
      r.t += dt
      const k = r.t / r.dur
      r.mesh.scale.setScalar(0.1 + k * r.size)
      ;(r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - k))
      if (k >= 1) {
        this.scene.remove(r.mesh)
        r.mesh.geometry.dispose()
        ;(r.mesh.material as THREE.Material).dispose()
        this.rings.splice(this.rings.indexOf(r), 1)
      }
    }
  }

  // ================= 成長・進化・お金 =================
  /** 傾向（ペットは World.care、ほかの子は自分の care） */
  private careOf(c: Creature) {
    return c === this.pet ? this.care : c.care
  }
  private addCare(c: Creature, k: Care, n: number) {
    this.careOf(c)[k] += n
  }

  /** 経験値を足して、条件を満たしたら進化（1 匹ずつ自分の傾向で進化先が決まる） */
  private gainXp(c: Creature, n: number) {
    if (c.sp.tier === 0) return
    if (c === this.pet) this.xp += n
    else c.xp += n
    const xp = c === this.pet ? this.xp : c.xp
    const tier = c.sp.tier
    if (tier !== 1 && tier !== 2 && tier !== 3) return
    if (xp < XP_NEED[tier] || c.grow > 0 || c.state === 'fight' || !this.alive(c)) return
    const care = this.careOf(c)
    // ペットは育て方どおり。ほかの子は生まれつきの性格と気まぐれも入る
    const score = (k: Care) => care[k] + (c === this.pet ? 0 : (c.bias === k ? 3 : 0) + Math.random() * 2.5)
    const top = (['power', 'guard', 'spirit'] as Care[]).sort((a, b) => score(b) - score(a))[0]
    this.evolve(c, this.pickSecret(c, top) ?? nextForm(c.sp.id, tier, top))
  }

  private evolve(c: Creature, to: SpeciesId) {
    const fromId = c.sp.id
    const h0 = this.size(c)
    const sp = SPECIES[to]
    c.sp = sp
    c.maxHp = Math.max(c.maxHp + 10, sp.hp)
    c.hp = c.maxHp
    c.atk = Math.max(c.atk + 2, sp.atk)
    // 見えている 2.5D の子は、白いシルエットの演出をはさむ（見えない・3D モデルはすぐ切りかえ）
    if (c.anim.silhouette && c.anim.sprite.visible && !c.evo) {
      c.evo = { t: 0, from: fromId, to, h0, shown: 'old', said: false }
      if (this.ally(c)) this.onSfx('evolve')
      return
    }
    c.anim.setSpecies(to, this.size(c), this.variant(c))
    this.evolved(c, SPECIES[fromId].name)
  }

  /** 進化がおわった時のメッセージ・コイン（演出のあとに 1 回だけ） */
  private evolved(c: Creature, from: string) {
    const sp = c.sp
    this.burst(c.x, this.ground(c) + 0.6, c.z, 'spark', 18, 3)
    const near = Math.hypot(c.x - this.look.x, c.z - this.look.z) < 9
    if (this.ally(c)) {
      if (c === this.pet) this.flash = 1
      this.say(`${c.rare ? '★' : ''}${from}は ${sp.name}に しんかした！`)
      if (!c.evo) this.onSfx('evolve')
      this.earn(c === this.pet ? 30 : 15)
    } else if (near) this.say(`やせいの ${from}が ${sp.name}に しんかした！`)
    if (isSecretId(sp.id) && this.ally(c)) this.foundSecretForm(c)
  }

  /**
   * 進化の演出（約 1.8 秒）：
   * 0〜0.65 ちかちか白く光ってふるえる → 0.65〜1.3 白いシルエットがふくらむ → 1.3 新しい姿のシルエットに（光の輪）→ 〜1.8 ちぢんで新しい姿
   */
  private updateEvo(c: Creature, dt: number) {
    const e = c.evo!
    e.t += dt
    const t = e.t
    const v = this.variant(c)
    const hNew = this.size(c)
    const show = (what: Evo['shown']) => {
      if (e.shown === what) return
      e.shown = what
      if (what === 'old') c.anim.setSpecies(e.from, e.h0, v)
      else if (what === 'white-old') c.anim.silhouette!(e.from, e.h0)
      else if (what === 'white-new') c.anim.silhouette!(e.to, hNew)
      else c.anim.setSpecies(e.to, hNew, v)
    }
    // ジャンプ中ならその場で着地まで
    c.vy -= 16 * dt
    c.jy = Math.max(0, c.jy + c.vy * dt)
    if (c.jy === 0 && c.vy < 0) c.vy = 0
    let h = e.h0
    let sx = 1
    let sy = 1
    let shake = 0
    const ease = (k: number) => 1 - (1 - Math.min(1, Math.max(0, k))) ** 3
    if (t < 0.65) {
      show(Math.floor(t * (9 + t * 26)) % 2 === 0 ? 'white-old' : 'old')
      shake = Math.sin(t * 70) * 0.04 * (0.4 + t)
      sy = 1 + Math.sin(t * 24) * 0.03
    } else if (t < 1.3) {
      show('white-old')
      const k = ease((t - 0.65) / 0.65)
      sx = 1 + 0.45 * k
      sy = 1 + 0.6 * k
      shake = Math.sin(t * 90) * 0.03
      if (e.t - dt < 0.65) this.ring(c.x, c.z, '#ffffff', 2.6, 0.7)
    } else {
      if (!e.said) {
        // 新しい姿のシルエットへ：光の輪とキラキラ・ペットは画面もフラッシュ
        e.said = true
        this.ring(c.x, c.z, '#ffe27a', 3.4, 0.8)
        this.evolved(c, SPECIES[e.from].name)
      }
      if (t < 1.8) {
        show('white-new')
        const k = ease((t - 1.3) / 0.5)
        const s0 = THREE.MathUtils.clamp((e.h0 * 1.5) / hNew, 1.05, 1.6)
        h = hNew
        sx = sy = s0 + (1 - s0) * k
      } else {
        show('new')
        c.evo = null
        c.squash = 0.35
        this.burst(c.x, this.ground(c) + hNew * 0.6, c.z, 'heart', 4, 1.6)
        if (this.ally(c)) this.setState(c, 'happy', 1.4)
        h = hNew
      }
    }
    if (t < 1.3 && Math.random() < dt * 14) this.burst(c.x + (Math.random() - 0.5) * 0.8, this.ground(c) + Math.random() * e.h0, c.z, 'spark', 1, 1.2, -1)
    c.anim.update(dt)
    c.anim.setHeight(h)
    c.anim.sprite.scale.x *= sx
    c.anim.sprite.scale.y *= sy
    const gy = this.ground(c)
    c.anim.sprite.position.set(c.x + shake * h, gy + c.jy, c.z)
    c.shadow.position.set(c.x, this.stage.heightAt(c.x, c.z) + 0.03, c.z)
    c.shadow.scale.setScalar(h * 0.9 * (1 + (sx - 1) * 0.6))
  }

  private earn(n: number, x?: number, z?: number) {
    this.coins += n
    if (x !== undefined && z !== undefined) this.burst(x, this.stage.heightAt(x, z) + 0.6, z, 'coin', Math.min(6, 1 + Math.floor(n / 5)), 2)
    this.onSfx('coin')
  }

  // ================= たべもの =================
  private makeFoodMesh(kind: FoodKind) {
    const f = kind === 'stage' ? this.stage.food : FOODS[kind]
    const g = new THREE.Group()
    const geo =
      kind === 'meat'
        ? new THREE.CylinderGeometry(0.1, 0.16, 0.28, 6).rotateZ(Math.PI / 2)
        : kind === 'nut'
          ? new THREE.DodecahedronGeometry(0.15, 0)
          : new THREE.IcosahedronGeometry(0.16, 0)
    const body = new THREE.Mesh(geo, psx(new THREE.MeshLambertMaterial({ color: f.color, flatShading: true, emissive: f.color, emissiveIntensity: 0.15 })))
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.06), psx(new THREE.MeshLambertMaterial({ color: f.leaf })))
    leaf.position.set(kind === 'meat' ? 0.18 : 0.05, kind === 'meat' ? 0 : 0.16, 0)
    leaf.rotation.z = 0.5
    g.add(body, leaf)
    return g
  }

  dropFood(x?: number, z?: number, from = 2.5, kind: FoodKind = 'stage') {
    if (x === undefined || z === undefined) {
      const spots = [...this.stage.foodSpots, ...this.items.filter((it) => it.stage === this.stageIndex && ((it.kind === 'sapling' && it.grow >= 1) || it.kind === 'flowerbed'))]
      const s = spots[Math.floor(Math.random() * spots.length)] ?? { x: 0, z: 0 }
      const a = Math.random() * Math.PI * 2
      x = s.x + Math.cos(a) * (0.7 + Math.random() * 0.6)
      z = s.z + Math.sin(a) * (0.7 + Math.random() * 0.6)
    }
    // 水の上に落ちたら岸へずらす
    for (const o of this.stage.obstacles) {
      if (!o.water) continue
      const d = Math.hypot(x - o.x, z - o.z)
      if (d < o.r + 0.4) {
        const k = (o.r + 0.5) / (d || 1)
        x = o.x + (x - o.x) * k
        z = o.z + (z - o.z) * k
      }
    }
    x = THREE.MathUtils.clamp(x, -HALF, HALF)
    z = THREE.MathUtils.clamp(z, -HALF, HALF)
    const mesh = this.makeFoodMesh(kind)
    const y = this.stage.heightAt(x, z) + from
    mesh.position.set(x, y, z)
    this.scene.add(mesh)
    const food: Food = { mesh, x, z, y, vy: 0, landed: false, taken: null, bite: 0, kind }
    this.foods.push(food)
    return food
  }

  private removeFood(f: Food) {
    this.scene.remove(f.mesh)
    f.mesh.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      ;(m.material as THREE.Material | undefined)?.dispose()
    })
    const i = this.foods.indexOf(f)
    if (i >= 0) this.foods.splice(i, 1)
  }

  // ================= 置き物（箱庭づくり）=================
  private lam(color: string, extra: THREE.MeshLambertMaterialParameters = {}) {
    return psx(new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }))
  }

  private mountItem(it: Item) {
    const g = buildItem(it.kind, { low: this.lowQ, fruit: this.stage.food.color })
    g.position.set(it.x, this.stage.heightAt(it.x, it.z) + (it.fall ?? 0), it.z)
    g.rotation.y = it.rot
    this.scene.add(g)
    it.mesh = g
    it.st = undefined
  }

  private unmountItem(it: Item) {
    if (it.fshadow) {
      this.scene.remove(it.fshadow)
      it.fshadow = undefined
    }
    if (!it.mesh) return
    this.scene.remove(it.mesh)
    disposeItem(it.mesh)
    it.mesh = null
  }

  /** 画質：「低」では置き物の光源（たき火・ランタン）を作らない。作り直すので今の箱庭だけ入れ替える */
  private setItemQuality(q: 'high' | 'low') {
    const low = q === 'low'
    if (low === this.lowQ) return
    this.lowQ = low
    for (const it of this.items)
      if (it.stage === this.stageIndex && it.mesh) {
        this.unmountItem(it)
        this.mountItem(it)
      }
  }

  /** 買った置き物を、見ている所のまわりに「上から落として」置く */
  private placeItem(kind: ItemKind): Item {
    const p = this.freePos(1.2, this.look.x, this.look.z, 3)
    const it: Item = {
      kind, stage: this.stageIndex, x: p.x, z: p.z, grow: kind === 'sapling' ? 0 : 1, vx: 0, vz: 0, mesh: null,
      rot: ITEM_SPEC[kind].turn ? (Math.random() - 0.5) * 1.1 : 0, fall: 4.4, fvy: 0, sq: 0, tick: 0,
    }
    this.items.push(it)
    this.mountItem(it)
    const sh = new THREE.Mesh(this.shadowGeo, this.shadowMat)
    sh.position.set(it.x, this.stage.heightAt(it.x, it.z) + 0.03, it.z)
    sh.scale.setScalar(0.3)
    this.scene.add(sh)
    it.fshadow = sh
    return it
  }

  /** 置き物の ローカル座標（右 lx・手前 lz）を、箱庭の座標に直す */
  private itemLocal(it: Item, lx: number, lz: number) {
    const c = Math.cos(it.rot)
    const s = Math.sin(it.rot)
    return { x: it.x + lx * c + lz * s, z: it.z - lx * s + lz * c }
  }

  /** その種類の置き物のうち、いちばん近い物（落ちてくる途中のものは数えない） */
  private nearestItem(kind: ItemKind, x: number, z: number, range = 99) {
    let best: Item | null = null
    let bd = range
    for (const it of this.items) {
      if (it.kind !== kind || it.stage !== this.stageIndex || !it.mesh || it.fall !== undefined) continue
      const d = Math.hypot(it.x - x, it.z - z)
      if (d < bd) {
        bd = d
        best = it
      }
    }
    return best
  }

  /** あそべる おもちゃ（ボール・すべりだい・ぬいぐるみ）のうち、近くて その子に合う物 */
  private playToy(c: Creature): { it: Item; p: number } | null {
    const kid = c.grow > 0
    let best: { it: Item; p: number } | null = null
    let bd = 99
    for (const it of this.items) {
      if (it.stage !== this.stageIndex || !it.mesh || it.fall !== undefined) continue
      let p = 0
      let range = 8
      if (it.kind === 'ball') p = 0.25
      else if (it.kind === 'slide') {
        p = kid ? 0.4 : 0.22
        range = 10
      } else if (it.kind === 'plush') {
        p = kid ? 0.55 : 0.06
        range = 10
      } else continue
      const d = Math.hypot(it.x - c.x, it.z - c.z)
      if (d < range && d < bd) {
        bd = d
        best = { it, p }
      }
    }
    return best
  }

  /** 戦っている なかまの こうげき補正：おうえんばたの近くなら 2 わり UP */
  private bannerBoost(c: Creature) {
    return this.ally(c) && this.nearItem('banner', c.x, c.z, 4.5) ? 1.2 : 1
  }

  /** 買った時の演出：コインが 吸いこまれていく */
  private buyFx(x: number, z: number, h = 0.5) {
    const to = new THREE.Vector3(x, this.stage.heightAt(x, z) + h, z)
    const n = this.lowQ ? 4 : 7
    for (let i = 0; i < n; i++) {
      const a = new SpriteAnim(this.fxSheets.coin, 0.3)
      a.sprite.center.set(0.5, 0.5)
      const ang = (i / n) * Math.PI * 2 + Math.random()
      const from = new THREE.Vector3(to.x + Math.cos(ang) * 2.2, to.y + 1.4 + Math.random() * 1.2, to.z + Math.sin(ang) * 2.2)
      a.sprite.position.copy(from)
      a.sprite.visible = false
      this.scene.add(a.sprite)
      this.sucks.push({ anim: a, from, to, t: -i * 0.05, dur: 0.55, bs: a.sprite.scale.x })
    }
  }

  private updateSucks(dt: number) {
    for (const s of [...this.sucks]) {
      s.t += dt
      if (s.t < 0) continue
      const k = Math.min(1, s.t / s.dur)
      const e = k * k * (1.4 - 0.4 * k)
      const sp = s.anim.sprite
      sp.visible = true
      const rx = s.from.x - s.to.x
      const rz = s.from.z - s.to.z
      const ang = e * 2.4
      const f = 1 - e
      sp.position.set(
        s.to.x + (rx * Math.cos(ang) - rz * Math.sin(ang)) * f,
        s.from.y + (s.to.y - s.from.y) * e + Math.sin(e * Math.PI) * 0.35,
        s.to.z + (rx * Math.sin(ang) + rz * Math.cos(ang)) * f,
      )
      sp.scale.setScalar(s.bs * (1 - e * 0.55))
      if (k >= 1) {
        this.scene.remove(sp)
        s.anim.dispose()
        this.sucks.splice(this.sucks.indexOf(s), 1)
        if (Math.random() < 0.7) this.burst(s.to.x, s.to.y, s.to.z, 'spark', 1, 1)
      }
    }
  }

  /** 買った置き物が落ちてくる：はずんで、つぶれて、火花 */
  private dropStep(it: Item, dt: number, gy: number) {
    it.fvy = (it.fvy ?? 0) - 16 * dt
    it.fall = (it.fall ?? 0) + it.fvy * dt
    if (it.fall > 0) {
      if (it.fshadow) {
        it.fshadow.position.set(it.x, gy + 0.03, it.z)
        it.fshadow.scale.setScalar(Math.max(0.25, 0.9 - it.fall * 0.14))
      }
      return
    }
    it.fall = 0
    const v = -it.fvy
    it.sq = Math.min(1, v / 8)
    const big = v > 8
    this.burst(it.x, gy + 0.2, it.z, 'spark', big ? 8 : 3, big ? 2.4 : 1.4)
    if (big) {
      this.ring(it.x, it.z, '#fff6c8', 1.8, 0.5)
      this.onSfx('hit')
    }
    if (v > 2.4) it.fvy = v * 0.36
    else {
      it.fall = undefined
      it.fvy = 0
      if (it.fshadow) {
        this.scene.remove(it.fshadow)
        it.fshadow = undefined
      }
    }
  }

  private updateItems(dt: number) {
    const wind = this.weather === 'rain' || this.weather === 'ember' ? 1.7 : this.weather === 'snow' ? 1.25 : 1
    for (const it of this.items) {
      if (it.stage !== this.stageIndex || !it.mesh) continue
      const gy = this.stage.heightAt(it.x, it.z)
      if (it.fall !== undefined) this.dropStep(it, dt, gy)
      let busy = false
      switch (it.kind) {
        case 'sapling': {
          if (it.grow < 1) it.grow = Math.min(1, it.grow + dt / 60)
          const st = it.grow < 0.34 ? 0 : it.grow < 1 ? 1 : 2
          if (it.st === undefined) it.st = st
          else if (st !== it.st) {
            it.st = st
            this.burst(it.x, gy + 0.9, it.z, 'spark', 5, 1.6)
            if (st === 1) this.say('なえが ぐんぐん のびて わかぎに なった')
            else {
              this.say('なえが そだって 木に なった！ みが なるよ')
              this.dropFood(it.x + 0.8, it.z)
            }
          }
          break
        }
        case 'ball': {
          it.x += it.vx * dt
          it.z += it.vz * dt
          const k = Math.exp(-dt * 1.6)
          it.vx *= k
          it.vz *= k
          for (const o of this.stage.obstacles) {
            const dx = it.x - o.x
            const dz = it.z - o.z
            const d = Math.hypot(dx, dz)
            if (d < o.r + 0.2 && d > 0) {
              it.x = o.x + (dx / d) * (o.r + 0.2)
              it.z = o.z + (dz / d) * (o.r + 0.2)
              const dot = (it.vx * dx + it.vz * dz) / d
              it.vx -= (2 * dot * dx) / d
              it.vz -= (2 * dot * dz) / d
            }
          }
          if (Math.abs(it.x) > HALF) it.vx *= -1
          if (Math.abs(it.z) > HALF) it.vz *= -1
          it.x = THREE.MathUtils.clamp(it.x, -HALF, HALF)
          it.z = THREE.MathUtils.clamp(it.z, -HALF, HALF)
          break
        }
        case 'lantern': {
          // よる、そばに集まった子の こころが育つ
          if (this.night > 0.4 && it.fall === undefined) {
            it.tick += dt
            if (it.tick > 3) {
              it.tick = 0
              for (const c of this.creatures) {
                if (!this.ally(c) || !this.alive(c) || c.state === 'fight' || c.inside || Math.hypot(c.x - it.x, c.z - it.z) > 2.6) continue
                this.addCare(c, 'spirit', 0.25)
                if (c === this.pet) this.stats.mood = Math.min(100, this.stats.mood + 0.8)
                if (Math.random() < 0.3) this.burst(c.x, this.ground(c) + this.size(c) + 0.2, c.z, 'heart', 1, 0.8)
              }
            }
          }
          break
        }
        case 'tools':
          busy = this.creatures.some((c) => c.state === 'work' && Math.hypot(c.x - it.x, c.z - it.z) < 3.4)
          break
        case 'plush':
          busy = this.creatures.some((c) => c.state === 'play' && this.playAt.get(c) === it)
          break
        default:
          break
      }
      it.mesh.position.set(it.x, gy + (it.fall ?? 0), it.z)
      if (it.sq > 0) {
        it.sq = Math.max(0, it.sq - dt * 3.2)
        it.mesh.scale.set(1 + it.sq * 0.22, 1 - it.sq * 0.3, 1 + it.sq * 0.22)
      }
      tickItem(it.kind, it.mesh, { t: this.time, dt, night: this.night, wind, grow: it.grow, vx: it.vx, vz: it.vz, busy, day: this.night < 0.4 })
    }
  }

  // ================= 資材と家づくり =================
  private homeOf(c: Creature) {
    return this.houses.find((h) => h.owner === c && h.stage === this.stageIndex) ?? null
  }

  private nearestHouse(c: Creature, pred: (h: House) => boolean, range: number) {
    let best: House | null = null
    let bd = range
    for (const h of this.houses) {
      if (h.stage !== this.stageIndex || !pred(h)) continue
      const d = Math.hypot(h.x - c.x, h.z - c.z)
      if (d < bd) {
        bd = d
        best = h
      }
    }
    return best
  }

  /** 家を持っていない子：空き家に住みつくか、新しく建てはじめる */
  private claimHouse(c: Creature): House | null {
    const empty = this.nearestHouse(c, (h) => !h.owner, 12)
    if (empty) {
      empty.owner = c
      empty.ownerSp = c.sp.id
      this.refreshHouse(empty, true)
      return empty
    }
    const here = this.houses.filter((h) => h.stage === this.stageIndex)
    if (here.length >= MAX_HOUSES) return null
    for (let i = 0; i < 40; i++) {
      const q = this.freePos(0, c.x, c.z, 6)
      if (Math.hypot(q.x, q.z) < 2) continue
      if (Math.abs(q.x) > HALF - 1.2 || Math.abs(q.z) > HALF - 1.2) continue
      if (here.some((h) => Math.hypot(h.x - q.x, h.z - q.z) < 3)) continue
      if (this.stage.obstacles.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < o.r + 1.3)) continue
      const h: House = { stage: this.stageIndex, x: q.x, z: q.z, owner: c, ownerSp: c.sp.id, mats: 0, hp: 0, mesh: null, shake: 0, level: 0, alerted: 0 }
      this.houses.push(h)
      this.mountHouse(h)
      if (this.ally(c)) this.say(`${c.sp.name}が いえを たてはじめた`)
      return h
    }
    return null
  }

  /** 家のちかくに だいくどうぐ / まもりのさく があるか */
  private nearItem(kind: ItemKind, x: number, z: number, r: number) {
    return this.items.some((it) => it.kind === kind && it.stage === this.stageIndex && it.mesh && Math.hypot(it.x - x, it.z - z) < r)
  }

  private addMaterial(h: House, by: Creature) {
    const before = h.level
    // だいくどうぐ の近くなら 1 回で 2 個分
    const bonus = this.nearItem('tools', h.x, h.z, 6) ? 2 : 1
    h.mats = Math.min(HOUSE_STEPS[4], h.mats + bonus)
    h.level = houseLevel(h.mats)
    h.hp = Math.min(houseMaxHp(h.level), h.hp + 9)
    this.burst(h.x, this.stage.heightAt(h.x, h.z) + 0.8, h.z, 'spark', 4, 1.5)
    if (h.level !== before) {
      this.refreshHouse(h)
      const who = by.sp.name
      if (this.ally(by)) {
        this.say(h.level === 4 ? `${who}の いえが ぞうちくされた！` : h.level === 3 ? `${who}の いえが かんせい！` : h.level === 2 ? `${who}の いえに かべが できた` : `${who}の いえの どだいが できた`)
        if (h.level >= 3) this.earn(h.level === 4 ? 15 : 10, h.x, h.z)
      } else if (h.level >= 3 && Math.hypot(h.x - this.look.x, h.z - this.look.z) < 9) this.say(`やせいの ${who}が いえを たてた`)
    }
  }

  /** 家がこわされる。hp が 0 になると 1 段階くずれ、資材がちらばる */
  private damageHouse(h: House, dmg: number, by: Creature | null) {
    // まもりのさく の近くは ダメージ半分
    if (this.nearItem('fence', h.x, h.z, 3.2)) dmg *= 0.5
    h.hp -= dmg
    h.shake = 0.3
    const y = this.stage.heightAt(h.x, h.z) + 0.6
    this.burst(h.x, y, h.z, 'hit', 2, 2)
    const owner = h.owner
    if (by && owner && this.alive(owner) && owner.state !== 'fight' && by.sp.temper !== owner.sp.temper) {
      // 持ち主がかけつけて追いはらう
      if (Math.hypot(owner.x - h.x, owner.z - h.z) < 9 && owner.grow === 0) {
        if (owner.inside) {
          owner.inside = false
          owner.anim.sprite.visible = true
          owner.shadow.visible = true
        }
        owner.foe = by
        this.setState(owner, 'hunt', 8)
      }
    }
    if (by && owner && this.ally(owner) && this.time - h.alerted > 12) {
      h.alerted = this.time
      this.say(`${owner.sp.name}の いえが ${by.sp.name}に おそわれている！`)
    }
    if (h.hp > 0) return
    const lv = h.level
    h.mats = HOUSE_STEPS[Math.max(0, lv - 1)]
    h.level = houseLevel(h.mats)
    h.hp = houseMaxHp(h.level) * 0.5
    for (let i = 0; i < 2; i++) this.spawnResource(h.x + (Math.random() - 0.5) * 2, h.z + 1 + Math.random())
    this.burst(h.x, y, h.z, 'cube', 10, 3)
    if (owner && this.ally(owner)) this.say(h.level === 0 ? `${owner.sp.name}の いえが こわされた…` : `${owner.sp.name}の いえが こわれかけている`)
    if (h.level === 0) {
      this.unmountHouse(h)
      this.houses.splice(this.houses.indexOf(h), 1)
      for (const c of this.creatures) if (c.raid === h) c.raid = null
    } else this.refreshHouse(h)
  }

  private refreshHouse(h: House, force = false) {
    if (!force && h.mesh && h.mesh.userData.level === h.level) return
    this.unmountHouse(h)
    if (h.stage === this.stageIndex) this.mountHouse(h)
  }

  /** 家の見た目：建てた段階ごとに 土台 → かべ → 屋根 */
  private mountHouse(h: House) {
    h.level = houseLevel(h.mats)
    const g = new THREE.Group()
    g.userData.level = h.level
    const st = styleOf(h.stage)
    const stone = this.lam(st.stone, { map: this.rock() })
    const wood = this.lam(st.wall, { map: this.bark() })
    if (h.level === 0) {
      // 建てる場所の目印：杭と、運びこまれた資材の山
      for (const [x, z] of [[-0.65, -0.55], [0.65, -0.55], [-0.65, 0.55], [0.65, 0.55]]) {
        const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.4, 5), wood)
        stake.position.set(x, 0.2, z)
        g.add(stake)
      }
      for (let i = 0; i < h.mats; i++) {
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), stone)
        m.position.set(-0.2 + i * 0.25, 0.1, 0)
        g.add(m)
      }
    }
    if (h.level >= 1) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 1.3), stone)
      base.position.y = 0.11
      g.add(base)
    }
    if (h.level >= 2) {
      const walls = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.75, 1.0), wood)
      walls.position.y = 0.6
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.48, 0.05), this.lam('#3d2a1e'))
      door.position.set(0, 0.46, 0.51)
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.05), new THREE.MeshBasicMaterial({ color: '#ffd27a' }))
      win.position.set(0.38, 0.68, 0.51)
      win.name = 'window'
      g.add(walls, door, win)
    }
    if (h.level >= 3) {
      // 屋根の形は住む種族で変わる（四角・六角・八角）
      const sides = [4, 6, 8][(h.ownerSp.charCodeAt(0) + h.ownerSp.length) % 3]
      const up = h.level >= 4 ? 0.45 : 0
      const roof = new THREE.Mesh(new THREE.ConeGeometry(h.level >= 4 ? 0.95 : 1.05, 0.7, sides), this.lam(ROOF[h.ownerSp] ?? st.roof))
      roof.position.y = 1.32 + up
      if (sides === 4) roof.rotation.y = Math.PI / 4
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.16), stone)
      chimney.position.set(-0.32, 1.45 + up, -0.15)
      g.add(roof, chimney)
    }
    if (h.level >= 4) {
      // 増築：2 階・ベランダ・庭の花・ランプ
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.45, 0.8), wood).translateY(1.2))
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.3), wood).translateY(0.99).translateZ(0.62))
      const win2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.05), new THREE.MeshBasicMaterial({ color: '#ffd27a' }))
      win2.position.set(0, 1.22, 0.41)
      g.add(win2)
      for (const [x, z, col] of [[-0.8, 0.8, '#ff8fb1'], [0.8, 0.85, '#ffd23f'], [-0.55, 0.95, '#ffffff'], [0.45, 0.98, '#ff8fb1'], [0.95, 0.5, '#9fd8ff']] as const) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4), new THREE.MeshBasicMaterial({ color: col }))
        f.position.set(x, 0.1, z)
        g.add(f)
      }
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), new THREE.MeshBasicMaterial({ color: st.accent }))
      lamp.position.set(-0.3, 0.75, 0.56)
      g.add(lamp)
    }
    g.position.set(h.x, this.stage.heightAt(h.x, h.z) - 0.02, h.z)
    g.userData.pop = this.time > 2 ? 0.55 : 0
    this.scene.add(g)
    h.mesh = g
    if (!h.hp) h.hp = houseMaxHp(h.level)
  }

  private unmountHouse(h: House) {
    if (!h.mesh) return
    this.scene.remove(h.mesh)
    h.mesh.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      ;(m.material as THREE.Material | undefined)?.dispose?.()
    })
    h.mesh = null
  }

  private updateHouses(dt: number) {
    for (const h of [...this.houses]) {
      if (h.stage !== this.stageIndex || !h.mesh) continue
      h.shake = Math.max(0, h.shake - dt)
      this.popAnim(h.mesh, dt)
      // えんとつのけむり：夜・雨・雪、または中にだれかいる時
      if (h.level >= 3) {
        const t = ((h.mesh.userData.smoke as number | undefined) ?? 0) - dt
        if (t <= 0) {
          h.mesh.userData.smoke = 0.7 + Math.random() * 0.6
          if (this.night > 0.5 || this.weather === 'rain' || this.weather === 'snow' || this.creatures.some((c) => c.inside && h.owner === c))
            this.smoke(h.x - 0.32, this.stage.heightAt(h.x, h.z) + 1.7 + (h.level >= 4 ? 0.45 : 0), h.z - 0.15)
        } else h.mesh.userData.smoke = t
      }
      // だいくどうぐ の近くの家は少しずつ直る
      if (h.level >= 1 && h.hp < houseMaxHp(h.level) && this.nearItem('tools', h.x, h.z, 6)) {
        h.hp = Math.min(houseMaxHp(h.level), h.hp + dt * 0.8)
        if (Math.random() < dt * 0.4) this.burst(h.x, this.stage.heightAt(h.x, h.z) + 0.9, h.z, 'spark', 1, 0.6)
      }
      h.mesh.position.x = h.x + (h.shake > 0 ? Math.sin(this.time * 60) * 0.05 : 0)
      const win = h.mesh.getObjectByName('window') as THREE.Mesh | undefined
      if (win) {
        // 夜や雨で中にだれかいると窓が光る
        const lit = this.creatures.some((c) => c.inside && h.owner === c)
        ;(win.material as THREE.MeshBasicMaterial).color.set(lit ? '#ffd27a' : '#5a4a3a')
      }
      // ひのこの日は木の家が少しずつ焦げる
      if (this.weather === 'ember' && h.level >= 2) {
        h.hp -= dt * 0.12
        if (Math.random() < dt * 0.6) this.burst(h.x, this.stage.heightAt(h.x, h.z) + 1.2, h.z, 'hit', 1, 0.5, -1)
        if (h.hp <= 0) this.damageHouse(h, 0.01, null)
      }
    }
  }

  // ================= 建物（はたけ・いど・みはりとう・ゆりかごごや・へい・おしろ・はし）=================
  private rock() {
    return (this.rockTex ??= Tex.rock())
  }
  private bark() {
    return (this.barkTex ??= Tex.bark())
  }

  private structDone(b: Struct) {
    return b.mats >= STRUCTS[b.kind].need
  }
  private structMaxHp(b: Struct) {
    const spec = STRUCTS[b.kind]
    return this.structDone(b) ? spec.hp : spec.hp * (0.3 + 0.7 * (b.mats / spec.need))
  }

  /** 建てかけの建物のうち、いちばん近いもの */
  private openSite(c: Creature | null): Struct | null {
    let best: Struct | null = null
    let bd = 99
    for (const b of this.structs) {
      if (b.stage !== this.stageIndex || this.structDone(b) || !b.mesh) continue
      const d = c ? Math.hypot(b.x - c.x, b.z - c.z) : 0
      if (d < bd) {
        bd = d
        best = b
      }
    }
    return best
  }

  /** 建てる場所を決めて、建設現場（資材 0）を置く。人がせっけいずを買った時は「見ている所」のまわり */
  private planStruct(kind: StructKind, nx = this.look.x, nz = this.look.z, quiet = false): Struct | null {
    const spec = STRUCTS[kind]
    const here = this.structs.filter((b) => b.stage === this.stageIndex)
    const fail = (t: string) => {
      if (!quiet) this.say(t)
      return null
    }
    if (here.length >= MAX_STRUCTS) return fail('もう たてる ばしょが ない…')
    if (kind === 'castle' && here.some((b) => b.kind === 'castle')) return fail('おしろは ひとつだけ')
    if (kind !== 'wall' && kind !== 'castle' && here.filter((b) => b.kind === kind).length >= 3) return fail(`${spec.name}は これいじょう いらない`)
    let x = 0
    let z = 0
    let len = 0
    if (kind === 'bridge') {
      const pools = this.stage.obstacles.filter((o) => o.water && !here.some((b) => b.kind === 'bridge' && Math.hypot(b.x - o.x, b.z - o.z) < 0.6))
      pools.sort((a, b) => Math.hypot(a.x - nx, a.z - nz) - Math.hypot(b.x - nx, b.z - nz))
      if (!pools[0]) return fail('ここには わたる みずうみが ない')
      x = pools[0].x
      z = pools[0].z
      len = pools[0].r * 2 + 1.6
    } else {
      const big = kind === 'castle'
      const edge = HALF - (big ? 3.8 : 1.4)
      let ok = false
      for (let i = 0; i < 90 && !ok; i++) {
        x = THREE.MathUtils.clamp(nx + (Math.random() * 2 - 1) * (3 + i * 0.06), -edge, edge)
        z = THREE.MathUtils.clamp(nz + (Math.random() * 2 - 1) * (3 + i * 0.06), -edge, edge)
        const clear = big ? 3.1 : 2
        ok =
          !this.houses.some((h) => h.stage === this.stageIndex && Math.hypot(h.x - x, h.z - z) < clear) &&
          !here.some((b) => Math.hypot(b.x - x, b.z - z) < (big || b.kind === 'castle' ? 3.2 : 2)) &&
          !this.stage.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + (big ? 2.0 : 1.3))
      }
      if (!ok) return fail('ここには たてられない（ひろい所へ）')
    }
    const b: Struct = { kind, stage: this.stageIndex, x, z, rot: 0, len, mats: 0, hp: spec.hp * 0.3, mesh: null, shake: 0, q: -1, t: 0, alerted: 0 }
    this.structs.push(b)
    this.mountStruct(b)
    this.burst(x, this.stage.heightAt(x, z) + 0.5, z, 'spark', 8, 2)
    return b
  }

  private mountStruct(b: Struct) {
    const spec = STRUCTS[b.kind]
    const p = Math.min(1, b.mats / spec.need)
    const ctx = {
      lam: (c: string, m?: THREE.Texture) => this.lam(c, m ? { map: m } : {}),
      basic: (c: string) => new THREE.MeshBasicMaterial({ color: c }),
      rock: this.rock(),
      bark: this.bark(),
      style: styleOf(b.stage),
    }
    const model = buildStructModel(b.kind, ctx, b.len || 3)
    b.q = p >= 1 ? 4 : Math.floor(p * 4)
    const g = new THREE.Group()
    g.add(model)
    if (p < 1) {
      // 建設中：低く育っていく + 杭と資材の山
      model.scale.y = 0.3 + 0.7 * p
      const wood = this.lam('#a0703f', { map: this.bark() })
      const w = Math.max(0.7, spec.r + 0.3)
      for (const [x, z] of [[-w, -w * 0.8], [w, -w * 0.8], [-w, w * 0.8], [w, w * 0.8]]) {
        const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.5, 5), wood)
        stake.position.set(x, 0.25, z)
        g.add(stake)
      }
    }
    g.rotation.y = b.rot
    g.userData.pop = this.time > 2 ? 0.55 : 0
    g.position.set(b.x, b.kind === 'bridge' ? 0.27 : this.stage.heightAt(b.x, b.z) - 0.02, b.z)
    this.scene.add(g)
    b.mesh = g
  }

  private unmountStruct(b: Struct) {
    if (!b.mesh) return
    this.scene.remove(b.mesh)
    b.mesh.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      ;(m.material as THREE.Material | undefined)?.dispose?.()
    })
    b.mesh = null
  }

  private refreshStruct(b: Struct) {
    this.unmountStruct(b)
    if (b.stage === this.stageIndex) this.mountStruct(b)
  }

  private addStructMaterial(b: Struct, by: Creature) {
    const spec = STRUCTS[b.kind]
    const bonus = this.nearItem('tools', b.x, b.z, 6) ? 2 : 1
    const was = this.structDone(b)
    const m0 = b.mats
    b.mats = Math.min(spec.need, b.mats + bonus)
    b.hp = Math.min(this.structMaxHp(b), b.hp + spec.hp * 0.25)
    this.burst(b.x, this.stage.heightAt(b.x, b.z) + 0.8, b.z, 'spark', 4, 1.5)
    if (by === this.pet && !this.structDone(b))
      this.say(`${by.sp.name}は しざいを はこんだ（${spec.name} ${b.mats}/${spec.need}${b.mats - m0 > 1 ? ' どうぐで 2ばい' : ''}） まもり+1`)
    const q = this.structDone(b) ? 4 : Math.floor((b.mats / spec.need) * 4)
    if (q !== b.q) this.refreshStruct(b)
    if (this.structDone(b) && !was) this.onStructDone(b, by)
  }

  private onStructDone(b: Struct, by: Creature) {
    const spec = STRUCTS[b.kind]
    b.hp = spec.hp
    this.burst(b.x, this.stage.heightAt(b.x, b.z) + 1, b.z, 'spark', 12, 2.5)
    if (b.kind === 'wall') return void this.earn(1, b.x, b.z)
    this.onSfx('win')
    this.earn(b.kind === 'castle' ? 40 : 10, b.x, b.z)
    if (b.kind === 'castle') {
      this.say('おしろが かんせい！ まわりに へいを たてはじめた')
      this.castleWalls(b)
      this.shake = Math.max(this.shake, 0.4)
    } else this.say(`${by.sp.name}たちが ${spec.name}を かんせいさせた！`)
  }

  /** おしろのまわりに へい（手前だけ門のあき）を建てはじめる */
  private castleWalls(c: Struct) {
    for (let i = 0; i < 12; i++) {
      if (i === 3) continue
      if (this.structs.filter((b) => b.stage === this.stageIndex).length >= MAX_STRUCTS) break
      const a = (i / 12) * Math.PI * 2
      const x = c.x + Math.cos(a) * 3.3
      const z = c.z + Math.sin(a) * 3.3
      if (Math.abs(x) > HALF - 0.5 || Math.abs(z) > HALF - 0.5) continue
      if (this.houses.some((h) => h.stage === this.stageIndex && Math.hypot(h.x - x, h.z - z) < 1.7)) continue
      if (this.stage.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.8)) continue
      const w: Struct = { kind: 'wall', stage: this.stageIndex, x, z, rot: -(a + Math.PI / 2), len: 0, mats: 0, hp: STRUCTS.wall.hp * 0.3, mesh: null, shake: 0, q: -1, t: 0, alerted: 0 }
      this.structs.push(w)
      this.mountStruct(w)
    }
  }

  /** 建物がこわされる。完成していた物も、こわれたらがれきの資材になる */
  private damageStruct(b: Struct, dmg: number, by: Creature | null) {
    if (this.nearItem('fence', b.x, b.z, 3.2)) dmg *= 0.5
    b.hp -= dmg
    b.shake = 0.3
    this.burst(b.x, this.stage.heightAt(b.x, b.z) + 0.7, b.z, 'hit', 2, 2)
    if (b.kind === 'castle') this.shake = Math.max(this.shake, 0.12)
    if (by && b.kind !== 'wall' && this.time - b.alerted > 12) {
      b.alerted = this.time
      this.say(`${STRUCTS[b.kind].name}が ${by.sp.name}に おそわれている！`)
    }
    if (b.hp > 0) return
    this.unmountStruct(b)
    this.structs.splice(this.structs.indexOf(b), 1)
    for (let i = 0; i < Math.min(4, Math.ceil(b.mats / 3)); i++) this.spawnResource(b.x + (Math.random() - 0.5) * 2, b.z + 1 + Math.random(), undefined, true)
    this.burst(b.x, this.stage.heightAt(b.x, b.z) + 0.8, b.z, 'cube', 12, 3.5)
    this.shake = Math.max(this.shake, b.kind === 'castle' ? 0.7 : 0.25)
    this.ring(b.x, b.z, '#cfc7b8', b.kind === 'castle' ? 3.2 : 2, 0.6)
    if (b.kind === 'castle' || b.kind === 'tower') this.hitStop = 0.15
    if (b.kind !== 'wall') this.say(b.kind === 'castle' ? 'おしろが おちてしまった…！' : `${STRUCTS[b.kind].name}が こわされた…`)
  }

  /** 敵軍が目指す建物（いちばん近い、こわせる物） */
  private marchTarget(c: Creature): { x: number; z: number; r: number; s?: Struct; h?: House } | null {
    let best: { x: number; z: number; r: number; s?: Struct; h?: House } | null = null
    let bd = 99
    for (const b of this.structs) {
      if (b.stage !== this.stageIndex || !b.mesh || (b.mats === 0 && b.kind !== 'wall')) continue
      const d = Math.hypot(b.x - c.x, b.z - c.z)
      if (d < bd) {
        bd = d
        best = { x: b.x, z: b.z, r: STRUCTS[b.kind].r || 0.7, s: b }
      }
    }
    for (const h of this.houses) {
      if (h.stage !== this.stageIndex || h.level < 1) continue
      const d = Math.hypot(h.x - c.x, h.z - c.z)
      if (d < bd) {
        bd = d
        best = { x: h.x, z: h.z, r: 0.85, h }
      }
    }
    return best
  }

  private updateStructs(dt: number) {
    for (const b of [...this.structs]) {
      if (b.stage !== this.stageIndex || !b.mesh) continue
      b.shake = Math.max(0, b.shake - dt)
      this.popAnim(b.mesh, dt)
      if (b.kind === 'castle' || b.kind === 'tower') b.mesh.traverse((o) => o.name === 'flag' && (o.rotation.y = Math.sin(this.time * 5 + o.position.x * 3 + b.x) * 0.55))
      b.mesh.position.x = b.x + (b.shake > 0 ? Math.sin(this.time * 60) * 0.05 : 0)
      const done = this.structDone(b)
      if (done && b.hp < STRUCTS[b.kind].hp && this.nearItem('tools', b.x, b.z, 6)) b.hp = Math.min(STRUCTS[b.kind].hp, b.hp + dt * 1.5)
      if (!done) continue
      b.t += dt
      switch (b.kind) {
        case 'farm':
          if (b.t > 22) {
            b.t = 0
            if (this.foods.length < 9) {
              this.dropFood(b.x + (Math.random() - 0.5) * 1.2, b.z + 0.9, 1.4)
              this.burst(b.x, this.stage.heightAt(b.x, b.z) + 0.5, b.z, 'spark', 4, 1.2)
            }
          }
          break
        case 'well':
        case 'castle':
          if (b.t > 1) {
            b.t = 0
            const range = b.kind === 'well' ? 3 : 5
            for (const c of this.creatures) {
              if (c.army || c.sp.temper === 'wild' || !this.alive(c) || Math.hypot(c.x - b.x, c.z - b.z) > range) continue
              if (c.hp < c.maxHp - 0.5 || c.energy < 99) {
                c.hp = Math.min(c.maxHp, c.hp + (b.kind === 'well' ? 3 : 2))
                if (b.kind === 'well') c.energy = Math.min(100, c.energy + 3)
                if (Math.random() < 0.3) this.burst(c.x, this.ground(c) + this.size(c), c.z, 'heart', 1, 0.8)
              }
            }
          }
          break
        case 'tower':
          if (b.t > 1.8) {
            const foe = this.nearest({ x: b.x, z: b.z } as Creature, (o) => o.sp.temper === 'wild' && !o.inside, 7.5)
            if (foe) {
              b.t = 0
              this.towerShot(b, foe)
            } else b.t = 1.5
          }
          break
      }
    }
  }

  /** 建った瞬間の ぽよん */
  private popAnim(m: THREE.Group, dt: number) {
    const pk = (m.userData.pop as number | undefined) ?? 0
    if (pk <= 0) return
    m.userData.pop = pk - dt
    const k = Math.max(0, pk) / 0.55
    m.scale.y = pk - dt <= 0 ? 1 : 1 + Math.sin((1 - k) * Math.PI * 2) * 0.16 * k
  }

  private smoke(x: number, y: number, z: number) {
    if (this.fx.length > 120) return
    const a = new SpriteAnim(this.orb('#e6e6e6'), 0.16)
    a.sprite.center.set(0.5, 0.5)
    a.sprite.position.set(x, y, z)
    this.scene.add(a.sprite)
    this.fx.push({ sprite: a.sprite, vx: 0.12 + Math.random() * 0.1, vy: 0.45, vz: 0, life: 1.6, max: 1.6, grav: 0 })
  }

  private towerShot(b: Struct, foe: Creature) {
    const top = this.stage.heightAt(b.x, b.z) + 2.3
    const ty = this.ground(foe) + this.size(foe) * 0.6
    const a = new SpriteAnim(this.orb('#ffe27a'), 0.22)
    a.sprite.center.set(0.5, 0.5)
    a.sprite.position.set(b.x, top, b.z)
    this.scene.add(a.sprite)
    const T = 0.22
    this.fx.push({ sprite: a.sprite, vx: (foe.x - b.x) / T, vy: (ty - top) / T + 0.5 * 9 * T, vz: (foe.z - b.z) / T, life: T, max: T, grav: 9 })
    const dmg = 4 + this.structs.filter((o) => o.kind === 'castle' && o.stage === this.stageIndex && this.structDone(o)).length * 2
    this.after(T, () => {
      if (!this.alive(foe)) return
      foe.hp -= dmg
      foe.hurt = 0.28
      this.popups.push({ pos: new THREE.Vector3(foe.x, ty + 0.3, foe.z), text: `${dmg}`, color: '#ffe27a', t: 0 })
      this.burst(foe.x, ty, foe.z, 'hit', 3, 2.5)
      if (foe.hp > 0) return
      for (const o of this.creatures) if (o.foe === foe) {
        o.foe = null
        if (o.state === 'fight') this.setState(o, 'idle', 0.4)
      }
      foe.foe = null
      this.setState(foe, 'dead', 1)
      if (foe.sp.habit !== 'night' && !foe.army) this.respawn.push({ id: foe.sp.id, t: (foe.sp.habit === 'raid' ? 40 : 14) + Math.random() * 10 })
      this.earn(6, foe.x, foe.z)
    })
  }

  // ================= 村 =================
  private calcVillage() {
    let score = this.houses.filter((h) => h.stage === this.stageIndex && h.level >= 3).length
    let castle = false
    for (const b of this.structs) {
      if (b.stage !== this.stageIndex || !this.structDone(b)) continue
      score += STRUCTS[b.kind].score
      if (b.kind === 'castle') castle = true
    }
    this.vScore = score
    this.vLv = castle && score >= 9 ? 3 : score >= 9 ? 2 : score >= 4 ? 1 : 0
  }
  private vScore = 0
  private vLv = 0
  private villageLevel() {
    return this.vLv
  }
  private villageName() {
    const base = ['ミドリ', 'スナハマ', 'サンゴ', 'ワタユキ', 'コオリ', 'ホムラ', 'イシブミ'][this.stageIndex] ?? 'ホシ'
    return base + ['', 'むら', 'まち', 'じょうかまち'][this.vLv]
  }

  // ================= タップした物の情報・かいたい =================
  private picked: Pick | null = null
  private infoBox: { x: number; y: number; w: number; h: number; del: { x: number; y: number; w: number; h: number } | null; close: { x: number; y: number; w: number; h: number } } | null = null
  private armUntil = 0

  /** タップした場所（液晶の座標）にいちばん近い物をさがす */
  private pickAt(x: number, y: number): Pick | null {
    const here = this.stageIndex
    let best: Pick | null = null
    let bs = 1
    // 地面の点と上の点を画面に投影して、見た目の大きさから当たりの半径を決める
    const test = (px: number, pz: number, h: number, pick: Pick, minR = 9) => {
      const gy = this.stage.heightAt(px, pz)
      const a = this.projectXYZ(px, gy + h * 0.5, pz)
      if (!a.on) return
      const b = this.projectXYZ(px, gy + h, pz)
      const r = Math.max(minR, Math.hypot(a.x - b.x, a.y - b.y) * 1.15)
      const score = Math.hypot(a.x - x, a.y - y) / r
      if (score < bs) {
        bs = score
        best = pick
      }
    }
    for (const c of this.creatures) if (c.state !== 'dead' && !(c.inside && c.state === 'sleep')) test(c.x, c.z, this.size(c) + c.jy, { type: 'creature', ref: c, armed: false }, 10)
    for (const h of this.houses) if (h.stage === here && h.mesh) test(h.x, h.z, h.level >= 4 ? 2.2 : h.level >= 3 ? 1.7 : 1, { type: 'house', ref: h, armed: false }, 14)
    for (const b of this.structs) {
      if (b.stage !== here || !b.mesh) continue
      const hgt = { castle: 3.2, tower: 2.5, cradle: 1.5, well: 1.4, farm: 0.8, wall: 0.9, bridge: 0.4 }[b.kind]
      test(b.x, b.z, hgt, { type: 'struct', ref: b, armed: false }, 12)
    }
    for (const it of this.items) if (it.stage === here && it.mesh) test(it.x, it.z, it.kind === 'sapling' ? 0.5 + it.grow : ITEM_SPEC[it.kind].pickH, { type: 'item', ref: it, armed: false }, 11)
    for (const e of this.eggs) test(e.x, e.z, 0.6, { type: 'egg', ref: e, armed: false }, 10)
    for (const r of this.resources) test(r.x, r.z, 0.25, { type: 'res', ref: r, armed: false }, 8)
    for (const f of this.foods) test(f.x, f.z, 0.3, { type: 'food', ref: f, armed: false }, 8)
    return best
  }

  private pickValid(p: Pick) {
    switch (p.type) {
      case 'creature': return this.creatures.includes(p.ref) && p.ref.state !== 'dead'
      case 'house': return this.houses.includes(p.ref)
      case 'struct': return this.structs.includes(p.ref)
      case 'item': return this.items.includes(p.ref)
      case 'egg': return this.eggs.includes(p.ref)
      case 'res': return this.resources.includes(p.ref)
      case 'food': return this.foods.includes(p.ref)
    }
  }

  private pickPos(p: Pick): { x: number; z: number; h: number } {
    const r = p.ref
    switch (p.type) {
      case 'creature': return { x: r.x, z: r.z, h: this.size(r) + r.jy + 0.4 }
      case 'house': return { x: r.x, z: r.z, h: r.level >= 4 ? 2.6 : r.level >= 3 ? 2.1 : 1.4 }
      case 'struct': return { x: r.x, z: r.z, h: { castle: 3.6, tower: 2.9, cradle: 1.8, well: 1.7, farm: 1.2, wall: 1.2, bridge: 0.9 }[r.kind as StructKind] }
      case 'item': return { x: r.x, z: r.z, h: (r.kind === 'sapling' ? 1.0 + r.grow * 1.3 : ITEM_SPEC[r.kind as ItemKind].pickH) + 0.4 + (r.fall ?? 0) }
      default: return { x: r.x, z: r.z, h: 1.2 }
    }
  }

  /** ひょうじする内容：なまえ・ひとこと・説明・ゲージ・けせるか */
  private describe(p: Pick): { title: string; sub: string; lines: string[]; bars: [string, number, string][]; del: string | null } {
    const bars: [string, number, string][] = []
    const lines: string[] = []
    switch (p.type) {
      case 'creature': {
        const c: Creature = p.ref
        const team = c.team === 'pet' ? 'ペット' : c.team === 'friend' ? 'なかま' : c.army ? 'てきぐん' : c.sp.temper === 'wild' ? 'てき' : 'やせい'
        const fam = c.sp.tier ? FAMILY_NAME[familyOf(c.sp.id)] : 'てき'
        lines.push(`${team}・${fam}・ランク${c.sp.tier || '-'}${c.grow > 0 ? '・こども' : ''}`)
        if (c.rare) lines.push('★ いろちがい（めずらしい！）' + (lookOf(c.seed) ? `・${LOOK_NAME[lookOf(c.seed)]}` : ''))
        else if (c.sp.tier > 0 && lookOf(c.seed)) lines.push(`からだ：${LOOK_NAME[lookOf(c.seed)]}`)
        lines.push(`こうげき ${Math.round(c.atk)}  すばやさ ${c.sp.speed.toFixed(1)}  ${c.role !== 'free' ? 'やくわり ' + ROLE_NAME[c.role] : ''}`)
        lines.push(`いま：${STATE_NAME[c.state] ?? c.state}`)
        bars.push(['たいりょく', c.hp / c.maxHp, '#7cf29b'])
        if (c.team === 'wild' && c.sp.temper === 'calm') bars.push(['なかよし', Math.min(1, c.affinity / 100), '#ff7eb6'])
        else if (this.ally(c) && c.sp.tier >= 1 && c.sp.tier <= 3) bars.push(['しんか', Math.min(1, (c === this.pet ? this.xp : c.xp) / XP_NEED[c.sp.tier as 1 | 2 | 3]), '#c9a8ff'])
        return { title: (c.rare ? '★' : '') + c.sp.name + (c === this.pet ? ' ★' : ''), sub: c.sp.kind, lines, bars, del: null }
      }
      case 'house': {
        const h: House = p.ref
        const lv = ['たてはじめ', 'どだい', 'かべ', 'かんせい', 'ぞうちく'][h.level]
        lines.push(`しざい ${h.mats}/${HOUSE_STEPS[4]}（${lv}）`)
        lines.push(h.owner ? `すんでいる：${h.owner.sp.name}` : 'あきや（だれかが すみつく）')
        if (h.level >= 1) bars.push(['じょうぶさ', h.hp / houseMaxHp(h.level), '#ff9f43'])
        bars.push(['できあがり', h.mats / HOUSE_STEPS[4], '#c8955a'])
        return { title: `${h.owner ? h.owner.sp.name : SPECIES[h.ownerSp].name}の いえ`, sub: '家', lines, bars, del: 'かいたい' }
      }
      case 'struct': {
        const b: Struct = p.ref
        const spec = STRUCTS[b.kind]
        const done = this.structDone(b)
        lines.push(done ? STRUCT_DESC[b.kind] : `けんせつちゅう：しざい ${b.mats}/${spec.need}`)
        if (!done) lines.push(STRUCT_DESC[b.kind])
        bars.push(done ? ['じょうぶさ', b.hp / spec.hp, '#ff9f43'] : ['できあがり', b.mats / spec.need, '#c8955a'])
        return { title: spec.name, sub: done ? 'たてもの' : 'けんせつちゅう', lines, bars, del: 'かいたい' }
      }
      case 'item': {
        const it: Item = p.ref
        const info = ITEM_INFO[it.kind] ?? { name: it.kind, desc: '' }
        lines.push(...info.desc.split('\n'))
        if (it.kind === 'sapling') {
          lines.push(`いま：${['めばえ', 'わかぎ', 'みのる木'][it.st ?? 0]}`)
          bars.push(['せいちょう', it.grow, '#7cf29b'])
        }
        return { title: info.name, sub: 'おきもの', lines, bars, del: 'かたづける' }
      }
      case 'egg': {
        const e: Egg = p.ref
        lines.push(e.wild ? 'のはらで みつけた たまご' : e.kind === 'inherit' ? `おやの こ（${e.parents.map((id) => SPECIES[id].name).join('・')}）` : 'あたらしい けいとうの たまご')
        lines.push(`かえるまで あと ${Math.max(0, Math.ceil(e.t))}びょう`)
        return { title: `${FAMILY_NAME[e.kind]}のたまご`, sub: 'たまご', lines, bars, del: 'どける' }
      }
      case 'res': {
        const r: Res = p.ref
        lines.push('いえや たてものの ざいりょう。だれかが ひろっていく')
        return { title: r.kind === 'wood' ? 'もくざい' : 'いし', sub: 'しざい', lines, bars, del: 'かたづける' }
      }
      case 'food': {
        const f: Food = p.ref
        const name = f.kind === 'stage' ? this.stage.food.name : FOODS[f.kind].name
        lines.push('おなかが すいた子が たべにくる')
        return { title: name, sub: 'たべもの', lines, bars, del: 'かたづける' }
      }
    }
  }

  /** かいたい・かたづける。家や建物は しざいがのこる */
  private removePick(p: Pick) {
    const rubble = (x: number, z: number, mats: number) => {
      for (let i = 0; i < Math.min(4, Math.ceil(mats / 3)); i++) this.spawnResource(x + (Math.random() - 0.5) * 2, z + 1 + Math.random(), undefined, true)
    }
    switch (p.type) {
      case 'house': {
        const h: House = p.ref
        this.unmountHouse(h)
        this.houses.splice(this.houses.indexOf(h), 1)
        for (const c of this.creatures) if (c.raid === h) c.raid = null
        rubble(h.x, h.z, h.mats)
        this.burst(h.x, this.stage.heightAt(h.x, h.z) + 0.8, h.z, 'cube', 10, 3)
        this.say('いえを かいたいした')
        break
      }
      case 'struct': {
        const b: Struct = p.ref
        this.unmountStruct(b)
        this.structs.splice(this.structs.indexOf(b), 1)
        for (const c of this.creatures) {
          if (c.site === b) c.site = null
          if (c.tendTo === b) c.tendTo = null
        }
        rubble(b.x, b.z, b.mats)
        this.burst(b.x, this.stage.heightAt(b.x, b.z) + 0.8, b.z, 'cube', 10, 3)
        this.say(`${STRUCTS[b.kind].name}を かいたいした`)
        break
      }
      case 'item': {
        const it: Item = p.ref
        this.unmountItem(it)
        this.items.splice(this.items.indexOf(it), 1)
        this.burst(it.x, this.stage.heightAt(it.x, it.z) + 0.5, it.z, 'cube', 6, 2)
        this.say(`${(ITEM_INFO[it.kind] ?? { name: 'おきもの' }).name}を かたづけた`)
        break
      }
      case 'egg': {
        const e: Egg = p.ref
        this.scene.remove(e.anim.sprite, e.shadow)
        e.anim.dispose()
        this.eggs.splice(this.eggs.indexOf(e), 1)
        this.say('たまごを どけた')
        break
      }
      case 'res': {
        const r: Res = p.ref
        this.scene.remove(r.mesh)
        this.resources.splice(this.resources.indexOf(r), 1)
        for (const c of this.creatures) if (c.res === r) c.res = null
        break
      }
      case 'food': {
        const f: Food = p.ref
        for (const c of this.creatures) if (c.food === f) c.food = null
        this.removeFood(f)
        break
      }
      default:
        return
    }
    this.onSfx('cancel')
    this.picked = null
    this.infoBox = null
    this.save()
  }

  /** 情報ウィンドウ（下がわ）と、えらんだ物のしるし */
  private drawInfo() {
    const p = this.picked
    if (!p) return
    if (!this.pickValid(p)) {
      this.picked = null
      this.infoBox = null
      return
    }
    if (p.armed && this.time > this.armUntil) p.armed = false
    const g = this.hudCtx
    const pos = this.pickPos(p)
    const s = this.projectXYZ(pos.x, this.stage.heightAt(pos.x, pos.z) + pos.h, pos.z)
    if (s.on) {
      const by = s.y - 4 + Math.round(Math.sin(this.time * 6) * 2)
      g.fillStyle = '#10122a'
      g.fillRect(s.x - 5, by - 1, 11, 2)
      g.fillStyle = '#ffd23f'
      for (let i = 0; i < 4; i++) g.fillRect(s.x - 4 + i, by + i, 9 - i * 2, 1)
    }
    const d = this.describe(p)
    const w = 244
    const rows = d.lines.length + d.bars.length
    const h = 36 + rows * 13 + 24
    const x = (RES.w - w) / 2
    const y = RES.h - 28 - h
    this.win(x, y, w, h)
    this.text(d.title, x + 10, y + 7, '#ffffff', 12)
    this.text(d.sub, x + w - 10, y + 9, '#9fd8ff', 9, 'right')
    let ry = y + 25
    for (const l of d.lines) {
      this.text(l, x + 10, ry, '#e8eeff', 9)
      ry += 13
    }
    for (const [n, v, col] of d.bars) {
      this.text(n, x + 10, ry, '#e8eeff', 9)
      this.bar(x + 74, ry + 4, 150, Math.max(0, Math.min(1, v)), col)
      ry += 13
    }
    // ボタン
    const by2 = y + h - 21
    const close = { x: x + (d.del ? w - 88 : w - 88), y: by2, w: 78, h: 15 }
    const del = d.del ? { x: x + 10, y: by2, w: 120, h: 15 } : null
    for (const [b, label, col] of [[close, 'とじる', 'rgba(255,255,255,0.18)'], [del, p.armed ? 'ほんとうに？ もういちど' : d.del ?? '', p.armed ? 'rgba(232,90,90,0.95)' : 'rgba(180,70,70,0.7)']] as const) {
      if (!b) continue
      g.fillStyle = col
      g.fillRect(b.x, b.y, b.w, b.h)
      g.strokeStyle = 'rgba(255,255,255,0.6)'
      g.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1)
      this.text(label, b.x + b.w / 2, b.y + 3, '#ffffff', 9, 'center')
    }
    this.infoBox = { x, y, w, h, del, close }
  }

  /** 情報ウィンドウが開いている時のタップ */
  private tapInfo(x: number, y: number): boolean {
    const b = this.infoBox
    const p = this.picked
    if (!b || !p) return false
    const inside = (r: { x: number; y: number; w: number; h: number }) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
    if (b.del && inside(b.del)) {
      if (p.armed) this.removePick(p)
      else {
        p.armed = true
        this.armUntil = this.time + 3
        this.onSfx('select')
      }
      return true
    }
    if (inside(b.close)) {
      this.picked = null
      this.infoBox = null
      this.onSfx('cancel')
      return true
    }
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true
    // ウィンドウの外：べつの物をえらぶ / 何もなければ閉じる
    const next = this.pickAt(x, y)
    if (next) {
      this.picked = next
      this.onSfx('select')
    } else {
      this.picked = null
      this.infoBox = null
      this.onSfx('cancel')
    }
    return true
  }


  // ================= かいたく =================
  /** 箱庭をひろげる（ステージを作り直す。家・建物・置き物・たまごはそのまま残る） */
  private expandLand(level: number) {
    const eggs = this.eggs.map((e) => ({ x: e.x, z: e.z, t: e.t, parents: e.parents, kind: e.kind, wild: e.wild, lucky: e.lucky }))
    this.land = level
    setLandSize(LAND_SIZES[level])
    this.flash = 1
    this.loadStage(this.stageIndex)
    for (const e of eggs) this.layEgg(e.x, e.z, e.parents, e.t, e.kind, e.wild, e.lucky)
    this.say(`はこにわが ${LAND_SIZES[level]} に ひろがった！`)
    this.onSfx('warp')
    this.save()
  }

  // ================= ずかん =================
  private updateDex() {
    const add = (id: string, lv: 1 | 2) => {
      const cur: number = this.dex[id] ?? 0
      if (cur < lv) {
        this.dex[id] = lv
        if (cur === 0) this.dexNew.push(id)
      }
    }
    for (const c of this.creatures) {
      if (c.state === 'dead') continue
      add(c.sp.id, this.ally(c) ? 2 : 1)
      if (c.rare) this.addRareDex(c)
    }
    if (this.dexNew.length && --this.dexMsgT <= 0) {
      const names = this.dexNew.splice(0).map((id) => SPECIES[id as SpeciesId].name)
      this.say(`ずかんに とうろく：${names.slice(0, 3).join('・')}${names.length > 3 ? ' ほか' : ''}`)
      this.dexMsgT = 4
    }
    const TH = [5, 10, 20, 30, 40, 49]
    const RW = [30, 50, 100, 150, 200, 500]
    const owned = Object.entries(this.dex).filter(([k, v]) => v === 2 && !isSecretId(k)).length
    while (this.dexClaimed < TH.length && owned >= TH[this.dexClaimed]) {
      this.say(`ずかん ${TH[this.dexClaimed]}しゅ たっせい！ コイン+${RW[this.dexClaimed]}`)
      this.earn(RW[this.dexClaimed])
      this.dexClaimed++
    }
  }

  /** 色ちがいをずかんに記録する（みつけた = 1 / なかまにした = 2。はじめての時だけ知らせる） */
  private addRareDex(c: Creature) {
    const id = c.sp.id
    const lv: 1 | 2 = this.ally(c) ? 2 : 1
    const cur: number = this.dexRare[id] ?? 0
    if (cur >= lv) return
    this.dexRare[id] = lv
    if (cur === 0) this.say(`★ いろちがいの ${c.sp.name}を みつけた！ ずかんに のった`)
    if (lv === 2) {
      this.say(`★ いろちがいの ${c.sp.name}が なかまに！ コイン+20`)
      this.earn(20)
    }
  }

  /** ずかんの一覧（系統ごと・段階の順） */
  dexList() {
    const order = ['めばえ', 'きかい', 'りゅう', 'ねこ', 'いぬ', 'とり', 'みず', 'モンスター', 'てき']
    const fam = (id: SpeciesId) => (SPECIES[id].tier ? FAMILY_NAME[familyOf(id)] : 'てき')
    return (Object.values(SPECIES) as Species[])
      .filter((sp) => !isSecretId(sp.id))
      .map((sp) => ({ id: sp.id, name: sp.name, kind: sp.kind, tier: sp.tier, family: fam(sp.id), state: this.dex[sp.id] ?? 0, rare: this.dexRare[sp.id] ?? 0 }))
      .sort((a, b) => order.indexOf(a.family) - order.indexOf(b.family) || a.tier - b.tier)
  }
  dexInfo() {
    const all = (Object.values(SPECIES) as Species[]).filter((sp) => !isSecretId(sp.id))
    return {
      owned: Object.entries(this.dex).filter(([k, v]) => v === 2 && !isSecretId(k)).length,
      total: all.filter((s) => s.tier > 0).length,
      seen: Object.keys(this.dex).filter((k) => !isSecretId(k)).length,
      rareSeen: Object.keys(this.dexRare).length,
      rareOwned: Object.values(this.dexRare).filter((v) => v === 2).length,
      all: all.length,
      gen: this.stats.gen,
      lineage: this.stats.lineage,
      pet: this.pet.sp.name,
      life: Math.min(1, this.stats.petAge / LIFESPAN),
    }
  }

  // ================= 役割分担 =================
  /** 仲間を だいく・はたけがかり・みはりに わりふる（性格と、村に何が足りないかで決める） */
  private assignRoles() {
    const allies = this.creatures.filter((c) => c.team === 'friend' && c.grow === 0 && c.sp.tier >= 2 && this.alive(c))
    const done = (k: StructKind) => this.structs.filter((b) => b.stage === this.stageIndex && b.kind === k && this.structDone(b)).length
    const want: Record<Role, number> = {
      farmer: done('farm'),
      guard: done('tower') + done('castle') * 2 + (this.vLv >= 1 ? 1 : 0),
      builder: 99,
      free: 0,
    }
    const count: Record<Role, number> = { free: 0, builder: 0, farmer: 0, guard: 0 }
    let said = false
    for (const c of allies) {
      const pref: Role[] = c.bias === 'power' ? ['guard', 'builder', 'farmer'] : c.bias === 'guard' ? ['builder', 'guard', 'farmer'] : ['farmer', 'builder', 'guard']
      const role = pref.find((r) => count[r] < want[r]) ?? 'free'
      count[role]++
      if (role !== c.role) {
        c.role = role
        if (!said && role !== 'free' && Math.hypot(c.x - this.look.x, c.z - this.look.z) < 10) {
          said = true
          this.say(`${c.sp.name}は ${ROLE_NAME[role]}に なった`)
        }
      }
    }
    for (const c of this.creatures) if (!allies.includes(c)) c.role = 'free'
  }

  /** みはりの立つ場所（みはりとう・おしろのそば） */
  private guardPost(c: Creature) {
    let best: Struct | null = null
    let bd = 99
    for (const b of this.structs) {
      if (b.stage !== this.stageIndex || !this.structDone(b) || (b.kind !== 'tower' && b.kind !== 'castle')) continue
      const d = Math.hypot(b.x - c.x, b.z - c.z)
      if (d < bd) {
        bd = d
        best = b
      }
    }
    return best
  }

  // ================= 世代交代 =================
  /** あそんだ時間をすすめる（テスト用：minutes 分ぶん） */
  ageUp(minutes: number) {
    this.stats.petAge += minutes * 60
  }

  private updateAge(dt: number) {
    if (this.retiring || !this.alive(this.pet)) return
    this.stats.petAge += dt
    const life = this.stats.petAge / LIFESPAN
    if (!this.oldWarned && life > 0.85) {
      this.oldWarned = true
      this.say(`${this.pet.sp.name}も ずいぶん としを とった… そろそろ じゅみょうが ちかい`)
    }
    if (life >= 1 && this.pet.state !== 'fight' && this.pet.grow === 0) this.retirePet()
  }

  /** ペットが ねんれいで ねむり、たまごから 次の代が うまれる */
  private retirePet() {
    const p = this.pet
    const old = p.sp
    this.retiring = true
    this.say(`${old.name}は ねんれいを むかえ… やすらかに ねむりについた`)
    this.onSfx('lose')
    this.flash = 0.7
    this.setState(p, 'sleep', 4)
    this.placeMemorial(p.x, p.z)
    this.burst(p.x, this.ground(p) + 0.8, p.z, 'heart', 8, 2)
    this.after(3.4, () => this.rebirth(old))
  }

  private rebirth(old: Species) {
    const p = this.pet
    const fam = familyOf(old.id)
    // 親の系統の赤ちゃん（ときどき、その場所らしい系統に突然変異）
    let kind: EggKind = fam === 'plain' ? 'inherit' : (fam as EggKind)
    if (Math.random() < 0.25) kind = this.stageEggKind()
    const id = (kind === 'inherit' ? 'mebu' : BABY[kind]) as SpeciesId
    const sp = SPECIES[id]
    this.stats.lineage = [...this.stats.lineage, old.name].slice(-12)
    this.stats.gen++
    this.stats.petAge = 0
    this.oldWarned = false
    // 育ちの傾向は 3 割だけ引きつぐ。代をかさねるほど少し強く生まれる
    this.care = { power: this.care.power * 0.3, guard: this.care.guard * 0.3, spirit: this.care.spirit * 0.3 }
    this.xp = 0
    this.eatenOf.set(p, {})
    const legacy = 1 + Math.min(0.4, 0.05 * (this.stats.gen - 1))
    p.sp = sp
    // 次の代は見た目も新しく（もようのシード・3% で色ちがい）
    p.evo = null
    p.seed = newSeed()
    p.rare = Math.random() < RARE_RATE
    p.grow = 0.01
    p.maxHp = Math.round(sp.hp * 0.6 * legacy)
    p.hp = p.maxHp
    p.atk = Math.round(sp.atk * legacy * 10) / 10
    p.hunger = 100
    p.energy = 100
    p.anim.setSpecies(id, this.size(p), this.variant(p))
    this.setState(p, 'happy', 2)
    this.burst(p.x, this.ground(p) + 0.8, p.z, 'spark', 20, 3)
    this.ring(p.x, p.z, '#ffe27a', 3, 0.9)
    this.flash = 1
    this.onSfx('evolve')
    this.say(`たまごが ひかり ${p.rare ? '★ いろちがいの ' : ''}${sp.name}が うまれた！ だい${this.stats.gen}せだい`)
    this.earn(50)
    this.retiring = false
  }

  /** おはか（ほしの かざり）。4 つまで */
  private placeMemorial(x: number, z: number) {
    const here = this.items.filter((it) => it.kind === 'memorial')
    if (here.length >= 4) {
      const old = here[0]
      this.unmountItem(old)
      this.items.splice(this.items.indexOf(old), 1)
    }
    const it: Item = { kind: 'memorial', stage: this.stageIndex, x: x + 0.9, z, grow: 1, vx: 0, vz: 0, mesh: null, rot: 0, sq: 0, tick: 0 }
    this.items.push(it)
    this.mountItem(it)
  }

  private updateVillage(dt: number) {
    this.villageT += dt
    if (this.villageT < 1) return
    this.villageT = 0
    this.calcVillage()
    this.updateDex()
    this.updateSecrets()
    this.roleT += 1
    if (this.roleT >= 15) {
      this.roleT = 0
      this.assignRoles()
    }
    if (this.vLv > this.villageSeen) {
      this.say(this.vLv === 1 ? `${this.villageName()}が うまれた！` : this.vLv === 2 ? `${this.villageName()}に はったつした！` : `${this.villageName()}が さかえている！`)
      this.earn(this.vLv * 15)
      this.onSfx('win')
    }
    this.villageSeen = this.vLv
    // みんなで勝手に はたけ・いどを つくる（人が何もしなくても村は少しずつ育つ）
    this.autoPlanT += 1
    if (this.autoPlanT >= 20 && !this.openSite(null)) {
      this.autoPlanT = 0
      const homes = this.houses.filter((h) => h.stage === this.stageIndex && h.level >= 3).length
      const has = (k: StructKind) => this.structs.some((b) => b.stage === this.stageIndex && b.kind === k)
      // やることが何もない時は、村に足りない建物を自分たちで計画する（おしろ・はしは人がせっけいずを買った時だけ）
      const next: [StructKind, number][] = [['farm', 2], ['well', 3], ['tower', 3], ['cradle', 4]]
      const want = next.find(([k, n]) => homes >= n && !has(k))
      if (want) this.planStruct(want[0], this.pet.x, this.pet.z, true)
    }
  }
  private autoPlanT = 0

  // ================= 敵軍 =================
  /** 敵軍をよぶ（村がある程度育つと自分でも来る）。n = 敵の数 */
  callArmy(n?: number) {
    if (this.army) return
    this.armyWave++
    this.calcVillage()
    const castle = this.structs.some((b) => b.stage === this.stageIndex && b.kind === 'castle')
    this.army = { phase: 'warn', t: 18, left: [], n: n ?? Math.min(12, 3 + Math.floor(this.vScore * 0.7)), castle, wave: this.armyWave }
    this.say('てきぐんが ちかづいている…！ そなえよう')
    this.onSfx('boom')
    this.shake = Math.max(this.shake, 0.3)
  }

  private launchArmy(a: Army) {
    a.phase = 'on'
    a.t = 150
    const mult = 1 + 0.15 * (a.wave - 1)
    for (let i = 0; i < a.n; i++) {
      const boss = i === 0 && a.wave % 3 === 0
      // 編成：ふつうの兵は もとの敵 + そのステージの亜種、3 回に 1 回は専用の姿のボス
      const id: SpeciesId = boss ? armyBoss(this.stageIndex, a.wave) : armyMember(this.stageIndex, a.wave)
      const x = THREE.MathUtils.clamp((Math.random() * 2 - 1) * (HALF - 1), -HALF, HALF)
      const z = -HALF + 0.6 + Math.random() * 1.2
      const c = this.spawn(id, 'wild', x, z)
      c.army = true
      c.maxHp = Math.round(c.sp.hp * mult * (boss ? 2.5 : 1))
      c.hp = c.maxHp
      c.atk = c.sp.atk * mult * (boss ? 1.4 : 1)
      if (boss) {
        this.ring(x, z, '#ff7a2a', 3.4, 1)
        this.popups.push({ pos: new THREE.Vector3(x, this.size(c) + 0.6, z), text: `ボス ${c.sp.name}！`, color: '#ff7a2a', t: 0, big: true })
      }
      this.setState(c, 'march', 8)
      a.left.push(c)
    }
    const bossName = a.left.find((c) => c.sp.boss)?.sp.name
    this.say(`てきぐん ${a.n}たいが せめてきた！${bossName ? ` ボス ${bossName}もいる！` : ''}`)
    this.onSfx('boom')
    this.shake = Math.max(this.shake, 0.4)
  }

  private updateArmy(dt: number) {
    const a = this.army
    if (!a) {
      this.armyCd -= dt
      if (this.armyCd <= 0) {
        if (this.vScore >= 5 && this.alive(this.pet)) this.callArmy()
        else this.armyCd = 40
      }
      return
    }
    a.t -= dt
    if (a.phase === 'warn') {
      if (a.t <= 0) this.launchArmy(a)
      return
    }
    a.left = a.left.filter((c) => this.creatures.includes(c) && c.state !== 'dead')
    for (const c of a.left) {
      c.energy = Math.max(c.energy, 60)
      c.hunger = Math.max(c.hunger, 50)
    }
    if (!a.left.length) {
      const reward = 20 + a.n * 5 + (a.castle && this.structs.some((b) => b.kind === 'castle' && b.stage === this.stageIndex) ? 20 : 0)
      this.say(`てきぐんを おいはらった！ コイン+${reward}`)
      this.earn(reward)
      this.onSfx('win')
      for (let i = 0; i < 3; i++) this.spawnResource(undefined, undefined, undefined, true)
      this.army = null
      this.armyCd = 200 + Math.random() * 60
    } else if (a.t <= 0) {
      for (const c of a.left) this.setState(c, 'dead', 0.8)
      this.say('てきぐんは ひきあげていった')
      this.army = null
      this.armyCd = 200 + Math.random() * 60
    }
  }

  private spawnResource(x?: number, z?: number, want?: ResKind, force = false) {
    if (this.resources.length >= MAX_RES + (force ? 8 : 0)) return
    const kind: ResKind = want ?? (Math.random() < 0.55 ? 'wood' : 'stone')
    if (x === undefined || z === undefined) {
      // 木や岩のそばに落ちている
      const land = this.stage.obstacles.filter((o) => !o.water)
      const o = land[Math.floor(Math.random() * land.length)]
      if (!o) return
      const a = Math.random() * Math.PI * 2
      x = o.x + Math.cos(a) * (o.r + 0.6 + Math.random() * 0.7)
      z = o.z + Math.sin(a) * (o.r + 0.6 + Math.random() * 0.7)
    }
    x = THREE.MathUtils.clamp(x, -HALF, HALF)
    z = THREE.MathUtils.clamp(z, -HALF, HALF)
    if (!force && this.obstacles().some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.2)) return
    const mesh =
      kind === 'wood'
        ? new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.5, 6).rotateZ(Math.PI / 2), this.lam('#8a5a34', { map: Tex.bark() }))
        : new THREE.Mesh(new THREE.DodecahedronGeometry(0.15, 0), this.lam('#9aa1ab', { map: Tex.rock() }))
    mesh.position.set(x, this.stage.heightAt(x, z) + 0.08, z)
    mesh.rotation.y = Math.random() * Math.PI
    this.scene.add(mesh)
    this.resources.push({ kind, x, z, mesh, taken: null })
  }

  private updateResources(dt: number) {
    this.resT += dt
    if (this.resT > (this.structs.some((b) => b.stage === this.stageIndex && b.mats < STRUCTS[b.kind].need) ? 3.2 : 6)) {
      this.resT = 0
      this.spawnResource()
    }
  }

  /** 運んでいた資材をその場に落とす（落とした物はまた拾える） */
  private dropCarry(c: Creature, leave: boolean) {
    if (!c.carryMesh) {
      c.carry = null
      return
    }
    this.scene.remove(c.carryMesh)
    if (leave && c.carry && this.resources.length < MAX_RES) {
      c.carryMesh.scale.setScalar(1)
      c.carryMesh.position.set(c.x, this.stage.heightAt(c.x, c.z) + 0.08, c.z)
      this.scene.add(c.carryMesh)
      this.resources.push({ kind: c.carry, x: c.x, z: c.z, mesh: c.carryMesh, taken: null })
    } else {
      c.carryMesh.geometry.dispose()
      ;(c.carryMesh.material as THREE.Material).dispose()
    }
    c.carry = null
    c.carryMesh = null
  }

  // ================= 天気 =================
  private pickWeather(): Weather {
    const w = WEATHER_W[this.stageIndex] ?? WEATHER_W[0]
    const list = (Object.keys(w) as Weather[]).filter((k) => k !== this.weather || Math.random() < 0.3)
    const total = list.reduce((a, k) => a + (w[k] ?? 0), 0)
    let r = Math.random() * total
    for (const k of list) {
      r -= w[k] ?? 0
      if (r <= 0) return k
    }
    return 'sun'
  }

  setWeather(w: Weather, quiet = false) {
    const changed = w !== this.weather
    if (changed && !quiet && this.weather === 'rain') this.secret.rainEnd = this.time
    // 雨あがりににじ（まだ雨がのこっている間に はれた時）
    if (changed && this.weather === 'rain' && w === 'sun' && this.wx.rain > 0.3 && this.night < 0.5) {
      this.wx.bowT = BOW_LEN
      // にじは、そのとき見ている向きに かかる
      const d = this.camera.getWorldDirection(new THREE.Vector3())
      const h = Math.hypot(d.x, d.z)
      fxU.uBowDir.value.set(h > 0.2 ? d.x / h : 0, 0, h > 0.2 ? d.z / h : -1)
      if (!quiet) this.after(2.5, () => this.say('にじが かかった！'))
    }
    this.weather = w
    this.weatherT = 60 + Math.random() * 90
    // ステージを切りかえた時は、粒と空を すぐ今の天気に合わせる（ワープの画面のゆがみでかくれる）
    if (quiet) {
      const T = WX[w]
      Object.assign(this.wx, { rain: T.rain, snow: T.snow, ember: T.ember, wind: T.wind, cloud: T.cloud, grey: T.grey, mist: Math.max(T.mist, this.morning ? 0.85 : 0) })
    }
    if (changed && !quiet) this.say(WEATHER_MSG[w])
  }

  /** 朝はもやが出る（main.ts が時間帯を渡す） */
  setDayPart(part: string) {
    this.morning = part === 'morning'
  }

  /** 画質。低 = 雨・雪・火の粉を減らし、雲の影・水たまり・波紋・風のゆれ・もや・熱のゆらぎ・水面のきらめきを切る */
  setQuality(q: 'high' | 'low') {
    this.high = q === 'high'
    fxU.uHigh.value = this.high ? 1 : 0
    this.wfx.setQuality(this.high)
    fxLod(this.stage.group, this.high)
    this.setItemQuality(q)
  }

  private updateWeather(dt: number) {
    this.weatherT -= dt
    if (this.weatherT <= 0) this.setWeather(this.pickWeather())
    const target = { sun: 1, cloud: 0.72, rain: 0.6, snow: 0.86, ember: 0.78 }[this.weather]
    this.weatherDim += (target - this.weatherDim) * Math.min(1, dt * 0.8)

    // 天気の強さを目標へ なめらかに（約 4 秒で入れかわる）
    const T = WX[this.weather]
    const wx = this.wx
    const k = 1 - Math.exp(-dt * 0.7)
    wx.rain += (T.rain - wx.rain) * k
    wx.snow += (T.snow - wx.snow) * k
    wx.ember += (T.ember - wx.ember) * k
    wx.wind += (T.wind - wx.wind) * k * 0.6
    wx.cloud += (T.cloud - wx.cloud) * k * 0.5
    wx.grey += (T.grey - wx.grey) * k * 0.5
    wx.mist += (Math.max(T.mist, this.morning ? 0.85 : 0) - wx.mist) * k * 0.4
    // ぬれ：雨で上がり、止むとゆっくりかわく / 雪：降るほど積もり、止むと溶ける（ひのこ・はれは早い）
    wx.wet = THREE.MathUtils.clamp(wx.wet + (this.weather === 'rain' ? dt / 14 : this.weather === 'ember' ? -dt / 25 : -dt / 70), 0, 1)
    const melt = this.weather === 'ember' ? 22 : this.weather === 'sun' ? 50 : 80
    wx.cover = THREE.MathUtils.clamp(wx.cover + (this.weather === 'snow' ? (dt / 80) * wx.snow : -dt / melt), 0, 1)
    // にじ（出て、しばらくして消える）
    if (wx.bowT > 0) {
      wx.bowT = Math.max(0, wx.bowT - dt)
      wx.bow = Math.pow(Math.sin(Math.PI * (1 - wx.bowT / BOW_LEN)), 0.6)
    } else wx.bow = 0

    // 共通の uniform（地形・木・水・空のシェーダーが読む）
    const ang = 0.55 + Math.sin(this.time * 0.04) * 0.5
    fxU.uWindDir.value.set(Math.cos(ang), Math.sin(ang))
    fxU.uDrift.value.addScaledVector(fxU.uWindDir.value, (0.18 + wx.wind * 0.5) * dt)
    fxU.uTime.value = this.time
    fxU.uWind.value = wx.wind
    fxU.uWet.value = wx.wet
    fxU.uRain.value = wx.rain
    fxU.uSnow.value = wx.cover
    fxU.uCloud.value = wx.cloud * (1 - this.night) * (1 - wx.grey * 0.6)
    fxU.uNight.value = this.night
    fxU.uGlint.value = (1 - this.night * 0.5) * Math.max(0, 1 - wx.grey * 1.15)
    fxU.uGrey.value = wx.grey
    fxU.uEmber.value = wx.ember
    fxU.uBow.value = wx.bow
    this.post.uniforms.heat.value = this.high ? wx.ember : 0
    const fog = this.scene.fog as THREE.Fog
    this.wfx.update(this.look, this.stage.heightAt(this.look.x, this.look.z), { rain: wx.rain, snow: wx.snow, ember: wx.ember, mist: wx.mist }, fog.color)
  }

  // ================= たまご =================
  private tryBreed(dt: number) {
    this.breedT += dt
    this.breedCd -= dt
    const cradle = this.structs.some((b) => b.kind === 'cradle' && b.stage === this.stageIndex && b.mats >= STRUCTS.cradle.need)
    if (this.breedT < 8 || this.breedCd > 0 || this.eggs.length >= (cradle ? 3 : 2)) return
    this.breedT = 0
    const p = this.pet
    const ready = (c: Creature) => this.alive(c) && c.grow === 0 && c.sp.tier >= 2 && c.hunger > 50 && c.energy > 35 && c.state !== 'fight'
    if (!ready(p) || this.stats.mood < 55) return
    const mate = this.creatures.find((c) => c.team === 'friend' && ready(c) && Math.hypot(c.x - p.x, c.z - p.z) < 3)
    if (!mate) return
    const fire = this.item('fire')
    const nearFire = fire && Math.hypot(fire.x - p.x, fire.z - p.z) < 3
    const chance = 0.22 * (nearFire ? 2 : 1) * (this.night > 0.5 ? 1.5 : 1) * (cradle ? 1.8 : 1)
    if (Math.random() > chance) return
    this.breedCd = 90
    // たまごの系統：親の系統を受けつぐ（ときどき この場所らしい系統に突然変異）
    const fams = [familyOf(p.sp.id), familyOf(mate.sp.id)].filter((f) => f !== 'plain') as EggKind[]
    let kind: EggKind = 'inherit'
    const r = Math.random()
    if (fams.length && r < 0.6) kind = fams[Math.floor(Math.random() * fams.length)]
    else if (r > 0.75) kind = this.stageEggKind()
    this.layEgg((p.x + mate.x) / 2, (p.z + mate.z) / 2, [p.sp.id, mate.sp.id], 35, kind)
    this.burst(p.x, this.ground(p) + 1, p.z, 'heart', 6, 1.5)
    this.say(`${p.sp.name}と ${mate.sp.name}に たまごが できた！`)
    this.onSfx('egg')
  }

  /** この場所でよく見つかる系統のたまご */
  private stageEggKind(): EggKind {
    const pool = STAGE_EGGS[this.stageIndex] ?? STAGE_EGGS[0]
    return pool[Math.floor(Math.random() * pool.length)]
  }

  private layEgg(x: number, z: number, parents: SpeciesId[], t = 35, kind: EggKind = 'inherit', wild = false, lucky = false) {
    const anim = new SpriteAnim(this.eggSheets[kind], kind === 'inherit' ? 0.6 : 0.68)
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat)
    shadow.scale.setScalar(0.5)
    this.scene.add(anim.sprite, shadow)
    this.eggs.push({ x, z, t, anim, shadow, parents, kind, wild, lucky })
  }

  /** ときどき、その場所らしい系統のたまごが野原に落ちている（かえった子は野生で、仲良くなると仲間に） */
  private updateWildEgg(dt: number) {
    this.wildEggT -= dt
    if (this.wildEggT > 0) return
    this.wildEggT = 150 + Math.random() * 100
    if (this.eggs.length >= 3) return
    const q = this.freePos(3)
    const kind = this.stageEggKind()
    this.layEgg(q.x, q.z, [], 60, kind, true)
    if (Math.hypot(q.x - this.look.x, q.z - this.look.z) < 10) this.say(`${FAMILY_NAME[kind]}のたまごが おちている！`)
  }

  private updateEggs(dt: number) {
    this.updateWildEgg(dt)
    for (const e of [...this.eggs]) {
      e.t -= dt
      const y = this.stage.heightAt(e.x, e.z)
      e.anim.sprite.position.set(e.x, y, e.z)
      e.shadow.position.set(e.x, y + 0.03, e.z)
      // 生まれそうになると揺れる
      e.anim.material.rotation = e.t < 8 ? Math.sin(this.time * (e.t < 3 ? 30 : 14)) * 0.25 : 0
      if (e.t <= 0) {
        this.scene.remove(e.anim.sprite, e.shadow)
        e.anim.dispose()
        this.eggs.splice(this.eggs.indexOf(e), 1)
        const fam = e.kind !== 'inherit'
        const id = (fam ? BABY[e.kind] : e.parents[Math.floor(Math.random() * e.parents.length)]) as SpeciesId
        // 色ちがい：ふつう 3%、ふしぎなたまごは 8%
        const rare = SPECIES[id].tier > 0 && Math.random() < (e.lucky ? RARE_RATE_LUCKY : RARE_RATE)
        const baby = this.spawn(id, e.wild ? 'wild' : 'friend', e.x, e.z, e.wild ? 0 : 0.01, { seed: newSeed(), rare })
        baby.anim.setHeight(this.size(baby))
        const star = rare ? '★ いろちがいの ' : ''
        if (rare) {
          this.burst(e.x, y + 0.6, e.z, 'spark', 10, 3, -1)
          this.ring(e.x, e.z, '#ffe27a', 2.6, 0.9)
        }
        baby.maxHp = Math.round(SPECIES[id].hp * (e.wild ? 1 : 0.6))
        baby.hp = baby.maxHp
        this.burst(e.x, y + 0.3, e.z, 'spark', 14, 2.5)
        if (e.wild) {
          if (Math.hypot(e.x - this.look.x, e.z - this.look.z) < 10) this.say(`${FAMILY_NAME[e.kind]}のたまごから ${star}${SPECIES[id].name}が うまれた！ なかよく なれるかな`)
        } else {
          this.stats.children++
          this.say(fam ? `${FAMILY_NAME[e.kind]}のたまごから ${star}${SPECIES[id].name}が うまれた！` : `たまごから ${star}${SPECIES[id].name}の こどもが うまれた！`)
          this.onSfx('evolve')
          this.earn(20)
        }
      }
    }
  }

  // ================= ボタン =================
  /** 戻り値 false = この画面では使わなかった（本体側で処理してよい） */
  press(key: 'A' | 'B' | 'C'): boolean {
    this.hudNow = true
    if (this.warp > 0) return true
    if (this.shopOpen) {
      if (key === 'A') {
        this.shopCursor = (this.shopCursor + 1) % SHOP.length
        this.onSfx('select')
      } else if (key === 'B') this.buy(SHOP[this.shopCursor])
      else {
        this.shopOpen = false
        this.onSfx('cancel')
      }
      return true
    }
    if (key === 'A') {
      this.cursor = (this.cursor + 1) % ICONS.length
      this.showStatus = false
      this.onSfx('select')
      return true
    }
    if (key === 'C') {
      if (this.showStatus) this.showStatus = false
      else if (this.cursor >= 0) this.cursor = -1
      else return false
      this.onSfx('cancel')
      return true
    }
    if (this.cursor < 0) {
      this.showStatus = !this.showStatus
      this.onSfx('ok')
      return true
    }
    this.run(this.cursor)
    return true
  }

  /** 買えるか と、買えない理由（ショップの色分けと「かえない」メッセージの元） */
  private shopCheck(s: ShopItem): ShopCheck {
    let have: number | undefined
    let max: number | undefined
    const no = (tone: ShopCheck['tone'], why: string): ShopCheck => ({ ok: false, tone, why, have, max })
    if (s.land) {
      if (this.land >= s.land) return no('done', 'この かいたくは もう すんでいる')
      if (this.land < s.land - 1) return no('lock', 'さきに かいたく ① を しよう')
    }
    if (s.item) {
      max = ITEM_SPEC[s.item].max
      have = this.items.filter((it) => it.kind === s.item && it.stage === this.stageIndex).length
      if (have >= max) return no('full', `この箱庭には もう おけない（${have}/${max}）`)
    }
    if (s.egg) {
      max = 3
      have = this.eggs.length
      if (have >= max) return no('full', `たまごは いっぱい（${have}/${max}）`)
    }
    if (s.plan) {
      const here = this.structs.filter((b) => b.stage === this.stageIndex)
      have = here.filter((b) => b.kind === s.plan).length
      max = s.plan === 'castle' ? 1 : s.plan === 'wall' ? undefined : 3
      if (here.length >= MAX_STRUCTS) return no('full', 'もう たてる ばしょが ない')
      if (max !== undefined && have >= max) return no('full', s.plan === 'castle' ? 'おしろは ひとつだけ' : `${STRUCTS[s.plan].name}は これいじょう いらない（${have}/${max}）`)
      if (s.plan === 'bridge' && !this.stage.obstacles.some((o) => o.water && !here.some((b) => b.kind === 'bridge' && Math.hypot(b.x - o.x, b.z - o.z) < 0.6)))
        return no('lock', 'この箱庭には わたる みずうみが ない')
    }
    if (this.coins < s.price) return no('coin', `コインが たりない（あと ${s.price - this.coins}）`)
    return { ok: true, tone: 'ok', why: '', have, max }
  }

  private pay(s: ShopItem) {
    this.coins -= s.price
    this.coinPop = { t: 1.4, n: s.price }
    this.onSfx('coin')
  }

  private buy(s: ShopItem) {
    const ck = this.shopCheck(s)
    if (!ck.ok) {
      this.say(ck.why)
      return this.onSfx('cancel')
    }
    if (s.land) {
      this.pay(s)
      this.expandLand(s.land)
      this.shopOpen = false
      return
    }
    if (s.egg) {
      const kind: EggKind = s.egg === 'random' ? (['machine', 'dragon', 'cat', 'dog', 'bird', 'water', 'monster'] as EggKind[])[Math.floor(Math.random() * 7)] : s.egg
      this.pay(s)
      const pt = this.pet
      const ex = pt.x + pt.anim.facing * 1.1
      const ez = pt.z + 0.4
      this.layEgg(ex, ez, [], 40, kind, false, s.egg === 'random')
      this.buyFx(ex, ez, 0.4)
      this.say(s.egg === 'random' ? 'ふしぎなたまごを おいた！' : `${FAMILY_NAME[kind]}のたまごを おいた！`)
      this.shopOpen = false
      return
    }
    if (s.plan) {
      // せっけいず：見ている所のまわりに建設現場ができる（みんなが資材を運んで建てる）
      const site = this.planStruct(s.plan)
      if (!site) return this.onSfx('cancel')
      this.pay(s)
      this.buyFx(site.x, site.z, 0.8)
      this.say(`${STRUCTS[s.plan].name}の せっけいず！ みんなが たてはじめる`)
      this.shopOpen = false
      return
    }
    this.pay(s)
    if (s.kit) {
      // 木 3 つと石 2 つを、見ている所のまわりに置く
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        this.spawnResource(this.look.x + Math.cos(a) * 1.2, this.look.z + Math.sin(a) * 1.2, i < 3 ? 'wood' : 'stone', true)
      }
      this.buyFx(this.look.x, this.look.z, 0.5)
      this.burst(this.look.x, this.stage.heightAt(this.look.x, this.look.z) + 0.5, this.look.z, 'spark', 8, 2)
      this.say('ざいもくセットを おいた（木3・石2）')
    } else if (s.food) {
      const p = this.pet
      const f = this.dropFood(p.x + p.anim.facing * 0.9, p.z + 0.2, 3, s.food)
      if (p.state !== 'fight' && p.state !== 'faint') {
        if (p.food) p.food.taken = null
        f.taken = p
        p.food = f
        this.setState(p, 'seek', 10)
      }
      this.buyFx(f.x, f.z, 0.3)
      this.say(`${s.name}を おいた`)
    } else if (s.item) {
      const it = this.placeItem(s.item)
      this.buyFx(it.x, it.z, 0.6)
      this.say(`${s.name}を 箱庭に おいた`)
    }
    this.shopOpen = false
  }

  private run(i: number) {
    const p = this.pet
    const busy = p.state === 'fight' || p.state === 'faint'
    this.onSfx('ok')
    switch (i) {
      case 0: {
        if (busy) return this.say('いまは それどころじゃない！')
        const f = this.dropFood(p.x + p.anim.facing * 0.9, p.z + 0.2, 3)
        if (p.food) p.food.taken = null
        f.taken = p
        p.food = f
        this.setState(p, 'seek', 10)
        return this.say(`${this.stage.food.name}を あげた`)
      }
      case 1:
        if (busy) return this.say('いまは それどころじゃない！')
        if (p.energy < 15) return this.say(`${p.sp.name}は つかれている…`)
        this.setState(p, 'train', 2.4)
        return this.say('トレーニング かいし！')
      case 2: {
        // たたかっている時は「おうえん」：つぎの攻撃で技を出す
        if (p.state === 'fight') {
          p.cheer = true
          this.burst(p.x, this.ground(p) + this.size(p) + 0.2, p.z, 'spark', 6, 1.5)
          return this.say(`がんばれ ${p.sp.name}！ わざを だせ！`)
        }
        if (busy) return this.say('いまは うごけない…')
        let foe = this.nearest(p, (o) => o.sp.temper === 'wild', 99)
        if (!foe) {
          const a = Math.random() * Math.PI * 2
          foe = this.spawn('noiz', 'wild', THREE.MathUtils.clamp(p.x + Math.cos(a) * 3, -HALF, HALF), THREE.MathUtils.clamp(p.z + Math.sin(a) * 3, -HALF, HALF))
          this.say('ノイズが あらわれた！')
        }
        p.foe = foe
        this.setState(p, 'hunt', 12)
        return
      }
      case 3:
        this.showStatus = !this.showStatus
        return
      case 4:
        this.nightTarget = this.nightTarget > 0.5 ? 0 : 1
        return this.say(this.nightTarget ? 'ライトを けした おやすみ…' : 'ライトを つけた おはよう！')
      case 5:
        this.shopOpen = true
        this.showStatus = false
        return
      case 6:
        this.warp = 1.6
        this.warpSwitched = false
        this.cursor = -1
        this.onSfx('warp')
        return
      case 7:
        if (busy) return this.say('いまは よびだせない！')
        this.setState(p, 'come', 4)
        return this.say(`${p.sp.name}を よんだ`)
    }
  }

  /** 「おなか+25」「げんき-15」のような増減の文字（変化が無ければ空） */
  private delta(name: string, v: number) {
    const n = Math.round(v)
    if (!n) return ''
    return `${name}${n > 0 ? '+' : ''}${n}`
  }

  private say(text: string) {
    this.messages.push(text)
    if (this.messages.length > 4) this.messages.shift()
    if (this.messages.length === 1) this.msgT = 2.8
  }

  // ================= 更新 =================
  private hudT = 1
  private hudNow = true
  update(dt: number) {
    this.obsFrame++
    const rawDt = dt
    if (this.hitStop > 0) {
      this.hitStop -= dt
      dt *= this.reducedMotion ? 1 : 0.2
    }
    this.time += dt
    this.night += (this.nightTarget - this.night) * Math.min(1, dt * 2)
    this.updateWeather(dt)
    this.applyLight(dt)
    // くもり・雨の空の暗さ・灰色は fxU（uGrey）で空のシェーダーに入る
    this.stage.update(this.time, this.night)

    if (this.warp > 0) {
      this.warp = Math.max(0, this.warp - dt)
      if (!this.warpSwitched && this.warp < 0.8) {
        this.warpSwitched = true
        this.loadStage((this.stageIndex + 1) % STAGES.length)
      }
    }
    this.post.uniforms.glitch.value = this.warp > 0 ? Math.sin((1 - this.warp / 1.6) * Math.PI) * (this.reducedMotion ? 0.35 : 1) : 0
    this.flash = Math.max(0, this.flash - dt * 1.2)
    this.post.uniforms.flash.value = this.flash * (this.reducedMotion ? 0.3 : 1)
    this.post.uniforms.time.value = this.time

    // たべものが落ちる / 実る（植えた木が多いほどよく落ちる）
    this.foodT += dt * (this.weather === 'rain' ? 1.8 : 1)
    const trees = this.items.filter((it) => it.stage === this.stageIndex && it.kind === 'sapling' && it.grow >= 1).length
    const beds = this.items.filter((it) => it.stage === this.stageIndex && it.kind === 'flowerbed').length
    if (this.foodT > 7 / (1 + trees * 0.3 + beds * 0.2) && this.foods.length < 5 + trees + beds) {
      this.foodT = 0
      this.dropFood()
    }
    for (const f of this.foods) {
      if (!f.landed) {
        f.vy -= 14 * dt
        f.y += f.vy * dt
        const gy = this.stage.heightAt(f.x, f.z) + 0.16
        if (f.y <= gy) {
          f.y = gy
          if (Math.abs(f.vy) > 2) f.vy = -f.vy * 0.35
          else {
            f.vy = 0
            f.landed = true
          }
        }
      }
      f.mesh.position.set(f.x, f.y, f.z)
      f.mesh.rotation.y += dt * 1.5
    }

    for (const r of [...this.respawn]) {
      r.t -= dt
      if (r.t <= 0) {
        this.respawn.splice(this.respawn.indexOf(r), 1)
        const p = this.freePos(4)
        this.spawn(r.id, 'wild', p.x, p.z)
      }
    }

    // 夜だけ出てくる敵
    this.nightSpawnT -= dt
    const shadows = this.creatures.filter((c) => c.sp.habit === 'night' && c.state !== 'dead')
    if (this.night > 0.6 && this.nightSpawnT <= 0 && shadows.length < (this.stage.shadows ?? 2)) {
      this.nightSpawnT = this.stage.shadows ? 14 : 25
      const q = this.freePos(6)
      const dark = enemyFor('yamikage', this.stageIndex)
      this.spawn(dark, 'wild', q.x, q.z)
      if (shadows.length === 0) this.say(`くらやみから ${SPECIES[dark].name}が あらわれた…`)
    }
    if (this.night < 0.3) for (const c of shadows) this.setState(c, 'dead', 0.8)

    for (const c of [...this.creatures]) this.updateCreature(c, dt)
    this.updateSkills(dt)
    this.updateResources(dt)
    this.updateHouses(dt)
    this.updateStructs(dt)
    this.updateVillage(dt)
    this.updateAge(dt)
    this.updateArmy(dt)
    this.updateItems(dt)
    this.updateSucks(dt)
    this.updateAmbient(dt)
    this.coinPop.t = Math.max(0, this.coinPop.t - dt)
    this.updateEggs(dt)
    this.tryBreed(dt)
    this.updateFx(dt)
    this.updateSecretFx(dt)
    this.updateCamera(dt)

    // 見守っているだけでも少しずつコインがたまる（仲間が多いほど多い）
    this.incomeT += dt
    if (this.incomeT > 20) {
      this.incomeT = 0
      this.coins += 1 + Math.floor(this.creatures.filter((c) => c.team === 'friend').length / 2) + this.villageLevel()
      // 野生と仲間は、暮らしているだけでも少しずつ育つ（それぞれ自分の性格の方向に）
      for (const c of this.creatures)
        if (c !== this.pet && c.sp.tier > 0 && c.grow === 0 && this.alive(c)) {
          this.addCare(c, c.bias, 0.5)
          this.gainXp(c, 2)
        }
    }
    this.saveT += dt
    if (this.saveT > 10) {
      this.saveT = 0
      this.save()
    }

    if (this.msgT > 0) {
      this.msgT -= dt
      if (this.msgT <= 0) {
        this.messages.shift()
        if (this.messages.length) this.msgT = 2.4
      }
    }
    this.banner = Math.max(0, this.banner - dt)
    this.stats.mood = Math.max(0, Math.min(100, this.stats.mood - dt * 0.15 + (this.weather === 'sun' ? dt * 0.08 : 0)))
    // 液晶の絵（HUD）は 30 回/秒まで。60Hz の端末では 1 フレームおきに描けば十分（ボタン・タップの直後はすぐ描く）
    this.hudT += rawDt
    if (this.hudT >= 1 / 30 - 0.002 || this.hudNow) {
      this.hudT = 0
      this.hudNow = false
      this.drawHud()
    }
  }

  private updateCreature(c: Creature, dt: number) {
    const sp = c.sp
    if (c.evo) {
      // 進化の演出中は動かない（倒れたら演出を打ち切る）
      if (c.state === 'dead' || c.state === 'faint') {
        c.anim.setSpecies(c.sp.id, this.size(c), this.variant(c))
        if (!c.evo.said) this.evolved(c, SPECIES[c.evo.from].name)
        c.evo = null
      } else {
        this.updateEvo(c, dt)
        return
      }
    }
    c.t -= dt
    c.cd -= dt
    c.lunge = Math.max(0, c.lunge - dt)
    c.hurt = Math.max(0, c.hurt - dt)
    c.skillCd -= dt
    if (c.state !== 'sleep') c.energy = Math.max(0, c.energy - dt * 0.5)
    // 雪の日は雪の種族が元気、それ以外は少し疲れやすい
    if (this.weather === 'snow') {
      if (sp.id === 'mofuru' || sp.id === 'fuwari' || sp.id === 'hoshikujira') c.energy = Math.min(100, c.energy + dt * 0.8)
      else c.energy = Math.max(0, c.energy - dt * 0.2)
    }
    c.hunger = Math.max(0, c.hunger - dt * 0.9)
    if (c.state !== 'fight' && c.state !== 'dead') c.hp = Math.min(c.maxHp, c.hp + dt * 0.6)

    // こどもの成長
    if (c.grow > 0) {
      c.grow = Math.min(1, c.grow + (dt / 150) * (this.nearItem('plush', c.x, c.z, 2.4) ? 1.8 : 1))
      c.anim.setHeight(this.size(c))
      if (c.grow >= 1) {
        c.grow = 0
        c.maxHp = sp.hp
        this.say(`${sp.name}の こどもが おとなに なった！`)
        this.burst(c.x, this.ground(c) + 0.6, c.z, 'spark', 10, 2)
      }
    }

    // 仲良し度：ペットのそばで穏やかに過ごすと上がる
    const p = this.pet
    if (c.team === 'wild' && sp.temper === 'calm' && this.alive(c) && this.alive(p) && p.state !== 'fight') {
      if (Math.hypot(c.x - p.x, c.z - p.z) < 2.6) c.affinity += dt * 1.6 * (this.stats.mood > 50 ? 1.3 : 1) * (1 + 0.2 * this.villageLevel())
      const friends = this.creatures.filter((o) => o.team === 'friend').length
      if (c.affinity >= 100 && friends < MAX_FRIENDS) {
        c.team = 'friend'
        this.burst(c.x, this.ground(c) + this.size(c), c.z, 'heart', 6, 1.5)
        this.say(`${this.nm(c)}が なかまに なった！`)
        this.onSfx('friend')
        this.earn(15)
      }
    }

    let anim = 'idle'
    switch (c.state) {
      case 'idle':
        if (c.t <= 0) this.think(c)
        break
      case 'wander':
        anim = 'walk'
        if (this.moveTo(c, c.tx, c.tz, sp.speed * 0.7, dt) < 0.1 || c.t <= 0) this.setState(c, 'idle', 0.5 + Math.random())
        break
      case 'hunt': {
        anim = 'walk'
        const f = c.foe
        if (!this.alive(f) || c.t <= 0 || (c.spar && f.state === 'fight')) {
          c.foe = null
          c.spar = false
          this.setState(c, 'idle', 1)
          break
        }
        const dist = this.moveTo(c, f.x, f.z, sp.speed * 1.25, dt)
        if (f.state === 'fight' && f.foe !== c) {
          // 相手が取り込み中：ペットは割り込む、ほかは待つ
          if (c.team !== 'pet') {
            anim = 'idle'
            break
          }
          if (dist < 1.0) {
            const old = f.foe
            if (old && old.foe === f) {
              old.foe = null
              this.setState(old, 'idle', 1)
            }
            this.startFight(c, f)
          }
          break
        }
        if (dist < 1.0) this.startFight(c, f)
        break
      }
      case 'fight': {
        const f = c.foe
        if (!this.alive(f) || f.foe !== c) {
          c.foe = null
          c.spar = false
          this.setState(c, 'idle', 0.6)
          break
        }
        c.anim.facing = f.x > c.x ? 1 : -1
        const d = Math.hypot(f.x - c.x, f.z - c.z)
        if (d > 1.1) {
          this.moveTo(c, f.x, f.z, sp.speed, dt)
          anim = 'walk'
        } else anim = c.lunge > 0 ? 'attack' : 'idle'
        if (c.cd <= 0 && d < 1.3 && c.hurt <= 0) {
          if (this.canSkill(c)) this.useSkill(c, f)
          else this.attack(c, f)
          c.cd = (1.5 / sp.speed) * (0.8 + Math.random() * 0.5)
        }
        break
      }
      case 'assist': {
        // 仲間の加勢：相手を取らずに横から攻撃する
        const f = c.foe
        if (!this.alive(f) || c.t <= 0 || !this.alive(p) || p.state !== 'fight') {
          c.foe = null
          this.setState(c, 'idle', 0.6)
          break
        }
        const d = this.moveTo(c, f.x + (c.x < f.x ? -0.9 : 0.9), f.z + 0.3, sp.speed * 1.2, dt)
        anim = d > 0.3 ? 'walk' : c.lunge > 0 ? 'attack' : 'idle'
        if (d < 0.5) c.anim.facing = f.x > c.x ? 1 : -1
        if (c.cd <= 0 && Math.hypot(f.x - c.x, f.z - c.z) < 1.4) {
          if (this.canSkill(c)) this.useSkill(c, f)
          else this.attack(c, f)
          c.cd = (1.8 / sp.speed) * (0.8 + Math.random() * 0.5)
        }
        break
      }
      case 'seek': {
        anim = 'walk'
        const f = c.food
        if (!f || !this.foods.includes(f) || c.t <= 0) {
          if (f) f.taken = null
          c.food = null
          this.setState(c, 'idle', 0.5)
          break
        }
        if (!f.landed) {
          anim = 'idle'
          break
        }
        if (this.moveTo(c, f.x, f.z, sp.speed, dt) < 0.45) this.setState(c, 'eat', 2.2)
        break
      }
      case 'eat': {
        anim = 'eat'
        const f = c.food
        if (f && this.foods.includes(f)) {
          f.bite += dt
          f.mesh.scale.setScalar(Math.max(0.2, 1 - f.bite / 2.4))
          c.anim.facing = f.x > c.x ? 1 : -1
        }
        if (c.t <= 0) {
          const kind = f?.kind ?? 'stage'
          if (f && this.foods.includes(f)) this.removeFood(f)
          c.food = null
          const info = kind === 'stage' ? null : FOODS[kind]
          const before = { hunger: c.hunger, hp: c.hp, mood: this.stats.mood }
          c.hunger = Math.min(100, c.hunger + (info?.hunger ?? 50))
          c.hp = Math.min(c.maxHp, c.hp + 8)
          this.burst(c.x, this.ground(c) + this.size(c), c.z, 'heart', 3, 1.2)
          // 食べた物で傾向が育つ（野生・仲間は自分の好みも少し入る）
          if (info) this.addCare(c, info.care, 2)
          else if (c !== this.pet) this.addCare(c, c.bias, 0.5)
          this.noteEaten(c, kind)
          this.gainXp(c, info ? 2 : 1)
          if (c.team === 'pet') {
            this.stats.mood = Math.min(100, this.stats.mood + (info?.mood ?? 10))
            // 何がどれだけ増えたかも出す
            const up = [
              this.delta('おなか', c.hunger - before.hunger),
              this.delta('きげん', this.stats.mood - before.mood),
              this.delta('たいりょく', c.hp - before.hp),
              info ? `${CARE_NAME[info.care]}+2` : '',
            ].filter(Boolean).join(' ')
            this.say(`${sp.name}は ${info ? info.name : this.stage.food.name}を たべた！ ${up}`)
            this.onSfx('eat')
            this.earn(1)
          } else if (c.team === 'wild') c.affinity += 4
          this.setState(c, 'happy', 1.2)
        }
        break
      }
      case 'rest': {
        anim = 'walk'
        const arrived = this.moveTo(c, c.tx, c.tz, sp.speed * 0.8, dt) < 0.25
        if (arrived || c.t <= 0) {
          // 家に着いたら中に入って眠る（たき火のそばなら こころ が育つ）
          if (c.inside && arrived) {
            c.anim.sprite.visible = false
            c.shadow.visible = false
          } else c.inside = false
          if (this.item('fire')) this.addCare(c, 'spirit', 0.5)
          this.setState(c, 'sleep', 8 + Math.random() * 6)
        }
        break
      }
      case 'sleep':
        anim = 'sleep'
        // ベンチのそばなら げんきが 2 ばい はやく もどる（ペットは きげんも UP）
        const onBench = !c.inside && this.nearItem('bench', c.x, c.z, 1.5)
        c.energy = Math.min(100, c.energy + dt * (onBench ? 20 : 9))
        c.hp = Math.min(c.maxHp, c.hp + dt * (onBench ? 3.5 : 2))
        if (onBench && c === this.pet) this.stats.mood = Math.min(100, this.stats.mood + dt * 0.5)
        c.fx -= dt
        if (c.fx <= 0) {
          c.fx = 1.3
          this.burst(c.x + 0.2, this.ground(c) + this.size(c), c.z, 'zzz', 1, 0.4, -0.2)
        }
        const stormy = c.inside && (this.weather === 'rain' || this.weather === 'ember')
        if (((c.t <= 0 && this.night < 0.5) || c.energy >= 100) && !stormy) {
          if (c === this.pet && c.sleepFrom) {
            const up = [this.delta('げんき', c.energy - c.sleepFrom.e), this.delta('たいりょく', c.hp - c.sleepFrom.h)].filter(Boolean).join(' ')
            this.say(`${sp.name}が めをさました！ ${up || 'すっきり'}`)
          }
          c.sleepFrom = null
          if (c.inside) {
            c.inside = false
            c.anim.sprite.visible = true
            c.shadow.visible = true
          }
          this.setState(c, 'idle', 0.5)
        }
        break
      case 'play': {
        const toy = this.playAt.get(c)
        if (!toy || !this.items.includes(toy) || !toy.mesh || (c.t <= 0 && this.rideT.get(c) === undefined)) {
          this.playAt.delete(c)
          this.rideT.delete(c)
          this.setState(c, 'happy', 1)
          this.addCare(c, 'spirit', 1)
          this.gainXp(c, 1)
          if (c.team === 'pet') {
            const m0 = this.stats.mood
            this.stats.mood = Math.min(100, this.stats.mood + 6)
            this.say(`${sp.name}は たくさん あそんだ！ ${this.delta('きげん', this.stats.mood - m0)} こころ+1`)
          }
          break
        }
        anim = 'walk'
        if (toy.kind === 'ball') {
          if (this.moveTo(c, toy.x, toy.z, sp.speed * 1.3, dt) < 0.55 && c.cd <= 0) {
            // ボールをける
            const dx = toy.x - c.x
            const dz = toy.z - c.z
            const d = Math.hypot(dx, dz) || 1
            const power = 3 + Math.random() * 2.5
            toy.vx = (dx / d) * power + (Math.random() - 0.5) * 1.5
            toy.vz = (dz / d) * power + (Math.random() - 0.5) * 1.5
            c.cd = 0.8
            c.vy = 2.5
            c.energy = Math.max(0, c.energy - 2)
            if (Math.random() < 0.3) this.burst(toy.x, this.stage.heightAt(toy.x, toy.z) + 0.3, toy.z, 'spark', 2, 1)
          }
        } else if (toy.kind === 'slide') {
          // はしごの下へ行く → のぼる → 台の上から すべりおりる
          const u0 = this.rideT.get(c)
          if (u0 === undefined) {
            const foot = this.itemLocal(toy, 0, -1.1)
            if (this.moveTo(c, foot.x, foot.z, sp.speed * 1.2, dt) < 0.3) this.rideT.set(c, 0)
          } else {
            const u = u0 + dt / 1.6
            if (u >= 1) {
              this.rideT.delete(c)
              c.vy = 2.6
              c.cd = 0.3
              this.addCare(c, 'spirit', 0.4)
              this.burst(c.x, this.ground(c) + 0.5, c.z, Math.random() < 0.5 ? 'heart' : 'spark', 3, 1.5)
              this.setState(c, 'play', Math.max(c.t, 0.5))
            } else {
              this.rideT.set(c, u)
              const pt = slidePath(u)
              const w = this.itemLocal(toy, pt.lx, pt.lz)
              c.x = w.x
              c.z = w.z
              c.jy = pt.h
              c.vy = 0
              c.anim.facing = u < 0.42 ? 1 : c.anim.facing
              anim = u < 0.42 ? 'walk' : 'happy'
            }
          }
        } else {
          // ぬいぐるみ：まわりで ぴょんぴょん はねて だっこ
          const around = this.itemLocal(toy, Math.sin(c.phase * 3) * 0.55, 0.7)
          if (this.moveTo(c, around.x, around.z, sp.speed, dt, true) < 0.35) {
            anim = c.jy > 0 ? 'happy' : 'idle'
            c.anim.facing = toy.x > c.x ? 1 : -1
            if (c.cd <= 0) {
              c.vy = 2.3
              c.cd = 1.1
              if (Math.random() < 0.5) this.burst(c.x, this.ground(c) + this.size(c) + 0.2, c.z, 'heart', 1, 1)
              if (c.grow > 0) this.addCare(c, 'spirit', 0.2)
            }
          }
        }
        break
      }
      case 'gather': {
        // 落ちている木や石をひろいに行く
        anim = 'walk'
        const r = c.res
        if (!r || !this.resources.includes(r) || c.t <= 0) {
          if (r) r.taken = null
          c.res = null
          this.setState(c, 'idle', 0.5)
          break
        }
        if (this.moveTo(c, r.x, r.z, sp.speed, dt) < 0.45) {
          this.scene.remove(r.mesh)
          this.resources.splice(this.resources.indexOf(r), 1)
          c.res = null
          c.carry = r.kind
          c.carryMesh = r.mesh
          c.carryMesh.scale.setScalar(0.8)
          this.scene.add(c.carryMesh)
          this.setState(c, 'build', 16)
        }
        break
      }
      case 'build': {
        // 建設現場か自分の家まで運んで、組み立てる
        anim = 'walk'
        const site = c.site && this.structs.includes(c.site) && c.site.mats < STRUCTS[c.site.kind].need ? c.site : null
        const h = site ? null : this.homeOf(c)
        if ((!site && !h) || c.t <= 0) {
          this.dropCarry(c, true)
          this.setState(c, 'idle', 0.5)
          break
        }
        if (site) {
          const off = STRUCTS[site.kind].r + 0.75
          if (this.moveTo(c, site.x + (c.x < site.x ? -1 : 1) * 0.6, site.z + off, sp.speed * 0.9, dt) < 0.5) {
            c.anim.facing = site.x > c.x ? 1 : -1
            c.finish = () => {
              this.dropCarry(c, false)
              if (this.structs.includes(site)) {
                this.addStructMaterial(site, c)
                this.addCare(c, 'guard', 1)
                this.gainXp(c, 2)
              }
              this.setState(c, 'happy', 0.8)
            }
            this.setState(c, 'work', 1.1)
          }
          break
        }
        if (!h) break
        if (this.moveTo(c, h.x + (c.x < h.x ? -1 : 1) * 0.6, h.z + 0.9, sp.speed * 0.9, dt) < 0.5) {
          c.anim.facing = h.x > c.x ? 1 : -1
          c.finish = () => {
            this.dropCarry(c, false)
            if (this.houses.includes(h)) {
              const m0 = h.mats
              this.addMaterial(h, c)
              this.addCare(c, 'guard', 1)
              this.gainXp(c, 2)
              if (c === this.pet && h.level < 4)
                this.say(`${sp.name}は しざいを はこんだ（いえ ${h.mats}/${HOUSE_STEPS[Math.min(4, h.level + 1)]}${h.mats - m0 > 1 ? ' どうぐで 2ばい' : ''}） まもり+1`)
            }
            this.setState(c, 'happy', 0.8)
          }
          this.setState(c, 'work', 1.1)
        }
        break
      }
      case 'work': {
        // かなづちで トントン：はねて、かけらが とぶ
        anim = c.jy > 0 ? 'happy' : 'idle'
        if (c.cd <= 0) {
          c.cd = 0.28
          c.vy = 2.4
          this.burst(c.x + c.anim.facing * 0.35, this.ground(c) + 0.3, c.z, Math.random() < 0.5 ? 'spark' : 'cube', 2, 1.4)
          if (c === this.pet) this.onSfx('select')
        }
        if (c.t <= 0) {
          const f = c.finish
          c.finish = null
          if (f) f()
          else this.setState(c, 'idle', 0.3)
        }
        break
      }
      case 'tend': {
        // はたけの世話：行って しゃがんで、みのりを早める
        anim = 'walk'
        const b = c.tendTo
        if (!b || !this.structs.includes(b) || c.t <= 0) {
          c.tendTo = null
          this.setState(c, 'idle', 0.5)
          break
        }
        if (this.moveTo(c, b.x + 0.2, b.z + 1.1, sp.speed * 0.9, dt) < 0.5) {
          c.anim.facing = b.x > c.x ? 1 : -1
          c.tendTo = null
          c.finish = () => {
            if (this.structs.includes(b)) {
              b.t += 9
              this.burst(b.x, this.stage.heightAt(b.x, b.z) + 0.5, b.z, 'heart', 2, 1)
            }
            this.addCare(c, 'spirit', 0.5)
            this.gainXp(c, 1)
            this.setState(c, 'happy', 0.6)
          }
          this.setState(c, 'work', 1.4)
        }
        break
      }
      case 'march': {
        // 敵軍：いちばん近い建物をこわしに進む
        anim = 'walk'
        const tg = this.marchTarget(c)
        if (!tg) {
          this.moveTo(c, this.pet.x, this.pet.z, sp.speed, dt)
          if (c.t <= 0) this.setState(c, 'idle', 0.2)
          break
        }
        const near = Math.hypot(tg.x - c.x, tg.z - c.z) < tg.r + 1.2
        this.moveTo(c, tg.x, tg.z + 0.2, sp.speed * 1.05, dt, near)
        if (Math.hypot(tg.x - c.x, tg.z - c.z) < tg.r + 0.95) {
          c.anim.facing = tg.x > c.x ? 1 : -1
          anim = c.lunge > 0 ? 'attack' : 'idle'
          if (c.cd <= 0) {
            c.lunge = 0.22
            c.cd = 1.4 / sp.speed
            const dmg = c.atk * (0.6 + Math.random() * 0.5) * (sp.id === 'gougan' ? 1.6 : 1)
            if (tg.s) this.damageStruct(tg.s, dmg, c)
            else if (tg.h) this.damageHouse(tg.h, dmg, c)
          }
        }
        if (c.t <= 0) this.setState(c, 'idle', 0.2)
        break
      }
      case 'raid': {
        // 家をこわす
        const h = c.raid
        if (!h || !this.houses.includes(h) || h.level < 1 || c.t <= 0) {
          c.raid = null
          this.setState(c, 'idle', 0.6)
          break
        }
        const side = c.x < h.x ? -1 : 1
        const d = this.moveTo(c, h.x + side * 1.15, h.z + 0.2, sp.speed * 1.1, dt, Math.hypot(h.x - c.x, h.z - c.z) < 1.6)
        anim = d > 0.3 ? 'walk' : c.lunge > 0 ? 'attack' : 'idle'
        if (d < 0.5) {
          c.anim.facing = h.x > c.x ? 1 : -1
          if (c.cd <= 0) {
            c.lunge = 0.22
            c.cd = 1.4 / sp.speed
            this.damageHouse(h, c.atk * (0.6 + Math.random() * 0.5), c)
          }
        }
        break
      }
      case 'happy':
        anim = 'happy'
        if (c.jy <= 0 && c.vy <= 0 && Math.floor(c.t * 3) % 2 === 0) c.vy = 3
        if (c.t <= 0) this.setState(c, 'idle', 0.5)
        break
      case 'train':
        anim = c.jy > 0 ? 'happy' : 'idle'
        if (c.jy <= 0 && c.vy <= 0) {
          c.vy = 4.5
          this.burst(c.x, this.ground(c) + 0.1, c.z, 'spark', 3, 1.5)
          this.onSfx('train')
        }
        if (c.t <= 0) {
          const a0 = Math.round(c.atk)
          const e0 = c.energy
          c.atk += 1
          c.energy = Math.max(0, c.energy - 15)
          this.stats.trains++
          this.addCare(c, 'power', 1)
          this.say(`トレーニング おわり！ こうげき ${a0}→${Math.round(c.atk)} ちから+1 ${this.delta('げんき', c.energy - e0)}`)
          this.setState(c, 'idle', 0.4)
          this.gainXp(c, 3)
        }
        break
      case 'come': {
        anim = 'walk'
        const tx = THREE.MathUtils.clamp(this.look.x, -HALF, HALF)
        const tz = THREE.MathUtils.clamp(this.look.z + 2.2, -HALF, HALF)
        if (this.moveTo(c, tx, tz, sp.speed * 1.4, dt) < 0.2 || c.t <= 0) {
          c.anim.facing = 1
          this.setState(c, 'happy', 1.5)
        }
        break
      }
      case 'faint':
        anim = 'hurt'
        c.anim.sprite.visible = Math.floor(c.t * 4) % 2 === 0 || c.t > 4
        if (c.t <= 0) {
          c.anim.sprite.visible = true
          c.hp = Math.ceil(c.maxHp * 0.5)
          this.setState(c, 'idle', 0.5)
        }
        break
      case 'dead':
        anim = 'hurt'
        c.anim.sprite.visible = Math.floor(c.t * 16) % 2 === 0
        if (Math.random() < 0.5) this.burst(c.x, this.ground(c) + Math.random() * this.size(c), c.z, 'cube', 1, 1.5, 1)
        if (c.t <= 0) {
          this.remove(c)
          this.creatures.splice(this.creatures.indexOf(c), 1)
          return
        }
        break
    }
    if (c.hurt > 0) anim = 'hurt'
    else if (anim === 'idle') anim = this.faceOf(c)

    // 色ちがいは ときどきキラッと光る
    if (c.rare && c.anim.sprite.visible && (c.glint -= dt) <= 0) {
      c.glint = 1.2 + Math.random() * 1.6
      if (Math.hypot(c.x - this.look.x, c.z - this.look.z) < 12)
        this.burst(c.x + (Math.random() - 0.5) * this.size(c) * 0.9, this.ground(c) + c.jy + Math.random() * this.size(c), c.z, 'spark', 1, 0.6, -0.8)
    }

    c.vy -= 16 * dt
    c.jy = Math.max(0, c.jy + c.vy * dt)
    if (c.jy === 0 && c.vy < 0) c.vy = 0
    c.x += c.kx * dt
    c.z += c.kz * dt
    const k = Math.exp(-dt * 8)
    c.kx *= k
    c.kz *= k
    this.collide(c)

    const lungeOff = c.lunge > 0 ? c.anim.facing * Math.sin((c.lunge / 0.22) * Math.PI) * 0.35 : 0
    const gy = this.ground(c)
    c.anim.play(anim)
    c.anim.update(dt)
    // ぷにぷに：歩くと弾み、息をして、ジャンプで伸び、着地でつぶれる
    if (c.pj > 0 && c.jy === 0) c.squash = 0.2
    c.pj = c.jy
    c.squash = Math.max(0, c.squash - dt * 1.6)
    const walking = c.state === 'wander' || c.state === 'hunt' || c.state === 'seek' || c.state === 'gather' || c.state === 'build' || c.state === 'raid' || c.state === 'march' || c.state === 'come' || c.state === 'assist' || c.state === 'rest'
    const wp = this.time * (7 + sp.speed * 2.2) + c.phase
    let sx = 1
    let sy = 1
    let bob = 0
    if (c.jy > 0.01) {
      const up = c.vy > 0 ? 1 : 0.4
      sy = 1 + 0.12 * up
      sx = 1 - 0.08 * up
    } else if (walking) {
      bob = Math.abs(Math.sin(wp)) * 0.05 * this.size(c)
      sy = 1 + Math.cos(wp * 2) * 0.04
      sx = 1 - Math.cos(wp * 2) * 0.03
    } else {
      const br = Math.sin(this.time * (c.state === 'sleep' ? 1.1 : 2.2) + c.phase)
      sy = 1 + br * (c.state === 'sleep' ? 0.035 : 0.02)
      sx = 1 - br * 0.015
    }
    if (c.squash > 0) {
      sy *= 1 - c.squash * 0.9
      sx *= 1 + c.squash * 0.7
    }
    if (c.lunge > 0) {
      const l = Math.sin((c.lunge / 0.22) * Math.PI)
      sx *= 1 + 0.18 * l
      sy *= 1 - 0.08 * l
    }
    if (this.reducedMotion) {
      sx = 1 + (sx - 1) * 0.3
      sy = 1 + (sy - 1) * 0.3
    }
    c.anim.setHeight(this.size(c))
    c.anim.sprite.scale.x *= sx
    c.anim.sprite.scale.y *= sy
    c.anim.sprite.position.set(c.x + lungeOff, gy + c.jy + bob, c.z)
    c.shadow.position.set(c.x + lungeOff, this.stage.heightAt(c.x, c.z) + 0.03, c.z)
    c.shadow.scale.setScalar(this.size(c) * 0.9 * (1 - Math.min(0.5, c.jy * 0.4)))
    if (c.carryMesh) {
      if (c.state === 'work') {
        // 資材をかなづち代わりに ふりおろす
        c.carryMesh.position.set(c.x + c.anim.facing * (0.3 + Math.max(0, Math.sin(this.time * 22)) * 0.15), gy + c.jy + this.size(c) * (0.55 + Math.sin(this.time * 22) * 0.2), c.z)
        c.carryMesh.rotation.z = Math.sin(this.time * 22) * 0.8
      } else {
        c.carryMesh.position.set(c.x, gy + c.jy + this.size(c) * 0.92, c.z)
        c.carryMesh.rotation.z = 0
      }
      c.carryMesh.rotation.y += dt * 2
    }
  }

  /** 止まっている時の表情：おなかがすいた・ねむい・うれしい・おこっている・こまっている */
  private faceOf(c: Creature): 'idle' | Face {
    const s = c.state
    if (s === 'fight' || s === 'assist' || s === 'raid' || s === 'march' || s === 'hunt') return 'angry'
    if (c.sp.tier === 0) return c.sp.temper === 'wild' ? 'angry' : 'idle'
    if (c.hp < c.maxHp * 0.3 || c.detour || c.stuck > 0) return 'worry'
    if (c.hunger < 28) return 'hungry'
    if (c.energy < 25) return 'sleepy'
    const wave = Math.sin(this.time * 0.4 + c.phase)
    if ((this.weather === 'rain' || this.weather === 'ember') && !c.inside && c.team !== 'wild' && wave > 0.2) return 'worry'
    if (this.ally(c) && c.hunger > 60 && c.energy > 50 && wave > 0.35) return 'glad'
    return 'idle'
  }

  // ================= エフェクト =================
  private burst(x: number, y: number, z: number, kind: keyof ReturnType<typeof FX_SHEETS>, n: number, power: number, grav = 6) {
    for (let i = 0; i < n; i++) {
      if (this.fx.length > 140) return
      const a = new SpriteAnim(this.fxSheets[kind], kind === 'zzz' ? 0.22 : kind === 'cube' ? 0.12 : 0.2)
      a.sprite.center.set(0.5, 0.5)
      a.sprite.position.set(x, y, z)
      this.scene.add(a.sprite)
      const ang = Math.random() * Math.PI * 2
      const sp = power * (0.3 + Math.random() * 0.7)
      const life = kind === 'zzz' ? 1.4 : 0.6 + Math.random() * 0.4
      this.fx.push({ sprite: a.sprite, vx: Math.cos(ang) * sp * 0.5, vz: Math.sin(ang) * sp * 0.5, vy: kind === 'zzz' ? 0.6 : sp, life, max: life, grav })
    }
  }

  private updateFx(dt: number) {
    for (const f of [...this.fx]) {
      f.life -= dt
      f.vy -= f.grav * dt
      f.sprite.position.x += f.vx * dt
      f.sprite.position.y += f.vy * dt
      f.sprite.position.z += f.vz * dt
      if (f.life <= 0) {
        this.scene.remove(f.sprite)
        ;(f.sprite.material as THREE.SpriteMaterial).map?.dispose()
        f.sprite.material.dispose()
        this.fx.splice(this.fx.indexOf(f), 1)
      }
    }
    for (const p of [...this.popups]) {
      p.t += dt
      p.pos.y += dt * (p.big ? 0.25 : 0.8)
      if (p.t > (p.big ? 1.1 : 0.9)) this.popups.splice(this.popups.indexOf(p), 1)
    }
  }

  private updateCamera(dt: number) {
    const p = this.pet
    // ペットの向き：動いた方向から求める（止まっている時は前の向きのまま）
    const mx = p.x - this.petLast.x
    const mz = p.z - this.petLast.y
    this.petLast.set(p.x, p.z)
    if (Math.hypot(mx, mz) > dt * 0.4 && Math.hypot(mx, mz) < 1) this.petYaw = Math.atan2(mx, mz)
    if (p.state === 'fight' && p.foe) this.petYaw = Math.atan2(p.foe.x - p.x, p.foe.z - p.z)
    let d = this.petYaw - this.camYaw
    d = Math.atan2(Math.sin(d), Math.cos(d))
    this.camYaw += d * Math.min(1, dt * (this.view === 'eye' ? 4 : 2))
    const fx = Math.sin(this.camYaw)
    const fz = Math.cos(this.camYaw)
    const gy = this.ground(p)

    this.shake = Math.max(0, this.shake - dt)
    const jolt = () => {
      if (this.shake <= 0) return
      const k = this.shake * (this.reducedMotion ? 0.07 : 0.5)
      this.camera.position.x += (Math.random() - 0.5) * k
      this.camera.position.y += (Math.random() - 0.5) * k
    }
    if (this.view === 'top') {
      const target = new THREE.Vector3(p.x, 0, p.z)
      if (p.state === 'fight' && p.foe) target.set((p.x + p.foe.x) / 2, 0, (p.z + p.foe.z) / 2)
      // 2 本指でずらした分を足す（ペットを追いかけつつ、見たい所を見られる）
      target.x += this.camPan.x
      target.z += this.camPan.y
      const lim = HALF - 1.5
      target.x = THREE.MathUtils.clamp(target.x, -lim, lim)
      target.z = THREE.MathUtils.clamp(target.z, -lim, lim + 1)
      // 起伏に合わせて見る高さも変える
      target.y = this.stage.heightAt(target.x, target.z) + 0.4
      this.look.lerp(target, 1 - Math.exp(-dt * 3))
      this.camera.position.copy(this.look).addScaledVector(CAM_OFF, this.camZoom)
      this.camera.lookAt(this.look)
      jolt()
      return
    }
    // 主人公視点：ペットの後ろ / 目線（2 本指の横ドラッグで向きを回す、縦で見上げ・見下ろし）
    const yaw = this.camYaw + this.camPan.x
    const ex = Math.sin(yaw)
    const ez = Math.cos(yaw)
    const back = this.view === 'behind' ? 3.3 * this.camZoom : -0.15
    const up = this.view === 'behind' ? 2.0 * this.camZoom + this.camPan.y : this.size(p) * 0.7
    const want = new THREE.Vector3(p.x - ex * back, gy + up, p.z - ez * back)
    // 箱庭の外（デジタル空間）へカメラが出ないように
    want.x = THREE.MathUtils.clamp(want.x, -HALF - 0.5, HALF + 0.5)
    want.z = THREE.MathUtils.clamp(want.z, -HALF - 0.5, HALF + 0.5)
    // 地面にめりこまないように
    want.y = Math.max(want.y, this.stage.heightAt(want.x, want.z) + 0.35)
    // うしろ視点はペットが画面の中ほどに来るよう、少し手前の低い所を見る
    const ahead = this.view === 'behind' ? 1.4 : 3
    const lookY = this.view === 'behind' ? 0.25 : up - 0.15 - this.camPan.y
    const lookAt = new THREE.Vector3(p.x + ex * ahead, gy + lookY, p.z + ez * ahead)
    this.camera.position.lerp(want, 1 - Math.exp(-dt * 6))
    this.look.lerp(lookAt, 1 - Math.exp(-dt * 6))
    // めせんはピンチで望遠
    const fov = this.view === 'eye' ? THREE.MathUtils.clamp(42 * this.camZoom, 18, 70) : 42
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }
    this.camera.lookAt(this.look)
    jolt()
    void fx
    void fz
  }

  /** ピンチ：f < 1 で寄る、f > 1 で引く */
  zoomBy(f: number) {
    this.camZoom = THREE.MathUtils.clamp(this.camZoom * f, 0.45, 2.3)
  }

  /** 2 本指ドラッグ（画面の高さに対する割合） */
  panBy(dx: number, dy: number) {
    if (this.view === 'top') {
      // 指を動かした方向に景色がついてくる
      const k = 9 * this.camZoom
      this.camPan.x = THREE.MathUtils.clamp(this.camPan.x - dx * k, -HALF, HALF)
      this.camPan.y = THREE.MathUtils.clamp(this.camPan.y - dy * k, -HALF, HALF)
    } else {
      this.camPan.x = THREE.MathUtils.clamp(this.camPan.x - dx * 3, -Math.PI, Math.PI)
      this.camPan.y = THREE.MathUtils.clamp(this.camPan.y + dy * 3, -1.2, 1.6)
    }
  }

  setView(v: 'top' | 'behind' | 'eye') {
    this.view = v
    this.camZoom = 1
    this.camPan.set(0, 0)
    this.camera.fov = 42
    // カメラのすぐ前にある木や仲間で画面がふさがらないよう、近くは描かない
    this.camera.near = v === 'behind' ? 1.2 : v === 'eye' ? 0.35 : 0.1
    this.camera.updateProjectionMatrix()
    this.camYaw = this.petYaw
    // 切り替え直後に遠くから飛んでこないよう、すぐ近くへ置く
    const p = this.pet
    if (v === 'top') this.look.set(p.x, this.stage.heightAt(p.x, p.z) + 0.4, p.z)
    else {
      this.camera.position.set(p.x - Math.sin(this.camYaw) * 2.8, this.ground(p) + 1.5, p.z - Math.cos(this.camYaw) * 2.8)
      this.look.set(p.x, this.ground(p) + 0.6, p.z)
    }
    this.say(v === 'top' ? 'してん：みおろし' : v === 'behind' ? `してん：${p.sp.name}の うしろ` : `してん：${p.sp.name}の めせん`)
  }

  /**
   * 画面のタップ（u, v は 0〜1、v は下が 0）。アイコン・ショップ・ステータスをタッチで操作する。
   * 戻り値 true = HUD で使った
   */
  tap(u: number, v: number): boolean {
    this.hudNow = true
    if (this.warp > 0) return true
    if (this.cleanView) return false
    const x = u * RES.w
    const y = (1 - v) * RES.h
    if (this.shopOpen) {
      const hit = shopTap(x, y, this.shopCursor)
      if (hit.type === 'outside') {
        this.shopOpen = false
        this.onSfx('cancel')
      } else if (hit.type === 'tab') {
        if (catOf(this.shopCursor) !== hit.cat) {
          this.shopCursor = catIndexes(hit.cat)[0]
          this.onSfx('select')
        }
      } else if (hit.type === 'row') {
        if (hit.index === this.shopCursor) this.buy(SHOP[hit.index])
        else {
          this.shopCursor = hit.index
          this.onSfx('select')
        }
      } else if (hit.type === 'buy') this.buy(SHOP[this.shopCursor])
      return true
    }
    if (this.showStatus) {
      this.showStatus = false
      this.onSfx('cancel')
      return true
    }
    if (y < 24 || y > RES.h - 24) {
      const i = (y < 24 ? 0 : 4) + Math.min(3, Math.floor(x / 80))
      this.cursor = i
      this.run(i)
      return true
    }
    // 箱庭の中の物をタップ：情報を出す（もう一度さがして、べつの物ならそちらへ）
    if (this.picked && this.tapInfo(x, y)) return true
    const hit = this.pickAt(x, y)
    if (hit) {
      this.picked = hit
      this.onSfx('select')
      return true
    }
    return false
  }

  private freePos(minFromPet: number, cx = 0, cz = 0, radius = 99) {
    for (let i = 0; i < 80; i++) {
      const x = THREE.MathUtils.clamp(cx + (Math.random() * 2 - 1) * Math.min(radius, HALF), -HALF, HALF)
      const z = THREE.MathUtils.clamp(cz + (Math.random() * 2 - 1) * Math.min(radius, HALF), -HALF, HALF)
      if (this.pet && Math.hypot(x - this.pet.x, z - this.pet.z) < minFromPet) continue
      if (this.obstacles().some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.6)) continue
      return { x, z }
    }
    return { x: 0, z: 0 }
  }

  // ================= ひみつ（隠し進化・できごと） =================
  /** 食べた物の履歴（1 匹ずつ。stage / meat / sweet / nut の回数）。セーブは secrets.eaten */
  private eatenOf = new WeakMap<Creature, Record<string, number>>()
  /** 見つけた隠しの姿・できごと / ヒントの進み / 雨がやんだ時刻 / できごとの待ち秒 / 見つけた時の札 */
  private secret = {
    forms: new Set<string>(),
    events: new Set<string>(),
    hints: {} as Record<string, number>,
    rainEnd: -9999,
    evT: {} as Record<string, number>,
    card: null as { title: string; sub: string; t: number } | null,
  }
  private secretMeshes: { obj: THREE.Mesh; t: number; dur: number; hold: number }[] = []

  private noteEaten(c: Creature, kind: FoodKind) {
    const e = this.eatenOf.get(c) ?? {}
    e[kind] = Math.min(999, (e[kind] ?? 0) + 1)
    this.eatenOf.set(c, e)
  }

  /** 水ぞくの池の半径（はしが かかっている池） */
  private bridgeSpan(b: Struct) {
    const o = this.stage.obstacles.find((q) => q.water && Math.hypot(b.x - q.x, b.z - q.z) < 0.7)
    return o ? o.r : 1.5
  }

  /** 進化の瞬間（とヒントの判定）の まわりのようす */
  private secretCtx(c: Creature, top?: Care): SecretCtx {
    const care = this.careOf(c)
    const t: Care = top ?? (['power', 'guard', 'spirit'] as Care[]).sort((a, b) => care[b] + (c !== this.pet && c.bias === b ? 3 : 0) - (care[a] + (c !== this.pet && c.bias === a ? 3 : 0)))[0]
    const here = (b: Struct) => b.stage === this.stageIndex && this.structDone(b)
    const st = (k: StructKind, r: number) => this.structs.some((b) => b.kind === k && here(b) && Math.hypot(b.x - c.x, b.z - c.z) < r)
    const fam = familyOf(c.sp.id)
    return {
      isPet: c === this.pet,
      night: this.night > 0.55,
      weather: this.weather,
      rainedLately: this.time - this.secret.rainEnd < 120,
      stage: this.stageIndex,
      gen: this.stats.gen,
      coins: this.coins,
      mood: this.stats.mood,
      role: c.role,
      top: t,
      eaten: this.eatenOf.get(c) ?? {},
      homeLv: this.homeOf(c)?.level ?? 0,
      kin: this.creatures.filter((o) => o !== c && this.ally(o) && this.alive(o) && familyOf(o.sp.id) === fam && Math.hypot(o.x - c.x, o.z - c.z) < 6).length,
      village: this.vLv,
      near: {
        tower: st('tower', 8),
        castle: st('castle', 8),
        bridge: this.structs.some((b) => b.kind === 'bridge' && here(b) && Math.hypot(b.x - c.x, b.z - c.z) < this.bridgeSpan(b) + 3),
        farm: st('farm', 6),
        fire: this.nearItem('fire', c.x, c.z, 5),
        memorial: this.nearItem('memorial', c.x, c.z, 4),
        tools: this.nearItem('tools', c.x, c.z, 6),
        water: this.stage.obstacles.some((o) => o.water && Math.hypot(o.x - c.x, o.z - c.z) < o.r + 2.5),
      },
    }
  }

  /** 条件がそろった 隠しの姿（仲間だけ。ペットは必ず、ほかの子は 8 割） */
  private pickSecret(c: Creature, top: Care): SpeciesId | null {
    if (!this.ally(c)) return null
    const f = secretForm(familyOf(c.sp.id), c.sp.tier, this.secretCtx(c, top))
    if (!f) return null
    if (c !== this.pet && Math.random() > 0.8) return null
    return f.id
  }

  /** 隠しの姿に進化した時の 大きな演出 */
  private foundSecretForm(c: Creature) {
    const f = secretById(c.sp.id)
    if (!f) return
    const first = !this.secret.forms.has(f.id)
    this.secret.forms.add(f.id)
    this.secret.hints[f.id] = 0x87
    const y = this.ground(c) + 0.8
    this.flash = 1
    this.shake = Math.max(this.shake, 0.3)
    this.ring(c.x, c.z, '#ffd23f', 5, 1.2)
    this.after(0.25, () => this.ring(c.x, c.z, '#ffffff', 7, 1.4))
    this.after(0.5, () => this.ring(c.x, c.z, '#ff9ecb', 9, 1.6))
    this.burst(c.x, y, c.z, 'spark', 40, 5, 3)
    this.burst(c.x, y, c.z, 'coin', 12, 4, 6)
    this.glow(c.x, y, c.z, '#ffd23f', 18, { life: 2.4, spread: 2.2, rise: 1.2 })
    this.onSfx('win')
    this.after(0.4, () => this.onSfx('evolve'))
    this.say(`ひみつの すがた！ ${f.name}に しんかした！`)
    this.say(f.story)
    this.secret.card = { title: first ? '★ ひみつの すがた はっけん！' : '★ ひみつの すがた', sub: `${f.name}　${f.kind}`, t: 5 }
    if (first) this.earn(c === this.pet ? 200 : 120)
    this.save()
  }

  /** ふわふわ漂う光の粒（ほたる・花びら・オーロラなど）。grav 0 でゆっくり動く */
  private glow(x: number, y: number, z: number, color: string, n: number, o: { life: number; spread: number; rise: number; size?: number; fall?: number }) {
    for (let i = 0; i < n; i++) {
      if (this.fx.length > 230) return
      const a = new SpriteAnim(this.orb(color), (o.size ?? 0.16) * (0.7 + Math.random() * 0.6))
      a.sprite.center.set(0.5, 0.5)
      const ang = Math.random() * Math.PI * 2
      const d = Math.random() * o.spread
      a.sprite.position.set(x + Math.cos(ang) * d, y + Math.random() * 0.6, z + Math.sin(ang) * d)
      this.scene.add(a.sprite)
      const life = o.life * (0.7 + Math.random() * 0.6)
      this.fx.push({ sprite: a.sprite, vx: (Math.random() - 0.5) * 0.5, vz: (Math.random() - 0.5) * 0.5, vy: o.rise * (0.3 + Math.random() * 0.7), life, max: life, grav: o.fall ?? 0 })
    }
  }

  /** 1 秒に 1 回：ヒントの進み具合と、ひみつのできごとの判定 */
  private updateSecrets() {
    const s = this.secret
    // ヒント：この系統の成長期・成熟期の仲間が、いま条件のどれかを満たしていれば その行が増える
    for (const c of this.creatures) {
      if (!this.ally(c) || c.grow > 0 || c.sp.tier < 2 || c.sp.tier > 3 || !this.alive(c)) continue
      const fam = familyOf(c.sp.id)
      if (fam === 'plain') continue
      for (const [id, mask] of hintMask(fam, this.secretCtx(c))) {
        const cur = s.hints[id] ?? 0
        if ((cur | mask) !== cur) {
          s.hints[id] = cur | mask
          if (cur !== 0 && !s.forms.has(id)) this.say('なにか ありそうな きがする… （ずかんの ひみつ）')
        }
      }
    }
    if (this.eventsLeft() === 0) return
    // できごと
    const ctx = this.eventCtx()
    for (const e of SECRET_EVENTS) {
      if (s.events.has(e.id)) continue
      s.evT[e.id] = e.test(ctx) ? (s.evT[e.id] ?? 0) + 1 : 0
      if (s.evT[e.id] >= e.dwell) this.foundEvent(e)
    }
  }
  private eventsLeft() {
    return SECRET_EVENTS.length - this.secret.events.size
  }

  private eventCtx(): EventCtx {
    const al = this.creatures.filter((c) => this.ally(c) && this.alive(c) && !c.army)
    const here = <T extends { stage: number }>(a: T[]) => a.filter((x) => x.stage === this.stageIndex)
    const fires = here(this.items).filter((it) => it.kind === 'fire' && it.mesh)
    const mem = here(this.items).filter((it) => it.kind === 'memorial' && it.mesh)
    const done = (k: StructKind) => here(this.structs).filter((b) => b.kind === k && this.structDone(b))
    const castles = done('castle')
    const cradles = done('cradle')
    const bridges = done('bridge')
    const within = (c: Creature, p: { x: number; z: number }, r: number) => Math.hypot(p.x - c.x, p.z - c.z) < r
    const birds = al.filter((c) => familyOf(c.sp.id) === 'bird')
    return {
      night: this.night > 0.55,
      weather: this.weather,
      stage: this.stageIndex,
      gen: this.stats.gen,
      village: this.vLv,
      allies: al.length,
      nearFire: al.filter((c) => fires.some((f) => within(c, f, 5))).length,
      fires: fires.length,
      onBridge: al.filter((c) => bridges.some((b) => within(c, b, Math.max(1.2, this.bridgeSpan(b) * 0.9)))).length,
      petAtMemorial: this.alive(this.pet) && mem.some((m) => within(this.pet, m, 3)),
      atCastle: al.filter((c) => castles.some((b) => within(c, b, 4.5))).length,
      castles: castles.length,
      trees: here(this.items).filter((it) => it.kind === 'sapling' && it.grow >= 1).length,
      waterAwake: al.filter((c) => familyOf(c.sp.id) === 'water' && c.state !== 'sleep' && c.state !== 'rest' && c.sp.tier > 0).length,
      sleepCradle: al.filter((c) => c.state === 'sleep' && cradles.some((b) => within(c, b, 5))).length,
      cradles: cradles.length,
      birds: Math.max(0, ...birds.map((c) => birds.filter((o) => within(o, c, 5)).length)),
      inside: al.filter((c) => c.inside).length,
    }
  }

  /** できごとが起きた：札・メッセージ・コイン・演出 */
  private foundEvent(e: SecretEvent) {
    this.secret.events.add(e.id)
    const al = this.creatures.filter((c) => this.ally(c) && this.alive(c))
    const pet = this.pet
    this.playEventFx(e.fx, al)
    this.say(e.msg)
    this.secret.card = { title: '★ ひみつを みつけた！', sub: `${e.name}　コイン+${e.reward}`, t: 5 }
    this.flash = Math.max(this.flash, 0.55)
    this.earn(e.reward, pet.x, pet.z)
    this.onSfx('win')
    this.save()
  }

  private playEventFx(fx: EventFx, al: Creature[]) {
    const p = this.pet
    const find = <T extends { stage: number; x: number; z: number }>(a: T[], pred: (x: T) => boolean = () => true) => a.find((x) => x.stage === this.stageIndex && pred(x))
    const at = (o: { x: number; z: number } | undefined) => o ?? { x: p.x, z: p.z }
    const gy = (o: { x: number; z: number }) => this.stage.heightAt(o.x, o.z)
    switch (fx) {
      case 'hotaru': {
        const f = at(find(this.items, (it) => it.kind === 'fire'))
        for (let k = 0; k < 10; k++) this.after(k * 0.8, () => this.glow(f.x, gy(f) + 0.5, f.z, k % 2 ? '#e8ff7a' : '#b8ff9a', 7, { life: 7, spread: 4, rise: 0.35, size: 0.14 }))
        this.ring(f.x, f.z, '#e8ff7a', 6, 2)
        break
      }
      case 'rainbow': {
        const b = at(find(this.structs, (s) => s.kind === 'bridge'))
        this.rainbow(b.x, b.z)
        this.burst(b.x, gy(b) + 1, b.z, 'spark', 14, 3, 2)
        break
      }
      case 'meteor': {
        const m = at(find(this.items, (it) => it.kind === 'memorial'))
        for (let k = 0; k < 14; k++)
          this.after(k * 0.35, () => {
            const sx = m.x - 4 + Math.random() * 8
            const sz = m.z - 4 + Math.random() * 8
            const a = new SpriteAnim(this.fxSheets.spark, 0.3)
            a.sprite.center.set(0.5, 0.5)
            a.sprite.position.set(sx + 3, 9, sz)
            this.scene.add(a.sprite)
            this.fx.push({ sprite: a.sprite, vx: -5, vy: -6.5, vz: 0, life: 1.3, max: 1.3, grav: 0 })
            this.glow(sx + 1.5, 6, sz, '#fff6c0', 3, { life: 0.9, spread: 1.2, rise: -1, size: 0.1 })
          })
        this.ring(m.x, m.z, '#ffe27a', 5, 2.4)
        break
      }
      case 'confetti': {
        const c = at(find(this.structs, (s) => s.kind === 'castle'))
        for (let k = 0; k < 8; k++)
          this.after(k * 0.3, () => {
            for (const col of ['#ff5e7a', '#ffd23f', '#6fe7ff', '#7cf29b', '#c9a8ff']) this.colorBurst(c.x + (Math.random() - 0.5) * 3, gy(c) + 2.5, c.z + 1 + Math.random(), col, 3, 2.6)
            this.burst(c.x, gy(c) + 1.5, c.z + 1.5, 'coin', 3, 3)
          })
        this.ring(c.x, c.z + 1.5, '#ffd23f', 6, 1.6)
        for (const a of al) if (Math.hypot(a.x - c.x, a.z - c.z) < 4.5) this.setState(a, 'happy', 2.5)
        break
      }
      case 'petals': {
        for (const it of this.items) if (it.stage === this.stageIndex && it.kind === 'sapling' && it.grow >= 1) {
          for (let k = 0; k < 5; k++) this.after(k * 0.9, () => this.glow(it.x, gy(it) + 2, it.z, k % 2 ? '#ffb8d8' : '#ffffff', 5, { life: 4, spread: 1.4, rise: -0.1, size: 0.13, fall: 0.18 }))
          this.burst(it.x, gy(it) + 1.6, it.z, 'heart', 3, 1.2, 1.2)
        }
        break
      }
      case 'dance': {
        const cols = ['#6fe7ff', '#a8fff0', '#ff9ecb', '#ffe27a']
        al.filter((c) => familyOf(c.sp.id) === 'water').forEach((c, i) => {
          this.setState(c, 'happy', 6)
          this.after(i * 0.3, () => this.ring(c.x, c.z, cols[i % cols.length], 3.5, 1.4))
          for (let k = 0; k < 4; k++) this.after(k * 1.1 + i * 0.2, () => this.burst(c.x, this.ground(c) + this.size(c), c.z, 'heart', 2, 1.5))
          this.glow(c.x, this.ground(c) + 0.4, c.z, '#a8fff0', 8, { life: 4, spread: 1.4, rise: 0.5 })
        })
        break
      }
      case 'egg': {
        const cr = at(find(this.structs, (s) => s.kind === 'cradle'))
        if (this.eggs.length < 6) this.layEgg(cr.x + 0.9, cr.z + 0.9, [], 30, this.stageEggKind(), true)
        this.glow(cr.x, gy(cr) + 0.8, cr.z, '#fff6c0', 14, { life: 3.5, spread: 2, rise: 0.6 })
        this.ring(cr.x, cr.z, '#fff6c0', 5, 1.8)
        break
      }
      case 'aurora': {
        const cols = ['#7cf29b', '#5ef2ff', '#b48cff', '#ff9ecb', '#7cf29b']
        cols.forEach((col, i) => {
          this.after(i * 1.2, () => this.ring(p.x, p.z, col, 12 + i * 2, 3.5))
          for (let k = 0; k < 6; k++) this.after(i * 1.2 + k * 0.5, () => this.glow(p.x - 5 + k * 2, 5 + i * 0.5, p.z - 3, col, 5, { life: 5, spread: 1.5, rise: 0.15, size: 0.3 }))
        })
        this.flash = 0.8
        break
      }
      case 'chorus': {
        const birds = al.filter((c) => familyOf(c.sp.id) === 'bird')
        birds.forEach((c, i) => {
          this.setState(c, 'happy', 4)
          for (let k = 0; k < 5; k++) this.after(k * 0.7 + i * 0.15, () => {
            this.burst(c.x, this.ground(c) + this.size(c) + 0.3, c.z, 'spark', 2, 1.4, 1)
            this.popups.push({ pos: new THREE.Vector3(c.x, this.ground(c) + this.size(c) + 0.5, c.z), text: k % 2 ? 'ぴよ' : 'ちゅん', color: '#ffe27a', t: 0 })
          })
        })
        break
      }
      case 'festival': {
        al.forEach((c, i) => {
          this.setState(c, 'happy', 5)
          this.after(i * 0.15, () => {
            c.vy = 4
            this.colorBurst(c.x, this.ground(c) + 1, c.z, ['#ff5e7a', '#ffd23f', '#6fe7ff', '#7cf29b'][i % 4], 4, 3)
          })
        })
        for (let k = 0; k < 8; k++) this.after(k * 0.4, () => this.burst(p.x + (Math.random() - 0.5) * 6, 3, p.z + (Math.random() - 0.5) * 6, 'coin', 4, 2.5, 5))
        this.ring(p.x, p.z, '#ffd23f', 9, 2)
        break
      }
      case 'cozy': {
        for (const h of this.houses) if (h.stage === this.stageIndex && h.level >= 1) {
          this.glow(h.x, this.stage.heightAt(h.x, h.z) + 1.2, h.z, '#ffd8a8', 8, { life: 5, spread: 0.8, rise: 0.4 })
          this.burst(h.x, this.stage.heightAt(h.x, h.z) + 1.4, h.z, 'heart', 3, 1)
        }
        break
      }
    }
  }

  /** にじ：かたむけた半円のおび（7 色）。ゆっくり現れて、しばらくして消える */
  private rainbow(x: number, z: number) {
    const geo = new THREE.RingGeometry(3.2, 4.4, 40, 7, 0, Math.PI)
    const cols = ['#ff4d4d', '#ff9a3d', '#ffe03d', '#6be86b', '#4dc8ff', '#5a6cff', '#b45aff', '#b45aff'].map((c) => new THREE.Color(c))
    const n = geo.attributes.position.count
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const j = Math.floor(i / 41)
      arr.set([cols[Math.min(j, 7)].r, cols[Math.min(j, 7)].g, cols[Math.min(j, 7)].b], i * 3)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }))
    const cx = this.camera.position.x
    const cz = this.camera.position.z
    const dir = Math.atan2(cx - x, cz - z)
    // カメラから見て、はしの うしろに立てる
    mesh.position.set(x - Math.sin(dir) * 2.5, this.stage.heightAt(x, z) + 0.05, z - Math.cos(dir) * 2.5)
    mesh.rotation.set(-0.28, dir, 0)
    this.scene.add(mesh)
    this.secretMeshes.push({ obj: mesh, t: 0, dur: 14, hold: 0.6 })
  }

  /** 毎フレーム：にじの出入り・札のタイマー */
  private updateSecretFx(dt: number) {
    for (const m of [...this.secretMeshes]) {
      m.t += dt
      const k = m.t / m.dur
      const a = k < 0.12 ? k / 0.12 : k > 0.8 ? Math.max(0, (1 - k) / 0.2) : 1
      ;(m.obj.material as THREE.MeshBasicMaterial).opacity = a * m.hold
      if (k >= 1) {
        this.scene.remove(m.obj)
        m.obj.geometry.dispose()
        ;(m.obj.material as THREE.Material).dispose()
        this.secretMeshes.splice(this.secretMeshes.indexOf(m), 1)
      }
    }
    if (this.secret.card) {
      this.secret.card.t -= dt
      if (this.secret.card.t <= 0) this.secret.card = null
    }
  }

  /** 札：ひみつを みつけた時に 画面の上に出る */
  private drawSecretCard() {
    const k = this.secret.card
    if (!k) return
    const age = 5 - k.t
    const y = Math.round(64 - Math.max(0, 1 - age * 4) * 60 - Math.max(0, 0.5 - k.t) * 120)
    this.win(24, y, RES.w - 48, 40)
    const g = this.hudCtx
    g.strokeStyle = '#ffd23f'
    g.strokeRect(25.5, y + 1.5, RES.w - 51, 37)
    this.text(k.title, RES.w / 2, y + 7, '#ffd23f', 11, 'center')
    this.text(k.sub, RES.w / 2, y + 23, '#ffffff', 10, 'center')
  }

  /** ずかんの「ひみつ」欄に出す 情報 */
  secretInfo() {
    const forms = SECRET_FORMS.map((s) => {
      const found = this.secret.forms.has(s.id)
      const mask = this.secret.hints[s.id] ?? 0
      return {
        id: s.id, name: s.name, kind: s.kind, family: FAMILY_NAME[s.family], found,
        lines: hintLines(s, mask, found),
        known: s.conds.filter((_, i) => mask & (1 << i)).length,
        total: s.conds.length,
        story: found ? s.story : '',
      }
    })
    const events = SECRET_EVENTS.map((e) => {
      const found = this.secret.events.has(e.id)
      return { id: e.id, name: found ? e.name : '？？？', found, text: found ? e.msg : e.riddle }
    })
    return { forms, events, formsFound: forms.filter((f) => f.found).length, eventsFound: events.filter((e) => e.found).length }
  }

  private saveSecrets(friends: Creature[]) {
    const s = this.secret
    return {
      forms: [...s.forms], events: [...s.events], hints: s.hints,
      eaten: { pet: this.eatenOf.get(this.pet) ?? {}, friends: friends.map((c) => this.eatenOf.get(c) ?? {}) },
    }
  }

  /** 読み込み：ID は表と照合、数字は範囲に収める */
  private loadSecrets(d: any, friends: Creature[], savedFriends: unknown[]) {
    const s = this.secret
    const o = d && typeof d === 'object' ? d : {}
    s.forms = new Set((Array.isArray(o.forms) ? o.forms : []).filter(isSecretId).slice(0, 40))
    s.events = new Set((Array.isArray(o.events) ? o.events : []).filter((v: unknown): v is string => typeof v === 'string' && EVENT_IDS.has(v)).slice(0, 60))
    s.hints = {}
    if (o.hints && typeof o.hints === 'object' && !Array.isArray(o.hints))
      for (const [k, v] of Object.entries(o.hints)) if (isSecretId(k)) s.hints[k] = Math.round(num(v, 0, 255, 0)) & 0x87
    const clean = (v: unknown) => {
      const r: Record<string, number> = {}
      if (v && typeof v === 'object' && !Array.isArray(v)) for (const k of EAT_KEYS) r[k] = Math.round(num((v as Record<string, unknown>)[k], 0, 999, 0))
      return r
    }
    const e = o.eaten && typeof o.eaten === 'object' ? o.eaten : {}
    this.eatenOf.set(this.pet, clean(e.pet))
    const list: unknown[] = Array.isArray(e.friends) ? e.friends : []
    // 保存した友だちのうち 読み込めた子だけが friends に入っているので、同じ条件でそろえる
    const ok = savedFriends.map((f, i) => ({ f: f as { sp?: unknown } | null, i })).filter((x) => x.f && isSpecies(x.f.sp))
    friends.forEach((c, i) => this.eatenOf.set(c, clean(list[ok[i]?.i ?? -1])))
  }

  // ================= セーブ / ロード =================
  /** 読み込み・やり直しの直前は自動セーブを止める（上書きしないように） */
  saveLocked = false
  save() {
    if (!this.pet || this.saveLocked) return
    const c2 = (c: Creature) => ({
      sp: c.sp.id, hp: Math.round(c.hp), maxHp: c.maxHp, atk: c.atk, hunger: Math.round(c.hunger), energy: Math.round(c.energy), grow: c.grow,
      xp: c.xp, care: c.care, bias: c.bias, seed: c.seed, rare: c.rare,
    })
    const friends = this.creatures.filter((c) => c.team === 'friend')
    const ownerKey = (h: House) => (h.owner === this.pet ? 'pet' : h.owner && friends.includes(h.owner) ? `f${friends.indexOf(h.owner)}` : '')
    const data = {
      land: this.land, dex: this.dex, dexRare: this.dexRare, dexClaimed: this.dexClaimed,
      coins: this.coins, stage: this.stageIndex, care: this.care, xp: this.xp, stats: this.stats, night: this.nightTarget,
      pet: c2(this.pet),
      friends: friends.map(c2),
      houses: this.houses.map((h) => ({ stage: h.stage, x: h.x, z: h.z, ownerSp: h.ownerSp, owner: ownerKey(h), mats: h.mats, hp: Math.round(h.hp) })),
      structs: this.structs.map((b) => ({ kind: b.kind, stage: b.stage, x: b.x, z: b.z, rot: b.rot, len: b.len, mats: b.mats, hp: Math.round(b.hp) })),
      items: this.items.map((it) => ({ kind: it.kind, stage: it.stage, x: it.x, z: it.z, grow: it.grow, rot: it.rot })),
      eggs: this.eggs.map((e) => ({ x: e.x, z: e.z, t: e.t, parents: e.parents, kind: e.kind, wild: e.wild, lucky: e.lucky })),
      secrets: this.saveSecrets(friends),
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data))
    } catch {
      /* noop */
    }
  }

  private load(): boolean {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(SAVE_KEY)
    } catch {
      return false
    }
    if (!raw) return false
    try {
      const d = JSON.parse(raw)
      if (!d || typeof d !== 'object' || !d.pet || !isSpecies(d.pet.sp)) return false
      this.coins = num(d.coins, 0, 999999, 50)
      this.care = { power: 0, guard: 0, spirit: 0, ...d.care }
      this.xp = d.xp ?? 0
      this.stats = { ...this.stats, ...d.stats }
      this.stats.gen = Math.round(num(this.stats.gen, 1, 999, 1))
      this.stats.petAge = num(this.stats.petAge, 0, 1e7, 0)
      this.stats.lineage = (Array.isArray(this.stats.lineage) ? this.stats.lineage : []).filter((n: unknown) => typeof n === 'string').slice(-12).map((n: string) => n.slice(0, 12))
      this.oldWarned = this.stats.petAge / LIFESPAN > 0.85
      this.land = Math.round(num(d.land, 0, LAND_SIZES.length - 1, 0))
      setLandSize(LAND_SIZES[this.land])
      this.dex = {}
      if (d.dex && typeof d.dex === 'object' && !Array.isArray(d.dex))
        for (const [k, v] of Object.entries(d.dex)) if (isSpecies(k) && (v === 1 || v === 2)) this.dex[k] = v
      this.dexRare = {}
      if (d.dexRare && typeof d.dexRare === 'object' && !Array.isArray(d.dexRare))
        for (const [k, v] of Object.entries(d.dexRare)) if (isSpecies(k) && (v === 1 || v === 2)) this.dexRare[k] = v
      this.dexClaimed = Math.round(num(d.dexClaimed, 0, 6, 0))
      this.nightTarget = this.night = d.night ?? 0
      // 置き物：種類・数・場所を検査してから使う（ステージごとの上限つき）
      type SavedItem = { kind: unknown; stage: unknown; x: unknown; z: unknown; grow: unknown; rot: unknown }
      const itemCount = new Map<string, number>()
      this.items = []
      for (const it of ((Array.isArray(d.items) ? d.items : []) as SavedItem[]).slice(0, 80)) {
        if (!it || !isItemKind(it.kind)) continue
        const stage = Math.round(num(it.stage, 0, STAGES.length - 1))
        const key = `${it.kind}@${stage}`
        const n = (itemCount.get(key) ?? 0) + 1
        if (n > ITEM_SPEC[it.kind].max) continue
        itemCount.set(key, n)
        this.items.push({
          kind: it.kind, stage, x: num(it.x, -HALF, HALF, 0), z: num(it.z, -HALF, HALF, 0), grow: num(it.grow, 0, 1, 1),
          rot: num(it.rot, -7, 7, 0), vx: 0, vz: 0, mesh: null, sq: 0, tick: 0,
        })
      }
      type SavedHouse = { stage: number; x: number; z: number; ownerSp: SpeciesId; owner: string; mats: number; hp: number }
      const savedHouses = ((Array.isArray(d.houses) ? d.houses : []) as SavedHouse[]).filter((h) => h && typeof h.owner === 'string').slice(0, 40)
      this.houses = savedHouses.map((h) => ({ stage: h.stage, x: h.x, z: h.z, owner: null, ownerSp: isSpecies(h.ownerSp) ? h.ownerSp : 'mebu', mats: num(h.mats, 0, 12), hp: num(h.hp, 0, 100), mesh: null, shake: 0, level: houseLevel(h.mats), alerted: 0 }))
      type SavedStruct = { kind: unknown; stage: number; x: number; z: number; rot: number; len: number; mats: number; hp: number }
      this.structs = ((Array.isArray(d.structs) ? d.structs : []) as SavedStruct[])
        .filter((b) => b && isStructKind(b.kind))
        .slice(0, 60)
        .map((b) => {
          const kind = b.kind as StructKind
          return {
            kind, stage: Math.round(num(b.stage, 0, STAGES.length - 1)), x: num(b.x, -HALF, HALF), z: num(b.z, -HALF, HALF), rot: num(b.rot, -7, 7, 0),
            len: num(b.len, 0, 12, 0), mats: Math.round(num(b.mats, 0, STRUCTS[kind].need)), hp: num(b.hp, 0, 999, STRUCTS[kind].hp), mesh: null, shake: 0, q: -1, t: 0, alerted: 0,
          }
        })
      this.loadStage(Math.min(STAGES.length - 1, Math.round(num(d.stage, 0, STAGES.length - 1))))
      type Saved = { sp: SpeciesId; hp: number; maxHp: number; atk: number; hunger: number; energy: number; grow: number; xp?: number; care?: Record<Care, number>; bias?: Care; seed?: number; rare?: boolean }
      /** 見た目のシード（古いセーブには無いので、その時は新しく決める）。色ちがいは 保存されたものだけ */
      const lookOfSaved = (s: Saved) => ({ seed: Math.round(num(s.seed, 0, 0x7fffffff, newSeed())), rare: s.rare === true && SPECIES[s.sp].tier > 0 })
      const apply = (c: Creature, s: Saved) => {
        Object.assign(c, { hp: num(s.hp, 0, 9999), maxHp: num(s.maxHp, 1, 9999, 10), atk: num(s.atk, 0, 9999, 1), hunger: num(s.hunger, 0, 100, 50), energy: num(s.energy, 0, 100, 50), grow: num(s.grow, 0, 1, 0) })
        if (s.xp !== undefined) c.xp = s.xp
        if (s.care) c.care = Object.assign({ power: 0, guard: 0, spirit: 0 }, s.care)
        if (s.bias) c.bias = s.bias
        c.anim.setHeight(this.size(c))
      }
      this.pet = this.spawn(d.pet.sp, 'pet', 0, 1.5, 0, lookOfSaved(d.pet))
      apply(this.pet, d.pet)
      const friends: Creature[] = []
      for (const f of ((Array.isArray(d.friends) ? d.friends : []) as Saved[]).slice(0, 40)) if (f && isSpecies(f.sp)) {
        const c = this.spawn(f.sp, 'friend', (Math.random() - 0.5) * 2, 2.2, 0, lookOfSaved(f))
        apply(c, f)
        friends.push(c)
      }
      // 家の持ち主をつなぎ直す
      savedHouses.forEach((h, i) => {
        const owner = h.owner === 'pet' ? this.pet : h.owner.startsWith('f') ? friends[Number(h.owner.slice(1))] : undefined
        this.houses[i].owner = owner ?? null
      })
      for (const e of (Array.isArray(d.eggs) ? d.eggs : []).slice(0, 6)) {
        if (!e) continue
        const kind: EggKind = typeof e.kind === 'string' && Object.prototype.hasOwnProperty.call(EGG_COLORS, e.kind) ? e.kind : 'inherit'
        const parents = (Array.isArray(e.parents) ? e.parents : []).filter(isSpecies).slice(0, 2)
        if (kind === 'inherit' && !parents.length) continue
        this.layEgg(num(e.x, -HALF, HALF), num(e.z, -HALF, HALF), parents, num(e.t, 0, 120, 35), kind, !!e.wild, e.lucky === true)
      }
      this.loadSecrets(d.secrets, friends, Array.isArray(d.friends) ? d.friends.slice(0, 40) : [])
      this.say(`おかえり！ ${this.pet.sp.name}が まっていたよ`)
      return true
    } catch {
      return false
    }
  }

  /** データを消して最初から */
  reset() {
    try {
      localStorage.removeItem(SAVE_KEY)
    } catch {
      /* noop */
    }
    location.reload()
  }

  // ================= HUD =================
  private pv = new THREE.Vector3()
  private project(v: THREE.Vector3) {
    return this.projectXYZ(v.x, v.y, v.z)
  }

  /** 3D の点を HUD の座標へ（使い捨ての Vector3 を作らない） */
  private projectXYZ(x: number, y: number, z: number) {
    const p = this.pv.set(x, y, z).project(this.camera)
    return { x: Math.round((p.x + 1) * 0.5 * RES.w), y: Math.round((1 - p.y) * 0.5 * RES.h), on: p.z < 1 }
  }

  private text(s: string, x: number, y: number, color = '#ffffff', size = 10, align: CanvasTextAlign = 'left') {
    const g = this.hudCtx
    g.font = `${size}px ${FONT}`
    g.textAlign = align
    g.textBaseline = 'top'
    g.fillStyle = '#10122a'
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]]) g.fillText(s, x + dx, y + dy)
    g.fillStyle = color
    g.fillText(s, x, y)
  }

  /** 青いグラデーションのウィンドウ（白い 2 重枠） */
  private win(x: number, y: number, w: number, h: number) {
    const g = this.hudCtx
    const grad = g.createLinearGradient(0, y, 0, y + h)
    grad.addColorStop(0, 'rgba(46,72,170,0.92)')
    grad.addColorStop(1, 'rgba(16,24,80,0.92)')
    g.fillStyle = grad
    g.fillRect(x, y, w, h)
    g.strokeStyle = '#e8eeff'
    g.lineWidth = 1
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
    g.strokeStyle = 'rgba(120,150,255,0.8)'
    g.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5)
  }

  private bar(x: number, y: number, w: number, ratio: number, color?: string) {
    const g = this.hudCtx
    g.fillStyle = '#10122a'
    g.fillRect(x - 1, y - 1, w + 2, 5)
    g.fillStyle = '#3a3f66'
    g.fillRect(x, y, w, 3)
    g.fillStyle = color ?? (ratio > 0.5 ? '#5ef28a' : ratio > 0.25 ? '#ffd23f' : '#ff4d6d')
    g.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, ratio))), 3)
  }

  private icon(i: number, cx: number, cy: number, on: boolean) {
    const g = this.hudCtx
    const bmp = ICON_BMP[i]
    const x0 = cx - 9
    const y0 = cy - 9
    if (on) {
      const blink = Math.floor(this.time * 4) % 2 === 0
      g.fillStyle = blink ? '#ffd23f' : '#fff6c8'
      g.fillRect(x0 - 3, y0 - 3, 24, 24)
      g.fillStyle = '#10122a'
      g.fillRect(x0 - 2, y0 - 2, 22, 22)
    }
    for (const pass of [0, 1])
      for (let y = 0; y < 9; y++)
        for (let x = 0; x < 9; x++) {
          if (bmp[y][x] !== '#') continue
          if (pass === 0) {
            g.fillStyle = '#10122a'
            g.fillRect(x0 + x * 2 - 1, y0 + y * 2 - 1, 4, 4)
          } else {
            g.fillStyle = on ? ICON_COLORS[i] : this.cursor < 0 ? ICON_COLORS[i] : 'rgba(200,210,240,0.7)'
            g.fillRect(x0 + x * 2, y0 + y * 2, 2, 2)
          }
        }
  }

  /** 色ちがいの目印（小さな金の ★） */
  private starMark(x: number, y: number) {
    const g = this.hudCtx
    g.fillStyle = '#10122a'
    g.fillRect(x - 3, y - 2, 7, 7)
    g.fillStyle = Math.floor(this.time * 3) % 2 ? '#ffd23f' : '#fff6b0'
    for (const [dx, dy, w] of [[0, -1, 1], [-1, 0, 3], [-2, 1, 5], [-1, 2, 3], [-2, 3, 1], [2, 3, 1]]) g.fillRect(x + dx, y + dy, w, 1)
  }

  /** ボスの大きな HP バー（画面の上のまんなか）。ボスが出ている間だけ */
  private drawBossBar() {
    const boss = this.creatures.find((c) => c.sp.boss && this.alive(c))
    if (!boss) return
    const g = this.hudCtx
    const w = 208
    const x = Math.round((RES.w - w) / 2)
    const y = 46
    g.fillStyle = 'rgba(10,14,40,0.82)'
    g.fillRect(x, y, w, 25)
    g.strokeStyle = '#ff9a3a'
    g.strokeRect(x + 0.5, y + 0.5, w - 1, 24)
    this.text(`ボス ${boss.sp.name}`, x + 8, y + 3, '#ffd0a0', 10)
    this.text(`${Math.max(0, Math.ceil(boss.hp))}/${boss.maxHp}`, x + w - 8, y + 4, '#ffffff', 8, 'right')
    const r = Math.max(0, Math.min(1, boss.hp / boss.maxHp))
    g.fillStyle = '#10122a'
    g.fillRect(x + 6, y + 15, w - 12, 7)
    g.fillStyle = '#3a2030'
    g.fillRect(x + 7, y + 16, w - 14, 5)
    g.fillStyle = r > 0.5 ? '#ff5e3a' : r > 0.25 ? '#ff9a3a' : '#ffd23f'
    g.fillRect(x + 7, y + 16, Math.round((w - 14) * r), 5)
    g.fillStyle = 'rgba(255,255,255,0.35)'
    g.fillRect(x + 7, y + 16, Math.round((w - 14) * r), 1)
    for (const k of [0.25, 0.5, 0.75]) {
      g.fillStyle = 'rgba(16,18,42,0.8)'
      g.fillRect(x + 7 + Math.round((w - 14) * k), y + 16, 1, 5)
    }
  }

  private heartMark(x: number, y: number) {
    const g = this.hudCtx
    g.fillStyle = '#10122a'
    g.fillRect(x - 3, y - 1, 7, 6)
    g.fillStyle = '#ff7eb6'
    for (const [dx, dy, w] of [[-2, 0, 2], [1, 0, 2], [-2, 1, 5], [-1, 2, 3], [0, 3, 1]]) g.fillRect(x + dx, y + dy, w, 1)
  }

  private drawHud() {
    const g = this.hudCtx
    g.clearRect(0, 0, RES.w, RES.h)
    g.imageSmoothingEnabled = false
    if (this.cleanView) {
      // 眺めるモード：何も描かない
      this.hudTex.needsUpdate = true
      return
    }

    for (const [y, row] of [[0, 0], [RES.h - 24, 1]] as const) {
      const grad = g.createLinearGradient(0, y, 0, y + 24)
      grad.addColorStop(0, 'rgba(10,14,40,0.75)')
      grad.addColorStop(1, 'rgba(10,14,40,0.45)')
      g.fillStyle = grad
      g.fillRect(0, y, RES.w, 24)
      for (let k = 0; k < 4; k++) this.icon(row * 4 + k, 40 + k * 80, y + 12, this.cursor === row * 4 + k)
    }

    // コイン
    const coinText = `${this.coins}`
    g.font = `10px ${FONT}`
    const cw = Math.ceil(g.measureText(coinText).width) + 20
    g.fillStyle = 'rgba(10,14,40,0.7)'
    g.fillRect(RES.w - cw - 4, 27, cw, 14)
    g.fillStyle = '#ffd23f'
    g.beginPath()
    g.arc(RES.w - cw + 4, 34, 4, 0, Math.PI * 2)
    g.fill()
    this.text(coinText, RES.w - 8, 29, '#ffe9a8', 10, 'right')
    if (this.coinPop.t > 0) {
      // 買った分が ふわっと 引かれる
      const k = 1 - this.coinPop.t / 1.4
      g.save()
      g.globalAlpha = Math.min(1, this.coinPop.t * 2.5)
      this.text(`-${this.coinPop.n}`, RES.w - 8, Math.round(43 + k * 8), '#ff9a9a', 10, 'right')
      g.restore()
    }
    // 天気
    const wt = WEATHER_NAME[this.weather]
    const ww = Math.ceil(g.measureText(wt).width) + 12
    g.fillStyle = 'rgba(10,14,40,0.7)'
    g.fillRect(RES.w - cw - ww - 8, 27, ww, 14)
    this.text(wt, RES.w - cw - 8 - ww / 2, 29, { sun: '#ffe9a8', cloud: '#d8dee8', rain: '#9fd8ff', snow: '#ffffff', ember: '#ffa86b' }[this.weather], 10, 'center')

    // 村の名前と にぎわい、敵軍の知らせ
    if (this.vLv > 0 && this.banner <= 0) {
      const t = `${this.villageName()} ★${Math.floor(this.vScore)}`
      g.font = `9px ${FONT}`
      const vw = Math.ceil(g.measureText(t).width) + 10
      g.fillStyle = 'rgba(10,14,40,0.7)'
      g.fillRect(6, 27, vw, 14)
      this.text(t, 11, 29, '#ffe9a8', 9)
    }
    if (this.army) {
      const a = this.army
      const t = a.phase === 'warn' ? `てきぐん せっきん！ ${Math.ceil(a.t)}` : `てきぐん のこり ${a.left.length}`
      g.font = `9px ${FONT}`
      const aw = Math.ceil(g.measureText(t).width) + 10
      g.fillStyle = Math.floor(this.time * 3) % 2 ? 'rgba(120,20,30,0.85)' : 'rgba(80,14,24,0.85)'
      g.fillRect(6, 43, aw, 14)
      this.text(t, 11, 45, '#ffd0d0', 9)
    }
    // 建物：建てている途中はできあがり具合、こわされていれば残り
    for (const b of this.structs) {
      if (b.stage !== this.stageIndex || !b.mesh) continue
      const done = this.structDone(b)
      if (b.kind === 'wall' && (done ? b.hp >= STRUCTS.wall.hp - 1 : b.mats === 0)) continue
      if (done && b.hp >= STRUCTS[b.kind].hp - 1) continue
      const hgt = { castle: 3.5, tower: 2.7, cradle: 1.7, well: 1.6, farm: 1.2, wall: 1.1, bridge: 0.9 }[b.kind]
      const p = this.projectXYZ(b.x, this.stage.heightAt(b.x, b.z) + hgt, b.z)
      if (!p.on) continue
      if (!done) this.bar(p.x - 10, p.y, 20, b.mats / STRUCTS[b.kind].need, '#c8955a')
      else this.bar(p.x - 10, p.y, 20, b.hp / STRUCTS[b.kind].hp, '#ff9f43')
    }
    // 家：建てている途中はできあがり具合、こわされていれば残り
    for (const h of this.houses) {
      if (h.stage !== this.stageIndex || !h.mesh) continue
      const s = this.projectXYZ(h.x, this.stage.heightAt(h.x, h.z) + (h.level >= 4 ? 2.4 : h.level >= 3 ? 1.9 : 1.1), h.z)
      if (!s.on) continue
      if (h.level < 3) this.bar(s.x - 10, s.y, 20, h.mats / HOUSE_STEPS[3], '#c8955a')
      else if (h.hp < houseMaxHp(h.level) - 1) this.bar(s.x - 10, s.y, 20, h.hp / houseMaxHp(h.level), '#ff9f43')
    }

    // 頭の上の目印 + HP バー
    for (const c of this.creatures) {
      if (c.state === 'dead' || (c.inside && c.state === 'sleep')) continue
      const top = this.projectXYZ(c.x, this.ground(c) + c.jy + this.size(c) + 0.15, c.z)
      if (!top.on) continue
      if (c.team === 'pet' && this.view === 'eye') continue
      if (c.team === 'pet') {
        const by = top.y - 9 + Math.round(Math.sin(this.time * 5) * 1.5)
        g.fillStyle = '#10122a'
        g.fillRect(top.x - 4, by - 1, 9, 2)
        g.fillStyle = '#ffd23f'
        for (let i = 0; i < 3; i++) g.fillRect(top.x - 3 + i, by + i, 7 - i * 2, 1)
      } else if (c.team === 'friend') {
        this.heartMark(top.x, top.y - 9)
        if (c.role !== 'free') {
          // 色だけに頼らないよう、役割ごとに形も変える（だいく = ■ / はたけがかり = ▲ / みはり = ✚）
          const rx = top.x + 6
          const ry = top.y - 9
          g.fillStyle = '#10122a'
          g.fillRect(rx - 1, ry - 1, 5, 5)
          g.fillStyle = ROLE_COLOR[c.role]
          if (c.role === 'builder') g.fillRect(rx, ry, 3, 3)
          else if (c.role === 'farmer') {
            g.fillRect(rx + 1, ry, 1, 1)
            g.fillRect(rx, ry + 1, 3, 2)
          } else {
            g.fillRect(rx + 1, ry, 1, 3)
            g.fillRect(rx, ry + 1, 3, 1)
          }
        }
      }
      else if (c.affinity > 30 && c.sp.temper === 'calm') {
        // 仲良くなりかけ：小さなハートゲージ
        g.fillStyle = 'rgba(255,126,182,0.85)'
        g.fillRect(top.x - 5, top.y - 6, Math.round(10 * Math.min(1, c.affinity / 100)), 2)
      }
      if (c.rare) this.starMark(top.x - 11, top.y - 8)
      if (c.sp.boss) continue
      if (c.state === 'fight' || c.state === 'assist' || c.hp < c.maxHp - 0.5 || c.team === 'pet') this.bar(top.x - 10, top.y - 2, 20, c.hp / c.maxHp)
    }
    this.drawBossBar()
    // たまごの残り時間
    for (const e of this.eggs) {
      const s = this.projectXYZ(e.x, this.stage.heightAt(e.x, e.z) + 0.75, e.z)
      if (s.on) this.bar(s.x - 8, s.y, 16, 1 - e.t / 35, '#7fd1ff')
    }

    for (const p of this.popups) {
      if (p.t < 0) continue
      const s = this.project(p.pos)
      if (!s.on) continue
      if (p.big) {
        // 技名：小さな札に入れて大きめに
        g.font = `11px ${FONT}`
        const w = Math.ceil(g.measureText(p.text).width) + 12
        g.fillStyle = 'rgba(10,14,40,0.8)'
        g.fillRect(s.x - w / 2, s.y - 16, w, 15)
        g.fillStyle = p.color
        g.fillRect(s.x - w / 2, s.y - 2, w, 1)
        this.text(p.text, s.x, s.y - 14, '#ffffff', 11, 'center')
      } else this.text(p.text, s.x, s.y - 6, p.color, p.text.endsWith('!') ? 12 : 10, 'center')
    }

    if (this.banner > 0) {
      const x = this.banner > 3 ? -120 + (3.5 - this.banner) * 240 : 8
      this.win(x, 30, 124, 30)
      this.text(this.stage.name, x + 8, 34, '#ffffff', 11)
      this.text(this.stage.sub, x + 8, 47, '#9fd8ff', 8)
    }

    this.drawSecretCard()

    const label = this.cursor >= 0 && !this.messages.length && !this.shopOpen ? `▶ ${ICONS[this.cursor]}` : this.messages[0]
    if (label) {
      this.win(8, RES.h - 60, RES.w - 16, 32)
      this.text(label, 18, RES.h - 50, '#ffffff', 11)
    }

    if (this.showStatus) this.drawStatus()
    if (this.shopOpen) this.drawShop()
    this.drawInfo()

    if (this.night > 0.05) {
      g.fillStyle = `rgba(8,10,40,${this.night * 0.18})`
      g.fillRect(0, 24, RES.w, RES.h - 48)
    }
    this.hudTex.needsUpdate = true
  }

  private drawStatus() {
    const p = this.pet
    const x = 40
    const y = 28
    this.win(x, y, 240, 164)
    this.text(this.nm(p), x + 12, y + 8, '#ffffff', 13)
    this.text(p.sp.kind, x + 12, y + 25, '#9fd8ff', 9)
    this.text(`だい${this.stats.gen}せだい`, x + 228, y + 9, '#ffd23f', 9, 'right')
    const need = p.sp.tier >= 1 && p.sp.tier <= 3 ? XP_NEED[p.sp.tier as 1 | 2 | 3] : 0
    const rows: [string, number, number, string?][] = [
      ['たいりょく', p.hp, p.maxHp], ['おなか', p.hunger, 100, '#ff9f43'], ['げんき', p.energy, 100, '#6fe7ff'],
      ['きげん', this.stats.mood, 100, '#ff7eb6'], ['しんか', need ? this.xp : 1, need || 1, '#c9a8ff'], ['じゅみょう', Math.max(0, 1 - this.stats.petAge / LIFESPAN), 1, '#9be28a'],
    ]
    rows.forEach(([n, v, m, col], i) => {
      this.text(n, x + 12, y + 40 + i * 14, '#e8eeff', 9)
      this.bar(x + 80, y + 44 + i * 14, 140, v / m, col)
    })
    const top = (Object.keys(this.care) as Care[]).sort((a, b) => this.care[b] - this.care[a])[0]
    const hint = this.care[top] > 0 ? CARE_NAME[top] : 'まだ ふつう'
    this.text(`けいこう ${hint}   こうげき ${Math.round(p.atk)}   かち ${this.stats.wins}`, x + 12, y + 112, '#ffffff', 9)
    const friends = this.creatures.filter((c) => c.team === 'friend').length
    const home = this.homeOf(p)
    const homeText = home ? ['たてはじめ', 'どだい', 'かべ', 'かんせい'][home.level] : 'なし'
    this.text(`なかま ${friends}  こども ${this.stats.children}  いえ ${homeText}`, x + 12, y + 142, '#ffe9a8', 9)
  }

  private drawShop() {
    const g = this.hudCtx
    drawShopWindow(
      {
        g,
        text: (t, x, y, color, size, align) => this.text(t, x, y, color, size, align),
        win: (x, y, w, h) => this.win(x, y, w, h),
        measure: (t, size) => {
          g.font = `${size}px ${FONT}`
          return g.measureText(t).width
        },
      },
      { coins: this.coins, cursor: this.shopCursor, time: this.time, check: (it) => this.shopCheck(it) },
    )
  }

  // ================= 描画 =================
  render(renderer: THREE.WebGLRenderer) {
    const prev = renderer.getRenderTarget()
    renderer.setRenderTarget(this.rtScene)
    // 目線モードでは自分の体は映さない
    const self = this.pet.anim.sprite
    const was = self.visible
    if (this.view === 'eye') {
      self.visible = false
      this.pet.shadow.visible = false
    }
    renderer.render(this.scene, this.camera)
    self.visible = was
    this.pet.shadow.visible = true
    renderer.setRenderTarget(this.rtOut)
    renderer.render(this.postScene, this.postCam)
    renderer.setRenderTarget(prev)
  }

  debug() {
    return {
      stage: this.stage.name,
      coins: this.coins,
      xp: this.xp,
      care: this.care,
      pet: { sp: this.pet.sp.name, state: this.pet.state, hp: Math.round(this.pet.hp), atk: this.pet.atk },
      creatures: this.creatures.map((c) => `${c.sp.name}:${c.team}:${c.state}${c.grow ? ':child' : ''}`),
      items: this.items.map((it) => `${it.kind}@${it.stage}:${it.grow.toFixed(2)}`),
      weather: this.weather,
      houses: this.houses.map((h) => `${h.ownerSp}${h.owner ? '' : '(空き家)'}@${h.stage}:L${h.level}:${h.mats}/8:hp${Math.round(h.hp)}`),
      structs: this.structs.map((b) => `${b.kind}@${b.stage}:${b.mats}/${STRUCTS[b.kind].need}:hp${Math.round(b.hp)}`),
      gen: `だい${this.stats.gen}せだい age=${Math.round(this.stats.petAge)}s dex=${Object.keys(this.dex).length} land=${this.land}`,
      roles: this.creatures.filter((c) => c.role !== 'free').map((c) => `${c.sp.name}:${c.role}`),
      village: `${this.villageName()} ★${this.vScore} L${this.vLv}`,
      army: this.army ? `${this.army.phase}:${Math.ceil(this.army.t)}s:${this.army.left.length}/${this.army.n}` : null,
      resources: this.resources.length,
      eggs: this.eggs.length,
      foods: this.foods.length,
    }
  }
}
