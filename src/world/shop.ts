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
  { id: 'item', name: 'おきもの' },
  { id: 'plan', name: 'せっけいず' },
  { id: 'land', name: 'かいたく' },
]

/** 大きな世界では かいたくが いらないので タブを かくす */
export function setShopLand(on: boolean) {
  const i = SHOP_CATS.findIndex((t) => t.id === 'land')
  if (!on && i >= 0) SHOP_CATS.splice(i, 1)
  if (on && i < 0) SHOP_CATS.push({ id: 'land', name: 'かいたく' })
}
/** いま 見せている タブの 品か */
export const shownCat = (cat: ShopCat) => SHOP_CATS.some((t) => t.id === cat)

/**
 * 値段の考え方：はじめは 50 コインほど → 30〜60 の小物から（ボール・なえ・はなだん・ベンチ・たき火）。
 * 村が育つと 60〜80（ぬいぐるみ・ランタン・だいくどうぐ・おまもり）、仲間が増えると 100 以上（たまご・おうえんばた・すべりだい）、
 * 終盤は 160〜500（おしろ・かいたく）。同じカテゴリの中は 安い順。
 */
export const SHOP: ShopItem[] = [

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


  { id: 'kit', cat: 'plan', icon: 'kit', name: 'ざいもくセット', price: 35, desc: '木3つと 石2つを まとめて おく。\n家づくりの ざいりょうに', kit: true },
  { id: 'bp-well', cat: 'plan', icon: 'well', name: 'せっけいず：いど', price: 35, desc: 'ちかくの みんなの たいりょくが\nすこしずつ かいふくする', plan: 'well' },
  { id: 'bp-diner', cat: 'plan', icon: 'diner', name: 'せっけいず：ごはんや', price: 55, desc: 'たべもの 1 つを 2 にんぶんに りょうり。\nごはんがかりが みんなに くばる', plan: 'diner' },
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

  { id: 'land1', cat: 'land', icon: 'land', name: 'かいたく ①', price: 250, desc: 'はこにわが 64 → 80 に ひろがる。\n家や たてもの・置き物は そのまま', land: 1 },
  { id: 'land2', cat: 'land', icon: 'land', name: 'かいたく ②', price: 500, desc: 'はこにわが 80 → 96 に ひろがる。\nおおきな むらを つくれる', land: 2 },
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
  /** 店主の ひとこと（買った直後など。無ければ えらんでいる 品から 決める） */
  talk?: string
  /** うけている ちゅうもん（まだ 建ちはじめていない 物） */
  orders?: string[]
  /** 住民の おねがい（ほしがっている 品の id と だれ） */
  wish?: { id: string; who: string }
}

export interface ShopCtx {
  g: CanvasRenderingContext2D
  text(s: string, x: number, y: number, color?: string, size?: number, align?: CanvasTextAlign, plain?: boolean): void
  win(x: number, y: number, w: number, h: number): void
  measure(s: string, size: number): number
}

// ------------------------------------------------------------------ 画面の寸法（描く時と タップの判定で共通）
export const SHOP_WIN = { x: 8, y: 26, w: 304, h: 232 }
/** 店主と ふきだしの 高さ */
const HEAD_H = 50
const TAB_Y = SHOP_WIN.y + HEAD_H + 2
const TAB_H = 15
const LIST_Y = TAB_Y + TAB_H + 3
const ROW_H = 15
export const SHOP_ROWS = 7
const FOOT_Y = LIST_Y + SHOP_ROWS * ROW_H + 3
const BTN = { x: SHOP_WIN.x + SHOP_WIN.w - 64, y: SHOP_WIN.y + SHOP_WIN.h - 19, w: 54, h: 14 }

export const catOf = (cursor: number): ShopCat => SHOP[Math.max(0, Math.min(SHOP.length - 1, cursor))].cat
/** あるカテゴリの商品の番号（SHOP の添字）の一覧 */
export const catIndexes = (cat: ShopCat) => SHOP.map((s, i) => (s.cat === cat ? i : -1)).filter((i) => i >= 0)
/** カテゴリの中で 画面の先頭に出す行（カーソルが見えるように） */
export function shopTop(cursor: number) {
  const list = catIndexes(catOf(cursor))
  const pos = Math.max(0, list.indexOf(cursor))
  return Math.max(0, Math.min(Math.max(0, list.length - SHOP_ROWS), pos - Math.floor(SHOP_ROWS / 2)))
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
  diner: ['..w.w.w..', '.w.w.w...', '..w.w.w..', '.........', 'ooooooooo', '.oyyoyyo.', '.ooooooo.', '..ooooo..', '...bbb...'],
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

const TONE_NAME = { ok: '#f6e9c8', coin: '#bfae90', full: '#bfae90', lock: '#8d7f6c', done: '#8d7f6c' }
const TONE_PRICE = { ok: '#ffd36b', coin: '#ff7a6a', full: '#8d7f6c', lock: '#8d7f6c', done: '#8d7f6c' }
const TONE_WHY = { ok: '#a8e07a', coin: '#ff8a7a', full: '#ffb84d', lock: '#c9b0ff', done: '#9fd0e8' }

// ------------------------------------------------------------------ 店主「ハコジイ」（オリジナル：たからばこの 体に 片めがね・ひげ）
// 20×18 の ドット。k = りんかく / B,b = 木の ふた / y,Y = 金の かなぐ / w = 目 / n = ひとみ / g = 片めがね / m = ひげ / r = した
const KEEPER = [
  '....kkkkkkkkkkkk....',
  '...kBBBBBBBBBBBBk...',
  '..kBbbbbbbbbbbbbBk..',
  '..kbbYbbbbbbbbYbbk..',
  '..kkkkkkkykkkkkkkk..',
  '..kwwwkrrrrrrkwwwk..',
  '.kwwnwwkrrrrkwwnwwk.',
  '.kwwnwwkkrrkkgwnwgk.',
  '..kwwwk.kmmk.gwwwg..',
  '..kkkkmmmmmmmmkkgk..',
  '..kBBBmmkkkkmmBBBk..',
  '..kBbbbbbYYbbbbbBk..',
  '..kBbbbbYyyYbbbbBk..',
  '..kbbbbbbYYbbbbbbk..',
  '.kkBbbbbbbbbbbbbBkk.',
  'kBk.kkkkkkkkkkkk.kBk',
  'kk..kBk......kBk..kk',
  '....kk........kk....',
]
const KEEPER_PAL: Record<string, string> = {
  k: '#24160f', B: '#b0703c', b: '#8a5228', y: '#e8b23a', Y: '#ffe08a', w: '#fff6e0', n: '#2a1a3a', g: '#cfe6ff', m: '#efe2c8', r: '#c8404a',
}
function drawKeeper(g: CanvasRenderingContext2D, x: number, y: number, t: number, blink: boolean, talk: boolean) {
  // ふわふわ うかぶ・しゃべると ふたが ぱくぱく
  const bob = Math.round(Math.sin(t * 2.2))
  const open = talk && Math.floor(t * 6) % 2 === 0 ? 1 : 0
  for (let j = 0; j < KEEPER.length; j++) {
    const row = KEEPER[j]
    for (let i = 0; i < row.length; i++) {
      let ch = row[i]
      if (ch === '.') continue
      if (blink && (ch === 'w' || ch === 'n') && j >= 5 && j <= 8) ch = j === 7 ? 'k' : 'b'
      g.fillStyle = KEEPER_PAL[ch]
      g.fillRect(x + i * 2, y + j * 2 + bob - (j < 4 ? open * 2 : 0), 2, 2)
    }
  }
}

/** たいまつ（ゆらめく ほのお） */
function drawTorch(g: CanvasRenderingContext2D, x: number, y: number, t: number) {
  g.fillStyle = '#4a3020'
  g.fillRect(x - 1, y + 4, 3, 9)
  g.fillStyle = '#6a6a72'
  g.fillRect(x - 2, y + 4, 5, 2)
  const f = Math.sin(t * 13 + x) * 0.5 + Math.sin(t * 7.3 + x * 0.3) * 0.5
  g.fillStyle = 'rgba(255,170,60,0.16)'
  g.beginPath()
  g.arc(x + 0.5, y + 1, 9 + f * 1.5, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#ff7a2a'
  g.fillRect(x - 1, y - 2 - Math.round(f), 3, 6 + Math.round(f))
  g.fillStyle = '#ffd36b'
  g.fillRect(x, y - Math.round(f), 1, 4)
}

/** 石づみの かべ（店の うしろ） */
function drawBricks(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.fillStyle = '#211a1c'
  g.fillRect(x, y, w, h)
  for (let r = 0, yy = y; yy < y + h; r++, yy += 8) {
    for (let xx = x - (r % 2) * 9; xx < x + w; xx += 18) {
      const bx = Math.max(x, xx + 1)
      const bw = Math.min(x + w, xx + 17) - bx
      if (bw <= 0) continue
      const bh = Math.min(7, y + h - yy - 1)
      if (bh <= 0) continue
      const v = ((xx * 7 + r * 13) & 7) / 7
      g.fillStyle = v < 0.3 ? '#2e2528' : v < 0.7 ? '#33292b' : '#3a2f2f'
      g.fillRect(bx, yy + 1, bw, bh)
      g.fillStyle = 'rgba(255,220,180,0.05)'
      g.fillRect(bx, yy + 1, bw, 1)
    }
  }
}

/** 羊皮紙の 帯 */
function parchment(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a = 1) {
  g.globalAlpha = a
  g.fillStyle = '#e9d8b0'
  g.fillRect(x, y, w, h)
  g.fillStyle = '#d6c08f'
  g.fillRect(x, y + h - 1, w, 1)
  g.fillRect(x, y, 1, h)
  g.fillStyle = '#f6ead0'
  g.fillRect(x + 1, y, w - 1, 1)
  g.globalAlpha = 1
}

/** 店主の ひとこと：えらんでいる 品と 買えるかどうかで かわる */
function keeperLine(it: ShopItem, ck: ShopCheck, coins: number): string {
  if (ck.tone === 'coin') return coins < 20 ? 'からっぽの さいふだね…\nまた おいで' : 'コインが ちと たりんのう'
  if (ck.tone === 'full') return 'それは もう じゅうぶん\nあるようじゃ'
  if (ck.tone === 'lock') return 'それは まだ はやいのう'
  if (ck.tone === 'done') return 'それは もう すんだ はなしじゃ'
  if (it.cat === 'plan') return 'せっけいずじゃな。\nしょくにんたちに つたえよう'
  if (it.cat === 'land') return 'あたらしい とちか…\nゆめが ひろがるのう'
  return it.price >= 100 ? 'おめが たかいのう。\nとっておきの しなじゃ' : 'いい しなじゃろ？\nたのめば むらで くみたてるぞ'
}

export function drawShop(c: ShopCtx, v: ShopView) {
  const { g } = c
  const w = SHOP_WIN
  const cur = SHOP[v.cursor]
  const cat = cur.cat
  const ck = v.check(cur)

  // わく：くらい 石の かべ + 木の ふち
  g.fillStyle = '#5a3a22'
  g.fillRect(w.x - 2, w.y - 2, w.w + 4, w.h + 4)
  g.fillStyle = '#2a1a10'
  g.fillRect(w.x - 1, w.y - 1, w.w + 2, w.h + 2)
  drawBricks(g, w.x, w.y, w.w, w.h)
  // かどの 鉄の びょう
  g.fillStyle = '#8a8a92'
  for (const [px, py] of [[w.x + 2, w.y + 2], [w.x + w.w - 4, w.y + 2], [w.x + 2, w.y + w.h - 4], [w.x + w.w - 4, w.y + w.h - 4]]) g.fillRect(px, py, 2, 2)

  // 見出し：たいまつ・店主・ふきだし・コイン
  drawTorch(g, w.x + 10, w.y + 14, v.time)
  drawTorch(g, w.x + w.w - 10, w.y + 14, v.time + 1.7)
  // ときどき うけている ちゅうもんの ようすも はなす
  const ord = v.orders ?? []
  const status = ord.length && ck.tone === 'ok' && Math.floor(v.time / 4) % 3 === 2
    ? `ちゅうもん ${ord.length}けん うけたまわり中\n${ord.slice(0, 2).join('・')}${ord.length > 2 ? ' ほか' : ''}`
    : null
  const wishLine = v.wish && (v.wish.id === cur.id || Math.floor(v.time / 4) % 3 === 1)
    ? `${v.wish.who}が ${SHOP.find((s) => s.id === v.wish!.id)?.name.replace('せっけいず：', '') ?? ''}を\nほしがっておったぞ`
    : null
  const talk = v.talk ?? wishLine ?? status ?? keeperLine(cur, ck, v.coins)
  const blink = Math.floor(v.time * 1.3) % 5 === 0 && (v.time * 1.3) % 1 < 0.18
  drawKeeper(g, w.x + 20, w.y + 8, v.time, blink, !!v.talk)
  c.text('よろずや ハコジイ', w.x + 66, w.y + 4, '#ffd36b', 9)
  // ふきだし
  const bx = w.x + 64
  const by = w.y + 16
  const bw = w.w - 64 - 70
  parchment(g, bx, by, bw, 30)
  g.fillStyle = '#e9d8b0'
  g.fillRect(bx - 3, by + 10, 3, 4)
  g.fillRect(bx - 5, by + 12, 2, 2)
  wrap(c, talk, bw - 8, 9, 2).forEach((l, i) => c.text(l, bx + 4, by + 3 + i * 12, '#3a2414', 9, 'left', true))
  // コイン（ふくろ）
  g.fillStyle = '#7a5230'
  g.fillRect(w.x + w.w - 62, w.y + 22, 14, 13)
  g.fillRect(w.x + w.w - 59, w.y + 19, 8, 3)
  g.fillStyle = '#ffd23f'
  g.fillRect(w.x + w.w - 57, w.y + 26, 4, 4)
  c.text(`${v.coins}`, w.x + w.w - 14, w.y + 24, '#ffe9a8', 10, 'right')
  c.text('A つぎ B かう C とじる', w.x + w.w - 14, w.y + 38, '#a08a6a', 7, 'right')

  // タブ：木の ふだ（えらんでいる 物は 羊皮紙）
  const tw = (w.w - 16) / SHOP_CATS.length
  SHOP_CATS.forEach((t, i) => {
    const on = t.id === cat
    const tx = w.x + 8 + i * tw
    if (on) parchment(g, tx + 1, TAB_Y, tw - 2, TAB_H)
    else {
      g.fillStyle = '#6a4428'
      g.fillRect(tx + 1, TAB_Y, tw - 2, TAB_H)
      g.fillStyle = '#80553a'
      g.fillRect(tx + 1, TAB_Y, tw - 2, 1)
    }
    c.text(t.name, tx + tw / 2, TAB_Y + 3, on ? '#3a2414' : '#e8d4b0', 9, 'center', on)
  })
  // たな板
  g.fillStyle = '#6a4428'
  g.fillRect(w.x + 6, TAB_Y + TAB_H, w.w - 12, 2)

  // 一覧：たなに ならんだ 品
  const list = catIndexes(cat)
  const top = shopTop(v.cursor)
  for (let k = 0; k < SHOP_ROWS; k++) {
    const i = list[top + k]
    if (i === undefined) break
    const s = SHOP[i]
    const sk = v.check(s)
    const ry = LIST_Y + k * ROW_H
    const on = i === v.cursor
    if (on) {
      parchment(g, w.x + 6, ry, w.w - 20, ROW_H - 1, 0.95)
      g.fillStyle = '#c8404a'
      g.fillRect(w.x + 6, ry, 2, ROW_H - 1)
    } else {
      g.fillStyle = 'rgba(0,0,0,0.25)'
      g.fillRect(w.x + 6, ry + ROW_H - 2, w.w - 20, 1)
    }
    drawShopIcon(g, s.icon, w.x + 14, ry + 3, sk.tone === 'lock' || sk.tone === 'done')
    const ink = (col: string) => (on ? '#3a2414' : col)
    c.text(s.name, w.x + 30, ry + 2, on ? '#3a2414' : TONE_NAME[sk.tone], 10, 'left', on)
    if (sk.tone === 'done') c.text('ずみ', w.x + w.w - 18, ry + 3, ink('#9fd0e8'), 9, 'right', on)
    else c.text(`${s.price}`, w.x + w.w - 18, ry + 2, on ? (sk.tone === 'coin' ? '#b0302a' : '#7a4a10') : TONE_PRICE[sk.tone], 10, 'right', on)
    if (sk.max !== undefined && sk.tone !== 'done') {
      const full = (sk.have ?? 0) >= sk.max
      c.text(`${sk.have}/${sk.max}`, w.x + w.w - 60, ry + 3, on ? '#5a4a30' : full ? '#ffb84d' : '#9fd0e8', 9, 'right', on)
    }
    if (sk.tone === 'lock') c.text('まだ', w.x + w.w - 60, ry + 3, ink('#7a5aa0'), 9, 'right', on)
    // おねがいの 品には ハート
    if (v.wish?.id === s.id) c.text('♥', w.x + w.w - 84, ry + 2, on ? '#c8405a' : '#ff8fb1', 10, 'right', on)
  }
  // スクロールの 目印（くさり）
  if (list.length > SHOP_ROWS) {
    const trackH = SHOP_ROWS * ROW_H - 4
    g.fillStyle = 'rgba(0,0,0,0.45)'
    g.fillRect(w.x + w.w - 12, LIST_Y + 2, 3, trackH)
    g.fillStyle = '#c9a26a'
    const th = Math.max(8, Math.round((trackH * SHOP_ROWS) / list.length))
    const ty = LIST_Y + 2 + Math.round(((trackH - th) * top) / (list.length - SHOP_ROWS))
    g.fillRect(w.x + w.w - 12, ty, 3, th)
  }

  // 説明：まきものに 2 行
  parchment(g, w.x + 6, FOOT_Y - 1, w.w - 12, 26, 0.92)
  wrap(c, cur.desc, w.w - 24, 9, 2).forEach((l, i) => c.text(l, w.x + 10, FOOT_Y + 1 + i * 11, '#3a2414', 9, 'left', true))
  const why = ck.ok ? `かうと のこり ${v.coins - cur.price}` : ck.why
  c.text(why, w.x + 10, w.y + w.h - 17, TONE_WHY[ck.tone], 9)
  // 「かう」ボタン：赤い ろうの ふういん / 買えない時は 鉄の 板
  const blink2 = ck.ok && Math.floor(v.time * 2) % 2 === 0
  g.fillStyle = ck.ok ? (blink2 ? '#d8484a' : '#b8383a') : '#4a4a52'
  g.fillRect(BTN.x, BTN.y, BTN.w, BTN.h)
  g.fillStyle = ck.ok ? '#ff8a7a' : '#6a6a72'
  g.fillRect(BTN.x, BTN.y, BTN.w, 1)
  g.fillStyle = '#1a1010'
  g.fillRect(BTN.x, BTN.y + BTN.h, BTN.w, 1)
  c.text(ck.ok ? 'かう' : 'かえない', BTN.x + BTN.w / 2, BTN.y + 2, ck.ok ? '#fff2e0' : '#a8a8b0', 9, 'center')
}
