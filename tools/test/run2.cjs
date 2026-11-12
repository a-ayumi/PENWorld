// usage: node evtest.cjs <dist> <js-file-with-body-of-async-fn(P,w)>  — runs body, saves, reloads, runs body2 (optional) and prints
const { chromium } = require('playwright')
const http = require('http'), fs = require('fs'), path = require('path')
const dir = process.argv[2], body = fs.readFileSync(process.argv[3], 'utf8'), body2 = process.argv[4] ? fs.readFileSync(process.argv[4], 'utf8') : 'return P.state()'
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }
const srv = http.createServer((q, r) => { let f = path.join(dir, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dir, 'index.html'); r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)) }).listen(0, async () => {
  const port = srv.address().port
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const p = await b.newPage({ viewport: { width: 640, height: 480 } })
  const errs = []
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
  p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()))
  await p.goto(`http://localhost:${port}/`)
  await p.waitForFunction(() => window.__pulsar, null, { timeout: 60000 })
  const r1 = await p.evaluate(new Function('return (async () => { const P = window.__pulsar, w = P.world; w.render = () => {}; w.drawHud = () => {};\n' + body + '\n})()'))
  console.log('RUN1', JSON.stringify(r1, null, 1))
  await p.reload()
  await p.waitForFunction(() => window.__pulsar, null, { timeout: 60000 })
  const r2 = await p.evaluate(new Function('return (async () => { const P = window.__pulsar, w = P.world;\n' + body2 + '\n})()'))
  console.log('RUN2', JSON.stringify(r2, null, 1))
  console.log(errs.slice(0, 10).join('\n') || 'no errors')
  await b.close(); srv.close()
})
