import { FAMILY_NAME, FAMILY_OF, FAMILY_SPEED, TIER_BASE, type Family, type Look } from './families'
import type { Species } from './monsters'

/**
 * 隠し進化とひみつ。
 * - 隠しの姿 12 種：成熟期(3) の子が、条件（時間帯 × 場所 × 育ち など 3 つ）をそろえて進化すると、ふつうの完成期のかわりに なる特別な完成期。
 *   見た目と技はこのファイルだけに置き、monsters.ts は `secretSpecies()` / `SECRET_FORMS` を足すだけ。
 * - ひみつの できごと 11 個：条件を満たし続けると 1 度だけ起きる小さなサプライズ（`SECRET_EVENTS`）。
 * 判定は純粋な関数（ctx を受けとるだけ）。ctx は World が作る。
 */
export type SecretCare = 'power' | 'guard' | 'spirit'
export type SecretWeather = 'sun' | 'cloud' | 'rain' | 'snow' | 'ember'
export type SecretId =
  | 'yozoragia' | 'tontenou' | 'fubukiryu' | 'garasuryu' | 'nijineko' | 'kobanneko' | 'minorufu' | 'nikobau'
  | 'yumemidori' | 'amayadori' | 'hyakki' | 'umibotaru'

/** 食べ物の履歴のキー（stage = そのステージの たべもの） */
export const EAT_KEYS = ['stage', 'meat', 'sweet', 'nut'] as const

/** 進化の瞬間の まわりの ようす（World.secretCtx が作る） */
export interface SecretCtx {
  isPet: boolean
  night: boolean
  weather: SecretWeather
  /** 雨がやんで 2 分いない */
  rainedLately: boolean
  stage: number
  gen: number
  coins: number
  mood: number
  role: 'free' | 'builder' | 'farmer' | 'guard' | 'carer' | 'seller'
  top: SecretCare
  eaten: Record<string, number>
  /** 自分の家の段階（なければ 0） */
  homeLv: number
  /** ちかくにいる 同じ系統の仲間の数（自分はのぞく） */
  kin: number
  /** むらの段階（0〜3） */
  village: number
  near: { tower: boolean; castle: boolean; bridge: boolean; farm: boolean; fire: boolean; memorial: boolean; tools: boolean; water: boolean }
}

export interface SecretCond {
  /** ヒント（見つけるまで、この条件に近づいた時に 1 行ずつ出る） */
  hint: string
  test: (c: SecretCtx) => boolean
}

export interface SecretForm {
  id: SecretId
  name: string
  kind: string
  family: Exclude<Family, 'plain'>
  look: Look
  skill: [string, 'shot' | 'burst' | 'dash' | 'rain' | 'heal' | 'wave', string, number]
  float?: boolean
  /** 見つけた時の ひとこと */
  story: string
  conds: [SecretCond, SecretCond, SecretCond]
}

const m = (c: string, s: string, h: string): [string, string, string] => [c, s, h]

export const SECRET_FORMS: SecretForm[] = [
  {
    id: 'yozoragia', name: 'ヨゾラギア', kind: 'よぞらロボ型', family: 'machine',
    look: { f: 'biped', s: 1.4, c: m('#2a3070', '#141a3e', '#7a88e0'), armor: '#0c1030', visor: '#ffe27a', wing: 'mech', gem: '#ffe27a', ear: 'ant', spot: '#ffe27a' },
    skill: ['ほしぞらスキャン', 'rain', '#ffe27a', 2.8],
    story: 'みはりの めで よぞらを みつづけた ロボ。ほしの ひかりを あびて うまれかわった',
    conds: [
      { hint: 'くらい よるに…', test: (c) => c.night },
      { hint: 'みはりの とうか おしろの そばで…', test: (c) => c.near.tower || c.near.castle },
      { hint: 'まもりの こころを そだてて…', test: (c) => c.top === 'guard' },
    ],
  },
  {
    id: 'tontenou', name: 'トンテンオー', kind: 'だいくロボ型', family: 'machine',
    look: { f: 'biped', s: 1.4, c: m('#ff9a3a', '#b8561a', '#ffd09a'), gear: '#e8e2d0', armor: '#5a3a20', visor: '#fff27a', club: true, ear: 'ant', cannon: true },
    skill: ['トンテンカンカン', 'wave', '#ffd09a', 2.7],
    story: 'まいにち かなづちを ふるった だいくの ロボ。まちの ほこりを せおって かがやく',
    conds: [
      { hint: 'だいくとして はたらいて…', test: (c) => c.role === 'builder' },
      { hint: 'だいくどうぐの そばで…', test: (c) => c.near.tools },
      { hint: 'まちが にぎわう ころに…', test: (c) => c.village >= 2 },
    ],
  },
  {
    id: 'fubukiryu', name: 'フブキリュウ', kind: 'ふぶきりゅう型', family: 'dragon',
    look: { f: 'quad', s: 1.4, c: m('#f0f6ff', '#8fa4d8', '#ffffff'), spike: '#9a8cff', horn: '#ffffff', tail: 'dragon', wing: 'dragon', mane: '#bfd0ff', gem: '#7fe8ff', fang: true, b: '#ffffff' },
    skill: ['ふぶきのいき', 'wave', '#bfe9ff', 2.8],
    story: 'ふぶきの なかで たき火に あたり、こおりと ほのおの あいだで めざめた りゅう',
    conds: [
      { hint: 'ゆきが ふる ひに…', test: (c) => c.weather === 'snow' },
      { hint: 'たき火の ぬくもりの そばで…', test: (c) => c.near.fire },
      { hint: 'ゆきぐにの ばしょで…', test: (c) => c.stage === 3 || c.stage === 4 },
    ],
  },
  {
    id: 'garasuryu', name: 'ガラスリュウ', kind: 'ガラスりゅう型', family: 'dragon',
    look: { f: 'quad', s: 1.4, c: m('#7af0e0', '#2a9a9a', '#e0fffb'), spike: '#ff9a5a', horn: '#ffb86b', tail: 'dragon', wing: 'dragon', gem: '#ff7a3a', b: '#e0fffb', fang: true },
    skill: ['ガラスのブレス', 'burst', '#8ae8ff', 2.8],
    story: 'ひのこで あぶられた すなが ガラスに かわる ように、からだが すきとおった りゅう',
    conds: [
      { hint: 'ガラスの すなはまで…', test: (c) => c.stage === 1 },
      { hint: 'ひのこが まう ひに…', test: (c) => c.weather === 'ember' },
      { hint: 'ちからの こころを そだてて…', test: (c) => c.top === 'power' },
    ],
  },
  {
    id: 'nijineko', name: 'ニジネコ', kind: 'にじねこ型', family: 'cat',
    look: { f: 'quad', s: 1.4, c: m('#fff0f8', '#c8a8d8', '#ffffff'), ear: 'cat', tail: 'cat', tails: 3, gem: '#ff7ad9', mane: '#9ae8ff', spot: '#ffe27a', b: '#ffffff' },
    skill: ['にじのしずく', 'rain', '#ffd8ea', 2.6],
    story: 'あめあがりの そらに かかった にじを みあげて、しっぽが 3 ほんに わかれた',
    conds: [
      { hint: 'あめが あがった あとの はれまに…', test: (c) => c.weather === 'sun' && c.rainedLately },
      { hint: 'はしの そばで…', test: (c) => c.near.bridge },
      { hint: 'こころを そだてて…', test: (c) => c.top === 'spirit' },
    ],
  },
  {
    id: 'kobanneko', name: 'コバンネコ', kind: 'こばんねこ型', family: 'cat',
    look: { f: 'quad', s: 1.3, c: m('#ffe27a', '#c89a1a', '#fff6c0'), ear: 'cat', tail: 'cat', gem: '#ffd23f', collar: '#ff5e4a', b: '#ffffff', spot: '#ff9a3a' },
    skill: ['こばんのあめ', 'rain', '#ffd23f', 2.4],
    story: 'じぶんの いえで ゆうゆうと くらし、こばんを まねく ふくの ねこに なった',
    conds: [
      { hint: 'コインが たっぷり たまった ころ…', test: (c) => c.coins >= 300 },
      { hint: 'じぶんの いえを ひろく そだてて…', test: (c) => c.homeLv >= 2 },
      { hint: 'ひの あたる ひるまに…', test: (c) => !c.night },
    ],
  },
  {
    id: 'minorufu', name: 'ミノルフ', kind: 'みのりいぬ型', family: 'dog',
    look: { f: 'quad', s: 1.4, c: m('#f0c060', '#a8742a', '#ffe8a0'), ear: 'dog', tail: 'dog', mane: '#9adf5a', collar: '#7cf29b', spike: '#7cf29b', spot: '#7a4a22', fang: true },
    skill: ['みのりのかぜ', 'heal', '#cfffa0', 0],
    story: 'はたけの ごちそうを たべつづけて、せなかに わかばが めばえた いぬ',
    conds: [
      { hint: 'ステージの たべものを たくさん たべて…', test: (c) => (c.eaten.stage ?? 0) >= 10 },
      { hint: 'はたけの そばで…', test: (c) => c.near.farm },
      { hint: 'おひさまが でている ひるまに…', test: (c) => !c.night },
    ],
  },
  {
    id: 'nikobau', name: 'ニコバウ', kind: 'にこにこいぬ型', family: 'dog',
    look: { f: 'quad', s: 1.4, c: m('#ffd0e0', '#c8809a', '#fff0f6'), ear: 'dog', tail: 'dog', mane: '#ffffff', collar: '#ff7ad9', gem: '#ffe27a', spot: '#ff9ecb' },
    skill: ['にこにこはどう', 'heal', '#ffd0e0', 0],
    story: 'なかまに かこまれて ごきげんな まま、ほっぺが ピンクに そまった いぬ',
    conds: [
      { hint: 'とても ごきげんな ときに…', test: (c) => c.mood >= 85 },
      { hint: 'おなじ けいとうの なかまが 2ひき いじょう ちかくに いて…', test: (c) => c.kin >= 2 },
      { hint: 'はれた ひに…', test: (c) => c.weather === 'sun' },
    ],
  },
  {
    id: 'yumemidori', name: 'ユメミドリ', kind: 'ゆめみどり型', family: 'bird',
    look: { f: 'bird', s: 1.4, c: m('#c8b0ff', '#7a5ac8', '#f0e8ff'), beak: true, tail: 'bird', wing: 'bird', crest: '#ff9ecb', gem: '#ffe27a', ear: 'tuft', spot: '#ffffff' },
    skill: ['ゆめのはね', 'rain', '#e0d0ff', 2.6],
    story: 'おはかの まえで まえの だいを おもいだし、ゆめの なかで はねが のびた とり',
    conds: [
      { hint: 'だいを かさねた ペットが…（だい3せだい いじょう）', test: (c) => c.isPet && c.gen >= 3 },
      { hint: 'おはかの そばで…', test: (c) => c.near.memorial },
      { hint: 'しずかな よるに…', test: (c) => c.night },
    ],
  },
  {
    id: 'amayadori', name: 'アマヤドリ', kind: 'あまやどり鳥型', family: 'bird',
    look: { f: 'bird', s: 1.4, c: m('#4a78a8', '#274560', '#a8d0f0'), beak: true, tail: 'bird', wing: 'bird', crest: '#fff27a', ear: 'tuft', spot: '#d8f0ff' },
    skill: ['あまおとのうた', 'heal', '#a8d0f0', 0],
    story: 'はしの したで あまやどりをしながら、あめの おとに あわせて うたう とり',
    conds: [
      { hint: 'あめの ひに…', test: (c) => c.weather === 'rain' },
      { hint: 'はしの そばで…', test: (c) => c.near.bridge },
      { hint: 'こころを そだてて…', test: (c) => c.top === 'spirit' },
    ],
  },
  {
    id: 'hyakki', name: 'ヒャッキ', kind: 'ひゃっきやこう型', family: 'monster',
    look: { f: 'biped', s: 1.45, c: m('#3a2a5a', '#1a1030', '#8a6ad8'), horn: '#ffd23f', fang: true, armor: '#2a1a3a', spike: '#7cff7a', gem: '#7cff7a', wing: 'bat', ear: 'horn' },
    skill: ['ひゃっきやこう', 'burst', '#7cff7a', 2.9],
    story: 'おおぜいの なかまと よなかに あつまり、むれの おさに なった おばけ',
    conds: [
      { hint: 'おなじ けいとうの なかまが 4ひき いじょう ちかくに いて…', test: (c) => c.kin >= 4 },
      { hint: 'よなかに…', test: (c) => c.night },
      { hint: 'たき火の まわりで…', test: (c) => c.near.fire },
    ],
  },
  {
    id: 'umibotaru', name: 'ウミボタル', kind: 'うみほたる型', family: 'water', float: true,
    look: { f: 'blob', s: 1.4, c: m('#1a4a8a', '#0a2050', '#5ad8ff'), gem: '#a8fff0', ear: 'fin', tail: 'fish', spot: '#a8fff0', stripe: '#5ad8ff' },
    skill: ['うみのひかり', 'wave', '#a8fff0', 2.7],
    story: 'よるの いりえで みずと ひかりに つつまれ、からだじゅうが ほたるのように ひかりだした',
    conds: [
      { hint: 'さんごの いりえで…', test: (c) => c.stage === 2 },
      { hint: 'よるに…', test: (c) => c.night },
      { hint: 'みずの ちかくで…', test: (c) => c.near.water },
    ],
  },
]

export const SECRET_IDS = new Set<string>(SECRET_FORMS.map((s) => s.id))
export const isSecretId = (v: unknown): v is SecretId => typeof v === 'string' && SECRET_IDS.has(v)
export const secretById = (id: string) => SECRET_FORMS.find((s) => s.id === id)

/** 隠しの姿の ステータス（完成期ベース + 少し強い） */
export function secretSpecies(): Record<SecretId, Species> {
  const out = {} as Record<SecretId, Species>
  const b = TIER_BASE[4]
  for (const s of SECRET_FORMS) {
    FAMILY_OF[s.id] = s.family
    out[s.id] = {
      id: s.id, name: s.name, kind: s.kind, height: b.h, hp: Math.round(b.hp * 1.05), atk: Math.round(b.atk * 1.08),
      speed: FAMILY_SPEED[s.family], temper: 'calm', float: s.float, tier: 4,
    } as Species
  }
  return out
}

/** 条件をぜんぶ満たす 隠しの姿（成熟期の子だけ）。複数あれば先に書いたもの */
export function secretForm(family: Family, tier: number, ctx: SecretCtx): SecretForm | null {
  if (tier !== 3) return null
  return SECRET_FORMS.find((s) => s.family === family && s.conds.every((k) => k.test(ctx))) ?? null
}

/** ヒントの進み具合：ビット 0〜2 = 条件ごとに 1 度でも満たした / ビット 7 = その系統の子を みつけた */
export function hintMask(family: Family, ctx: SecretCtx): Map<SecretId, number> {
  const r = new Map<SecretId, number>()
  for (const s of SECRET_FORMS) {
    if (s.family !== family) continue
    let mask = 0x80
    s.conds.forEach((k, i) => {
      if (k.test(ctx)) mask |= 1 << i
    })
    r.set(s.id, mask)
  }
  return r
}

/** ずかんに出す ヒントの文（見つけるまで：満たした条件の行だけ。見つけたら ぜんぶ） */
export function hintLines(s: SecretForm, mask: number, found: boolean): string[] {
  const out: string[] = []
  if (found || mask & 0x80) out.push(`${FAMILY_NAME[s.family]}けいの せいじゅくきの こが…`)
  s.conds.forEach((k, i) => {
    if (found || mask & (1 << i)) out.push(k.hint)
  })
  return out
}

// ================= ひみつの できごと =================
export interface EventCtx {
  night: boolean
  weather: SecretWeather
  stage: number
  gen: number
  village: number
  /** 仲間（ペットをふくむ）の数 */
  allies: number
  /** たき火の 5 マス以内にいる仲間の数 / たき火の数 */
  nearFire: number
  fires: number
  /** はしの上にいる仲間の数 */
  onBridge: number
  /** ペットが おはかの そばにいる / おはかの数 */
  petAtMemorial: boolean
  /** おしろ（完成）の もんの まえにいる仲間の数 / おしろの数 */
  atCastle: number
  castles: number
  /** 育った なえ（木）の数 */
  trees: number
  /** 水ぞくの 起きている 仲間の数 */
  waterAwake: number
  /** ゆりかごごやの そばで ねむっている 仲間の数 / ゆりかごごやの数 */
  sleepCradle: number
  cradles: number
  /** とり系の 仲間の数（まとまっている） */
  birds: number
  /** 家の中にいる仲間の数 */
  inside: number
}

export type EventFx = 'hotaru' | 'rainbow' | 'meteor' | 'confetti' | 'petals' | 'dance' | 'egg' | 'aurora' | 'chorus' | 'festival' | 'cozy'
export interface SecretEvent {
  id: string
  name: string
  /** ずかんに出す なぞかけ（見つけるまで） */
  riddle: string
  /** 見つけた時の ひとこと */
  msg: string
  /** 条件をみたし続ける秒数 */
  dwell: number
  reward: number
  fx: EventFx
  test: (c: EventCtx) => boolean
}

export const SECRET_EVENTS: SecretEvent[] = [
  { id: 'hotaru', name: 'ほたるの ささやき', riddle: 'ゆきの よる、たき火に みんなが そろうと…', msg: 'ゆきの よる、たき火に みんなが あつまると ほたるが とびかった！', dwell: 4, reward: 80, fx: 'hotaru',
    test: (c) => c.weather === 'snow' && c.night && c.fires > 0 && c.allies >= 3 && c.nearFire >= c.allies },
  { id: 'nijiyadori', name: 'にじの あまやどり', riddle: 'あめの ひ、はしの うえで じっと まっていると…', msg: 'はしの うえで あまやどりを していたら そらに にじが かかった！', dwell: 8, reward: 60, fx: 'rainbow',
    test: (c) => c.weather === 'rain' && c.onBridge >= 1 },
  { id: 'nagareboshi', name: 'ながれぼしの おまいり', riddle: 'よる、ペットが おはかの まえで てを あわせると…', msg: 'おはかの まえで おまいりを したら ながれぼしが ふりそそいだ！', dwell: 6, reward: 100, fx: 'meteor',
    test: (c) => c.night && c.gen >= 2 && c.petAtMemorial },
  { id: 'jounomon', name: 'おしろの もん', riddle: 'おしろの もんの まえに みんなが ならぶと…', msg: 'おしろの もんの まえに みんなが ならんだ！ ファンファーレが ひびく', dwell: 5, reward: 120, fx: 'confetti',
    test: (c) => !c.night && c.castles > 0 && c.atCastle >= 4 },
  { id: 'mori-uta', name: 'もりの うた', riddle: 'はれた ひるま、たくさんの きが そだつと…', msg: 'きが いっせいに ゆれて はなびらが ふってきた！', dwell: 6, reward: 50, fx: 'petals',
    test: (c) => !c.night && c.weather === 'sun' && c.trees >= 4 },
  { id: 'umi-odori', name: 'うみの よるの ダンス', riddle: 'さんごの いりえの よる、みずの なかまが あつまると…', msg: 'みずの なかまたちが よるの いりえで おどりだした！', dwell: 6, reward: 70, fx: 'dance',
    test: (c) => c.stage === 2 && c.night && c.waterAwake >= 3 },
  { id: 'yurikago-uta', name: 'ゆりかごの こもりうた', riddle: 'よる、ゆりかごごやの まわりで みんなが ねむると…', msg: 'こもりうたに さそわれて たまごが ひとつ とどいた！', dwell: 5, reward: 40, fx: 'egg',
    test: (c) => c.night && c.cradles > 0 && c.sleepCradle >= 3 },
  { id: 'aurora', name: 'オーロラの よる', riddle: 'こおりの かいろみねの ゆきの よる、じっと そらを みていると…', msg: 'よぞらに オーロラが ゆれている…！', dwell: 20, reward: 90, fx: 'aurora',
    test: (c) => c.stage === 4 && c.night && c.weather === 'snow' && c.allies >= 1 },
  { id: 'omatsuri', name: 'むらの おまつり', riddle: 'じょうかまちに なかまが おおぜい あつまると…', msg: 'じょうかまちで おまつりが はじまった！', dwell: 6, reward: 150, fx: 'festival',
    test: (c) => !c.night && c.village >= 3 && c.allies >= 6 },
  { id: 'tori-gasshou', name: 'とりの がっしょう', riddle: 'はれた ひるま、とりの なかまが 3びき あつまると…', msg: 'とりたちが いっせいに さえずりだした！', dwell: 5, reward: 40, fx: 'chorus',
    test: (c) => !c.night && c.weather === 'sun' && c.birds >= 3 },
  { id: 'ame-no-ie', name: 'あめの ひの いえ', riddle: 'あめの ひ、いえの なかで みんなが のんびりすると…', msg: 'あめの おとを ききながら、いえの なかは ぽかぽか あたたかい', dwell: 8, reward: 30, fx: 'cozy',
    test: (c) => c.weather === 'rain' && c.inside >= 3 },
]
export const EVENT_IDS = new Set(SECRET_EVENTS.map((e) => e.id))
