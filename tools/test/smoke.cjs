// usage: node smoke.cjs <distDir> [seconds]
const { chromium } = require('playwright')
const http = require('http'), fs = require('fs'), path = require('path')
const dir = process.argv[2], secs = +(process.argv[3] || 120)
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.webmanifest': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' }
const srv = http.createServer((q, r) => { let f = path.join(dir, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); if (!fs.existsSync(f)) f = path.join(dir, 'index.html'); r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)) }).listen(0, async () => {
  const port = srv.address().port
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const p = await b.newPage({ viewport: { width: 640, height: 480 } })
  const errs = []
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
  p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()))
  await p.goto(`http://localhost:${port}/?land=${process.argv[4] || 0}`)
  await p.waitForFunction(() => window.__pulsar, null, { timeout: 60000 })
  const r = await p.evaluate(async (secs) => {
    const P = window.__pulsar, w = P.world
    w.render = () => {}; w.drawHud = () => {}
    const out = []; const L = +(new URLSearchParams(location.search).get('land') || 0); for (let k = 0; k < L; k++) { try { w.expandLand(k + 1); out.push('land ' + (k + 1)) } catch (e) { out.push('expand ' + e.message) } }
    const stages = +(new URLSearchParams(location.search).get('n') || 7)
    for (let i = 0; i < Math.min(stages, 8); i++) {
      try { w.loadStage(i); out.push('stage ' + i + ' ' + w.stage.name); if (i % 2 === 0) w.callArmy() } catch (e) { out.push('load ' + i + ' ' + e.message); break }
      for (let t = 0; t < secs * 30 / 5; t++) { try { w.update(1 / 30) } catch (e) { out.push('upd ' + i + ' ' + e.message); break } }; out.push('  creatures ' + w.creatures.length + ' army ' + (w.army ? 'on' : 'none'))
    }
    try { localStorage.clear(); w.save?.() } catch (e) { out.push('save ' + e.message) }
    return { out, dbg: JSON.stringify(P.state()).slice(0, 400) }
  }, secs)
  console.log(JSON.stringify(r, null, 1)); console.log(errs.slice(0, 10).join('\n') || 'no errors')
  await b.close(); srv.close()
})
