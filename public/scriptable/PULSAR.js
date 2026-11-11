// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: seedling;
/*
 * PULSAR のウィジェット（Scriptable 用）
 *
 * つかいかた
 *   1. このスクリプトを Scriptable に貼りつけて、名前を「PULSAR」にする
 *   2. PULSAR（アプリ）の せってい → ウィジェット →「ウィジェットに送る」→「Scriptable をひらく」
 *      （または、コードをコピーしてから このスクリプトを実行する）
 *   3. ホーム画面に Scriptable のウィジェット（小・中・大）を置き、長押し →「ウィジェットを編集」→ Script で PULSAR を選ぶ
 *
 * 箱庭の景色は「送った時」のもの。生き物の居場所・ねている/起きている・天気のようすは、
 * ウィジェットが新しくなるたび（15 分ほどごと）に時刻から決めなおす。ネットにはつながない。
 */

const PREFIX = 'PULSARW1:'
const FILE = 'pulsar-widget.json'
const MAX_CODE = 3000000

const fm = FileManager.local()
const path = fm.joinPath(fm.documentsDirectory(), FILE)

// ---------------- 読みこみ（コードは信用しないで中身を確かめる） ----------------
function decode(text) {
  if (typeof text !== 'string') return null
  const code = text.trim().replace(/\s+/g, '')
  if (!code.startsWith(PREFIX) || code.length > MAX_CODE) return null
  let d
  try {
    const raw = Data.fromBase64String(code.slice(PREFIX.length))
    d = JSON.parse(raw.toRawString())
  } catch (e) {
    return null
  }
  return clean(d)
}

const num = (v, lo, hi, def) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def)
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '')
const isImg = (v) => typeof v === 'string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v)

function clean(d) {
  if (!d || typeof d !== 'object' || d.v !== 1 || !isImg(d.image)) return null
  const sprites = {}
  if (d.sprites && typeof d.sprites === 'object')
    for (const k of Object.keys(d.sprites).slice(0, 16)) if (isImg(d.sprites[k])) sprites[str(k, 40)] = d.sprites[k]
  const who = (Array.isArray(d.who) ? d.who : [])
    .slice(0, 10)
    .filter((c) => c && sprites[c.sprite])
    .map((c) => ({
      name: str(c.name, 16),
      sprite: str(c.sprite, 40),
      team: ['pet', 'friend', 'wild'].includes(c.team) ? c.team : 'wild',
      foe: !!c.foe,
      night: !!c.night,
      float: !!c.float,
      h: num(c.h, 0.3, 4, 1.2),
    }))
  const spots = (Array.isArray(d.spots) ? d.spots : [])
    .slice(0, 40)
    .map((p) => ({ u: num(p && p.u, 0, 1, 0.5), v: num(p && p.v, 0, 1, 0.7), k: num(p && p.k, 0.005, 0.6, 0.08) }))
  const url = typeof d.url === 'string' && /^https:\/\/[^\s"'<>]+$/.test(d.url) ? d.url : ''
  return {
    v: 1,
    at: num(d.at, 0, 4e12, Date.now()),
    url,
    stage: str(d.stage, 24),
    village: str(d.village, 24),
    weather: ['sun', 'cloud', 'rain', 'snow', 'ember'].includes(d.weather) ? d.weather : 'sun',
    night: num(d.night, 0, 1, 0),
    gen: Math.round(num(d.gen, 1, 9999, 1)),
    houses: Math.round(num(d.houses, 0, 999, 0)),
    image: d.image,
    spots: spots.length ? spots : [{ u: 0.5, v: 0.7, k: 0.08 }],
    who,
    sprites,
  }
}

function loadSaved() {
  if (!fm.fileExists(path)) return null
  try {
    return clean(JSON.parse(fm.readString(path)))
  } catch (e) {
    return null
  }
}

// ---------------- 時刻から「いまのようす」を決める ----------------
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function dayPart(h) {
  if (h >= 5 && h < 9) return 'morning'
  if (h >= 9 && h < 16) return 'day'
  if (h >= 16 && h < 19) return 'evening'
  return 'night'
}

// 1 匹ずつ「なにをしているか」。夜はたいてい ねている（夜の子は起きている）
function actOf(c, part, r) {
  const awakeAtNight = c.night || c.foe
  if (part === 'night' && !awakeAtNight) return r() < 0.85 ? 'sleep' : 'look'
  if (part !== 'night' && c.night) return 'hide'
  if (c.foe) return r() < 0.5 ? 'prowl' : 'walk'
  const acts = part === 'morning' ? ['eat', 'eat', 'walk', 'play', 'stretch'] : part === 'evening' ? ['build', 'walk', 'eat', 'play', 'rest'] : ['build', 'build', 'walk', 'play', 'rest', 'eat']
  return acts[Math.floor(r() * acts.length)]
}

const ACT_TEXT = {
  sleep: 'すやすや ねている',
  look: 'よぞらを みている',
  walk: 'おさんぽ している',
  play: 'あそんでいる',
  eat: 'ごはんを たべている',
  build: 'いえを つくっている',
  rest: 'ひなたぼっこ している',
  stretch: 'のびを している',
  prowl: 'うろうろ している',
}
const ACT_MARK = { sleep: 'z', play: '♪', eat: '♥', build: '!', prowl: '?', look: '☆' }

// ---------------- 描く ----------------
const SIZES = {
  small: [170, 170],
  medium: [364, 170],
  large: [364, 382],
  extraLarge: [748, 382],
}

const imgCache = {}
function imageOf(dataUrl) {
  if (!imgCache[dataUrl]) imgCache[dataUrl] = Image.fromData(Data.fromBase64String(dataUrl.split(',')[1]))
  return imgCache[dataUrl]
}

function pill(ctx, x, y, w, h, alpha) {
  const p = new Path()
  p.addRoundedRect(new Rect(x, y, w, h), h / 2, h / 2)
  ctx.addPath(p)
  ctx.setFillColor(new Color('#1a1530', alpha))
  ctx.fillPath()
}

function text(ctx, s, x, y, w, size, color, align) {
  ctx.setFont(Font.boldRoundedSystemFont(size))
  ctx.setTextColor(color)
  if (align === 'right') ctx.setTextAlignedRight()
  else if (align === 'center') ctx.setTextAlignedCenter()
  else ctx.setTextAlignedLeft()
  ctx.drawTextInRect(s, new Rect(x, y, w, size * 1.4))
}

function ago(at, now) {
  const m = Math.floor((now - at) / 60000)
  if (m < 60) return `${Math.max(1, m)}ふんまえ`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}じかんまえ`
  return `${Math.floor(h / 24)}にちまえ`
}

function render(d, family, now) {
  const [W, H] = SIZES[family] || SIZES.medium
  const ctx = new DrawContext()
  ctx.size = new Size(W, H)
  ctx.opaque = true
  ctx.respectScreenScale = true

  const date = new Date(now)
  const part = dayPart(date.getHours())
  // 15 分ごとに みんなの居場所とようすが変わる
  const slot = Math.floor(now / (15 * 60000))
  const r = rng(slot * 7919 + d.at % 100000)

  // 景色：ウィジェットの形に合わせて切りぬく（地面の多い下寄りを残す）
  const bg = imageOf(d.image)
  const S = bg.size.width
  // 小さいウィジェットほど寄って、生き物を大きく見せる
  const zoom = { small: 1.55, medium: 1.2, large: 1.1, extraLarge: 1.0 }[family] || 1.2
  const sc = Math.max(W / S, H / S) * zoom
  const dw = S * sc
  const dx = (W - dw) / 2
  const dy = (H - dw) * 0.62
  ctx.drawImageInRect(bg, new Rect(dx, dy, dw, dw))

  // 時間帯の色（送った時がすでに夜なら、さらに暗くはしない）
  const dark = Math.max(0, { morning: 0.08, day: 0, evening: 0.12, night: 0.5 }[part] - d.night * 0.5)
  const tint = { morning: '#ff9ec4', day: '#ffffff', evening: '#ff7a2a', night: '#0b1240' }[part]
  if (part !== 'day') {
    ctx.setFillColor(new Color(tint, part === 'night' ? dark : part === 'evening' ? 0.2 : 0.12))
    ctx.fillRect(new Rect(0, 0, W, H))
  }
  if (part === 'night' || part === 'evening') {
    // ほたる（ぼんやり光る輪 + 芯）
    const n = part === 'night' ? 12 : 4
    for (let i = 0; i < n; i++) {
      const x = r() * W
      const y = H * 0.2 + r() * H * 0.7
      ctx.setFillColor(new Color('#d8ff6a', 0.18))
      ctx.fillEllipse(new Rect(x - 5, y - 5, 10, 10))
      ctx.setFillColor(new Color('#f4ffb0', 0.95))
      ctx.fillRect(new Rect(x - 1, y - 1, 2, 2))
    }
  }

  // 生き物：空いている場所に（重ならないように）立たせる。奥から順に描く
  const spots = d.spots
    .map((p) => ({ x: dx + p.u * dw, y: dy + p.v * dw, k: p.k * dw }))
    .filter((p) => p.x > 14 && p.x < W - 14 && p.y > H * 0.28 && p.y < H - 26)
  const pool = spots.slice()
  const placed = []
  // ペットはまんなかに近い場所（ゆらぎつき）、ほかの子はばらばらに
  const near = (p) => Math.hypot(p.x - W / 2, (p.y - H * 0.58) * 1.4) * (0.7 + r() * 0.6)
  for (const c of d.who) {
    const act = actOf(c, part, r)
    if (act === 'hide') continue
    if (!pool.length) break
    let i = Math.floor(r() * pool.length)
    if (c.team === 'pet') i = pool.reduce((best, p, j) => (near(p) < near(pool[best]) ? j : best), 0)
    const p = pool.splice(i, 1)[0]
    placed.push({ c, act, p })
  }
  placed.sort((a, b) => a.p.y - b.p.y)
  for (const { c, act, p } of placed) {
    const img = imageOf(d.sprites[c.sprite])
    // ドット絵は 68×64 で、足もとは下から 4px ほど上
    const h = Math.max(18, Math.min(H * 0.55, c.h * p.k * 1.25))
    const w = (h * img.size.width) / img.size.height
    const lift = c.float ? h * 0.18 : 0
    const y0 = p.y - h + h * 0.06 - lift - (act === 'play' ? h * 0.12 : 0)
    // かげ
    ctx.setFillColor(new Color('#000000', 0.28))
    ctx.fillEllipse(new Rect(p.x - w * 0.28, p.y - h * 0.05, w * 0.56, h * 0.12))
    ctx.drawImageInRect(img, new Rect(p.x - w / 2, y0, w, h))
    if (act === 'sleep') {
      ctx.setFillColor(new Color('#0b1240', 0.22))
      ctx.fillEllipse(new Rect(p.x - w * 0.36, y0 + h * 0.2, w * 0.72, h * 0.75))
    }
    const mark = ACT_MARK[act]
    if (mark) {
      const ms = Math.max(9, h * 0.28)
      text(ctx, mark === 'z' ? 'z z' : mark, p.x + w * 0.18, y0 - ms * 0.4, ms * 2.4, ms, new Color(mark === '♥' ? '#ff6b8a' : mark === '!' ? '#ffd23a' : '#fff6c8'), 'left')
    }
  }

  // 天気
  if (d.weather === 'rain' || d.weather === 'snow' || d.weather === 'ember') {
    const n = d.weather === 'rain' ? 70 : 45
    for (let i = 0; i < n; i++) {
      const x = r() * W
      const y = r() * H
      if (d.weather === 'rain') {
        const pth = new Path()
        pth.move(new Point(x, y))
        pth.addLine(new Point(x - 3, y + 10))
        ctx.addPath(pth)
        ctx.setStrokeColor(new Color('#bfe2ff', 0.55))
        ctx.setLineWidth(1)
        ctx.strokePath()
      } else {
        const s = 1.5 + r() * 2
        ctx.setFillColor(d.weather === 'snow' ? new Color('#ffffff', 0.85) : new Color(r() < 0.5 ? '#ffb340' : '#ff5a2a', 0.85))
        ctx.fillRect(new Rect(x, y, s, s))
      }
    }
  }

  // 文字：上に場所、下にペットのようす
  const pet = placed.find((x) => x.c.team === 'pet') || placed[0]
  const small = family === 'small'
  const fs = small ? 10 : 12
  if (!small) {
    const head = d.village ? `${d.stage}・${d.village}` : d.stage
    pill(ctx, 6, 6, Math.min(W - 12, head.length * fs + 18), fs + 9, 0.55)
    text(ctx, head, 14, 9, W - 28, fs, new Color('#fff6dc'), 'left')
  }
  const line = pet ? `${pet.c.name}は ${ACT_TEXT[pet.act]}` : 'みんな どこかへ でかけている'
  pill(ctx, 6, H - fs - 15, W - 12, fs + 9, 0.6)
  text(ctx, line, 14, H - fs - 12, W - 28 - (small ? 0 : 70), fs, new Color('#fff6dc'), 'left')
  if (!small) text(ctx, ago(d.at, now), W - 90, H - fs - 11, 76, fs - 2, new Color('#c8d0f0'), 'right')
  return ctx.getImage()
}

function emptyImage(family) {
  const [W, H] = SIZES[family] || SIZES.medium
  const ctx = new DrawContext()
  ctx.size = new Size(W, H)
  ctx.opaque = true
  ctx.respectScreenScale = true
  ctx.setFillColor(new Color('#1a1530'))
  ctx.fillRect(new Rect(0, 0, W, H))
  text(ctx, 'PULSAR', 12, H / 2 - 30, W - 24, 16, new Color('#f2b134'), 'center')
  text(ctx, 'アプリの「ウィジェットに送る」から', 12, H / 2 - 4, W - 24, 11, new Color('#fff6dc'), 'center')
  text(ctx, 'けしきを とどけてね', 12, H / 2 + 12, W - 24, 11, new Color('#fff6dc'), 'center')
  return ctx.getImage()
}

function makeWidget(d, family) {
  const w = new ListWidget()
  w.setPadding(0, 0, 0, 0)
  w.backgroundColor = new Color('#1a1530')
  w.backgroundImage = d ? render(d, family, Date.now()) : emptyImage(family)
  if (d && d.url) w.url = d.url
  w.refreshAfterDate = new Date(Date.now() + 15 * 60000)
  return w
}

// ---------------- 実行 ----------------
async function importFromClipboard(quiet) {
  const d = decode(Pasteboard.pasteString())
  if (!d) {
    if (!quiet) {
      const a = new Alert()
      a.title = 'コードが見つかりません'
      a.message = 'PULSAR の「ウィジェットに送る」を押してから、もういちど実行してください。'
      a.addAction('OK')
      await a.present()
    }
    return null
  }
  fm.writeString(path, JSON.stringify(d))
  return d
}

if (config.runsInWidget) {
  Script.setWidget(makeWidget(loadSaved(), config.widgetFamily))
} else {
  const q = args.queryParameters || {}
  let d = null
  if (q.import) d = await importFromClipboard(false)
  else {
    // クリップボードに新しいコードがあれば、だまって取りこむ
    d = (await importFromClipboard(true)) || loadSaved()
  }
  if (d) {
    const a = new Alert()
    a.title = 'PULSAR ウィジェット'
    a.message = `${d.stage}のけしきを うけとりました（${d.who.length}ひき）。ホーム画面に Scriptable のウィジェットを置いて、PULSAR を選んでください。`
    a.addAction('ちゅうサイズで みる')
    a.addAction('だいサイズで みる')
    a.addAction('しょうサイズで みる')
    a.addCancelAction('とじる')
    const i = await a.present()
    if (i === 0) await makeWidget(d, 'medium').presentMedium()
    else if (i === 1) await makeWidget(d, 'large').presentLarge()
    else if (i === 2) await makeWidget(d, 'small').presentSmall()
  } else if (!q.import) {
    await importFromClipboard(false)
  }
  Script.complete()
}
