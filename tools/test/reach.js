// 行けない所の検査：node tools/test/run2.cjs <dist> tools/test/reach.js
// 「まんなかから 歩いて行けない、平らな升目」(flatCut) は 0 にする。steepCut は 山や崖の斜面（行けなくてよい）
const out = []
for (const si of [0, 1]) {
  w.loadStage(si); w.obstacles()
  const nv = w.nav, N = nv.n, H = nv.h
  // 出発点：まんなか付近の 立てる升目
  let st = nv.cellOf(0, 0).k
  const seen = new Uint8Array(N * N); const q = [st]; seen[st] = 1
  while (q.length) { const k = q.pop(); const i = k % N, j = (k - i) / N
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= N || b >= N) continue; const nk = b * N + a
      if (seen[nk] || (nv.flags[nk] & 3) || !nv.step(k, nk)) continue; if (di && dj && ((nv.flags[j * N + a] & 3) || (nv.flags[b * N + i] & 3))) continue; seen[nk] = 1; q.push(nk) } }
  let reach = 0, flatCut = 0, steepCut = 0; const pts = []
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) { const k = j * N + i
    if (nv.flags[k] & 3) continue
    if (seen[k]) { reach++; continue }
    const g = Math.max(Math.abs(H[k + 1] - H[k - 1]), Math.abs(H[k + N] - H[k - N])) / 2
    if (g < 0.3) { flatCut++; if (pts.length < 12) { const c = nv.center(i, j); pts.push([+c.x.toFixed(1), +c.z.toFixed(1), +H[k].toFixed(1)]) } } else steepCut++ }
  const tr = (w.stage.treasures || []).map((t) => seen[nv.cellOf(t.x + 0.6, t.z + 0.6).k] || seen[nv.cellOf(t.x - 0.6, t.z - 0.6).k] || seen[nv.cellOf(t.x + 0.6, t.z - 0.6).k] || seen[nv.cellOf(t.x - 0.6, t.z + 0.6).k] ? 1 : 0)
  out.push({ stage: w.stage.name, reachPct: (100 * reach / N / N).toFixed(1), flatCut, steepCut, chestsReachable: tr, pts })
}
return out
