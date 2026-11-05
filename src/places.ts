import * as THREE from 'three'

/**
 * 本体の後ろに広がる「人間側」の場所。すべて手続き生成の絵（実在の店や施設は描かない）。
 * 壁（背景の絵）+ 手前の面（本体が置かれている/かざしている面）+ 動き（流れる景色・揺れ）。
 */
export type PlaceId = 'desk' | 'train' | 'street' | 'school' | 'burger' | 'park'
export type MoodKey = 'morning' | 'day' | 'evening' | 'night'

export const PLACES: Record<PlaceId, { name: string }> = {
  desk: { name: '机の上' },
  train: { name: '電車の中' },
  street: { name: '通学路' },
  school: { name: '教室' },
  burger: { name: 'バーガーショップ' },
  park: { name: '公園' },
}

export interface PlaceInst {
  group: THREE.Group
  /** 本体の下にある面のテクスチャ */
  surface: THREE.Texture
  /** 舞っている粒の色（ほこり・花びら など） */
  dust: string
  update(t: number, dt: number): void
  /** 本体の揺れ（電車・歩き） */
  sway(t: number): { y: number; rx: number; rz: number }
  dispose(): void
  /** 手に持って（すわって）遊んでいる景色にするか。false = 机の上に立てる */
  held?: boolean
  /** 持っている手の袖の色 */
  sleeve?: string
}

const SKY: Record<MoodKey, [string, string]> = {
  morning: ['#9cc8ff', '#ffe0b8'],
  day: ['#6fb4ff', '#dff1ff'],
  evening: ['#4a3a8a', '#ff9b6a'],
  night: ['#081028', '#22305e'],
}
const W = 1600
const H = 900
/** 壁の絵で、だいたい画面に映る範囲（キャンバス座標） */
const HORIZON = 750

type G = CanvasRenderingContext2D

function canvas(w = W, h = H) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, g: c.getContext('2d')! }
}
function tex(c: HTMLCanvasElement, repeat: [number, number] = [1, 1]) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(...repeat)
  return t
}
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
}
function sky(g: G, w: number, h: number, mood: MoodKey) {
  const [top, bot] = SKY[mood]
  const grad = g.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, top)
  grad.addColorStop(1, bot)
  g.fillStyle = grad
  g.fillRect(0, 0, w, h)
  if (mood === 'night') {
    const r = rng(5)
    g.fillStyle = '#ffffff'
    for (let i = 0; i < 80; i++) g.fillRect(r() * w, r() * h * 0.6, 2, 2)
  }
}
function rr(g: G, x: number, y: number, w: number, h: number, r: number, fill: string) {
  g.fillStyle = fill
  g.beginPath()
  g.roundRect(x, y, w, h, r)
  g.fill()
}
/** 背景はピントが合っていない前提なので、少しぼかして描く（スマホの低画質でもボケて見える） */
function soften(c: HTMLCanvasElement, px: number) {
  const { c: o, g } = canvas(c.width, c.height)
  g.filter = `blur(${px}px)`
  g.drawImage(c, 0, 0)
  return o
}
const night = (m: MoodKey) => m === 'night'

/** 家・ビルの並び（横にタイルできる） */
function skyline(g: G, w: number, base: number, mood: MoodKey, seed: number, scale = 1) {
  const r = rng(seed)
  let x = 0
  while (x < w) {
    const bw = (80 + r() * 140) * scale
    const bh = (120 + r() * 260) * scale
    const cols = night(mood) ? ['#1c2240', '#232a4a', '#191e38'] : ['#c9d3e0', '#b8c4d4', '#d8dee8', '#a9b6c8']
    g.fillStyle = cols[Math.floor(r() * cols.length)]
    g.fillRect(x, base - bh, Math.min(bw, w - x), bh)
    g.fillStyle = night(mood) ? '#ffd27a' : 'rgba(255,255,255,0.55)'
    for (let wy = base - bh + 14 * scale; wy < base - 20 * scale; wy += 26 * scale)
      for (let wx = x + 10 * scale; wx < x + bw - 16 * scale; wx += 22 * scale)
        if (!night(mood) || r() < 0.5) g.fillRect(wx, wy, 10 * scale, 12 * scale)
    x += bw + 6 * scale
  }
}

// ======================================================================
function desk(mood: MoodKey): PlaceInst {
  const { c, g } = canvas()
  const wallTop = { morning: '#e9d9c3', day: '#e4e1da', evening: '#9a5a4a', night: '#1f2440' }[mood]
  const wallBot = { morning: '#bfa58a', day: '#b8ad9c', evening: '#4a2c2c', night: '#0d0f1c' }[mood]
  const grad = g.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, wallTop)
  grad.addColorStop(1, wallBot)
  g.fillStyle = grad
  g.fillRect(0, 0, W, H)
  const r = rng(7)
  g.globalCompositeOperation = 'screen'
  for (let i = 0; i < (night(mood) ? 34 : 22); i++) {
    const x = r() * W
    const y = r() * H * 0.8
    const rad = 14 + r() * 46
    const col = night(mood) ? ['255,197,107', '122,162,255', '255,143,177'][i % 3] : '255,244,220'
    const a = night(mood) ? 0.5 : 0.22
    const rg = g.createRadialGradient(x, y, rad * 0.2, x, y, rad)
    rg.addColorStop(0, `rgba(${col},${a})`)
    rg.addColorStop(0.8, `rgba(${col},${a * 0.8})`)
    rg.addColorStop(1, `rgba(${col},0)`)
    g.fillStyle = rg
    g.beginPath()
    g.arc(x, y, rad, 0, Math.PI * 2)
    g.fill()
  }
  return simple(soften(c, 2), wood('#8a5a3b', '60,34,20', '170,118,80'), '#fff2d6')
}

// ======================================================================
function train(mood: MoodKey): PlaceInst {
  const group = new THREE.Group()
  // 車内の壁（窓は透明に抜く）
  const { c, g } = canvas()
  g.fillStyle = '#e9e4d6'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#d8d1bf'
  g.fillRect(0, 640, W, 120)
  // 広告枠（中身は抽象的な模様だけ）
  for (let x = 120; x < W; x += 520) {
    rr(g, x, 250, 300, 110, 6, '#c9c2b0')
    rr(g, x + 8, 258, 284, 94, 4, ['#ffd166', '#7fd1ff', '#ff9eb5'][(x / 520) % 3 | 0])
    g.fillStyle = 'rgba(255,255,255,0.7)'
    g.fillRect(x + 24, 280, 120, 14)
    g.fillRect(x + 24, 304, 180, 10)
  }
  // 窓
  g.globalCompositeOperation = 'destination-out'
  for (let x = 60; x < W; x += 520) rr(g, x, 390, 420, 240, 26, '#000')
  g.globalCompositeOperation = 'source-over'
  g.strokeStyle = '#9aa1a8'
  g.lineWidth = 10
  for (let x = 60; x < W; x += 520) {
    g.beginPath()
    g.roundRect(x, 390, 420, 240, 26)
    g.stroke()
  }
  // 荷物棚とつり革
  g.fillStyle = '#b0b6bd'
  g.fillRect(0, 170, W, 14)
  for (let x = 40; x < W; x += 110) {
    g.fillStyle = '#c9ced6'
    g.fillRect(x, 184, 8, 120)
    g.strokeStyle = '#f4f4f0'
    g.lineWidth = 9
    g.beginPath()
    g.arc(x + 4, 330, 26, 0, Math.PI * 2)
    g.stroke()
  }
  const wall = plane(soften(c, 1.5), 32, 18, 0, 4, -9, true)
  group.add(wall)
  // 窓の外：ゆっくり流れる街並み + 速く流れる電柱
  const far = canvas(2048, 900)
  sky(far.g, 2048, 900, mood)
  skyline(far.g, 2048, 640, mood, 11, 0.9)
  far.g.fillStyle = night(mood) ? '#141a30' : '#7c9a6a'
  far.g.fillRect(0, 640, 2048, 260)
  const farTex = tex(soften(far.c, 3), [1.5, 1])
  const farMesh = new THREE.Mesh(new THREE.PlaneGeometry(48, 20), new THREE.MeshBasicMaterial({ map: farTex, toneMapped: true }))
  farMesh.position.set(0, 4, -16)
  group.add(farMesh)
  const poles = canvas(2048, 900)
  for (let x = 100; x < 2048; x += 700) {
    poles.g.fillStyle = night(mood) ? '#0c0f1e' : '#5a5f66'
    poles.g.fillRect(x, 120, 26, 780)
    poles.g.fillRect(x - 80, 180, 186, 12)
  }
  poles.g.strokeStyle = night(mood) ? '#0c0f1e' : '#4a4f56'
  poles.g.lineWidth = 4
  for (const y of [200, 230]) {
    poles.g.beginPath()
    poles.g.moveTo(0, y)
    poles.g.lineTo(2048, y)
    poles.g.stroke()
  }
  const poleTex = tex(soften(poles.c, 6), [1, 1])
  const poleMesh = new THREE.Mesh(new THREE.PlaneGeometry(40, 18), new THREE.MeshBasicMaterial({ map: poleTex, transparent: true }))
  poleMesh.position.set(0, 4, -12)
  group.add(poleMesh)
  return {
    group, surface: moquette(), dust: '#e8f0ff',
    update(_t, dt) {
      farTex.offset.x += dt * 0.05
      poleTex.offset.x += dt * 0.32
    },
    sway: (t) => ({ y: Math.sin(t * 7.3) * 0.006, rx: 0, rz: Math.sin(t * 1.1) * 0.014 + Math.sin(t * 0.37) * 0.01 }),
    dispose: () => disposeGroup(group),
  }
}

// ======================================================================
function street(mood: MoodKey): PlaceInst {
  const group = new THREE.Group()
  const { c, g } = canvas(2048, 900)
  sky(g, 2048, 900, mood)
  // 雲
  if (!night(mood)) {
    g.fillStyle = 'rgba(255,255,255,0.85)'
    for (const [x, y, s] of [[200, 200, 1], [900, 140, 1.4], [1500, 230, 0.9]]) {
      for (const [dx, dy, rad] of [[0, 0, 40], [40, -18, 46], [86, 0, 38]]) {
        g.beginPath()
        g.arc(x + dx * s, y + dy * s, rad * s, 0, Math.PI * 2)
        g.fill()
      }
    }
  }
  skyline(g, 2048, 520, mood, 23, 0.7)
  // 家の並び（屋根つき）
  const r = rng(31)
  for (let x = 0; x < 2048; x += 260) {
    const wcol = ['#f4ead8', '#e8d5c0', '#dfe6ee', '#f0dcc8'][Math.floor(r() * 4)]
    const roof = ['#b85a4a', '#4a6a8a', '#6a5a4a', '#3a5a5a'][Math.floor(r() * 4)]
    g.fillStyle = night(mood) ? '#2a2f4a' : wcol
    g.fillRect(x + 20, 440, 220, 220)
    g.fillStyle = night(mood) ? '#1a1e33' : roof
    g.beginPath()
    g.moveTo(x, 450)
    g.lineTo(x + 130, 360)
    g.lineTo(x + 260, 450)
    g.fill()
    g.fillStyle = night(mood) ? '#ffd27a' : '#9cc8e8'
    g.fillRect(x + 50, 490, 50, 44)
    g.fillRect(x + 160, 490, 50, 44)
  }
  // ブロック塀
  g.fillStyle = '#b9b6ad'
  g.fillRect(0, 620, 2048, 130)
  g.strokeStyle = '#9e9b92'
  g.lineWidth = 3
  for (let y = 620; y < 750; y += 32) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(2048, y)
    g.stroke()
    for (let x = (y / 32) % 2 ? 0 : 40; x < 2048; x += 80) {
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x, y + 32)
      g.stroke()
    }
  }
  // 電柱と電線
  for (let x = 300; x < 2048; x += 1024) {
    g.fillStyle = '#8a8e94'
    g.fillRect(x, 120, 22, 640)
    g.fillRect(x - 60, 170, 142, 10)
  }
  g.strokeStyle = '#3a3e44'
  g.lineWidth = 3
  for (const y of [178, 200]) {
    g.beginPath()
    g.moveTo(0, y)
    g.quadraticCurveTo(1024, y + 40, 2048, y)
    g.stroke()
  }
  // 街路樹
  for (let x = 700; x < 2048; x += 1024) {
    g.fillStyle = '#6d4c41'
    g.fillRect(x, 560, 18, 190)
    g.fillStyle = night(mood) ? '#1e3a2e' : '#4f9a54'
    g.beginPath()
    g.arc(x + 9, 520, 90, 0, Math.PI * 2)
    g.fill()
  }
  const wallTex = tex(soften(c, 2.5), [1.2, 1])
  group.add(planeTex(wallTex, 34, 18, 0, 4, -9))
  return {
    group, surface: asphalt(), dust: '#fff2d6',
    update(_t, dt) {
      wallTex.offset.x += dt * 0.025
      this.surface.offset.y += dt * 0.12
    },
    // 歩くリズムで上下に揺れる
    sway: (t) => ({ y: Math.abs(Math.sin(t * 3.4)) * 0.07 - 0.03, rx: Math.sin(t * 6.8) * 0.01, rz: Math.sin(t * 1.7) * 0.025 }),
    dispose: () => disposeGroup(group),
  }
}

// ======================================================================
function school(mood: MoodKey): PlaceInst {
  const group = new THREE.Group()
  const { c, g } = canvas()
  const draw = () => {
    g.fillStyle = '#efe6d2'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#d9cdb2'
    g.fillRect(0, 700, W, 60)
    // 窓（左）
    const win = canvas(360, 420)
    sky(win.g, 360, 420, mood)
    win.g.fillStyle = night(mood) ? '#1e2a3a' : '#5c9a5e'
    for (let i = 0; i < 5; i++) {
      win.g.beginPath()
      win.g.arc(40 + i * 80, 400, 70, 0, Math.PI * 2)
      win.g.fill()
    }
    g.drawImage(win.c, 40, 250)
    g.fillStyle = '#c9c2ad'
    g.fillRect(40, 250, 360, 12)
    g.fillRect(215, 250, 10, 420)
    g.fillRect(40, 450, 360, 10)
    // カーテン
    g.fillStyle = '#e8d38a'
    g.fillRect(10, 230, 50, 460)
    g.fillRect(380, 230, 50, 460)
    // 黒板
    rr(g, 520, 280, 760, 340, 8, '#8a6a4a')
    rr(g, 534, 294, 732, 312, 4, '#2f5a46')
    g.strokeStyle = 'rgba(255,255,255,0.85)'
    g.fillStyle = 'rgba(255,255,255,0.85)'
    g.lineWidth = 5
    g.font = '700 52px system-ui, sans-serif'
    g.fillText('1 + 2 = 3', 580, 380)
    g.font = '600 40px system-ui, sans-serif'
    g.fillText('きょうの にっちょく', 580, 450)
    // 黒板のすみの落書き（芽の生えた丸いいきもの）
    g.beginPath()
    g.arc(1130, 480, 52, 0, Math.PI * 2)
    g.stroke()
    g.beginPath()
    g.moveTo(1130, 428)
    g.lineTo(1130, 400)
    g.stroke()
    g.beginPath()
    g.ellipse(1112, 396, 18, 8, 0, 0, Math.PI * 2)
    g.ellipse(1150, 392, 18, 8, 0, 0, Math.PI * 2)
    g.stroke()
    g.fillRect(1140, 470, 6, 12)
    g.fillRect(1160, 470, 6, 12)
    g.fillStyle = '#ffe08a'
    g.fillRect(560, 560, 130, 8)
    g.fillStyle = '#b8a07a'
    g.fillRect(530, 618, 740, 16)
    // 時計（いまの時刻を指す）
    const d = new Date()
    const cx = 900
    const cy = 190
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.arc(cx, cy, 60, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = '#5a5a5a'
    g.lineWidth = 8
    g.stroke()
    const hand = (a: number, len: number, w: number) => {
      g.lineWidth = w
      g.beginPath()
      g.moveTo(cx, cy)
      g.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len)
      g.stroke()
    }
    g.strokeStyle = '#2a2a2a'
    hand(((d.getHours() % 12) + d.getMinutes() / 60) * (Math.PI / 6), 32, 7)
    hand(d.getMinutes() * (Math.PI / 30), 48, 4)
    // 掲示物
    for (let i = 0; i < 3; i++) rr(g, 1320 + i * 90, 300 + (i % 2) * 30, 76, 100, 4, ['#ffffff', '#ffd6e0', '#d6ecff'][i])
  }
  draw()
  const wallTex = tex(soften(c, 1.5))
  const wallMesh = planeTex(wallTex, 32, 18, 0, 4, -9)
  group.add(wallMesh)
  let minute = new Date().getMinutes()
  return {
    group, surface: wood('#d9b98a', '150,110,70', '240,215,170', true), dust: '#fff2d6',
    update() {
      const m = new Date().getMinutes()
      if (m !== minute) {
        minute = m
        draw()
        ;(wallMesh.material as THREE.MeshBasicMaterial).map!.image = soften(c, 1.5)
        ;(wallMesh.material as THREE.MeshBasicMaterial).map!.needsUpdate = true
      }
    },
    sway: () => ({ y: 0, rx: 0, rz: 0 }),
    dispose: () => disposeGroup(group),
  }
}

// ======================================================================
function burger(mood: MoodKey): PlaceInst {
  const { c, g } = canvas()
  g.fillStyle = '#f6ead6'
  g.fillRect(0, 0, W, H)
  // 腰の高さまでタイル
  for (let y = 600; y < H; y += 40)
    for (let x = 0; x < W; x += 40) {
      g.fillStyle = ((x + y) / 40) % 2 ? '#2a9d8f' : '#e9f5f2'
      g.fillRect(x, y, 38, 38)
    }
  // メニューボード（オリジナル。文字は数字と記号だけ）
  for (let i = 0; i < 3; i++) {
    const x = 330 + i * 330
    rr(g, x, 330, 300, 230, 10, '#2b2d2f')
    const icon = (ix: number, iy: number, k: number) => {
      if (k === 0) {
        rr(g, ix - 40, iy - 24, 80, 22, 14, '#f2b134')
        g.fillStyle = '#6aa84f'
        g.fillRect(ix - 42, iy - 2, 84, 6)
        g.fillStyle = '#8a4a2a'
        g.fillRect(ix - 40, iy + 4, 80, 12)
        rr(g, ix - 40, iy + 16, 80, 14, 7, '#f2b134')
      } else if (k === 1) {
        g.fillStyle = '#ffd166'
        for (let j = 0; j < 5; j++) g.fillRect(ix - 24 + j * 10, iy - 30 + (j % 2) * 6, 7, 40)
        rr(g, ix - 30, iy, 60, 34, 4, '#e63946')
      } else {
        rr(g, ix - 22, iy - 30, 44, 64, 6, '#7fd1ff')
        g.fillStyle = '#ffffff'
        g.fillRect(ix + 4, iy - 50, 5, 30)
      }
    }
    icon(x + 150, 420, i)
    g.fillStyle = '#fff6e0'
    g.font = '700 34px system-ui, sans-serif'
    g.textAlign = 'center'
    g.fillText(['¥390', '¥250', '¥180'][i], x + 150, 520)
  }
  g.fillStyle = '#e8743f'
  g.font = '900 64px system-ui, sans-serif'
  g.textAlign = 'center'
  g.fillText('BURGER STAND', W / 2, 290)
  // 吊り下げランプ（玉ボケ）
  g.globalCompositeOperation = 'screen'
  for (const x of [260, 600, 1000, 1340]) {
    const rg = g.createRadialGradient(x, 590, 4, x, 590, 70)
    rg.addColorStop(0, 'rgba(255,210,140,0.9)')
    rg.addColorStop(1, 'rgba(255,210,140,0)')
    g.fillStyle = rg
    g.beginPath()
    g.arc(x, 590, 70, 0, Math.PI * 2)
    g.fill()
  }
  g.globalCompositeOperation = 'source-over'
  // カウンター
  g.fillStyle = '#c48a5a'
  g.fillRect(0, 680, W, 70)
  if (night(mood)) {
    g.fillStyle = 'rgba(20,20,60,0.25)'
    g.fillRect(0, 0, W, H)
  }
  return simple(soften(c, 2.5), trayPaper(), '#ffe9c8')
}

// ======================================================================
function park(mood: MoodKey): PlaceInst {
  const { c, g } = canvas()
  sky(g, W, H, mood)
  if (!night(mood)) {
    g.fillStyle = 'rgba(255,245,200,0.9)'
    g.beginPath()
    g.arc(1250, 200, 60, 0, Math.PI * 2)
    g.fill()
  }
  // 遠くの丘と木
  g.fillStyle = night(mood) ? '#16243a' : '#8fc47a'
  g.beginPath()
  g.moveTo(0, 560)
  g.quadraticCurveTo(400, 460, 800, 540)
  g.quadraticCurveTo(1200, 610, 1600, 520)
  g.lineTo(1600, H)
  g.lineTo(0, H)
  g.fill()
  const r = rng(41)
  for (let i = 0; i < 14; i++) {
    const x = r() * W
    const y = 500 + r() * 90
    g.fillStyle = '#6d4c41'
    g.fillRect(x - 6, y, 12, 70)
    g.fillStyle = night(mood) ? '#1c3a2c' : ['#4f9a54', '#3f8a4a', '#6cb86a'][i % 3]
    g.beginPath()
    g.arc(x, y - 10, 50 + r() * 30, 0, Math.PI * 2)
    g.fill()
  }
  // すべり台とブランコ
  g.strokeStyle = night(mood) ? '#3a4a6a' : '#e85a5a'
  g.lineWidth = 12
  g.beginPath()
  g.moveTo(480, 700)
  g.lineTo(480, 520)
  g.lineTo(540, 520)
  g.lineTo(700, 700)
  g.stroke()
  g.strokeStyle = night(mood) ? '#3a4a6a' : '#4a7ad8'
  g.beginPath()
  g.moveTo(960, 700)
  g.lineTo(1000, 520)
  g.lineTo(1160, 520)
  g.lineTo(1200, 700)
  g.stroke()
  g.lineWidth = 4
  for (const x of [1040, 1120]) {
    g.beginPath()
    g.moveTo(x, 520)
    g.lineTo(x, 640)
    g.stroke()
    g.fillStyle = '#8a5a34'
    g.fillRect(x - 18, 640, 36, 8)
  }
  // 柵と小道
  g.fillStyle = night(mood) ? '#2a2f3a' : '#e8dcc0'
  g.fillRect(0, 700, W, 50)
  g.fillStyle = night(mood) ? '#3a4050' : '#ffffff'
  for (let x = 0; x < W; x += 60) g.fillRect(x, 650, 10, 60)
  g.fillRect(0, 664, W, 8)
  // 街灯（夜は光る）
  if (night(mood)) {
    g.globalCompositeOperation = 'screen'
    for (const x of [300, 1400]) {
      const rg = g.createRadialGradient(x, 430, 4, x, 430, 90)
      rg.addColorStop(0, 'rgba(255,220,150,0.9)')
      rg.addColorStop(1, 'rgba(255,220,150,0)')
      g.fillStyle = rg
      g.beginPath()
      g.arc(x, 430, 90, 0, Math.PI * 2)
      g.fill()
    }
    g.globalCompositeOperation = 'source-over'
  }
  return simple(soften(c, 2.5), bench(), night(mood) ? '#cfe6ff' : '#ffc8dc')
}

// ---------------- 手前の面（本体の下） ----------------
function wood(base: string, dark: string, light: string, scratches = false) {
  const { c, g } = canvas(1024, 1024)
  g.fillStyle = base
  g.fillRect(0, 0, 1024, 1024)
  for (let i = 0; i < 260; i++) {
    const y = Math.random() * 1024
    const amp = 4 + Math.random() * 14
    const f = 0.004 + Math.random() * 0.01
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? dark : light},${0.08 + Math.random() * 0.16})`
    g.lineWidth = 1 + Math.random() * 3
    g.beginPath()
    for (let x = 0; x <= 1024; x += 16) g.lineTo(x, y + Math.sin(x * f + i) * amp)
    g.stroke()
  }
  if (scratches) {
    g.strokeStyle = 'rgba(80,80,90,0.35)'
    g.lineWidth = 2
    for (let i = 0; i < 18; i++) {
      const x = Math.random() * 1024
      const y = Math.random() * 1024
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + (Math.random() - 0.5) * 120, y + (Math.random() - 0.5) * 30)
      g.stroke()
    }
  } else {
    g.fillStyle = 'rgba(40,22,12,0.5)'
    for (let k = 1; k < 4; k++) g.fillRect(0, k * 256 - 2, 1024, 3)
  }
  return tex(c, [2, 2])
}
function moquette() {
  const { c, g } = canvas(256, 256)
  g.fillStyle = '#2f5d7c'
  g.fillRect(0, 0, 256, 256)
  for (let y = 0; y < 256; y += 2)
    for (let x = 0; x < 256; x += 2) {
      const n = Math.random()
      if (n < 0.3) {
        g.fillStyle = n < 0.15 ? '#264e6a' : '#3a6d8e'
        g.fillRect(x, y, 2, 2)
      }
    }
  g.fillStyle = '#e8c85a'
  for (let y = 16; y < 256; y += 64) for (let x = 16; x < 256; x += 64) g.fillRect(x + ((y / 64) % 2) * 32, y, 8, 8)
  return tex(c, [10, 10])
}
function asphalt() {
  const { c, g } = canvas(512, 512)
  g.fillStyle = '#4a4d52'
  g.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = Math.random() < 0.5 ? '#3e4146' : '#5a5d62'
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2)
  }
  g.fillStyle = '#f4f4f0'
  g.fillRect(240, 0, 18, 300)
  return tex(c, [3, 3])
}
function trayPaper() {
  const { c, g } = canvas(512, 512)
  g.fillStyle = '#fff6e6'
  g.fillRect(0, 0, 512, 512)
  g.strokeStyle = '#2a9d8f'
  g.fillStyle = '#e8743f'
  g.lineWidth = 4
  for (let y = 40; y < 512; y += 128)
    for (let x = 40; x < 512; x += 128) {
      const o = ((y / 128) | 0) % 2 ? 64 : 0
      g.beginPath()
      g.arc(x + o, y, 22, Math.PI, 0)
      g.stroke()
      g.fillRect(x + o - 22, y + 8, 44, 6)
      g.beginPath()
      g.arc(x + o + 50, y + 50, 6, 0, Math.PI * 2)
      g.fill()
    }
  return tex(c, [3, 3])
}
function bench() {
  const { c, g } = canvas(512, 512)
  for (let y = 0; y < 512; y += 64) {
    g.fillStyle = '#4f8a5a'
    g.fillRect(0, y, 512, 56)
    g.fillStyle = 'rgba(255,255,255,0.12)'
    g.fillRect(0, y + 4, 512, 6)
    g.fillStyle = '#1e2a22'
    g.fillRect(0, y + 56, 512, 8)
    for (let i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(30,60,40,0.3)'
      g.fillRect(Math.random() * 512, y + Math.random() * 56, 30 + Math.random() * 60, 2)
    }
  }
  return tex(c, [2, 2])
}

// ---------------- 共通 ----------------
function plane(c: HTMLCanvasElement, w: number, h: number, x: number, y: number, z: number, transparent = false) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex(c), transparent, alphaTest: transparent ? 0.5 : 0 }))
  m.position.set(x, y, z)
  return m
}
function planeTex(t: THREE.Texture, w: number, h: number, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }))
  m.position.set(x, y, z)
  return m
}
function simple(wall: HTMLCanvasElement, surface: THREE.Texture, dust: string): PlaceInst {
  const group = new THREE.Group()
  group.add(plane(wall, 32, 18, 0, 4, -9))
  return { group, surface, dust, update() {}, sway: () => ({ y: 0, rx: 0, rz: 0 }), dispose: () => disposeGroup(group) }
}
function disposeGroup(g: THREE.Object3D) {
  g.traverse((o) => {
    const m = o as THREE.Mesh
    m.geometry?.dispose()
    const mat = m.material as THREE.MeshBasicMaterial | undefined
    mat?.map?.dispose()
    mat?.dispose()
  })
}

const BUILDERS: Record<PlaceId, (m: MoodKey) => PlaceInst> = { desk, train, street, school, burger, park }

/** 手に持って遊んでいる時に、本体の下（ひざ・つくえ・テーブル・足もと）に見える物 */
const HELD: Partial<Record<PlaceId, string>> = {
  train: '#3b4d7a', street: '#ece6d6', school: '#26335c', burger: '#d9574a', park: '#5f9e63',
}
function lapBand(id: PlaceId, mood: MoodKey): THREE.Mesh {
  const { c, g } = canvas(1600, 160)
  const r = rng(77)
  if (id === 'train') {
    // 向かいの席：青い座面、すきま、足もとの くつ・かばん
    g.fillStyle = '#2d4a7a'
    g.fillRect(0, 0, 1600, 160)
    g.fillStyle = '#233a62'
    for (let x = 0; x < 1600; x += 320) g.fillRect(x + 300, 0, 10, 160)
    g.fillStyle = '#1b1d24'
    for (const x of [420, 520, 1130]) rr(g, x, 70, 78, 70, 20, '#1b1d24')
    rr(g, 1180, 40, 160, 100, 14, '#8a5a3b')
  } else if (id === 'street') {
    g.fillStyle = '#4c515a'
    g.fillRect(0, 0, 1600, 160)
    g.fillStyle = '#cfcfc8'
    g.fillRect(0, 0, 1600, 26)
    g.fillStyle = '#f2f2ec'
    for (let x = 60; x < 1600; x += 260) g.fillRect(x, 92, 120, 12)
  } else if (id === 'school') {
    // 机のてんばん：ノート・筆箱・えんぴつ
    const gr = g.createLinearGradient(0, 0, 0, 160)
    gr.addColorStop(0, '#c9965f')
    gr.addColorStop(1, '#a87646')
    g.fillStyle = gr
    g.fillRect(0, 0, 1600, 160)
    rr(g, 380, 20, 360, 120, 6, '#f4f1e6')
    g.fillStyle = '#9db7d6'
    for (let y = 40; y < 130; y += 18) g.fillRect(396, y, 328, 3)
    rr(g, 1000, 36, 300, 90, 18, '#d9574a')
    g.fillStyle = '#ffd23f'
    g.fillRect(780, 70, 150, 12)
    g.fillStyle = '#3a3a3a'
    g.fillRect(930, 70, 14, 12)
  } else if (id === 'burger') {
    // テーブルとトレー（絵だけ。ロゴなし）
    g.fillStyle = '#f1e4cc'
    g.fillRect(0, 0, 1600, 160)
    rr(g, 300, 14, 700, 130, 10, '#d9574a')
    rr(g, 330, 30, 640, 98, 6, '#fff5e0')
    rr(g, 420, 46, 130, 66, 14, '#ffd23f')
    rr(g, 620, 40, 70, 90, 10, '#ffffff')
    g.fillStyle = '#e04a4a'
    g.fillRect(620, 70, 70, 26)
    for (let i = 0; i < 6; i++) rr(g, 760 + i * 20, 36 - (i % 2) * 6, 14, 60, 4, '#ffcf55')
  } else {
    // 公園：しばふと土の道、足もと
    g.fillStyle = '#6fb15a'
    g.fillRect(0, 0, 1600, 160)
    g.fillStyle = '#5da048'
    for (let i = 0; i < 90; i++) g.fillRect(r() * 1600, r() * 160, 4, 14)
    g.fillStyle = '#c9a46a'
    g.beginPath()
    g.moveTo(560, 0)
    g.lineTo(1040, 0)
    g.lineTo(1180, 160)
    g.lineTo(420, 160)
    g.fill()
    rr(g, 440, 80, 90, 56, 18, '#f4f4f0')
    rr(g, 540, 80, 90, 56, 18, '#f4f4f0')
  }
  if (night(mood)) {
    g.fillStyle = 'rgba(8,12,34,0.55)'
    g.fillRect(0, 0, 1600, 160)
  }
  const m = plane(soften(c, 1.2), 32, 3, 0, -3.5, -8.9)
  return m
}

export function buildPlace(id: PlaceId, mood: MoodKey): PlaceInst {
  const inst = (BUILDERS[id] ?? desk)(mood)
  const sleeve = HELD[id]
  if (sleeve) {
    inst.held = true
    inst.sleeve = sleeve
    inst.group.add(lapBand(id, mood))
  }
  return inst
}
export { HORIZON }
