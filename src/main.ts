import './style.css'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { LCD } from './lcd'
import { Pet } from './pet'
import { buildDevice } from './device'
import { FinishShader, MOODS, dustParticles, moodForHour, paintWall, woodTexture, type Mood } from './scene'
import { Beeper } from './beep'

// ---------------- レンダラー ----------------
const canvas = document.getElementById('scene') as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
// 色が転びにくい Neutral トーンマッピング（プラスチックの色をそのまま見せる）
renderer.toneMapping = THREE.NeutralToneMapping
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60)
const LOOK = new THREE.Vector3(0, 0.15, 0)
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.55

// ---------------- 背景（壁・机） ----------------
const wallCanvas = document.createElement('canvas')
wallCanvas.width = 1600
wallCanvas.height = 900
const wallTex = new THREE.CanvasTexture(wallCanvas)
wallTex.colorSpace = THREE.SRGBColorSpace
const wall = new THREE.Mesh(new THREE.PlaneGeometry(32, 18), new THREE.MeshBasicMaterial({ map: wallTex }))
wall.position.set(0, 4, -9)
scene.add(wall)

const desk = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 24),
  new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.55, metalness: 0 }),
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
const lcd = new LCD()
const pet = new Pet()
const device = buildDevice(lcd.texture)
scene.add(device.group)
const beeper = new Beeper()

// ---------------- ポストエフェクト ----------------
const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
const bokeh = new BokehPass(scene, camera, { focus: 9, aperture: 0.0025, maxblur: 0.012 })
composer.addPass(bokeh)
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.25, 0.4, 0.97)
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
  paintWall(wallCanvas, m)
  wallTex.needsUpdate = true
}
const moodOverride = new URLSearchParams(location.search).get('mood') as keyof typeof MOODS | null
applyMood(moodOverride && MOODS[moodOverride] ? moodOverride : moodForHour(new Date().getHours()))

// ---------------- 液晶の中身 ----------------
type View = 'pet' | 'clock'
let view: View = 'pet'
let cursor = -1
let flash = 0
let attention = 0

function drawLCD(dt: number) {
  lcd.clear()
  if (view === 'pet') {
    pet.update(dt)
    pet.draw(lcd)
  } else {
    const d = new Date()
    lcd.drawTime(d.getHours(), d.getMinutes(), d.getSeconds() % 2 === 0)
  }
  flash = Math.max(0, flash - dt)
  attention += dt
  for (let i = 0; i < 8; i++) {
    let on = i === cursor
    if (i === cursor && flash > 0) on = Math.floor(flash * 8) % 2 === 0
    lcd.iconOn[i] = on
  }
  lcd.update(dt)
  lcd.commit()
}

// ---------------- ボタン ----------------
const tilt = { x: 0, y: 0, vx: 0, vy: 0 }

function press(key: 'A' | 'B' | 'C') {
  beeper.unlock()
  const b = device.buttons[key]
  b.userData.press = 1
  // 押した側にわずかに傾く
  tilt.vy += (key === 'A' ? -1 : key === 'C' ? 1 : 0) * 0.6
  tilt.vx += 0.8
  if (key === 'A') {
    cursor = (cursor + 1) % 8
    beeper.beep(2200, 0.05)
  } else if (key === 'B') {
    if (cursor >= 0) {
      flash = 0.8
      if (view === 'pet') pet.cheer()
      beeper.beep(2600, 0.06)
      beeper.beep(3200, 0.08, 0.08)
    } else beeper.beep(1400, 0.08)
  } else {
    if (cursor >= 0) cursor = -1
    else view = view === 'pet' ? 'clock' : 'pet'
    beeper.beep(1600, 0.05)
  }
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return
  const map: Record<string, 'A' | 'B' | 'C'> = { KeyA: 'A', KeyB: 'B', KeyC: 'C', KeyZ: 'A', KeyX: 'B', Digit1: 'A', Digit2: 'B', Digit3: 'C' }
  const k = map[e.code]
  if (k) press(k)
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
canvas.addEventListener('pointerdown', (e) => {
  const k = hitButton(e)
  if (k) {
    press(k)
    return
  }
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
  canvas.setPointerCapture(e.pointerId)
})
canvas.addEventListener('pointermove', (e) => {
  if (drag && e.pointerId === drag.id) {
    tilt.vy += (e.clientX - drag.x) * 0.012
    tilt.vx += (e.clientY - drag.y) * 0.012
    drag.x = e.clientX
    drag.y = e.clientY
  } else if (e.pointerType === 'mouse') canvas.classList.toggle('pointer', !!hitButton(e))
})
const endDrag = (e: PointerEvent) => {
  if (drag && e.pointerId === drag.id) drag = null
}
canvas.addEventListener('pointerup', endDrag)
canvas.addEventListener('pointercancel', endDrag)

// ---------------- サイズ ----------------
function resize() {
  const w = window.innerWidth
  const h = window.innerHeight
  renderer.setSize(w, h, false)
  composer.setSize(w, h)
  camera.aspect = w / h
  // 本体（約 3.9×2.9）が画面に収まる距離に
  const halfV = THREE.MathUtils.degToRad(camera.fov / 2)
  const needH = 4.6 / 2 / Math.tan(halfV)
  const needW = 3.6 / 2 / (Math.tan(halfV) * camera.aspect)
  const dist = Math.max(needH, needW)
  camera.position.set(0, 0.55 + dist * 0.06, dist)
  camera.lookAt(LOOK)
  camera.updateProjectionMatrix()
  ;(bokeh.uniforms as Record<string, THREE.IUniform>).focus.value = dist
}
window.addEventListener('resize', resize)
applyQuality()

// ---------------- ループ ----------------
const timer = new THREE.Timer()
let elapsed = 0
let moodCheck = 0
renderer.setAnimationLoop((t) => {
  timer.update(t)
  const dt = Math.min(timer.getDelta(), 1 / 20)
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
  device.group.position.y = Math.sin(elapsed * 1.1) * 0.05
  device.group.rotation.set(-0.08 + tilt.x + Math.sin(elapsed * 0.7) * 0.015, tilt.y + Math.sin(elapsed * 0.5) * 0.06, Math.sin(elapsed * 0.6) * 0.01)

  // ボタンの押し込み
  for (const b of buttonList) {
    const p = b.userData.press as number
    b.position.z = (b.userData.restZ as number) - p * 0.045
    b.userData.press = Math.max(0, p - dt * 7)
  }

  // ランプの点滅（呼び出し中のイメージ）
  const lampMesh = device.group.getObjectByName('lamp') as THREE.Mesh
  ;(lampMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2 + Math.max(0, Math.sin(attention * 3)) * 2

  drawLCD(dt)
  ;(dust.material as THREE.ShaderMaterial).uniforms.time.value = elapsed
  finish.uniforms.time.value = elapsed

  moodCheck += dt
  if (moodCheck > 30 && !moodOverride) {
    moodCheck = 0
    applyMood(moodForHour(new Date().getHours()))
  }

  // 低画質ではボケ/ブルームが無効になり、色調整とビネットだけ残る
  composer.render()
})

// テスト用
;(window as unknown as { __pulsar: object }).__pulsar = {
  press,
  state: () => ({ view, cursor, quality, mood: currentMood, draws: renderer.info.render.calls }),
  setMood: (m: keyof typeof MOODS) => applyMood(m),
}

// ---------------- PWA ----------------
if ('serviceWorker' in navigator && !import.meta.env.VITE_NO_SW) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ onRegisterError() {} }))
}
