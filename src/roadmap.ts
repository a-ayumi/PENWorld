/**
 * もくひょう（ロードマップ）：章立ての長い目標。
 * 条件は「データ表」（章 → 目標 → 判定）。World は 1 秒に 1 回、いまの状態 `RoadState` を渡して `roadStep()` を呼ぶだけ。
 * 出来事ごとのフックは持たない。達成した目標は「ラッチ」して残る（あとで条件が崩れても取り消さない）。
 * 章を足す時は `CHAPTERS` に 1 つ足すだけ（セーブは目標 ID を表と照合して読み込む）。
 */
import type { StructKind } from './world/structures'
import type { EggKind } from './world/monsters'

/** 判定に使う、いまの世界の数字（World.roadState() が作る） */
export interface RoadState {
  /** あそんだ時間（秒・世代をこえた合計） */
  time: number
  /** 完成した家（全ステージ） */
  houses: number
  /** 村のレベル（いま見ているステージ）0〜3 */
  vLv: number
  /** 完成した建物の数（種類ごと・全ステージ） */
  built: Record<StructKind, number>
  /** 仲間の数（こども・たまごからの子をふくむ） */
  friends: number
  /** たまごからかえした子の数 */
  children: number
  /** 仲間がかった回数 */
  wins: number
  dexOwned: number
  dexTotal: number
  gen: number
  /** かいたく（0〜2） */
  land: number
  /** 行ったことのあるステージの数 */
  stages: number
  /** 敵軍を追いはらった回数（ボス戦をふくむ） */
  armyWins: number
  /** 大軍勢を たおした回数 */
  bossWins: number
}

type Num = number | ((s: RoadState) => number)
export interface Goal {
  id: string
  /** 短い言い方（HUD の 1 行にも出る） */
  text: string
  need: Num
  val: (s: RoadState) => number
  /** 大軍勢との たたかいで決まる目標（じゅんびの目標が終わるまで挑めない） */
  boss?: boolean
}
export interface Reward {
  coins: number
  egg?: EggKind
  title: string
  /** 色が変わる おうかんの おきもの */
  crown?: boolean
}
export interface Chapter {
  no: number
  name: string
  intro: string[]
  outro: string[]
  goals: Goal[]
  reward: Reward
}

const KINDS: StructKind[] = ['farm', 'well', 'tower', 'cradle', 'wall', 'castle', 'bridge']
const built = (k: StructKind) => (s: RoadState) => s.built[k]

export const CHAPTERS: Chapter[] = [
  {
    no: 1, name: 'はじまり',
    intro: ['ひかりの はこの なかで、', 'ちいさな いのちが めを さました。', 'まずは ペットと いっしょに すごそう。'],
    outro: ['はじめての いえに あかりが ともった。', 'ここが ふたりの はこにわだ。'],
    goals: [
      { id: 'c1-time', text: 'ペットと 3ぷん すごす', need: 180, val: (s) => s.time },
      { id: 'c1-house', text: 'いえを 1けん たてる', need: 1, val: (s) => s.houses },
      { id: 'c1-win', text: 'たたかいに 1かい かつ', need: 1, val: (s) => s.wins },
    ],
    reward: { coins: 40, title: 'ちいさな かいぬし' },
  },
  {
    no: 2, name: 'むらびらき',
    intro: ['いえが ひとつ あれば、', 'なかまが あつまってくる。', 'はこにわに むらを ひらこう。'],
    outro: ['はたけに みのりが ゆれて、', 'むらの なまえが かぜに のった。'],
    goals: [
      { id: 'c2-village', text: 'むらを ひらく（むらレベル1）', need: 1, val: (s) => s.vLv },
      { id: 'c2-farm', text: 'はたけを つくる', need: 1, val: built('farm') },
      { id: 'c2-house', text: 'いえを 2けんに する', need: 2, val: (s) => s.houses },
    ],
    reward: { coins: 60, title: 'むらびらきの ひと' },
  },
  {
    no: 3, name: 'なかまを ふやそう',
    intro: ['ひとりより ふたり、ふたりより みんな。', 'たまごを あたためて、', 'にぎやかな むらに しよう。'],
    outro: ['わらいごえが はこにわに ひびく。', 'みんなが ここを いえと よんでいる。'],
    goals: [
      { id: 'c3-friends', text: 'なかまを 3びきに する', need: 3, val: (s) => s.friends },
      { id: 'c3-egg', text: 'たまごを かえす', need: 1, val: (s) => s.children },
      { id: 'c3-dex', text: 'ずかんに なかま 5しゅ', need: 5, val: (s) => s.dexOwned },
    ],
    reward: { coins: 80, egg: 'cat', title: 'なかまの まとめやく' },
  },
  {
    no: 4, name: 'まもりを かためよう',
    intro: ['はこの そとから、こわれた データの', 'ノイズが ねらっている。', 'みはりを たてて、むらを まもろう。'],
    outro: ['ノイズの むれを おしかえした。', 'むらの みんなが こぶしを あげる。'],
    goals: [
      { id: 'c4-tower', text: 'みはりとうを たてる', need: 1, val: built('tower') },
      { id: 'c4-well', text: 'いどを ほる', need: 1, val: built('well') },
      { id: 'c4-army', text: 'てきぐんを おいはらう', need: 1, val: (s) => s.armyWins },
    ],
    reward: { coins: 100, egg: 'dog', title: 'むらの まもりて' },
  },
  {
    no: 5, name: 'まちに なった',
    intro: ['いえが ならび、はたけが ひろがる。', 'むらは もう むらじゃない。', 'まちとして めざめるときが きた。'],
    outro: ['ひるも よるも あかりが きえない。', 'ここは はこにわ いちばんの まちだ。'],
    goals: [
      { id: 'c5-town', text: 'まちに そだてる（むらレベル2）', need: 2, val: (s) => s.vLv },
      { id: 'c5-dex', text: 'ずかんに なかま 15しゅ', need: 15, val: (s) => s.dexOwned },
      { id: 'c5-cradle', text: 'ゆりかごごやを たてる', need: 1, val: built('cradle') },
    ],
    reward: { coins: 150, egg: 'bird', title: 'まちの せわやく' },
  },
  {
    no: 6, name: 'おしろ',
    intro: ['まちの まんなかに、', 'みんなの こころの よりどころを。', 'たかい おしろと かたい へいを たてよう。'],
    outro: ['おしろの はたが かぜに なびく。', 'どんな ノイズも もう こわくない。'],
    goals: [
      { id: 'c6-castle', text: 'おしろを かんせいさせる', need: 1, val: built('castle') },
      { id: 'c6-wall', text: 'へいを たてる', need: 1, val: built('wall') },
      { id: 'c6-army', text: 'てきぐんを 2かい おいはらう', need: 2, val: (s) => s.armyWins },
    ],
    reward: { coins: 200, egg: 'machine', title: 'おしろの あるじ' },
  },
  {
    no: 7, name: 'ひろがる せかい',
    intro: ['はこの かべの むこうにも', 'まだ しらない けしきが ある。', 'はこにわを ひろげて、たびに でよう。'],
    outro: ['どこへ いっても、かえる いえが ある。', 'それが こんなに ここち いいなんて。'],
    goals: [
      { id: 'c7-land', text: 'かいたく② で はこにわを ひろげる', need: 2, val: (s) => s.land },
      { id: 'c7-stage', text: '3つの ばしょを たずねる', need: 3, val: (s) => s.stages },
      { id: 'c7-house', text: 'いえを 4けんに する', need: 4, val: (s) => s.houses },
    ],
    reward: { coins: 250, egg: 'water', title: 'せかいの たびびと' },
  },
  {
    no: 8, name: 'ながい たび',
    intro: ['ときは ながれ、いのちは めぐる。', 'うけつがれる ねがいが', 'むらの みらいを つくっていく。'],
    outro: ['ふるい ほしの かざりが', 'あたらしい いのちを みまもっている。'],
    goals: [
      { id: 'c8-gen', text: 'うまれかわりを むかえる（2せだい）', need: 2, val: (s) => s.gen },
      { id: 'c8-dex', text: 'ずかんに なかま 30しゅ', need: 30, val: (s) => s.dexOwned },
      { id: 'c8-win', text: 'たたかいに 20かい かつ', need: 20, val: (s) => s.wins },
    ],
    reward: { coins: 300, egg: 'dragon', title: 'ときを こえる もの' },
  },
  {
    no: 9, name: 'だいぐんぜい',
    intro: ['はこの おくが、ひどく ざわめく。', 'ノイズの おうが めざめ、', 'すべてを けしに やってくる。'],
    outro: ['ノイズの おうは ひかりに とけた。', 'はこにわに、やさしい かぜが もどる。'],
    goals: [
      { id: 'c9-tower', text: 'みはりとうを 3とう たてる', need: 3, val: built('tower') },
      { id: 'c9-friends', text: 'なかまを 8ひきに する', need: 8, val: (s) => s.friends },
      { id: 'c9-boss', text: 'だいぐんぜいを うちやぶる', need: 1, val: (s) => s.bossWins, boss: true },
    ],
    reward: { coins: 500, egg: 'monster', title: 'はこにわの えいゆう', crown: true },
  },
  {
    no: 10, name: 'えんたいせん',
    intro: ['ものがたりは ひとまず おしまい。', 'でも はこにわの まいにちは つづく。', 'さいごの ひとつぶまで たのしもう。'],
    outro: ['すべてを やりとげた。', 'この はこにわは、きみの せかいだ。'],
    goals: [
      { id: 'c10-dex', text: 'ずかんを コンプリート', need: (s) => s.dexTotal, val: (s) => s.dexOwned },
      { id: 'c10-built', text: '7しゅの たてものを ぜんぶ たてる', need: KINDS.length, val: (s) => KINDS.filter((k) => s.built[k] > 0).length },
      { id: 'c10-gen', text: '3せだい めを むかえる', need: 3, val: (s) => s.gen },
      { id: 'c10-army', text: 'てきぐんを 10かい おいはらう', need: 10, val: (s) => s.armyWins },
    ],
    reward: { coins: 1000, title: 'はこにわの でんせつ' },
  },
]

export const START_TITLE = 'ひよっこ かいぬし'
/** 大軍勢の章（第 9 章）の添字 */
export const BOSS_CHAPTER = 8
export const needOf = (g: Goal, s: RoadState) => (typeof g.need === 'function' ? g.need(s) : g.need)
const ALL_IDS = new Set(CHAPTERS.flatMap((c) => c.goals.map((g) => g.id)))

/** 保存する進み具合 */
export interface Road {
  done: Set<string>
  /** クリアした章の数 */
  cleared: number
  /** 章の頭の物語を見せた章の数 */
  intro: number
  /** 敵軍を追いはらった回数 / 大軍勢をたおした回数 / いどんで負けた回数 */
  wins: number
  bossWins: number
  bossTry: number
  /** 行ったことのあるステージ（ビット） */
  visited: number
  crown: boolean
}
export const newRoad = (): Road => ({ done: new Set(), cleared: 0, intro: 0, wins: 0, bossWins: 0, bossTry: 0, visited: 0, crown: false })

const int = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : lo)

/** セーブから読む（信用せず検査する）。ID は表にあるものだけ。章の数とつじつまを合わせる */
export function loadRoad(raw: unknown): Road | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const d = raw as Record<string, unknown>
  const r = newRoad()
  if (Array.isArray(d.done)) for (const id of d.done.slice(0, 64)) if (typeof id === 'string' && ALL_IDS.has(id)) r.done.add(id)
  r.cleared = int(d.cleared, 0, CHAPTERS.length)
  r.intro = int(d.intro, 0, CHAPTERS.length + 1)
  r.wins = int(d.wins, 0, 99999)
  r.bossWins = int(d.bossWins, 0, 99999)
  r.bossTry = int(d.bossTry, 0, 99999)
  r.visited = int(d.visited, 0, 31)
  r.crown = d.crown === true
  // クリア済みの章の目標は ぜんぶ達成のはず
  for (const c of CHAPTERS.slice(0, r.cleared)) for (const g of c.goals) r.done.add(g.id)
  return r
}
export function saveRoad(r: Road) {
  return { done: [...r.done], cleared: r.cleared, intro: r.intro, wins: r.wins, bossWins: r.bossWins, bossTry: r.bossTry, visited: r.visited, crown: r.crown }
}

export const current = (r: Road): Chapter | null => CHAPTERS[r.cleared] ?? null
export const titleOf = (r: Road) => (r.cleared > 0 ? CHAPTERS[r.cleared - 1].reward.title : START_TITLE)
/** 大軍勢にいどむ じゅんびの目標（ボス以外）が ぜんぶ終わっている */
export function bossReady(r: Road): boolean {
  return r.cleared === BOSS_CHAPTER && CHAPTERS[BOSS_CHAPTER].goals.every((g) => g.boss || r.done.has(g.id))
}
/** HUD に出す いまの目標（いまの章のまだ終わっていない最初の目標） */
export function nowGoal(r: Road, s: RoadState): { chapter: Chapter; goal: Goal; val: number; need: number } | null {
  const chapter = current(r)
  if (!chapter) return null
  const goal = chapter.goals.find((g) => !r.done.has(g.id)) ?? chapter.goals[chapter.goals.length - 1]
  const need = needOf(goal, s)
  return { chapter, goal, val: Math.min(goal.val(s), need), need }
}

export interface RoadEvents {
  /** いまの章で新しく達成した目標 */
  goals: Goal[]
  /** この呼び出しでクリアした章 */
  clear: Chapter | null
  /** はじめて見せる章の頭の物語 */
  intro: Chapter | null
}

/** 1 秒に 1 回：目標を判定して、達成を記録する。章は 1 回の呼び出しで 1 つまでクリア */
export function roadStep(r: Road, s: RoadState): RoadEvents {
  const ev: RoadEvents = { goals: [], clear: null, intro: null }
  const now = current(r)
  for (const c of CHAPTERS) {
    for (const g of c.goals) {
      if (r.done.has(g.id) || g.val(s) < needOf(g, s)) continue
      r.done.add(g.id)
      if (c === now) ev.goals.push(g)
    }
  }
  if (now && now.goals.every((g) => r.done.has(g.id))) {
    r.cleared++
    ev.clear = now
  }
  const next = current(r)
  if (next && r.intro < r.cleared + 1) {
    r.intro = r.cleared + 1
    ev.intro = next
  }
  return ev
}

/** 読み込み直後：これまでの実績から章をさかのぼって進める（音も演出もなし）。クリアした章を返す */
export function backfill(r: Road, s: RoadState): Chapter[] {
  const out: Chapter[] = []
  for (let i = 0; i < CHAPTERS.length; i++) {
    const ev = roadStep(r, s)
    if (!ev.clear) break
    out.push(ev.clear)
  }
  // 物語は すでに見たことにして、いまの章の頭だけ あとで見せる
  r.intro = r.cleared
  return out
}

export interface RoadView {
  title: string
  cleared: number
  total: number
  chapters: {
    no: number; name: string; state: 'done' | 'now' | 'next'
    intro: string[]; outro: string[]
    goals: { text: string; val: number; need: number; done: boolean; boss: boolean }[]
    reward: string
  }[]
}

const rewardText = (w: Reward) => `コイン+${w.coins}${w.egg ? ' ・ごほうびの たまご' : ''}${w.crown ? ' ・おうかんの おきもの' : ''} ・しょうごう「${w.title}」`

export function roadView(r: Road, s: RoadState): RoadView {
  return {
    title: titleOf(r),
    cleared: r.cleared,
    total: CHAPTERS.length,
    chapters: CHAPTERS.map((c, i) => ({
      no: c.no, name: c.name, state: i < r.cleared ? 'done' : i === r.cleared ? 'now' : 'next',
      intro: c.intro, outro: c.outro,
      goals: c.goals.map((g) => {
        const need = needOf(g, s)
        const done = r.done.has(g.id)
        return { text: g.text, val: done ? need : Math.min(g.val(s), need), need, done, boss: !!g.boss }
      }),
      reward: rewardText(c.reward),
    })),
  }
}
