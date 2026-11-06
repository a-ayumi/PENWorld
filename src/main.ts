import './style.css'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { World, type Sfx } from './world/World'
import { buildDevice } from './device'
import { FinishShader, MOODS, dustParticles, moodForHour, type Mood } from './scene'
import { PLACES, buildPlace, type PlaceId, type PlaceInst } from './places'
import { SHAPES, SKINS, type ShapeId, type SkinId } from './device'
import { Beeper, VOLUME_NAMES } from './beep'
import { exportCode, importCode, requestPersist } from './backup'
import { sheetFor, type SpeciesId } from './world/monsters'
import { hideSplash, initTips, NO_WEBGL, showFatal, showOfflineReady, showUpdateBar, tipsSeen, watchContextLoss } from './shell'

// ---------------- レンダラー ----------------
const canvas = document.getElementById('scene') as HTMLCanvasElement
// WebGL が使えない端末では、真っ黒にせず案内を出す
const renderer = (() => {
  try {
    return new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  } catch (e) {
    showFatal(NO_WEBGL.title, NO_WEBGL.body)
    throw e
  }
})()
watchContextLoss(canvas)
// 色が転びにくい Neutral トーンマッピング（プラスチックの色をそのまま見せる）
renderer.toneMapping = THREE.NeutralToneMapping
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60)
/** 液晶とボタンの中心あたりを見る（本体全体ではなく「遊ぶ部分」を大きく映す） */
const LOOK = new THREE.Vector3(0, 0.08, 0)
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.55

// ---------------- 背景（壁・机） ----------------
// 背景の「場所」（机・電車・通学路…）は places.ts。ここでは差し替え口だけ持つ
let place: PlaceInst | null = null

const desk = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 24),
  new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0 }),
)
desk.rotation.x = -Math.PI / 2
desk.position.y = -2.05
desk.receiveShadow = true
scene.add(desk)

// ---------------- ライト ----------------
const sun = new THREE.DirectionalLight('#fff', 3)
sun.position.set(-4, 6, 5)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.camera.left = -4
sun.shadow.camera.right = 4
sun.shadow.camera.top = 4
sun.shadow.camera.bottom = -4
sun.shadow.radius = 6
sun.shadow.bias = -0.0004
scene.add(sun)
const fill = new THREE.HemisphereLight('#cfe0ff', '#5a3a26', 0.5)
scene.add(fill)
// 後ろから縁を光らせるリムライト
const rim = new THREE.DirectionalLight('#ffe9d0', 1.4)
rim.position.set(3, 2, -4)
scene.add(rim)
// 夜に灯るデスクランプ
const lamp = new THREE.PointLight('#ffb86b', 0, 12, 1.6)
lamp.position.set(3.5, 2.5, 2.5)
scene.add(lamp)

const dust = dustParticles(140)
scene.add(dust)

// ---------------- 本体 ----------------
// キャラの見た目（2.5D ドット / 3D ポリゴン）は保存しておく
const CHARA = { sprite: { name: 'ドット（2.5D）' }, model: { name: 'ポリゴン（3D）' } }
let charaStyle: 'sprite' | 'model' = 'sprite'
try {
  if (localStorage.getItem('pulsar-chara') === 'model') charaStyle = 'model'
} catch {
  /* noop */
}
const world = new World(charaStyle)
// 本体のかたち（かわいい系・きかい系）。保存してあるものがあれば それで始める
let shapeId: ShapeId = (() => {
  try {
    const v = localStorage.getItem('pulsar-shape')
    return v && Object.prototype.hasOwnProperty.call(SHAPES, v) ? (v as ShapeId) : 'egg'
  } catch {
    return 'egg'
  }
})()
let device = buildDevice(world.texture, shapeId)
scene.add(device.group)
const beeper = new Beeper()

// ---------------- ポストエフェクト ----------------
const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
const bokeh = new BokehPass(scene, camera, { focus: 9, aperture: 0.0025, maxblur: 0.006 })
composer.addPass(bokeh)
// 光るのは本当にまぶしい所（ランプ・ハイライト）だけ。しきい値が低いと クリーム色の本体や液晶までもやがかかる
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.1, 0.3, 2.4)
composer.addPass(bloom)
const finish = new ShaderPass(FinishShader)
composer.addPass(finish)
composer.addPass(new OutputPass())

// 画質（低 = ポストエフェクト無し・解像度控えめ）。「自動」は重い時だけ自分で下げる（手動で選んだ時は勝手に変えない）
type Quality = 'high' | 'low'
type QualityPref = Quality | 'auto'
const QUALITY_PREFS: Record<QualityPref, { name: string }> = { high: { name: '高' }, low: { name: '低' }, auto: { name: '自動' } }
const coarsePointer = matchMedia('(pointer: coarse)').matches
let qualityPref: QualityPref = 'auto'
try {
  const saved = localStorage.getItem('pulsar-quality')
  if (saved === 'high' || saved === 'low' || saved === 'auto') qualityPref = saved
} catch {
  /* noop */
}
let quality: Quality = qualityPref === 'auto' ? (coarsePointer ? 'low' : 'high') : qualityPref
/** 自動で重い時に下げる、ピクセル比の係数（1 → 0.8 → 0.6） */
let autoScale = 1
const qualityBtn = document.getElementById('quality') as HTMLButtonElement
function applyQuality() {
  const dpr = Math.max(0.5, Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1.5) * (qualityPref === 'auto' ? autoScale : 1))
  renderer.setPixelRatio(dpr)
  composer.setPixelRatio(dpr)
  bokeh.enabled = quality === 'high'
  bloom.enabled = quality === 'high'
  world.setQuality(quality)
  const q = quality === 'high' ? '高' : '低'
  qualityBtn.textContent = `画質: ${qualityPref === 'auto' ? `自動(${q})` : q}`
  syncQualityChips()
  resize()
}
function setQualityPref(p: QualityPref) {
  qualityPref = p
  try {
    localStorage.setItem('pulsar-quality', p)
  } catch {
    /* noop */
  }
  autoScale = 1
  quality = p === 'auto' ? (coarsePointer ? 'low' : 'high') : p
  fpsWatch.reset(6)
  applyQuality()
}
qualityBtn.addEventListener('click', () => {
  const order: QualityPref[] = ['high', 'low', 'auto']
  setQualityPref(order[(order.indexOf(qualityPref) + 1) % order.length])
})
/** 自動画質：2 秒ごとの平均 FPS が低い状態が続いたら 1 段下げる（高 → 低 → ピクセル比を小さく）。自動テスト中（webdriver）は ?autoq=1 を付けた時だけ */
const autoQualityOn = !navigator.webdriver || new URLSearchParams(location.search).has('autoq')
const fpsWatch = {
  warm: 6,
  acc: 0,
  n: 0,
  bad: 0,
  reset(warm = 3) {
    this.warm = warm
    this.acc = this.n = this.bad = 0
  },
  tick(raw: number) {
    if (qualityPref !== 'auto' || !autoQualityOn) return
    if (raw > 0.5) return this.reset(1) // 裏に回った直後などの長い間は数えない
    if (this.warm > 0) {
      this.warm -= raw
      return
    }
    this.acc += raw
    this.n++
    if (this.acc < 2) return
    const fps = this.n / this.acc
    this.acc = this.n = 0
    if (fps >= 24) {
      this.bad = Math.max(0, this.bad - 1)
      return
    }
    if (++this.bad < 2) return
    this.reset(3)
    if (quality === 'high') quality = 'low'
    else if (autoScale > 0.61) autoScale = Math.max(0.6, autoScale - 0.2)
    else return
    applyQuality()
  },
}

// ---------------- せってい（文字の大きさ・うごき・画質）----------------
type TextSize = 'normal' | 'large'
const TEXT_SIZES: Record<TextSize, { name: string }> = { normal: { name: 'ふつう' }, large: { name: '大きい' } }
const MOTIONS = { normal: { name: 'ふつう' }, reduce: { name: 'へらす' } }
let textSize: TextSize = 'normal'
let motion: 'normal' | 'reduce' = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : 'normal'
let motionSaved = false
try {
  if (localStorage.getItem('pulsar-text') === 'large') textSize = 'large'
  const m = localStorage.getItem('pulsar-motion')
  if (m === 'normal' || m === 'reduce') {
    motion = m
    motionSaved = true
  }
} catch {
  /* noop */
}
let motionK = 1
function applyText() {
  document.documentElement.dataset.text = textSize
}
function applyMotion() {
  motionK = motion === 'reduce' ? 0.3 : 1
  document.documentElement.dataset.motion = motion
  world.reducedMotion = motion === 'reduce'
}
function syncChipGroup(el: HTMLElement, current: string) {
  el.querySelectorAll<HTMLElement>('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.id === current)))
}
function syncQualityChips() {
  const el = document.getElementById('set-quality')
  if (el) syncChipGroup(el, qualityPref)
}

// ---------------- 時間帯 ----------------
let currentMood = ''
// ---------------- きせかえ（本体の柄・場所）----------------
const load = <T extends string>(k: string, fallback: T, valid: object): T => {
  try {
    const v = localStorage.getItem(k)
    if (v && Object.prototype.hasOwnProperty.call(valid, v)) return v as T
  } catch {
    /* noop */
  }
  return fallback
}
const save = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* noop */
  }
}
let placeId: PlaceId = load('pulsar-place', 'desk', PLACES)
let skinId: SkinId = load('pulsar-skin', 'teal', SKINS)
function rebuildPlace() {
  if (!currentMood) return
  if (place) {
    scene.remove(place.group)
    place.dispose()
  }
  place = buildPlace(placeId, currentMood as keyof typeof MOODS)
  scene.add(place.group)
  // 手に持って（すわって）遊ぶ場所：机や床の面は置かず、ひざ・つくえ・足もとの景色だけを見せる。机の上だけは立てかけ
  desk.visible = !place.held
  const dm = desk.material as THREE.MeshStandardMaterial
  dm.map = place.surface
  dm.needsUpdate = true
  ;(dust.material as THREE.ShaderMaterial).uniforms.color.value.set(place.dust)
}
function applyMood(name: keyof typeof MOODS) {
  if (name === currentMood) return
  currentMood = name
  world.setDayPart(name)
  const m: Mood = MOODS[name]
  sun.color.set(m.sun)
  sun.intensity = m.sunI
  fill.color.set(m.fill)
  fill.intensity = m.fillI
  lamp.intensity = m.lamp * 5
  scene.environmentIntensity = m.env
  rim.intensity = m.lamp > 1 ? 0.6 : 1.4
  renderer.toneMappingExposure = m.exposure
  ;(dust.material as THREE.ShaderMaterial).uniforms.strength.value = m.lamp > 1 ? 0.25 : 0.55
  rebuildPlace()
}
const moodOverride = new URLSearchParams(location.search).get('mood') as keyof typeof MOODS | null
applyMood(moodOverride && MOODS[moodOverride] ? moodOverride : moodForHour(new Date().getHours()))
device.setSkin(skinId)

// きせかえパネル
const dressBtn = document.getElementById('dress') as HTMLButtonElement
const dressPanel = document.getElementById('dress-panel') as HTMLElement
function chips(el: HTMLElement, items: Record<string, { name: string }>, current: () => string, pick: (id: string) => void) {
  el.innerHTML = ''
  for (const [id, it] of Object.entries(items)) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'chip'
    b.dataset.id = id
    b.textContent = it.name
    b.setAttribute('aria-pressed', String(current() === id))
    b.addEventListener('click', () => {
      pick(id)
      el.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b)))
    })
    el.appendChild(b)
  }
}
chips(document.getElementById('skin-list')!, SKINS, () => skinId, (id) => {
  skinId = id as SkinId
  save('pulsar-skin', id)
  device.setSkin(skinId)
})
/** 本体のかたちを作り直す（古いモデルは捨てて、いまの柄をつけ直す） */
function setShape(id: ShapeId) {
  scene.remove(device.group)
  device.group.traverse((o) => {
    const m = o as THREE.Mesh
    m.geometry?.dispose()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
    else mat?.dispose?.()
  })
  device = buildDevice(world.texture, id)
  device.setSkin(skinId)
  scene.add(device.group)
  buttonList = Object.values(device.buttons)
}
const SHAPE_CHIPS = Object.fromEntries(Object.entries(SHAPES).map(([k, v]) => [k, { name: `${v.name}（${v.kind}）` }]))
chips(document.getElementById('shape-list')!, SHAPE_CHIPS, () => shapeId, (id) => {
  shapeId = id as ShapeId
  save('pulsar-shape', id)
  setShape(shapeId)
})
chips(document.getElementById('place-list')!, PLACES, () => placeId, (id) => {
  placeId = id as PlaceId
  save('pulsar-place', id)
  rebuildPlace()
})
// ---------------- 視点・音量 ----------------
const VIEWS = { top: 'みおろし', behind: 'うしろ', eye: 'めせん' } as const
type ViewId = keyof typeof VIEWS
const viewBtn = document.getElementById('view-btn') as HTMLButtonElement
const volBtn = document.getElementById('vol-btn') as HTMLButtonElement
let viewId: ViewId = load('pulsar-view', 'top', VIEWS)
const showView = () => (viewBtn.textContent = `視点: ${VIEWS[viewId]}`)
world.setView(viewId)
showView()
viewBtn.addEventListener('click', () => {
  const order = Object.keys(VIEWS) as ViewId[]
  viewId = order[(order.indexOf(viewId) + 1) % order.length]
  save('pulsar-view', viewId)
  world.setView(viewId)
  showView()
  beeper.unlock()
  beeper.beep(2200, 0.04)
})
try {
  const v = Number(localStorage.getItem('pulsar-vol'))
  if (localStorage.getItem('pulsar-vol') !== null && v >= 0 && v < VOLUME_NAMES.length) beeper.setLevel(v)
} catch {
  /* noop */
}
const showVol = () => {
  volBtn.textContent = `音: ${VOLUME_NAMES[beeper.level]}`
  volBtn.setAttribute('aria-label', `音量 ${VOLUME_NAMES[beeper.level]}（押すと切り替え）`)
}
showVol()
volBtn.addEventListener('click', () => {
  beeper.unlock()
  beeper.setLevel((beeper.level + 1) % VOLUME_NAMES.length)
  save('pulsar-vol', String(beeper.level))
  showVol()
  beeper.beep(2600, 0.06)
})
/** 入力欄に文字を打っている時は、ゲームのキー（A・B・C・V など）に反応しない */
const typing = (e: Event) => e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyV' && !e.repeat && !typing(e)) viewBtn.click()
})

chips(document.getElementById('chara-list')!, CHARA, () => charaStyle, (id) => {
  charaStyle = id as 'sprite' | 'model'
  save('pulsar-chara', id)
  world.setStyle(charaStyle)
})
chips(document.getElementById('set-text')!, TEXT_SIZES, () => textSize, (id) => {
  textSize = id as TextSize
  save('pulsar-text', id)
  applyText()
})
chips(document.getElementById('set-motion')!, MOTIONS, () => motion, (id) => {
  motion = id as 'normal' | 'reduce'
  motionSaved = true
  save('pulsar-motion', id)
  applyMotion()
})
chips(document.getElementById('set-quality')!, QUALITY_PREFS, () => qualityPref, (id) => setQualityPref(id as QualityPref))
applyText()
applyMotion()
// OS の「視覚効果を減らす」を後から変えた時（自分で選んでいなければ）についていく
matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) => {
  if (motionSaved) return
  motion = e.matches ? 'reduce' : 'normal'
  applyMotion()
  syncChipGroup(document.getElementById('set-motion')!, motion)
})
const tips = initTips()
document.getElementById('tips-open')?.addEventListener('click', () => {
  dressPanel.hidden = true
  dressBtn.setAttribute('aria-expanded', 'false')
  tips.show()
})
dressBtn.addEventListener('click', () => {
  dressPanel.hidden = !dressPanel.hidden
  dressBtn.setAttribute('aria-expanded', String(!dressPanel.hidden))
  if (!dressPanel.hidden) dexPanel.hidden = true
})
// ---------------- データ（書き出し・読み込み・やり直し）----------------
void requestPersist()
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const dataBox = $<HTMLDivElement>('data-box')
const dataCode = $<HTMLTextAreaElement>('data-code')
const dataMsg = $<HTMLParagraphElement>('data-msg')
const showData = (mode: 'export' | 'import') => {
  dataBox.hidden = false
  $('data-label').textContent = mode === 'export' ? 'データのコード（ほかの端末で「読み込む」に貼りつけます）' : 'コードを貼りつけるか、ファイルをえらんでください'
  $('data-copy').hidden = $('data-download').hidden = mode !== 'export'
  $('data-apply').hidden = $('data-file-label').hidden = mode !== 'import'
  dataCode.readOnly = mode === 'export'
}
$('data-export').addEventListener('click', () => {
  world.save()
  dataCode.value = exportCode()
  showData('export')
  dataMsg.textContent = 'いまのデータを書き出しました'
})
$('data-import').addEventListener('click', () => {
  dataCode.value = ''
  showData('import')
  dataMsg.textContent = ''
  dataCode.focus()
})
$('data-copy').addEventListener('click', () => {
  navigator.clipboard
    .writeText(dataCode.value)
    .then(() => (dataMsg.textContent = 'コピーしました'))
    .catch(() => {
      dataCode.select()
      dataMsg.textContent = 'コードを選択しました。長押しでコピーしてください'
    })
})
$('data-download').addEventListener('click', () => {
  const blob = new Blob([dataCode.value], { type: 'text/plain' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  const d = new Date()
  a.download = `pulsar-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.txt`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  dataMsg.textContent = 'ファイルに保存しました'
})
const applyImport = (text: string) => {
  const r = importCode(text)
  if (!r.ok) {
    dataMsg.textContent = `読み込めませんでした：${r.reason}`
    return
  }
  world.saveLocked = true
  dataMsg.textContent = '読み込みました。はじめから開きなおします…'
  setTimeout(() => location.reload(), 700)
}
$('data-apply').addEventListener('click', () => applyImport(dataCode.value))
$<HTMLInputElement>('data-file').addEventListener('change', async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) applyImport(await f.text())
})
// やり直しは 2 回押しで確定（うっかり防止）
let resetArmed = 0
const resetBtn = $<HTMLButtonElement>('data-reset')
resetBtn.addEventListener('click', () => {
  if (Date.now() - resetArmed < 4000) {
    world.saveLocked = true
    try {
      localStorage.removeItem('pulsar-save-v1')
    } catch {
      /* noop */
    }
    dataMsg.textContent = 'データを消しました。はじめから開きなおします…'
    setTimeout(() => location.reload(), 700)
    return
  }
  resetArmed = Date.now()
  resetBtn.dataset.armed = 'true'
  resetBtn.textContent = 'もう一度押すと消えます'
  dataMsg.textContent = '先に「書き出す」でバックアップしておくと安心です'
  setTimeout(() => {
    resetBtn.dataset.armed = 'false'
    resetBtn.textContent = '最初からやり直す'
  }, 4000)
})

// ---------------- ずかん ----------------
const dexBtn = document.getElementById('dex-btn') as HTMLButtonElement
const dexPanel = document.getElementById('dex-panel') as HTMLElement
function renderDex() {
  const info = world.dexInfo()
  document.getElementById('dex-summary')!.textContent = `なかま ${info.owned}/${info.total}　みつけた ${info.seen}/${info.all}　いまは だい${info.gen}せだい（じゅみょう ${Math.round((1 - info.life) * 100)}%）`
  const grid = document.getElementById('dex-grid')!
  grid.replaceChildren()
  let fam = ''
  for (const e of world.dexList()) {
    if (e.family !== fam) {
      fam = e.family
      const h = document.createElement('h3')
      h.className = 'dex-fam'
      h.textContent = fam
      grid.appendChild(h)
    }
    const cell = document.createElement('div')
    cell.className = 'dex-cell' + (e.state === 2 ? ' own' : e.state === 1 ? ' seen' : '')
    const cv = document.createElement('canvas')
    cv.width = 56
    cv.height = 52
    const g = cv.getContext('2d')
    if (g && e.state > 0) {
      const sh = sheetFor(e.id as SpeciesId)
      g.imageSmoothingEnabled = false
      g.drawImage(sh.texture.image as CanvasImageSource, 0, 0, sh.cellW, sh.cellH, 0, 0, 56, 52)
    } else if (g) {
      g.fillStyle = 'rgba(243,234,216,.35)'
      g.font = '28px sans-serif'
      g.textAlign = 'center'
      g.fillText('?', 28, 38)
    }
    const name = document.createElement('span')
    name.textContent = e.state > 0 ? e.name : '？？？'
    const sub = document.createElement('small')
    sub.textContent = e.state === 2 ? `なかま ・ ${e.tier ? 'ランク' + e.tier : ''}` : e.state === 1 ? 'みつけた' : ''
    cell.append(cv, name, sub)
    grid.appendChild(cell)
  }
  document.getElementById('dex-lineage')!.textContent = info.lineage.length ? `${info.lineage.join(' → ')} → ${info.pet}（いま）` : `${info.pet}（はじめの だい）`
}
dexBtn.addEventListener('click', () => {
  dexPanel.hidden = !dexPanel.hidden
  dexBtn.setAttribute('aria-expanded', String(!dexPanel.hidden))
  if (!dexPanel.hidden) {
    dressPanel.hidden = true
    renderDex()
  }
})
document.getElementById('dex-close')!.addEventListener('click', () => {
  dexPanel.hidden = true
  dexBtn.setAttribute('aria-expanded', 'false')
})

document.getElementById('dress-close')!.addEventListener('click', () => {
  dressPanel.hidden = true
  dressBtn.setAttribute('aria-expanded', 'false')
})

// ---------------- 箱庭の効果音 ----------------
const SFX: Record<Sfx, () => void> = {
  select: () => beeper.beep(2200, 0.04),
  ok: () => beeper.beep(2600, 0.05),
  cancel: () => beeper.beep(1500, 0.05),
  hit: () => beeper.beep(900, 0.04),
  crit: () => (beeper.beep(1800, 0.04), beeper.beep(700, 0.08, 0.05)),
  win: () => [1568, 1976, 2349, 3136].forEach((f, i) => beeper.beep(f, 0.08, i * 0.09)),
  lose: () => [1200, 900, 700].forEach((f, i) => beeper.beep(f, 0.12, i * 0.14)),
  eat: () => (beeper.beep(2000, 0.04), beeper.beep(2400, 0.04, 0.12)),
  warp: () => [800, 1200, 1800, 2700, 4000].forEach((f, i) => beeper.beep(f, 0.05, i * 0.06)),
  evolve: () => [1047, 1319, 1568, 2093, 2637, 3136].forEach((f, i) => beeper.beep(f, 0.09, i * 0.1)),
  train: () => beeper.beep(1700, 0.03),
  coin: () => (beeper.beep(2637, 0.03), beeper.beep(3520, 0.05, 0.04)),
  friend: () => [1319, 1568, 2093].forEach((f, i) => beeper.beep(f, 0.07, i * 0.08)),
  egg: () => [1568, 1319, 1568, 2093].forEach((f, i) => beeper.beep(f, 0.08, i * 0.1)),
  skill: () => [1200, 1800, 2400, 3200].forEach((f, i) => beeper.beep(f, 0.04, i * 0.035)),
  boom: () => (beeper.beep(400, 0.06), beeper.beep(260, 0.1, 0.05), beeper.beep(1900, 0.04, 0.1)),
}
world.onSfx = (k) => SFX[k]()

// ---------------- 画面に入る（全画面モード） ----------------
type Mode = 'device' | 'entering' | 'inside' | 'leaving'
let mode: Mode = 'device'
let modeT = 0
const diveScene = new THREE.Scene()
const diveCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
const diveQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: world.texture, toneMapped: false }))
diveScene.add(diveQuad)
diveScene.background = new THREE.Color('#05060f')
const pad = document.getElementById('pad')!
const enterBtn = document.getElementById('enter-btn') as HTMLButtonElement

function setMode(m: Mode) {
  mode = m
  modeT = 0
  pad.hidden = m !== 'inside'
  qualityBtn.hidden = m === 'inside'
  dressBtn.hidden = m === 'inside'
  dexBtn.hidden = m === 'inside'
  enterBtn.hidden = m !== 'device'
  if (m === 'inside') dressPanel.hidden = dexPanel.hidden = true
  document.getElementById('hint')!.hidden = m === 'inside'
}

/** Esc：開いているパネルやヒントを閉じて、押したボタンにフォーカスを戻す */
function closePanels() {
  const returnTo = !dressPanel.hidden ? dressBtn : !dexPanel.hidden ? dexBtn : null
  if (!dressPanel.hidden || !dexPanel.hidden) {
    dressPanel.hidden = dexPanel.hidden = true
    dressBtn.setAttribute('aria-expanded', 'false')
    dexBtn.setAttribute('aria-expanded', 'false')
    returnTo?.focus()
  }
  tips.hide()
}
let lastInput = performance.now()
for (const ev of ['pointerdown', 'wheel', 'touchstart'] as const) window.addEventListener(ev, () => (lastInput = performance.now()), { passive: true })

// ---------------- ボタン ----------------
const tilt = { x: 0, y: 0, vx: 0, vy: 0 }

function press(key: 'A' | 'B' | 'C') {
  beeper.unlock()
  if (mode === 'device') {
    const b = device.buttons[key]
    b.userData.press = 1
    // 押した側にわずかに傾く
    tilt.vy += (key === 'A' ? -1 : key === 'C' ? 1 : 0) * 0.6
    tilt.vx += 0.8
  }
  // C は「もどる」専用（画面に入る・出るは、外の「画面に入る」ボタン / Enter / Esc / 「本体にもどる」）
  world.press(key)
}
document.querySelectorAll<HTMLButtonElement>('#pad [data-key]').forEach((b) =>
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    press(b.dataset.key as 'A' | 'B' | 'C')
  }),
)
document.getElementById('pad-exit')!.addEventListener('click', () => mode === 'inside' && setMode('leaving'))
enterBtn.addEventListener('click', () => {
  beeper.unlock()
  beeper.beep(1200, 0.05)
  if (mode === 'device') setMode('entering')
})

window.addEventListener('keydown', (e) => {
  lastInput = performance.now()
  if (e.repeat || typing(e)) return
  const map: Record<string, 'A' | 'B' | 'C'> = { KeyA: 'A', KeyB: 'B', KeyC: 'C', KeyZ: 'A', KeyX: 'B', Digit1: 'A', Digit2: 'B', Digit3: 'C' }
  const k = map[e.code]
  if (k) press(k)
  if (e.code === 'Escape' && mode === 'inside') setMode('leaving')
  if (e.code === 'Escape' && mode === 'device') closePanels()
  if ((e.code === 'Enter' || e.code === 'NumpadEnter') && mode === 'device' && !e.repeat && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLButtonElement)) {
    beeper.beep(1200, 0.05)
    setMode('entering')
  }
})

// クリック / タップでボタン、ドラッグで本体を傾ける
const ray = new THREE.Raycaster()
const ndc = new THREE.Vector2()
let buttonList = Object.values(device.buttons)
function hitButton(e: PointerEvent): 'A' | 'B' | 'C' | null {
  const r = canvas.getBoundingClientRect()
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  ray.setFromCamera(ndc, camera)
  const hit = ray.intersectObjects(buttonList, true)[0]
  if (!hit) return null
  let o: THREE.Object3D | null = hit.object
  while (o && !o.userData.key) o = o.parent
  return (o?.userData.key as 'A' | 'B' | 'C') ?? null
}
let drag: { id: number; x: number; y: number } | null = null
/** 液晶（本体の画面 / 全画面）へのタップを箱庭の HUD に伝える */
function tapScreen(e: PointerEvent): boolean {
  const r = canvas.getBoundingClientRect()
  const nx = ((e.clientX - r.left) / r.width) * 2 - 1
  const ny = -((e.clientY - r.top) / r.height) * 2 + 1
  let uv: { x: number; y: number } | null = null
  if (mode === 'inside') {
    const u = (nx / diveQuad.scale.x + 1) / 2
    const v = (ny / diveQuad.scale.y + 1) / 2
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) uv = { x: u, y: v }
  } else if (mode === 'device') {
    ndc.set(nx, ny)
    ray.setFromCamera(ndc, camera)
    const hit = ray.intersectObject(device.screen)[0]
    if (hit?.uv) uv = hit.uv
  }
  if (!uv) return false
  beeper.unlock()
  return world.tap(uv.x, uv.y)
}

/** 何もない所をタップ：文字・アイコン・設定ボタンをまとめて隠す / 出す（眺めるモード） */
function toggleChrome() {
  world.cleanView = !world.cleanView
  document.body.classList.toggle('clean', world.cleanView)
  if (world.cleanView) dressPanel.hidden = dexPanel.hidden = true
}

// ---------------- 指の操作 ----------------
// 1 本指：タップ = 液晶のアイコン / ドラッグ = 本体を傾ける（本体ビュー）
// 2 本指：ピンチ = 箱庭のカメラを寄せる・引く、ドラッグ = 前後左右に動かす
const touches = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>()
let gesture: { dist: number; mx: number; my: number } | null = null
let gestured = false
const pinchInfo = () => {
  const [a, b] = [...touches.values()]
  return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
}
canvas.addEventListener('pointerdown', (e) => {
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() })
  canvas.setPointerCapture(e.pointerId)
  if (touches.size === 2) {
    // 2 本目の指：本体の傾けをやめて、カメラ操作にする
    gesture = pinchInfo()
    gestured = true
    drag = null
    return
  }
  if (touches.size > 2) return
  gestured = false
  if (mode === 'device') {
    const k = hitButton(e)
    if (k) {
      press(k)
      touches.delete(e.pointerId)
      return
    }
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
  }
})
canvas.addEventListener('pointermove', (e) => {
  const tp = touches.get(e.pointerId)
  if (tp) {
    tp.x = e.clientX
    tp.y = e.clientY
  }
  if (gesture && touches.size === 2) {
    const g = pinchInfo()
    const h = window.innerHeight
    if (g.dist > 0 && gesture.dist > 0) world.zoomBy(gesture.dist / g.dist)
    world.panBy((g.mx - gesture.mx) / h, (g.my - gesture.my) / h)
    gesture = g
    return
  }
  if (drag && e.pointerId === drag.id) {
    tilt.vy += (e.clientX - drag.x) * 0.012
    tilt.vx += (e.clientY - drag.y) * 0.012
    drag.x = e.clientX
    drag.y = e.clientY
  } else if (e.pointerType === 'mouse' && !touches.size) canvas.classList.toggle('pointer', !!hitButton(e))
})
const endPointer = (e: PointerEvent) => {
  const tp = touches.get(e.pointerId)
  touches.delete(e.pointerId)
  if (touches.size < 2) gesture = null
  if (drag && e.pointerId === drag.id) drag = null
  // 指をほとんど動かさずに離した = タップ（ピンチの直後は無視）
  if (e.type === 'pointerup' && tp && !gestured && touches.size === 0) {
    const moved = Math.hypot(e.clientX - tp.sx, e.clientY - tp.sy)
    if (moved < 12 && performance.now() - tp.t < 500 && !tapScreen(e)) toggleChrome()
  }
  if (touches.size === 0) gestured = false
}
canvas.addEventListener('pointerup', endPointer)
canvas.addEventListener('pointercancel', endPointer)
// パソコン：ホイールで寄る・引く、矢印キーで前後左右
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault()
    world.zoomBy(Math.exp(e.deltaY * 0.0012))
  },
  { passive: false },
)
const panKeys: Record<string, [number, number]> = { ArrowLeft: [0.04, 0], ArrowRight: [-0.04, 0], ArrowUp: [0, 0.04], ArrowDown: [0, -0.04] }
window.addEventListener('keydown', (e) => {
  if (typing(e)) return
  const k = panKeys[e.code]
  if (k) {
    e.preventDefault()
    world.panBy(k[0], k[1])
  }
  if (e.code === 'Equal' || e.code === 'NumpadAdd') world.zoomBy(0.88)
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') world.zoomBy(1.14)
})

// ---------------- サイズ ----------------
const baseCam = new THREE.Vector3()
function resize() {
  const w = window.innerWidth
  const h = window.innerHeight
  renderer.setSize(w, h, false)
  composer.setSize(w, h)
  camera.aspect = w / h
  // 液晶（幅 1.48）+ ボタンが画面いっぱいに収まる距離に。本体の縁や背景ははみ出してよい
  const halfV = THREE.MathUtils.degToRad(camera.fov / 2)
  // 少し引いて、本体の形と背景の場所も見えるように
  const needH = 4.3 / 2 / Math.tan(halfV)
  const needW = 2.8 / 2 / (Math.tan(halfV) * camera.aspect)
  const dist = Math.max(needH, needW)
  camera.position.set(0, LOOK.y + 0.12 + dist * 0.03, dist + 0.5)
  camera.lookAt(LOOK)
  camera.updateProjectionMatrix()
  // ピントは本体の位置に合わせる（カメラ距離 = dist + 0.5）
  ;(bokeh.uniforms as Record<string, THREE.IUniform>).focus.value = dist + 0.5
  baseCam.copy(camera.position)
  // 全画面モード：4:3 を画面に収める（ドットは整数倍に近いサイズで）
  const a = w / h
  // 全画面：正方形を画面に収める
  diveQuad.scale.set(a > 1 ? 1 / a : 1, a > 1 ? 1 : a, 1)
}
window.addEventListener('resize', resize)
applyQuality()
// 操作ヒントは最初だけ表示
setTimeout(() => document.getElementById('hint')?.classList.add('fade'), 7000)

// ---------------- ループ ----------------
const timer = new THREE.Timer()
let elapsed = 0
let moodCheck = 0
let frames = 0
let idleFlip = false
let catchUp = 0
let hiddenAt = 0
// 裏に回ったら描画もシミュレーションも止める。戻ったら、止まっていた分のうち 1 秒ぶんまでを進める
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = performance.now()
    world.save()
    return
  }
  catchUp = hiddenAt ? Math.min(1, (performance.now() - hiddenAt) / 1000) : 0
  hiddenAt = 0
  fpsWatch.reset(2)
})
renderer.setAnimationLoop((t) => {
  if (document.hidden) return
  // 長いあいだ操作が無い時は 30fps に落として電池を節約（触るとすぐ戻る）
  const idle = performance.now() - lastInput > 60000
  if (idle && (idleFlip = !idleFlip)) return
  timer.update(t)
  const rawDt = timer.getDelta()
  if (!idle) fpsWatch.tick(rawDt)
  // 初回フレームは時刻の差がマイナスになることがあるので 0〜1/20 秒に収める
  const dt = THREE.MathUtils.clamp(rawDt, 0, 1 / 20)
  elapsed += dt
  while (catchUp > 0.001) {
    const step = Math.min(1 / 15, catchUp)
    world.update(step)
    catchUp -= step
  }
  catchUp = 0

  // 本体のふわふわ + ばねで戻る傾き
  const k = 26
  const damp = 7
  tilt.vx += (-tilt.x * k - tilt.vx * damp) * dt
  tilt.vy += (-tilt.y * k - tilt.vy * damp) * dt
  tilt.x += tilt.vx * dt
  tilt.y += tilt.vy * dt
  tilt.x = THREE.MathUtils.clamp(tilt.x, -0.6, 0.6)
  tilt.y = THREE.MathUtils.clamp(tilt.y, -0.8, 0.8)
  // 場所ごとの揺れ（電車・歩き）+ ふわふわ
  place?.update(elapsed, dt)
  const sw0 = place ? place.sway(elapsed) : { y: 0, rx: 0, rz: 0 }
  // 「動きをへらす」では、電車や歩きの揺れ・ふわふわを弱める
  const sw = { y: sw0.y * motionK, rx: sw0.rx * motionK, rz: sw0.rz * motionK }
  // 手に持っている時は、少し手前に傾けて、手のふるえのような小さな揺れを足す
  const heldNow = !!place?.held
  device.group.position.y = Math.sin(elapsed * 1.1) * 0.05 * motionK + sw.y + (heldNow ? 0.22 + Math.sin(elapsed * 2.3) * 0.012 : 0)
  device.group.rotation.set(
    (heldNow ? -0.2 : -0.08) + tilt.x + Math.sin(elapsed * 0.7) * 0.015 * motionK + sw.rx,
    tilt.y + Math.sin(elapsed * 0.5) * 0.06,
    Math.sin(elapsed * 0.6) * 0.01 + sw.rz,
  )

  // ボタンの押し込み
  for (const b of buttonList) {
    const p = b.userData.press as number
    b.position.z = (b.userData.restZ as number) - p * 0.045
    b.userData.press = Math.max(0, p - dt * 7)
  }

  // ランプの点滅（呼び出し中のイメージ）
  const lampMesh = device.group.getObjectByName('lamp') as THREE.Mesh
  ;(lampMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2 + Math.max(0, Math.sin(elapsed * 3)) * 2

  world.update(dt)
  world.render(renderer)
  ;(dust.material as THREE.ShaderMaterial).uniforms.time.value = elapsed
  finish.uniforms.time.value = elapsed

  moodCheck += dt
  if (moodCheck > 30 && !moodOverride) {
    moodCheck = 0
    applyMood(moodForHour(new Date().getHours()))
  }

  // 画面に入る / 出る：カメラを液晶へ寄せてから全画面に切り替える
  modeT += dt
  const screenPos = device.screen.getWorldPosition(new THREE.Vector3())
  const near = screenPos.clone().add(new THREE.Vector3(0, 0, 1.55))
  const ease = (t: number) => t * t * (3 - 2 * t)
  if (mode === 'entering' || mode === 'leaving') {
    const k = Math.min(1, modeT / 0.9)
    const e = ease(mode === 'entering' ? k : 1 - k)
    camera.position.lerpVectors(baseCam, near, e)
    camera.lookAt(LOOK.clone().lerp(screenPos, e))
    ;(bokeh.uniforms as Record<string, THREE.IUniform>).focus.value = camera.position.distanceTo(screenPos)
    if (k >= 1) {
      if (mode === 'entering') setMode('inside')
      else {
        setMode('device')
        resize()
      }
    }
  }
  if (mode === 'inside') renderer.render(diveScene, diveCam)
  // 低画質ではボケ/ブルームが無効になり、色調整とビネットだけ残る
  else composer.render()

  // 最初の数フレームを描いたら、スプラッシュをどける。初めての人にはあそびかたを出す
  if (++frames === 3) {
    hideSplash()
    if (!tipsSeen()) setTimeout(() => mode === 'device' && !document.hidden && tips.show(), 1500)
  }
})

// テスト用
;(window as unknown as { __pulsar: object }).__pulsar = {
  press,
  state: () => ({ mode, quality, mood: currentMood, world: world.debug() }),
  world,
  get device() {
    return device
  },
  renderer,
  composer,
  setShape: (id: ShapeId) => ((shapeId = id), setShape(id)),
  setMood: (m: keyof typeof MOODS) => applyMood(m),
  setPlace: (id: PlaceId) => ((placeId = id), rebuildPlace()),
  setSkin: (id: SkinId) => device.setSkin(id),
  setQualityPref,
  fpsWatch,
  hideTips: () => tips.hide(),
}

// ---------------- PWA ----------------
if ('serviceWorker' in navigator && !import.meta.env.VITE_NO_SW) {
  void import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      // 新しいバージョンが用意できた：押してもらってから入れ替える（あそんでいる最中に勝手に再読み込みしない）
      onNeedRefresh: () => showUpdateBar(applyUpdate),
      onOfflineReady: () => showOfflineReady(),
      // 開きっぱなしでも、30 分ごと・戻ってきた時に新しいバージョンを探す
      onRegisteredSW(_url, reg) {
        if (!reg) return
        const check = () => navigator.onLine && void reg.update().catch(() => {})
        setInterval(check, 30 * 60 * 1000)
        document.addEventListener('visibilitychange', () => !document.hidden && check())
      },
      onRegisterError() {},
    })
    function applyUpdate() {
      world.save()
      void updateSW(true)
    }
    ;(window as unknown as { __pulsar: Record<string, unknown> }).__pulsar.showUpdateBar = () => showUpdateBar(applyUpdate)
  })
}
