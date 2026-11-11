/**
 * 音の本体。圧電ブザー風の電子音（効果音）と、BGM（music.ts）を同じ出力にまとめる。
 * すべて WebAudio で作る（音声ファイルは使わない）。AudioContext が無い環境では黙って何もしない。
 */
import { Music, type MusicState } from './music'

/** 音量の段階（0 = 消音） */
export const VOLUMES = [0, 0.04, 0.08, 0.14]
export const VOLUME_NAMES = ['切', '小', '中', '大']

/** 出力の経路：効果音 / BGM → コンプレッサ（音割れ止め）→ マスター音量 → スピーカー */
export interface Chain {
  /** 効果音（小さなスピーカー風に低音を削ってある） */
  sfx: GainNode
  /** 効果音（低い音も通す） */
  sfxFull: GainNode
  /** BGM */
  bgm: GainNode
  /** マスター音量 */
  master: GainNode
}

export function createChain(ctx: BaseAudioContext, volume: number): Chain {
  const master = ctx.createGain()
  master.gain.value = volume
  // 音割れ止め：ほぼリミッタとして働く
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -4
  comp.knee.value = 4
  comp.ratio.value = 12
  comp.attack.value = 0.003
  comp.release.value = 0.12
  comp.connect(master).connect(ctx.destination)

  // かるい反響（ディレイを数回はねかえす）
  const send = ctx.createGain()
  const delay = ctx.createDelay(0.5)
  delay.delayTime.value = 0.19
  const fb = ctx.createGain()
  fb.gain.value = 0.3
  const damp = ctx.createBiquadFilter()
  damp.type = 'lowpass'
  damp.frequency.value = 2600
  const wet = ctx.createGain()
  wet.gain.value = 0.34
  send.connect(delay)
  delay.connect(damp)
  damp.connect(fb)
  fb.connect(delay)
  damp.connect(wet)
  wet.connect(comp)

  // ブザーの鋭さを少し丸める
  const round = ctx.createBiquadFilter()
  round.type = 'lowpass'
  round.frequency.value = 5600
  round.Q.value = 0.5
  round.connect(comp)
  const sfxSend = ctx.createGain()
  sfxSend.gain.value = 0.22
  round.connect(sfxSend).connect(send)

  // 小さなスピーカーっぽく低音を削る
  const sfx = ctx.createGain()
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 900
  sfx.connect(hp).connect(round)

  const sfxFull = ctx.createGain()
  sfxFull.connect(round)

  const bgm = ctx.createGain()
  bgm.gain.value = 1
  const bgmHp = ctx.createBiquadFilter()
  bgmHp.type = 'highpass'
  bgmHp.frequency.value = 70
  const bgmLp = ctx.createBiquadFilter()
  bgmLp.type = 'lowpass'
  bgmLp.frequency.value = 5200
  bgmLp.Q.value = 0.4
  const bgmSend = ctx.createGain()
  bgmSend.gain.value = 0.42
  bgm.connect(bgmHp).connect(bgmLp)
  bgmLp.connect(comp)
  bgmLp.connect(bgmSend).connect(send)
  return { sfx, sfxFull, bgm, master }
}

type Wave = 'square' | 'triangle' | 'sawtooth' | 'sine'
export interface ToneOpt {
  /** 波形（既定は矩形波） */
  type?: Wave
  /** 音量 0〜1 */
  vol?: number
  /** この周波数まで音程をすべらせる */
  slideTo?: number
  /** 低い音も通す（既定 true） */
  full?: boolean
}

export class Beeper {
  private ctx?: AudioContext
  private chain?: Chain
  private noiseBuf?: AudioBuffer
  /** VOLUMES の添字 */
  level = 2
  /** BGM / 効果音の入り切り（設定） */
  bgmOn = true
  sfxOn = true
  music?: Music
  private musicState?: MusicState
  private hiddenSuspended = false

  setLevel(level: number) {
    this.level = Math.max(0, Math.min(VOLUMES.length - 1, level))
    if (this.chain) this.chain.master.gain.value = VOLUMES[this.level]
    this.refreshMusic()
  }
  setBgm(on: boolean) {
    this.bgmOn = on
    this.refreshMusic()
  }
  setSfx(on: boolean) {
    this.sfxOn = on
  }

  /** AudioContext が動いているか */
  get running() {
    return this.ctx?.state === 'running'
  }

  /** 音を出せる状態か（AudioContext が作れたか） */
  get ready() {
    return !!this.ctx
  }

  unlock() {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!AC) return
        this.ctx = new AC()
        this.chain = createChain(this.ctx, VOLUMES[this.level])
        this.music = new Music(this.ctx, this.chain.bgm)
        if (this.musicState) this.music.setState(this.musicState)
        // タブが裏に回ったら止め、戻ったら再開する
        document.addEventListener('visibilitychange', () => {
          const c = this.ctx
          if (!c) return
          if (document.hidden) {
            if (c.state === 'running') {
              this.hiddenSuspended = true
              void c.suspend().catch(() => {})
            }
          } else if (this.hiddenSuspended) {
            this.hiddenSuspended = false
            void c.resume().catch(() => {})
          }
        })
      } catch {
        // 未対応のブラウザでは黙って無効にする
        this.ctx = undefined
        this.chain = undefined
        this.music = undefined
        return
      }
    }
    // iOS では 'interrupted' になることもある
    if (this.ctx.state !== 'running' && !document.hidden) void this.ctx.resume().catch(() => {})
    this.refreshMusic()
  }

  /** BGM が鳴ってよい状態か */
  private refreshMusic() {
    this.music?.setActive(this.bgmOn && this.level > 0)
  }

  /** BGM に今の場面を伝える（毎フレーム呼んでよい） */
  setMusicState(s: MusicState) {
    this.musicState = s
    this.music?.setState(s)
  }

  /** 毎フレーム：BGM の先読みスケジュール */
  update() {
    this.music?.update()
  }

  beep(freq: number, dur: number, at = 0) {
    if (!this.ctx || !this.chain || !this.sfxOn) return
    const t = this.ctx.currentTime + at
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = 'square'
    o.frequency.value = freq
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(1, t + 0.003)
    g.gain.setValueAtTime(1, t + dur - 0.005)
    g.gain.linearRampToValueAtTime(0, t + dur)
    o.connect(g).connect(this.chain.sfx)
    o.start(t)
    o.stop(t + dur + 0.01)
  }

  /** 波形・音量・音程のすべりを選べる音（新しい効果音用） */
  tone(freq: number, dur: number, at = 0, opt: ToneOpt = {}) {
    if (!this.ctx || !this.chain || !this.sfxOn) return
    const t = this.ctx.currentTime + at
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = opt.type ?? 'square'
    o.frequency.setValueAtTime(freq, t)
    if (opt.slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, opt.slideTo), t + dur)
    const vol = opt.vol ?? 0.7
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(g).connect(opt.full === false ? this.chain.sfx : this.chain.sfxFull)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  /** ノイズの短い音（とんとん・くずれる音など）。lo〜hi Hz のあたりを鳴らす */
  noise(dur: number, at = 0, lo = 800, hi = 6000, vol = 0.5) {
    if (!this.ctx || !this.chain || !this.sfxOn) return
    const ctx = this.ctx
    if (!this.noiseBuf) {
      const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
      const d = b.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      this.noiseBuf = b
    }
    const t = ctx.currentTime + at
    const s = ctx.createBufferSource()
    s.buffer = this.noiseBuf
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = lo
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = hi
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    s.connect(hp).connect(lp).connect(g).connect(this.chain.sfxFull)
    s.start(t, Math.random() * 0.5)
    s.stop(t + dur + 0.02)
  }
}
