// usage: node cap.cjs <dist> <outdir> <name> <query> <zoom> <night 0|1> [sim seconds] [weather] [stage index]
const { chromium } = require('playwright')
const http = require('http'), fs = require('fs'), path = require('path')
const [dir, outDir, name, query, zoom, night, simS, weather, stageI] = process.argv.slice(2)
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }
const srv = http.createServer((q, r) => { let f = path.join(dir, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dir, 'index.html'); r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)) }).listen(0, async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const p = await b.newPage({ viewport: { width: 640, height: 480 } })
  await p.addInitScript(() => {
    let a = 12345; Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
    try { localStorage.clear(); localStorage.setItem('pulsar-hint', '1') } catch {}
  })
  p.on('pageerror', (e) => console.log('pageerror', e.message))
  await p.goto(`http://localhost:${srv.address().port}/${query}`)
  await p.waitForFunction(() => window.__pulsar, null, { timeout: 150000 })
  const url = await p.evaluate(async ([zoom, night, simS, weather, stageI]) => {
    const P = window.__pulsar, w = P.world
    if (stageI) w.loadStage(stageI)
    const render = w.render.bind(w), hud = w.drawHud.bind(w)
    w.render = () => {}; w.drawHud = () => {}
    w.coins = 99999
    // 村をつくる：仲間 4 匹 + それぞれの家（3〜4 だんめ）+ 建物 + 置き物
    const ids = ['pikori', 'gorota', 'mofuru', 'fuwari']
    ids.forEach((id, i) => w.spawn(id, 'friend', -3 + i * 2, 2))
    for (const c of w.creatures.filter((c) => c.team !== 'wild')) { const h = w.claimHouse(c); if (h) for (let k = 0; k < 9 + (c === w.pet ? 4 : 0); k++) w.addMaterial(h, c) }
    for (const [k, x, z] of [['farm', -4, 4], ['well', 2.5, 3.5], ['tower', 5, -3], ['fountain', 0, 1], ['windmill', -6, -4]]) { const s = w.planStruct(k, x, z, true); if (s) s.mats = 999 }
    for (const k of ['bench', 'lantern', 'flowerbed', 'fire', 'sapling', 'banner']) w.placeItem(k)
    for (const it of w.items) { it.grow = 1; it.fall = 0 }
    for (let i = 0; i < 30 * simS; i++) w.update(1 / 30)
    w.nightTarget = w.night = night
    w.setWeather(weather || 'sun', true)
    Object.assign(w.wx, { rain: 0, snow: 0, ember: 0, grey: 0, cloud: 0.2, mist: 0 })
    if (weather === 'rain') Object.assign(w.wx, { rain: 1, grey: 0.7, wet: 1 })
    w.cleanView = true
    w.camZoom = zoom
    for (let i = 0; i < 30 * 2; i++) w.update(1 / 30)
    w.render = render; w.drawHud = hud
    w.update(1 / 30); w.drawHud(); render(P.renderer)
    // 液晶の絵（rtOut 960×960）をそのまま読む
    const rt = w.rtOut, W = rt.width, H = rt.height
    const px = new Uint8Array(W * H * 4)
    P.renderer.readRenderTargetPixels(rt, 0, 0, W, H, px)
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H
    const g = cv.getContext('2d'), img = g.createImageData(W, H)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = ((H - 1 - y) * W + x) * 4, o = (y * W + x) * 4; for (let k = 0; k < 3; k++) img.data[o + k] = Math.round(Math.pow(px[i + k] / 255, 1 / 2.2) * 255); img.data[o + 3] = 255 }
    g.putImageData(img, 0, 0)
    return cv.toDataURL('image/png')
  }, [+zoom, +night, +(simS || 20), weather || 'sun', +(stageI || 0)])
  fs.writeFileSync(path.join(outDir, name + '.png'), Buffer.from(url.split(',')[1], 'base64'))
  console.log('saved', name)
  await b.close(); srv.close()
})
