// ブラウザの コンソールの エラー（シェーダーの コンパイル失敗など）を 出す：node console-errors.cjs <dist>
const { chromium } = require('playwright')
const http = require('http'), fs = require('fs'), path = require('path')
const dir = process.argv[2]
const srv = http.createServer((q, r) => { let f = path.join(dir, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dir, 'index.html'); r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(fs.readFileSync(f)) }).listen(0, async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const p = await b.newPage({ viewport: { width: 640, height: 480 } })
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /THREE|shader|ERROR/i.test(t)) console.log(m.type(), t.slice(0, 1500)) })
  await p.goto(`http://localhost:${srv.address().port}/`)
  await p.waitForFunction(() => window.__pulsar, null, { timeout: 60000 })
  await p.evaluate(() => { const P = window.__pulsar; P.press('B') })
  await p.waitForTimeout(4000)
  await b.close(); srv.close()
})
