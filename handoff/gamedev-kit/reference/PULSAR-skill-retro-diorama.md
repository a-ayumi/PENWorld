---
name: retro-diorama-threejs
description: Three.js で PS1 風の 2.5D 箱庭（低解像度・頂点スナップ・ディザ・ドット絵ビルボード）や、それを 3D デバイスの画面に映す表現を作る/直すときに使う。モンスターの追加、ステージ追加、AI の調整、見た目の確認方法も含む。
---

# PS1 風 2.5D 箱庭の作り方（このリポジトリの流儀）

詳しい解説は `docs/TECHNIQUES.md`。作業時は以下を守る。

## 手順
1. 内側の世界は `src/world/`。320×240 の RenderTarget に描き、`makePostMaterial()`（ディザ+15bit+HUD）を通す。
2. 世界に置くマテリアルは必ず `psx(material)` で包む（頂点スナップ）。テクスチャは `NearestFilter`・ミップマップ無し。
3. 箱庭のキャラは 3D の `MonsterModel`（`models.ts` の `BUILD` に部品の組み立てを追加）。2D のドット絵版（`monsters.ts` の `DRAW`、34×32・12 ポーズ）も残してある。新モンスターは `SPECIES`・`BUILD`・`DRAW` の 3 か所に追加し、シルエットが既存キャラに似ていないか確認する。
4. 新ステージは `stages.ts` に関数を足して `STAGES` に登録。`heightAt` / `obstacles` / `foodSpots` / `residents` / `food` を必ず用意。地面は `max(0.24, h)` 以上。
5. 文字・HP バー・ダメージ数字は HUD キャンバスに描く（3D に文字を置かない）。
6. 人の関わりは間接的に：新しい要素は「置き物・食べ物」として作り、使うかどうかは `think()` 側で判断させる。ショップ項目は `SHOP` に追加。
7. 進化先を増やすときは `BRANCH` と `SPECIES.tier` をそろえる。セーブ項目を増やしたら `save()` / `load()` 両方を更新。

## 確認
- `npm run build` が通ること。
- `window.__pulsar.world.run(i)` + `update(1/30)` の早送りで、行動が最後まで完了するかを確認。
- Playwright で 1280×800 と 390×844 を撮影して見た目を確認してから完了とする。

## 禁止
- 実在作品のキャラ・マップ・ロゴ・UI・効果音の再現。雰囲気（PS1 の表現技法、箱庭育成の手触り）だけを取り入れる。
