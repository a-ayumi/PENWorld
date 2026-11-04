// public/icons/icon.svg から PWA 用 PNG アイコンを生成する（Playwright を使用）
import { createRequire } from 'node:module'
// require は NODE_PATH を見るので、グローバルの playwright も使える
const { chromium } = createRequire(import.meta.url)('playwright')
import { readFile } from 'node:fs/promises'

const svg = await readFile(new URL('../public/icons/icon.svg', import.meta.url), 'utf8')
const browser = await chromium.launch()
const page = await browser.newPage()
const shot = async (size, file, pad = 0) => {
  await page.setViewportSize({ width: size, height: size })
  const inner = size - pad * 2
  await page.setContent(
    `<body style="margin:0;background:${pad ? '#16213e' : 'transparent'}"><div style="padding:${pad}px">` +
      svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `) + '</div></body>',
  )
  await page.screenshot({ path: new URL(`../public/icons/${file}`, import.meta.url).pathname, omitBackground: !pad })
}
await shot(192, 'icon-192.png')
await shot(512, 'icon-512.png')
await shot(512, 'maskable-512.png', 64) // maskable は外側 10%強を余白に
await browser.close()
console.log('icons generated')
