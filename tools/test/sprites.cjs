// usage: node tools/test/sprites.cjs <dist> <out.png>  — 全種族のドット絵（1 コマ目）を 4 倍で ならべた一覧
const { chromium } = require('playwright')
const http = require('http'), fs = require('fs'), path = require('path')
const [dir, out] = process.argv.slice(2)
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }
const srv = http.createServer((q, r) => { let f = path.join(dir, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dir, 'index.html'); r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)) }).listen(0, async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const p = await b.newPage()
  await p.goto(`http://localhost:${srv.address().port}/`)
  await p.waitForFunction(() => window.__pulsar, null, { timeout: 150000 })
  const url = await p.evaluate(() => {
    const P = window.__pulsar
    const ids = P.world.dexList().map((e) => e.id)
    const cols = 9, cell = 72 * 3, rows = Math.ceil(ids.length / cols)
    const cv = document.createElement('canvas'); cv.width = cols * cell; cv.height = rows * cell
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false
    g.fillStyle = '#5a7a44'; g.fillRect(0, 0, cv.width, cv.height)
    ids.forEach((id, i) => { const c = P.portrait(id); g.drawImage(c, (i % cols) * cell, Math.floor(i / cols) * cell + (cell - c.height * 3), c.width * 3, c.height * 3) })
    return cv.toDataURL('image/png')
  })
  fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'))
  console.log('saved', out)
  await b.close(); srv.close()
})
