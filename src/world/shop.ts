import { EGG_COLORS, type EggKind } from './monsters'
import type { ItemKind } from './items'
import type { StructKind } from './structures'

/**
 * ショップの商品・見た目（タブ・ドット絵アイコン・説明・買えない理由の色）。
 * 画面は 320×320 の HUD に描く。World.ts からは drawShop() / shopTap() を呼ぶだけ。
 */
export type ShopCat = 'food' | 'item' | 'egg' | 'plan' | 'land'
export type ShopFood = 'meat' | 'sweet' | 'nut'

export interface ShopItem {
  id: string
  name: string
  price: number
  /** 説明（2 行まで・1 行 30 文字くらい） */
  desc: string
  cat: ShopCat
  icon: string
  egg?: EggKind | 'random'
  food?: ShopFood
  item?: ItemKind
  kit?: boolean
  plan?: StructKind
  land?: 1 | 2
}

export const SHOP_CATS: { id: ShopCat; name: string }[] = [
  { id: 'food', name: 'たべもの' },
  { id: 'item', name: 'おきもの' },
  { id: 'egg', name: 'たまご' },
  { id: 'plan', name: 'せっけいず' },
  { id: 'land', name: 'かいたく' },
]

/**
 * 値段の考え方：はじめは 50 コインほど → 30〜60 の小物から（ボール・なえ・はなだん・ベンチ・たき火）。
 * 村が育つと 60〜80（ぬいぐるみ・ランタン・だいくどうぐ・おまもり）、仲間が増えると 100 以上（たまご・おうえんばた・すべりだい）、
 * 終盤は 160〜500（おしろ・かいたく）。同じカテゴリの中は 安い順。
 */
export const SHOP: ShopItem[] = [
  { id: 'sweet', cat: 'food', icon: 'sweet', name: 'あまいみ', price: 20, desc: 'おなか +25・きげん +20。\nこころの けいこうが そだつ', food: 'sweet' },
  { id: 'nut', cat: 'food', icon: 'nut', name: 'かたいナッツ', price: 25, desc: 'おなか +35。\nまもりの けいこうが そだつ', food: 'nut' },
  { id: 'meat', cat: 'food', icon: 'meat', name: 'スタミナにく', price: 30, desc: 'おなか +45。\nちからの けいこうが そだつ', food: 'meat' },

  { id: 'ball', cat: 'item', icon: 'ball', name: 'ボール', price: 30, desc: 'みんなが かってに けって あそぶ。\nあそぶと こころが そだち、きげんが あがる', item: 'ball' },
  { id: 'sapling', cat: 'item', icon: 'sapling', name: 'なえ', price: 40, desc: 'めばえ → わかぎ → みのる木に そだつ。\nそだつと たべものが ふえる', item: 'sapling' },
  { id: 'flowerbed', cat: 'item', icon: 'flowerbed', name: 'はなだん', price: 45, desc: 'たべものが みのるのが はやくなる。\nひるは ちょうちょが あつまってくる', item: 'flowerbed' },
  { id: 'bench', cat: 'item', icon: 'bench', name: 'ベンチ', price: 45, desc: 'つかれた子が ひと休み。\nげんきが はやく もどり、きげんも あがる', item: 'bench' },
  { id: 'fire', cat: 'item', icon: 'fire', name: 'たき火', price: 50, desc: 'よるは そばで ねむる。こころが そだち、\nたまごが できやすくなる', item: 'fire' },
  { id: 'fence', cat: 'item', icon: 'fence', name: 'まもりのさく', price: 55, desc: 'ちかくの 家と たてものが うける\nダメージが はんぶんになる', item: 'fence' },
  { id: 'plush', cat: 'item', icon: 'plush', name: 'ぬいぐるみ', price: 60, desc: 'こどもが だっこして あそぶ。\nちかくだと はやく おとなに なる', item: 'plush' },
  { id: 'lantern', cat: 'item', icon: 'lantern', name: 'ランタン', price: 70, desc: 'よるに あかるく ひかる。\nみんなが あつまって、こころが そだつ', item: 'lantern' },
  { id: 'tools', cat: 'item', icon: 'tools', name: 'だいくどうぐ', price: 75, desc: 'ちかくの 家づくりが 2ばい。\n家や たてものが すこしずつ なおる', item: 'tools' },
  { id: 'charm', cat: 'item', icon: 'charm', name: 'おまもり', price: 80, desc: 'ノイズが あらわれにくくなり、\nてきの ねらいも あまくなる', item: 'charm' },
  { id: 'banner', cat: 'item', icon: 'banner', name: 'おうえんばた', price: 110, desc: 'ちかくで たたかう なかまの\nこうげきが 2わり つよくなる', item: 'banner' },
  { id: 'slide', cat: 'item', icon: 'slide', name: 'ミニすべりだい', price: 130, desc: 'のぼって すべって あそぶ。\nあそぶと こころと けいけんが そだつ', item: 'slide' },

  { id: 'egg-random', cat: 'egg', icon: 'egg?', name: 'ふしぎなたまご', price: 70, desc: 'なにが うまれるか わからない。\nどの系統の子が くるかは おたのしみ', egg: 'random' },
  { id: 'egg-bird', cat: 'egg', icon: 'egg:bird', name: 'とりのたまご', price: 90, desc: 'ピヨが うまれる（とりの系統）', egg: 'bird' },
  { id: 'egg-cat', cat: 'egg', icon: 'egg:cat', name: 'ねこのたまご', price: 100, desc: 'ミミコが うまれる（ねこの系統）', egg: 'cat' },
  { id: 'egg-dog', cat: 'egg', icon: 'egg:dog', name: 'いぬのたまご', price: 100, desc: 'ワンコが うまれる（いぬの系統）', egg: 'dog' },
  { id: 'egg-water', cat: 'egg', icon: 'egg:water', name: 'みずのたまご', price: 100, desc: 'シズクが うまれる（みずの系統）', egg: 'water' },
  { id: 'egg-machine', cat: 'egg', icon: 'egg:machine', name: 'きかいのたまご', price: 110, desc: 'ネジルが うまれる（ロボの系統）', egg: 'machine' },
  { id: 'egg-monster', cat: 'egg', icon: 'egg:monster', name: 'モンスターのたまご', price: 120, desc: 'ガブコが うまれる（おばけの系統）', egg: 'monster' },
  { id: 'egg-dragon', cat: 'egg', icon: 'egg:dragon', name: 'りゅうのたまご', price: 140, desc: 'リュウコが うまれる（りゅうの系統）', egg: 'dragon' },

  { id: 'kit', cat: 'plan', icon: 'kit', name: 'ざいもくセット', price: 35, desc: '木3つと 石2つを まとめて おく。\n家づくりの ざいりょうに', kit: true },
  { id: 'bp-well', cat: 'plan', icon: 'well', name: 'せっけいず：いど', price: 35, desc: 'ちかくの みんなの たいりょくが\nすこしずつ かいふくする', plan: 'well' },
  { id: 'bp-farm', cat: 'plan', icon: 'farm', name: 'せっけいず：はたけ', price: 40, desc: 'たべものが じわじわ みのる。\nはたけがかりが せわをする', plan: 'farm' },
  { id: 'bp-bridge', cat: 'plan', icon: 'bridge', name: 'せっけいず：はし', price: 45, desc: 'みずうみを あるいて わたれる\nようになる（みずうみのある所）', plan: 'bridge' },
  { id: 'bp-cradle', cat: 'plan', icon: 'cradle', name: 'せっけいず：ゆりかご', price: 60, desc: 'たまごが できやすくなる。\nたまごを 3つまで おける', plan: 'cradle' },
  { id: 'bp-tower', cat: 'plan', icon: 'tower', name: 'せっけいず：みはりとう', price: 70, desc: 'ちかくの てきを みつけて うちおとす。\nみはり役が まわりを見まわる', plan: 'tower' },
  { id: 'bp-castle', cat: 'plan', icon: 'castle', name: 'せっけいず：おしろ', price: 160, desc: 'へいに かこまれた おしろ。\nちかくで かいふくし、村の にぎわいも UP', plan: 'castle' },
  { id: 'bp-playground', cat: 'plan', icon: 'playground', name: 'せっけいず：あそびば', price: 80, desc: 'こどもが はやく そだつ。\nおせわがかりが こどもと あそぶ', plan: 'playground' },
  { id: 'bp-fountain', cat: 'plan', icon: 'fountain', name: 'せっけいず：ふんすい', price: 90, desc: 'ちかくの みんなが かいふくする。\nおまつりの ひろばに なる', plan: 'fountain' },
  { id: 'bp-windmill', cat: 'plan', icon: 'windmill', name: 'せっけいず：ふうしゃ', price: 100, desc: 'しざいが ときどき うまれる', plan: 'windmill' },
  { id: 'bp-lighthouse', cat: 'plan', icon: 'lighthouse', name: 'せっけいず：とうだい', price: 120, desc: 'よる ひかる・てきぐんを はやく しらせる。\nみずべだと もっと つよい', plan: 'lighthouse' },
  { id: 'bp-market', cat: 'plan', icon: 'market', name: 'せっけいず：いちば', price: 130, desc: 'むらレベル 1 から。しゅうにゅう UP、\nうりこが みせに たつ', plan: 'market' },
  { id: 'bp-fort', cat: 'plan', icon: 'fort', name: 'せっけいず：とりで', price: 150, desc: 'ちかくの なかまの こうげきが UP', plan: 'fort' },

  { id: 'land1', cat: 'land', icon: 'land', name: 'かいたく ①', price: 250, desc: 'はこにわが 32 → 40 に ひろがる。\n家や たてもの・置き物は そのまま', land: 1 },
  { id: 'land2', cat: 'land', icon: 'land', name: 'かいたく ②', price: 500, desc: 'はこにわが 40 → 48 に ひろがる。\nおおきな むらを つくれる', land: 2 },
]

/** 買えるか？ と、買えない理由（色で見せる） */
export interface ShopCheck {
  ok: boolean
  /** ok = 買える / coin = コインがたりない / full = 上限 / lock = 先に必要な物がある / done = もう済んでいる */
  tone: 'ok' | 'coin' | 'full' | 'lock' | 'done'
  why: string
  /** 行の右がわに出す「もっている数 / 上限」 */
  have?: number
  max?: number
}

export interface ShopView {
  coins: number
  cursor: number
  time: number
  check(s: ShopItem): ShopCheck
}

export interface ShopCtx {
  g: CanvasRenderingContext2D
  text(s: string, x: number, y: number, color?: string, size?: number, align?: CanvasTextAlign): void
  win(x: number, y: number, w: number, h: number): void
  measure(s: string, size: number): number
}

// ------------------------------------------------------------------ 画面の寸法（描く時と タップの判定で共通）
export const SHOP_WIN = { x: 8, y: 26, w: 304, h: 232 }
const TAB_Y = SHOP_WIN.y + 20
const TAB_H = 15
const LIST_Y = SHOP_WIN.y + 38
const ROW_H = 15
export const SHOP_ROWS = 10
const FOOT_Y = LIST_Y + SHOP_ROWS * ROW_H + 3
const BTN = { x: SHOP_WIN.x + SHOP_WIN.w - 64, y: SHOP_WIN.y + SHOP_WIN.h - 19, w: 54, h: 14 }

export const catOf = (cursor: number): ShopCat => SHOP[Math.max(0, Math.min(SHOP.length - 1, cursor))].cat
/** あるカテゴリの商品の番号（SHOP の添字）の一覧 */
export const catIndexes = (cat: ShopCat) => SHOP.map((s, i) => (s.cat === cat ? i : -1)).filter((i) => i >= 0)
/** カテゴリの中で 画面の先頭に出す行（カーソルが見えるように） */
export function shopTop(cursor: number) {
  const list = catIndexes(catOf(cursor))
  const pos = Math.max(0, list.indexOf(cursor))
  return Math.max(0, Math.min(Math.max(0, list.length - SHOP_ROWS), pos - 4))
}

export type ShopHit = { type: 'outside' } | { type: 'tab'; cat: ShopCat } | { type: 'row'; index: number } | { type: 'buy' } | { type: 'none' }
/** HUD の座標（320×320）でのタップ判定 */
export function shopTap(x: number, y: number, cursor: number): ShopHit {
  const w = SHOP_WIN
  if (x < w.x || x > w.x + w.w || y < w.y || y > w.y + w.h) return { type: 'outside' }
  if (y >= TAB_Y - 2 && y < TAB_Y + TAB_H + 1) {
    const tw = (w.w - 16) / SHOP_CATS.length
    const i = Math.floor((x - (w.x + 8)) / tw)
    if (i >= 0 && i < SHOP_CATS.length) return { type: 'tab', cat: SHOP_CATS[i].id }
    return { type: 'none' }
  }
  if (y >= LIST_Y && y < LIST_Y + SHOP_ROWS * ROW_H) {
    const list = catIndexes(catOf(cursor))
    const k = Math.floor((y - LIST_Y) / ROW_H) + shopTop(cursor)
    if (k < list.length) return { type: 'row', index: list[k] }
    return { type: 'none' }
  }
  if (x >= BTN.x - 2 && x <= BTN.x + BTN.w + 2 && y >= BTN.y - 2 && y <= BTN.y + BTN.h + 2) return { type: 'buy' }
  return { type: 'none' }
}

// ------------------------------------------------------------------ ドット絵アイコン（9×9・オリジナル）
const PAL: Record<string, string> = {
  r: '#e8484f', R: '#ff9a9a', o: '#ff9f43', y: '#ffd23f', Y: '#fff3a8', g: '#5cc25a', G: '#2f8a3a', l: '#9be28a',
  b: '#8a5a34', B: '#c9955a', t: '#ecd7a0', w: '#ffffff', s: '#9aa1ab', S: '#d5dae2', n: '#3a4a7a', c: '#5ef2ff',
  C: '#2f9fd0', p: '#ff8fb1', P: '#ffd0df', u: '#b48cff', k: '#2b2f4a', m: '#ff5ed9', e: '#8fd3ff',
}
const ICONS: Record<string, string[]> = {
  sweet: ['....g....', '...gg.g..', '..ppppp..', '.pPPpppp.', '.pPppppp.', '.ppppppp.', '.ppppppp.', '..ppppp..', '...ppp...'],
  nut: ['..bbbbb..', '.bBBBBBb.', 'bbbbbbbbb', '.BBBBBBB.', '.BtBBBtB.', '.BtBBBBB.', '..BBBBB..', '...BBB...', '....b....'],
  meat: ['..rrrr...', '.rRRrrr..', 'rRrrrrrr.', 'rrrrrrrr.', '.rrrrrr..', '..rrrr...', '.ww......', 'ww.......', 'w........'],
  ball: ['..CCCCC..', '.CeeCCCC.', 'CeCCCCCCC', 'CCCCCCCCC', 'wwwwwwwww', 'yyyyyyyyy', 'yyyyyyyoy', '.yyyyyoo.', '..ooooo..'],
  sapling: ['.........', '.gg...gg.', 'gGgg.ggGg', '.ggggggg.', '...ggg...', '....g....', '....g....', '.bbbbbbb.', '..bbbbb..'],
  flowerbed: ['..p...y..', '.ppp.yyy.', '..p.g.y..', '..g.gg.g.', '.gg.g..gg', 'sssssssss', 'bbbbbbbbb', 'bBbBbBbBb', '.bbbbbbb.'],
  bench: ['.........', 'bbbbbbbbb', 'BBBBBBBBB', 'bbbbbbbbb', '.b.....b.', 'bbbbbbbbb', 'BBBBBBBBB', '.b.....b.', '.b.....b.'],
  fire: ['....r....', '...rro...', '..rroor..', '..roooyr.', '.rooyyor.', '.rooyyor.', '..ryyyr..', 'bbbbbbbbb', 'sbs.b.sbs'],
  fence: ['.t..t..t.', '.b..b..b.', 'bbbbbbbbb', '.b..b..b.', '.b..b..b.', 'bbbbbbbbb', '.b..b..b.', '.b..b..b.', '.........'],
  plush: ['.ww...ww.', '.wPw.wPw.', '.wwwwwww.', 'wwkwwwkww', 'wwpwwwpww', '.wwwpwww.', '..rrrrr..', '.wwwywww.', '..ww.ww..'],
  lantern: ['....s....', '...sss...', '..sbbbs..', '..syYys..', '.ssyYYyss', '..syYys..', '..sbbbs..', '...sss...', '....b....'],
  tools: ['.sSSs....', 'sSSSSs...', '.ssbss...', '...b.....', '....b....', '.....b...', '......b..', '.......b.', '........b'],
  charm: ['....c....', '...ccc...', '..ccwcc..', '...ccc...', '....c....', '..sssss..', '...sSs...', '...sss...', '..sssss..'],
  banner: ['ybrrrrr..', '.brrrrrrr', '.brrYYrr.', '.brrYYrr.', '.brrrrr..', '.b..rr...', '.b.......', '.b.......', 'bbb......'],
  slide: ['ooo......', 'obo......', 'obbee....', 'ob..eee..', 'obb..eee.', 'ob....eee', 'ob......e', 'bbb...eee', '.......ee'],
  egg: ['....h....', '...hh#...', '..h###d..', '..##o##d.', '.###o###d', '.#o###o#d', '.#######d', '..#####d.', '...ddd...'],
  'egg?': ['....w....', '...ww#...', '..w###d..', '..#yyy#d.', '.##..y##d', '.###yy##d', '.###..##d', '..##y##d.', '...ddd...'],
  kit: ['.........', '.........', '.bBBB..ss', 'bBtBbB.sS', 'bBBBbBssS', '.bBBBb.ss', '.bBBB.sss', '..bbb..ss', '.........'],
  well: ['..bbbbb..', '..b.r.b..', '..b.r.b..', '.sssssss.', 'sSSSSSSSs', 'sSCCCCCSs', 'sSSSSSSSs', '.sssssss.', '.........'],
  farm: ['.........', '..g...g..', '.ggg.ggg.', '..g...g..', 'bbbbbbbbb', 'BBbBBbBBb', 'bbbbbbbbb', 'BBbBBbBBb', '.........'],
  bridge: ['.........', '.........', 'bbbbbbbbb', 'BbBbBbBbB', 'b.b.b.b.b', 'CCCCCCCCC', 'cCcCcCcCc', 'CCCCCCCCC', '.........'],
  cradle: ['....w....', '...www...', '..wwpww..', '.........', '.bbbbbbb.', 'bBBBBBBBb', '.bBBBBBb.', '..bbbbb..', '.b.....b.'],
  tower: ['...rrr...', '..rrrrr..', '..sssss..', '..sSsSs..', '...sss...', '...sSs...', '...sss...', '..sSsSs..', '.sssssss.'],
  castle: ['s.s.s.s.s', 'sssssssss', 'sSsSsSsSs', 'ssss.ssss', 'sSss.ssSs', 'ssss.ssss', 'sSssbssSs', 'ssssbssss', 'sssssssss'],
  playground: ['.........', 'o.......o', 'oo.....eo', 'o.o...e.o', 'o..o.e..o', 'o...e...o', 'o..e....o', 'b.......b', 'ggggggggg'],
  fountain: ['....e....', '...e.e...', '..e.c.e..', '....c....', '...sss...', '.sssssss.', 'sCCCCCCCs', 'sSSSSSSSs', '.sssssss.'],
  windmill: ['w...w...w', '.w..w..w.', '..w.w.w..', '...wbw...', 'wwwbbbwww', '...BBB...', '...BbB...', '..BBBBB..', '..BBbBB..'],
  lighthouse: ['yy.r.yy..', '...rrr...', '...yYy...', '...www...', '...rrr...', '...www...', '..rrrrr..', '..wwwww..', '.sssssss.'],
  market: ['rwrwrwrwr', 'rwrwrwrwr', '.b.....b.', '.b.....b.', '.b.y.o.b.', 'BBBBBBBBB', 'BbBbBbBbB', 'BBBBBBBBB', '.b.....b.'],
  fort: ['s.s...s.s', 'sss...sss', 'sSs.r.sSs', 'sss.r.sss', 'sssssssss', 'sSsSsSsSs', 'ssss.ssss', 'sSss.ssSs', 'sssssssss'],
  snowman: ['...www...', '..wkwkw..', '..wwoww..', '...www...', '.rrrrrrr.', 'b.wwwww.b', '.bwwwwwb.', '.wwwwwww.', '..wwwww..'],
  land: ['yy.....yy', 'y.......y', '.........', '...ggg...', '...gGg...', '...ggg...', '.........', 'y.......y', 'yy.....yy'],
}

/** アイコン 1 つ（1 ドット = HUD の 1 ピクセル）。ふちを暗くして 画面の青に埋もれないように */
export function drawShopIcon(g: CanvasRenderingContext2D, id: string, x: number, y: number, dim = false) {
  let bmp = ICONS[id]
  let pal = PAL
  if (id.startsWith('egg:')) {
    const [shell, shade, light, mark] = EGG_COLORS[id.slice(4) as EggKind] ?? EGG_COLORS.inherit
    bmp = ICONS.egg
    pal = { '#': shell, d: shade, h: light, o: mark }
  } else if (id === 'egg?') pal = { ...PAL, '#': '#a9b2c9', d: '#7d87a6' }
  if (!bmp) return
  g.save()
  if (dim) g.globalAlpha = 0.55
  g.fillStyle = '#10122a'
  for (let j = 0; j < 9; j++)
    for (let i = 0; i < 9; i++) if (bmp[j][i] !== '.') g.fillRect(x + i - 1, y + j - 1, 3, 3)
  for (let j = 0; j < 9; j++)
    for (let i = 0; i < 9; i++) {
      const ch = bmp[j][i]
      if (ch === '.') continue
      g.fillStyle = pal[ch] ?? '#ffffff'
      g.fillRect(x + i, y + j, 1, 1)
    }
  g.restore()
}

/** 日本語は文字の途中で折り返してよい。maxLines を超えたら切る */
function wrap(c: ShopCtx, text: string, maxW: number, size: number, maxLines: number) {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let cur = ''
    for (const ch of para) {
      if (c.measure(cur + ch, size) > maxW && cur) {
        lines.push(cur)
        cur = ch
      } else cur += ch
    }
    lines.push(cur)
  }
  return lines.slice(0, maxLines)
}

const TONE_NAME = { ok: '#ffffff', coin: '#c6cde8', full: '#c6cde8', lock: '#8a93b8', done: '#8a93b8' }
const TONE_PRICE = { ok: '#ffe9a8', coin: '#ff7a7a', full: '#8a93b8', lock: '#8a93b8', done: '#8a93b8' }
const TONE_WHY = { ok: '#7cf29b', coin: '#ff8a8a', full: '#ffb84d', lock: '#b9a8ff', done: '#8fd0ff' }

export function drawShop(c: ShopCtx, v: ShopView) {
  const { g } = c
  const w = SHOP_WIN
  c.win(w.x, w.y, w.w, w.h)
  const cur = SHOP[v.cursor]
  const cat = cur.cat

  // 見出し
  c.text('ショップ', w.x + 10, w.y + 6, '#ffffff', 12)
  c.text('A つぎ  B かう  C とじる', w.x + 72, w.y + 9, '#8fa0d8', 8)
  g.fillStyle = '#ffd23f'
  g.beginPath()
  g.arc(w.x + w.w - 78, w.y + 14, 4, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#10122a'
  g.fillRect(w.x + w.w - 79, w.y + 11, 2, 6)
  c.text(`${v.coins}`, w.x + w.w - 10, w.y + 8, '#ffe9a8', 10, 'right')

  // タブ
  const tw = (w.w - 16) / SHOP_CATS.length
  SHOP_CATS.forEach((t, i) => {
    const on = t.id === cat
    const tx = w.x + 8 + i * tw
    g.fillStyle = on ? 'rgba(255,210,63,0.95)' : 'rgba(120,150,255,0.22)'
    g.fillRect(tx + 1, TAB_Y, tw - 2, TAB_H)
    if (on) {
      g.fillStyle = '#10122a'
      g.fillRect(tx + 1, TAB_Y + TAB_H - 1, tw - 2, 1)
    }
    c.text(t.name, tx + tw / 2, TAB_Y + 3, on ? '#10122a' : '#c8d0f0', 9, 'center')
  })
  g.fillStyle = 'rgba(232,238,255,0.55)'
  g.fillRect(w.x + 6, TAB_Y + TAB_H, w.w - 12, 1)

  // 一覧
  const list = catIndexes(cat)
  const top = shopTop(v.cursor)
  for (let k = 0; k < SHOP_ROWS; k++) {
    const i = list[top + k]
    if (i === undefined) break
    const s = SHOP[i]
    const ck = v.check(s)
    const ry = LIST_Y + k * ROW_H
    const on = i === v.cursor
    if (on) {
      g.fillStyle = 'rgba(255,210,63,0.28)'
      g.fillRect(w.x + 6, ry, w.w - 20, ROW_H - 1)
      g.fillStyle = '#ffd23f'
      g.fillRect(w.x + 6, ry, 2, ROW_H - 1)
    }
    drawShopIcon(g, s.icon, w.x + 14, ry + 3, ck.tone === 'lock' || ck.tone === 'done')
    c.text(s.name, w.x + 30, ry + 2, TONE_NAME[ck.tone], 10)
    if (ck.tone === 'done') c.text('ずみ', w.x + w.w - 18, ry + 3, '#8fd0ff', 9, 'right')
    else c.text(`${s.price}`, w.x + w.w - 18, ry + 2, TONE_PRICE[ck.tone], 10, 'right')
    if (ck.max !== undefined && ck.tone !== 'done') {
      const full = (ck.have ?? 0) >= ck.max
      c.text(`${ck.have}/${ck.max}`, w.x + w.w - 60, ry + 3, full ? '#ffb84d' : '#7fd8ff', 9, 'right')
    }
    if (ck.tone === 'lock') c.text('まだ', w.x + w.w - 60, ry + 3, '#b9a8ff', 9, 'right')
  }
  // ▲▼ とスクロールの目印
  if (list.length > SHOP_ROWS) {
    const trackH = SHOP_ROWS * ROW_H - 4
    g.fillStyle = 'rgba(10,14,40,0.55)'
    g.fillRect(w.x + w.w - 12, LIST_Y + 2, 3, trackH)
    g.fillStyle = '#9fd8ff'
    const th = Math.max(8, Math.round((trackH * SHOP_ROWS) / list.length))
    const ty = LIST_Y + 2 + Math.round(((trackH - th) * top) / (list.length - SHOP_ROWS))
    g.fillRect(w.x + w.w - 12, ty, 3, th)
  }

  // 説明（2 行まで）と 買えるか
  g.fillStyle = 'rgba(232,238,255,0.4)'
  g.fillRect(w.x + 6, FOOT_Y - 2, w.w - 12, 1)
  const lines = wrap(c, cur.desc, w.w - 24, 9, 2)
  lines.forEach((l, i) => c.text(l, w.x + 10, FOOT_Y + 2 + i * 11, '#9fd8ff', 9))
  const ck = v.check(cur)
  const why = ck.ok ? `かうと のこり ${v.coins - cur.price}` : ck.why
  c.text(why, w.x + 10, w.y + w.h - 17, TONE_WHY[ck.tone], 9)
  // 「かう」ボタン（タップ用）
  const blink = ck.ok && Math.floor(v.time * 2) % 2 === 0
  g.fillStyle = ck.ok ? (blink ? 'rgba(255,210,63,0.95)' : 'rgba(230,180,40,0.9)') : 'rgba(120,130,170,0.4)'
  g.fillRect(BTN.x, BTN.y, BTN.w, BTN.h)
  g.strokeStyle = 'rgba(255,255,255,0.6)'
  g.strokeRect(BTN.x + 0.5, BTN.y + 0.5, BTN.w - 1, BTN.h - 1)
  c.text(ck.ok ? 'かう' : 'かえない', BTN.x + BTN.w / 2, BTN.y + 2, ck.ok ? '#10122a' : '#b9c0dc', 9, 'center')
}
