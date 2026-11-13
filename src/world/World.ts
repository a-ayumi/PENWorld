import * as THREE from 'three'
import { OUT, RES } from './psx'
import { DioramaLook } from './diorama'
import { NavGrid } from './nav'
import { SkyFx } from './sky'
import { SpriteAnim, iconSheet } from './sprites'
import { EGG_COLORS, NEW_SKILLS, SPECIES, enemyFor, type Care, type EggKind, type MonsterView, type Species, type SpeciesId } from './monsters'
import { WeatherFx, fxLod } from './fxprops'
import { SIZE, STAGES, type Stage } from './stages'
import { type StructKind } from './structures'
import { type ItemKind } from './items'
import { SHOP, type ShopItem } from './shop'
import { MissionBook, SEASON_INFO, seasonNow, type Season, type Stats } from '../missions'
import { newRoad, type Road } from '../roadmap'
import * as Cr from './parts/creatures'
import * as Vi from './parts/village'
import * as Ev from './parts/events'
import * as Ui from './parts/ui'
import * as Sv from './parts/save'
import * as Up from './parts/update'

/**
 * 箱庭の世界。モンスターが自分で考えて暮らす（歩く・食べる・眠る・遊ぶ・戦う・仲間になる・たまごを産む）。
 * 人は「環境」を用意して見守る：ショップで食べ物や置き物を買って箱庭に置く。
 * 描画は 320×240 の RenderTarget → PS1 風の仕上げ → 本体の液晶 / 全画面 に使う。
 */

export type Sfx = 'select' | 'ok' | 'cancel' | 'hit' | 'crit' | 'win' | 'lose' | 'eat' | 'warp' | 'evolve' | 'train' | 'coin' | 'friend' | 'egg' | 'skill' | 'boom'
  | 'build' | 'built' | 'hatch' | 'dex' | 'role' | 'generation' | 'alarm' | 'boss' | 'tower' | 'demolish' | 'buy' | 'expand' | 'victory'
export type Team = 'pet' | 'friend' | 'wild'
export type State =
  | 'idle' | 'wander' | 'hunt' | 'fight' | 'assist' | 'seek' | 'eat' | 'sleep' | 'rest' | 'play'
  | 'happy' | 'faint' | 'dead' | 'train' | 'come' | 'gather' | 'build' | 'raid' | 'march' | 'work' | 'tend' | 'dance' | 'frolic'

export interface Creature {
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
  /** 大軍勢の大ボス（大きく描く） */
  boss?: boolean
  /** ぷにぷに動き：着地のつぶれ・前の高さ */
  squash: number
  pj: number
  /** 組み立て作業の終わりにやること（かなづちの動きのあと実行） */
  finish: (() => void) | null
  role: Role
  tendTo: Struct | null
  /** あそびば（frolic）の場所 / おまつり（dance）の輪の角度と半径 */
  spot: Struct | null
  dAng: number
  dR: number
  /** ひっかかり対策：前に見た場所・たまった時間・回りこみ先 */
  lx: number
  lz: number
  mvT: number
  stuck: number
  detourN: number
  detour: { x: number; z: number; t: number } | null
  /** 道さがしで見つけた道（曲がり角の列）と、その道の目的地・いま向かっている点 */
  path: { x: number; z: number }[] | null
  pathTo: { x: number; z: number }
  pathI: number
  avoid: 1 | -1
  /** 個体の見た目のシード（もよう・色のゆらぎ）と 色ちがい */
  seed: number
  rare: boolean
  /** 進化の演出中（白いシルエット → ふくらむ → 新しい姿） */
  evo: Evo | null
  /** 色ちがいのキラキラを出す間隔 */
  glint: number
  /** 生きた秒数と じゅみょう（秒）。0 = としを とらない（敵）。ペットは stats.petAge と LIFESPAN を使う */
  age: number
  life: number
  /** じゅみょうで ねむりについた（たおれた時とちがう、しずかな消え方） */
  retired?: boolean
}
/** 進化の演出：t = 経過秒 / from = 元の種族 / h0 = 元の大きさ / shown = いま出している絵 */
export interface Evo { t: number; from: SpeciesId; to: SpeciesId; h0: number; shown: 'old' | 'white-old' | 'white-new' | 'new'; said: boolean }

/** 技：種族ごとに 1 つ。演出の種類（shot = 弾 / burst = 衝撃 / dash = 突進 / rain = 降りそそぐ / heal = 回復 / wave = 地面の波）*/
export interface Skill { name: string; kind: 'shot' | 'burst' | 'dash' | 'rain' | 'heal' | 'wave'; color: string; mult: number }
export const SKILLS: Record<string, Skill> = {
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
export interface Shot { sprite: THREE.Sprite; from: THREE.Vector3; src: Creature; dst: Creature; t: number; dur: number; dmg: number; skill: Skill; arc: number }
export interface Ring { mesh: THREE.Mesh; t: number; dur: number; size: number }
export interface Later { t: number; run: () => void }
/** 買った時に吸いこまれていくコイン */
export interface Suck { anim: SpriteAnim; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; bs: number }
export type ResKind = 'wood' | 'stone'
export interface Res { kind: ResKind; x: number; z: number; mesh: THREE.Mesh; taken: Creature | null }
export interface House {
  stage: number; x: number; z: number; owner: Creature | null; ownerSp: SpeciesId
  /** 運びこまれた資材の数（2 = 土台 / 5 = かべ / 8 = 屋根まで完成） */
  mats: number; hp: number; mesh: THREE.Group | null; shake: number; level: number; alerted: number
}
/** 家のほかの建物（はたけ・いど・みはりとう・ゆりかごごや・へい・おしろ・はし・ふんすい・ふうしゃ・とうだい・いちば・あそびば・いしのとりで）。mats が need になると完成 */
export interface Struct {
  kind: StructKind; stage: number; x: number; z: number; rot: number; len: number
  mats: number; hp: number; mesh: THREE.Group | null; shake: number; q: number; t: number; alerted: number
}
/** むらの おまつり：中心・のこり時間・おどった数 */
export interface Festival { x: number; z: number; t: number; dur: number; n: number; tick: number; fx: number; ring: number; rad: number }
/** いちばに来る やどかり（行商）：in = 歩いてくる / sell = 売っている / out = 帰る */
export interface Peddler { g: THREE.Group; shadow: THREE.Mesh; x: number; z: number; ex: number; phase: 'in' | 'sell' | 'out'; t: number; mk: Struct; given: boolean }
/** 敵軍：warn = 近づいている / on = 攻めてきている */
export interface Army { phase: 'warn' | 'on'; t: number; left: Creature[]; n: number; castle: boolean; wave: number; boss?: boolean }
/** 物語カード（章のはじめ・おわり）*/
export interface Card { title: string; sub: string; lines: string[]; color: string; at: number; t0: number }
export type Weather = 'sun' | 'cloud' | 'rain' | 'snow' | 'ember'
export type FoodKind = 'stage' | 'meat' | 'sweet' | 'nut'
export interface Food { mesh: THREE.Group; x: number; z: number; y: number; vy: number; landed: boolean; taken: Creature | null; bite: number; kind: FoodKind }
/** 村での役割（だいく・はたけがかり・みはり・おせわ（あそびば）・うりこ（いちば）） */
export type Role = 'free' | 'builder' | 'farmer' | 'guard' | 'carer' | 'seller'
export const ROLE_NAME: Record<Role, string> = { free: 'じゆう', builder: 'だいく', farmer: 'はたけがかり', guard: 'みはり', carer: 'おせわ', seller: 'うりこ' }
export const ROLE_COLOR: Record<Role, string> = { free: '#ffffff', builder: '#ffb84d', farmer: '#7cf29b', guard: '#6fd6ff', carer: '#ff8fc8', seller: '#d8a8ff' }
/** ペットの じゅみょう（あそんでいる時間・秒） */
export const LIFESPAN = 25 * 60
/** なかま・野生のおとなしい子の じゅみょう（秒）。1 匹ずつ この間でばらつく */
export const FRIEND_LIFE: [number, number] = [12 * 60, 18 * 60]
export const newLife = () => FRIEND_LIFE[0] + Math.random() * (FRIEND_LIFE[1] - FRIEND_LIFE[0])
/** はじめ（新しいゲーム・ステージに入った直後）は、敵がおそってこない秒数 */
export const PEACE_TIME = 90
export interface Item {
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
export interface Egg { x: number; z: number; t: number; anim: SpriteAnim; shadow: THREE.Mesh; parents: SpeciesId[]; kind: EggKind; wild: boolean; lucky: boolean; deco?: Season; /** うんだめしのたまご：1 = レア / 2 = スーパーレア */ luck?: number }
/** バトル予想（lucky.ts）に渡す、じゃれあいバトルの片方の情報 */
export interface SparSide { name: string; fam: string; tier: number; hp: number; maxHp: number; atk: number; cheer: boolean; mine: boolean }
export interface SparMatch { id: number; a: SparSide; b: SparSide }
export interface Popup { pos: THREE.Vector3; text: string; color: string; t: number; big?: boolean }
export type Pick = { type: 'creature' | 'house' | 'struct' | 'item' | 'egg' | 'res' | 'food' | 'chest'; ref: any; armed: boolean }
export const STATE_NAME: Record<string, string> = {
  idle: 'ぼんやり', wander: 'さんぽ', hunt: 'おいかけている', fight: 'たたかっている', seek: 'ごはんへ むかう', eat: 'たべている', sleep: 'ねむっている', rest: 'やすんでいる',
  play: 'あそんでいる', happy: 'うれしい', faint: 'きぜつ', dead: 'たおれた', train: 'トレーニング', come: 'よばれた', gather: 'しざいを ひろう', build: 'しざいを はこぶ',
  raid: 'こわしている', march: 'しんぐん中', work: 'トントン つくっている', tend: 'はたけの せわ', assist: 'たすけに むかう', dance: 'おまつりで おどっている', frolic: 'あそびばで あそんでいる',
}
export const STRUCT_DESC: Record<StructKind, string> = {
  farm: 'たべものが みのる。はたけがかりが せわをする',
  well: 'ちかくの みんなの たいりょくが かいふく',
  tower: 'ちかくの てきを うちおとす',
  cradle: 'たまごが できやすくなる',
  wall: 'てきの しんぐんを ふせぐ',
  castle: 'へいに かこまれた おしろ。ちかくで かいふく',
  bridge: 'みずうみを あるいて わたれる',
  fountain: 'ちかくの みんなが かいふく・きげんUP',
  windmill: 'はねが まわり しざいが うまれる',
  lighthouse: 'よる ひかる。てきぐんを はやく みつける',
  market: 'しゅうにゅうUP。やどかりが くる',
  playground: 'こどもが はやく そだつ。こころも そだつ',
  fort: 'ちかくの なかまの こうげきUP',
}
/** 完成した時に もう 1 つ出すメッセージ */
export const STRUCT_DONE: Partial<Record<StructKind, string>> = {
  fountain: 'ふんすいから みずが ふきだした！',
  windmill: 'ふうしゃの はねが まわりはじめた',
  lighthouse: 'とうだいに あかりが ともった',
  market: 'いちばが ひらいた！ にぎやかに なりそう',
  playground: 'あそびばから こどもたちの こえが きこえる',
  fort: 'とりでの そばの なかまは つよくなる',
}
export interface Fx { sprite: THREE.Sprite; vx: number; vy: number; vz: number; life: number; max: number; grav: number }

export const ICONS = ['ごはん', 'トレーニング', 'バトル', 'ステータス', 'ライト', 'ショップ', 'ワープ', 'よびだし']
export const ICON_COLORS = ['#ff9f43', '#ff5e5e', '#ffd23f', '#ff7eb6', '#fff27a', '#ffb84d', '#a98bff', '#7cf29b']
export const ICON_BMP = [
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
export const FOODS: Record<Exclude<FoodKind, 'stage'>, { name: string; color: string; leaf: string; hunger: number; mood: number; care: Care }> = {
  meat: { name: 'スタミナにく', color: '#d9534f', leaf: '#f4ead6', hunger: 45, mood: 5, care: 'power' },
  sweet: { name: 'あまいみ', color: '#ff8fd8', leaf: '#7cf29b', hunger: 25, mood: 20, care: 'spirit' },
  nut: { name: 'かたいナッツ', color: '#b07a3a', leaf: '#6d4c41', hunger: 35, mood: 5, care: 'guard' },
}
export const CARE_NAME: Record<Care, string> = { power: 'ちから', guard: 'まもり', spirit: 'こころ' }

/** セーブデータ・読み込んだコードは信用しない：種族は自前のキーだけ、数値は範囲に収める */
export const isSpecies = (v: unknown): v is SpeciesId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(SPECIES, v)
export const num = (v: unknown, min: number, max: number, def = min) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def)

/** 季節の品：その季節のあいだだけ SHOP の末尾に足す（deco = かざりつきのたまご） */
export type SeasonShop = ShopItem & { season: Season; deco?: boolean }
export const SEASON_SHOP: SeasonShop[] = [
  { id: 'deco-spring', name: SEASON_INFO.spring.egg, price: 90, desc: 'はなびらの かざりつき。なにが うまれるかな', cat: 'egg', icon: 'egg?', egg: 'random', season: 'spring', deco: true },
  { id: 'deco-summer', name: SEASON_INFO.summer.egg, price: 90, desc: 'なつまつりの かざりつき。なにが うまれるかな', cat: 'egg', icon: 'egg?', egg: 'random', season: 'summer', deco: true },
  { id: 'deco-autumn', name: SEASON_INFO.autumn.egg, price: 90, desc: 'みのりの かざりつき。なにが うまれるかな', cat: 'egg', icon: 'egg?', egg: 'random', season: 'autumn', deco: true },
  { id: 'deco-winter', name: SEASON_INFO.winter.egg, price: 90, desc: 'ゆきの かざりつき。なにが うまれるかな', cat: 'egg', icon: 'egg?', egg: 'random', season: 'winter', deco: true },
  { id: 'snowman', cat: 'item', icon: 'snowman', name: 'ゆきだるま', price: 30, desc: 'ゆきまつりの かざり。\nふゆの あいだ だけ かえる', item: 'snowman', season: 'winter' },
]
/** いまの季節の品だけが SHOP に並ぶようにする */
export function syncSeasonShop(season: Season) {
  for (let i = SHOP.length - 1; i >= 0; i--) if ('season' in SHOP[i]) SHOP.splice(i, 1)
  SHOP.push(...SEASON_SHOP.filter((it) => it.season === season))
}
/** 季節ごとの天気の出やすさ（かけ算） */
export const SEASON_WEATHER: Record<Season, Partial<Record<Weather, number>>> = {
  spring: { rain: 1.3, snow: 0.2, ember: 0.5 },
  summer: { sun: 1.3, rain: 1.2, snow: 0.05, ember: 1.4 },
  autumn: { cloud: 1.3, snow: 0.5 },
  winter: { snow: 5, sun: 0.8, rain: 0.6, ember: 0.3 },
}
/** かざりつきのたまご（季節ごとのもよう）。from は [から, かげ, ひかり, もよう, リボン] */
export const DECO_COLORS: Record<Season, [string, string, string, string, string]> = {
  spring: ['#ffd0e4', '#e79ab8', '#fff0f6', '#7cd68a', '#ff8fb1'],
  summer: ['#bfeaff', '#7fc0e0', '#eefaff', '#ffd23f', '#ff6b4a'],
  autumn: ['#ffc78a', '#d98f45', '#ffe8c4', '#8a4b1f', '#c2410c'],
  winter: ['#eef6ff', '#a9c4e6', '#ffffff', '#8fc8ff', '#5b8fd9'],
}
export const DECO_SHEET = (season: Season) => {
  const [shell, shade, light, mark, ribbon] = DECO_COLORS[season]
  return iconSheet(
    ['...hh....', '..#####..', '.##r#r##.', '.#######.', 'rrrrrrrrr', '###o#o###', '###o###od', '.######dd', '..####ddd'],
    { '#': shell, o: mark, h: light, d: shade, r: ribbon },
  )
}

export const FX_SHEETS = () => ({
  heart: iconSheet(['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'], { '#': '#ff4d7a' }),
  spark: iconSheet(['...#...', '...#...', '..###..', '#######', '..###..', '...#...', '...#...'], { '#': '#fff27a' }),
  zzz: iconSheet(['#####', '...#.', '..#..', '.#...', '#####'], { '#': '#cfe6ff' }),
  cube: iconSheet(['###', '###', '###'], { '#': '#5ef2ff' }),
  hit: iconSheet(['#...#', '.#.#.', '..#..', '.#.#.', '#...#'], { '#': '#ffffff' }),
  coin: iconSheet(['.###.', '##.##', '#.#.#', '##.##', '.###.'], { '#': '#ffd23f' }),
})
/** たまごのから（系統ごとに色ともようが違う） */
export const EGG_SHEET = (kind: EggKind) => {
  const [shell, shade, light, mark] = EGG_COLORS[kind]
  return iconSheet(
    ['...hh....', '..#####..', '.##o####.', '.#######.', '##o###o##', '#########', '###o####d', '.######dd', '..####ddd'],
    { '#': shell, o: mark, h: light, d: shade },
  )
}

/** 少し見下ろす箱庭カメラ（手前の木でキャラが隠れにくい角度） */
export const CAM_OFF = new THREE.Vector3(0, 6.6, 5.8)
export const FONT = '"DotGothic16", "Hiragino Sans", "Noto Sans JP", "Yu Gothic", Meiryo, ui-monospace, monospace'
export const SAVE_KEY = 'pulsar-save-v1'
export const HOUSE_STEPS = [0, 2, 5, 8, 12]
export const MAX_STRUCTS = 26
/** いしのとりでの力がとどく距離 */
export const FORT_RANGE = 6.5
export const MAX_HOUSES = 6
export const MAX_RES = 12
export const houseLevel = (mats: number) => (mats >= 12 ? 4 : mats >= 8 ? 3 : mats >= 5 ? 2 : mats >= 2 ? 1 : 0)
export const houseMaxHp = (level: number) => level * 25
/** 家の屋根の色（建てた種族の色） */
export const ROOF: Partial<Record<SpeciesId, string>> = {
  mebu: '#5cc25a', pikori: '#ffd23f', gorota: '#8a94a6', mofuru: '#7fb2ff', giaru: '#8e6cff', hireru: '#3fc1c9',
  fuwari: '#ff9ecb', garudora: '#4a6fa5', shioryu: '#2fb5c9', hoshikujira: '#2a3a7a',
}
export const WEATHER_NAME: Record<Weather, string> = { sun: 'はれ', cloud: 'くもり', rain: 'あめ', snow: 'ゆき', ember: 'ひのこ' }
export const WEATHER_MSG: Record<Weather, string> = {
  sun: 'そらが はれてきた', cloud: 'くもが でてきた', rain: 'あめが ふってきた', snow: 'ゆきが ふってきた', ember: 'ひのこが まいはじめた…',
}
/** ステージごとの天気の出やすさ（森・砂丘・入り江・雪原・雪山・火山・遺跡） */
export const WEATHER_W: Partial<Record<Weather, number>>[] = [
  { sun: 4, cloud: 2.5, rain: 2.5, snow: 0.4, ember: 0.6 },
  { sun: 4.5, cloud: 2, ember: 3, rain: 0.5 },
  { sun: 4.5, cloud: 2, rain: 3, ember: 0.5 },
  { snow: 5, cloud: 2.5, sun: 2.5, ember: 0.3 },
  { snow: 6, cloud: 3, sun: 1, ember: 0.6 },
  { ember: 6, cloud: 2.5, sun: 2, rain: 0.2 }, // かざん
  { cloud: 4, rain: 3, sun: 2.5, ember: 0.1 }, // いせき（くもり = きりが深い）
]
/** 天気ごとの「目標」（強さは World.wx が なめらかに近づく） */
export const WX: Record<Weather, { rain: number; snow: number; ember: number; wind: number; cloud: number; grey: number; mist: number }> = {
  sun: { rain: 0, snow: 0, ember: 0, wind: 0.22, cloud: 1, grey: 0, mist: 0 },
  cloud: { rain: 0, snow: 0, ember: 0, wind: 0.42, cloud: 0.5, grey: 0.55, mist: 0.2 },
  rain: { rain: 1, snow: 0, ember: 0, wind: 0.8, cloud: 0, grey: 0.85, mist: 0.35 },
  snow: { rain: 0, snow: 1, ember: 0, wind: 0.45, cloud: 0.15, grey: 0.45, mist: 0.3 },
  ember: { rain: 0, snow: 0, ember: 1, wind: 0.95, cloud: 0.2, grey: 0.1, mist: 0 },
}
/** 空気の色（くもり・あめ・ゆき・ひのこ） */
export const WX_TINT: Record<Weather, string | null> = { sun: null, cloud: '#9aa3ad', rain: '#7f8c9c', snow: '#e8eef8', ember: '#b8603a' }
export const EMBER_SUN = new THREE.Color('#ff7a3a')
export const TMP = new THREE.Color()
/** にじの長さ（秒） */
export const BOW_LEN = 30
/** なかまの上限（多すぎると眺めにくい・重い）。いっぱいの時は たまごの子は のはらで くらす */
export const MAX_FRIENDS = 10
/** こども（そだちきっていない なかま）と かえる前の たまご の合計の上限 / のはらで くらす おとなしい子の上限 */
export const MAX_KIDS = 2
export const MAX_WILD_CALM = 3
/** モンスターの大きさの倍率（建物と見くらべて ちょうど良いように。種族の height × これ） */
export const CREATURE_SCALE = 0.7
/** 敵軍のボス（たおすと実績） */
export const BOSSES = new WeakSet<object>()
/** 色ちがいの出やすさ（ふつう 3% / ふしぎなたまご 8%） */
export const RARE_RATE = 0.03
export const RARE_RATE_LUCKY = 0.08

export class World {
  // ---- 役割ごとのファイル（./parts/*.ts）に分けたメソッド。中身はそちらを見る ----
  spawn = Cr.spawn
  makeView = Cr.makeView
  variant = Cr.variant
  nm = Cr.nm
  setStyle = Cr.setStyle
  remove = Cr.remove
  alive = Cr.alive
  ally = Cr.ally
  size = Cr.size
  ground = Cr.ground
  moveTo = Cr.moveTo
  obstacles = Cr.obstacles
  collide = Cr.collide
  setState = Cr.setState
  item = Cr.item
  hasItem = Cr.hasItem
  think = Cr.think
  restAtBench = Cr.restAtBench
  nearest = Cr.nearest
  startFight = Cr.startFight
  attack = Cr.attack
  defeat = Cr.defeat
  canSkill = Cr.canSkill
  orb = Cr.orb
  useSkill = Cr.useSkill
  splash = Cr.splash
  hitWith = Cr.hitWith
  colorBurst = Cr.colorBurst
  ring = Cr.ring
  after = Cr.after
  updateSkills = Cr.updateSkills
  careOf = Cr.careOf
  addCare = Cr.addCare
  gainXp = Cr.gainXp
  evolve = Cr.evolve
  evolved = Cr.evolved
  updateEvo = Cr.updateEvo
  earn = Cr.earn
  updateDex = Cr.updateDex
  addRareDex = Cr.addRareDex
  dexList = Cr.dexList
  dexInfo = Cr.dexInfo
  assignRoles = Cr.assignRoles
  guardPost = Cr.guardPost
  ageUp = Cr.ageUp
  updateAge = Cr.updateAge
  updateTreasures = Vi.updateTreasures
  wantTreasure = Vi.wantTreasure
  updateDecor = Vi.updateDecor
  goToChest = Vi.goToChest
  sendToChest = Vi.sendToChest
  friendCount = Cr.friendCount
  kidCount = Cr.kidCount
  calmWildCount = Cr.calmWildCount
  mark = Cr.mark
  setFollow = Cr.setFollow
  setAuto = Cr.setAuto
  rotateView = Cr.rotateView
  camState = Cr.camState
  pickAutoSpot = Cr.pickAutoSpot
  retireFriend = Cr.retireFriend
  retirePet = Cr.retirePet
  rebirth = Cr.rebirth
  placeMemorial = Cr.placeMemorial
  updateVillage = Cr.updateVillage
  tryBreed = Cr.tryBreed
  stageEggKind = Cr.stageEggKind
  layEgg = Cr.layEgg
  updateWildEgg = Cr.updateWildEgg
  updateEggs = Cr.updateEggs
  makeFoodMesh = Vi.makeFoodMesh
  dropFood = Vi.dropFood
  removeFood = Vi.removeFood
  lam = Vi.lam
  mountItem = Vi.mountItem
  unmountItem = Vi.unmountItem
  setItemQuality = Vi.setItemQuality
  placeItem = Vi.placeItem
  itemLocal = Vi.itemLocal
  nearestItem = Vi.nearestItem
  playToy = Vi.playToy
  bannerBoost = Vi.bannerBoost
  buyFx = Vi.buyFx
  updateSucks = Vi.updateSucks
  dropStep = Vi.dropStep
  updateItems = Vi.updateItems
  homeOf = Vi.homeOf
  nearestHouse = Vi.nearestHouse
  claimHouse = Vi.claimHouse
  nearItem = Vi.nearItem
  addMaterial = Vi.addMaterial
  damageHouse = Vi.damageHouse
  refreshHouse = Vi.refreshHouse
  mountHouse = Vi.mountHouse
  unmountHouse = Vi.unmountHouse
  updateHouses = Vi.updateHouses
  rock = Vi.rock
  bark = Vi.bark
  structDone = Vi.structDone
  structMaxHp = Vi.structMaxHp
  openSite = Vi.openSite
  planStruct = Vi.planStruct
  mountStruct = Vi.mountStruct
  unmountStruct = Vi.unmountStruct
  refreshStruct = Vi.refreshStruct
  addStructMaterial = Vi.addStructMaterial
  onStructDone = Vi.onStructDone
  castleWalls = Vi.castleWalls
  damageStruct = Vi.damageStruct
  marchTarget = Vi.marchTarget
  updateStructs = Vi.updateStructs
  playgroundTick = Vi.playgroundTick
  spray = Vi.spray
  villageCenter = Vi.villageCenter
  doneStruct = Vi.doneStruct
  lighthouse = Vi.lighthouse
  guardRange = Vi.guardRange
  fortBoost = Vi.fortBoost
  power = Vi.power
  marketIncome = Vi.marketIncome
  popAnim = Vi.popAnim
  smoke = Vi.smoke
  towerShot = Vi.towerShot
  calcVillage = Vi.calcVillage
  villageLevel = Vi.villageLevel
  villageName = Vi.villageName
  expandLand = Vi.expandLand
  startFestival = Vi.startFestival
  recruitDancers = Vi.recruitDancers
  endFestival = Vi.endFestival
  updateFestival = Vi.updateFestival
  confetti = Vi.confetti
  updateMarket = Vi.updateMarket
  peddlerGift = Vi.peddlerGift
  makeCrab = Vi.makeCrab
  clearPeddler = Vi.clearPeddler
  playgroundFor = Vi.playgroundFor
  frolicSlot = Vi.frolicSlot
  makeAmbient = Ev.makeAmbient
  setSeason = Ev.setSeason
  buildSeasonDeco = Ev.buildSeasonDeco
  updateSeasonDeco = Ev.updateSeasonDeco
  updateAmbient = Ev.updateAmbient
  applyLight = Ev.applyLight
  spendCoins = Ev.spendCoins
  addCoins = Ev.addCoins
  eggRoom = Ev.eggRoom
  giveEgg = Ev.giveEgg
  luckySay = Ev.luckySay
  luckyHatch = Ev.luckyHatch
  sparSide = Ev.sparSide
  roadState = Ev.roadState
  updateRoad = Ev.updateRoad
  confettiBurst = Ev.confettiBurst
  roadClear = Ev.roadClear
  roadInfo = Ev.roadInfo
  bossStatus = Ev.bossStatus
  challengeBoss = Ev.challengeBoss
  stat = Ev.stat
  gauges = Ev.gauges
  notify = Ev.notify
  handleBookEvent = Ev.handleBookEvent
  updateMissions = Ev.updateMissions
  missionInfo = Ev.missionInfo
  callArmy = Ev.callArmy
  launchArmy = Ev.launchArmy
  updateArmy = Ev.updateArmy
  launchBoss = Ev.launchBoss
  updateBoss = Ev.updateBoss
  spawnResource = Ev.spawnResource
  updateResources = Ev.updateResources
  dropCarry = Ev.dropCarry
  pickWeather = Ev.pickWeather
  setWeather = Ev.setWeather
  setDayPart = Ev.setDayPart
  setQuality = Ev.setQuality
  updateWeather = Ev.updateWeather
  noteEaten = Ev.noteEaten
  bridgeSpan = Ev.bridgeSpan
  secretCtx = Ev.secretCtx
  pickSecret = Ev.pickSecret
  foundSecretForm = Ev.foundSecretForm
  glow = Ev.glow
  updateSecrets = Ev.updateSecrets
  eventsLeft = Ev.eventsLeft
  eventCtx = Ev.eventCtx
  foundEvent = Ev.foundEvent
  playEventFx = Ev.playEventFx
  rainbow = Ev.rainbow
  updateSecretFx = Ev.updateSecretFx
  drawSecretCard = Ev.drawSecretCard
  secretInfo = Ev.secretInfo
  saveSecrets = Ev.saveSecrets
  loadSecrets = Ev.loadSecrets
  pickAt = Ui.pickAt
  pickValid = Ui.pickValid
  pickPos = Ui.pickPos
  describe = Ui.describe
  structStatus = Ui.structStatus
  removePick = Ui.removePick
  drawInfo = Ui.drawInfo
  tapInfo = Ui.tapInfo
  press = Ui.press
  buy = Ui.buy
  shopCheck = Ui.shopCheck
  pay = Ui.pay
  buyItem = Ui.buyItem
  run = Ui.run
  delta = Ui.delta
  say = Ui.say
  project = Ui.project
  projectXYZ = Ui.projectXYZ
  text = Ui.text
  win = Ui.win
  drawCard = Ui.drawCard
  bar = Ui.bar
  icon = Ui.icon
  starMark = Ui.starMark
  drawBossBar = Ui.drawBossBar
  heartMark = Ui.heartMark
  drawHud = Ui.drawHud
  drawStatus = Ui.drawStatus
  drawShop = Ui.drawShop
  render = Ui.render
  dioSky = Ui.dioSky
  musicState = Ui.musicState
  widgetData = Ui.widgetData
  debug = Ui.debug
  save = Sv.save
  load = Sv.load
  journalFacts = Sv.journalFacts
  beginAway = Sv.beginAway
  compressAway = Sv.compressAway
  loadRoadState = Sv.loadRoadState
  reset = Sv.reset
  update = Up.update
  updateCreature = Up.updateCreature
  faceOf = Up.faceOf
  burst = Up.burst
  updateFx = Up.updateFx
  updateCamera = Up.updateCamera
  zoomBy = Up.zoomBy
  panBy = Up.panBy
  setView = Up.setView
  tap = Up.tap
  farPos = Up.farPos
  freePos = Up.freePos
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(42, RES.w / RES.h, 0.1, 160)
  readonly rtOut = new THREE.WebGLRenderTarget(OUT.w, OUT.h, { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter })
  readonly hud = document.createElement('canvas')
  readonly hudCtx: CanvasRenderingContext2D
  readonly hudTex: THREE.CanvasTexture
  /** 仕上げのシェーダー（diorama.ts。ワープのグリッチ・フラッシュ・ひのこの熱ゆらぎの uniform もここ） */
  get post() {
    return this.diorama.post
  }

  readonly hemi = new THREE.HemisphereLight()
  readonly sun = new THREE.DirectionalLight()
  stage!: Stage
  stageIndex = 0
  creatures: Creature[] = []
  pet!: Creature
  foods: Food[] = []
  items: Item[] = []
  /** 画質「低」：置き物の光源を作らない */
  lowQ = false
  sucks: Suck[] = []
  /** 遊んでいるおもちゃ / すべりだいを すべっている進み具合（0〜1） */
  playAt = new WeakMap<Creature, Item>()
  rideT = new WeakMap<Creature, number>()
  /** 買った直後に コインの横へ出す「-30」 */
  coinPop = { t: 0, n: 0 }
  eggs: Egg[] = []
  popups: Popup[] = []
  fx: Fx[] = []
  fxSheets = FX_SHEETS()
  eggSheets = Object.fromEntries((Object.keys(EGG_COLORS) as EggKind[]).map((k) => [k, EGG_SHEET(k)])) as Record<EggKind, ReturnType<typeof EGG_SHEET>>
  wildEggT = 45
  shadowGeo = new THREE.CircleGeometry(0.5, 10).rotateX(-Math.PI / 2)
  shadowMat = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3, depthWrite: false })

  cursor = -1
  /** 眺めるモード：文字やアイコンを全部かくす */
  cleanView = false
  messages: string[] = []
  msgT = 0
  showStatus = false
  shopOpen = false
  shopCursor = 0
  banner = 0
  night = 0
  nightTarget = 0
  /** 村の かざり（道・石段・小物。decor.ts） */
  decor: THREE.Group | null = null
  /** 空の えんしゅつ（雲・陽の光・雷・光の柱。sky.ts） */
  readonly skyfx = new SkyFx()
  boltT = 20
  decorKey = ''
  decorT = 0
  time = 0
  foodT = 0
  breedT = 0
  breedCd = 30
  incomeT = 0
  saveT = 0
  respawn: { id: SpeciesId; t: number }[] = []
  shots: Shot[] = []
  rings: Ring[] = []
  later: Later[] = []
  orbSheets = new Map<string, ReturnType<typeof iconSheet>>()
  resources: Res[] = []
  houses: House[] = []
  structs: Struct[] = []
  /** 当たった瞬間のわずかな止まり（ヒットストップ） */
  hitStop = 0
  /** 「動きをへらす」：画面ゆれ・フラッシュ・ヒットストップ・ぷにぷにを弱める（main.ts の設定から切り替える） */
  reducedMotion = false
  ambient: { s: SpriteAnim; kind: 'bf' | 'ff' | 'ice' | 'petal' | 'leaf'; cx: number; cz: number; r: number; ph: number; sp: number; y: number; bx: number; by: number }[] = []
  army: Army | null = null
  armyCd = 180
  armyWave = 0
  /** もくひょう（章立ての長い目標）*/
  road: Road = newRoad()
  cards: Card[] = []
  bossT = -1
  villageSeen = 0
  villageT = 0
  /** むらの おまつり（村レベル2〜・5〜8 分おき）と、いちばに来るやどかりの行商 */
  festival: Festival | null = null
  festivalCd = 300 + Math.random() * 180
  peddler: Peddler | null = null
  peddlerCd = 90 + Math.random() * 60
  rockTex: THREE.Texture | null = null
  barkTex: THREE.Texture | null = null
  resT = 0
  nightSpawnT = 0
  weather: Weather = 'sun'
  weatherT = 50
  weatherDim = 1
  /** 雨・雪・火の粉・しぶき・もや（fxprops.ts） */
  wfx!: WeatherFx
  /**
   * なめらかに変わる天気の強さ（0〜1）。天気が変わる時は粒・光・空・地面がこの値で ゆっくり入れかわる。
   * wet = 地面のぬれ（雨で上がり、止むとかわく）/ cover = 雪の積もり（降ると増え、止むと溶ける）/ bow = にじ
   */
  readonly wx = { rain: 0, snow: 0, ember: 0, wind: 0.22, cloud: 1, grey: 0, mist: 0, wet: 0, cover: 0, bow: 0, bowT: 0 }
  tintC = new THREE.Color('#9aa3ad')
  tintK = 0
  /** 朝（もやが出る）。main.ts の時間帯から setDayPart で入る */
  morning = false
  /** 画質（高 = 影・波紋・雲の影・もや・草のゆれ まで / 低 = 粒を減らして切る）。main.ts の applyQuality から */
  high = true
  warp = 0
  warpSwitched = true
  flash = 0
  look = new THREE.Vector3()
  coins = 50
  /** いまの季節（URL の ?season= で固定できる） */
  season: Season = seasonNow()
  /** 通算の数（日替わりミッション・実績が使う。`stat()` で足す） */
  counters: Stats = {}
  book = new MissionBook()
  coinMark = 50
  notices: { title: string; sub: string; color: string }[] = []
  noticeT = 0
  seasonDeco: THREE.Group | null = null
  decoSheets: Partial<Record<Season, ReturnType<typeof DECO_SHEET>>> = {}
  care: Record<Care, number> = { power: 0, guard: 0, spirit: 0 }
  xp = 0
  stats = { trains: 0, wins: 0, mood: 80, born: Date.now(), children: 0, gen: 1, petAge: 0, lineage: [] as string[] }
  /** かいたく（0 = 20 / 1 = 26 / 2 = 32）*/
  land = 0
  /** ずかん：1 = みつけた / 2 = なかまにした */
  dex: Record<string, 1 | 2> = {}
  /** ずかん（色ちがい）：1 = みつけた / 2 = なかまにした（dex とは別に記録する） */
  dexRare: Record<string, 1 | 2> = {}
  dexClaimed = 0
  dexNew: string[] = []
  dexMsgT = 6
  oldWarned = false
  retiring = false
  /** 敵がおそってこない のこり秒数（PEACE_TIME） */
  peaceT = 0
  /** 留守の早送り中は、なかまは としを とらない */
  noAging = false
  roleT = 0
  /** 視点：top = 見下ろし / behind = ペットの少し後ろ / eye = ペットの目線 */
  view: 'top' | 'behind' | 'eye' = 'top'
  /** 見た目：ピクセル・ジオラマ（diorama.ts）。みおろしは平行投影、うしろ・めせんは this.camera（遠近）で同じ仕上げ */
  diorama!: DioramaLook
  readonly dioLook = new THREE.Vector3()
  /**
   * 遊びかた：true = のんびり（敵軍が来ない・野生の敵は おそわない・ペットから けんかしない）/ false = にぎやか
   * main.ts のせってい（pulsar-mode）から入る
   */
  calm = true
  /** カメラ：ペットについていく / 自分で動かした場所（freeLook）を見る / おまかせ（できごとの場所へ ゆっくり移る） */
  follow = true
  auto = false
  readonly freeLook = new THREE.Vector3()
  readonly autoTo = new THREE.Vector3()
  autoT = 0
  /** 何かが起きた場所（たまご・進化・家や建物の完成・おまつり）。おまかせカメラが見に行く */
  marks: { x: number; z: number; w: number; t: number }[] = []
  readonly dioCenter = new THREE.Vector3()
  /** いま画面を描いているカメラ（タップの当たり判定・頭の上の文字の位置もこれで求める） */
  get viewCam(): THREE.Camera {
    return this.view === 'top' ? this.diorama.cam : this.camera
  }
  /** ピンチで寄る・引く（1 = ふつう） */
  camZoom = 1
  /** 2 本指ドラッグ：みおろしは前後左右のずらし、うしろ・めせんは向きと高さ */
  camPan = new THREE.Vector2()
  shake = 0
  petYaw = 0
  camYaw = 0
  petLast = new THREE.Vector2()
  onSfx: (s: Sfx) => void = () => {}
  /** にっき用：say() の文と、セーブした時を知らせる（journal.ts） */
  onNote: ((text: string) => void) | null = null
  onSave: (() => void) | null = null

  constructor(style: 'sprite' | 'model' = 'sprite') {
    this.style = style
    this.hud.width = RES.w
    this.hud.height = RES.h
    this.hudCtx = this.hud.getContext('2d')!
    this.hudTex = new THREE.CanvasTexture(this.hud)
    this.hudTex.magFilter = THREE.NearestFilter
    this.hudTex.minFilter = THREE.NearestFilter
    this.diorama = new DioramaLook(this.hudTex)
    this.scene.add(this.hemi, this.sun)
    this.wfx = new WeatherFx()
    this.scene.add(this.wfx.group)
    this.scene.add(this.skyfx.group)
    syncSeasonShop(this.season)
    if (!this.load()) {
      this.loadStage(0)
      this.pet = this.spawn('mebu', 'pet', 0, 1.5)
      this.say('メブが うまれた！')
    }
    this.coinMark = this.coins
    document.addEventListener('visibilitychange', () => document.hidden && this.save())
  }

  /** 液晶に貼る最終テクスチャ */
  get texture() {
    return this.rtOut.texture
  }

  // ================= ステージ =================
  loadStage(i: number) {
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
    for (const c of this.creatures) {
      c.site = null
      c.spot = null
    }
    for (const c of this.creatures) this.dropCarry(c, false)
    this.festival = null
    this.clearPeddler()
    this.stageIndex = i
    this.stage = STAGES[i]()
    this.nav = new NavGrid(SIZE, this.stage.heightAt)
    this.chestOpen.clear()
    this.navKey = ''
    this.decorKey = ''
    this.decorT = 0
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
    // 敵は ペットたちから はなれた所（島のはし）に置く。はじめの しばらくは おそってこない
    s.residents.forEach((id) => {
      if (id === 'noiz' && this.hasItem('charm') && Math.random() < 0.7) return
      const p = this.farPos(8)
      this.spawn(enemyFor(id, i), 'wild', p.x, p.z)
    })
    this.peaceT = PEACE_TIME
    this.makeAmbient()
    this.buildSeasonDeco()
    this.banner = 3.5
  }

  // ================= ちょうちょ・ほたる =================

  // ================= 季節 =================





  // ================= 生き物 =================

  /** キャラの見た目：'sprite' = 2.5D ドット絵 / 'model' = 3D ポリゴン */
  style: 'sprite' | 'model' = 'sprite'







  /** ステージの障害物 + 置き物。1 フレームに何十回も呼ばれるので、フレームごとに 1 回だけ組み立てて使いまわす（個数が変わったら作り直す） */
  obsCache: { x: number; z: number; r: number; water?: boolean }[] = []
  obsKey = ''
  obsTick = -1
  obsFrame = 0
  /** 歩ける所の升目（nav.ts）。物の置き方が変わったら作り直す */
  nav!: NavGrid
  navKey = ''
  /** 1 フレームで道さがしをしてよい回数（重くならないように） */
  pathBudget = 6
  /** あけた たからばこ（番号 → あけた時刻）。ステージが変わったら 空に */
  chestOpen = new Map<number, number>()










  // ================= 技 =================









  // ================= 成長・進化・お金 =================






  // ================= うんだめし（lucky.ts）とのつなぎ口 =================
  /** うんだめしの保存データ（中身は lucky.ts が検査する。セーブに一緒に入る） */
  luckySave: unknown = null
  /** きょうのおみくじの収入ボーナス（20 秒ごとのコインに足される） */
  luckIncome = 0
  sparSeq = 0
  sparBook: { id: number; a: Creature; b: Creature }[] = []
  /** じゃれあいバトルが始まった / 終わった（winner: 0 = a の勝ち、1 = b の勝ち、-1 = 引き分け・中止） */
  onSparStart: (m: SparMatch) => void = () => {}
  onSparEnd: (id: number, winner: 0 | 1 | -1) => void = () => {}








  // ================= たべもの =================



  // ================= 置き物（箱庭づくり）=================













  // ================= 資材と家づくり =================










  // ================= 建物（はたけ・いど・みはりとう・ゆりかごごや・へい・おしろ・はし）=================
























  // ================= 村 =================
  vScore = 0
  vLv = 0

  // ================= タップした物の情報・かいたい =================
  picked: Pick | null = null
  infoBox: { x: number; y: number; w: number; h: number; del: { x: number; y: number; w: number; h: number } | null; close: { x: number; y: number; w: number; h: number } } | null = null
  armUntil = 0










  // ================= かいたく =================

  // ================= ずかん =================



  // ================= 役割分担 =================


  // ================= 世代交代 =================


  ageT = 0









  autoPlanT = 0

  // ================= もくひょう（ロードマップ）=================








  // ================= 日替わりミッション・実績 =================




  missionT = 0


  // ================= むらの おまつり =================





  // ================= いちば：やどかりの行商 =================




  // ================= あそびば =================


  // ================= 敵軍 =================








  // ================= 天気 =================





  // ================= たまご =================





  // ================= ボタン =================








  // ================= 更新 =================
  hudT = 1
  hudNow = true



  // ================= エフェクト =================









  // ================= ひみつ（隠し進化・できごと） =================
  /** 食べた物の履歴（1 匹ずつ。stage / meat / sweet / nut の回数）。セーブは secrets.eaten */
  eatenOf = new WeakMap<Creature, Record<string, number>>()
  /** 見つけた隠しの姿・できごと / ヒントの進み / 雨がやんだ時刻 / できごとの待ち秒 / 見つけた時の札 */
  secret = {
    forms: new Set<string>(),
    events: new Set<string>(),
    hints: {} as Record<string, number>,
    rainEnd: -9999,
    evT: {} as Record<string, number>,
    card: null as { title: string; sub: string; t: number } | null,
  }
  secretMeshes: { obj: THREE.Mesh; t: number; dur: number; hold: number }[] = []

















  // ================= セーブ / ロード =================
  /** 読み込み・やり直しの直前は自動セーブを止める（上書きしないように） */
  saveLocked = false


  // ================= るすばん（にっき・おかえりレポート）=================





  // ================= HUD =================
  pv = new THREE.Vector3()













  // ================= 描画 =================




}
