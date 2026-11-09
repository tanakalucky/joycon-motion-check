# Cloudflare への公開

静的ファイルだけを Worker `joycon-motion-check` から配信する。account は
`854f0f3b5b5e432e6e2e87d297965d4f`。カスタムドメイン、バックエンド、
データストア、アプリ用 Secrets は使わない。preview も公開 URL となる。

## 初期設定

自動デプロイは初期状態では無効。次の順序で有効にする。

1. アプリとは別の CI 基盤 PR で `cloudflare.config.ts`、`scripts/deploy/`、workflow、
   固定版の package/lockfile をレビューし、信頼済み main に配置する。
   基盤 PR は配信するアプリを含めず、CI は基盤の整形・lint・単体テストだけを行う。
   build / artifact upload は含めず、デプロイは無効のままとする。
   後続のアプリ PR で通常の build / artifact upload を CI に追加する。
   deploy 用コードは main の信頼済み実装だけを使い、PR のコードや設定を実行しない。
2. `CLOUDFLARE_API_TOKEN` は Repository secret または Environment `cloudflare` の
   secret を利用する。既存の Repository secret があれば再登録は不要。
   workflow は Environment `cloudflare` にデプロイを記録するが、専用の Environment secret は必須ではない。
   main 限定や承認者などの追加保護は必要に応じて本人の承認を得て設定する。
   token は対象 account に限定した Workers Scripts Write 権限を使い、
   DNS、KV、D1、R2、他 account の権限は追加しない。
   account は信頼済みコードの固定値を使い、PR や入力値から変更しない。
   `CLOUDFLARE_ACCOUNT_ID` secret は不要で、登録済みでもこの workflow では参照しない。
   新しい token の作成、持続アクセスの設定、権限変更は本人の承認を得て行う。
3. 同一 Worker に Workers Builds 等の別の自動公開経路がないことを確認する。
   repo variable `DEPLOY_ENABLED=true` は全ライフサイクルの準備後に設定する。
   変数が未設定・false の間、Deploy job は skipped となり公開しない。
4. アプリ PR の CI 成功後、必要な初期設定と対象 Worker を確認して有効化し、
   Deploy を main から手動実行して `pr=N` の preview を確認する。
   アプリ PR のレビュー・CI・preview 確認後に main へ取り込むと、その push の CI 成功で本番を公開する。
   本番の再照合は `pr=0` を指定する。基盤だけの CI には配信成果物がないため本番公開に使わない。
   以後、PR の作成・追加 push・reopen の CI 成功で `pr-N` を作成・更新し、
   close/merge でその preview だけを削除する。

GitHub token は build job では contents:read のみ。隔離した deploy job は
contents:read、actions:read、pull-requests:write を使う。Bot コメントは
この repo の PR に限り、専用マーカーと GitHub Actions Bot ID の両方を照合する。
GitHub の権限設定を workflow が自動で変更することはない。

## 実行と信頼境界

Bun の版は package.json、Cloudflare CLI は `cf@1.0.0-beta.28`、実行用 Node は
24.22.1 に固定。cf を Bun runtime で起動しない。CLI 更新時は実 help と Build Output
の構造を再確認し、production / preview 両方を資格情報なしで検証する。

CI は `bun run check`、`bun run test`、`bun run build` を行う。
E2E は実施しない。`dist` は静的ファイルの JSON にまとめ、7 日保持する。
特権側は repo、workflow、run、成功結果、PR/head、artifact の出所を照合する。
PR 由来のコードや設定は実行せず、zip をファイルシステムへ展開せずに JSON を読む。
ファイル名・種類・件数・合計容量を制限し、account / Worker / bindings を含む
Cloudflare Build Output は信頼済みコードから作り直す。

assets-only Build Output v0 は cf の固定版に合わせた小さなアダプターで生成する。
追加の framework や Wrangler は不要。preview と本番に共有データ資源や秘密はない。
Cloudflare CLI には `--prebuilt` を必ず指定し、自動設定や PR build を起動させない。

## 復旧

Deploy workflow の手動実行は main からのみ行い、`pr=N` で当該 PR の現在状態を再照合する。
開いていれば現在 head の成功 CI を選び、閉じていれば削除する。`pr=0` は現在 main の成功 CI を使う。
artifact が期限切れなら CI を再実行してから再照合する。

全 deploy / cleanup / コメントは同じ concurrency key で直列化する。
GitHub concurrency の pending 置換や通信障害でイベントが欠ける場合は手動再照合する。
操作直前・直後の PR/main を確認し、古い成功 URL を最新として投稿しない。
更新中の push は再照合し、CI 待ちのコメントに切り替える。
削除の認証エラーや通信エラーを「削除済み」と扱わない。

コメント投稿の結果不明時は読み戻し、無条件に再投稿しない。専用 Bot コメントが重複した場合は
運用者が内容を確認し整理してから再実行する。コメント失敗後も再実行で cleanup を先に確認する。
失敗・キャンセル時は workflow log の対象 PR、SHA と Cloudflare の現物を確認する。
本番の削除や名前の部分一致による一括削除は行わない。

## 仕様参照

- [Cloudflare CLI / CI](https://developers.cloudflare.com/cf/ci/)
- [Programmatic configuration](https://developers.cloudflare.com/cf/projects/cloudflare-config/)
- [Prebuilt / previews](https://developers.cloudflare.com/cf/projects/)
- [Workers Preview の資源](https://developers.cloudflare.com/workers/previews/resources/)
