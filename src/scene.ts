import * as THREE from 'three'

/** 時間帯ごとの光と空気の色 */
export interface Mood {
  sun: string; sunI: number; fill: string; fillI: number; wallTop: string; wallBottom: string
  bokeh: string[]; exposure: number; lamp: number; env: number
}

export const MOODS: Record<'morning' | 'day' | 'evening' | 'night', Mood> = {
  morning: { sun: '#ffe2b8', sunI: 2.0, fill: '#bcd7ff', fillI: 0.5, wallTop: '#e9d9c3', wallBottom: '#bfa58a',
    bokeh: ['#fff1d0', '#ffd9a8', '#ffffff'], exposure: 0.95, lamp: 0, env: 0.35 },
  day: { sun: '#fff6e8', sunI: 2.2, fill: '#d6e6ff', fillI: 0.6, wallTop: '#e4e1da', wallBottom: '#b8ad9c',
    bokeh: ['#ffffff', '#f1f6ff', '#fff4dc'], exposure: 0.95, lamp: 0, env: 0.4 },
  evening: { sun: '#ff9b5a', sunI: 2.0, fill: '#7d6bd6', fillI: 0.5, wallTop: '#9a5a4a', wallBottom: '#4a2c2c',
    bokeh: ['#ffb36b', '#ff7a59', '#ffd27a'], exposure: 0.95, lamp: 0.6, env: 0.25 },
  night: { sun: '#9db7ff', sunI: 0.35, fill: '#3a4a8a', fillI: 0.25, wallTop: '#1f2440', wallBottom: '#0d0f1c',
    bokeh: ['#ffc56b', '#7aa2ff', '#ff8fb1'], exposure: 0.9, lamp: 1.6, env: 0.08 },
}

export function moodForHour(h: number): keyof typeof MOODS {
  if (h >= 5 && h < 10) return 'morning'
  if (h >= 10 && h < 16) return 'day'
  if (h >= 16 && h < 19) return 'evening'
  return 'night'
}

/** 机の木目（手続き生成） */
export function woodTexture() {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 1024
  const g = c.getContext('2d')!
  g.fillStyle = '#8a5a3b'
  g.fillRect(0, 0, 1024, 1024)
  for (let i = 0; i < 260; i++) {
    const y = Math.random() * 1024
    const amp = 4 + Math.random() * 14
    const f = 0.004 + Math.random() * 0.01
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '60,34,20' : '170,118,80'},${0.08 + Math.random() * 0.16})`
    g.lineWidth = 1 + Math.random() * 3
    g.beginPath()
    for (let x = 0; x <= 1024; x += 16) g.lineTo(x, y + Math.sin(x * f + i) * amp)
    g.stroke()
  }
  // 板の継ぎ目
  g.fillStyle = 'rgba(40,22,12,0.5)'
  for (let k = 1; k < 4; k++) g.fillRect(0, k * 256 - 2, 1024, 3)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2, 2)
  tex.anisotropy = 8
  return tex
}

/** 背景の壁：グラデーション + 玉ボケ（被写界深度で遠くがぼけている見た目） */
export function paintWall(canvas: HTMLCanvasElement, m: Mood) {
  const g = canvas.getContext('2d')!
  const { width: W, height: H } = canvas
  const grad = g.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, m.wallTop)
  grad.addColorStop(1, m.wallBottom)
  g.fillStyle = grad
  g.fillRect(0, 0, W, H)
  // 窓から差し込む光の帯
  g.save()
  g.globalCompositeOperation = 'screen'
  g.translate(W * 0.15, 0)
  g.rotate(-0.35)
  const beam = g.createLinearGradient(0, 0, W * 0.4, 0)
  beam.addColorStop(0, 'rgba(255,255,255,0)')
  beam.addColorStop(0.5, `rgba(255,240,220,${m.lamp > 1 ? 0.03 : 0.14})`)
  beam.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = beam
  g.fillRect(0, -H, W * 0.4, H * 3)
  g.restore()
  // 玉ボケ
  const rnd = mulberry(7)
  g.globalCompositeOperation = 'screen'
  const n = m.lamp > 1 ? 34 : 22
  for (let i = 0; i < n; i++) {
    const x = rnd() * W
    const y = rnd() * H * 0.75
    const r = 14 + rnd() * 46
    const col = m.bokeh[Math.floor(rnd() * m.bokeh.length)]
    const a = (m.lamp > 1 ? 0.5 : 0.22) * (0.4 + rnd() * 0.6)
    const rg = g.createRadialGradient(x, y, r * 0.2, x, y, r)
    rg.addColorStop(0, hexA(col, a))
    rg.addColorStop(0.8, hexA(col, a * 0.8))
    rg.addColorStop(1, hexA(col, 0))
    g.fillStyle = rg
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  g.globalCompositeOperation = 'source-over'
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** ほこりの粒子（光の中を漂う） */
export function dustParticles(count: number) {
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(count * 3)
  const seed = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 9
    pos[i * 3 + 1] = (Math.random() - 0.3) * 5
    pos[i * 3 + 2] = (Math.random() - 0.5) * 5 - 0.5
    seed[i] = Math.random() * 100
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1))
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, color: { value: new THREE.Color('#fff2d6') }, strength: { value: 0.5 } },
    vertexShader: /* glsl */ `
      attribute float seed; uniform float time; varying float vA;
      void main() {
        vec3 p = position;
        p.x += sin(time * 0.15 + seed) * 0.4;
        p.y += mod(time * 0.05 + seed * 0.1, 5.0) - 2.5 + sin(time * 0.3 + seed * 2.0) * 0.15;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (2.0 + fract(seed) * 3.0) * (6.0 / -mv.z);
        vA = 0.4 + 0.6 * sin(time * 0.8 + seed * 5.0) * 0.5 + 0.3;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color; uniform float strength; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA * strength;
        gl_FragColor = vec4(color, a);
      }`,
  })
  return new THREE.Points(geo, mat)
}

/** 仕上げ：ビネット + フィルム粒子 + 軽い色調整 */
export const FinishShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 0.32 }, grain: { value: 0.035 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float time; uniform float vignette; uniform float grain; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // ほんの少し暖色寄り + コントラスト
      c.rgb = mix(c.rgb, c.rgb * vec3(1.03, 1.0, 0.96), 0.6);
      c.rgb = (c.rgb - 0.5) * 1.04 + 0.5;
      float d = distance(vUv, vec2(0.5));
      c.rgb *= 1.0 - smoothstep(0.35, 0.85, d) * vignette;
      c.rgb += (hash(vUv * 1000.0 + time) - 0.5) * grain;
      gl_FragColor = c;
    }`,
}
