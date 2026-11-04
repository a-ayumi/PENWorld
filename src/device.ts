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

/** フェイスプレートに印刷する文字・マーク */
function printTexture(ink = '#3b3a36') {
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
  g.font = '900 92px "Arial Black", system-ui, sans-serif'
  g.letterSpacing = '18px'
  g.fillText('PULSAR', 520, 360)
  g.letterSpacing = '6px'
  g.font = '600 30px system-ui, sans-serif'
  g.globalAlpha = 0.7
  g.fillText('POCKET LIFE MONITOR', 516, 436)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

export function buildDevice(screenTexture: THREE.Texture): Device {
  const group = new THREE.Group()

  // ---- シェル ----
  const BW = 2.5
  const BH = 3.2
  const DEPTH = 0.55
  const BEV = 0.2
  const shellGeo = new THREE.ExtrudeGeometry(roundedRect(BW, BH, 1.05), {
    depth: DEPTH, bevelEnabled: true, bevelThickness: BEV, bevelSize: 0.16, bevelSegments: 10, curveSegments: 48,
  })
  shellGeo.translate(0, 0, -DEPTH / 2)
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: '#2f6f73', roughness: 0.42, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25, sheen: 0.3, sheenColor: '#ffffff',
  })
  const shell = new THREE.Mesh(shellGeo, shellMat)
  shell.castShadow = true
  shell.receiveShadow = true
  group.add(shell)
  const front = DEPTH / 2 + BEV

  // 側面のグリップ溝（左右に数本）
  const grooveMat = new THREE.MeshStandardMaterial({ color: '#244f52', roughness: 0.7 })
  for (const side of [-1, 1])
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.32, 4, 8), grooveMat)
      g.position.set(side * (BW / 2 + 0.155), -0.55 + i * 0.13, 0)
      g.rotation.x = Math.PI / 2
      group.add(g)
    }

  // ---- フェイスプレート ----
  const PW = 2.08
  const PH = 2.78
  const plateGeo = new THREE.ExtrudeGeometry(roundedRect(PW, PH, 0.82), {
    depth: 0.03, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 4, curveSegments: 48,
  })
  const plateMat = new THREE.MeshPhysicalMaterial({ color: '#efe6d2', roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.4 })
  const plate = new THREE.Mesh(plateGeo, plateMat)
  plate.position.z = front - 0.03
  plate.receiveShadow = true
  group.add(plate)
  const pz = front + 0.026

  // ---- 液晶（4:3 のカラー液晶）----
  const SCREEN_Y = 0.43
  const bezel = new THREE.Mesh(
    new THREE.ShapeGeometry(roundedRect(1.66, 1.32, 0.14), 16),
    new THREE.MeshStandardMaterial({ color: BEZEL, roughness: 0.6 }),
  )
  bezel.position.set(0, SCREEN_Y, pz + 0.002)
  group.add(bezel)

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.48, 1.11),
    // バックライト付きのカラー液晶なのでライティングの影響を受けない
    // 少しだけ暗くして、ブルームで白飛びしないようにする
    new THREE.MeshBasicMaterial({ map: screenTexture, color: '#c4c4c4' }),
  )
  screen.position.set(0, SCREEN_Y, pz + 0.004)
  group.add(screen)

  // 液晶カバー（映り込み用のガラス）
  const glass = new THREE.Mesh(
    new THREE.ShapeGeometry(roundedRect(1.62, 1.28, 0.12), 16),
    new THREE.MeshPhysicalMaterial({
      color: '#ffffff', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.08, clearcoat: 1, envMapIntensity: 1.6,
      depthWrite: false,
    }),
  )
  glass.position.set(0, SCREEN_Y, pz + 0.03)
  group.add(glass)

  // 液晶上の小さな飾りランプ
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 16, 8),
    new THREE.MeshStandardMaterial({ color: '#ff6b4a', emissive: '#ff4a2a', emissiveIntensity: 2.2, roughness: 0.2 }),
  )
  lamp.position.set(0.55, SCREEN_Y + 0.79, pz + 0.01)
  lamp.name = 'lamp'
  group.add(lamp)

  // ---- 印刷 ----
  const printMat = new THREE.MeshStandardMaterial({ map: printTexture(), transparent: true, roughness: 0.6, depthWrite: false })
  const print = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.95), printMat)
  print.position.set(0, -0.86, pz + 0.003)
  group.add(print)

  // スピーカー穴
  const holeMat = new THREE.MeshStandardMaterial({ color: '#3b3a36', roughness: 0.9 })
  const holeGeo = new THREE.CircleGeometry(0.022, 12)
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      if ((i + j) % 2) continue
      const h = new THREE.Mesh(holeGeo, holeMat)
      h.position.set(0.62 + i * 0.07, -1.0 + j * 0.07 - 0.07, pz + 0.003)
      group.add(h)
    }

  // ---- ボタン ----
  const buttonMat = new THREE.MeshPhysicalMaterial({ color: '#f2b134', roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.15 })
  const ringMat = new THREE.MeshStandardMaterial({ color: '#cfc4ab', roughness: 0.6 })
  const buttons = {} as Device['buttons']
  ;(['A', 'B', 'C'] as const).forEach((k, i) => {
    const x = (i - 1) * 0.52
    const y = -0.56 - (i === 1 ? 0.05 : 0)
    // くぼみのリング
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 10, 40), ringMat)
    ring.position.set(x, y, pz + 0.005)
    group.add(ring)
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.175, 0.12, 40), buttonMat)
    b.rotation.x = Math.PI / 2
    b.position.set(x, y, pz + 0.05)
    b.castShadow = true
    b.userData = { key: k, restZ: pz + 0.05, press: 0 }
    // 上面を少し丸く見せるキャップ
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.165, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.18), buttonMat)
    // 球の上部だけを薄く潰して、円柱の上面（y = 0.06）に載せる
    const capTheta = Math.PI * 0.18
    cap.scale.y = 0.55
    cap.position.y = 0.06 - 0.55 * 0.165 * Math.cos(capTheta)
    b.add(cap)
    group.add(b)
    buttons[k] = b
  })

  // ---- ストラップリング ----
  const metal = new THREE.MeshStandardMaterial({ color: '#d9d6cf', metalness: 1, roughness: 0.22 })
  const lug = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.22, 24), shellMat)
  lug.position.set(0, BH / 2 + 0.17, 0)
  group.add(lug)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 16, 48), metal)
  ring.position.set(0, BH / 2 + 0.42, 0)
  ring.rotation.y = Math.PI / 2
  ring.castShadow = true
  group.add(ring)

  const setSkin = (id: SkinId) => {
    const sk = SKINS[id] ?? SKINS.teal
    shellMat.map?.dispose()
    shellMat.map = sk.pattern ? sk.pattern() : null
    shellMat.color.set(sk.shell)
    // 透明シェル：中が少し透けるプラスチック
    shellMat.transmission = sk.clear ? 0.75 : 0
    shellMat.thickness = sk.clear ? 0.6 : 0
    shellMat.roughness = sk.clear ? 0.12 : 0.42
    shellMat.sheenColor.set(sk.shell).lerp(new THREE.Color('#ffffff'), 0.5)
    shellMat.needsUpdate = true
    plateMat.color.set(sk.plate)
    buttonMat.color.set(sk.button)
    grooveMat.color.set(sk.groove)
    printMat.map?.dispose()
    printMat.map = printTexture(sk.ink)
    printMat.needsUpdate = true
  }
  return { group, buttons, screen, setSkin }
}
