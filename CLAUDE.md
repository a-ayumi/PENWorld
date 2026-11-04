# PULSAR — 3D の液晶ペット（PWA）

Three.js + TypeScript + Vite + vite-plugin-pwa。机の上に浮かぶ 3D の本体の液晶に、PS1 風の 2.5D 箱庭が映り、モンスターが自分で暮らす（歩く・食べる・眠る・戦う）。
作成技法の解説は `docs/TECHNIQUES.md`、作業手順はスキル `.claude/skills/retro-diorama-threejs/` を参照。

## コマンド
- `npm run dev` — 開発サーバー（`--host` 付き）
- `npm run build` — 型チェック + 本番ビルド。作業の区切りごとに必ず通す
- `npm run preview` — 本番ビルドの確認（Service Worker は preview でのみ動く）
- `?mood=morning|day|evening|night` を URL に付けると時間帯の見た目を固定できる

## 構成
- `src/main.ts` — レンダラー、ライト、ポストエフェクト、ボタン操作、ループ
- `src/device.ts` — 本体の 3D モデル（シェル・フェイスプレート・液晶・ボタン・リング）
- `src/world/World.ts` — 箱庭本体：生き物の AI・バトル・食べ物・HUD・ボタン処理・描画パイプライン
- `src/world/stages.ts` — ステージ 3 種（はじまりの森 / ガラスの砂丘 / こおりの回路峰）
- `src/world/monsters.ts` — モンスター 6 種（メブ / ピコリ / ゴロタ / フワリ / ギアル / ノイズ）の能力値とドット絵
- `src/world/psx.ts` — PS1 風の表現（頂点スナップ・ディザ・15bit カラー・グリッチ）
- `src/world/sprites.ts` / `textures.ts` — ドット絵スプライト生成、手続きテクスチャ
- `src/scene.ts` — 時間帯の雰囲気（MOODS）、机の木目、背景の玉ボケ、ほこり粒子、仕上げシェーダー
- `src/beep.ts` — 圧電ブザー風の効果音

## ルール
- **デザインはすべてオリジナル**。実在する製品・ゲームの本体形状、キャラ、ロゴ、アイコン、効果音を再現しない
- 箱庭の解像度は 320×240 固定。世界のマテリアルは `psx()` で包む
- ボタンは A（アイコン選択）/ B（決定・何も選んでいなければステータス）/ C（キャンセル、何も無ければ画面に入る/出る）。キー A/B/C・Z/X・1/2/3 でも押せる
- 画質「低」ではボケとブルームを切る（スマホの既定）。新しい重い効果は必ず `applyQuality()` で切り替え可能にする
- 色は `scene.ts` の MOODS と `device.ts` 先頭の定数に集約する
- 見た目の変更はスクリーンショット（1280×800 と 390×844）で確認してから完了とする
- テストは `window.__pulsar.press('A')` / `.state()` / `.setMood('night')`、箱庭は `.world.run(i)` と `.world.update(1/30)` の早送りで確認する
