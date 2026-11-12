/**
 * にっきの画面（#journal-btn / #journal-panel）と、起動時の「おかえりレポート」（#welcome-back）。
 * 要素はここで作る（index.html / main.ts を触らず、ほかの機能と衝突しないように）。
 * 文字は textContent だけで入れる。留守の早送りは World.beginAway() を毎フレーム少しずつ進める。
 */
import './journal.css'
import type { World } from './world/World'
import { Journal, KIND_COLOR, KIND_LABEL, MAX_AWAY, MIN_AWAY, buildReport, clockLabel, dayLabel, dayOf, spanLabel, type Entry, type Kind, type Report } from './journal'

type Filter = 'all' | 'diary' | 'letter' | 'event'
const FILTERS: [Filter, string][] = [['all', 'すべて'], ['diary', 'にっき'], ['letter', 'てがみ'], ['event', 'できごと']]

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

export interface JournalUI {
  journal: Journal
  /** 留守の早送り中は true（このあいだ World.update を止める） */
  readonly busy: boolean
}

export function initJournal(world: World): JournalUI {
  const journal = new Journal()
  journal.facts = () => world.journalFacts()
  world.onNote = (t) => journal.note(t)
  const safeSave = () => {
    if (!world.saveLocked) journal.save()
  }
  world.onSave = safeSave

  // ---------------- ボタンとパネル ----------------
  const btn = el('button', undefined, 'にっき')
  btn.id = 'journal-btn'
  btn.type = 'button'
  btn.setAttribute('aria-expanded', 'false')
  btn.setAttribute('aria-controls', 'journal-panel')
  const dot = el('span', 'dot')
  dot.setAttribute('aria-hidden', 'true')
  btn.appendChild(dot)

  const panel = el('section')
  panel.id = 'journal-panel'
  panel.hidden = true
  panel.setAttribute('aria-label', 'にっき')
  const top = el('div', 'jr-top')
  top.append(el('h2', undefined, 'にっき'))
  const close = el('button', undefined, 'とじる')
  close.id = 'journal-close'
  close.type = 'button'
  close.setAttribute('aria-label', '閉じる')
  top.appendChild(close)
  const filters = el('div', 'jr-filters')
  const body = el('div')
  body.setAttribute('aria-live', 'polite')
  panel.append(top, filters, body)
  document.body.append(btn, panel)

  let filter: Filter = 'all'
  const fbtns = new Map<Filter, HTMLButtonElement>()
  for (const [id, label] of FILTERS) {
    const b = el('button', 'jr-filter', label)
    b.type = 'button'
    b.setAttribute('aria-pressed', String(id === filter))
    b.addEventListener('click', () => {
      filter = id
      for (const [k, x] of fbtns) x.setAttribute('aria-pressed', String(k === id))
      render()
    })
    fbtns.set(id, b)
    filters.appendChild(b)
  }

  function refreshDot() {
    btn.classList.toggle('has-new', journal.unread > 0)
    btn.setAttribute('aria-label', journal.unread > 0 ? `にっき（あたらしい おしらせが ${journal.unread}つ あるよ）` : 'にっき')
  }
  journal.onChange = () => {
    refreshDot()
    if (!panel.hidden) render()
  }

  /** 日付ごとに まとめて表示する */
  function render() {
    body.replaceChildren()
    const days = new Map<number, { diaries: typeof journal.diaries; letters: typeof journal.letters; events: Entry[] }>()
    const day = (k: number) => {
      let d = days.get(k)
      if (!d) days.set(k, (d = { diaries: [], letters: [], events: [] }))
      return d
    }
    if (filter === 'all' || filter === 'diary') for (const x of journal.diaries) day(x.d).diaries.push(x)
    if (filter === 'all' || filter === 'letter') for (const x of journal.letters) day(dayOf(x.t)).letters.push(x)
    if (filter === 'all' || filter === 'event') for (const x of journal.entries) day(dayOf(x.t)).events.push(x)
    if (!days.size) {
      body.appendChild(el('p', 'jr-empty', filter === 'letter' ? 'まだ てがみは とどいていないよ。 なかまが よろこぶと、ときどき くれるよ。' : 'まだ なにも かかれていないよ。 みまもっていると、ここに できごとや にっきが たまっていくよ。'))
      return
    }
    const now = Date.now()
    for (const k of [...days.keys()].sort((a, b) => b - a)) {
      const d = days.get(k)!
      body.appendChild(el('h3', 'jr-day', dayLabel(k, now)))
      for (const x of d.diaries) {
        const c = el('div', 'jr-card jr-diary')
        const h = el('div', 'jr-head')
        h.append(el('span', undefined, `${journal.facts()?.pet ?? 'ペット'}の にっき`))
        if (x.n) h.append(el('span', 'jr-new', 'new'))
        c.append(h, document.createTextNode(x.s))
        body.appendChild(c)
      }
      for (const x of d.letters) {
        const c = el('div', 'jr-card jr-letter')
        const h = el('div', 'jr-head')
        h.append(el('span', undefined, `✉ ${x.from}より　${clockLabel(x.t)}`))
        if (x.n) h.append(el('span', 'jr-new', 'new'))
        c.append(h, document.createTextNode(x.s))
        body.appendChild(c)
      }
      for (const e of d.events) {
        const r = el('p', 'jr-ev')
        const tag = el('span', 'tag', KIND_LABEL[e.k as Kind])
        tag.style.background = KIND_COLOR[e.k as Kind]
        const tm = el('time', undefined, clockLabel(e.t))
        r.append(tm, tag, el('span', undefined, e.s))
        body.appendChild(r)
      }
    }
  }

  function openPanel(on: boolean) {
    panel.hidden = !on
    btn.setAttribute('aria-expanded', String(on))
    if (on) {
      // 新着の印はこの表示では残し、見たあとに消す
      for (const id of ['dress-panel', 'dex-panel']) {
        const p = document.getElementById(id)
        if (p) p.hidden = true
      }
      render()
      journal.markAllRead()
      journal.save()
      refreshDot()
      panel.scrollTop = 0
    }
  }
  btn.addEventListener('click', () => openPanel(panel.hidden === true))
  close.addEventListener('click', () => openPanel(false))
  // きせかえ・ずかんが開いたら、にっきは閉じる。本体の中に入っている間は ボタンを隠す
  const watch = (id: string, fn: (hidden: boolean) => void) => {
    const t = document.getElementById(id)
    if (t) new MutationObserver(() => fn(t.hidden === true)).observe(t, { attributes: true, attributeFilter: ['hidden'] })
  }
  for (const id of ['dress-panel', 'dex-panel']) watch(id, (h) => !h && openPanel(false))
  watch('pad', (h) => {
    btn.hidden = !h
    if (!h) openPanel(false)
  })
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && !panel.hidden) openPanel(false)
  })

  // ---------------- おかえりレポート ----------------
  const wb = el('div')
  wb.id = 'welcome-back'
  wb.hidden = true
  wb.setAttribute('role', 'dialog')
  wb.setAttribute('aria-modal', 'true')
  wb.setAttribute('aria-labelledby', 'wb-title')
  const card = el('div', 'wb-card')
  const wbTitle = el('h2', undefined, 'おかえり！')
  wbTitle.id = 'wb-title'
  const wbSub = el('p', 'wb-sub')
  const wbBar = el('div', 'wb-bar')
  const wbFill = el('i')
  wbBar.appendChild(wbFill)
  const wbList = el('ul')
  wbList.id = 'wb-list'
  const btns = el('div', 'wb-btns')
  const ok = el('button', undefined, 'ただいま！')
  ok.id = 'wb-ok'
  ok.type = 'button'
  const seeJ = el('button', undefined, 'にっきを みる')
  seeJ.id = 'wb-journal'
  seeJ.type = 'button'
  btns.append(ok, seeJ)
  card.append(wbTitle, wbSub, wbBar, wbList, btns)
  wb.appendChild(card)
  document.body.appendChild(wb)
  // 開いているあいだ、ほかのキー操作（Enter で画面に入る等）を受けない
  wb.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.code === 'Escape') ok.click()
  })

  let gift = 0
  let busy = false
  const closeWb = (openJournal: boolean) => {
    if (gift > 0) {
      world.coins += gift
      gift = 0
      world.save()
    }
    wb.hidden = true
    if (openJournal) openPanel(true)
  }
  ok.addEventListener('click', () => closeWb(false))
  seeJ.addEventListener('click', () => closeWb(true))

  function showReport(r: Report) {
    wbTitle.textContent = r.title
    wbSub.textContent = 'るすの あいだの できごと'
    wbBar.hidden = true
    wbList.replaceChildren(...r.lines.map((l) => el('li', undefined, l)))
    gift = r.gift
    ok.textContent = `ただいま！　おみやげ コイン +${r.gift}`
    ok.disabled = false
    seeJ.hidden = false
    ok.focus()
  }

  /** 戻ってきた時：前回から 5 分以上たっていれば、留守のぶんを早送りしてレポートを出す */
  async function arrive() {
    if (busy) return
    const now = Date.now()
    const last = journal.lastSeen
    journal.tick(0)
    // 時計が戻っている（最後に見た時刻より前）なら、留守とは数えない
    const awaySec = last > 0 && now > last ? (now - last) / 1000 : 0
    if (awaySec < MIN_AWAY) {
      safeSave()
      return
    }
    busy = journal.busy = true
    // 早送りのあいだは自動セーブを止める（途中で閉じても、次にまた最初から数えられる）
    const wasLocked = world.saveLocked
    world.saveLocked = true
    const total = Math.min(awaySec, MAX_AWAY)
    const base = now - total * 1000
    wb.hidden = false
    wbTitle.textContent = 'おかえり！'
    wbSub.textContent = 'るすの ようすを みているよ…'
    wbBar.hidden = false
    wbFill.style.width = '0%'
    wbList.replaceChildren()
    seeJ.hidden = true
    ok.disabled = true
    ok.textContent = 'ちょっと まってね'
    const before = world.journalFacts()
    const t0 = performance.now()
    const job = world.beginAway(total, (f) => (journal.clock = base + f * total * 1000))
    await new Promise<void>((resolve) => {
      const step = () => {
        const done = job.run(18)
        wbFill.style.width = `${Math.round(job.frac * 100)}%`
        if (done) resolve()
        else requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    })
    journal.clock = null
    const cost = performance.now() - t0
    const after = world.journalFacts()
    const since = journal.entries.filter((e) => e.t >= base && e.k !== 'away')
    const newLetters = journal.letters.filter((l) => l.n && l.t >= base).length
    const report = buildReport(before, after, awaySec, since, newLetters)
    journal.addEntry('away', `${spanLabel(awaySec)} るすに した。 ${report.lines.slice(0, 3).join('、')}`)
    world.saveLocked = wasLocked
    busy = journal.busy = false
    world.save()
    safeSave()
    showReport(report)
    ;(window as unknown as { __journalCost?: number }).__journalCost = cost
  }

  // ---------------- 動かす ----------------
  refreshDot()
  setInterval(() => {
    if (!document.hidden && !busy) journal.tick(1)
  }, 1000)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) safeSave()
    else void arrive()
  })
  window.addEventListener('pagehide', safeSave)
  void arrive()

  const api = {
    journal,
    get busy() {
      return busy
    },
  }
  ;(window as unknown as { __journal: object }).__journal = { ...api, arrive, render, world }
  return api
}
