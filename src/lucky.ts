/**
 * うんだめし（ラッキー要素）の中身：確率の表・抽選・コインのやりとり・やさしい決まり・セーブ。
 * 画面（DOM）は luckyPanel.ts。ここは DOM に触らないので、ブラウザ無しでも 10 万回シミュレーションできる。
 *
 * ・使うのは「ゲームの中のコイン」だけ。現実のお金とは一切つながらない
 * ・確率や配当は下の定数が唯一の元。画面の確率表も、実際の抽選も、ここから作る（表と処理が必ず一致する）
 * ・保存データは World のセーブに一緒に入る（world.luckySave）。読み込みの時に必ず検査する
 */
import { FAMILY_NAME, type EggKind } from './world/families'
import type { SparMatch, SparSide, World } from './world/World'

// ---------------- 乱数（テストで差し替えられる） ----------------
export type Rng = () => number
let rng: Rng = Math.random
export const setRng = (f: Rng) => {
  rng = f
}
/** 重みの表から 1 つ選ぶ（添字を返す） */
export function pickWeighted(weights: readonly number[], r: number = rng()): number {
  const total = weights.reduce((a, b) => a + b, 0)
  let x = r * total
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i]
    if (x < 0) return i
  }
  return weights.length - 1
}

// ---------------- やさしい決まり ----------------
/** 1 回にかけられるのは、もちコインの 2 わりまで（少ない時は、いちばん小さいかけ金だけ） */
export const CAP_RATE = 0.2
/** きょうの かちまけ がこの数字より マイナスなら、小さいかけ金だけにする */
export const SOFT_LOSS = 150
/** きょうの あそんだ回数がこれ以上なら、小さいかけ金だけにする */
export const SOFT_PLAYS = 120
/** この回数ごとに「ひとやすみしよう」 */
export const REST_EVERY = 15
/** おこづかい：1 日の回数・1 回の金額・もらえる条件（コインがこれ未満） */
export const ALLOW = { perDay: 3, amount: 20, below: 100 }
/** れんぞくで負けた時のなぐさめボーナス */
export const CONSOLE = { streak: 5, mult: 2, min: 5, max: 30 }

// ---------------- たまごガチャ ----------------
export type Rarity = 0 | 1 | 2
export const RARITY_NAME = ['ふつう', 'レア', 'スーパーレア'] as const
export const GACHA = {
  single: 80,
  /** 10 れん = 9 回ぶんの値段（1 回ぶんお得） */
  ten: 720,
  /** ふつう / レア / スーパーレア の出る割合（合計 100） */
  weights: [85, 12, 3] as const,
  /** この回数ひいても レアいじょうが出なければ、その回は かならずレアいじょう */
  pityRare: 50,
  /** この回数ひいても スーパーレアが出なければ、その回は かならずスーパーレア */
  pitySR: 100,
  /** かならずレアいじょうの時の、レア : スーパーレア の割合 */
  atLeastRare: [12, 3] as const,
  /** あずかりたまごの上限（箱庭に置けるのは 3 こまで。空くと順番に置かれる） */
  stockMax: 30,
}
/** ガチャから出る系統（どれも同じ確率） */
export const GACHA_KINDS: EggKind[] = ['machine', 'dragon', 'cat', 'dog', 'bird', 'water', 'monster']
export interface EggPrize {
  rarity: Rarity
  kind: EggKind
  /** いまは見た目だけの目印。将来「色ちがい」「かくしの姿」とつなげる時の口（World.giveEgg の luck が受け取る） */
  special: 'none' | 'color' | 'hidden'
}
export const prizeName = (p: EggPrize) => `${FAMILY_NAME[p.kind]}の${p.rarity === 2 ? 'ふしぎなたまご' : p.rarity === 1 ? 'かざりたまご' : 'たまご'}`
export const rarityRate = (r: Rarity) => GACHA.weights[r] / GACHA.weights.reduce((a, b) => a + b, 0)

// ---------------- スロット ----------------
/** 1 まい = 3 コイン。かけるのは 1・3・5 まい */
export const SHEET = 3
export const SHEETS = [1, 3, 5] as const
export interface SlotSym {
  id: 'star' | 'mon' | 'egg' | 'bell' | 'meat' | 'berry'
  name: string
  /** リールに出る重み（3 つのリールとも同じ） */
  w: number
  /** 3 つそろった時の ばいりつ（かけ金の何倍） */
  tri: number
}
export const SYMS: readonly SlotSym[] = [
  { id: 'star', name: 'ほし', w: 1, tri: 100 },
  { id: 'mon', name: 'モンスター', w: 2, tri: 30 },
  { id: 'egg', name: 'たまご', w: 3, tri: 15 },
  { id: 'bell', name: 'すず', w: 4, tri: 7 },
  { id: 'meat', name: 'おにく', w: 5, tri: 4 },
  { id: 'berry', name: 'きのみ', w: 5, tri: 4 },
]
const STAR = 0
const BERRY = 5
/** ほし 2 つ・きのみ 2 つ・きのみ 1 つ の配当 */
export const SLOT_MINOR = { twoStar: 4, twoBerry: 2, oneBerry: 1 }
const SLOT_W = SYMS.map((s) => s.w)
const SLOT_TOTAL = SLOT_W.reduce((a, b) => a + b, 0)

export interface SlotEval {
  rule: string
  mult: number
  label: string
}
/** 3 つの絵柄（SYMS の添字）から配当を決める。強い順に 1 つだけ当てはまる */
export function slotEval(c: readonly number[]): SlotEval {
  if (c[0] === c[1] && c[1] === c[2]) return { rule: `tri${c[0]}`, mult: SYMS[c[0]].tri, label: `${SYMS[c[0]].name}が そろった！` }
  const stars = c.filter((x) => x === STAR).length
  if (stars === 2) return { rule: 'twoStar', mult: SLOT_MINOR.twoStar, label: 'ほしが 2つ！' }
  const berries = c.filter((x) => x === BERRY).length
  if (berries === 2) return { rule: 'twoBerry', mult: SLOT_MINOR.twoBerry, label: 'きのみが 2つ！' }
  if (berries === 1) return { rule: 'oneBerry', mult: SLOT_MINOR.oneBerry, label: 'きのみ 1つ（かけ金が もどる）' }
  return { rule: 'none', mult: 0, label: 'はずれ…' }
}
export const slotDraw = (r: Rng = rng) => pickWeighted(SLOT_W, r())
/** 全 216 通りを数えて、配当ごとの確率と、ぴったりの期待値（機械割）を出す */
export function slotTable() {
  const rows = new Map<string, { rule: string; mult: number; p: number; label: string; cells: [number, number, number] }>()
  let rtp = 0
  let hit = 0
  for (let a = 0; a < SYMS.length; a++)
    for (let b = 0; b < SYMS.length; b++)
      for (let c = 0; c < SYMS.length; c++) {
        const p = (SLOT_W[a] * SLOT_W[b] * SLOT_W[c]) / SLOT_TOTAL ** 3
        const e = slotEval([a, b, c])
        rtp += p * e.mult
        if (e.mult > 0) hit += p
        const row = rows.get(e.rule)
        if (row) row.p += p
        else rows.set(e.rule, { rule: e.rule, mult: e.mult, p, label: e.label, cells: [a, b, c] })
      }
  return { rows: [...rows.values()].filter((r) => r.mult > 0).sort((x, y) => y.mult - x.mult), rtp, hit }
}
/** リールのならび（20 コマ。重みの数だけ同じ絵柄が入り、ばらけて並ぶ）。見た目だけに使う */
export const REEL_STRIP: number[] = (() => {
  const left = SLOT_W.slice()
  const out: number[] = []
  let last = -1
  while (out.length < SLOT_TOTAL) {
    let best = -1
    for (let i = 0; i < left.length; i++) if (left[i] > 0 && i !== last && (best < 0 || left[i] > left[best])) best = i
    if (best < 0) best = left.findIndex((n) => n > 0)
    out.push(best)
    left[best]--
    last = best
  }
  return out
})()

// ---------------- いろあてルーレット ----------------
export type RColor = 'red' | 'blue' | 'gold'
export const ROULETTE = {
  /** 24 マス：あか 11・あお 11・きん 2 */
  cells: [...Array(11).fill('red'), ...Array(11).fill('blue'), 'gold', 'gold'] as RColor[],
  mult: { red: 2.2, blue: 2.2, gold: 12 } as Record<RColor, number>,
  bets: [5, 10, 20] as const,
}
export const COLOR_NAME: Record<RColor, string> = { red: 'あか', blue: 'あお', gold: 'きん' }
/** マスの並び（見た目用）：あか・あお・あか・あお…の間に きん */
export const ROULETTE_RING: RColor[] = (() => {
  const r: RColor[] = []
  for (let i = 0; i < 11; i++) r.push('red', 'blue')
  r.splice(0, 0, 'gold')
  r.splice(12, 0, 'gold')
  return r
})()
export const rouletteP = (c: RColor) => ROULETTE.cells.filter((x) => x === c).length / ROULETTE.cells.length
export const rouletteRtp = (c: RColor) => rouletteP(c) * ROULETTE.mult[c]

// ---------------- おみくじ ----------------
export interface Fortune {
  name: string
  /** 出る割合（合計 100） */
  w: number
  /** その場でもらえるコイン */
  gift: number
  /** きょう 1 日、20 びょうごとのコインに足される */
  income: number
  color: string
  msg: string
}
export const FORTUNES: readonly Fortune[] = [
  { name: '大吉', w: 6, gift: 40, income: 3, color: '#ff5a5a', msg: 'きょうは さいこうの 1日になりそう！' },
  { name: '中吉', w: 14, gift: 20, income: 2, color: '#ff9a3c', msg: 'いいことが ありそうな よかん。' },
  { name: '小吉', w: 25, gift: 12, income: 1, color: '#ffd23f', msg: 'ちいさな しあわせが みつかるよ。' },
  { name: '吉', w: 25, gift: 10, income: 1, color: '#7cf29b', msg: 'おだやかな 1日に なりそう。' },
  { name: '末吉', w: 18, gift: 8, income: 0, color: '#6fd6ff', msg: 'ゆっくり いこう。あとで いいことが。' },
  { name: '凶', w: 12, gift: 5, income: 0, color: '#c9a8ff', msg: 'だいじょうぶ！ おまもりを あげるね。' },
]
export const FORTUNE_COST = 10
export const FORTUNE_PER_DAY = 3
export const LUCKY_ITEMS = ['あかいリボン', 'まるいボタン', 'ふるい コイン', 'ちいさな はっぱ', 'あまいおかし', 'ほしの シール', 'やわらかい タオル', 'ひかるビー玉']
export const LUCKY_COLORS = ['あか', 'あお', 'きいろ', 'みどり', 'むらさき', 'しろ', 'オレンジ', 'ももいろ']
export const CHARM_MAX = 3

// ---------------- バトル予想 ----------------
/** 相性（三すくみ 2 組）：キーの系統は、値の系統に つよい。モンスター・めばえは どれとも ふつう */
export const ADVANTAGE: Record<string, string> = {
  water: 'dragon', dragon: 'machine', machine: 'water',
  cat: 'bird', bird: 'dog', dog: 'cat',
}
export const PREDICT = { bets: [5, 10, 20] as const, window: 7000, giveUp: 180000, edge: 0.95, minOdds: 1.1, maxOdds: 8 }
export interface SparOdds {
  p: [number, number]
  odds: [number, number]
}
const sparPower = (a: SparSide, b: SparSide) => Math.max(1, a.hp) * Math.max(1, a.atk) * (ADVANTAGE[a.fam] === b.fam ? 1.2 : 1) * (a.cheer ? 1.1 : 1)
/** つよさ（たいりょく x こうげき）・あいしょう・おうえんから、かつ見こみと ばいりつを出す */
export function sparOdds(a: SparSide, b: SparSide): SparOdds {
  const sa = sparPower(a, b)
  const sb = sparPower(b, a)
  const pa = Math.min(0.9, Math.max(0.1, 1 / (1 + (sb / sa) ** 1.4)))
  const odds = (p: number) => Math.min(PREDICT.maxOdds, Math.max(PREDICT.minOdds, Math.floor((PREDICT.edge / p) * 10) / 10))
  return { p: [pa, 1 - pa], odds: [odds(pa), odds(1 - pa)] }
}
export interface Market {
  id: number
  m: SparMatch
  odds: SparOdds
  /** この時刻（ms）までに かけられる */
  closes: number
  at: number
  bet: { side: 0 | 1; amount: number } | null
}
export interface HistoryEntry {
  r: 'win' | 'lose' | 'void'
  bet: number
  pay: number
  a: string
  b: string
}

// ---------------- 保存データ ----------------
export interface Today {
  net: number
  plays: number
  gachaSpent: number
  allowance: number
  draws: number
  fortune: { rank: number; item: number; color: number } | null
}
export interface LuckyState {
  v: 1
  day: string
  gacha: { total: number; sinceRare: number; sinceSR: number; stock: { kind: EggKind; luck: Rarity }[]; best: Rarity[] }
  today: Today
  charm: number
  loseStreak: number
  restCount: number
  predictOn: boolean
  history: HistoryEntry[]
}
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const freshToday = (): Today => ({ net: 0, plays: 0, gachaSpent: 0, allowance: 0, draws: 0, fortune: null })
export function freshState(): LuckyState {
  return {
    v: 1, day: dayKey(),
    gacha: { total: 0, sinceRare: 0, sinceSR: 0, stock: [], best: [] },
    today: freshToday(), charm: 0, loseStreak: 0, restCount: 0, predictOn: true, history: [],
  }
}
const int = (v: unknown, min: number, max: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : def)
const isKind = (v: unknown): v is EggKind => typeof v === 'string' && (GACHA_KINDS as string[]).includes(v)
/** セーブされた中身は信用しない：型・範囲・長さを検査して作り直す */
export function loadLucky(raw: unknown): LuckyState {
  const st = freshState()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return st
  const d = raw as Record<string, any>
  if (typeof d.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.day)) st.day = d.day
  const g = d.gacha && typeof d.gacha === 'object' ? d.gacha : {}
  st.gacha.total = int(g.total, 0, 1e7, 0)
  st.gacha.sinceRare = int(g.sinceRare, 0, GACHA.pityRare - 1, 0)
  st.gacha.sinceSR = int(g.sinceSR, 0, GACHA.pitySR - 1, 0)
  if (Array.isArray(g.stock))
    for (const s of g.stock.slice(0, GACHA.stockMax)) if (s && isKind(s.kind)) st.gacha.stock.push({ kind: s.kind, luck: s.luck === 2 ? 2 : s.luck === 1 ? 1 : 0 })
  if (Array.isArray(g.best)) st.gacha.best = g.best.slice(-10).map((x: unknown) => (x === 2 ? 2 : x === 1 ? 1 : 0)) as Rarity[]
  const t = d.today && typeof d.today === 'object' ? d.today : {}
  st.today = {
    net: int(t.net, -1e7, 1e7, 0), plays: int(t.plays, 0, 1e6, 0), gachaSpent: int(t.gachaSpent, 0, 1e8, 0),
    allowance: int(t.allowance, 0, ALLOW.perDay, 0), draws: int(t.draws, 0, FORTUNE_PER_DAY, 0), fortune: null,
  }
  const f = t.fortune
  if (f && typeof f === 'object') st.today.fortune = { rank: int(f.rank, 0, FORTUNES.length - 1, FORTUNES.length - 1), item: int(f.item, 0, LUCKY_ITEMS.length - 1, 0), color: int(f.color, 0, LUCKY_COLORS.length - 1, 0) }
  st.charm = int(d.charm, 0, CHARM_MAX, 0)
  st.loseStreak = int(d.loseStreak, 0, 99, 0)
  st.restCount = int(d.restCount, 0, REST_EVERY, 0)
  st.predictOn = d.predictOn !== false
  if (Array.isArray(d.history))
    for (const h of d.history.slice(-12))
      if (h && typeof h === 'object')
        st.history.push({
          r: h.r === 'win' ? 'win' : h.r === 'void' ? 'void' : 'lose', bet: int(h.bet, 0, 1e6, 0), pay: int(h.pay, 0, 1e7, 0),
          a: typeof h.a === 'string' ? h.a.slice(0, 12) : '', b: typeof h.b === 'string' ? h.b.slice(0, 12) : '',
        })
  return st
}

// ---------------- 本体 ----------------
export type Fail = { ok: false; why: string }
const fail = (why: string): Fail => ({ ok: false, why })
export interface Settled {
  /** 受けとったコインの合計（払い戻し + おまもり + なぐさめ） */
  total: number
  charm: boolean
  bonus: number
}
export interface SlotSpin extends Settled {
  ok: true
  cells: [number, number, number]
  ev: SlotEval
  cost: number
  pay: number
  /** 2 つそろっている（3 つめがゆっくり止まる）：0 = なし / 1 = きのみ・ふつう / 2 = ほし・モンスター */
  reach: 0 | 1 | 2
}
export interface RouletteSpin extends Settled {
  ok: true
  index: number
  color: RColor
  pick: RColor
  bet: number
  pay: number
}
export interface FortuneDraw {
  ok: true
  rank: number
  item: number
  color: number
  gift: number
  charm: boolean
  best: boolean
}
export interface GachaResult {
  ok: true
  prizes: EggPrize[]
  cost: number
}

export class Lucky {
  st: LuckyState
  market: Market | null = null
  /** 言葉（ひとやすみ・なぐさめ など）。画面が読んで出す */
  onNote: (text: string) => void = () => {}

  constructor(readonly world: World) {
    this.st = loadLucky(world.luckySave)
    world.luckySave = this.st
    this.rollDay()
  }

  get coins() {
    return this.world.coins
  }

  /** 日がかわったら、きょうの記録とおみくじをリセット */
  rollDay() {
    const k = dayKey()
    if (this.st.day !== k) {
      this.st.day = k
      this.st.today = freshToday()
    }
    this.world.luckIncome = this.fortune() ? FORTUNES[this.fortune()!.rank].income : 0
  }
  fortune() {
    return this.st.today.fortune
  }

  /** 1 秒ごとに呼ぶ：日がわり・たまごの順番おき・取りのこしの精算 */
  tick() {
    this.rollDay()
    this.flushStock()
    const m = this.market
    if (m && !m.bet && Date.now() > m.closes) this.market = null
    if (m && m.bet && Date.now() > m.closes + PREDICT.giveUp) this.predictEnd(m.id, -1)
  }

  // ---- やさしい決まり ----
  restricted() {
    return this.st.today.net <= -SOFT_LOSS || this.st.today.plays >= SOFT_PLAYS
  }
  /** いまかけられる上限（minBet = そのゲームのいちばん小さいかけ金） */
  maxBet(minBet: number) {
    return this.restricted() ? minBet : Math.max(minBet, Math.floor(this.coins * CAP_RATE))
  }
  canBet(amount: number, minBet: number): true | string {
    if (amount > this.coins) return 'コインが たりない'
    if (amount > this.maxBet(minBet)) return this.restricted() ? 'きょうは ちいさい かけだけ' : 'もちコインの 2わりまで'
    return true
  }
  allowanceLeft() {
    return Math.max(0, ALLOW.perDay - this.st.today.allowance)
  }
  /** おこづかい：コインが少ない時だけ、1 日 3 回 */
  allowance(): { ok: true; amount: number } | Fail {
    this.rollDay()
    if (this.allowanceLeft() <= 0) return fail('きょうの おこづかいは もうないよ。あしたまた！')
    if (this.coins >= ALLOW.below) return fail(`コインが ${ALLOW.below} こ未満の ときに もらえるよ`)
    this.st.today.allowance++
    this.world.addCoins(ALLOW.amount)
    return { ok: true, amount: ALLOW.amount }
  }
  /** 勝負のあとの記録。まけが続いたら なぐさめ、回数が多ければ ひとやすみ */
  private settle(bet: number, pay: number): Settled {
    const s = this.st
    let total = pay
    let charm = false
    let bonus = 0
    if (pay === 0 && s.charm > 0) {
      s.charm--
      charm = true
      total += Math.floor(bet / 2)
    }
    if (total < bet) {
      s.loseStreak++
      if (s.loseStreak >= CONSOLE.streak) {
        bonus = Math.min(CONSOLE.max, Math.max(CONSOLE.min, bet * CONSOLE.mult))
        s.loseStreak = 0
        this.onNote(`まけが つづいたね。なぐさめボーナス +${bonus}！`)
      }
    } else s.loseStreak = 0
    total += bonus
    if (total > 0) this.world.addCoins(total, true)
    s.today.net += total - bet
    this.play()
    return { total, charm, bonus }
  }
  /** あそんだ回数をふやす。決まった回数ごとに ひとやすみ */
  private play() {
    const s = this.st
    s.today.plays++
    s.restCount++
    if (s.restCount >= REST_EVERY) {
      s.restCount = 0
      const m = 'たくさん あそんだね。ひとやすみ しよう。おみずを のんで、そとを ながめてみてね'
      this.onNote(m)
      this.world.luckySay(m)
    }
  }

  // ---- ガチャ ----
  stockRoom() {
    return GACHA.stockMax - this.st.gacha.stock.length
  }
  /** あと何回で てんじょうか */
  pityLeft() {
    return { rare: GACHA.pityRare - this.st.gacha.sinceRare, sr: GACHA.pitySR - this.st.gacha.sinceSR }
  }
  private pullOne(last: boolean): EggPrize {
    const g = this.st.gacha
    g.total++
    g.sinceRare++
    g.sinceSR++
    let r: Rarity
    if (g.sinceSR >= GACHA.pitySR) r = 2
    else if (last || g.sinceRare >= GACHA.pityRare) r = (1 + pickWeighted(GACHA.atLeastRare)) as Rarity
    else r = pickWeighted(GACHA.weights) as Rarity
    if (r >= 1) g.sinceRare = 0
    if (r === 2) g.sinceSR = 0
    const kind = GACHA_KINDS[Math.floor(rng() * GACHA_KINDS.length)]
    return { rarity: r, kind, special: r === 2 ? 'hidden' : r === 1 ? 'color' : 'none' }
  }
  /** n = 1 か 10。10 のときは さいごの 1 こが かならずレアいじょう */
  gachaPull(n: 1 | 10): GachaResult | Fail {
    const cost = n === 10 ? GACHA.ten : GACHA.single
    if (this.stockRoom() < n) return fail('あずかりたまごが いっぱい。かえるのを まってね')
    if (this.coins < cost) return fail('コインが たりない')
    if (!this.world.spendCoins(cost)) return fail('コインが たりない')
    const prizes: EggPrize[] = []
    for (let i = 0; i < n; i++) prizes.push(this.pullOne(n === 10 && i === 9))
    for (const p of prizes) this.st.gacha.stock.push({ kind: p.kind, luck: p.rarity })
    this.st.gacha.best = [...this.st.gacha.best, ...prizes.map((p) => p.rarity)].slice(-10)
    this.st.today.gachaSpent += cost
    this.play()
    this.flushStock()
    return { ok: true, prizes, cost }
  }
  /** あずかりたまごを、空きがあれば箱庭にならべる */
  flushStock() {
    const st = this.st.gacha.stock
    while (st.length && this.world.eggRoom() > 0) {
      const e = st[0]
      if (!this.world.giveEgg(e.kind, e.luck)) break
      st.shift()
      const nm = prizeName({ rarity: e.luck, kind: e.kind, special: 'none' })
      this.world.luckySay(e.luck ? `${RARITY_NAME[e.luck]}！ ${nm}を おいた` : `${nm}を おいた`)
    }
  }

  // ---- スロット ----
  slotCost(sheets: number) {
    return sheets * SHEET
  }
  slotCheck(sheets: number): true | string {
    if (!SHEETS.includes(sheets as 1 | 3 | 5)) return 'かけ金が ちがう'
    return this.canBet(this.slotCost(sheets), this.slotCost(SHEETS[0]))
  }
  slotSpin(sheets: number): SlotSpin | Fail {
    const chk = this.slotCheck(sheets)
    if (chk !== true) return fail(chk)
    const cost = this.slotCost(sheets)
    if (!this.world.spendCoins(cost)) return fail('コインが たりない')
    const cells: [number, number, number] = [slotDraw(), slotDraw(), slotDraw()]
    const ev = slotEval(cells)
    const pay = ev.mult * cost
    const reach: 0 | 1 | 2 = cells[0] !== cells[1] ? 0 : cells[0] <= 1 ? 2 : 1
    return { ok: true, cells, ev, cost, pay, reach, ...this.settle(cost, pay) }
  }

  // ---- ルーレット ----
  rouletteCheck(bet: number): true | string {
    if (!ROULETTE.bets.includes(bet as 5 | 10 | 20)) return 'かけ金が ちがう'
    return this.canBet(bet, ROULETTE.bets[0])
  }
  rouletteSpin(pick: RColor, bet: number): RouletteSpin | Fail {
    if (!(pick in ROULETTE.mult)) return fail('いろが ちがう')
    const chk = this.rouletteCheck(bet)
    if (chk !== true) return fail(chk)
    if (!this.world.spendCoins(bet)) return fail('コインが たりない')
    const index = Math.floor(rng() * ROULETTE.cells.length)
    const color = ROULETTE.cells[index]
    const pay = color === pick ? Math.floor(bet * ROULETTE.mult[pick]) : 0
    return { ok: true, index, color, pick, bet, pay, ...this.settle(bet, pay) }
  }

  // ---- おみくじ ----
  fortuneLeft() {
    return Math.max(0, FORTUNE_PER_DAY - this.st.today.draws)
  }
  fortuneDraw(): FortuneDraw | Fail {
    this.rollDay()
    if (this.fortuneLeft() <= 0) return fail('きょうの おみくじは おしまい。あしたまた！')
    if (!this.world.spendCoins(FORTUNE_COST)) return fail('コインが たりない')
    const t = this.st.today
    t.draws++
    const rank = pickWeighted(FORTUNES.map((f) => f.w))
    const item = Math.floor(rng() * LUCKY_ITEMS.length)
    const color = Math.floor(rng() * LUCKY_COLORS.length)
    const f = FORTUNES[rank]
    const best = !t.fortune || rank < t.fortune.rank
    if (best) t.fortune = { rank, item, color }
    // 凶でも、ちいさなおまもり
    const charm = rank === FORTUNES.length - 1 && this.st.charm < CHARM_MAX
    if (charm) this.st.charm++
    this.world.addCoins(f.gift, true)
    t.net += f.gift - FORTUNE_COST
    this.play()
    this.rollDay()
    return { ok: true, rank, item, color, gift: f.gift, charm, best }
  }

  // ---- バトル予想 ----
  /** じゃれあいバトルが始まった（World から呼ばれる） */
  predictOpen(m: SparMatch) {
    if (!this.st.predictOn) return
    if (this.market?.bet) return
    if (!m.a.mine && !m.b.mine) return
    this.market = { id: m.id, m, odds: sparOdds(m.a, m.b), closes: Date.now() + PREDICT.window, at: Date.now(), bet: null }
  }
  predictCheck(amount: number): true | string {
    if (!PREDICT.bets.includes(amount as 5 | 10 | 20)) return 'かけ金が ちがう'
    return this.canBet(amount, PREDICT.bets[0])
  }
  predictBet(side: 0 | 1, amount: number): { ok: true } | Fail {
    const m = this.market
    if (!m || m.bet) return fail('いまは かけられない')
    if (Date.now() > m.closes) return fail('うけつけは おわったよ')
    const chk = this.predictCheck(amount)
    if (chk !== true) return fail(chk)
    if (!this.world.spendCoins(amount)) return fail('コインが たりない')
    m.bet = { side, amount }
    return { ok: true }
  }
  /** バトルが終わった（winner: 0 = a / 1 = b / -1 = 引き分け・中止） */
  predictEnd(id: number, winner: 0 | 1 | -1): (Settled & { r: HistoryEntry['r']; pay: number; bet: number }) | null {
    const m = this.market
    if (!m || m.id !== id) return null
    this.market = null
    if (!m.bet) return null
    const { side, amount } = m.bet
    let r: HistoryEntry['r']
    let pay: number
    let s: Settled
    if (winner === -1) {
      // 中止：かけ金は もどる（記録には のこすが、あそんだ回数には数えない）
      r = 'void'
      pay = amount
      this.world.addCoins(amount, true)
      s = { total: amount, charm: false, bonus: 0 }
    } else {
      r = winner === side ? 'win' : 'lose'
      pay = r === 'win' ? Math.round(amount * m.odds.odds[side]) : 0
      s = this.settle(amount, pay)
    }
    this.st.history = [...this.st.history, { r, bet: amount, pay: s.total, a: m.m.a.name, b: m.m.b.name }].slice(-12)
    return { ...s, r, pay, bet: amount }
  }
}
