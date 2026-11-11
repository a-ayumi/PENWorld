/**
 * うんだめしの画面（パネル「うんだめし」と、バトル予想の小さなバー）。
 * 中身（確率・抽選・コイン）は lucky.ts。ここは見た目と演出だけ。
 * ・文字は textContent / createElement だけで作る（innerHTML は使わない）
 * ・画質「低」や prefers-reduced-motion では、演出を短くする（紙ふぶき・ゆっくり回転は出さない）
 */
import * as L from './lucky'
import { EGG_COLORS, FAMILY_NAME } from './world/families'
import type { World } from './world/World'

export interface LuckyUIOpts {
  world: World
  beeper: { unlock(): void; beep(freq: number, dur: number, at?: number): void }
  /** 画質「低」か */
  lite: () => boolean
}

// ================= 小さな部品 =================
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '', attrs: Record<string, string> = {}): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  return e
}
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`)
const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// ================= ドット絵（絵柄・たまご） =================
type Pal = Record<string, string>
const OUTLINE = '#2a1d12'
/** 文字の地図 → 小さなキャンバス（まわりに 1 ドットの色つき輪郭をつける） */
function pixelCanvas(map: string[], pal: Pal): HTMLCanvasElement {
  const w = Math.max(...map.map((r) => r.length)) + 2
  const h = map.length + 2
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d')!
  const fill = (x: number, y: number) => x >= 0 && y >= 0 && x < w - 2 && y < h - 2 && (map[y]?.[x] ?? '.') !== '.'
  for (let y = -1; y <= h - 2; y++)
    for (let x = -1; x <= w - 2; x++) {
      if (fill(x, y)) {
        g.fillStyle = pal[map[y][x]] ?? '#f0f'
        g.fillRect(x + 1, y + 1, 1, 1)
      } else if (fill(x - 1, y) || fill(x + 1, y) || fill(x, y - 1) || fill(x, y + 1)) {
        g.fillStyle = OUTLINE
        g.fillRect(x + 1, y + 1, 1, 1)
      }
    }
  return cv
}
const ART: Record<string, { map: string[]; pal: Pal }> = {
  star: {
    map: ['.....YY.....', '.....YY.....', '....YWYY....', 'YYYYYWYYYYYY', '.YYYYYYYYYO.', '..YYYYYYYO..', '...YYYYYO...', '..YYYYYYYO..', '..YYYOYYYO..', '.YYYO..YYYO.', '.YYO....YYO.'],
    pal: { Y: '#ffd23f', W: '#fff7b0', O: '#e8962a' },
  },
  mon: {
    map: ['..P......P..', '.PPP....PPP.', '.PPPPPPPPPP.', 'PPPPPPPPPPPP', 'PPWWPPPPWWPP', 'PPWDPPPPWDPP', 'PPPPPPPPPPPP', 'PPPPDDDDPPPP', 'PPPDWWWWDPPP', '.PPPDDDDPPP.', '..PPPPPPPP..'],
    pal: { P: '#a56cf0', W: '#ffffff', D: '#3b1d6e' },
  },
  egg: {
    map: ['....CCCC....', '...CCCCCC...', '..CHCCCCCC..', '..CHCCCCCC..', '.CCCCCMCCCC.', '.CCCCMMMCCS.', '.CCCCCMCCCS.', '.CCCCCCCCSS.', '.CCMCCCCCSS.', '.CMMMCCCCSS.', '..CMCCCCSSS.', '..CCCCSSSS..', '...SSSSSS...'],
    pal: { C: '#fff3dc', H: '#ffffff', S: '#e0c9a0', M: '#7fd1ff' },
  },
  bell: {
    map: ['.....GG.....', '....GGGG....', '...GLGGGG...', '...GLGGGG...', '..GLGGGGGD..', '..GLGGGGGD..', '.GGGGGGGGGD.', '.GGGGGGGGGD.', 'GGGGGGGGGGGD', 'DDDDDDDDDDDD', '.....DD.....'],
    pal: { G: '#f2b134', L: '#ffe9a0', D: '#a8650f' },
  },
  meat: {
    map: ['...RRRRR....', '..RRrrRRR...', '.RRrRRRRRR..', '.RRRRRRRRR..', '.RRRRRRRRR..', '..RRRRRRR...', '....RRR.....', '.....W......', '....WWW.....', '...WW.WW....'],
    pal: { R: '#c8643a', r: '#f0a070', W: '#fff3dc' },
  },
  berry: {
    map: ['......GG....', '....GGGG....', '.....G......', '..RRRRRRR...', '.RRpRRRRRR..', 'RRRpRRRRRRR.', 'RRRRRRRRRRR.', 'RRRRRRRRRRR.', 'RRRRRRRRRDR.', '.RRRRRRRRDR.', '..RRRRRRDD..'],
    pal: { R: '#e8445a', p: '#ff9aa8', D: '#9a1d34', G: '#5ec46a' },
  },
}
const symCache = new Map<string, HTMLCanvasElement>()
function symCanvas(id: string) {
  let c = symCache.get(id)
  if (!c) {
    c = pixelCanvas(ART[id].map, ART[id].pal)
    symCache.set(id, c)
  }
  return c
}
/** CSS で拡大して見せる絵柄（DOM 用） */
function symImg(id: string, scale = 3) {
  const src = symCanvas(id)
  const c = document.createElement('canvas')
  c.width = src.width
  c.height = src.height
  c.getContext('2d')!.drawImage(src, 0, 0)
  c.className = 'lk-pix'
  c.style.width = `${src.width * scale}px`
  c.style.height = `${src.height * scale}px`
  c.setAttribute('aria-hidden', 'true')
  return c
}
const EGG_MAP = ['....CCCC....', '...CCCCCC...', '..CHCCCCCC..', '..CHCCCCCC..', '.CHCCCMCCCC.', '.CCCCMMMCCS.', '.CCCCCMCCCS.', '.CCCCCCCCSS.', '.CCMCCCCCSS.', '.CMMMCCCCSS.', '..CMCCCCSSS.', '..CCCCSSSS..', '...SSSSSS...', '....SSSS....']
function eggImg(kind: L.EggPrize['kind'], scale: number) {
  const [shell, shade, light, mark] = EGG_COLORS[kind]
  const src = pixelCanvas(EGG_MAP, { C: shell, S: shade, H: light, M: mark })
  src.className = 'lk-pix'
  src.style.width = `${src.width * scale}px`
  src.style.height = `${src.height * scale}px`
  src.setAttribute('aria-hidden', 'true')
  return src
}

// ================= 音（圧電ブザー風の短い組み合わせ） =================
type Note = [number, number, number?]
const RAR_COL = ['#e8efff', '#58c8ff', '#ffd23f']

export function initLuckyUI(o: LuckyUIOpts) {
  const { world } = o
  const lucky = new L.Lucky(world)
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches
  /** 演出の長さの倍率（低画質・動きを減らす設定では短く） */
  const tm = () => (o.lite() || reduce() ? 0.3 : 1)
  const fancy = () => !(o.lite() || reduce())
  const play = (notes: Note[]) => {
    o.beeper.unlock()
    for (const [f, d, at] of notes) o.beeper.beep(f, d, at ?? 0)
  }
  const arp = (fs: number[], d = 0.08, gap = 0.09): Note[] => fs.map((f, i) => [f, d, i * gap])

  const panel = $<HTMLElement>('lucky-panel')
  const openBtn = $<HTMLButtonElement>('lucky-btn')
  const body = $('lucky-body')
  const coinsEl = $('lucky-coins')
  const dayEl = $('lucky-day')
  const banner = $('lucky-banner')
  const allowBtn = $<HTMLButtonElement>('lucky-allow')
  const tabsEl = $('lucky-tabs')

  let busy = false
  /** 演出がおわるまで、パネルのコイン表示をここに止めておく（結果のネタバレをしない） */
  let hold: number | null = null
  let bannerT = 0
  const say = (text: string) => {
    banner.textContent = text
    banner.hidden = !text
    clearTimeout(bannerT)
    if (text) bannerT = window.setTimeout(() => ((banner.textContent = ''), (banner.hidden = true)), 7000)
  }
  lucky.onNote = say

  // ---------------- 紙ふぶき ----------------
  interface Bit { x: number; y: number; vx: number; vy: number; r: number; vr: number; s: number; c: string; life: number }
  function confetti(cv: HTMLCanvasElement, n: number, colors: string[], x: number, y: number, power = 1) {
    if (!fancy() || n <= 0) return
    const g = cv.getContext('2d')!
    const bits: Bit[] = []
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3
      const v = (120 + Math.random() * 260) * power
      bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6, vr: (Math.random() - 0.5) * 14, s: 3 + Math.random() * 4, c: colors[i % colors.length], life: 1.4 + Math.random() * 0.8 })
    }
    let last = performance.now()
    const step = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      g.clearRect(0, 0, cv.width, cv.height)
      let alive = 0
      for (const b of bits) {
        b.life -= dt
        if (b.life <= 0) continue
        alive++
        b.vy += 520 * dt
        b.vx *= 1 - dt * 0.8
        b.x += b.vx * dt
        b.y += b.vy * dt
        b.r += b.vr * dt
        g.save()
        g.globalAlpha = Math.min(1, b.life)
        g.translate(b.x, b.y)
        g.rotate(b.r)
        g.fillStyle = b.c
        g.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2)
        g.restore()
      }
      if (alive && cv.isConnected) requestAnimationFrame(step)
      else g.clearRect(0, 0, cv.width, cv.height)
    }
    requestAnimationFrame(step)
  }
  const RAINBOW = ['#ff5a5a', '#ffb84d', '#ffd23f', '#7cf29b', '#58c8ff', '#c9a8ff']

  // ---------------- かくりつ表などの折りたたみ ----------------
  function details(title: string, build: (box: HTMLElement) => void) {
    const d = el('details', 'lk-details')
    d.appendChild(el('summary', '', title))
    const box = el('div', 'lk-detail-box')
    build(box)
    d.appendChild(box)
    return d
  }
  const table = (rows: (string | Node)[][], head?: string[]) => {
    const t = el('table', 'lk-table')
    if (head) {
      const tr = el('tr')
      for (const h of head) tr.appendChild(el('th', '', h))
      t.appendChild(tr)
    }
    for (const r of rows) {
      const tr = el('tr')
      for (const c of r) {
        const td = el('td')
        if (typeof c === 'string') td.textContent = c
        else td.appendChild(c)
        tr.appendChild(td)
      }
      t.appendChild(tr)
    }
    return t
  }
  const pct = (p: number, d = 1) => `${(p * 100).toFixed(d)}%`

  // ---------------- かけ金えらび ----------------
  interface Chips { root: HTMLElement; value(): number; refresh(): void }
  function chipRow(label: string, values: readonly number[], fmt: (v: number) => string, check: (v: number) => true | string, def: number): Chips {
    const root = el('div', 'lk-bets')
    root.appendChild(el('span', 'lk-label', label))
    let cur = def
    const btns = values.map((v) => {
      const b = el('button', 'chip', fmt(v), { type: 'button' })
      b.addEventListener('click', () => {
        cur = v
        o.beeper.unlock()
        play([[2200, 0.03]])
        refresh()
      })
      root.appendChild(b)
      return b
    })
    const refresh = () => {
      // えらんでいるのが使えなくなったら、使える一番大きいものに切りかえる
      if (check(cur) !== true) {
        const ok = values.filter((v) => check(v) === true)
        cur = ok.length ? ok[ok.length - 1] : values[0]
      }
      values.forEach((v, i) => {
        const r = check(v)
        btns[i].setAttribute('aria-pressed', String(v === cur))
        btns[i].disabled = busy || r !== true
        btns[i].title = r === true ? '' : r
      })
    }
    return { root, value: () => cur, refresh }
  }

  // ================= タブ：ガチャ =================
  function buildGacha() {
    const root = el('div', 'lk-tab')
    const stage = el('div', 'gz-stage')
    const cvs = el('canvas', 'gz-confetti')
    const pityBox = el('div', 'lk-pity')
    const rareRow = el('div', 'lk-pity-row')
    const srRow = el('div', 'lk-pity-row')
    const rareBar = el('i')
    const srBar = el('i')
    const rareTxt = el('span')
    const srTxt = el('span')
    for (const [row, bar, txt, lab] of [[rareRow, rareBar, rareTxt, 'レアいじょう'], [srRow, srBar, srTxt, 'スーパーレア']] as const) {
      row.append(el('b', '', lab), el('span', 'lk-bar').appendChild(bar).parentElement!, txt)
    }
    pityBox.append(el('p', 'lk-sub', 'てんじょう（ここまで ひくと かならず でる）'), rareRow, srRow)
    const row = el('div', 'lk-row')
    const b1 = el('button', 'lk-btn', '', { type: 'button' })
    const b10 = el('button', 'lk-btn alt', '', { type: 'button' })
    b1.append(el('b', '', '1かい'), el('small', '', `${L.GACHA.single} コイン`))
    b10.append(el('b', '', '10れん'), el('small', '', `${L.GACHA.ten} コイン（1かいぶん おとく）`))
    row.append(b1, b10)
    const why = el('p', 'lk-why')
    const rates = el('p', 'lk-rates')
    const stockEl = el('p', 'lk-sub')
    const resEl = el('div', 'gz-result')
    const info = details('かくりつ・てんじょうの ひょう', (box) => {
      const total = L.GACHA.weights.reduce((a, b) => a + b, 0)
      box.appendChild(
        table(
          [0, 1, 2].map((r) => [el('span', `lk-rar r${r}`, L.RARITY_NAME[r]), pct(L.GACHA.weights[r] / total, 0), ['ふつうの系統たまご', 'かざりたまご（きらきら・はやくかえる・つよい）', 'ふしぎなたまご（かくしの姿のたまご・とくべつに つよい）'][r]]),
          ['レア度', 'わりあい', 'なかみ'],
        ),
      )
      box.appendChild(el('p', 'lk-sub', `系統は ${L.GACHA_KINDS.map((k) => FAMILY_NAME[k]).join('・')} のどれも おなじ わりあい（${pct(1 / L.GACHA_KINDS.length)}ずつ）。`))
      box.appendChild(el('p', 'lk-sub', `てんじょう：${L.GACHA.pityRare}かい ひいても レアいじょうが でなければ、その回は かならずレアいじょう。${L.GACHA.pitySR}かい ひいても スーパーレアが でなければ、その回は かならずスーパーレア。でると カウンターは 0に もどります。`))
      box.appendChild(el('p', 'lk-sub', `10れんの さいごの 1こは かならず レアいじょう（レア ${pct(L.GACHA.atLeastRare[0] / (L.GACHA.atLeastRare[0] + L.GACHA.atLeastRare[1]), 0)}・スーパーレア ${pct(L.GACHA.atLeastRare[1] / (L.GACHA.atLeastRare[0] + L.GACHA.atLeastRare[1]), 0)}）。`))
      box.appendChild(el('p', 'lk-sub', `でた たまごは「あずかりたまご」に入り、はこにわが あいていれば じゅんばんに ならびます（さいだい ${L.GACHA.stockMax}こ）。`))
    })
    root.append(stage, pityBox, row, why, rates, stockEl, resEl, info)

    let seq = 0
    /** 演出をとちゅうで やめて、結果をすぐ出す */
    let finish: (() => void) | null = null
    const stageReset = () => {
      stage.replaceChildren(cvs)
      cvs.width = stage.clientWidth || 320
      cvs.height = stage.clientHeight || 210
    }
    const capsule = (hue: number) => {
      const c = el('div', 'cap')
      c.style.setProperty('--cap', `hsl(${hue} 80% 62%)`)
      c.append(el('div', 'cap-top'), el('div', 'cap-bot'))
      return c
    }
    const anim = (e: Element, kf: Keyframe[], ms: number, opt: KeyframeAnimationOptions = {}) => {
      try {
        return e.animate(kf, { duration: Math.max(1, ms), fill: 'forwards', ...opt }).finished.catch(() => undefined)
      } catch {
        return Promise.resolve()
      }
    }
    const sound = (r: L.Rarity): Note[] => (r === 2 ? [...arp([1047, 1319, 1568, 2093, 2637, 3136], 0.1, 0.09), [3136, 0.4, 0.6]] : r === 1 ? arp([1568, 1976, 2349, 3136], 0.08, 0.08) : [[1568, 0.06], [2093, 0.08, 0.08]])

    function showResultList(prizes: L.EggPrize[]) {
      resEl.replaceChildren()
      const counts = [0, 0, 0]
      for (const p of prizes) counts[p.rarity]++
      resEl.appendChild(el('p', 'lk-sub', `けっか：ふつう ${counts[0]}・レア ${counts[1]}・スーパーレア ${counts[2]}`))
      const ul = el('div', 'gz-list')
      for (const p of prizes) ul.appendChild(el('span', `gz-tag r${p.rarity}`, `${p.rarity ? `★${L.RARITY_NAME[p.rarity]} ` : ''}${L.prizeName(p)}`))
      resEl.appendChild(ul)
    }

    async function reveal(prizes: L.EggPrize[]) {
      const my = ++seq
      const T = tm()
      stageReset()
      resEl.replaceChildren()
      const ok = () => my === seq
      let done = false
      const best = prizes.reduce<number>((a, p) => Math.max(a, p.rarity), 0) as L.Rarity
      const doneNow = () => {
        if (done) return
        done = true
        showResultList(prizes)
        // ならべた結果を そのまま見せる
        stageReset()
        const grid = el('div', 'gz-grid' + (prizes.length === 1 ? ' one' : ''))
        for (const p of prizes) grid.appendChild(eggCell(p, true))
        stage.appendChild(grid)
      }
      finish = () => {
        if (!ok()) return
        seq++
        doneNow()
      }
      if (prizes.length === 1) {
        const p = prizes[0]
        const mach = el('div', 'gz-machine')
        for (let i = 0; i < 9; i++) mach.appendChild(el('i', '', '', { style: `--h:${(i * 47) % 360};--x:${(i % 3) * 30 + 14}px;--y:${Math.floor(i / 3) * 22 + 8}px` }))
        const flash = el('div', 'gz-flash')
        const cap = capsule(Math.floor(Math.random() * 360))
        stage.append(mach, flash, cap)
        play([[500, 0.05], [420, 0.05, 0.08], [500, 0.05, 0.16], [420, 0.05, 0.24]])
        await anim(mach, [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px) rotate(-2deg)' }, { transform: 'translateX(5px) rotate(2deg)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], 520 * T)
        if (!ok()) return
        cap.style.opacity = '1'
        play([[900, 0.04], [600, 0.06, 0.34]])
        await anim(cap, [{ transform: 'translateY(-130px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1, offset: 0.55, easing: 'ease-in' }, { transform: 'translateY(-22px)', offset: 0.78, easing: 'ease-out' }, { transform: 'translateY(0)' }], 600 * T)
        if (!ok()) return
        // ひらく前のドキドキ：レアほど長くゆれて、光る
        const wig = best === 2 ? 5 : best === 1 ? 3 : 1
        for (let i = 0; i < wig; i++) {
          play([[1200 + i * 200, 0.04]])
          if (best > 0) cap.style.setProperty('--glow', RAR_COL[best])
          await anim(cap, [{ transform: 'rotate(0)' }, { transform: 'rotate(-9deg)' }, { transform: 'rotate(8deg)' }, { transform: 'rotate(0)' }], 320 * T)
          if (!ok()) return
          await sleepMs(100 * T)
          if (!ok()) return
        }
        // ひらく
        play(sound(p.rarity))
        flash.style.background = `radial-gradient(circle, ${RAR_COL[p.rarity]} 0%, ${RAR_COL[p.rarity]}00 70%)`
        const egg = eggCell(p, false)
        stage.appendChild(egg)
        cap.classList.add('open')
        void anim(flash, [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1.1)', offset: 0.25 }, { opacity: 0, transform: 'scale(1.6)' }], 900 * T)
        void anim(egg, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.2)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1.25)', offset: 0.6 }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }], 520 * T)
        await anim(cap, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(-14px) scale(1.2)' }], 420 * T)
        const w = stage.clientWidth || 320
        confetti(cvs, p.rarity === 2 ? 110 : p.rarity === 1 ? 46 : 8, p.rarity === 2 ? RAINBOW : p.rarity === 1 ? ['#58c8ff', '#b8e8ff', '#ffffff'] : ['#ffffff', '#e8efff'], w / 2, (stage.clientHeight || 210) * 0.55, p.rarity === 2 ? 1.5 : 1)
        await sleepMs(700 * T)
        if (!ok()) return
        doneNow()
        return
      }
      // 10 れん：カプセルが 10 こ ならんで、じゅんばんに ひらく
      const grid = el('div', 'gz-grid')
      const cells = prizes.map((p, i) => {
        const cell = el('div', 'gz-cell')
        const cap = capsule((i * 37) % 360)
        cell.appendChild(cap)
        grid.appendChild(cell)
        return { p, cell, cap }
      })
      stage.appendChild(grid)
      play([[500, 0.05], [420, 0.05, 0.08], [500, 0.05, 0.16]])
      await Promise.all(cells.map((c, i) => anim(c.cap, [{ transform: 'translateY(-90px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1, easing: 'ease-in' }], 380 * T, { delay: i * 60 * T })))
      if (!ok()) return
      await sleepMs(250 * T)
      for (let i = 0; i < cells.length; i++) {
        if (!ok()) return
        const { p, cell, cap } = cells[i]
        play(sound(p.rarity).slice(0, p.rarity === 2 ? 6 : 3))
        const egg = eggCell(p, true)
        cell.appendChild(egg)
        cap.classList.add('open')
        void anim(egg, [{ opacity: 0, transform: 'scale(.2)' }, { opacity: 1, transform: 'scale(1.3)', offset: 0.6 }, { opacity: 1, transform: 'scale(1)' }], 360 * T)
        void anim(cap, [{ opacity: 1 }, { opacity: 0 }], 300 * T)
        if (p.rarity > 0) {
          const cw = stage.clientWidth || 320
          const r = cell.getBoundingClientRect()
          const sr = stage.getBoundingClientRect()
          confetti(cvs, p.rarity === 2 ? 70 : 24, p.rarity === 2 ? RAINBOW : ['#58c8ff', '#ffffff'], r.left - sr.left + r.width / 2 || cw / 2, r.top - sr.top + r.height / 2, p.rarity === 2 ? 1.3 : 0.8)
        }
        await sleepMs((p.rarity > 0 ? 520 : 170) * T)
      }
      await sleepMs(300 * T)
      if (!ok()) return
      doneNow()
    }

    /** たまご 1 こぶんの絵（レアは光る） */
    function eggCell(p: L.EggPrize, small: boolean) {
      const c = el('div', `gz-egg r${p.rarity}${small ? ' small' : ''}`)
      c.style.setProperty('--glow', RAR_COL[p.rarity])
      c.appendChild(eggImg(p.kind, small ? 3 : 5))
      if (p.rarity) c.appendChild(el('em', '', p.rarity === 2 ? '★★' : '★'))
      if (!small) c.appendChild(el('span', 'gz-name', L.prizeName(p)))
      else c.appendChild(el('span', 'gz-name', FAMILY_NAME[p.kind]))
      return c
    }

    async function pull(n: 1 | 10) {
      if (busy) return
      o.beeper.unlock()
      const r = lucky.gachaPull(n)
      if (!r.ok) {
        why.textContent = r.why
        play([[1500, 0.05]])
        return
      }
      busy = true
      refreshAll()
      world.save()
      await reveal(r.prizes)
      finish = null
      busy = false
      refreshAll()
      const top = r.prizes.reduce((a, p) => Math.max(a, p.rarity), 0)
      if (top === 2) world.luckySay('スーパーレアが でた！')
    }
    b1.addEventListener('click', () => void pull(1))
    b10.addEventListener('click', () => void pull(10))
    stage.addEventListener('click', () => finish?.())

    function refresh() {
      const left = lucky.pityLeft()
      rareBar.style.width = `${(1 - left.rare / L.GACHA.pityRare) * 100}%`
      srBar.style.width = `${(1 - left.sr / L.GACHA.pitySR) * 100}%`
      rareTxt.textContent = `あと ${left.rare} かい`
      srTxt.textContent = `あと ${left.sr} かい`
      const room = lucky.stockRoom()
      const c1 = lucky.coins < L.GACHA.single ? 'コインが たりない' : room < 1 ? 'あずかりたまごが いっぱい' : ''
      const c10 = lucky.coins < L.GACHA.ten ? 'コインが たりない' : room < 10 ? 'あずかりたまごが いっぱい' : ''
      b1.disabled = busy || !!c1
      b10.disabled = busy || !!c10
      why.textContent = busy ? '' : c1 && c10 ? c1 : c10 && !c1 ? `10れんは ${c10}` : ''
      rates.textContent = `でる わりあい：ふつう ${pct(L.rarityRate(0), 0)}・レア ${pct(L.rarityRate(1), 0)}・スーパーレア ${pct(L.rarityRate(2), 0)}（10れんの さいごは レアいじょう）　これまで ${lucky.st.gacha.total} かい`
      const n = lucky.st.gacha.stock.length
      stockEl.textContent = n ? `あずかりたまご ${n}こ（はこにわに あきが できたら ならびます。いま ${world.eggRoom()}こ おけるよ）` : 'あずかりたまご：なし'
    }
    return { root, refresh }
  }

  // ================= タブ：スロット =================
  function buildSlot() {
    const root = el('div', 'lk-tab')
    const cv = el('canvas', 'sl-canvas', '', { 'aria-label': 'スロットの リール', role: 'img' })
    const res = el('p', 'sl-result', 'コインを かけて まわそう！', { 'aria-live': 'polite' })
    const bets = chipRow('かけ金', L.SHEETS, (v) => `${v}まい（${v * L.SHEET}）`, (v) => lucky.slotCheck(v), 1)
    const row = el('div', 'lk-row')
    const spinBtn = el('button', 'lk-btn', '', { type: 'button' })
    spinBtn.append(el('b', '', 'まわす'), el('small', '', ''))
    const stopBtn = el('button', 'lk-btn alt', '', { type: 'button' })
    stopBtn.append(el('b', '', 'はやく とめる'), el('small', '', 'えんしゅつを はやおくり'))
    stopBtn.hidden = true
    row.append(spinBtn, stopBtn)
    const why = el('p', 'lk-why')
    const t = L.slotTable()
    const info = details('はいとうひょう・きたいち', (box) => {
      const label = (rule: string) => {
        const w = el('span', 'sl-combo')
        const ids = ['star', 'mon', 'egg', 'bell', 'meat', 'berry']
        let cells: number[]
        if (rule.startsWith('tri')) cells = [Number(rule.slice(3)), Number(rule.slice(3)), Number(rule.slice(3))]
        else if (rule === 'twoStar') cells = [0, 0, -1]
        else if (rule === 'twoBerry') cells = [5, 5, -1]
        else cells = [5, -1, -1]
        for (const c of cells) w.appendChild(c < 0 ? el('span', 'sl-any', '?') : symImg(ids[c], 2))
        return w
      }
      box.appendChild(
        table(
          t.rows.map((r) => [label(r.rule), `x${r.mult}`, pct(r.p, 2), `1/${Math.round(1 / r.p)}`]),
          ['ならび', 'ばいりつ', 'わりあい', 'めやす'],
        ),
      )
      box.appendChild(el('p', 'lk-sub', `ばいりつ = かけ金の何ばいが もどるか。たとえば 3まい（9コイン）で ほし3つなら 9 x 100 = 900コイン。`))
      box.appendChild(el('p', 'lk-sub', `きたいち（かけ金に たいして もどる わりあいの へいきん）：${pct(t.rtp, 1)}。なにか もどるのは ${pct(t.hit, 0)}。まけが つづくと「なぐさめボーナス」もあります。`))
      box.appendChild(el('p', 'lk-sub', 'リールの けっかは「まわす」を おした時に きまっています。「とめる」ボタンは えんしゅつを はやおくりするだけで、けっかは かわりません。ラインは まんなかの 1本です。'))
    })
    root.append(cv, res, bets.root, row, why, info)

    // ---- リール描画 ----
    const CELL = 64
    const W = 224
    const H = 112
    const g = cv.getContext('2d')!
    interface Reel { pos: number; speed: number; mode: 'idle' | 'spin' | 'slow' | 'stop'; stopAt: number; sym: number; from: number; to: number; t: number; dur: number }
    const reels: Reel[] = [0, 1, 2].map(() => ({ pos: Math.floor(Math.random() * 20), speed: 0, mode: 'idle', stopAt: 0, sym: 0, from: 0, to: 0, t: 0, dur: 1 }))
    const strip = L.REEL_STRIP
    const ids = ['star', 'mon', 'egg', 'bell', 'meat', 'berry']
    let flashUntil = 0
    let flashCol = '#ffd23f'
    let reachGlow = 0
    const coinsFx: { x: number; y: number; vy: number; vx: number; life: number }[] = []
    const mod = (k: number) => ((k % strip.length) + strip.length) % strip.length
    function fit() {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const cw = Math.min(360, cv.parentElement?.clientWidth || 320)
      cv.style.width = `${cw}px`
      cv.style.height = `${(cw * H) / W}px`
      cv.width = Math.round(cw * dpr)
      cv.height = Math.round(((cw * H) / W) * dpr)
    }
    function draw(now: number) {
      const k = cv.width / W
      g.setTransform(k, 0, 0, k, 0, 0)
      g.imageSmoothingEnabled = false
      g.clearRect(0, 0, W, H)
      const grd = g.createLinearGradient(0, 0, 0, H)
      grd.addColorStop(0, '#5a2e86')
      grd.addColorStop(1, '#2c1550')
      g.fillStyle = grd
      g.fillRect(0, 0, W, H)
      const blink = now < flashUntil && Math.floor(now / 120) % 2 === 0
      for (let i = 0; i < 3; i++) {
        const rx = 10 + i * 70
        g.save()
        g.beginPath()
        g.rect(rx, 8, 64, 96)
        g.clip()
        g.fillStyle = '#fff7e6'
        g.fillRect(rx, 8, 64, 96)
        const r = reels[i]
        const fast = r.mode === 'spin' ? 1 : r.mode === 'slow' ? 0.3 : 0
        const base = Math.floor(r.pos)
        for (let kk = base - 2; kk <= base + 2; kk++) {
          const cy = 56 + (kk - r.pos) * CELL
          const id = ids[strip[mod(kk)]]
          const src = symCanvas(id)
          const sc = 3
          for (const [dy, a] of fast > 0.5 ? [[-9, 0.25], [9, 0.25], [0, 1]] : [[0, 1]]) {
            g.globalAlpha = a
            g.drawImage(src, rx + 32 - (src.width * sc) / 2, cy + dy - (src.height * sc) / 2, src.width * sc, src.height * sc)
          }
          g.globalAlpha = 1
        }
        // 上下をすこし暗く（円柱のリールっぽく）
        const sh = g.createLinearGradient(0, 8, 0, 104)
        sh.addColorStop(0, 'rgba(60,30,90,.55)')
        sh.addColorStop(0.28, 'rgba(60,30,90,0)')
        sh.addColorStop(0.72, 'rgba(60,30,90,0)')
        sh.addColorStop(1, 'rgba(60,30,90,.55)')
        g.fillStyle = sh
        g.fillRect(rx, 8, 64, 96)
        g.restore()
        const reachBlink = i === 2 && reachGlow > 0 && Math.floor(now / 90) % 2 === 0
        g.lineWidth = 3
        g.strokeStyle = reachBlink ? '#ff5a5a' : blink ? flashCol : '#1a0c2e'
        g.strokeRect(rx - 1.5, 6.5, 67, 99)
      }
      // 中央のライン
      g.fillStyle = 'rgba(255,90,90,.85)'
      g.fillRect(4, 55, 216, 2)
      g.beginPath()
      g.moveTo(0, 49)
      g.lineTo(8, 56)
      g.lineTo(0, 63)
      g.fill()
      g.beginPath()
      g.moveTo(224, 49)
      g.lineTo(216, 56)
      g.lineTo(224, 63)
      g.fill()
      for (const c of coinsFx) {
        g.fillStyle = '#ffd23f'
        g.fillRect(c.x, c.y, 4, 4)
      }
    }
    let running = false
    let skipSlow = false
    let tickAcc = 0
    function loop(startT: number, spin: L.SlotSpin, done: () => void) {
      let last = startT
      let reachT = 0
      const sched = () => {
        const T = tm()
        reels[0].stopAt = 0.5 * T
        reels[1].stopAt = 0.85 * T
        reels[2].stopAt = 9999
      }
      sched()
      const startStop = (r: Reel, sym: number, accel = 0) => {
        // いまの位置から数コマ先で、目的の絵柄が中央にくる位置を探す
        let to = Math.ceil(r.pos + 1.6 + accel)
        while (strip[mod(to)] !== sym) to++
        const dist = to - r.pos
        r.from = r.pos
        r.to = to
        r.t = 0
        r.dur = Math.max(0.18, (2 * dist) / Math.max(2, r.speed))
        r.mode = 'stop'
      }
      const step = (nowMs: number) => {
        const dt = Math.min(0.25, (nowMs - last) / 1000) // おそい端末でも、リールが時間どおりに止まるように（0.05 だと 2fps で 10 倍おそい）
        last = nowMs
        const T = tm()
        const el0 = (nowMs - startT) / 1000
        const spd = 12
        tickAcc += dt
        for (let i = 0; i < 3; i++) {
          const r = reels[i]
          if (r.mode === 'spin') {
            r.speed = Math.min(spd, r.speed + dt * 80)
            r.pos += r.speed * dt
          } else if (r.mode === 'slow') {
            r.speed += (3 - r.speed) * Math.min(1, dt * 6)
            r.pos += r.speed * dt
          } else if (r.mode === 'stop') {
            r.t += dt
            const u = Math.min(1, r.t / r.dur)
            r.pos = r.from + (r.to - r.from) * (1 - (1 - u) * (1 - u))
            if (u >= 1) {
              r.pos = r.to
              r.mode = 'idle'
              r.speed = 0
              play([[1400 + i * 400, 0.05]])
              if (i === 1) {
                if (spin.reach > 0) {
                  reachGlow = 1
                  if (!skipSlow && fancy()) {
                    reels[2].mode = 'slow'
                    reachT = el0
                    reels[2].stopAt = el0 + (spin.reach === 2 ? 1.7 : 1.0)
                    res.textContent = spin.reach === 2 ? 'リーチ！！ ドキドキ…' : 'リーチ！'
                    play(arp([1800, 2200, 2600], 0.05, 0.08))
                  } else reels[2].stopAt = el0 + 0.25 * T
                } else reels[2].stopAt = el0 + 0.3 * T
              }
            }
          }
          // とめる時刻になったら、ひとつずつ止める
          if ((r.mode === 'spin' || r.mode === 'slow') && el0 >= r.stopAt && (i === 0 || reels[i - 1].mode === 'idle')) startStop(r, spin.cells[i], r.mode === 'slow' ? 0 : 1)
        }
        // コマがうごく間の「カチカチ」
        if (tickAcc > 0.11 && reels.some((r) => r.mode === 'spin')) {
          tickAcc = 0
          play([[760, 0.012]])
        }
        if (reels[2].mode === 'slow' && Math.floor(el0 * 5) !== Math.floor((el0 - dt) * 5)) play([[1000 + Math.min(1500, (el0 - reachT) * 900), 0.03]])
        for (const c of coinsFx) {
          c.vy += 360 * dt
          c.x += c.vx * dt
          c.y += c.vy * dt
          c.life -= dt
        }
        for (let i = coinsFx.length - 1; i >= 0; i--) if (coinsFx[i].life <= 0) coinsFx.splice(i, 1)
        draw(nowMs)
        if (reels.every((r) => r.mode === 'idle')) {
          running = false
          reachGlow = 0
          draw(nowMs)
          done()
          return
        }
        requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }
    function speedUp() {
      skipSlow = true
      const T = tm()
      const nowEl = (performance.now() - spinStart) / 1000
      reels.forEach((r, i) => {
        if (r.mode === 'spin' || r.mode === 'slow') r.stopAt = Math.min(r.stopAt, nowEl + (i + 1) * 0.12 * T)
        if (r.mode === 'slow') r.mode = 'spin'
      })
    }
    let spinStart = 0
    const burstCoins = (n: number) => {
      for (let i = 0; i < n; i++) coinsFx.push({ x: 112 + (Math.random() - 0.5) * 40, y: 56, vx: (Math.random() - 0.5) * 220, vy: -120 - Math.random() * 160, life: 0.9 + Math.random() * 0.5 })
    }

    async function spin() {
      if (busy) return
      o.beeper.unlock()
      const r = lucky.slotSpin(bets.value())
      if (!r.ok) {
        why.textContent = r.why
        play([[1500, 0.05]])
        return
      }
      busy = true
      hold = lucky.coins - r.total
      skipSlow = false
      stopBtn.hidden = false
      spinBtn.hidden = true
      res.textContent = 'まわってる…'
      refreshAll()
      for (const rl of reels) {
        rl.mode = 'spin'
        rl.speed = 0
      }
      running = true
      spinStart = performance.now()
      play([[1000, 0.04], [1300, 0.04, 0.05], [1600, 0.04, 0.1]])
      await new Promise<void>((resolve) => loop(spinStart, r, resolve))
      // けっか
      const T = tm()
      const jackpot = r.ev.rule === 'tri0'
      res.textContent = r.ev.mult > 0 ? `${r.ev.label}  x${r.ev.mult}  → +${r.pay}コイン` : r.ev.label
      if (r.charm) res.textContent += `  おまもりが まもってくれた！ +${Math.floor(r.cost / 2)}`
      if (r.bonus) res.textContent += `  なぐさめボーナス +${r.bonus}`
      if (r.ev.mult > r.ev.mult * 0 && r.pay > r.cost) {
        flashUntil = performance.now() + 1400 * T
        flashCol = jackpot ? '#ff5a5a' : '#ffd23f'
        if (fancy()) burstCoins(Math.min(40, 6 + r.ev.mult))
        play(jackpot ? [...arp([1047, 1319, 1568, 2093, 2637, 3136, 2637, 3136, 4186], 0.1, 0.1)] : r.ev.mult >= 15 ? arp([1568, 1976, 2349, 3136], 0.09, 0.09) : arp([1568, 2093], 0.07, 0.08))
        if (jackpot) world.luckySay('ジャックポット！！ ほしが そろった！')
        // コインのしぶきを少しの間 描く
        const t0 = performance.now()
        await new Promise<void>((resolve) => {
          const f = (t: number) => {
            for (const c of coinsFx) {
              c.vy += 360 * 0.016
              c.x += c.vx * 0.016
              c.y += c.vy * 0.016
              c.life -= 0.016
            }
            for (let i = coinsFx.length - 1; i >= 0; i--) if (coinsFx[i].life <= 0) coinsFx.splice(i, 1)
            draw(t)
            if (t - t0 < (jackpot ? 1800 : 900) * T && !running) requestAnimationFrame(f)
            else resolve()
          }
          requestAnimationFrame(f)
        })
      } else if (r.ev.mult > 0) play([[1568, 0.05]])
      else play([[700, 0.1], [520, 0.14, 0.12]])
      hold = null
      busy = false
      stopBtn.hidden = true
      spinBtn.hidden = false
      draw(performance.now())
      refreshAll()
      world.save()
    }
    spinBtn.addEventListener('click', () => void spin())
    stopBtn.addEventListener('click', () => {
      play([[1800, 0.04]])
      speedUp()
    })
    function refresh() {
      bets.refresh()
      const b = bets.value()
      const c = lucky.slotCheck(b)
      spinBtn.disabled = busy || c !== true
      const sm = spinBtn.querySelector('small')!
      sm.textContent = `${b}まい = ${b * L.SHEET}コイン`
      why.textContent = busy ? '' : c === true ? '' : c === 'コインが たりない' ? 'コインが たりないよ。「おこづかい」を もらおう' : c
      if (!busy) draw(performance.now())
    }
    const shown = () => {
      fit()
      draw(performance.now())
    }
    window.addEventListener('resize', () => !panel.hidden && shown())
    return {
      root,
      refresh,
      shown,
      /** パネルを閉じる時：回っていたら、すぐ止める */
      abort() {
        if (!running) return
        speedUp()
      },
    }
  }

  // ================= タブ：くじ（ルーレット + おみくじ） =================
  function buildKuji() {
    const root = el('div', 'lk-tab')
    // ---- ルーレット ----
    root.appendChild(el('h3', '', 'いろあてルーレット'))
    const wheelBox = el('div', 'rl-box')
    const wheel = el('canvas', 'rl-wheel', '', { 'aria-label': 'ルーレット', role: 'img' })
    wheelBox.append(wheel, el('div', 'rl-pin'))
    const rres = el('p', 'sl-result', 'いろを えらんで まわそう！', { 'aria-live': 'polite' })
    let pick: L.RColor = 'red'
    const pickRow = el('div', 'lk-bets')
    pickRow.appendChild(el('span', 'lk-label', 'いろ'))
    const pickBtns = (['red', 'blue', 'gold'] as L.RColor[]).map((c) => {
      const b = el('button', `chip rl-${c}`, `${L.COLOR_NAME[c]} x${L.ROULETTE.mult[c]}`, { type: 'button' })
      b.addEventListener('click', () => {
        pick = c
        play([[2200, 0.03]])
        refresh()
      })
      pickRow.appendChild(b)
      return { c, b }
    })
    const rbets = chipRow('かけ金', L.ROULETTE.bets, (v) => `${v}`, (v) => lucky.rouletteCheck(v), 5)
    const rspin = el('button', 'lk-btn', '', { type: 'button' })
    rspin.append(el('b', '', 'まわす'), el('small', '', ''))
    const rwhy = el('p', 'lk-why')
    const rinfo = details('ルーレットの かくりつ', (box) => {
      box.appendChild(
        table(
          (['red', 'blue', 'gold'] as L.RColor[]).map((c) => [L.COLOR_NAME[c], `${L.ROULETTE.cells.filter((x) => x === c).length} / ${L.ROULETTE.cells.length}マス`, pct(L.rouletteP(c), 1), `x${L.ROULETTE.mult[c]}`, pct(L.rouletteRtp(c), 1)]),
          ['いろ', 'マス', 'あたる わりあい', 'ばいりつ', 'きたいち'],
        ),
      )
      box.appendChild(el('p', 'lk-sub', 'ばいりつ = かけ金の何ばいが もどるか（かけ金ふくむ）。ちいさい数は 切りすてです。'))
    })
    root.append(wheelBox, rres, pickRow, rbets.root, rspin, rwhy, rinfo)

    // ルーレットの描画
    const N = L.ROULETTE_RING.length
    let angle = 0
    const wcol: Record<L.RColor, string> = { red: '#e0505a', blue: '#4a80e0', gold: '#ffd23f' }
    function drawWheel() {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const size = 200
      if (wheel.width !== size * dpr) {
        wheel.width = size * dpr
        wheel.height = size * dpr
        wheel.style.width = `${size}px`
        wheel.style.height = `${size}px`
      }
      const g = wheel.getContext('2d')!
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, size, size)
      g.save()
      g.translate(100, 100)
      g.rotate(angle)
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2 - Math.PI / 2
        const a1 = ((i + 1) / N) * Math.PI * 2 - Math.PI / 2
        g.beginPath()
        g.moveTo(0, 0)
        g.arc(0, 0, 94, a0, a1)
        g.closePath()
        g.fillStyle = wcol[L.ROULETTE_RING[i]]
        g.fill()
        g.strokeStyle = '#1d1a17'
        g.lineWidth = 1.5
        g.stroke()
        if (L.ROULETTE_RING[i] === 'gold') {
          g.fillStyle = '#fff7b0'
          g.beginPath()
          const am = (a0 + a1) / 2
          g.arc(Math.cos(am) * 78, Math.sin(am) * 78, 3.5, 0, Math.PI * 2)
          g.fill()
        }
      }
      g.beginPath()
      g.arc(0, 0, 26, 0, Math.PI * 2)
      g.fillStyle = '#1d1a17'
      g.fill()
      g.strokeStyle = '#f2b134'
      g.lineWidth = 3
      g.stroke()
      g.restore()
    }
    async function rouletteGo() {
      if (busy) return
      o.beeper.unlock()
      const r = lucky.rouletteSpin(pick, rbets.value())
      if (!r.ok) {
        rwhy.textContent = r.why
        play([[1500, 0.05]])
        return
      }
      busy = true
      hold = lucky.coins - r.total
      refreshAll()
      rres.textContent = 'まわってる…'
      // 同じ色のマスを 1 つ選んで、その真ん中がピンの位置に来るように止める
      const slots = L.ROULETTE_RING.map((c, i) => (c === r.color ? i : -1)).filter((i) => i >= 0)
      const slot = slots[Math.floor(Math.random() * slots.length)]
      const targetMod = -((slot + 0.5) / N) * Math.PI * 2
      const cur = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
      const T = tm()
      const turns = 3 + Math.floor(Math.random() * 2)
      let to = targetMod - (targetMod % (Math.PI * 2)) + Math.PI * 2 * turns
      while (to - angle < Math.PI * 2 * 2) to += Math.PI * 2
      to = angle - cur + (((targetMod % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) + Math.PI * 2 * turns
      const from = angle
      const dur = 2400 * T
      const t0 = performance.now()
      let lastTick = -1
      await new Promise<void>((resolve) => {
        const f = (t: number) => {
          const u = Math.min(1, (t - t0) / dur)
          const e = 1 - (1 - u) ** 3
          angle = from + (to - from) * e
          const seg = Math.floor(((-angle % (Math.PI * 2)) + Math.PI * 2) / ((Math.PI * 2) / N))
          if (seg !== lastTick) {
            lastTick = seg
            if (u < 0.97) play([[1100 + (1 - u) * 600, 0.012]])
          }
          drawWheel()
          if (u < 1) requestAnimationFrame(f)
          else resolve()
        }
        requestAnimationFrame(f)
      })
      const win = r.pay > 0
      rres.textContent = win ? `${L.COLOR_NAME[r.color]}！ あたり！ x${L.ROULETTE.mult[r.pick]} → +${r.pay}コイン` : `${L.COLOR_NAME[r.color]}… ざんねん`
      if (r.charm) rres.textContent += `  おまもりが まもってくれた！ +${Math.floor(r.bet / 2)}`
      if (r.bonus) rres.textContent += `  なぐさめボーナス +${r.bonus}`
      play(win ? (r.color === 'gold' ? arp([1047, 1319, 1568, 2093, 2637], 0.09, 0.09) : arp([1568, 2093], 0.07, 0.08)) : [[700, 0.1], [520, 0.14, 0.12]])
      hold = null
      busy = false
      refreshAll()
      world.save()
    }
    rspin.addEventListener('click', () => void rouletteGo())

    // ---- おみくじ ----
    root.appendChild(el('h3', '', 'おみくじ'))
    const omiBox = el('div', 'om-box')
    const omiPaper = el('div', 'om-paper', 'おみくじを ひこう')
    const omiToday = el('p', 'lk-sub')
    const omiBtn = el('button', 'lk-btn alt', '', { type: 'button' })
    omiBtn.append(el('b', '', 'ひく'), el('small', '', `${L.FORTUNE_COST}コイン`))
    const owhy = el('p', 'lk-why')
    omiBox.append(omiPaper)
    const oinfo = details('おみくじの かくりつ・こうか', (box) => {
      box.appendChild(
        table(
          L.FORTUNES.map((f) => [f.name, `${f.w}%`, `${f.gift}コイン`, f.income ? `20びょうごとに +${f.income}` : '—']),
          ['うんせい', 'わりあい', 'その場で もらう', 'きょうの ボーナス'],
        ),
      )
      box.appendChild(el('p', 'lk-sub', `1日 ${L.FORTUNE_PER_DAY}かいまで。きょうの うんせいは、いちばん よかったものが 1日 きいてきます。凶がでても、コイン ${L.FORTUNES[5].gift} と「おまもり」（つぎに まけたとき かけ金の はんぶんが もどる。さいだい ${L.CHARM_MAX}こ）がもらえます。`))
    })
    root.append(omiBox, omiToday, omiBtn, owhy, oinfo)

    function showFortune(r: { rank: number; item: number; color: number; gift: number; charm: boolean; best: boolean }) {
      const f = L.FORTUNES[r.rank]
      omiPaper.replaceChildren()
      omiPaper.style.setProperty('--fc', f.color)
      omiPaper.append(
        el('b', 'om-rank', f.name),
        el('span', '', f.msg),
        el('small', '', `ラッキーアイテム：${L.LUCKY_ITEMS[r.item]} ／ ラッキーいろ：${L.LUCKY_COLORS[r.color]}`),
        el('small', '', `コイン +${r.gift}${r.charm ? ' ／ おまもりを もらった！' : ''}${r.best ? '' : ' ／ きょうは さっきの ほうが よかったので そのまま'}`),
      )
      try {
        omiPaper.animate([{ transform: 'rotate(-4deg) scale(.7)', opacity: 0 }, { transform: 'rotate(2deg) scale(1.08)', opacity: 1, offset: 0.6 }, { transform: 'rotate(0) scale(1)', opacity: 1 }], { duration: 480 * tm() + 1, fill: 'forwards' })
      } catch {
        /* noop */
      }
    }
    async function draw() {
      if (busy) return
      o.beeper.unlock()
      const r = lucky.fortuneDraw()
      if (!r.ok) {
        owhy.textContent = r.why
        play([[1500, 0.05]])
        return
      }
      busy = true
      refreshAll()
      omiPaper.textContent = 'からから…'
      play([[600, 0.03], [700, 0.03, 0.08], [600, 0.03, 0.16], [700, 0.03, 0.24]])
      await sleepMs(600 * tm())
      showFortune(r)
      play(r.rank <= 1 ? arp([1568, 2093, 2637], 0.08, 0.09) : r.rank >= 5 ? [[900, 0.08], [1100, 0.1, 0.1]] : arp([1568, 1976], 0.07, 0.08))
      busy = false
      refreshAll()
      world.save()
    }
    omiBtn.addEventListener('click', () => void draw())

    function refresh() {
      pickBtns.forEach(({ c, b }) => {
        b.setAttribute('aria-pressed', String(c === pick))
        b.disabled = busy
      })
      rbets.refresh()
      const b = rbets.value()
      const chk = lucky.rouletteCheck(b)
      rspin.disabled = busy || chk !== true
      rspin.querySelector('small')!.textContent = `${L.COLOR_NAME[pick]}に ${b}コイン`
      rwhy.textContent = busy ? '' : chk === true ? '' : chk === 'コインが たりない' ? 'コインが たりないよ。「おこづかい」を もらおう' : chk
      const left = lucky.fortuneLeft()
      omiBtn.disabled = busy || left <= 0 || lucky.coins < L.FORTUNE_COST
      owhy.textContent = busy ? '' : left <= 0 ? 'きょうの おみくじは おしまい。あしたまた！' : lucky.coins < L.FORTUNE_COST ? 'コインが たりないよ' : ''
      omiBtn.querySelector('small')!.textContent = `${L.FORTUNE_COST}コイン・きょう あと ${left}かい`
      const f = lucky.fortune()
      if (f && !busy && !omiPaper.querySelector('.om-rank')) showFortune({ rank: f.rank, item: f.item, color: f.color, gift: L.FORTUNES[f.rank].gift, charm: false, best: true })
      const fo = f ? L.FORTUNES[f.rank] : null
      omiToday.textContent = fo ? `きょうの うんせい：${fo.name}　${fo.income ? `20びょうごとのコインが +${fo.income}` : 'ボーナスは なし'}　おまもり ${lucky.st.charm}こ` : `きょうは まだ ひいていないよ　おまもり ${lucky.st.charm}こ`
    }
    return { root, refresh, shown: drawWheel }
  }

  // ================= タブ：よそう =================
  function buildPredict() {
    const root = el('div', 'lk-tab')
    const toggle = el('button', 'chip', '', { type: 'button' })
    const status = el('p', 'lk-sub')
    const histEl = el('div', 'pd-hist')
    const info = details('よそうの ルール・ばいりつ', (box) => {
      box.appendChild(el('p', 'lk-sub', 'はこにわで なかまの「じゃれあいバトル」が はじまると、画面の下に「どっちが かつ？」のバーが 7びょう だけ でます。かけ金（5・10・20）を えらんで、かつと思うほうを おします。'))
      box.appendChild(el('p', 'lk-sub', `ばいりつ：つよさ（たいりょく x こうげき）・あいしょう・おうえんから「かつ みこみ」を出し、${L.PREDICT.edge} ÷ みこみ（x${L.PREDICT.minOdds}〜x${L.PREDICT.maxOdds}）。あたると かけ金 x ばいりつ（四捨五入）が もどります。みこみは めやすで、じっさいの バトルは ぐうぜんで かわります。`))
      box.appendChild(
        table(
          [
            ['あいしょう', 'みず → りゅう → きかい → みず、ねこ → とり → いぬ → ねこ（つよい ほうが 1.2ばい）'],
            ['おうえん', 'おうえんした子は 1.1ばい'],
            ['きたいち', `みこみどおりなら およそ ${Math.round(L.PREDICT.edge * 100)}%`],
          ],
          ['', ''],
        ),
      )
      box.appendChild(el('p', 'lk-sub', 'バトルが とちゅうで おわった時は かけ金が もどります。'))
    })
    root.append(el('h3', '', 'バトルよそう'), toggle, status, el('h3', '', 'さいきんの けっか'), histEl, info)
    toggle.addEventListener('click', () => {
      lucky.st.predictOn = !lucky.st.predictOn
      if (!lucky.st.predictOn && lucky.market && !lucky.market.bet) lucky.market = null
      barRefresh()
      refreshAll()
      world.save()
    })
    function refresh() {
      toggle.setAttribute('aria-pressed', String(lucky.st.predictOn))
      toggle.textContent = lucky.st.predictOn ? 'バトルよそう：つかう' : 'バトルよそう：つかわない'
      const m = lucky.market
      status.textContent = !lucky.st.predictOn ? 'バーは でません。' : m ? `いま：${m.m.a.name} と ${m.m.b.name} が じゃれあい中！` : 'じゃれあいバトルが はじまるのを まっているよ。はこにわを みまもろう。'
      histEl.replaceChildren()
      if (!lucky.st.history.length) histEl.appendChild(el('p', 'lk-sub', 'まだ ないよ'))
      for (const h of [...lucky.st.history].reverse()) {
        const d = el('div', `pd-row ${h.r}`)
        d.append(el('span', '', `${h.a} vs ${h.b}`), el('b', '', h.r === 'win' ? `あたり +${h.pay - h.bet}` : h.r === 'void' ? 'ちゅうし（かえった）' : `はずれ ${h.pay ? `-${h.bet - h.pay}` : `-${h.bet}`}`))
        histEl.appendChild(d)
      }
    }
    return { root, refresh }
  }

  // ================= パネルの組み立て =================
  const tabs = [
    { id: 'gacha', name: 'ガチャ', t: buildGacha() },
    { id: 'slot', name: 'スロット', t: buildSlot() },
    { id: 'kuji', name: 'くじ', t: buildKuji() },
    { id: 'yosou', name: 'よそう', t: buildPredict() },
  ]
  let cur = 0
  tabs.forEach((tab, i) => {
    const b = el('button', 'lk-tabbtn', tab.name, { type: 'button', role: 'tab', id: `lk-tab-${tab.id}` })
    b.addEventListener('click', () => {
      o.beeper.unlock()
      if (busy) return
      select(i)
    })
    tabsEl.appendChild(b)
    tab.t.root.hidden = i !== 0
    body.appendChild(tab.t.root)
  })
  function select(i: number) {
    cur = i
    tabs.forEach((tab, j) => {
      tab.t.root.hidden = j !== i
      tabsEl.children[j].setAttribute('aria-selected', String(j === i))
    })
    if ('shown' in tabs[i].t) (tabs[i].t as { shown: () => void }).shown()
    refreshAll()
  }

  function refreshAll() {
    coinsEl.textContent = `コイン ${hold ?? lucky.coins}`
    const t = lucky.st.today
    const net = t.net
    dayEl.replaceChildren(
      el('span', '', 'きょうの かちまけ '),
      el('b', net > 0 ? 'plus' : net < 0 ? 'minus' : '', sign(net)),
      el('span', '', `　ガチャ ${t.gachaSpent}コイン　あそんだ ${t.plays}かい`),
    )
    if (lucky.restricted()) dayEl.appendChild(el('em', 'lk-warn', 'きょうは ちいさい かけだけ。ほどほどに ね'))
    const left = lucky.allowanceLeft()
    allowBtn.textContent = `おこづかい（のこり ${left}）`
    allowBtn.disabled = busy || left <= 0 || lucky.coins >= L.ALLOW.below
    allowBtn.title = left <= 0 ? 'きょうは もうないよ' : lucky.coins >= L.ALLOW.below ? `コインが ${L.ALLOW.below} こ未満の ときに もらえるよ` : `${L.ALLOW.amount}コイン もらえるよ`
    tabs[cur].t.refresh()
    // 他のタブも、状態だけは新しくしておく（コインが変わるため）
    tabs.forEach((tab, j) => j !== cur && tab.t.refresh())
  }

  allowBtn.addEventListener('click', () => {
    o.beeper.unlock()
    const r = lucky.allowance()
    if (!r.ok) {
      say(r.why)
      play([[1500, 0.05]])
    } else {
      say(`おこづかい +${r.amount}コイン。むりのない ように あそぼうね`)
      play(arp([1568, 2093], 0.07, 0.08))
      world.save()
    }
    refreshAll()
  })

  // ---------------- 開く・閉じる ----------------
  const others = () => [...document.querySelectorAll<HTMLElement>('section[id$="-panel"]')].filter((e) => e !== panel)
  function open(on: boolean) {
    if (on === !panel.hidden) return
    panel.hidden = !on
    openBtn.setAttribute('aria-expanded', String(on))
    if (on) {
      for (const p of others()) {
        p.hidden = true
        document.querySelectorAll(`[aria-controls="${p.id}"]`).forEach((b) => b.setAttribute('aria-expanded', 'false'))
      }
      lucky.tick()
      select(cur)
    } else {
      for (const t of tabs) if ('abort' in t.t) (t.t as { abort: () => void }).abort()
    }
  }
  openBtn.addEventListener('click', () => {
    o.beeper.unlock()
    play([[2200, 0.04]])
    open(panel.hidden)
  })
  $('lucky-close').addEventListener('click', () => open(false))
  // ほかのパネル（きせかえ・ずかん など）が開いたら、こちらを閉じる
  new MutationObserver(() => {
    if (!panel.hidden && others().some((p) => !p.hidden)) open(false)
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] })
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && !panel.hidden) open(false)
  })

  // ================= バトル予想のバー =================
  const bar = $('bet-bar')
  const barTitle = $('bb-title')
  const barSides = [$<HTMLButtonElement>('bb-a'), $<HTMLButtonElement>('bb-b')]
  const barBets = $('bb-bets')
  const barInfo = $('bb-info')
  const barTime = $<HTMLElement>('bb-time')
  const barSkip = $<HTMLButtonElement>('bb-skip')
  let barAmount: number = L.PREDICT.bets[0]
  let barResultUntil = 0
  const betBtns = L.PREDICT.bets.map((v) => {
    const b = el('button', 'chip', `${v}`, { type: 'button' })
    b.addEventListener('click', () => {
      barAmount = v
      play([[2200, 0.03]])
      barRefresh()
    })
    barBets.appendChild(b)
    return b
  })
  function barRefresh() {
    const m = lucky.market
    const showResult = Date.now() < barResultUntil
    bar.hidden = !(m || showResult)
    if (!m) return
    const left = Math.max(0, m.closes - Date.now())
    const open = !m.bet && left > 0
    barTitle.textContent = m.bet ? 'よそうした！ けっかを まとう' : 'どっちが かつ？'
    barSides[0].replaceChildren(el('b', '', m.m.a.name), el('small', '', `x${m.odds.odds[0].toFixed(1)}  ${m.m.a.cheer ? 'おうえん' : `HP${m.m.a.hp}`}`))
    barSides[1].replaceChildren(el('b', '', m.m.b.name), el('small', '', `x${m.odds.odds[1].toFixed(1)}  ${m.m.b.cheer ? 'おうえん' : `HP${m.m.b.hp}`}`))
    barSides.forEach((b, i) => {
      b.disabled = !open || lucky.predictCheck(barAmount) !== true
      b.setAttribute('aria-pressed', String(m.bet?.side === i))
    })
    L.PREDICT.bets.forEach((v, i) => {
      const r = lucky.predictCheck(v)
      betBtns[i].disabled = !open || r !== true
      betBtns[i].title = r === true ? '' : r
      betBtns[i].setAttribute('aria-pressed', String(v === (m.bet?.amount ?? barAmount)))
    })
    if (open && lucky.predictCheck(barAmount) !== true) {
      const ok = L.PREDICT.bets.filter((v) => lucky.predictCheck(v) === true)
      if (ok.length) barAmount = ok[ok.length - 1]
    }
    barTime.textContent = m.bet ? `${m.bet.amount}コイン` : open ? `あと ${Math.ceil(left / 1000)}びょう` : ''
    const why = lucky.predictCheck(barAmount)
    barInfo.textContent = m.bet
      ? `${m.m[m.bet.side === 0 ? 'a' : 'b'].name}に ${m.bet.amount}コイン（あたると ${Math.round(m.bet.amount * m.odds.odds[m.bet.side])}）`
      : !open
        ? 'うけつけは おわりました'
        : why === true
          ? `かけ金 ${barAmount}コイン。かつと おもうほうを おしてね`
          : `${why}（かけられないよ）`
  }
  barSides.forEach((b, i) =>
    b.addEventListener('click', () => {
      o.beeper.unlock()
      const r = lucky.predictBet(i as 0 | 1, barAmount)
      if (!r.ok) {
        barInfo.textContent = r.why
        play([[1500, 0.05]])
      } else {
        play([[1800, 0.05], [2400, 0.05, 0.06]])
        world.save()
      }
      barRefresh()
      refreshAll()
    }),
  )
  barSkip.addEventListener('click', () => {
    if (lucky.market && !lucky.market.bet) lucky.market = null
    barRefresh()
  })
  world.onSparStart = (m) => {
    lucky.predictOpen(m)
    if (lucky.market?.id === m.id) play([[1319, 0.05], [1760, 0.06, 0.07]])
    barRefresh()
  }
  world.onSparEnd = (id, winner) => {
    const r = lucky.predictEnd(id, winner)
    if (r) {
      const win = r.r === 'win'
      const txt = r.r === 'void' ? 'バトルが ちゅうし。かけ金が もどったよ' : win ? `あたり！ +${r.pay - r.bet}コイン（x${(r.pay / r.bet).toFixed(1)}）` : `ざんねん… -${r.bet - r.total}コイン${r.charm ? '（おまもりで はんぶん もどった）' : ''}${r.bonus ? ` なぐさめ +${r.bonus}` : ''}`
      barTitle.textContent = txt
      barInfo.textContent = ''
      barResultUntil = Date.now() + 3500
      bar.hidden = false
      world.luckySay(`よそう：${txt}`)
      play(win ? arp([1568, 2093, 2637], 0.08, 0.09) : [[700, 0.1], [520, 0.14, 0.12]])
      world.save()
      setTimeout(barRefresh, 3600)
    } else barRefresh()
    refreshAll()
  }

  // ---------------- 1 秒ごとの見まわり ----------------
  setInterval(() => {
    lucky.tick()
    if (lucky.market || Date.now() < barResultUntil) barRefresh()
    if (!panel.hidden) refreshAll()
  }, 1000)
  setInterval(() => lucky.market && !panel.hidden === false && barRefresh(), 250)
  window.addEventListener('pagehide', () => world.save())
  refreshAll()

  return {
    lucky,
    /** 「画面に入る」とき：ボタンとパネルをかくす */
    setInside(inside: boolean) {
      openBtn.hidden = inside
      if (inside) open(false)
    },
    open,
  }
}
