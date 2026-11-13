/**
 * 系統（きかい・りゅう・ねこ・いぬ・とり・みず・モンスター）の仲間 39 種のデータ。
 * 見た目は monsters.ts の `critter()` が Look（パーツの指定）から描く。
 * 各系統は「赤ちゃん(1) → 成長期(2)×2 → 成熟期(3)×2 → 完成期(4)」の枝分かれで、育て方（ちから / まもり / こころ）で行き先が変わる。
 * みず系の成熟期・完成期は、はじめからいる ヒレル / フワリ / シオリュウ / ホシクジラ。
 */
export type Family = 'plain' | 'machine' | 'dragon' | 'cat' | 'dog' | 'bird' | 'water' | 'monster'
export type EggKind = 'inherit' | Exclude<Family, 'plain'>
type Care3 = 'power' | 'guard' | 'spirit'
type SkillKind = 'shot' | 'burst' | 'dash' | 'rain' | 'heal' | 'wave'

export const FAMILY_NAME: Record<Family | EggKind, string> = {
  inherit: 'ふつう', plain: 'めばえ', machine: 'きかい', dragon: 'りゅう', cat: 'ねこ', dog: 'いぬ', bird: 'とり', water: 'みず', monster: 'モンスター',
}
/** たまごのから：[から, かげ, ハイライト, もよう] */
export const EGG_COLORS: Record<EggKind, [string, string, string, string]> = {
  inherit: ['#fff6e8', '#e8d8c0', '#ffffff', '#7fd1ff'],
  machine: ['#c9ced6', '#7a8494', '#ffffff', '#ffd23f'],
  dragon: ['#ff8a5a', '#b8421e', '#ffd0b0', '#fff0c2'],
  cat: ['#d8c8ff', '#8a78c8', '#ffffff', '#ff9ecb'],
  dog: ['#e8c898', '#a07a48', '#fff0d8', '#7a4a22'],
  bird: ['#aee4ff', '#5aa8d8', '#ffffff', '#fff27a'],
  water: ['#6ad8ff', '#2a8fc8', '#d8f6ff', '#ffffff'],
  monster: ['#7a4aa8', '#43246a', '#c8a0f0', '#7cff7a'],
}

/** パーツの指定（描き方は monsters.ts の critter） */
export interface Look {
  /** quad = 四つあし / biped = 二足 / bird = 丸い鳥 / blob = ひとかたまり */
  f: 'quad' | 'biped' | 'bird' | 'blob'
  s: number
  c: [string, string, string]
  b?: string
  ear?: 'cat' | 'dog' | 'bunny' | 'horn' | 'ant' | 'fin' | 'tuft'
  tail?: 'cat' | 'dog' | 'dragon' | 'bird' | 'plug' | 'fish' | 'flame'
  tails?: number
  wing?: 'bird' | 'dragon' | 'mech' | 'bat'
  beak?: boolean
  fang?: boolean
  stripe?: string
  spot?: string
  mane?: string
  spike?: string
  armor?: string
  visor?: string
  gear?: string
  horn?: string
  crest?: string
  gem?: string
  collar?: string
  cannon?: boolean
  club?: boolean
  cyclops?: boolean
  heads?: boolean
  shell?: string
  eye?: string
  /** 進化の ちがいを 出す かざり（ねこ・いぬの描き方で使う）：ひたいの三日月 / しっぽの先の ひとだま / なびく スカーフ / かぶと / 頭の けっしょう */
  moon?: string
  wisp?: string
  scarf?: string
  helm?: boolean
  tiara?: string
  /** 完成期・成熟期の かざり：光る もよう / うかぶ たま / せなかの けっしょうの はね / かたと足の よろい / しっぽの先の ほし */
  /** とりの描き方で使う：はやぶさ（するどい顔・長い はね）/ ふくろう（まるい顔の円ばん）/ 長い おばね / 頭の上の 光の輪 / ひろげた つばさ */
  raptor?: boolean
  owl?: boolean
  plume?: string
  halo?: string
  spread?: boolean
  rune?: string
  orbs?: string
  blade?: string
  plate?: string
  star?: string
}

export interface FamilySpec {
  id: string
  name: string
  kind: string
  look: Look
  skill: [string, SkillKind, string, number]
  float?: boolean
}

const m = (c: string, s: string, h: string): [string, string, string] => [c, s, h]

/** [赤ちゃん, 成長期(ちから), 成長期(まもり/こころ), 成熟期(ちから), 成熟期(まもり/こころ), 完成期] */
export const FAMILIES: Record<Exclude<Family, 'plain' | 'water'>, FamilySpec[]> = {
  machine: [
    { id: 'nejiru', name: 'ネジル', kind: 'ねじ型', look: { f: 'blob', s: 0.85, c: m('#aab4c4', '#6d7888', '#e4ecf5'), tail: 'plug', ear: 'ant', gem: '#ffd23f' }, skill: ['ネジとばし', 'shot', '#c9ced6', 1.5] },
    { id: 'boruta', name: 'ボルタ', kind: 'でんちロボ型', look: { f: 'biped', s: 0.95, c: m('#ffcf3f', '#c79a00', '#fff0a8'), ear: 'ant', tail: 'plug', armor: '#3d4660', visor: '#5ef2ff' }, skill: ['ビリビリショック', 'burst', '#fff27a', 1.8] },
    { id: 'kacha', name: 'カチャ', kind: 'ぜんまいロボ型', look: { f: 'biped', s: 0.95, c: m('#ff8a5a', '#c9532b', '#ffd0b8'), gear: '#e8e2d0', visor: '#fff27a' }, skill: ['ぜんまいタックル', 'dash', '#ffb08a', 1.8] },
    { id: 'tankuru', name: 'タンクル', kind: 'せんしゃロボ型', look: { f: 'quad', s: 1.15, c: m('#7a8f5a', '#4d5e36', '#b4c88f'), cannon: true, armor: '#3d4a2a', visor: '#ffdf5a', tail: 'plug' }, skill: ['ほうだんいちげき', 'shot', '#ffdf5a', 2.2] },
    { id: 'kurokko', name: 'クロッコ', kind: 'とけいロボ型', look: { f: 'biped', s: 1.15, c: m('#3d4a8a', '#262e5c', '#7a8ad6'), gear: '#ffd23f', visor: '#ff7ad9', wing: 'mech', ear: 'ant' }, skill: ['ときのうず', 'wave', '#b48cff', 2.2] },
    { id: 'metarion', name: 'メタリオン', kind: 'はがねのまもり型', look: { f: 'biped', s: 1.35, c: m('#c9ced6', '#7a8494', '#ffffff'), armor: '#3d52c8', visor: '#5ef2ff', wing: 'mech', horn: '#ffd23f', cannon: true }, skill: ['はがねのかがやき', 'burst', '#5ef2ff', 2.6] },
  ],
  dragon: [
    { id: 'ryuuko', name: 'リュウコ', kind: 'ちびりゅう型', look: { f: 'blob', s: 0.85, c: m('#ff9a6a', '#c25a3a', '#ffd9c0'), horn: '#fff0c2', tail: 'dragon', wing: 'bat', b: '#fff0c2' }, skill: ['ちびブレス', 'shot', '#ffb08a', 1.5] },
    { id: 'honora', name: 'ホノラ', kind: 'ひのこりゅう型', look: { f: 'quad', s: 0.95, c: m('#ff5e4a', '#b02a22', '#ffb09a'), tail: 'flame', horn: '#ffe9a8', wing: 'bat', b: '#ffd27a', fang: true }, skill: ['ひのこブレス', 'shot', '#ff7a2a', 1.9] },
    { id: 'kazeru', name: 'カゼル', kind: 'かぜりゅう型', look: { f: 'quad', s: 0.95, c: m('#5ed8c0', '#22907f', '#c0fff0'), tail: 'dragon', horn: '#ffffff', wing: 'dragon', b: '#e8fff8' }, skill: ['つむじかぜ', 'wave', '#c0fff0', 1.9] },
    { id: 'bakuryu', name: 'バクリュウ', kind: 'ばくえんりゅう型', look: { f: 'quad', s: 1.2, c: m('#d63a2a', '#7a1810', '#ff9a7a'), spike: '#3d1a14', horn: '#ffd23f', tail: 'flame', wing: 'dragon', fang: true, b: '#ffb86b' }, skill: ['ばくえんブレス', 'burst', '#ff5e4a', 2.4] },
    { id: 'raigaru', name: 'ライガル', kind: 'かみなりりゅう型', look: { f: 'quad', s: 1.2, c: m('#4a7ae8', '#243f9a', '#a8c0ff'), spike: '#ffd23f', horn: '#fff27a', tail: 'dragon', wing: 'dragon', b: '#dfe8ff' }, skill: ['いかづちのつめ', 'dash', '#fff27a', 2.3] },
    { id: 'tenryuu', name: 'テンリュウ', kind: 'てんりゅう型', look: { f: 'quad', s: 1.4, c: m('#ffd23f', '#c79a00', '#fff3b0'), spike: '#7a3ad6', horn: '#ffffff', tail: 'dragon', wing: 'dragon', mane: '#7a3ad6', gem: '#5ef2ff', fang: true, b: '#fff3b0' }, skill: ['てんのいかり', 'rain', '#ffd23f', 2.8] },
  ],
  cat: [
    { id: 'mimiko', name: 'ミミコ', kind: 'ちびねこ型', look: { f: 'blob', s: 0.85, c: m('#ffd9a8', '#c99a60', '#fff3dc'), ear: 'cat', tail: 'cat', b: '#ffffff' }, skill: ['ねこパンチ', 'dash', '#fff3dc', 1.5] },
    { id: 'tsumeru', name: 'ツメル', kind: 'つめねこ型', look: { f: 'quad', s: 0.82, c: m('#ff9a4a', '#b8561a', '#ffd0a0'), ear: 'cat', tail: 'cat', stripe: '#6a2a10', fang: true }, skill: ['ひっかきラッシュ', 'dash', '#ffb08a', 1.9] },
    { id: 'yoruna', name: 'ヨルナ', kind: 'よるねこ型', look: { f: 'quad', s: 0.82, c: m('#6a5aa8', '#3d3270', '#b8a8f0'), ear: 'cat', tail: 'cat', gem: '#ffe27a', b: '#d8cfff' }, skill: ['つきあかり', 'heal', '#d8cfff', 0] },
    { id: 'torahime', name: 'トラヒメ', kind: 'とらねこ型', look: { f: 'quad', s: 1.2, c: m('#ffb02e', '#b8700a', '#ffe09a'), ear: 'cat', tail: 'cat', stripe: '#3d2210', fang: true, b: '#fff0c8' }, skill: ['とらのほうこう', 'burst', '#ffd23f', 2.3] },
    { id: 'tsukineko', name: 'ツキネコ', kind: 'つきねこ型', look: { f: 'quad', s: 1.2, c: m('#e8eaff', '#9aa0d8', '#ffffff'), ear: 'cat', tail: 'cat', moon: '#ffd23f', spot: '#b8c0ff', tiara: '#ffd23f', star: '#ffd23f' }, skill: ['ほしのしずく', 'rain', '#e8eaff', 2.2] },
    { id: 'nekomata', name: 'ネコマタ', kind: 'ふたおねこ型', look: { f: 'quad', s: 1.45, c: m('#5a3aa0', '#33206a', '#a88be8'), ear: 'cat', tail: 'cat', tails: 2, gem: '#ff7ad9', mane: '#ff9ecb', fang: true, wisp: '#ff7ad9', rune: '#ff9ecb', orbs: '#ff7ad9' }, skill: ['おにびのまい', 'wave', '#ff7ad9', 2.7] },
  ],
  dog: [
    { id: 'wanko', name: 'ワンコ', kind: 'ちびいぬ型', look: { f: 'blob', s: 0.85, c: m('#d9a46a', '#9a6a3a', '#f6dcb8'), ear: 'dog', tail: 'dog', b: '#fff0d8', spot: '#7a4a22' }, skill: ['じゃれつき', 'dash', '#f6dcb8', 1.5] },
    { id: 'kibaru', name: 'キバル', kind: 'きばいぬ型', look: { f: 'quad', s: 0.82, c: m('#8a6a4a', '#523a24', '#c8a888'), ear: 'dog', tail: 'dog', fang: true, collar: '#ff5e4a' }, skill: ['かみつきラッシュ', 'dash', '#ffd0b0', 1.9] },
    { id: 'fuwan', name: 'フワン', kind: 'もふいぬ型', look: { f: 'quad', s: 0.86, c: m('#fff0dc', '#c8b090', '#ffffff'), ear: 'dog', tail: 'dog', mane: '#fffaf0', collar: '#7fd1ff' }, skill: ['もふもふはどう', 'heal', '#ffffff', 0] },
    { id: 'garufu', name: 'ガルフ', kind: 'おおかみ型', look: { f: 'quad', s: 1.2, c: m('#7a8aa8', '#4a566e', '#c0cce0'), ear: 'cat', tail: 'dog', fang: true, mane: '#e8f0ff', b: '#e8f0ff', scarf: '#d8483a' }, skill: ['とおぼえ', 'burst', '#c0cce0', 2.3] },
    { id: 'mamoru', name: 'マモール', kind: 'ばんけん型', look: { f: 'quad', s: 1.2, c: m('#c9a06a', '#8a6a3a', '#f0dcb0'), ear: 'dog', tail: 'dog', armor: '#7a8aa8', collar: '#ffd23f', helm: true, plate: '#7a8aa8' }, skill: ['まもりのさけび', 'wave', '#ffd23f', 2.1] },
    { id: 'rouga', name: 'ロウガ', kind: 'ぎんろう型', look: { f: 'quad', s: 1.45, c: m('#e8f0ff', '#8a9ac0', '#ffffff'), ear: 'cat', tail: 'dog', mane: '#7fd1ff', gem: '#5ef2ff', fang: true, spike: '#7fd1ff', tiara: '#7fd1ff', blade: '#9fe4ff', plate: '#7fd1ff' }, skill: ['ぎんいろのかぜ', 'wave', '#7fd1ff', 2.7] },
  ],
  bird: [
    { id: 'piyo', name: 'ピヨ', kind: 'ひよこ型', look: { f: 'bird', s: 0.7, c: m('#fff27a', '#d9b800', '#fffbd0'), beak: true, tail: 'bird', wing: 'bird', ear: 'tuft' }, skill: ['ひよこつつき', 'shot', '#fff27a', 1.5] },
    { id: 'habataki', name: 'ハバタキ', kind: 'はばたき鳥型', look: { f: 'bird', s: 0.82, c: m('#5ec8ff', '#2a7fb8', '#c8eeff'), beak: true, tail: 'bird', wing: 'bird', ear: 'tuft', crest: '#ffd23f' }, skill: ['かぜきりのはね', 'shot', '#c8eeff', 1.9] },
    { id: 'utaru', name: 'ウタル', kind: 'うたどり型', look: { f: 'bird', s: 0.82, c: m('#ff9ecb', '#c25a8e', '#ffd8ea'), beak: true, tail: 'bird', wing: 'bird', crest: '#ffffff' }, skill: ['いやしのうた', 'heal', '#ffd8ea', 0] },
    { id: 'hayate', name: 'ハヤテ', kind: 'はやぶさ型', look: { f: 'bird', s: 1.2, c: m('#4a5a8a', '#2a3558', '#8a9ac8'), beak: true, tail: 'bird', wing: 'bird', crest: '#ff5e4a', raptor: true, b: '#d8dcf0' }, skill: ['きゅうこうか', 'dash', '#8a9ac8', 2.4] },
    { id: 'hoshiro', name: 'ホシロー', kind: 'ほしふくろう型', look: { f: 'bird', s: 1.2, c: m('#a88b5a', '#6a5230', '#e8d4a8'), beak: true, tail: 'bird', wing: 'bird', ear: 'tuft', gem: '#ffe27a', spot: '#ffe27a', owl: true, b: '#e8d4a8' }, skill: ['ほしのまなざし', 'rain', '#ffe27a', 2.2] },
    { id: 'hikaritori', name: 'ヒカリドリ', kind: 'ひかりのとり型', look: { f: 'bird', s: 1.45, c: m('#fff3b0', '#e8a82a', '#ffffff'), beak: true, tail: 'bird', wing: 'bird', crest: '#ff9a3d', gem: '#ff5e4a', plume: '#ff9a3d', halo: '#fff3b0', spread: true }, skill: ['ひかりのはばたき', 'burst', '#fff3b0', 2.7] },
  ],
  monster: [
    { id: 'gabuko', name: 'ガブコ', kind: 'ちびおばけ型', look: { f: 'blob', s: 0.85, c: m('#a86bd8', '#6a3a9a', '#dcb8ff'), fang: true, ear: 'horn' }, skill: ['ガブッ', 'dash', '#dcb8ff', 1.5] },
    { id: 'oniko', name: 'オニコ', kind: 'こおに型', look: { f: 'biped', s: 0.95, c: m('#ff6a7a', '#b02a40', '#ffb0b8'), horn: '#fff0c2', fang: true }, skill: ['こおにパンチ', 'dash', '#ffb0b8', 1.9] },
    { id: 'nurari', name: 'ヌラリ', kind: 'ぬめりお化け型', look: { f: 'blob', s: 1.0, c: m('#6adc9a', '#2a9a5a', '#c0ffd8'), gem: '#ffffff', ear: 'ant' }, skill: ['ぬるぬるうず', 'wave', '#c0ffd8', 1.8] },
    { id: 'ogaran', name: 'オガラン', kind: 'おにだいしょう型', look: { f: 'biped', s: 1.25, c: m('#d63a4a', '#7a1a28', '#ff8a96'), horn: '#ffe9a8', fang: true, armor: '#3d2a2a', club: true }, skill: ['だいちのこんぼう', 'wave', '#ff8a96', 2.5] },
    { id: 'bakeran', name: 'バケラン', kind: 'ひとつめお化け型', look: { f: 'blob', s: 1.25, c: m('#3aa0a8', '#1a606a', '#9ae8ee'), cyclops: true, wing: 'bat', fang: true }, skill: ['ひとつめビーム', 'shot', '#9ae8ee', 2.3] },
    { id: 'yamatan', name: 'ヤマタン', kind: 'やまたお化け型', look: { f: 'blob', s: 1.4, c: m('#5a3a8a', '#33205a', '#a88be8'), horn: '#ffd23f', fang: true, spike: '#ff5ed9', gem: '#ff5ed9', ear: 'horn', wing: 'bat', heads: true }, skill: ['やまたのいかり', 'rain', '#ff5ed9', 2.8] },
  ],
}

/** みず系：赤ちゃんと成長期だけ新しい（成熟期以降は ヒレル / フワリ / シオリュウ / ホシクジラ） */
export const WATER_NEW: FamilySpec[] = [
  { id: 'shizuku', name: 'シズク', kind: 'しずく型', float: true, look: { f: 'blob', s: 0.85, c: m('#6ad8ff', '#2a8fc8', '#d8f6ff'), gem: '#ffffff', tail: 'fish', ear: 'fin' }, skill: ['みずでっぽう', 'shot', '#6fd6ff', 1.5] },
  { id: 'awako', name: 'アワコ', kind: 'あわのこ型', float: true, look: { f: 'blob', s: 1.0, c: m('#b8f0ff', '#6ab8d8', '#ffffff'), spot: '#ffffff', ear: 'fin', tail: 'fish' }, skill: ['あわのはじけ', 'burst', '#d8f6ff', 1.8] },
  { id: 'kaimaru', name: 'カイマル', kind: 'かいがら型', look: { f: 'quad', s: 0.95, c: m('#ff9ecb', '#c25a8e', '#ffd8ea'), shell: '#ffe9a8' }, skill: ['からにこもる', 'heal', '#ffd8ea', 0] },
]

export type FamilyChain = { family: Family; ids: [string, string, string, string, string, string] }
export const CHAINS: FamilyChain[] = [
  ...(Object.keys(FAMILIES) as (keyof typeof FAMILIES)[]).map((family) => ({ family, ids: FAMILIES[family].map((s) => s.id) as FamilyChain['ids'] })),
  { family: 'water', ids: ['shizuku', 'awako', 'kaimaru', 'hireru', 'fuwari', 'shioryu'] },
]

/** 赤ちゃんの種族 */
export const BABY: Record<EggKind, string> = {
  inherit: 'mebu', machine: 'nejiru', dragon: 'ryuuko', cat: 'mimiko', dog: 'wanko', bird: 'piyo', water: 'shizuku', monster: 'gabuko',
}

/** 種族 → 系統（はじめからいる子も入れる） */
export const FAMILY_OF: Record<string, Family> = {
  mebu: 'plain', pikori: 'bird', gorota: 'monster', mofuru: 'dog', giaru: 'machine', fuwari: 'water', hireru: 'water', garudora: 'dragon', shioryu: 'water', hoshikujira: 'water',
}
for (const ch of CHAINS) for (const id of ch.ids) FAMILY_OF[id] = ch.family

/** 枝分かれ：[ちから, まもり, こころ] で行き先が決まる */
export const EVOLVE: Record<string, Record<Care3, string>> = {}
for (const { ids } of CHAINS) {
  const [baby, a2, b2, a3, b3, t4] = ids
  EVOLVE[baby] = { power: a2, guard: b2, spirit: b2 }
  EVOLVE[a2] = { power: a3, guard: b3, spirit: b3 }
  EVOLVE[b2] = { power: a3, guard: a3, spirit: b3 }
  if (t4 !== 'shioryu') {
    EVOLVE[a3] = { power: t4, guard: t4, spirit: t4 }
    EVOLVE[b3] = { power: t4, guard: t4, spirit: t4 }
  }
}
// みず系のおわり：ヒレル / フワリ → シオリュウ か ホシクジラ
EVOLVE.hireru = { power: 'shioryu', guard: 'shioryu', spirit: 'hoshikujira' }
EVOLVE.fuwari = { power: 'hoshikujira', guard: 'shioryu', spirit: 'hoshikujira' }

/** ステージごとに よく見つかる たまごの系統 */
export const STAGE_EGGS: EggKind[][] = [
  ['bird', 'dog', 'cat', 'monster'], // はじまりの森
  ['machine', 'dragon', 'monster', 'cat'], // ガラスの砂丘
  ['water', 'bird', 'dragon', 'dog'], // さんごの入り江
  ['cat', 'dog', 'bird', 'water'], // わたゆきの原
  ['machine', 'water', 'dragon', 'monster'], // こおりの回路峰
  ['dragon', 'machine', 'monster', 'dog'], // ほむらのかざん
  ['monster', 'machine', 'bird', 'cat'], // こだいのいせき
]

/** 段階ごとの基本ステータス（ちから型は攻撃が高く、まもり型は体力が高い） */
export const TIER_BASE: Record<1 | 2 | 3 | 4, { h: number; hp: number; atk: number }> = {
  // 高さ：赤ちゃんは とても小さく、完成期は 大きく（進化の ちがいを はっきり）
  1: { h: 0.72, hp: 28, atk: 5 },
  2: { h: 1.15, hp: 52, atk: 8 },
  3: { h: 1.7, hp: 88, atk: 13 },
  4: { h: 2.3, hp: 140, atk: 20 },
}
export const FAMILY_SPEED: Record<Exclude<Family, 'plain'>, number> = { machine: 1.3, dragon: 1.5, cat: 2.0, dog: 1.8, bird: 1.9, water: 1.5, monster: 1.2 }
