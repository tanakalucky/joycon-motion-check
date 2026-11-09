# 新規 JavaScript / TypeScript のツール構成

新規プロジェクトでは Bun をパッケージマネージャー、組み込みの `bun fmt` をフォーマッター、Oxlint をリンターにする。
[導入サンプル](../examples/bun-tooling/README.md)を必要なファイルだけコピー・統合して使う。
既存プロジェクトのパッケージ管理・整形・lint・CI・lockfileは自動で移行しない。

- Bun は `bun fmt` を含む 1.4.4 以降の正確な版を `package.json` の `packageManager` に固定し、ローカルと CI で揃える。
  Oxlint は devDependency に固定し、`bun.lock` をコミットする。CI は `bun install --frozen-lockfile` を使う。
- 整形設定は[Bun 1.4.4 の記事](https://bun.com/blog/bun-v1.4.4)の `[fmt]` の6項目を基準とし、`[[fmt.overrides]]` は含めない。
  設定値は[サンプルの bunfig.toml](../examples/bun-tooling/bunfig.toml)を正本とする。
- package.json の scripts は `bun run <script>` で呼ぶ。組み込みの `bun check`・`bun test` と同名 scripts を混同しない。
  `bun fmt` には同名 script を優先する挙動があるため、サンプルでは `--no-script` で組み込み formatter を指定する。
- 整形・lint は型検査やアプリのテストの代わりにならない。フレームワーク、型検査、テスト基盤はアプリの要件に合わせる。
  この標準だけで `tsc` や特定テストランナーの導入を必須にしない。
