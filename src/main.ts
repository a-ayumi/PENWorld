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
import { SKINS, type SkinId } from './device'
import { Beeper, VOLUME_NAMES } from './beep'
import { exportCode, importCode, requestPersist } from './backup'

// ---------------- レンダラー ----------------
const canvas = document.getElementById('scene') as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
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
const device = buildDevice(world.texture)
scene.add(device.group)
const beeper = new Beeper()

// ---------------- ポストエフェクト ----------------
const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
const bokeh = new BokehPass(scene, camera, { focus: 9, aperture: 0.0025, maxblur: 0.012 })
composer.addPass(bokeh)
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.2, 0.4, 1.0)
composer.addPass(bloom)
const finish = new ShaderPass(FinishShader)
composer.addPass(finish)
composer.addPass(new OutputPass())

// 画質（低 = ポストエフェクト無し・解像度控えめ）
type Quality = 'high' | 'low'
let quality: Quality = matchMedia('(pointer: coarse)').matches ? 'low' : 'high'
try {
  const saved = localStorage.getItem('pulsar-quality')
  if (saved === 'high' || saved === 'low') quality = saved
} catch {
  /* noop */
}
const qualityBtn = document.getElementById('quality') as HTMLButtonElement
function applyQuality() {
  const dpr = Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1.5)
  renderer.setPixelRatio(dpr)
  composer.setPixelRatio(dpr)
  bokeh.enabled = quality === 'high'
  bloom.enabled = quality === 'high'
  qualityBtn.textContent = `画質: ${quality === 'high' ? '高' : '低'}`
  resize()
}
qualityBtn.addEventListener('click', () => {
  quality = quality === 'high' ? 'low' : 'high'
  try {
    localStorage.setItem('pulsar-quality', quality)
  } catch {
    /* noop */
  }
  applyQuality()
})

// ---------------- 時間帯 ----------------
let currentMood = ''
// ---------------- きせかえ（本体の柄・場所）----------------
const load = <T extends string>(k: string, fallback: T, valid: object): T => {
  try {
    const v = localStorage.getItem(k)
    if (v && v in valid) return v as T
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
  const dm = desk.material as THREE.MeshStandardMaterial
  dm.map = place.surface
  dm.needsUpdate = true
  ;(dust.material as THREE.ShaderMaterial).uniforms.color.value.set(place.dust)
}
function applyMood(name: keyof typeof MOODS) {
  if (name === currentMood) return
  currentMood = name
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
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyV' && !e.repeat) viewBtn.click()
})

chips(document.getElementById('chara-list')!, CHARA, () => charaStyle, (id) => {
  charaStyle = id as 'sprite' | 'model'
  save('pulsar-chara', id)
  world.setStyle(charaStyle)
})
dressBtn.addEventListener('click', () => {
  dressPanel.hidden = !dressPanel.hidden
  dressBtn.setAttribute('aria-expanded', String(!dressPanel.hidden))
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

function setMode(m: Mode) {
  mode = m
  modeT = 0
  pad.hidden = m !== 'inside'
  qualityBtn.hidden = m === 'inside'
  dressBtn.hidden = m === 'inside'
  if (m === 'inside') dressPanel.hidden = true
  document.getElementById('hint')!.hidden = m === 'inside'
}

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
  const used = world.press(key)
  // 何も選んでいない時の C = 画面に入る / 出る
  if (!used && key === 'C') {
    beeper.beep(1200, 0.05)
    if (mode === 'device') setMode('entering')
    else if (mode === 'inside') setMode('leaving')
  }
}
document.querySelectorAll<HTMLButtonElement>('#pad [data-key]').forEach((b) =>
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    press(b.dataset.key as 'A' | 'B' | 'C')
  }),
)
document.getElementById('pad-exit')!.addEventListener('click', () => mode === 'inside' && setMode('leaving'))

window.addEventListener('keydown', (e) => {
  if (e.repeat) return
  const map: Record<string, 'A' | 'B' | 'C'> = { KeyA: 'A', KeyB: 'B', KeyC: 'C', KeyZ: 'A', KeyX: 'B', Digit1: 'A', Digit2: 'B', Digit3: 'C' }
  const k = map[e.code]
  if (k) press(k)
  if (e.code === 'Escape' && mode === 'inside') setMode('leaving')
})

// クリック / タップでボタン、ドラッグで本体を傾ける
const ray = new THREE.Raycaster()
const ndc = new THREE.Vector2()
const buttonList = Object.values(device.buttons)
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
    if (moved < 12 && performance.now() - tp.t < 500) tapScreen(e)
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
  diveQuad.scale.set(a > 4 / 3 ? 4 / 3 / a : 1, a > 4 / 3 ? 1 : a / (4 / 3), 1)
}
window.addEventListener('resize', resize)
applyQuality()
// 操作ヒントは最初だけ表示
setTimeout(() => document.getElementById('hint')?.classList.add('fade'), 7000)

// ---------------- ループ ----------------
const timer = new THREE.Timer()
let elapsed = 0
let moodCheck = 0
renderer.setAnimationLoop((t) => {
  timer.update(t)
  // 初回フレームは時刻の差がマイナスになることがあるので 0〜1/20 秒に収める
  const dt = THREE.MathUtils.clamp(timer.getDelta(), 0, 1 / 20)
  elapsed += dt

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
  const sw = place ? place.sway(elapsed) : { y: 0, rx: 0, rz: 0 }
  device.group.position.y = Math.sin(elapsed * 1.1) * 0.05 + sw.y
  device.group.rotation.set(
    -0.08 + tilt.x + Math.sin(elapsed * 0.7) * 0.015 + sw.rx,
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
})

// テスト用
;(window as unknown as { __pulsar: object }).__pulsar = {
  press,
  state: () => ({ mode, quality, mood: currentMood, world: world.debug() }),
  world,
  device,
  setMood: (m: keyof typeof MOODS) => applyMood(m),
  setPlace: (id: PlaceId) => ((placeId = id), rebuildPlace()),
  setSkin: (id: SkinId) => device.setSkin(id),
}

// ---------------- PWA ----------------
if ('serviceWorker' in navigator && !import.meta.env.VITE_NO_SW) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ onRegisterError() {} }))
}
