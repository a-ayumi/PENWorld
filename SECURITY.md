# セキュリティについて

PULSAR は**サーバーを持たない**静的な PWA です。アカウント・ログイン・決済・分析タグはなく、外部へ送る通信は Google Fonts（ドット文字）の取得だけです。

## 端末に残るもの
`localStorage` に、ペットの育ち・設定だけを保存します（`pulsar-*` のキー）。個人情報は入れません。
書き出しコード（`PULSAR1:`…）にも、同じ内容だけが入ります。**知らない人から受け取ったコードは読み込まないでください**（読み込み時にキーと型・大きさは検査します）。

## 守りの仕組み
- Content-Security-Policy（本番ビルドの `<meta>`）：自分のスクリプトだけ実行、外部への通信は不可、`object` / `form` なし
- `referrer: no-referrer`
- 読み込んだデータは信用せず、種族 ID・数値の範囲・配列の長さを検査（`isSpecies` / `num`）
- 公開用ワークフローは最小権限（build は読み取りだけ）、`npm ci --ignore-scripts`
- Dependabot で npm と Actions を毎週更新

## 報告
脆弱性を見つけたら、公開の issue ではなく GitHub の「Report a vulnerability」（Security タブ）から知らせてください。
