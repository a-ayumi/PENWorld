/**
 * にっき：箱庭の出来事の記録・ペットの日記・仲間からの手紙・おかえりレポートの文章。
 * World の `say()` の文を `note()` が受け取り、パターンで分類して 200 件まで残す（新しい物が前）。
 * 画面（DOM）は journalui.ts。ここは文章と保存だけ（DOM を触らない）。
 * 保存先は localStorage の `pulsar-journal-v1`（lastSeen も一緒に入る）。読み込み時は型・長さ・件数を検査する。
 */

export const JOURNAL_KEY = 'pulsar-journal-v1'

export type Kind =
  | 'evolve' | 'egg' | 'grow' | 'friend' | 'house' | 'build' | 'raid' | 'army' | 'boss'
  | 'dex' | 'role' | 'gen' | 'land' | 'village' | 'secret' | 'away'
export const KIND_LABEL: Record<Kind, string> = {
  evolve: 'しんか', egg: 'たまご', grow: 'せいちょう', friend: 'なかま', house: 'いえ', build: 'たてもの', raid: 'ひがい', army: 'てきぐん', boss: 'ボス',
  dex: 'ずかん', role: 'やくわり', gen: 'せだい', land: 'かいたく', village: 'むら', secret: 'ひみつ', away: 'るすばん',
}
export const KIND_COLOR: Record<Kind, string> = {
  evolve: '#c9a8ff', egg: '#ffe9a8', grow: '#9be28a', friend: '#ff9ecb', house: '#f2b134', build: '#f2b134', raid: '#ff7a5a', army: '#ff7a5a', boss: '#ff7a5a',
  dex: '#7fd1ff', role: '#9be28a', gen: '#d8c8ff', land: '#7fd1ff', village: '#ffd23f', secret: '#ff9ecb', away: '#f3ead8',
}
const KINDS = Object.keys(KIND_LABEL) as Kind[]
const isKind = (v: unknown): v is Kind => typeof v === 'string' && (KINDS as string[]).includes(v)

export type Care3 = 'power' | 'guard' | 'spirit'
/** World から受け取る「いまの様子」。日記の材料と、おかえりレポートの前後の差に使う */
export interface Facts {
  coins: number
  gen: number
  pet: string
  family: string
  care: Care3
  weather: string
  houses: number
  structs: number
  children: number
  friends: number
  friendNames: string[]
  dex: number
  vName: string
  vLv: number
  lineage: string[]
}

export interface Entry { t: number; k: Kind; s: string }
export interface Letter { t: number; k: Kind; from: string; s: string; n: boolean }
export interface Diary { t: number; d: number; s: string; n: boolean }
interface Tally {
  d: number; sec: number; wrote: boolean
  ate: Record<string, number>; foe: Record<string, number>
  wins: number; fights: number; trains: number; played: number; hauled: number
  houses: number; structs: number; hatched: number; armies: number; bosses: number; dex: number
  evo: string[]; friends: string[]; weather: Record<string, number>
}

export const MAX_ENTRIES = 200
export const MAX_LETTERS = 40
export const MAX_DIARIES = 60
const MAX_NAMES = 10

// ---------------- 日付 ----------------
/** 端末の日付を 20261105 のような数にする */
export const dayOf = (ms: number) => {
  const d = new Date(ms)
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}
export const dayLabel = (key: number, nowMs = Date.now()) => {
  const m = Math.floor(key / 100) % 100
  const d = key % 100
  const base = `${m}がつ${d}にち`
  const today = dayOf(nowMs)
  if (key === today) return `きょう（${base}）`
  if (key === dayOf(nowMs - 86400000)) return `きのう（${base}）`
  return base
}
export const clockLabel = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
/** 「2じかん 15ふん」のような長さの言い方 */
export const spanLabel = (sec: number) => {
  const m = Math.max(1, Math.round(sec / 60))
  const h = Math.floor(m / 60)
  const mm = m % 60
  if (h === 0) return `${mm}ふん`
  return mm === 0 ? `${h}じかん` : `${h}じかん ${mm}ふん`
}
const cnt = (n: number) => ['', 'ひとつ', 'ふたつ', 'みっつ', 'よっつ', 'いつつ'][n] ?? `${n}こ`

// ---------------- 保存データの検査 ----------------
const num = (v: unknown, min: number, max: number, def = min) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def)
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
const strs = (v: unknown, max: number, len: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max).map((x) => x.slice(0, len)) : [])
const counts = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {}
  if (v && typeof v === 'object' && !Array.isArray(v))
    for (const [k, n] of Object.entries(v).slice(0, MAX_NAMES)) out[k.slice(0, 16)] = Math.round(num(n, 0, 9999, 0))
  return out
}
const blankTally = (d: number): Tally => ({
  d, sec: 0, wrote: false, ate: {}, foe: {}, wins: 0, fights: 0, trains: 0, played: 0, hauled: 0,
  houses: 0, structs: 0, hatched: 0, armies: 0, bosses: 0, dex: 0, evo: [], friends: [], weather: {},
})
const readTally = (v: unknown, today: number): Tally => {
  if (!v || typeof v !== 'object') return blankTally(today)
  const o = v as Record<string, unknown>
  const t = blankTally(Math.round(num(o.d, 20200101, 20991231, today)))
  t.sec = num(o.sec, 0, 1e7, 0)
  t.wrote = o.wrote === true
  t.ate = counts(o.ate)
  t.foe = counts(o.foe)
  for (const k of ['wins', 'fights', 'trains', 'played', 'hauled', 'houses', 'structs', 'hatched', 'armies', 'bosses', 'dex'] as const) t[k] = Math.round(num(o[k], 0, 99999, 0))
  t.evo = strs(o.evo, 6, 16)
  t.friends = strs(o.friends, 6, 16)
  t.weather = counts(o.weather)
  return t
}

// ---------------- 日記・手紙の文章 ----------------
type Voice = { me: string; cry: string }
const VOICE: Record<string, Voice> = {
  plain: { me: 'ぼく', cry: 'むにゃ。' },
  machine: { me: 'わたし', cry: 'ピピッ。' },
  dragon: { me: 'ぼく', cry: 'がう。' },
  cat: { me: 'わたし', cry: 'にゃ〜。' },
  dog: { me: 'ぼく', cry: 'わん！' },
  bird: { me: 'あたし', cry: 'ぴよぴよ。' },
  water: { me: 'ぼく', cry: 'ぷくぷく。' },
  monster: { me: 'わたし', cry: 'ぐるる…' },
}
const OPEN: Record<string, string[]> = {
  sun: ['きょうは はれだった。', 'おひさまが ぽかぽかの いちにち。', 'いい てんきで、そらが きれいだった。', 'はれていたから、ひなたぼっこ したくなった。'],
  cloud: ['きょうは くもり。', 'くもが おおくて、すこし しずかな ひ。', 'そらが しろくて、のんびり した。'],
  rain: ['きょうは あめだった。', 'あめの おとを ききながら すごした。', 'しとしと ふる ひ。 ぬれないように した。'],
  snow: ['きょうは ゆきが ふった。', 'ゆきで まっしろな いちにち。', 'さむかったけど、ゆきが きれいだった。'],
  ember: ['きょうは ひのこが まっていた。', 'ひのこが ちらちら。 あつい ひだった。'],
}
const CLOSE: Record<Care3 | 'any', string[]> = {
  power: ['もっと つよく なりたいな。', 'あしたも きたえよう。', 'うでが なるよ。 あしたも がんばる。'],
  guard: ['みんなを まもれる ように なりたい。', 'あしたも ぶじで ありますように。', 'ここは わたしたちの ばしょ。 ずっと まもるよ。'],
  spirit: ['みんなが なかよしで うれしい。', 'あしたは なにが あるかな。', 'こころが ぽかぽか する。'],
  any: ['つかれたけど たのしかった。', 'おやすみなさい。', 'あしたも いい ひに なりますように。', 'ほしが きれいだった。', 'ぐっすり ねむれそう。'],
}
const QUIET = ['とくに なにも なかったけど、のんびり できた。', 'ぼーっと そらを みていた。 それも わるくない。', 'しずかな ひ。 ねむくなるまで ごろごろ した。', 'なにも しない ぜいたくを あじわった。']

/** いちばん多いキー */
const top = (r: Record<string, number>) => Object.entries(r).sort((a, b) => b[1] - a[1])[0]

export class Journal {
  entries: Entry[] = []
  letters: Letter[] = []
  diaries: Diary[] = []
  tally: Tally
  /** 最後にアプリを見ていた時刻（ms）。おかえりレポートの元 */
  lastSeen = 0
  /** 留守の早送り中は、出来事の時刻をここに合わせる */
  clock: number | null = null
  /** 早送り中は保存しない（途中で閉じても、もう一度おかえりを数えられるように） */
  busy = false
  facts: () => Facts | null = () => null
  onChange: () => void = () => {}
  private rec: Record<string, number> = {}
  private letterAt: Record<string, number> = {}
  private lastLetter = 0
  private nightPending = false

  constructor() {
    this.tally = blankTally(dayOf(Date.now()))
    this.load()
  }

  now() {
    return this.clock ?? Date.now()
  }
  get unread() {
    return this.letters.filter((l) => l.n).length + this.diaries.filter((d) => d.n).length
  }
  get unreadLetters() {
    return this.letters.filter((l) => l.n).length
  }

  // ---------------- 保存 ----------------
  save() {
    if (this.busy) return
    this.lastSeen = Date.now()
    try {
      localStorage.setItem(JOURNAL_KEY, JSON.stringify({ v: 1, lastSeen: this.lastSeen, entries: this.entries, letters: this.letters, diaries: this.diaries, tally: this.tally, rec: this.rec }))
    } catch {
      /* noop */
    }
  }
  private load() {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(JOURNAL_KEY)
    } catch {
      return
    }
    if (!raw || raw.length > 600_000) return
    try {
      const d = JSON.parse(raw)
      if (!d || typeof d !== 'object') return
      this.lastSeen = num(d.lastSeen, 0, 1e14, 0)
      this.entries = (Array.isArray(d.entries) ? d.entries : [])
        .filter((e: Entry) => e && isKind(e.k) && typeof e.s === 'string')
        .slice(0, MAX_ENTRIES)
        .map((e: Entry) => ({ t: num(e.t, 0, 1e14, 0), k: e.k, s: e.s.slice(0, 120) }))
      this.letters = (Array.isArray(d.letters) ? d.letters : [])
        .filter((l: Letter) => l && typeof l.s === 'string')
        .slice(0, MAX_LETTERS)
        .map((l: Letter) => ({ t: num(l.t, 0, 1e14, 0), k: isKind(l.k) ? l.k : 'friend', from: str(l.from, 16), s: l.s.slice(0, 240), n: l.n === true }))
      this.diaries = (Array.isArray(d.diaries) ? d.diaries : [])
        .filter((x: Diary) => x && typeof x.s === 'string')
        .slice(0, MAX_DIARIES)
        .map((x: Diary) => ({ t: num(x.t, 0, 1e14, 0), d: Math.round(num(x.d, 20200101, 20991231, 20200101)), s: x.s.slice(0, 300), n: x.n === true }))
      this.tally = readTally(d.tally, dayOf(Date.now()))
      if (d.rec && typeof d.rec === 'object' && !Array.isArray(d.rec)) for (const [k, v] of Object.entries(d.rec).slice(0, 40)) this.rec[k.slice(0, 16)] = Math.round(num(v, 0, 99, 0))
    } catch {
      /* 壊れていたら空から */
    }
  }
  /** 全部消す（最初からやり直す時） */
  static clear() {
    try {
      localStorage.removeItem(JOURNAL_KEY)
    } catch {
      /* noop */
    }
  }

  // ---------------- 出来事を受け取る ----------------
  /** World の say() の文。意味のある物だけ にっき に残し、日記の材料も数える */
  note(text: string) {
    let m: RegExpMatchArray | null
    const t = this.tally
    const f = this.facts()
    let kind: Kind | null = null

    // ---- 材料だけ数える（にっき には残さない）----
    if ((m = text.match(/^(.+?)は (.+?)を たべた！/))) bump(t.ate, m[2])
    else if ((m = text.match(/^(.+?)と (?:じゃれあい)?バトル！/))) {
      t.fights++
      if (!text.includes('じゃれあい')) bump(t.foe, m[1])
    } else if (/の かち！/.test(text) && !text.includes('じゃれあい')) t.wins++
    else if (text.startsWith('トレーニング おわり')) t.trains++
    else if (text.includes('たくさん あそんだ')) t.played++
    else if (text.includes('しざいを はこんだ') && !text.includes('かんせい')) t.hauled++
    else if (text.includes('ライトを けした')) this.nightPending = true

    // ---- にっき に残す物 ----
    if ((m = text.match(/^(.+?)は (.+?)に しんかした！/))) {
      kind = 'evolve'
      pushName(t.evo, m[2])
      this.letter('evolve', m[2], 0.7, [
        `${m[2]}です。 しんかできたのは、まいにち みまもって くれたから。 ありがとう！`,
        `からだが かわったよ。 ${m[2]}に なれて うれしい。 これからも よろしくね。`,
        `ひかりに つつまれて ${m[2]}に なったんだ。 いっしょに いてくれて ありがとう。`,
        `${m[1]}だった ころの ことも、ちゃんと おぼえているよ。 ${m[2]}より。`,
      ])
    } else if (/たまごが ひかり/.test(text)) {
      kind = 'gen'
      const g = text.match(/^たまごが ひかり (.+?)が うまれた！ だい(\d+)せだい/)
      if (g) {
        const old = f?.lineage[f.lineage.length - 1] ?? 'まえの こ'
        this.letter('gen', g[1], 1, [
          `はじめまして、だい${g[2]}せだいの ${g[1]}です。 ${old}の ことは ちゃんと おぼえているよ。 いえも なかまも、だいじに するね。`,
          `${old}から バトンを うけとった ${g[1]}です（だい${g[2]}せだい）。 また いちから、いっしょに あそんでね。`,
          `たまごから うまれたよ！ ぼく（わたし）は ${g[1]}。 ${old}が のこした むらを まもっていくよ。`,
        ])
      }
    } else if (/ねんれい|としを とった|やすらかに/.test(text)) kind = 'gen'
    else if (/てきぐんを おいはらった/.test(text)) {
      kind = 'army'
      t.armies++
      this.letter('army', f?.pet ?? 'ペット', 0.6, [
        'てきぐんを おいはらえたのは、みんなが いたから。 そして きみが みていて くれたから。 ありがとう！',
        'こわかったけど、みんなで まもれたよ。 むらは ぶじです。',
      ])
    } else if (/てきぐん/.test(text)) kind = 'army'
    else if (/ボス|ヤミカゲが あらわれた/.test(text)) {
      kind = 'boss'
      if (/ボスもいる/.test(text)) t.bosses++
    } else if (/(ひみつ|いろちがい|色ちがい|めずらしい)/.test(text)) {
      kind = 'secret'
      this.letter('secret', f?.pet ?? 'ペット', 1, ['すごいものを みつけたよ！ ひみつだよ。 ほかの みんなには ないしょにしてね。', 'めずらしい ものを みつけた！ いちばんに きみに おしえたかったんだ。'])
    } else if (/たまご/.test(text) && !/おいた|どけた|たりない|おけない/.test(text)) {
      kind = 'egg'
      if (/うまれた/.test(text)) t.hatched++
    } else if (/おとなに なった/.test(text)) kind = 'grow'
    else if ((m = text.match(/^(.+?)が なかまに なった！/))) {
      kind = 'friend'
      pushName(t.friends, m[1])
      this.letter('friend', m[1], 0.4, [`なかまに いれてくれて ありがとう。 ${m[1]}です。 よろしくね！`, `${m[1]}だよ。 ここは あたたかくて すき。 ずっと いても いい？`])
    } else if ((m = text.match(/^(.+?)の いえが (かんせい|ぞうちくされた)！/))) {
      kind = 'house'
      t.houses++
      this.letter('house', m[1], 0.5, [
        `いえが できたよ！ ${m[1]}より。 ちかくに きたら よってね。`,
        `あたらしい おうちで ぐっすり ねむれそう。 ありがとう。 ${m[1]}`,
        `かべも やねも ぴかぴか！ ${m[1]}の いえに あそびに きてね。`,
      ])
    } else if (/いえ/.test(text) && /かべが できた|どだいが できた|たてはじめた|ぞうちく/.test(text) && !/かいたい/.test(text)) kind = 'house'
    else if (/こわされ|おそわれ|こわれかけ|おちてしまった/.test(text)) kind = 'raid'
    else if (/かんせいさせた|おしろが かんせい/.test(text)) {
      kind = 'build'
      t.structs++
    } else if (text.includes('ずかん')) {
      kind = 'dex'
      if ((m = text.match(/ずかん (\d+)しゅ たっせい/))) {
        t.dex++
        this.letter('dex', f?.pet ?? 'ペット', 0.6, [`ずかんが ${m[1]}しゅに なったね。 こんなに いろんな なかまが いるなんて、すてき！`])
      } else t.dex++
    } else if (/(だいく|はたけがかり|みはり)に なった$/.test(text)) kind = 'role'
    else if (/ひろがった/.test(text)) {
      kind = 'land'
      this.letter('land', f?.pet ?? 'ペット', 0.6, ['はこにわが ひろくなったね！ はしって みたくて うずうずしてる。', 'ひろくなって うれしい！ あたらしい ばしょを たんけん してくるね。'])
    } else if (/(むら|まち|じょうかまち)(が|に)/.test(text) && /(うまれた|はったつ|さかえて)/.test(text)) {
      kind = 'village'
      this.letter('village', f?.pet ?? 'ペット', 0.6, [`${f?.vName ?? 'むら'}が にぎやかに なってきたよ。 みんな しあわせそう。`])
    }
    if (kind) this.add(kind, text)
  }

  private add(k: Kind, s: string) {
    const t = this.now()
    const last = this.entries[0]
    if (last && last.s === s && t - last.t < 60_000) return
    this.entries.unshift({ t, k, s: s.slice(0, 120) })
    if (this.entries.length > MAX_ENTRIES) this.entries.length = MAX_ENTRIES
    this.onChange()
  }
  /** 外から出来事を足す（おかえりレポートなど） */
  addEntry(k: Kind, s: string) {
    this.add(k, s)
  }

  // ---------------- 手紙 ----------------
  /** 条件つきで手紙を届ける。同じ種類は 90 秒あけ、全体でも 30 秒あける */
  private letter(kind: Kind, from: string, chance: number, texts: string[]) {
    const now = this.now()
    if (now - (this.letterAt[kind] ?? 0) < 90_000 || now - this.lastLetter < 30_000) return
    if (Math.random() > chance) return
    const s = texts[this.pick(`L${kind}`, texts.length)]
    this.letterAt[kind] = this.lastLetter = now
    this.letters.unshift({ t: now, k: kind, from: from.slice(0, 16), s, n: true })
    if (this.letters.length > MAX_LETTERS) this.letters.length = MAX_LETTERS
    this.onChange()
  }

  /** 前回と同じ番号を避けて選ぶ */
  private pick(pool: string, n: number) {
    if (n <= 1) return 0
    let i = Math.floor(Math.random() * n)
    if (i === (this.rec[pool] ?? -1)) i = (i + 1 + Math.floor(Math.random() * (n - 1))) % n
    this.rec[pool.slice(0, 16)] = i
    return i
  }

  // ---------------- 日記 ----------------
  /** 1 秒ごとに呼ぶ。日が変わった時・夜になった時（19 時以降 / ライトを消した時）に日記を書く */
  tick(dt: number) {
    const now = Date.now()
    const today = dayOf(now)
    const f = this.facts()
    if (this.tally.d !== today) {
      if (!this.tally.wrote && this.tally.sec >= 60) this.writeDiary(this.tally, f, this.tally.d)
      this.tally = blankTally(today)
    }
    const t = this.tally
    t.sec += dt
    if (f && dt > 0) bump(t.weather, f.weather, Math.max(1, Math.round(dt)))
    const evening = new Date(now).getHours() >= 19
    if (!t.wrote && t.sec >= 120 && (evening || this.nightPending)) this.writeDiary(t, f, t.d)
    this.nightPending = false
  }

  private writeDiary(t: Tally, f: Facts | null, d: number) {
    t.wrote = true
    const s = this.compose(t, f)
    this.diaries.unshift({ t: Date.now(), d, s, n: true })
    if (this.diaries.length > MAX_DIARIES) this.diaries.length = MAX_DIARIES
    this.onChange()
    this.save()
  }

  /** その日の材料から 1〜3 行の日記を組み立てる（言い回しは前回と重ならないように選ぶ） */
  compose(t: Tally, f: Facts | null): string {
    const fam = f?.family ?? 'plain'
    const v = VOICE[fam] ?? VOICE.plain
    const care = f?.care ?? 'spirit'
    const wthr = top(t.weather)?.[0] ?? f?.weather ?? 'sun'
    const friend = t.friends[0] ?? f?.friendNames[0]
    const withF = friend ? `${friend}と いっしょに ` : ''
    const P = (id: string, list: string[]) => list[this.pick(id, list.length)]

    const hs: string[] = []
    if (t.houses > 0)
      hs.push(P('dh', [`${withF}いえを ${cnt(t.houses)} たてた。`, `いえが ${cnt(t.houses)} できた。 みんなで がんばった。`, `トントン トントン。 いえづくりが たのしかった。`]))
    else if (t.hauled > 0) hs.push(P('dw', ['しざいを たくさん はこんだ。 いえの ざいりょうが あつまってきた。', `${v.me}は はこびやさん。 きを かかえて あっちへ こっちへ。`]))
    if (t.structs > 0) hs.push(P('ds', ['むらに あたらしい たてものが できた。', 'たてものが かんせいした！ みんなで ばんざいした。']))
    const evo = t.evo[t.evo.length - 1]
    if (evo) hs.push(P('de', [`${evo}に しんかした！ からだが ふしぎな かんじ。`, `ひかって、${evo}に なった。 みんなが おどろいていた。`]))
    if (t.hatched > 0) hs.push(P('dg', ['たまごが かえった。 あたらしい なかまが ふえた！', 'ちいさな いのちが うまれた。 だいじに そだてよう。']))
    if (t.armies > 0) hs.push(P('da', ['てきぐんが きた。 みんなで まもった。', 'おおきな てきぐんが せめてきた。 こわかったけど、にげなかった。']))
    const newF = t.friends[0]
    if (newF) hs.push(P('df', [`${newF}が なかまに なった。 うれしい。`, `あたらしい ともだち、${newF}。 なかよく したいな。`]))
    const ate = top(t.ate)
    if (ate) hs.push(P('dt', [`${ate[0]}を もぐもぐ たべた。 おいしかった。`, `ごはんは ${ate[0]}。 おなかが いっぱいに なった。`, `${ate[0]}を ${ate[1] > 2 ? 'なんども ' : ''}たべた。 しあわせ。`]))
    const foe = top(t.foe)
    if (foe) hs.push(P('dx', [`${foe[0]}と たたかった。 ${t.wins > 0 ? 'かてた！' : 'まけないぞ。'}`, `${foe[0]}が きたから バトル。 どきどき した。`, `${foe[0]}は つよかった。 でも ${v.me}も がんばった。`]))
    if (t.trains > 0) hs.push(P('dr', ['トレーニングを がんばった。 すこし つよくなった きがする。', 'からだを うごかした。 ぽかぽか して きもちいい。']))
    if (t.played > 0) hs.push(P('dp', ['いっぱい あそんだ。 たのしかった。', 'みんなと おいかけっこ。 わらいっぱなし。']))
    if (t.dex > 0) hs.push(P('dd', ['ずかんに あたらしい なかまが のった。']))

    const lines: string[] = []
    const open = P(`o${wthr}`, OPEN[wthr] ?? OPEN.sun)
    if (!hs.length) lines.push(open, P('dq', QUIET))
    else {
      // 材料が多い日は 天気の一行を省いて、できごとを 2 つ書く
      if (hs.length < 2 || Math.random() < 0.7) lines.push(open)
      lines.push(hs[0])
      if (hs[1] && (lines.length < 3 && (hs.length > 2 || Math.random() < 0.5))) lines.push(hs[1])
    }
    if (lines.length < 3 || Math.random() < 0.2) {
      let close = P('dc', Math.random() < 0.45 ? CLOSE[care] : CLOSE.any)
      if (Math.random() < 0.4) close += ` ${v.cry}`
      lines.push(close)
    }
    return lines.slice(0, 3).join('\n')
  }

  /** 気持ちの確認用：材料なしで、いまの様子から 1 つ書く（テスト用） */
  debugCompose() {
    return this.compose(this.tally, this.facts())
  }

  // ---------------- おみやげ・レポート ----------------
  markAllRead() {
    for (const l of this.letters) l.n = false
    for (const d of this.diaries) d.n = false
    this.onChange()
  }
}

const bump = (r: Record<string, number>, k: string, n = 1) => {
  const key = k.slice(0, 16)
  if (key in r) r[key] += n
  else if (Object.keys(r).length < MAX_NAMES) r[key] = n
}
const pushName = (a: string[], n: string) => {
  if (!a.includes(n)) a.push(n.slice(0, 16))
  if (a.length > 6) a.shift()
}

// ---------------- おかえりレポート ----------------
export interface Report {
  title: string
  lines: string[]
  gift: number
}
export const MIN_AWAY = 5 * 60
export const MAX_AWAY = 8 * 3600

/** おみやげ：留守が長いほど多いが、85 まで */
export const giftFor = (sec: number) => Math.min(85, 5 + Math.floor((Math.min(sec, MAX_AWAY) / 3600) * 10))

/** 前後の World の状態の差と、留守のあいだの出来事から、レポートを作る */
export function buildReport(before: Facts, after: Facts, awaySec: number, since: Entry[], letters: number): Report {
  const lines: string[] = []
  const dh = after.houses - before.houses
  if (dh > 0) lines.push(`いえが ${dh}けん できたよ`)
  const ds = after.structs - before.structs
  if (ds > 0) lines.push(`たてものが ${ds}つ かんせいしたよ`)
  const dc = after.children - before.children
  if (dc > 0) lines.push(`たまごが ${dc}こ かえったよ`)
  const df = after.friends - before.friends
  if (df > 0) lines.push(`なかまが ${df}ひき ふえたよ`)
  const dd = after.dex - before.dex
  if (dd > 0) lines.push(`ずかんに ${dd}しゅ ふえたよ`)
  const evos = since.filter((e) => e.k === 'evolve').slice(0, 3).reverse()
  for (const e of evos) lines.push(e.s.replace(/！$/, ''))
  const armies = since.filter((e) => e.k === 'army' && e.s.includes('おいはらった')).length
  if (armies > 0) lines.push(`てきぐんを ${armies}かい おいはらったよ`)
  if (after.vLv > before.vLv) lines.push(`${after.vName}に なったよ`)
  if (after.gen > before.gen) lines.push(`だい${after.gen}せだいに なったよ`)
  const coins = after.coins - before.coins
  if (coins > 0) lines.push(`コイン +${coins}`)
  if (letters > 0) lines.push(`てがみが ${letters}つう とどいているよ`)
  if (!lines.length) lines.push('みんな のんびり すごしていたよ')
  return { title: `おかえり！ ${spanLabel(awaySec)} ぶりだね`, lines, gift: giftFor(awaySec) }
}
