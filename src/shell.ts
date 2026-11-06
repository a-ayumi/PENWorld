/**
 * 画面のまわりの「やさしい表示」：起動中のスプラッシュ、WebGL が使えない / 止まった時の案内、
 * あたらしいバージョンのお知らせ、初回だけの遊び方ヒント。HTML の文字はすべて textContent で入れる（外部データは入れない）。
 */
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null

// ---------------- スプラッシュ ----------------
export function hideSplash() {
  const el = $('splash')
  if (!el) return
  el.classList.add('gone')
  setTimeout(() => el.remove(), 700)
}

/** 起動に失敗した時（スクリプトのエラー / 時間がかかりすぎ）、スプラッシュを案内に変える */
function splashProblem(msg: string) {
  const el = $('splash')
  if (!el || el.classList.contains('gone')) return
  const m = $('splash-msg')
  if (m) m.textContent = msg
  const b = $<HTMLButtonElement>('splash-reload')
  if (b) {
    b.hidden = false
    b.onclick = () => location.reload()
  }
  el.querySelector('.bar')?.setAttribute('hidden', '')
}

export function watchBoot() {
  const fail = () => splashProblem('うまく ひらけませんでした。もういちど よみこんでください')
  window.addEventListener('error', () => {
    // 起動中（スプラッシュが残っている間）のエラーだけ案内にする
    if ($('splash') && !$('splash')!.classList.contains('gone')) fail()
  })
  window.addEventListener('unhandledrejection', () => {
    if ($('splash') && !$('splash')!.classList.contains('gone')) fail()
  })
  setTimeout(() => splashProblem('じかんが かかっています… もうすこし まつか、さいよみこみしてください'), 20000)
}

// ---------------- WebGL が使えない / 止まった ----------------
export function showFatal(title: string, body: string) {
  const box = $('gl-msg')
  if (!box) return
  $('gl-title')!.textContent = title
  $('gl-body')!.textContent = body
  box.hidden = false
  const b = $<HTMLButtonElement>('gl-reload')
  if (b) b.onclick = () => location.reload()
  // スプラッシュが残っていたら どける
  $('splash')?.remove()
}

export const NO_WEBGL = {
  title: 'この ブラウザでは うごきません',
  body: '3D の ひょうじ（WebGL）が つかえませんでした。ブラウザを あたらしくするか、ほかの ブラウザ（Chrome・Safari・Firefox など）で ひらいてください。',
}

/** コンテキストロスト（GPU がリセットされた）：やさしく案内して、戻ったら自動で再開する */
export function watchContextLoss(canvas: HTMLCanvasElement) {
  let timer = 0
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault() // 戻せるようにする
    showFatal('がめんが ちょっと とまりました', 'もどしています… しばらくしても もどらない時は「さいよみこみ」を おしてください。（ペットのデータは のこっています）')
    timer = window.setTimeout(() => {
      $('gl-reload')?.focus()
    }, 4000)
  })
  canvas.addEventListener('webglcontextrestored', () => {
    clearTimeout(timer)
    const box = $('gl-msg')
    if (box) box.hidden = true
  })
}

// ---------------- あたらしいバージョン ----------------
export function showUpdateBar(apply: () => void) {
  const bar = $('update-bar')
  if (!bar) return
  bar.hidden = false
  $('update-now')!.onclick = () => {
    bar.hidden = true
    apply()
  }
  $('update-later')!.onclick = () => (bar.hidden = true)
}

export function showOfflineReady() {
  const t = $('offline-toast')
  if (!t) return
  t.hidden = false
  setTimeout(() => (t.hidden = true), 4000)
}

// ---------------- 初回だけの遊び方 ----------------
const TIPS = [
  'A ボタンで えらんで、B ボタンで けってい。C は もどる。（キーボードは A・B・C のキー）',
  '「▶ 画面に入る」を おすと、がめん いっぱいで あそべるよ。（キーボードは Enter、もどるのは Esc）',
  'はこにわの ものを タップすると、くわしい じょうほうが でるよ。なにも ない所を タップすると、ながめるモードに なるよ。',
]
const TIPS_KEY = 'pulsar-hint'

export function tipsSeen(): boolean {
  try {
    return localStorage.getItem(TIPS_KEY) === '1'
  } catch {
    return false
  }
}

export function initTips() {
  const box = $('tips')
  if (!box) return { show() {}, hide() {} }
  let step = 0
  const render = () => {
    $('tips-step')!.textContent = `${step + 1}/${TIPS.length}`
    $('tips-text')!.textContent = TIPS[step]
    $('tips-next')!.textContent = step === TIPS.length - 1 ? 'はじめる' : 'つぎへ'
  }
  const hide = (never: boolean) => {
    box.hidden = true
    if (never) {
      try {
        localStorage.setItem(TIPS_KEY, '1')
      } catch {
        /* noop */
      }
    }
  }
  $('tips-next')!.addEventListener('click', () => {
    if (step >= TIPS.length - 1) return hide(true)
    step++
    render()
  })
  $('tips-never')!.addEventListener('click', () => hide(true))
  $('tips-x')!.addEventListener('click', () => hide(false))
  return {
    show() {
      step = 0
      render()
      box.hidden = false
    },
    hide: () => hide(false),
    visible: () => !box.hidden,
  }
}
