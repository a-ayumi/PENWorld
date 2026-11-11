// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: seedling;
/*
 * PULSAR のウィジェット（Scriptable 用）
 *
 * つかいかた
 *   1. このスクリプトを Scriptable に貼りつけて、名前を「PULSAR」にする
 *   2. PULSAR（アプリ）の きせかえ → ウィジェット →「ウィジェットに送る」→「Scriptable をひらく」
 *      （または、コードをコピーしてから このスクリプトを実行する）
 *   3. ホーム画面に Scriptable のウィジェット（小・中・大）を置き、長押し →「ウィジェットを編集」→ Script で PULSAR を選ぶ
 *
 * ウィジェットの中のペットは、時間がたつと おなかがすき・ねむくなり・さみしくなる。
 * 中・大の「ごはん」「なでる」を押すと、Scriptable が一瞬ひらいて お世話ができる。
 * 景色は「送った時」のもの。生き物の居場所・ポーズ・表情は、ウィジェットが新しくなるたび（15 分ほどごと）に決めなおす。
 * ネットにはつながない。
 */

const PREFIX = 'PULSARW1:'
const FILE = 'pulsar-widget.json'
const LIFE = 'pulsar-life.json'
const MAX_CODE = 4000000

const fm = FileManager.local()
const path = fm.joinPath(fm.documentsDirectory(), FILE)
const lifePath = fm.joinPath(fm.documentsDirectory(), LIFE)

// ---------------- 読みこみ（コードは信用しないで中身を確かめる） ----------------
function decode(text) {
  if (typeof text !== 'string') return null
  const code = text.trim().replace(/\s+/g, '')
  if (!code.startsWith(PREFIX) || code.length > MAX_CODE) return null
  let d
  try {
    d = JSON.parse(Data.fromBase64String(code.slice(PREFIX.length)).toRawString())
  } catch (e) {
    return null
  }
  return clean(d)
}

const num = (v, lo, hi, def) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def)
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '')
const isImg = (v) => typeof v === 'string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v)
const POSE_NAMES = ['idle', 'walk', 'jump', 'eat', 'sleep', 'hungry', 'sleepy', 'glad', 'worry', 'angry']

function clean(d) {
  if (!d || typeof d !== 'object' || d.v !== 1 || !isImg(d.image)) return null
  const sprites = {}
  if (d.sprites && typeof d.sprites === 'object')
    for (const k of Object.keys(d.sprites).slice(0, 80)) if (isImg(d.sprites[k])) sprites[str(k, 40)] = d.sprites[k]
  const who = (Array.isArray(d.who) ? d.who : [])
    .slice(0, 10)
    .filter((c) => c && sprites[c.sprite])
    .map((c) => {
      const poses = { idle: str(c.sprite, 40) }
      if (c.poses && typeof c.poses === 'object') for (const n of POSE_NAMES) if (sprites[c.poses[n]]) poses[n] = str(c.poses[n], 40)
      return {
        name: str(c.name, 16),
        sprite: poses.idle,
        poses,
        team: ['pet', 'friend', 'wild'].includes(c.team) ? c.team : 'wild',
        foe: !!c.foe,
        night: !!c.night,
        float: !!c.float,
        h: num(c.h, 0.3, 4, 1.2),
      }
    })
  const spots = (Array.isArray(d.spots) ? d.spots : [])
    .slice(0, 40)
    .map((p) => ({ u: num(p && p.u, 0, 1, 0.5), v: num(p && p.v, 0, 1, 0.7), k: num(p && p.k, 0.005, 0.6, 0.08) }))
  const url = typeof d.url === 'string' && /^https:\/\/[^\s"'<>]+$/.test(d.url) ? d.url : ''
  const pet = d.pet && typeof d.pet === 'object' ? d.pet : {}
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
    pet: { hunger: num(pet.hunger, 0, 100, 70), energy: num(pet.energy, 0, 100, 70), mood: num(pet.mood, 0, 100, 70) },
  }
}

function readJson(p) {
  if (!fm.fileExists(p)) return null
  try {
    return JSON.parse(fm.readString(p))
  } catch (e) {
    return null
  }
}
const loadSaved = () => clean(readJson(path))

// ---------------- ペットのくらし（おなか・げんき・きげん） ----------------
// 1 時間あたりの増え方。夜（22〜6 時）はねて げんきが戻る
const isNightHour = (h) => h >= 22 || h < 6

function loadLife(d) {
  const l = readJson(lifePath)
  if (l && typeof l === 'object' && l.from === d.at)
    return {
      from: d.at,
      t: num(l.t, 0, 4e12, Date.now()),
      hunger: num(l.hunger, 0, 100, 70),
      energy: num(l.energy, 0, 100, 70),
      mood: num(l.mood, 0, 100, 70),
      fedAt: num(l.fedAt, 0, 4e12, 0),
      pettedAt: num(l.pettedAt, 0, 4e12, 0),
    }
  // 新しい景色を受けとったら、アプリのペットのようすから始める
  return { from: d.at, t: Date.now(), hunger: d.pet.hunger, energy: d.pet.energy, mood: d.pet.mood, fedAt: 0, pettedAt: 0 }
}
const saveLife = (l) => fm.writeString(lifePath, JSON.stringify(l))

function tick(l, now) {
  // 長く見ていなくても 3 日ぶんまで。15 分ずつ進めて、昼と夜で変わり方を変える
  let t = Math.max(l.t, now - 72 * 3600000)
  const STEP = 15 * 60000
  while (t + STEP <= now) {
    const night = isNightHour(new Date(t).getHours())
    const k = 0.25
    l.hunger -= (night ? 3 : 8) * k
    l.energy += (night ? 14 : -6) * k
    l.mood -= (l.hunger < 25 ? 9 : 4) * k
    t += STEP
  }
  l.hunger = Math.min(100, Math.max(0, l.hunger))
  l.energy = Math.min(100, Math.max(0, l.energy))
  l.mood = Math.min(100, Math.max(0, l.mood))
  l.t = t
  return l
}

// ---------------- 時刻と くらしから「いまのようす」を決める ----------------
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

const MIN = 60000
// ペット：お世話された直後 → 夜 → おなか → げんき → きげん の順に見て、ポーズとひとことを決める
function petMood(l, now, r) {
  const h = new Date(now).getHours()
  if (now - l.fedAt < 25 * MIN) return { pose: r() < 0.6 ? 'eat' : 'glad', say: 'もぐもぐ… おいしい！' }
  if (now - l.pettedAt < 25 * MIN) return { pose: r() < 0.5 ? 'glad' : 'jump', say: 'えへへ、うれしい！' }
  if (isNightHour(h) && l.hunger >= 15) return { pose: 'sleep', say: 'すやすや ねている' }
  if (l.hunger < 15) return { pose: 'hungry', say: 'おなか ぺこぺこ… ごはん！' }
  if (l.hunger < 35) return { pose: 'hungry', say: 'おなかが すいてきた…' }
  if (l.energy < 25) return { pose: 'sleepy', say: 'ねむくて ふらふら…' }
  if (l.mood < 25) return { pose: 'worry', say: 'さみしいな… なでて' }
  if (l.mood > 75) return r() < 0.55 ? { pose: 'jump', say: 'ごきげんで ぴょんぴょん！' } : { pose: 'walk', say: 'るんるん おさんぽ している' }
  const acts = [
    { pose: 'walk', say: 'おさんぽ している' },
    { pose: 'idle', say: 'のんびり している' },
    { pose: 'walk', say: 'いえを つくっている' },
    { pose: 'eat', say: 'おやつを たべている' },
  ]
  return acts[Math.floor(r() * acts.length)]
}

// ほかの子：夜はたいてい ねている（夜の子は起きている）
function otherMood(c, part, r) {
  const awakeAtNight = c.night || c.foe
  if (part === 'night' && !awakeAtNight) return r() < 0.85 ? { pose: 'sleep', mark: 'z' } : { pose: 'idle', mark: '☆' }
  if (part !== 'night' && c.night) return null
  if (c.foe) return r() < 0.4 ? { pose: 'angry', mark: '!' } : { pose: 'walk', mark: '?' }
  const acts = [
    { pose: 'walk', mark: '' },
    { pose: 'walk', mark: '!' },
    { pose: 'jump', mark: '♪' },
    { pose: 'eat', mark: '♥' },
    { pose: 'idle', mark: '' },
  ]
  return acts[Math.floor(r() * acts.length)]
}
const POSE_MARK = { sleep: 'z', hungry: '…', sleepy: 'z', glad: '♥', jump: '♪', worry: '…', eat: '♥' }

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

// おなか・げんき・きげん の 3 本のメーター（5 コマ）
function meters(ctx, l, x, y, small) {
  const rows = [
    ['おなか', l.hunger, '#ffb84d'],
    ['げんき', l.energy, '#7fd8ff'],
    ['きげん', l.mood, '#ff7eb6'],
  ]
  const lw = small ? 0 : 34
  const cw = small ? 7 : 8
  const w = lw + cw * 5 + 14
  const rh = small ? 9 : 11
  pill(ctx, x - w, y, w, rh * 3 + 8, 0.55)
  rows.forEach(([name, v, col], i) => {
    const ry = y + 4 + i * rh
    if (!small) text(ctx, name, x - w + 7, ry - 1, lw, 8, new Color('#fff6dc'), 'left')
    const n = Math.round((v / 100) * 5)
    for (let k = 0; k < 5; k++) {
      ctx.setFillColor(k < n ? new Color(col, v < 25 ? 0.75 : 1) : new Color('#ffffff', 0.18))
      ctx.fillRect(new Rect(x - w + 7 + lw + k * cw, ry + 1, cw - 2, rh - 4))
    }
  })
}

function ago(at, now) {
  const m = Math.floor((now - at) / 60000)
  if (m < 60) return `${Math.max(1, m)}ふんまえ`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}じかんまえ`
  return `${Math.floor(h / 24)}にちまえ`
}

function render(d, l, family, now) {
  const [W, H] = SIZES[family] || SIZES.medium
  const ctx = new DrawContext()
  ctx.size = new Size(W, H)
  ctx.opaque = true
  ctx.respectScreenScale = true

  const part = dayPart(new Date(now).getHours())
  // 15 分ごとに みんなの居場所とようすが変わる（お世話したら すぐ変わる）
  const slot = Math.floor(now / (15 * MIN))
  const r = rng(slot * 7919 + (d.at % 100000) + Math.floor(l.fedAt / MIN) + Math.floor(l.pettedAt / MIN) * 3)

  // 景色：ウィジェットの形に合わせて切りぬく（地面の多い下寄りを残す）。小さいほど寄る
  const bg = imageOf(d.image)
  const S = bg.size.width
  const zoom = { small: 1.55, medium: 1.2, large: 1.1, extraLarge: 1.0 }[family] || 1.2
  const sc = Math.max(W / S, H / S) * zoom
  const dw = S * sc
  const dx = (W - dw) / 2
  const dy = (H - dw) * 0.62
  ctx.drawImageInRect(bg, new Rect(dx, dy, dw, dw))

  // 時間帯の色（送った時がすでに夜なら、さらに暗くはしない）
  if (part !== 'day') {
    const a = part === 'night' ? Math.max(0, 0.5 - d.night * 0.5) : part === 'evening' ? 0.2 : 0.12
    ctx.setFillColor(new Color({ morning: '#ff9ec4', evening: '#ff7a2a', night: '#0b1240' }[part], a))
    ctx.fillRect(new Rect(0, 0, W, H))
  }
  if (part === 'night' || part === 'evening') {
    // ほたる
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

  // 生き物：空いている場所に（重ならないように）立たせる。ペットはまんなか近く。奥から順に描く
  const spots = d.spots
    .map((p) => ({ x: dx + p.u * dw, y: dy + p.v * dw, k: p.k * dw }))
    .filter((p) => p.x > 14 && p.x < W - 14 && p.y > H * 0.28 && p.y < H - 26)
  const pool = spots.slice()
  const placed = []
  const petNow = petMood(l, now, r)
  const near = (p) => Math.hypot(p.x - W / 2, (p.y - H * 0.58) * 1.4)
  for (const c of d.who) {
    const m = c.team === 'pet' ? { pose: petNow.pose, mark: POSE_MARK[petNow.pose] || '' } : otherMood(c, part, r)
    if (!m || !pool.length) continue
    let i = Math.floor(r() * pool.length)
    if (c.team === 'pet') i = pool.reduce((best, p, j) => (near(p) < near(pool[best]) ? j : best), 0)
    placed.push({ c, m, p: pool.splice(i, 1)[0] })
  }
  placed.sort((a, b) => a.p.y - b.p.y)
  for (const { c, m, p } of placed) {
    const key = c.poses[m.pose] || c.poses[m.pose === 'jump' ? 'glad' : 'idle'] || c.sprite
    const img = imageOf(d.sprites[key])
    const isPet = c.team === 'pet'
    // ペットは表情が見えるように大きめ（小さいウィジェットほど画面に対して大きく）
    const h = isPet ? Math.max(H * (family === 'small' ? 0.4 : family === 'medium' ? 0.36 : 0.22), Math.min(H * 0.5, c.h * p.k * 1.4)) : Math.max(18, Math.min(H * 0.45, c.h * p.k * 1.25))
    const w = (h * img.size.width) / img.size.height
    // ジャンプは足もとから少し浮かせる（かげは地面にのこす）
    const lift = (c.float ? h * 0.18 : 0) + (m.pose === 'jump' ? h * 0.22 : 0)
    const y0 = p.y - h + h * 0.06 - lift
    ctx.setFillColor(new Color('#000000', m.pose === 'jump' ? 0.18 : 0.28))
    const sw = m.pose === 'jump' ? 0.42 : 0.56
    ctx.fillEllipse(new Rect(p.x - w * sw * 0.5, p.y - h * 0.05, w * sw, h * 0.12))
    ctx.drawImageInRect(img, new Rect(p.x - w / 2, y0, w, h))
    if (m.pose === 'sleep') {
      ctx.setFillColor(new Color('#0b1240', 0.18))
      ctx.fillEllipse(new Rect(p.x - w * 0.36, y0 + h * 0.2, w * 0.72, h * 0.75))
    }
    if (m.mark) {
      const ms = Math.max(9, h * 0.28)
      const col = m.mark === '♥' ? '#ff6b8a' : m.mark === '!' ? '#ffd23a' : '#fff6c8'
      text(ctx, m.mark === 'z' ? 'z z' : m.mark, p.x + w * 0.18, y0 - ms * 0.4, ms * 2.4, ms, new Color(col), 'left')
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

  // 文字：上に場所とメーター、下にペットのひとこと（中・大は右下にボタンが重なるので短く）
  const pet = d.who.find((c) => c.team === 'pet')
  const small = family === 'small'
  const fs = small ? 10 : 12
  if (!small) {
    const head = d.village ? `${d.stage}・${d.village}` : d.stage
    pill(ctx, 6, 6, Math.min(W - 120, head.length * fs + 18), fs + 9, 0.55)
    text(ctx, head, 14, 9, W - 128, fs, new Color('#fff6dc'), 'left')
    text(ctx, `${ago(d.at, now)}の けしき`, 8, fs + 17, 120, 8, new Color('#fff6dc', 0.8), 'left')
  }
  meters(ctx, l, W - 6, 6, small)
  const line = pet ? `${pet.name}は ${petNow.say}` : 'みんな どこかへ でかけている'
  const lineW = small ? W - 12 : W - 12 - 132
  pill(ctx, 6, H - fs - 15, lineW, fs + 9, 0.6)
  text(ctx, line, 14, H - fs - 12, lineW - 14, fs, new Color('#fff6dc'), 'left')
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

const actUrl = (act) => `scriptable:///run/${encodeURIComponent(Script.name())}?act=${act}`

function button(row, label, act) {
  const b = row.addStack()
  b.backgroundColor = new Color('#1a1530', 0.72)
  b.cornerRadius = 11
  b.setPadding(4, 10, 4, 10)
  b.url = actUrl(act)
  const t = b.addText(label)
  t.font = Font.boldRoundedSystemFont(12)
  t.textColor = new Color('#fff6dc')
}

function makeWidget(d, l, family) {
  const w = new ListWidget()
  w.setPadding(0, 0, 0, 0)
  w.backgroundColor = new Color('#1a1530')
  const now = Date.now()
  w.backgroundImage = d ? render(d, l, family, now) : emptyImage(family)
  if (d && d.url) w.url = d.url
  // 中・大：右下に お世話のボタン（押すと Scriptable がひらいて すぐ もどれる）
  if (d && family !== 'small') {
    w.addSpacer()
    const row = w.addStack()
    row.setPadding(0, 6, 6, 6)
    row.addSpacer()
    button(row, 'ごはん', 'feed')
    row.addSpacer(6)
    button(row, 'なでる', 'pet')
  }
  w.refreshAfterDate = new Date(now + 15 * MIN)
  return w
}

// ---------------- お世話 ----------------
function care(l, act, now) {
  const night = isNightHour(new Date(now).getHours())
  if (act === 'feed') {
    if (l.hunger > 90) return 'おなか いっぱいだって'
    l.hunger = Math.min(100, l.hunger + 45)
    l.mood = Math.min(100, l.mood + 6)
    l.fedAt = now
    return night ? 'ねむそうに もぐもぐ…' : 'もぐもぐ… おいしい！'
  }
  if (act === 'pet') {
    l.mood = Math.min(100, l.mood + (night ? 8 : 25))
    l.pettedAt = night ? l.pettedAt : now
    return night ? 'すやすや…（そっと なでた）' : 'えへへ、うれしそう！'
  }
  return ''
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

async function preview(d, l, family) {
  const w = makeWidget(d, l, family)
  if (family === 'large') await w.presentLarge()
  else if (family === 'small') await w.presentSmall()
  else await w.presentMedium()
}

if (config.runsInWidget) {
  const d = loadSaved()
  let l = null
  if (d) {
    l = tick(loadLife(d), Date.now())
    saveLife(l)
  }
  Script.setWidget(makeWidget(d, l, config.widgetFamily))
} else {
  const q = args.queryParameters || {}
  if (q.act === 'feed' || q.act === 'pet') {
    // ウィジェットのボタンから：お世話して、ようすを見せる
    const d = loadSaved()
    if (d) {
      const now = Date.now()
      const l = tick(loadLife(d), now)
      const msg = care(l, q.act, now)
      saveLife(l)
      const pet = d.who.find((c) => c.team === 'pet')
      const a = new Alert()
      a.title = `${pet ? pet.name : 'ペット'}：${msg}`
      a.message = `おなか ${Math.round(l.hunger)} ／ げんき ${Math.round(l.energy)} ／ きげん ${Math.round(l.mood)}\nホーム画面のウィジェットは、次に新しくなる時に かわります。`
      a.addAction('ようすを みる')
      a.addCancelAction('とじる')
      if ((await a.present()) === 0) await preview(d, l, 'medium')
    }
  } else {
    let d = q.import ? await importFromClipboard(false) : (await importFromClipboard(true)) || loadSaved()
    if (d) {
      const l = tick(loadLife(d), Date.now())
      saveLife(l)
      const a = new Alert()
      a.title = 'PULSAR ウィジェット'
      a.message = `${d.stage}のけしきを うけとりました（${d.who.length}ひき）。ホーム画面に Scriptable のウィジェットを置いて、PULSAR を選んでください。`
      a.addAction('ちゅうサイズで みる')
      a.addAction('だいサイズで みる')
      a.addAction('しょうサイズで みる')
      a.addCancelAction('とじる')
      const i = await a.present()
      if (i >= 0) await preview(d, l, ['medium', 'large', 'small'][i])
    } else if (!q.import) {
      await importFromClipboard(false)
    }
  }
  Script.complete()
}
