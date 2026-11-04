import * as THREE from 'three'

/**
 * 本体の 3D モデル（オリジナルデザイン「PULSAR」）。
 * 縦長カプセル型のシェル + クリーム色のフェイスプレート + 液晶 + 3 ボタン + ストラップリング。
 */
export interface Device {
  group: THREE.Group
  buttons: Record<'A' | 'B' | 'C', THREE.Mesh>
  screen: THREE.Mesh
}

const SHELL = '#2f6f73'
const PLATE = '#efe6d2'
const BUTTON = '#f2b134'
const BEZEL = '#2b2d2f'

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
function printTexture() {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 512
  const g = c.getContext('2d')!
  g.clearRect(0, 0, c.width, c.height)
  g.fillStyle = '#3b3a36'
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
  g.fillStyle = '#6f6a5f'
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
    color: SHELL, roughness: 0.42, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25, sheen: 0.3, sheenColor: '#7fc4c0',
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
  const plateMat = new THREE.MeshPhysicalMaterial({ color: PLATE, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.4 })
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
  const print = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 0.95),
    new THREE.MeshStandardMaterial({ map: printTexture(), transparent: true, roughness: 0.6, depthWrite: false }),
  )
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
  const buttonMat = new THREE.MeshPhysicalMaterial({ color: BUTTON, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.15 })
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

  return { group, buttons, screen }
}
