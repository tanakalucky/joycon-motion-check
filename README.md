# Joy-Con Motion Check の CI 基盤

アプリの公開に先立ち、CI と Cloudflare デプロイの信頼済み実装を配置する。
この基盤にはアプリ本体や配信成果物を含めず、自動デプロイは初期状態では無効。

## 検証

Bun 1.4.4 と Node.js 24.22.1 を使う。

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check
bun run test
```

CI も整形・lint・デプロイ処理の単体テストを実行する。外部サービスへの書き込みは行わない。
アプリを追加する PR で build と配信成果物の作成を CI に追加する。

初期設定、権限、preview・本番の公開と復旧は[デプロイ手順](docs/deployment.md)を参照。
