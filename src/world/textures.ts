import * as THREE from 'three'

/** 64px の手続き生成テクスチャ（PS1 風に色数を絞り、Nearest で拡大） */
type Draw = (g: CanvasRenderingContext2D, s: number, rnd: () => number) => void

export function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function make(draw: Draw, size = 64, seed = 1, repeat: [number, number] = [1, 1]) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  draw(g, size, rng(seed))
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  t.generateMipmaps = false
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat[0], repeat[1])
  return t
}

function speckle(g: CanvasRenderingContext2D, s: number, rnd: () => number, palette: string[], block = 2) {
  for (let y = 0; y < s; y += block)
    for (let x = 0; x < s; x += block) {
      g.fillStyle = palette[Math.floor(rnd() * palette.length)]
      g.fillRect(x, y, block, block)
    }
}

/** 地面に薄く走るデジタルの格子 */
function grid(g: CanvasRenderingContext2D, s: number, color: string) {
  g.fillStyle = color
  g.fillRect(0, 0, s, 1)
  g.fillRect(0, 0, 1, s)
}

export const Tex = {
  grass: () =>
    make((g, s, r) => {
      speckle(g, s, r, ['#4f9a34', '#5fae3e', '#5fae3e', '#6cc04a', '#7fd05a'])
      for (let i = 0; i < 10; i++) {
        g.fillStyle = ['#ffffff', '#ffd23f', '#ff8fb1'][i % 3]
        g.fillRect(Math.floor(r() * 31) * 2, Math.floor(r() * 31) * 2, 2, 2)
      }
      grid(g, s, 'rgba(210,255,170,0.35)')
    }, 64, 3, [6, 6]),
  sand: () =>
    make((g, s, r) => {
      speckle(g, s, r, ['#e9a15b', '#f0b16c', '#f0b16c', '#dc8f4c', '#f6c27f'])
      g.fillStyle = 'rgba(160,80,40,0.35)'
      for (let y = 6; y < s; y += 12) for (let x = 0; x < s; x += 2) g.fillRect(x, y + Math.round(Math.sin(x * 0.2) * 2), 2, 2)
      grid(g, s, 'rgba(255,240,200,0.4)')
    }, 64, 5, [6, 6]),
  snow: () =>
    make((g, s, r) => {
      speckle(g, s, r, ['#e8f1ff', '#dce8fb', '#f4f8ff', '#cfdcf3'])
      // 雪の下に光る回路
      g.fillStyle = 'rgba(80,220,255,0.55)'
      g.fillRect(8, 0, 2, 30)
      g.fillRect(8, 30, 30, 2)
      g.fillRect(38, 30, 2, 34)
      g.fillRect(50, 10, 14, 2)
      g.fillRect(6, 28, 6, 6)
      g.fillRect(36, 28, 6, 6)
    }, 64, 7, [5, 5]),
  beach: () =>
    make((g, s, r) => {
      speckle(g, s, r, ['#f3dfb0', '#ecd3a0', '#f7e7c2', '#e6c890'])
      for (let i = 0; i < 6; i++) {
        g.fillStyle = ['#ffb3c8', '#ffffff', '#ffd9a8'][i % 3]
        const x = Math.floor(r() * 30) * 2
        const y = Math.floor(r() * 30) * 2
        g.fillRect(x, y, 3, 2)
      }
      grid(g, s, 'rgba(120,220,255,0.35)')
    }, 64, 13, [6, 6]),
  powder: () =>
    make((g, s, r) => {
      speckle(g, s, r, ['#f6f9ff', '#eef4ff', '#e2ebfb', '#ffffff'])
      for (let i = 0; i < 8; i++) {
        g.fillStyle = 'rgba(150,200,255,0.9)'
        g.fillRect(Math.floor(r() * 31) * 2, Math.floor(r() * 31) * 2, 1, 1)
      }
      grid(g, s, 'rgba(160,190,255,0.35)')
    }, 64, 17, [6, 6]),
  blocks: () =>
    make((g, s) => {
      g.fillStyle = '#f4f8ff'
      g.fillRect(0, 0, s, s)
      g.fillStyle = '#c9d8ee'
      for (let y = 0; y < s; y += 8) {
        g.fillRect(0, y, s, 1)
        for (let x = (y / 8) % 2 ? 0 : 8; x < s; x += 16) g.fillRect(x, y, 1, 8)
      }
    }, 32, 1, [3, 2]),
  side: (kind: 'grass' | 'sand' | 'snow') =>
    make((g, s, r) => {
      const top = { grass: ['#5fae3e', '#4f9a34'], sand: ['#f0b16c', '#dc8f4c'], snow: ['#f4f8ff', '#cfdcf3'] }[kind]
      const soil = {
        grass: ['#7a4e2d', '#6b4226', '#8a5a34', '#5c3820'],
        sand: ['#c97b45', '#b86b3a', '#d98b52', '#a75d32'],
        snow: ['#6f7f95', '#5f6e84', '#8090a6', '#536175'],
      }[kind]
      speckle(g, s, r, soil)
      // 地層の縞
      g.fillStyle = 'rgba(0,0,0,0.18)'
      g.fillRect(0, 26, s, 2)
      g.fillRect(0, 44, s, 2)
      for (let i = 0; i < 6; i++) {
        g.fillStyle = '#9aa1a8'
        g.fillRect(Math.floor(r() * 30) * 2, 16 + Math.floor(r() * 20) * 2, 4, 2)
      }
      g.fillStyle = top[0]
      g.fillRect(0, 0, s, 6)
      g.fillStyle = top[1]
      for (let x = 0; x < s; x += 4) g.fillRect(x, 6, 2, 2 + (x % 8 === 0 ? 2 : 0))
      // 底に光る回路ライン（デジタルの島らしさ）
      g.fillStyle = '#1b2a4a'
      g.fillRect(0, 56, s, 8)
      g.fillStyle = '#5ef2ff'
      g.fillRect(0, 58, s, 2)
      for (let x = 4; x < s; x += 16) g.fillRect(x, 58, 4, 6)
    }, 64, 11, [5, 1]),
  bark: () => make((g, s, r) => speckle(g, s, r, ['#6d4c41', '#5d4037', '#7b5a4c'], 2), 16, 2),
  rock: () => make((g, s, r) => speckle(g, s, r, ['#9aa1ab', '#8a919b', '#adb4bd', '#7c838d'], 2), 32, 4),
  ruin: () =>
    make((g, s, r) => {
      speckle(g, s, r, ['#d9c7a8', '#cbb898', '#e4d4b8'], 2)
      g.fillStyle = 'rgba(90,60,30,0.45)'
      g.fillRect(0, 15, s, 2)
      g.fillStyle = '#5ef2ff'
      g.fillRect(6, 4, 2, 8)
      g.fillRect(6, 10, 12, 2)
      g.fillRect(22, 20, 2, 10)
    }, 32, 9),
  mushroom: () =>
    make((g, s) => {
      g.fillStyle = '#e8484f'
      g.fillRect(0, 0, s, s)
      g.fillStyle = '#ffffff'
      ;[[3, 3], [10, 6], [5, 11], [12, 12]].forEach(([x, y]) => g.fillRect(x, y, 3, 3))
    }, 16, 1),
  sign: (text: string) =>
    make((g, s) => {
      g.fillStyle = '#8a5a34'
      g.fillRect(0, 0, s, s)
      g.fillStyle = '#6b4226'
      g.fillRect(0, s / 2 - 1, s, 2)
      g.fillStyle = '#fff3d6'
      g.font = 'bold 18px monospace'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(text, s / 2, s / 2 - 1)
    }, 64, 1),
}
