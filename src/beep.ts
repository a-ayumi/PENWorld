/** 圧電ブザー風の電子音（矩形波の短いビープ） */
export class Beeper {
  private ctx?: AudioContext
  private out?: GainNode

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      this.ctx = new AC()
      this.out = this.ctx.createGain()
      this.out.gain.value = 0.08
      // 小さなスピーカーっぽく低音を削る
      const hp = this.ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 900
      this.out.connect(hp).connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  beep(freq: number, dur: number, at = 0) {
    if (!this.ctx || !this.out) return
    const t = this.ctx.currentTime + at
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = 'square'
    o.frequency.value = freq
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(1, t + 0.003)
    g.gain.setValueAtTime(1, t + dur - 0.005)
    g.gain.linearRampToValueAtTime(0, t + dur)
    o.connect(g).connect(this.out)
    o.start(t)
    o.stop(t + dur + 0.01)
  }
}
