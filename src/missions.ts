/**
 * 日替わりミッション・季節・実績（バッジ）。
 * World は出来事のたびに `stat(key)` で数を足し、1 秒ごとに `MissionBook.tick()` へ渡す。
 * ここは three.js に依存しない（データの定義と進捗の計算だけ）。
 */

// ================= 季節 =================
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter']
export const isSeason = (v: unknown): v is Season => typeof v === 'string' && (SEASONS as string[]).includes(v)

export const SEASON_INFO: Record<Season, { name: string; event: string; msg: string; egg: string; color: string }> = {
  spring: { name: 'はる', event: 'おはなみ', msg: 'はるが きた！ はなびらが まっている', egg: 'はるの かざりたまご', color: '#ffb3d1' },
  summer: { name: 'なつ', event: 'なつまつり', msg: 'なつが きた！ よるは ちょうちんが ともる', egg: 'なつの かざりたまご', color: '#ffd23f' },
  autumn: { name: 'あき', event: 'しゅうかくまつり', msg: 'あきが きた！ たべものが よく みのるよ', egg: 'あきの かざりたまご', color: '#ff9a3c' },
  winter: { name: 'ふゆ', event: 'ゆきまつり', msg: 'ふゆが きた！ ゆきが ふりやすくなる', egg: 'ふゆの かざりたまご', color: '#bfe3ff' },
}

/** 月から季節（北半球）：3-5 春 / 6-8 夏 / 9-11 秋 / 12-2 冬 */
export const seasonOfDate = (d: Date): Season => {
  const m = d.getMonth() + 1
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter'
}

/** いまの季節。URL に `?season=spring|summer|autumn|winter` を付けると固定できる（確認用） */
export function seasonNow(d: Date = new Date()): Season {
  try {
    const q = new URLSearchParams(location.search).get('season')
    if (isSeason(q)) return q
  } catch {
    /* noop */
  }
  return seasonOfDate(d)
}

// ================= 日付 =================
const pad = (n: number) => String(n).padStart(2, '0')
/** ローカル日付 YYYY-MM-DD */
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/
const parseKey = (k: string) => new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)), 12)
export const dayDiff = (a: string, b: string) => Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86400000)
const yesterdayOf = (k: string) => {
  const d = parseKey(k)
  d.setDate(d.getDate() - 1)
  return dateKey(d)
}

// ================= 数え方 =================
/** 通算の数（出来事のたびに増える） */
export type Stats = Record<string, number>
/** いまの状態の値（ずかんの数、仲間の数など） */
export type Gauges = Record<string, number>

export const STAT_KEY = /^[a-z][a-z0-9_]{0,23}$/

// ================= 日替わりミッション =================
export type Diff = 0 | 1 | 2
export const DIFF_NAME = ['かんたん', 'ふつう', 'むずかしい']
export const DIFF_REWARD = [20, 40, 80]
export const ALL_CLEAR_BONUS = 50
export const streakBonus = (streak: number) => (streak >= 2 ? Math.min(50, streak * 5) : 0)

interface Template {
  id: string
  /** 'count' = 今日ふえた数 / 'gauge' = いまの値がこの数になる */
  kind: 'count' | 'gauge'
  key: string
  /** かんたん / ふつう / むずかしい の目標（0 = その難しさには出ない） */
  n: [number, number, number]
  text: (n: number) => string
  /** 今日出してよいか（もう達成ずみ・できないことは出さない） */
  ok?: (n: number, g: Gauges) => boolean
}

const VILLAGE = ['', 'むら', 'まち', 'じょうかまち']
export const TEMPLATES: Template[] = [
  { id: 'trains', kind: 'count', key: 'trains', n: [3, 5, 10], text: (n) => `トレーニングを ${n}かい する` },
  { id: 'wins', kind: 'count', key: 'wins', n: [2, 5, 10], text: (n) => `バトルに ${n}かい かつ` },
  { id: 'meals', kind: 'count', key: 'meals', n: [3, 6, 10], text: (n) => `ペットが ごはんを ${n}かい たべる` },
  { id: 'sleeps', kind: 'count', key: 'sleeps', n: [1, 2, 3], text: (n) => `ペットが ぐっすり ねむって ${n}かい おきる` },
  { id: 'plays', kind: 'count', key: 'plays', n: [1, 2, 4], text: (n) => `ペットが ${n}かい あそぶ` },
  { id: 'mats', kind: 'count', key: 'mats', n: [6, 12, 24], text: (n) => `しざいを ${n}こ はこぶ` },
  { id: 'earned', kind: 'count', key: 'earned', n: [50, 120, 250], text: (n) => `コインを ${n} ためる` },
  { id: 'spent', kind: 'count', key: 'spent', n: [30, 80, 200], text: (n) => `コインを ${n} つかう` },
  { id: 'buys', kind: 'count', key: 'buys', n: [1, 2, 4], text: (n) => `ショップで ${n}かい かいものする` },
  { id: 'dex', kind: 'count', key: 'dex', n: [1, 2, 3], text: (n) => `ずかんに ${n}しゅ とうろくする`, ok: (n, g) => g.dexSeen + n <= g.dexTotal },
  { id: 'hatched', kind: 'count', key: 'hatched', n: [0, 1, 2], text: (n) => `たまごを ${n}こ かえす` },
  { id: 'eggs', kind: 'count', key: 'eggs', n: [0, 1, 2], text: (n) => `たまごを ${n}こ うみだす（かう・できる）` },
  { id: 'houseDone', kind: 'count', key: 'houseDone', n: [0, 1, 2], text: (n) => `いえを ${n}けん かんせいさせる`, ok: (_n, g) => g.houses3 < 6 },
  { id: 'houseExp', kind: 'count', key: 'houseExp', n: [0, 0, 1], text: (n) => `いえを ${n}けん ぞうちくする`, ok: (_n, g) => g.houses4 < 6 },
  { id: 'structs', kind: 'count', key: 'structs', n: [0, 1, 2], text: (n) => `たてものを ${n}こ かんせいさせる` },
  { id: 'army', kind: 'count', key: 'armies', n: [0, 0, 1], text: () => 'てきぐんを おいはらう', ok: (_n, g) => g.vscore >= 5 },
  { id: 'evolves', kind: 'count', key: 'evolves', n: [0, 1, 2], text: (n) => `なかまが ${n}かい しんかする` },
  { id: 'friends', kind: 'count', key: 'friends', n: [0, 1, 2], text: (n) => `なかまが ${n}ひき ふえる`, ok: (n, g) => g.friends + n <= 5 },
  { id: 'friendsTotal', kind: 'gauge', key: 'friends', n: [2, 3, 4], text: (n) => `なかまを ${n}ひきに する`, ok: (n, g) => g.friends < n },
  { id: 'sameFam', kind: 'gauge', key: 'sameFam', n: [0, 2, 3], text: (n) => `おなじ けいとうの なかまを ${n}ひきに する`, ok: (n, g) => g.sameFam < n },
  { id: 'village', kind: 'gauge', key: 'village', n: [0, 2, 3], text: (n) => `${VILLAGE[n]}まで そだてる`, ok: (n, g) => g.village < n },
]
const TPL = new Map(TEMPLATES.map((t) => [t.id, t]))

export interface Mission { tpl: string; diff: Diff; target: number }
export const missionText = (m: Mission) => TPL.get(m.tpl)?.text(m.target) ?? ''

/** 文字列から種を作って、同じ日なら同じ並びを返す小さな乱数 */
function rng(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** その日のミッション 3 つ（かんたん / ふつう / むずかしい）。日付が同じなら同じ内容 */
export function pickMissions(day: string, g: Gauges): Mission[] {
  const r = rng(`pulsar-${day}`)
  const used = new Set<string>()
  const out: Mission[] = []
  for (const d of [0, 1, 2] as Diff[]) {
    let pool = TEMPLATES.filter((t) => t.n[d] > 0 && !used.has(t.key) && (t.ok?.(t.n[d], g) ?? true))
    if (!pool.length) pool = TEMPLATES.filter((t) => t.n[d] > 0 && !used.has(t.key))
    const t = pool[Math.floor(r() * pool.length)]
    used.add(t.key)
    out.push({ tpl: t.id, diff: d, target: t.n[d] })
  }
  return out
}

// ================= 実績（バッジ）=================
export interface Achievement { id: string; name: string; desc: string; coins: number; test: (s: Stats, g: Gauges) => boolean }
const at = (k: string, n: number) => (s: Stats) => (s[k] ?? 0) >= n
const gt = (k: string, n: number) => (_s: Stats, g: Gauges) => (g[k] ?? 0) >= n
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'firstFriend', name: 'はじめての なかま', desc: 'なかまが できた', coins: 20, test: at('friends', 1) },
  { id: 'firstEvolve', name: 'はじめての しんか', desc: 'なかまか ペットが しんかした', coins: 30, test: at('evolves', 1) },
  { id: 'firstHatch', name: 'たまごが かえった', desc: 'たまごを かえした', coins: 20, test: at('hatched', 1) },
  { id: 'firstHouse', name: 'わが家', desc: 'いえを 1けん かんせいさせた', coins: 30, test: at('houseDone', 1) },
  { id: 'castle', name: 'おしろの かんせい', desc: 'おしろを たてた', coins: 100, test: at('castle', 1) },
  { id: 'rebirth', name: 'せだいこうたい', desc: 'ペットが つぎの だいに うまれかわった', coins: 80, test: at('rebirths', 1) },
  { id: 'dex10', name: 'ずかん 10しゅ', desc: 'なかまを 10しゅ あつめた', coins: 50, test: gt('dexOwned', 10) },
  { id: 'dex30', name: 'ずかん 30しゅ', desc: 'なかまを 30しゅ あつめた', coins: 150, test: gt('dexOwned', 30) },
  { id: 'dex49', name: 'ずかん コンプリート', desc: 'なかまを 49しゅ ぜんぶ あつめた', coins: 500, test: gt('dexOwned', 49) },
  { id: 'boss', name: 'ボスを たおした', desc: 'てきぐんの ボスを たおした', coins: 100, test: at('bosses', 1) },
  { id: 'army1', name: 'はじめての ぼうえい', desc: 'てきぐんを おいはらった', coins: 40, test: at('armies', 1) },
  { id: 'army10', name: 'むらの まもりがみ', desc: 'てきぐんを 10かい おいはらった', coins: 200, test: at('armies', 10) },
  { id: 'land1', name: 'かいたく ①', desc: 'はこにわを ひろげた', coins: 50, test: gt('land', 1) },
  { id: 'land2', name: 'かいたく ②', desc: 'はこにわを いちばん ひろげた', coins: 120, test: gt('land', 2) },
  { id: 'houses6', name: 'おおきな いえ', desc: 'いえ 6けんを すべて ぞうちくした', coins: 200, test: gt('houses4', 6) },
  { id: 'town', name: 'まちに なった', desc: 'むらを まちまで そだてた', coins: 60, test: gt('village', 2) },
  { id: 'castleTown', name: 'じょうかまち', desc: 'むらを じょうかまちまで そだてた', coins: 150, test: gt('village', 3) },
  { id: 'friends5', name: 'にぎやかな まち', desc: 'なかまが 5ひき そろった', coins: 80, test: gt('friends', 5) },
  { id: 'tier4', name: 'かんせいき', desc: 'いちばん そだった すがたに なった', coins: 100, test: gt('tier4', 1) },
  { id: 'trains50', name: 'トレーニング 50かい', desc: 'たくさん きたえた', coins: 60, test: at('trains', 50) },
  { id: 'wins30', name: '30しょう', desc: 'バトルに 30かい かった', coins: 80, test: at('wins', 30) },
  { id: 'meals30', name: 'ぐるめ', desc: 'ごはんを 30かい たべた', coins: 40, test: at('meals', 30) },
  { id: 'structs10', name: 'たてもの 10こ', desc: 'たてものを 10こ かんせいさせた', coins: 100, test: at('structs', 10) },
  { id: 'rich', name: 'おかねもち', desc: 'コインを あわせて 1000 ためた', coins: 100, test: at('earned', 1000) },
  { id: 'evolves10', name: 'しんかの たつじん', desc: '10かい しんかを みた', coins: 120, test: at('evolves', 10) },
  { id: 'streak3', name: '3にち れんぞく', desc: 'おねがいを 3にち つづけた', coins: 40, test: gt('streak', 3) },
  { id: 'streak7', name: '7にち れんぞく', desc: 'おねがいを 7にち つづけた', coins: 120, test: gt('streak', 7) },
  { id: 'allClear3', name: 'おねがい ぜんぶ', desc: '1にちぶんの おねがいを 3かい ぜんぶ こなした', coins: 100, test: at('allClear', 3) },
  { id: 'fourSeasons', name: 'しきを あじわう', desc: 'はる・なつ・あき・ふゆ を すべて すごした', coins: 150, test: (s) => SEASONS.every((k) => (s[`seen_${k}`] ?? 0) >= 1) },
  // 色ちがい（べつの機能）が `world.stat('shiny')` を呼ぶと取れる
  { id: 'shiny', name: 'いろちがいを みつけた', desc: 'めずらしい いろの なかまを みつけた', coins: 150, test: at('shiny', 1) },
]

// ================= 進捗と保存 =================
export type BookEvent =
  | { type: 'mission'; index: number; coins: number; text: string }
  | { type: 'allclear'; coins: number }
  | { type: 'streak'; streak: number; coins: number }
  | { type: 'badge'; id: string; name: string; coins: number }

const sane = (v: unknown, min: number, max: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : def)
const isKey = (v: unknown): v is string => typeof v === 'string' && KEY_RE.test(v) && !Number.isNaN(parseKey(v).getTime())

export class MissionBook {
  /** ミッションの日付（時計を戻されても「最後に見た日付」より前にはならない） */
  day = ''
  missions: Mission[] = []
  base: Stats = {}
  done: boolean[] = [false, false, false]
  allDone = false
  streak = 0
  lastClear = ''
  lastSeen = ''
  badges: Record<string, string> = {}
  /** 最後に見た季節（変わった時にお知らせする） */
  season = ''

  /** 日付が戻っていないか確かめて、今日のミッションに切り替える。1 秒ごとに呼ぶ */
  tick(now: Date, stats: Stats, g: Gauges): BookEvent[] {
    const ev: BookEvent[] = []
    const real = dateKey(now)
    // 端末の時計を戻しても二重に取れない：最後に見た日付より前なら、その日のまま（1 か月以上の差は端末を替えたとみなす）
    let day = real
    if (this.lastSeen && real < this.lastSeen) {
      if (dayDiff(real, this.lastSeen) <= 30) day = this.lastSeen
      else this.lastSeen = real
    }
    if (day > this.lastSeen) this.lastSeen = day
    if (day !== this.day || this.missions.length !== 3) {
      this.day = day
      this.missions = pickMissions(day, g)
      this.base = { ...stats }
      this.done = [false, false, false]
      this.allDone = false
    }
    // ミッションの達成
    this.missions.forEach((m, i) => {
      if (this.done[i] || this.progress(i, stats, g) < m.target) return
      this.done[i] = true
      const coins = DIFF_REWARD[m.diff]
      ev.push({ type: 'mission', index: i, coins, text: missionText(m) })
      // 連続日数：その日はじめて 1 つ達成した時に数える
      if (this.lastClear !== day) {
        this.streak = this.lastClear === yesterdayOf(day) ? this.streak + 1 : 1
        this.lastClear = day
        ev.push({ type: 'streak', streak: this.streak, coins: streakBonus(this.streak) })
      }
    })
    if (!this.allDone && this.done.every(Boolean)) {
      this.allDone = true
      ev.push({ type: 'allclear', coins: ALL_CLEAR_BONUS })
    }
    return ev
  }

  /** 実績を調べる（取ったものを返す） */
  checkBadges(stats: Stats, g: Gauges): BookEvent[] {
    const ev: BookEvent[] = []
    for (const a of ACHIEVEMENTS) {
      if (this.badges[a.id] || !a.test(stats, g)) continue
      this.badges[a.id] = this.day || '-'
      ev.push({ type: 'badge', id: a.id, name: a.name, coins: a.coins })
    }
    return ev
  }

  progress(i: number, stats: Stats, g: Gauges): number {
    const m = this.missions[i]
    if (!m) return 0
    if (this.done[i]) return m.target
    const t = TPL.get(m.tpl)
    if (!t) return 0
    const v = t.kind === 'count' ? (stats[t.key] ?? 0) - (this.base[t.key] ?? 0) : (g[t.key] ?? 0)
    return Math.max(0, Math.min(m.target, v))
  }

  toJSON() {
    return {
      day: this.day, missions: this.missions, base: this.base, done: this.done, allDone: this.allDone,
      streak: this.streak, lastClear: this.lastClear, lastSeen: this.lastSeen, badges: this.badges, season: this.season,
    }
  }

  /** セーブデータ・読み込んだコードは信用しない：形と範囲を検査して取り込む */
  static from(raw: unknown): MissionBook {
    const b = new MissionBook()
    if (!raw || typeof raw !== 'object') return b
    const d = raw as Record<string, unknown>
    if (isKey(d.lastSeen)) b.lastSeen = d.lastSeen
    if (isKey(d.lastClear)) b.lastClear = d.lastClear
    b.streak = sane(d.streak, 0, 9999, 0)
    if (isSeason(d.season)) b.season = d.season
    if (d.badges && typeof d.badges === 'object' && !Array.isArray(d.badges)) {
      for (const a of ACHIEVEMENTS) {
        const v = (d.badges as Record<string, unknown>)[a.id]
        if (typeof v === 'string') b.badges[a.id] = v.slice(0, 10)
      }
    }
    if (isKey(d.day) && Array.isArray(d.missions) && d.missions.length === 3 && Array.isArray(d.done)) {
      const ms: Mission[] = []
      for (const m of d.missions as Record<string, unknown>[]) {
        const t = m && typeof m.tpl === 'string' ? TPL.get(m.tpl) : undefined
        const diff = m ? sane(m.diff, 0, 2, -1) : -1
        if (!t || diff < 0 || t.n[diff as Diff] <= 0) break
        ms.push({ tpl: t.id, diff: diff as Diff, target: t.n[diff as Diff] })
      }
      if (ms.length === 3) {
        b.day = d.day
        b.missions = ms
        b.done = [0, 1, 2].map((i) => (d.done as unknown[])[i] === true)
        b.allDone = b.done.every(Boolean) && d.allDone === true
        if (d.base && typeof d.base === 'object' && !Array.isArray(d.base))
          for (const [k, v] of Object.entries(d.base)) if (STAT_KEY.test(k)) b.base[k] = sane(v, 0, 1e9, 0)
        if (b.day > b.lastSeen) b.lastSeen = b.day
      }
    }
    return b
  }
}

/** セーブから通算の数を取り込む（キーの形と数の範囲を検査） */
export function sanitizeStats(raw: unknown): Stats {
  const out: Stats = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  let n = 0
  for (const [k, v] of Object.entries(raw)) {
    if (!STAT_KEY.test(k) || n >= 80) continue
    out[k] = sane(v, 0, 1e9, 0)
    n++
  }
  return out
}
