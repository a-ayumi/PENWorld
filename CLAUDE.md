# PULSAR — 3D の液晶ペット（PWA）

Three.js + TypeScript + Vite + vite-plugin-pwa。机の上に浮かぶ 3D の本体の液晶に、PS1 風の 2.5D 箱庭が映り、モンスターが自分で暮らす（歩く・食べる・眠る・遊ぶ・戦う・家を建てる・仲間になる・たまごを産む・それぞれ勝手に進化する）。天気（はれ・くもり・あめ・ゆき・ひのこ）も移り変わる。
人は直接操作せず「環境」を用意して見守る（ショップで食べ物・置き物を買う、きせかえで本体と場所を選ぶ）。
作成技法の解説は `docs/TECHNIQUES.md`、作業手順はスキル `.claude/skills/retro-diorama-threejs/` を参照。

## コマンド
- `npm run dev` — 開発サーバー（`--host` 付き）
- `npm run build` — 型チェック + 本番ビルド。作業の区切りごとに必ず通す
- `npm run preview` — 本番ビルドの確認（Service Worker は preview でのみ動く）
- `?mood=morning|day|evening|night` を URL に付けると時間帯の見た目を固定できる

## 構成
- `src/main.ts` — レンダラー、ライト、ポストエフェクト、ボタン操作、ループ
- `src/device.ts` — 本体の 3D モデルと、きせかえ用の柄 `SKINS`（7 種）
- `src/places.ts` — 本体の後ろの「人間側」の場所 6 種（机・電車・通学路・教室・バーガーショップ・公園）。実在の店や施設は描かない
- `src/world/World.ts` — 箱庭本体：生き物の AI・バトル・食べ物・置き物・仲間・たまご・進化・コイン/ショップ・セーブ・HUD・描画パイプライン
- `src/world/stages.ts` — ステージ 5 種（はじまりの森 / ガラスの砂丘 / さんごの入り江 / わたゆきの原 / こおりの回路峰）。水場は `water: true` の障害物（浮く種族だけ入れる）
- `src/world/monsters.ts` — 進化分岐 `BRANCH`（ちから/まもり/こころ、4 段階）、必要経験値 `XP_NEED`、モンスター 14 種（仲間になれる 10 種：メブ / ピコリ / ゴロタ / モフル / ギアル / ヒレル / フワリ / ガルドラ / シオリュウ / ホシクジラ、敵 4 種：ノイズ / トゲバグ / ヤミカゲ（夜だけ）/ ゴウガン（家をこわす））
- `src/world/models.ts` — モンスターの 3D モデル版（きせかえの「キャラの表現」でポリゴンを選んだ時に使う）。既定は 2.5D のドット絵（`SpriteMonster`）。3D が無い種族はドット絵で表示（`hasModel`）
- `src/world/psx.ts` — PS1 風の表現（頂点スナップ・ディザ・15bit カラー・グリッチ）
- `src/world/sprites.ts` / `textures.ts` — ドット絵スプライト生成、手続きテクスチャ
- `src/scene.ts` — 時間帯の雰囲気（MOODS）、机の木目、背景の玉ボケ、ほこり粒子、仕上げシェーダー
- `src/beep.ts` — 圧電ブザー風の効果音

## ルール
- **デザインはすべてオリジナル**。実在する製品・ゲームの本体形状、キャラ、ロゴ、アイコン、効果音を再現しない
- 液晶は正方形。解像度：HUD は 320×320、箱庭は 480×480（`SCENE`）、出力は 960×960（`OUT`）。どちらも整数倍で拡大されるように保つ。世界のマテリアルは `psx()` で包む
- モンスターのドット絵は 34×32 の座標で描き、2 倍（68×64）で焼いて自動陰影 + 色付き輪郭をかける（`pixelSprite(..., { shade: true })`）
- 液晶のアイコン・ショップ・ステータスはタップでも操作できる（`World.tap(u, v)`、HUD の 320×320 座標で当たり判定）。何もない所のタップは眺めるモード（`world.cleanView` + body の `clean` クラスで文字・アイコン・ボタンを全部かくす）
- 視点は `World.setView('top' | 'behind' | 'eye')`。右上の「視点」ボタンかキー V で切り替え、音量は「音」ボタン（`Beeper.setLevel`）
- カメラ：2 本指ピンチ = `World.zoomBy`、2 本指ドラッグ = `World.panBy`（みおろしは前後左右、うしろ・めせんは向きと高さ）。パソコンはホイールと矢印キー。1 本指のタップは指を離した時に判定
- 技は種族ごとに `SKILLS`（shot / burst / dash / rain / heal / wave）。`useSkill` で出し、技名はメッセージ欄に出す。バトル中に「バトル」アイコン = おうえん（次の攻撃で技）
- `main` に push すると `.github/workflows/pages.yml` が GitHub Pages に公開する
- ボタンは A（アイコン選択）/ B（決定・何も選んでいなければステータス）/ C（キャンセル、何も無ければ画面に入る/出る）。キー A/B/C・Z/X・1/2/3 でも押せる
- 本体ビューは「液晶 + ボタン」が画面いっぱいになる距離（`resize()` の needW/needH）。本体の縁や背景ははみ出してよい
- 画質「低」ではボケとブルームを切る（スマホの既定）。新しい重い効果は必ず `applyQuality()` で切り替え可能にする
- 色は `scene.ts` の MOODS と `device.ts` 先頭の定数に集約する
- 見た目の変更はスクリーンショット（1280×800 と 390×844）で確認してから完了とする
- 育ちはペットだけ `World.xp` / `World.care`、ほかの子は 1 匹ずつ `c.xp` / `c.care` / `c.bias`（性格）。`gainXp(c, n)` / `addCare(c, k, n)` を使う
- 家は `houses`（資材 2/5/8 個で 土台/かべ/屋根）。`addMaterial` で建て、`damageHouse` でこわれる。資材は `resources`（木・石）。家づくり支援の置き物は ざいもくセット / だいくどうぐ（資材 2 倍・修理）/ まもりのさく（ダメージ半分）で、効果の判定は `nearItem()`
- ペットの行動結果は `delta()` で増減を付けてメッセージに出す（ごはん・ねむり・トレーニング・あそび・家づくり）
- **セキュリティ**（公開リポジトリ）：秘密・鍵・個人情報をコミットしない／外部通信を増やさない（CSP の `connect-src 'self'`、許可元は `vite.config.ts` の `CSP`）／セーブや読み込んだコードは信用せず `isSpecies()` / `num()` で検査／`innerHTML` に外部データを入れない。方針は `SECURITY.md`
- 天気は `setWeather()`、出やすさはステージごとの `WEATHER_W`
- セーブは localStorage の `pulsar-save-v1`（10 秒ごと + 画面を離れた時）。項目を増やしたら `save()` と `load()` の両方を直す
- データの書き出し・読み込み・やり直しは `src/backup.ts`（コードは `PULSAR1:` + base64 の JSON）。設定のキーを増やしたら `KEYS` にも足す。読み込み・やり直しの前は `world.saveLocked = true` にして上書きを防ぐ。起動時に `navigator.storage.persist()` を頼む
- テストは `window.__pulsar.press('A')` / `.state()` / `.setMood('night')`、箱庭は `.world.run(i)` と `.world.update(1/30)` の早送りで確認する
