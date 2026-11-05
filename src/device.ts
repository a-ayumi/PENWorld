import * as THREE from 'three'

/**
 * 本体の 3D モデル（オリジナルデザイン「PULSAR」）。
 * 縦長カプセル型のシェル + クリーム色のフェイスプレート + 液晶 + 3 ボタン + ストラップリング。
 */
export interface Device {
  group: THREE.Group
  buttons: Record<'A' | 'B' | 'C', THREE.Mesh>
  screen: THREE.Mesh
  /** きせかえ（本体の色・柄） */
  setSkin(id: SkinId): void
}

const BEZEL = '#2b2d2f'

// ---------------- きせかえ（本体の柄）----------------
export type SkinId = 'teal' | 'sakura' | 'midnight' | 'clear' | 'dots' | 'camo' | 'soda'
interface Skin {
  name: string
  shell: string
  plate: string
  button: string
  ink: string
  groove: string
  /** シェルの柄（無地なら undefined） */
  pattern?: () => THREE.Texture
  /** 透明プラスチック */
  clear?: boolean
}

function patternTexture(draw: (g: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  draw(g, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1.6, 1.6)
  t.anisotropy = 8
  return t
}

export const SKINS: Record<SkinId, Skin> = {
  teal: { name: 'ティール', shell: '#2f6f73', plate: '#efe6d2', button: '#f2b134', ink: '#3b3a36', groove: '#244f52' },
  sakura: { name: 'さくら', shell: '#f2a5bd', plate: '#f6e6eb', button: '#ff6f91', ink: '#7a3a4e', groove: '#d07f99' },
  midnight: { name: 'ミッドナイト', shell: '#1d2033', plate: '#343a52', button: '#ffd166', ink: '#e8ecff', groove: '#121426' },
  clear: { name: 'クリア', shell: '#9fd8ff', plate: '#e2edf6', button: '#5ef2ff', ink: '#2a4a6a', groove: '#6fb2d8', clear: true },
  dots: {
    name: 'ドット', shell: '#ffffff', plate: '#f2ead8', button: '#ff5e5e', ink: '#3b3a36', groove: '#d9a800',
    pattern: () =>
      patternTexture((g, s) => {
        g.fillStyle = '#ffd23f'
        g.fillRect(0, 0, s, s)
        g.fillStyle = '#ffffff'
        for (const [x, y] of [[0, 0], [s, 0], [0, s], [s, s], [s / 2, s / 2]]) {
          g.beginPath()
          g.arc(x, y, s * 0.16, 0, Math.PI * 2)
          g.fill()
        }
      }),
  },
  camo: {
    name: 'めいさい', shell: '#ffffff', plate: '#e3dcc2', button: '#6b8e23', ink: '#3a3a2a', groove: '#3d4a2a',
    pattern: () =>
      patternTexture((g, s) => {
        g.fillStyle = '#7a8b5a'
        g.fillRect(0, 0, s, s)
        const cols = ['#4f5d36', '#a59c74', '#3a3326', '#6b7d48']
        let seed = 3
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
        for (let i = 0; i < 26; i++) {
          g.fillStyle = cols[i % cols.length]
          const x = rnd() * s
          const y = rnd() * s
          // 端をまたぐ形もタイルするよう 9 方向に描く
          for (const dx of [-s, 0, s])
            for (const dy of [-s, 0, s]) {
              g.beginPath()
              g.ellipse(x + dx, y + dy, 18 + rnd() * 26, 10 + rnd() * 16, rnd() * 3, 0, Math.PI * 2)
              g.fill()
            }
        }
      }),
  },
  soda: {
    name: 'ソーダ', shell: '#ffffff', plate: '#e3f0f5', button: '#ff8fb1', ink: '#2a5a7a', groove: '#4fb3d9',
    pattern: () =>
      patternTexture((g, s) => {
        const grad = g.createLinearGradient(0, 0, 0, s)
        grad.addColorStop(0, '#7fe0ff')
        grad.addColorStop(1, '#4fb3d9')
        g.fillStyle = grad
        g.fillRect(0, 0, s, s)
        g.strokeStyle = 'rgba(255,255,255,0.8)'
        g.lineWidth = 4
        for (const [x, y, r] of [[40, 60, 18], [150, 30, 10], [200, 150, 22], [90, 190, 12], [230, 230, 8], [20, 230, 9]]) {
          g.beginPath()
          g.arc(x, y, r, 0, Math.PI * 2)
          g.stroke()
        }
      }),
  },
}

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false)
  s.lineTo(x + w, y + h - r)
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false)
  s.lineTo(x + r, y + h)
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(x, y + r)
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false)
  return s
}

/** 本体のかたち（かわいい系・きかい系・まる） */
export type ShapeId = 'egg' | 'bear' | 'flower' | 'robo' | 'mecha'
export const SHAPES: Record<ShapeId, { name: string; kind: string }> = {
  egg: { name: 'たまご', kind: 'まる' },
  bear: { name: 'くま', kind: 'かわいい' },
  flower: { name: 'おはな', kind: 'かわいい' },
  robo: { name: 'ロボ', kind: 'きかい' },
  mecha: { name: 'メカ', kind: 'きかい' },
}

/** フェイスプレートに印刷する文字・マーク */
const SUBTITLE: Record<ShapeId, string> = {
  egg: 'POCKET LIFE MONITOR', bear: 'LITTLE FRIEND', flower: 'FLOWER PET DAYS', robo: 'UNIT 01  LIFE LINK', mecha: 'TACTICAL LIFE UNIT',
}
function printTexture(ink = '#3b3a36', shape: ShapeId = 'egg') {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 512
  const g = c.getContext('2d')!
  g.clearRect(0, 0, c.width, c.height)
  g.fillStyle = ink
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  // ボタン下のラベル
  g.font = '700 44px system-ui, sans-serif'
  ;['A', 'B', 'C'].forEach((t, i) => g.fillText(t, 512 + (i - 1) * 282, 238))
  // ロゴ
  g.font = shape === 'mecha' || shape === 'robo' ? '900 92px "Arial Black", Impact, system-ui, sans-serif' : '900 92px "Arial Black", system-ui, sans-serif'
  g.letterSpacing = shape === 'bear' || shape === 'flower' ? '10px' : '18px'
  g.fillText('PULSAR', 520, 360)
  g.letterSpacing = '6px'
  g.font = '600 30px system-ui, sans-serif'
  g.globalAlpha = 0.7
  g.fillText(SUBTITLE[shape], 516, 436)
  if (shape === 'bear' || shape === 'flower') {
    // かわいい系：ロゴの左右に小さなハート
    g.globalAlpha = 0.85
    for (const x of [90, 940]) {
      g.beginPath()
      g.moveTo(x, 372)
      g.bezierCurveTo(x - 46, 330, x - 22, 296, x, 322)
      g.bezierCurveTo(x + 22, 296, x + 46, 330, x, 372)
      g.fill()
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** かどを斜めに落とした八角形（メカ用） */
function chamferRect(w: number, h: number, c: number) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + c, y)
  s.lineTo(x + w - c, y)
  s.lineTo(x + w, y + c)
  s.lineTo(x + w, y + h - c)
  s.lineTo(x + w - c, y + h)
  s.lineTo(x + c, y + h)
  s.lineTo(x, y + h - c)
  s.lineTo(x, y + c)
  s.closePath()
  return s
}

/** ふちが花びらのようにふくらむ形（おはな用） */
function scallop(rx: number, ry: number, petals: number, amp: number) {
  const s = new THREE.Shape()
  const N = 220
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2
    // 角を少し丸い四角に寄せる（スーパー楕円）+ 花びら
    const ex = 2 / 2.6
    const cx = Math.sign(Math.cos(t)) * Math.abs(Math.cos(t)) ** ex
    const cy = Math.sign(Math.sin(t)) * Math.abs(Math.sin(t)) ** ex
    const k = 1 + amp * Math.cos(petals * t)
    const x = rx * cx * k
    const y = ry * cy * k
    if (i === 0) s.moveTo(x, y)
    else s.lineTo(x, y)
  }
  s.closePath()
  return s
}

function heartShape(sz: number) {
  const s = new THREE.Shape()
  s.moveTo(0, -sz)
  s.bezierCurveTo(-sz * 1.5, -sz * 0.1, -sz * 0.9, sz * 0.9, 0, sz * 0.35)
  s.bezierCurveTo(sz * 0.9, sz * 0.9, sz * 1.5, -sz * 0.1, 0, -sz)
  return s
}

interface ShapeSpec { BW: number; BH: number; BEV: number; bevelSize: number; shell: THREE.Shape; plate: THREE.Shape; plateR: number }
function shapeSpec(shape: ShapeId): ShapeSpec {
  switch (shape) {
    case 'bear':
      return { BW: 2.62, BH: 3.05, BEV: 0.22, bevelSize: 0.18, shell: roundedRect(2.62, 3.05, 1.2), plate: roundedRect(2.14, 2.72, 0.95), plateR: 0.95 }
    case 'flower':
      return { BW: 2.64, BH: 3.32, BEV: 0.2, bevelSize: 0.14, shell: scallop(1.32, 1.66, 10, 0.03), plate: roundedRect(2.0, 2.72, 0.95), plateR: 0.95 }
    case 'robo':
      return { BW: 2.5, BH: 3.1, BEV: 0.1, bevelSize: 0.08, shell: roundedRect(2.5, 3.1, 0.34), plate: roundedRect(2.14, 2.76, 0.16), plateR: 0.16 }
    case 'mecha':
      return { BW: 2.72, BH: 3.2, BEV: 0.12, bevelSize: 0.08, shell: chamferRect(2.72, 3.2, 0.62), plate: chamferRect(2.22, 2.78, 0.42), plateR: 0.2 }
    default:
      return { BW: 2.5, BH: 3.2, BEV: 0.2, bevelSize: 0.16, shell: roundedRect(2.5, 3.2, 1.05), plate: roundedRect(2.08, 2.78, 0.82), plateR: 0.82 }
  }
}

export function buildDevice(screenTexture: THREE.Texture, shape: ShapeId = 'egg'): Device {
  const group = new THREE.Group()
  const sp = shapeSpec(shape)
  const cute = shape === 'bear' || shape === 'flower'
  const tech = shape === 'robo' || shape === 'mecha'

  // ---- シェル ----
  const { BW, BH, BEV } = sp
  const DEPTH = shape === 'robo' ? 0.62 : shape === 'mecha' ? 0.6 : 0.55
  const shellGeo = new THREE.ExtrudeGeometry(sp.shell, {
    depth: DEPTH, bevelEnabled: true, bevelThickness: BEV, bevelSize: sp.bevelSize, bevelSegments: tech ? 3 : 10, curveSegments: 48,
  })
  shellGeo.translate(0, 0, -DEPTH / 2)
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: '#2f6f73', roughness: tech ? 0.5 : 0.42, metalness: tech ? 0.25 : 0, clearcoat: 0.6, clearcoatRoughness: 0.25, sheen: 0.3, sheenColor: '#ffffff',
  })
  const shell = new THREE.Mesh(shellGeo, shellMat)
  shell.castShadow = true
  shell.receiveShadow = true
  group.add(shell)
  const front = DEPTH / 2 + BEV

  // 側面のグリップ溝（左右に数本）
  const grooveMat = new THREE.MeshStandardMaterial({ color: '#244f52', roughness: 0.7 })
  if (shape === 'egg')
    for (const side of [-1, 1])
      for (let i = 0; i < 5; i++) {
        const g = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.32, 4, 8), grooveMat)
        g.position.set(side * (BW / 2 + 0.155), -0.55 + i * 0.13, 0)
        g.rotation.x = Math.PI / 2
        group.add(g)
      }

  // ---- フェイスプレート ----
  const plateGeo = new THREE.ExtrudeGeometry(sp.plate, {
    depth: 0.03, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 4, curveSegments: 48,
  })
  const plateMat = new THREE.MeshPhysicalMaterial({ color: '#efe6d2', roughness: tech ? 0.4 : 0.55, metalness: tech ? 0.35 : 0, clearcoat: 0.3, clearcoatRoughness: 0.4 })
  const plate = new THREE.Mesh(plateGeo, plateMat)
  plate.position.z = front - 0.03
  plate.receiveShadow = true
  group.add(plate)
  const pz = front + 0.026

  // ---- 液晶（正方形のカラー液晶）----
  const SCREEN_Y = 0.46
  const bezel = new THREE.Mesh(
    new THREE.ShapeGeometry(roundedRect(1.52, 1.52, tech ? 0.06 : 0.14), 16),
    new THREE.MeshStandardMaterial({ color: BEZEL, roughness: 0.6 }),
  )
  bezel.position.set(0, SCREEN_Y, pz + 0.002)
  group.add(bezel)

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.34, 1.34),
    // バックライト付きのカラー液晶なのでライティングの影響を受けない
    // 少しだけ暗くして、ブルームで白飛びしないようにする
    new THREE.MeshBasicMaterial({ map: screenTexture, color: '#c4c4c4' }),
  )
  screen.position.set(0, SCREEN_Y, pz + 0.004)
  group.add(screen)

  // 液晶カバー（映り込み用のガラス）
  const glass = new THREE.Mesh(
    new THREE.ShapeGeometry(roundedRect(1.48, 1.48, tech ? 0.05 : 0.12), 16),
    new THREE.MeshPhysicalMaterial({
      color: '#ffffff', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.08, clearcoat: 1, envMapIntensity: 1.6,
      depthWrite: false,
    }),
  )
  glass.position.set(0, SCREEN_Y, pz + 0.03)
  group.add(glass)

  // 液晶の右下の小さな飾りランプ
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 16, 8),
    new THREE.MeshStandardMaterial({ color: '#ff6b4a', emissive: '#ff4a2a', emissiveIntensity: 2.2, roughness: 0.2 }),
  )
  lamp.position.set(0.82, -0.27, pz + 0.01)
  lamp.name = 'lamp'
  group.add(lamp)

  // ---- 印刷 ----
  const printMat = new THREE.MeshStandardMaterial({ map: printTexture('#3b3a36', shape), transparent: true, roughness: 0.6, depthWrite: false })
  const print = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.95), printMat)
  print.position.set(0, -0.86, pz + 0.003)
  group.add(print)

  // スピーカー穴（きかい系は排気スリット、かわいい系はほっぺ）
  const holeMat = new THREE.MeshStandardMaterial({ color: '#3b3a36', roughness: 0.9 })
  if (cute) {
    const cheek = new THREE.MeshBasicMaterial({ color: '#ff9eb5', transparent: true, opacity: 0.7, depthWrite: false })
    for (const sx of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), cheek)
      c.position.set(sx * 0.86, -1.02, pz + 0.004)
      c.scale.y = 0.7
      group.add(c)
    }
  } else if (tech) {
    for (let i = 0; i < 5; i++) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.025, 0.02), holeMat)
      v.position.set(0.7, -0.94 - i * 0.07, pz + 0.004)
      group.add(v)
    }
  } else {
    const holeGeo = new THREE.CircleGeometry(0.022, 12)
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        if ((i + j) % 2) continue
        const h = new THREE.Mesh(holeGeo, holeMat)
        h.position.set(0.62 + i * 0.07, -1.0 + j * 0.07 - 0.07, pz + 0.003)
        group.add(h)
      }
  }

  // ---- ボタン ----
  const buttonMat = new THREE.MeshPhysicalMaterial({ color: '#f2b134', roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.15 })
  const ringMat = new THREE.MeshStandardMaterial({ color: tech ? '#8a919a' : '#cfc4ab', roughness: tech ? 0.35 : 0.6, metalness: tech ? 0.8 : 0 })
  const buttons = {} as Device['buttons']
  const heartGeo = cute && shape === 'flower' ? new THREE.ExtrudeGeometry(heartShape(0.16), { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 4, curveSegments: 16 }) : null
  ;(['A', 'B', 'C'] as const).forEach((k, i) => {
    const x = (i - 1) * 0.52
    const y = -0.56 - (i === 1 ? 0.05 : 0)
    // くぼみ
    if (shape === 'mecha') {
      const inset = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(0.46, 0.36, 0.05), 8), new THREE.MeshStandardMaterial({ color: '#23262b', roughness: 0.8 }))
      inset.position.set(x, y, pz + 0.004)
      group.add(inset)
    } else if (shape === 'robo') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 6), ringMat)
      ring.position.set(x, y, pz + 0.005)
      group.add(ring)
    } else {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 10, 40), ringMat)
      ring.position.set(x, y, pz + 0.005)
      group.add(ring)
    }
    let b: THREE.Mesh
    if (heartGeo) {
      b = new THREE.Mesh(heartGeo, buttonMat)
      b.position.set(x, y + 0.02, pz + 0.04)
    } else if (shape === 'robo') {
      b = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.185, 0.12, 6), buttonMat)
      b.rotation.set(Math.PI / 2, 0, Math.PI / 6)
      b.position.set(x, y, pz + 0.05)
    } else if (shape === 'mecha') {
      b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.12), buttonMat)
      b.position.set(x, y, pz + 0.05)
    } else {
      b = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.175, 0.12, 40), buttonMat)
      b.rotation.x = Math.PI / 2
      b.position.set(x, y, pz + 0.05)
      // 上面を少し丸く見せるキャップ
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.165, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.18), buttonMat)
      const capTheta = Math.PI * 0.18
      cap.scale.y = 0.55
      cap.position.y = 0.06 - 0.55 * 0.165 * Math.cos(capTheta)
      b.add(cap)
    }
    b.castShadow = true
    b.userData = { key: k, restZ: b.position.z, press: 0 }
    group.add(b)
    buttons[k] = b
  })

  // ---- かたち別の飾り ----
  const metal = new THREE.MeshStandardMaterial({ color: '#d9d6cf', metalness: 1, roughness: 0.22 })
  const darkMetal = new THREE.MeshStandardMaterial({ color: '#4a4f57', metalness: 0.9, roughness: 0.35 })
  const pink = new THREE.MeshStandardMaterial({ color: '#ff9eb5', roughness: 0.6 })
  const addRing = (y: number, r = 0.2, m: THREE.Material = metal) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 16, 48), m)
    ring.position.set(0, y, 0)
    ring.rotation.y = Math.PI / 2
    ring.castShadow = true
    group.add(ring)
  }
  if (shape === 'egg') {
    const lug = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.22, 24), shellMat)
    lug.position.set(0, BH / 2 + 0.17, 0)
    group.add(lug)
    addRing(BH / 2 + 0.42)
  } else if (shape === 'bear') {
    // くまの耳：まるい耳と、中のピンク
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.48, 32, 20), shellMat)
      ear.position.set(sx * 0.98, BH / 2 - 0.06, -0.04)
      ear.scale.set(1, 1, 0.78)
      ear.castShadow = true
      group.add(ear)
      const inner = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), pink)
      inner.position.set(sx * 0.98, BH / 2 - 0.08, 0.2)
      inner.scale.set(1, 1, 0.5)
      group.add(inner)
    }
    const lug = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.2, 20), shellMat)
    lug.position.set(0, BH / 2 + 0.06, 0)
    group.add(lug)
    addRing(BH / 2 + 0.3, 0.18)
    // 顔：小さな はな と くち（プレートの上の飾り）
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshStandardMaterial({ color: '#5a3a3a', roughness: 0.4 }))
    nose.position.set(0, 1.3, pz + 0.01)
    nose.scale.set(1.3, 0.9, 0.6)
    group.add(nose)
  } else if (shape === 'flower') {
    const lug = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.2, 20), shellMat)
    lug.position.set(0, BH / 2 + 0.05, 0)
    group.add(lug)
    addRing(BH / 2 + 0.3, 0.18)
    // 葉っぱ 2 まい
    const leafMat = new THREE.MeshStandardMaterial({ color: '#7fd18b', roughness: 0.6 })
    for (const sx of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10), leafMat)
      leaf.scale.set(1.5, 0.45, 0.8)
      leaf.position.set(sx * 0.3, BH / 2 + 0.02, 0.05)
      leaf.rotation.z = sx * 0.5
      group.add(leaf)
    }
    // ふちのシール（小さなドット）
    const dotCols = ['#ffffff', '#ffd1e0', '#fff1a8']
    for (let i = 0; i < 14; i++) {
      const t = (i / 14) * Math.PI * 2 + 0.2
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), new THREE.MeshBasicMaterial({ color: dotCols[i % 3] }))
      d.position.set(Math.cos(t) * 1.18, Math.sin(t) * 1.52, front + 0.004)
      group.add(d)
    }
  } else if (shape === 'robo') {
    // ロボの頭：左右の耳（ボルト）、角のネジ、アンテナ、わき腹のボルト
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 20), darkMetal)
      ear.rotation.z = Math.PI / 2
      ear.position.set(sx * (BW / 2 + 0.13), 0.9, 0)
      ear.castShadow = true
      group.add(ear)
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 16), metal)
      cap.rotation.z = Math.PI / 2
      cap.position.set(sx * (BW / 2 + 0.3), 0.9, 0)
      group.add(cap)
      for (const sy of [-1, 1]) {
        const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12), metal)
        screw.rotation.x = Math.PI / 2
        screw.position.set(sx * 0.96, sy * 1.27, pz + 0.004)
        group.add(screw)
        const slot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.014, 0.01), darkMetal)
        slot.position.set(sx * 0.96, sy * 1.27, pz + 0.021)
        slot.rotation.z = sx * sy * 0.6
        group.add(slot)
      }
    }
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), metal)
    stick.position.set(0, BH / 2 + 0.25, 0)
    group.add(stick)
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshStandardMaterial({ color: '#ff5e5e', emissive: '#ff2a2a', emissiveIntensity: 1.4, roughness: 0.3 }))
    ball.position.set(0, BH / 2 + 0.55, 0)
    group.add(ball)
    // はいきスリットの下にしま模様（ききゅう注意）
    const stripe = document.createElement('canvas')
    stripe.width = 256
    stripe.height = 32
    const sg = stripe.getContext('2d')!
    sg.fillStyle = '#ffd23f'
    sg.fillRect(0, 0, 256, 32)
    sg.fillStyle = '#222'
    for (let x = -32; x < 288; x += 48) {
      sg.beginPath()
      sg.moveTo(x, 32)
      sg.lineTo(x + 24, 32)
      sg.lineTo(x + 56, 0)
      sg.lineTo(x + 32, 0)
      sg.fill()
    }
    const st = new THREE.CanvasTexture(stripe)
    st.colorSpace = THREE.SRGBColorSpace
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.07), new THREE.MeshBasicMaterial({ map: st }))
    strip.position.set(0, -1.31, pz + 0.004)
    group.add(strip)
  } else if (shape === 'mecha') {
    // メカ：肩のバンパー、わきの装甲、発光ライン、ごついフック
    for (const sx of [-1, 1]) {
      const bump = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.2, 0.42), darkMetal)
      bump.position.set(sx * 0.82, BH / 2 + 0.03, 0.02)
      bump.rotation.z = sx * -0.08
      bump.castShadow = true
      group.add(bump)
      const armor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.36), darkMetal)
      armor.position.set(sx * (BW / 2 + 0.03), -0.2, 0)
      group.add(armor)
      for (let k = 0; k < 3; k++) {
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 8), metal)
        bolt.rotation.z = Math.PI / 2
        bolt.position.set(sx * (BW / 2 + 0.09), 0.3 - k * 0.5, 0.1)
        group.add(bolt)
      }
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.2, 0.012), new THREE.MeshStandardMaterial({ color: '#5ef2ff', emissive: '#2ad4ff', emissiveIntensity: 2.4 }))
      led.position.set(sx * 1.05, 0.38, pz + 0.004)
      group.add(led)
    }
    // 液晶まわりの ななめのカット線
    for (const sx of [-1, 1]) {
      const cut = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.015, 0.01), darkMetal)
      cut.position.set(sx * 0.95, 1.28, pz + 0.004)
      cut.rotation.z = sx * -0.6
      group.add(cut)
    }
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.3), darkMetal)
    hook.position.set(0, BH / 2 + 0.1, 0)
    group.add(hook)
    addRing(BH / 2 + 0.34, 0.22, darkMetal)
  }

  const setSkin = (id: SkinId) => {
    const sk = SKINS[id] ?? SKINS.teal
    shellMat.map?.dispose()
    shellMat.map = sk.pattern ? sk.pattern() : null
    shellMat.color.set(sk.shell)
    // 透明シェル：中が少し透けるプラスチック
    shellMat.transmission = sk.clear ? 0.75 : 0
    shellMat.thickness = sk.clear ? 0.6 : 0
    shellMat.roughness = sk.clear ? 0.12 : tech ? 0.5 : 0.42
    shellMat.sheenColor.set(sk.shell).lerp(new THREE.Color('#ffffff'), 0.5)
    shellMat.needsUpdate = true
    plateMat.color.set(sk.plate)
    buttonMat.color.set(sk.button)
    grooveMat.color.set(sk.groove)
    printMat.map?.dispose()
    printMat.map = printTexture(sk.ink, shape)
    printMat.needsUpdate = true
  }
  return { group, buttons, screen, setSkin }
}
