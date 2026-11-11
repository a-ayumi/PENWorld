/**
 * BGM エンジン：WebAudio で曲を作りながら鳴らす（音声ファイルは使わない）。
 * - 曲はすべてオリジナル。メロディは「音階の何番目か」で書き、ステージごとの調・音階・音色に当てはめる。
 * - audioContext.currentTime ベースの先読み（毎フレーム update() を呼ぶと、少し先の音までスケジュールする）。
 * - 場面（昼 / 夕 / 夜・天気・敵軍・村の大きさ）が変わると、曲をクロスフェードで切り替える。
 */

/** World.musicState() が返す、曲を決めるための場面 */
export interface MusicState {
  /** 夜の度合い 0〜1（0.5 を超えると夜の曲） */
  night: number
  /** 'sun' | 'cloud' | 'rain' | 'snow' | 'ember'（知らない値は はれ あつかい） */
  weather: string
  /** ステージ番号（知らない番号は 0 番の設定） */
  stage: number
  /** 敵軍：0 = いない / 1 = 近づいている（予告） / 2 = 攻めてきている */
  army: number
  /** 村のレベル：0 むら前 / 1 むら / 2 まち / 3 じょうかまち */
  villageLv: number
  /** 夕方の時間帯（机の上の雰囲気。World ではなく本体側が決める） */
  evening?: boolean
}

export type JingleKind = 'fanfare' | 'rebirth'

// ---------------------------------------------------------------- 音階・ステージ
const SCALES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
} as const
type ScaleName = keyof typeof SCALES

type LeadStyle = 'pulse50' | 'pulse25' | 'pulse125' | 'pluck' | 'tri' | 'bell'
type ArpWave = 'pulse25' | 'tri' | 'bell'

interface StageMusic {
  /** 主音（C からの半音の数） */
  root: number
  scale: ScaleName
  /** 昼の主旋律の音色 */
  lead: LeadStyle
  /** テンポの倍率 */
  tempo: number
  arp: ArpWave
}

/**
 * ステージ番号 → 曲の設定。ステージを足す時はここに 1 行足す。
 * 表にない番号は 0 番（はじまりの森）の設定になる。
 */
export const STAGE_MUSIC: Record<number, StageMusic> = {
  0: { root: 0, scale: 'ionian', lead: 'pulse50', tempo: 1, arp: 'pulse25' }, // はじまりの森
  1: { root: 2, scale: 'mixolydian', lead: 'pluck', tempo: 0.94, arp: 'pulse25' }, // ガラスの砂丘
  2: { root: 5, scale: 'lydian', lead: 'tri', tempo: 0.9, arp: 'bell' }, // さんごの入り江
  3: { root: 7, scale: 'ionian', lead: 'bell', tempo: 0.84, arp: 'bell' }, // わたゆきの原
  4: { root: 9, scale: 'dorian', lead: 'pulse125', tempo: 1.06, arp: 'pulse25' }, // こおりの回路峰
}
const stageMusic = (i: number): StageMusic => STAGE_MUSIC[Number.isInteger(i) ? i : 0] ?? STAGE_MUSIC[0]
const stageKey = (i: number) => (Number.isInteger(i) && STAGE_MUSIC[i] ? i : 0)

type WeatherKind = 'sun' | 'rain' | 'snow' | 'ember'
const weatherKind = (w: string): WeatherKind => (w === 'rain' || w === 'snow' || w === 'ember' ? w : 'sun')
const WEATHER_TEMPO: Record<WeatherKind, number> = { sun: 1, rain: 0.9, snow: 0.8, ember: 1 }

// ---------------------------------------------------------------- 曲のデータ
type SongKind = 'day' | 'evening' | 'night' | 'tense' | 'fanfare' | 'rebirth'

interface SongDef {
  kind: SongKind
  bpm: number
  bars: number
  loop: boolean
  /** 各小節のコード（音階の何番目を根音にするか） */
  chords: number[]
  /**
   * 主旋律。1 小節 = 8 文字（8 分音符）か 16 文字（16 分音符）。
   * 0〜9 = 音階の番号（0 が主音、7 で 1 オクターブ上）、a〜h = 10〜17、A〜G = 低い方 -1〜-7、
   * '-' = のばす、'.' = 休み
   */
  melody: string[]
  /** 16 分音符ごと：コードの何番目の音か（0 根音 / 1 3度 / 2 5度 / 3 1オクターブ上）。-1 = 休み */
  bass: number[]
  arp: number[]
  kick: number[]
  snare: number[]
  hat: number[]
  /** 音の長さの割合（小さいほどスタッカート） */
  gate: number
  leadOct: number
  arpOct: number
  padOct: number
  bassOct: number
  scale?: ScaleName
  leadStyle?: LeadStyle
}

const R16 = (...v: number[]) => v
const SONGS: Record<SongKind, SongDef> = {
  // のどかな昼：弾むベースとアルペジオ
  day: {
    kind: 'day', bpm: 104, bars: 8, loop: true,
    chords: [0, 5, 3, 4, 0, 3, 1, 4],
    melody: ['24542-0-', '0-245-4-', '5-7-5-4-', '6-4-1-2-', '2457-6-5', '5-4-3-4-', '5-3-1-3-', '4-2-1-0-'],
    bass: R16(0, -1, -1, -1, 2, -1, -1, -1, 0, -1, -1, -1, 2, -1, 3, -1),
    arp: R16(-1, 0, -1, 1, -1, 2, -1, 1, -1, 0, -1, 1, -1, 2, -1, 3),
    kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14],
    gate: 0.88, leadOct: 7, arpOct: 0, padOct: 0, bassOct: -7,
  },
  // しっとりした夕方：やわらかい三角波とゆっくりの和音
  evening: {
    kind: 'evening', bpm: 76, bars: 8, loop: true,
    chords: [5, 3, 0, 4, 5, 1, 4, 5],
    melody: ['7--9-8-7', '5--7-9-8', '9-7-4-5-', '4--6-8-6', '7--9-b-9', '8--a-8-5', '6--8-6-4', '5-----..'],
    bass: R16(0, -1, -1, -1, -1, -1, -1, -1, 2, -1, -1, -1, -1, -1, -1, -1),
    arp: R16(0, -1, 1, -1, 2, -1, 1, -1, 0, -1, 1, -1, 2, -1, 3, -1),
    kick: [0], snare: [], hat: [4, 12],
    gate: 1, leadOct: 0, arpOct: -7, padOct: -7, bassOct: -14, leadStyle: 'tri',
  },
  // しずかな夜：オルゴールのような少ない音
  night: {
    kind: 'night', bpm: 56, bars: 8, loop: true,
    chords: [0, 4, 5, 3, 0, 4, 3, 0],
    melody: ['4---2---', '1---.-4-', '0---2-4-', '3---.---', '4---7---', '6---4-1-', '5---3---', '2---0---'],
    bass: R16(0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1),
    arp: R16(-1, -1, -1, -1, 1, -1, -1, -1, -1, -1, -1, -1, 2, -1, -1, -1),
    kick: [], snare: [], hat: [],
    gate: 1, leadOct: 7, arpOct: 7, padOct: 0, bassOct: -14, leadStyle: 'bell',
  },
  // 敵軍：短調で 8 分のベースが走る
  tense: {
    kind: 'tense', bpm: 140, bars: 8, loop: true,
    chords: [0, 0, 5, 6, 0, 0, 3, 4],
    melody: ['0-02-3-2', '0-02-5-4', '5-57-9-7', '6-68-a-8', '0-24-7-9', 'b-97-4-2', '3-35-7-5', '4-46-8-6'],
    bass: R16(0, -1, 0, -1, 0, -1, 0, -1, 0, -1, 0, -1, 2, -1, 3, -1),
    arp: R16(2, -1, 1, -1, 2, -1, 1, -1, 2, -1, 1, -1, 2, -1, 3, -1),
    kick: [0, 3, 8, 11], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14],
    gate: 0.58, leadOct: 0, arpOct: 7, padOct: -7, bassOct: -7, scale: 'aeolian', leadStyle: 'pulse25',
  },
  // 勝利のファンファーレ（4 小節・一度だけ）
  fanfare: {
    kind: 'fanfare', bpm: 128, bars: 4, loop: false,
    chords: [0, 3, 4, 0],
    melody: ['4-47-9-b', 'a-9-7-5-', '6-8-b-8-', '7-------'],
    bass: R16(0, -1, -1, -1, 2, -1, -1, -1, 0, -1, -1, -1, 2, -1, -1, -1),
    arp: R16(-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1),
    kick: [0, 8], snare: [4, 12], hat: [],
    gate: 0.95, leadOct: 7, arpOct: 7, padOct: 0, bassOct: -7, scale: 'ionian', leadStyle: 'pulse50',
  },
  // 世代交代（4 小節・一度だけ）：星がまたたくような鈴の音
  rebirth: {
    kind: 'rebirth', bpm: 66, bars: 4, loop: false,
    chords: [0, 4, 1, 0],
    melody: ['0-2-4-7-', '6-4-6-8-', '9-7-5-7-', '9---7---'],
    bass: R16(0, -1, -1, -1, -1, -1, -1, -1, 2, -1, -1, -1, -1, -1, -1, -1),
    arp: R16(0, -1, 1, -1, 2, -1, 3, -1, 0, -1, 1, -1, 2, -1, 3, -1),
    kick: [], snare: [], hat: [],
    gate: 1, leadOct: 7, arpOct: 7, padOct: 0, bassOct: -14, scale: 'lydian', leadStyle: 'bell',
  },
}

// ---------------------------------------------------------------- 楽譜の読み取り
interface Note {
  step: number
  len: number
  deg: number
}
function degOf(ch: string): number | null {
  if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48
  if (ch >= 'a' && ch <= 'h') return ch.charCodeAt(0) - 97 + 10
  if (ch >= 'A' && ch <= 'G') return -(ch.charCodeAt(0) - 64)
  return null
}
function parseBar(bar: string): Note[] {
  const unit = 16 / bar.length
  const out: Note[] = []
  let last: Note | null = null
  for (let i = 0; i < bar.length; i++) {
    const ch = bar[i]
    if (ch === '-') {
      if (last) last.len += unit
      continue
    }
    const d = degOf(ch)
    if (d === null) {
      last = null
      continue
    }
    last = { step: i * unit, len: unit, deg: d }
    out.push(last)
  }
  return out
}
const PARSED = new Map<SongKind, (Note | undefined)[][]>()
function parsedOf(kind: SongKind) {
  let p = PARSED.get(kind)
  if (!p) {
    p = SONGS[kind].melody.map((b) => {
      const arr: (Note | undefined)[] = new Array(16).fill(undefined)
      for (const n of parseBar(b)) arr[n.step] = n
      return arr
    })
    PARSED.set(kind, p)
  }
  return p
}
/** パターンの各位置から、次の音（か小節の終わり）までの長さ */
function runLens(pat: number[]) {
  return pat.map((v, i) => {
    if (v < 0) return 0
    let n = 1
    while (i + n < 16 && pat[i + n] < 0) n++
    return n
  })
}

// ---------------------------------------------------------------- 設定の組み立て
interface Cfg {
  root: number
  scale: readonly number[]
  tempo: number
  lead: LeadStyle
  arp: ArpWave
  wk: WeatherKind
  /** 全体の音量 */
  gain: number
}
const BASE_HZ = 261.6256
const rnd = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function pickSong(st: MusicState): { kind: SongKind; key: string } {
  const kind: SongKind = st.army > 0 ? 'tense' : st.night > 0.5 ? 'night' : st.evening ? 'evening' : 'day'
  const wk = kind === 'tense' ? 'sun' : weatherKind(st.weather)
  return { kind, key: `${kind}|${stageKey(st.stage)}|${wk}` }
}

function makeCfg(kind: SongKind, st: MusicState): Cfg {
  const sm = stageMusic(st.stage)
  const def = SONGS[kind]
  const wk: WeatherKind = kind === 'tense' || kind === 'fanfare' || kind === 'rebirth' ? 'sun' : weatherKind(st.weather)
  let lead: LeadStyle = kind === 'day' ? sm.lead : def.leadStyle ?? sm.lead
  let scale: ScaleName = def.scale ?? sm.scale
  let arp: ArpWave = kind === 'night' || kind === 'rebirth' ? 'bell' : kind === 'evening' ? 'tri' : sm.arp
  if (kind === 'tense') arp = 'pulse25'
  if (wk === 'rain' && (lead === 'pulse50' || lead === 'pulse25' || lead === 'pluck')) lead = 'tri'
  if (wk === 'snow') {
    lead = 'bell'
    arp = 'bell'
  }
  if (wk === 'ember') {
    lead = 'pulse125'
    scale = 'aeolian'
  }
  const tempoStage = kind === 'tense' ? 1 : kind === 'fanfare' || kind === 'rebirth' ? 1 : sm.tempo
  return {
    root: sm.root,
    scale: SCALES[scale],
    tempo: tempoStage * WEATHER_TEMPO[wk],
    lead,
    arp,
    wk,
    gain: wk === 'rain' ? 0.9 : 1,
  }
}

/** 実際に鳴らすテンポ（テスト・表示用） */
export function describeSong(st: MusicState): { kind: SongKind; key: string; bpm: number; bars: number } {
  const p = pickSong(st)
  const cfg = makeCfg(p.kind, st)
  const def = SONGS[p.kind]
  return { kind: p.kind, key: p.key, bpm: def.bpm * cfg.tempo, bars: def.bars }
}

interface Arr {
  lead: boolean
  counter: boolean
  arp: boolean
  arpGain: number
  pad: boolean
  bell: boolean
  kick: boolean
  snare: boolean
  hat: boolean
  /** 予告の間は軽くする */
  warn: boolean
}

function arrange(kind: SongKind, cfg: Cfg, st: MusicState): Arr {
  const lv = Math.max(0, Math.min(3, Math.round(Number.isFinite(st.villageLv) ? st.villageLv : 0)))
  let a: Arr
  switch (kind) {
    case 'day':
      a = { lead: true, counter: lv >= 2, arp: lv >= 1, arpGain: 1, pad: lv >= 3, bell: lv >= 3, kick: lv >= 1, snare: lv >= 3, hat: lv >= 2, warn: false }
      break
    case 'evening':
      a = { lead: true, counter: lv >= 2, arp: true, arpGain: 0.7, pad: true, bell: lv >= 3, kick: lv >= 2, snare: false, hat: lv >= 2, warn: false }
      break
    case 'night':
      a = { lead: true, counter: lv >= 2, arp: lv >= 1, arpGain: 0.8, pad: true, bell: lv >= 2, kick: false, snare: false, hat: false, warn: false }
      break
    case 'tense': {
      const warn = st.army === 1
      a = { lead: !warn, counter: lv >= 2 && !warn, arp: true, arpGain: warn ? 0.8 : 1, pad: lv >= 3, bell: lv >= 3 && !warn, kick: true, snare: !warn, hat: !warn, warn }
      break
    }
    case 'fanfare':
      a = { lead: true, counter: true, arp: false, arpGain: 1, pad: true, bell: true, kick: true, snare: true, hat: false, warn: false }
      break
    default:
      a = { lead: true, counter: false, arp: true, arpGain: 0.8, pad: true, bell: true, kick: false, snare: false, hat: false, warn: false }
  }
  if (kind === 'day' || kind === 'evening' || kind === 'night') {
    if (cfg.wk === 'rain') {
      a.kick = a.snare = false
    } else if (cfg.wk === 'snow') {
      a.kick = a.snare = a.hat = false
    } else if (cfg.wk === 'ember') {
      a.kick = true
    }
  }
  return a
}

// ---------------------------------------------------------------- 音階・和音の計算
const semis = (cfg: Cfg, d: number) => {
  const n = Math.floor(d / 7)
  return cfg.root + cfg.scale[d - 7 * n] + 12 * n
}
const freqDeg = (cfg: Cfg, d: number) => BASE_HZ * 2 ** (semis(cfg, d) / 12)
/** 三和音が「ぶつかる音（減三和音 / 増三和音）」にならないよう、5 度を半音だけなおす */
function chordAlt(cfg: Cfg, r: number) {
  const a = semis(cfg, r + 2) - semis(cfg, r)
  const b = semis(cfg, r + 4) - semis(cfg, r + 2)
  if (a === 3 && b === 3) return 1
  if (a === 4 && b === 4) return -1
  return 0
}
const TONES = [0, 2, 4, 7]
function chordFreq(cfg: Cfg, r: number, idx: number, oct: number) {
  const f = freqDeg(cfg, r + TONES[idx] + oct)
  return idx === 2 ? f * 2 ** (chordAlt(cfg, r) / 12) : f
}

// ---------------------------------------------------------------- プレイヤー（1 曲ぶんの演奏）
const LOOK_AHEAD = 0.9

class Player {
  readonly def: SongDef
  readonly cfg: Cfg
  readonly out: GainNode
  readonly stepDur: number
  readonly total: number
  next: number
  step = 0
  stopped = false
  scheduledAll = false
  endAt = 0
  killAt = 0
  private arr: Arr
  private readonly rng: () => number
  private readonly parsed: (Note | undefined)[][]
  private readonly bassLen: number[]
  private bed: { src: AudioBufferSourceNode; gain: GainNode } | null = null

  constructor(
    private readonly m: Music,
    readonly kind: SongKind,
    readonly key: string,
    st: MusicState,
    start: number,
    fade: number,
  ) {
    this.def = SONGS[kind]
    this.cfg = makeCfg(kind, st)
    this.arr = arrange(kind, this.cfg, st)
    this.stepDur = 60 / (this.def.bpm * this.cfg.tempo) / 4
    this.total = this.def.bars * 16
    this.next = start
    this.parsed = parsedOf(kind)
    this.bassLen = runLens(this.def.bass)
    this.rng = rnd(kind.length * 7919 + this.cfg.root * 31 + Math.round(start * 1000))
    const ctx = m.ctx
    this.out = ctx.createGain()
    this.out.gain.setValueAtTime(0, start)
    this.out.gain.linearRampToValueAtTime(this.cfg.gain, start + Math.max(0.01, fade))
    this.out.connect(m.bus)
    // 雨・雪の音の下地
    if (this.cfg.wk === 'rain' || this.cfg.wk === 'snow') {
      const src = ctx.createBufferSource()
      src.buffer = m.noiseBuf
      src.loop = true
      const f = ctx.createBiquadFilter()
      if (this.cfg.wk === 'rain') {
        f.type = 'bandpass'
        f.frequency.value = 3000
        f.Q.value = 0.4
      } else {
        f.type = 'lowpass'
        f.frequency.value = 520
      }
      const g = ctx.createGain()
      g.gain.value = 0.0001
      src.connect(f).connect(g).connect(this.out)
      src.start(start)
      this.bed = { src, gain: g }
    }
  }

  /** 曲の最後の音が鳴り終わったか（一度だけの曲用） */
  finished(now: number) {
    return !this.def.loop && this.scheduledAll && now > this.endAt
  }

  schedule(now: number, until: number, st: MusicState) {
    if (this.stopped) return
    // 処理が遅れて予定の時刻をすぎてしまった時は、今の時刻から続ける
    if (this.next < now - 0.12) this.next = now + 0.03
    while (this.next < until) {
      if (!this.def.loop && this.step >= this.total) {
        this.scheduledAll = true
        break
      }
      this.play(this.step, this.next, st)
      this.step++
      this.next += this.stepDur
      if (!this.def.loop && this.step >= this.total) {
        this.scheduledAll = true
        this.endAt = this.next + 1.6
        break
      }
    }
  }

  stop(now: number, fade: number) {
    this.stopped = true
    const g = this.out.gain
    g.cancelScheduledValues(now)
    g.setValueAtTime(g.value, now)
    g.linearRampToValueAtTime(0, now + fade)
    this.killAt = now + fade + 1.4
  }

  dispose() {
    try {
      this.bed?.src.stop()
    } catch {
      /* noop */
    }
    this.out.disconnect()
  }

  private play(step: number, t: number, st: MusicState) {
    const { def, cfg, m } = this
    const nb = def.bars
    const bar = Math.floor(step / 16) % nb
    const sp = step % 16
    const loop = Math.floor(step / (16 * nb))
    const sd = this.stepDur
    const chord = def.chords[bar]
    const out = this.out
    if (sp === 0) {
      this.arr = arrange(this.kind, cfg, st)
      // 雨・雪の下地：小節ごとに強さをゆらす
      if (this.bed) {
        const base = cfg.wk === 'rain' ? 0.032 : 0.02
        this.bed.gain.gain.linearRampToValueAtTime(base * (0.6 + this.rng() * 0.8), t + sd * 16)
      }
      if (this.arr.pad) {
        for (let i = 0; i < 3; i++) m.pad(out, chordFreq(cfg, chord, i, def.padOct), t, sd * 16, this.kind === 'night' ? 0.05 : 0.04)
      }
      // 燃える世界：低いうなり
      if (cfg.wk === 'ember' && bar % 2 === 0 && this.kind !== 'tense') {
        m.pad(out, chordFreq(cfg, chord, 0, -14), t, sd * 32, 0.07, 'sawtooth')
        m.pad(out, chordFreq(cfg, chord, 2, -14), t, sd * 32, 0.05, 'sawtooth')
      }
    }
    const a = this.arr
    const quiet = this.kind === 'day' && loop % 2 === 1 && bar < 2
    // 主旋律
    const note = this.parsed[bar][sp]
    if (note) {
      const ld = freqDeg(cfg, note.deg + def.leadOct)
      const dur = note.len * sd * def.gate
      const vel = this.kind === 'tense' ? 0.2 : 0.22
      if (a.lead && !quiet) m.lead(out, cfg.lead, ld, t, dur, vel)
      if (a.counter) m.counter(out, freqDeg(cfg, note.deg - 2 + def.leadOct), t, dur, vel * 0.42)
    }
    // ベース
    const bi = def.bass[sp]
    if (bi >= 0) {
      const f = chordFreq(cfg, chord, bi, def.bassOct)
      m.bass(out, this.kind === 'evening' || this.kind === 'night' || this.kind === 'rebirth' ? 'tri' : 'pulse', f, t, this.bassLen[sp] * sd * 0.92, this.kind === 'tense' ? 0.24 : 0.28)
    }
    // アルペジオ
    const ai = def.arp[sp]
    if (a.arp && ai >= 0) {
      const f = chordFreq(cfg, chord, ai, def.arpOct)
      m.arp(out, cfg.arp, f, t, sd, 0.085 * a.arpGain)
    }
    // ドラム
    if (a.kick && def.kick.includes(sp) && !(a.warn && sp !== 0 && sp !== 8)) m.kick(out, t, this.kind === 'evening' ? 0.3 : 0.42)
    if (a.snare && def.snare.includes(sp)) m.snare(out, t, this.kind === 'day' ? 0.12 : 0.17)
    if (a.hat && def.hat.includes(sp)) m.hat(out, t, cfg.wk === 'rain' ? 0.035 : 0.05)
    // 鈴のきらめき
    if (a.bell && sp % 8 === 0 && this.rng() < 0.75) {
      const idx = Math.floor(this.rng() * 4)
      m.bell(out, chordFreq(cfg, chord, idx, 7 + (this.kind === 'night' ? 7 : 0)), t, 0.045, 1.1)
    }
    // 天気の小さな音
    if (cfg.wk === 'rain' && sp % 2 === 0 && this.rng() < 0.16) {
      const pent = [0, 1, 2, 4, 5][Math.floor(this.rng() * 5)]
      m.bell(out, freqDeg(cfg, pent + 14), t, 0.04, 0.35)
    } else if (cfg.wk === 'snow' && sp % 4 === 0 && this.rng() < 0.3) {
      m.bell(out, chordFreq(cfg, chord, Math.floor(this.rng() * 4), 14), t, 0.035, 1.4)
    } else if (cfg.wk === 'ember' && this.rng() < 0.1) {
      m.noiseHit(out, t, 0.03, 'highpass', 3800, 0.5, 0.045)
    }
  }
}

// ---------------------------------------------------------------- 音源
export class Music {
  readonly ctx: BaseAudioContext
  /** 全プレイヤーの出口 */
  readonly bus: GainNode
  readonly noiseBuf: AudioBuffer
  private readonly lfo: GainNode
  private readonly waves = new Map<number, PeriodicWave>()
  private readonly offline: boolean
  private active = false
  private st: MusicState = { night: 0, weather: 'sun', stage: 0, army: 0, villageLv: 0 }
  private cur: Player | null = null
  private jing: Player | null = null
  private dying: Player[] = []

  constructor(ctx: BaseAudioContext, dest: AudioNode, offline = false) {
    this.ctx = ctx
    this.offline = offline
    this.bus = ctx.createGain()
    // BGM はひかえめ
    this.bus.gain.value = 0.5
    this.bus.connect(dest)
    // 白色ノイズ（2 秒）
    const r = rnd(12345)
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const d = nb.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1
    this.noiseBuf = nb
    // ビブラート用の LFO（長い音の音程をわずかにゆらす）
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 5.4
    this.lfo = ctx.createGain()
    this.lfo.gain.value = 9
    lfo.connect(this.lfo)
    lfo.start()
  }

  // ------------------------------------------------ 操作
  setActive(on: boolean) {
    if (on === this.active) return
    this.active = on
    const now = this.ctx.currentTime
    if (!on) {
      for (const p of [this.cur, this.jing]) if (p) this.retire(p, now, 0.35)
      this.cur = this.jing = null
    }
  }
  get isActive() {
    return this.active
  }

  setState(s: MusicState) {
    this.st = s
    if (this.active && !this.jing) this.retarget(this.cur ? 2 : 1.2)
  }

  /** 短い曲（勝利 / 世代交代）。BGM が切れている時は false を返す（呼び出し側で効果音にする） */
  jingle(kind: JingleKind): boolean {
    if (!this.active) return false
    const now = this.ctx.currentTime
    if (this.cur) this.retire(this.cur, now, 0.25)
    this.cur = null
    if (this.jing) this.retire(this.jing, now, 0.1)
    this.jing = new Player(this, kind, `jingle|${kind}`, this.st, now + 0.12, 0.02)
    return true
  }

  /** 毎フレーム呼ぶ：少し先の音までスケジュールする */
  update(lookAhead = LOOK_AHEAD) {
    if (!this.active) return
    if (!this.offline && this.ctx.state !== 'running') return
    const now = this.ctx.currentTime
    if (this.dying.length) {
      this.dying = this.dying.filter((p) => {
        if (now < p.killAt) return true
        p.dispose()
        return false
      })
    }
    if (this.jing && this.jing.finished(now)) {
      this.retire(this.jing, now, 0.05)
      this.jing = null
    }
    if (!this.jing && !this.cur) this.retarget(1.2)
    for (const p of [this.cur, this.jing]) p?.schedule(now, now + lookAhead, this.st)
  }

  /** 今の状態（テスト・デバッグ用） */
  info() {
    return {
      active: this.active,
      song: this.cur?.key ?? null,
      jingle: this.jing?.key ?? null,
      dying: this.dying.length,
      time: this.ctx.currentTime,
    }
  }

  // ------------------------------------------------ 曲の切り替え
  private retarget(fade: number) {
    const want = pickSong(this.st)
    if (this.cur?.key === want.key) return
    const now = this.ctx.currentTime
    if (this.cur) this.retire(this.cur, now, fade)
    const start = this.offline ? 0.05 : now + 0.06
    this.cur = new Player(this, want.kind, want.key, this.st, start, this.offline ? 0.01 : fade)
  }

  private retire(p: Player, now: number, fade: number) {
    p.stop(now, fade)
    this.dying.push(p)
  }

  // ------------------------------------------------ 音の部品
  /** デューティ比 duty のパルス波（高い倍音をなめらかに削って、ブザーの鋭さをやわらげる） */
  private pulse(duty: number) {
    const key = Math.round(duty * 1000)
    let w = this.waves.get(key)
    if (!w) {
      const N = 40
      const re = new Float32Array(N + 1)
      const im = new Float32Array(N + 1)
      for (let k = 1; k <= N; k++) {
        const taper = 1 / (1 + (k / 14) ** 2)
        re[k] = ((2 * Math.sin(2 * Math.PI * k * duty)) / (Math.PI * k)) * taper
        im[k] = ((2 * (1 - Math.cos(2 * Math.PI * k * duty))) / (Math.PI * k)) * taper
      }
      w = this.ctx.createPeriodicWave(re, im)
      this.waves.set(key, w)
    }
    return w
  }

  private osc(dest: AudioNode, wave: Exclude<OscillatorType, 'custom'> | PeriodicWave, f: number, t: number, dur: number, vol: number, a: number, dec: number, sus: number, rel: number, vib = false) {
    const ctx = this.ctx
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    if (typeof wave === 'string') o.type = wave as OscillatorType
    else o.setPeriodicWave(wave)
    o.frequency.value = f
    if (vib) this.lfo.connect(o.detune)
    const t1 = t + a
    const t2 = t1 + Math.min(dec, Math.max(0.001, dur - a))
    const te = Math.max(t + dur, t2 + 0.001)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t1)
    g.gain.linearRampToValueAtTime(vol * sus, t2)
    g.gain.setValueAtTime(vol * sus, te)
    g.gain.linearRampToValueAtTime(0, te + rel)
    o.connect(g).connect(dest)
    o.start(t)
    o.stop(te + rel + 0.02)
  }

  lead(dest: AudioNode, style: LeadStyle, f: number, t: number, dur: number, vol: number) {
    switch (style) {
      case 'pulse50':
        return this.osc(dest, this.pulse(0.5), f, t, dur, vol, 0.004, 0.09, 0.7, 0.05, dur > 0.38)
      case 'pulse25':
        return this.osc(dest, this.pulse(0.25), f, t, dur, vol, 0.004, 0.08, 0.72, 0.04, dur > 0.38)
      case 'pulse125':
        return this.osc(dest, this.pulse(0.125), f, t, dur, vol * 0.9, 0.003, 0.1, 0.6, 0.04, dur > 0.38)
      case 'pluck':
        return this.osc(dest, this.pulse(0.25), f, t, Math.min(dur, 0.32), vol, 0.003, 0.22, 0.1, 0.05)
      case 'tri':
        return this.osc(dest, 'triangle', f, t, dur, vol * 1.25, 0.014, 0.1, 0.85, 0.14, dur > 0.3)
      case 'bell':
        return this.bell(dest, f, t, vol * 0.8, Math.min(2.2, 0.7 + dur))
    }
  }
  counter(dest: AudioNode, f: number, t: number, dur: number, vol: number) {
    this.osc(dest, 'triangle', f, t, dur, vol * 1.3, 0.01, 0.1, 0.8, 0.1)
  }
  bass(dest: AudioNode, wave: 'tri' | 'pulse', f: number, t: number, dur: number, vol: number) {
    if (wave === 'tri') this.osc(dest, 'triangle', f, t, dur, vol * 1.1, 0.01, 0.1, 0.85, 0.12)
    else this.osc(dest, this.pulse(0.25), f, t, dur, vol, 0.005, 0.12, 0.6, 0.06)
  }
  arp(dest: AudioNode, wave: ArpWave, f: number, t: number, sd: number, vol: number) {
    if (wave === 'bell') this.bell(dest, f, t, vol * 0.9, 0.9)
    else if (wave === 'tri') this.osc(dest, 'triangle', f, t, sd * 1.6, vol * 1.3, 0.006, 0.08, 0.3, 0.12)
    else this.osc(dest, this.pulse(0.25), f, t, sd * 1.1, vol, 0.003, 0.06, 0.3, 0.04)
  }
  pad(dest: AudioNode, f: number, t: number, dur: number, vol: number, wave: Exclude<OscillatorType, 'custom'> = 'triangle') {
    const a = Math.min(0.5, dur * 0.3)
    const rel = Math.min(0.7, dur * 0.4)
    this.osc(dest, wave, f, t, dur - rel * 0.4, vol, a, 0.2, 0.85, rel)
  }
  bell(dest: AudioNode, f: number, t: number, vol: number, len: number) {
    const ctx = this.ctx
    const parts: [number, number, number][] = [[1, 1, 1], [2.76, 0.28, 0.55], [5.4, 0.1, 0.3]]
    for (const [mul, amp, life] of parts) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = f * mul
      const L = Math.max(0.05, len * life)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(vol * amp, t + 0.004)
      g.gain.exponentialRampToValueAtTime(0.0005, t + L)
      o.connect(g).connect(dest)
      o.start(t)
      o.stop(t + L + 0.02)
    }
  }
  kick(dest: AudioNode, t: number, vol: number) {
    const ctx = this.ctx
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(150, t)
    o.frequency.exponentialRampToValueAtTime(48, t + 0.12)
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.17)
    o.connect(g).connect(dest)
    o.start(t)
    o.stop(t + 0.2)
    this.noiseHit(dest, t, 0.012, 'highpass', 1800, 0.5, vol * 0.18)
  }
  snare(dest: AudioNode, t: number, vol: number) {
    this.noiseHit(dest, t, 0.13, 'bandpass', 1900, 0.8, vol)
    const ctx = this.ctx
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'triangle'
    o.frequency.setValueAtTime(210, t)
    o.frequency.exponentialRampToValueAtTime(120, t + 0.08)
    g.gain.setValueAtTime(vol * 0.9, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09)
    o.connect(g).connect(dest)
    o.start(t)
    o.stop(t + 0.11)
  }
  hat(dest: AudioNode, t: number, vol: number) {
    this.noiseHit(dest, t, 0.04, 'highpass', 6500, 0.5, vol)
  }
  noiseHit(dest: AudioNode, t: number, len: number, type: BiquadFilterType, freq: number, q: number, vol: number) {
    const ctx = this.ctx
    const s = ctx.createBufferSource()
    s.buffer = this.noiseBuf
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + len)
    s.connect(f).connect(g).connect(dest)
    s.start(t, ((t * 7.3) % 1.5) + 0.01)
    s.stop(t + len + 0.02)
  }

  /**
   * 曲をまるごと書き出す（確認用）。makeDest でマスターの経路（コンプレッサなど）を作って渡す。
   * jingle を渡すとその短い曲を、渡さなければ st の場面の曲を seconds 秒ぶん。
   */
  static async renderOffline(st: MusicState, seconds: number, makeDest: (ctx: BaseAudioContext) => AudioNode, jingle?: JingleKind, sampleRate = 22050): Promise<Float32Array> {
    const ctx = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate)
    const m = new Music(ctx, makeDest(ctx), true)
    m.setActive(true)
    m.setState(st)
    if (jingle) m.jingle(jingle)
    m.update(seconds + 1)
    const buf = await ctx.startRendering()
    return buf.getChannelData(0)
  }
}
