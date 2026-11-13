# 確認用スクリプト（Playwright）

まず確認用のビルドを作る（Service Worker なし）：

```bash
VITE_NO_SW=1 npx vite build --outDir /tmp/pulsar-dist
```

| スクリプト | 使い方 | 見ること |
|---|---|---|
| `smoke.cjs` | `node tools/test/smoke.cjs /tmp/pulsar-dist 120 2` | 7 ステージ × 早送り（2 = かいたく 2 段階）・敵軍。エラーが出ないこと |
| `run2.cjs` | `node tools/test/run2.cjs /tmp/pulsar-dist a.js b.js` | `a.js` を実行 → セーブ → リロード → `b.js`。`a.js` の中では `P`（`__pulsar`）と `w`（World）が使える（描画は止めてある） |
| `reach.js` | `node tools/test/run2.cjs /tmp/pulsar-dist tools/test/reach.js` | ステージごとに 歩いて行ける割合・**平らなのに行けない升目 `flatCut`（0 にする）**・たからばこに行けるか |
| `sprites.cjs` | `node tools/test/sprites.cjs /tmp/pulsar-dist out.png` | 全種族のドット絵（1 コマ目）の一覧。キャラの絵を直した時の見比べに |
| `capture.cjs` | `node tools/test/capture.cjs /tmp/pulsar-dist ./out 名前 "?look=ps1" 1 0 20 sun` | 乱数を固定した同じ村を作り、液晶の絵（960×960）を PNG に。引数は ズーム・夜(0/1)・早送り秒・天気・ステージ番号 |

- 描画は SwiftShader（遅い）。早送りは `w.render` / `w.drawHud` を空にすると速い。
- Chromium は `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` で起動している。
