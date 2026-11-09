# Bun / bun fmt / Oxlint の導入サンプル

[新規 JS / TS の共通ルール](../../rules/bun-tooling.md)を導入する最小構成。
この場所に置くだけではアプリ設定や Actions は有効にならない。既存プロジェクトの一括移行には使わない。

## コピー・統合

1. 新規アプリのルートへ `package.json`、`bunfig.toml`、`bun.lock`、`.gitignore` を配置する。
   同名ファイルがあれば上書きせず、scripts・依存・`[fmt]`・ignore 行を差分確認して統合する。
   他の lockfile がある場合は自動変換・削除せず、パッケージ管理の方針を先に確認する。
2. Bun は `package.json` の `packageManager` にある **1.4.4** を使う。Oxlint は **1.92.0** を devDependency に固定済み。
   そのままの構成なら `bun install --frozen-lockfile --ignore-scripts` で導入する。
   package.json を統合・変更した場合は Bun で `bun install --ignore-scripts` を実行し、生成された `bun.lock` の差分を確認して一緒にコミットする。
   サンプルの lockfile で既存アプリの lockfile を置き換えない。
3. CI が必要な場合だけ、`bun-tooling.yml` を `.github/workflows/bun-tooling.yml` にコピーする。
   既存 workflow と統合し、`main` を実際の default branch に合わせる。導入先の Actions 利用条件を確認する。
   この README はアプリへの配置には不要。

[Preview E2E サンプル](../preview-e2e/README.md)も導入する場合、その npm の例はアプリ側で
`package-lock.json` → `bun.lock`、`npm ci` → `bun install --frozen-lockfile`、`npm run` → `bun run` に対応させる。
既存 E2E の一括移行は行わない。

依存更新時も正確な版と lockfile を一緒に更新する。Bun の版は `packageManager` が正本で、CI もそこから取得する。
`--ignore-scripts` は install 時の lifecycle scripts を実行しない指定。アプリの依存が install script を必要とする場合は、必要性と安全性を確認して導入先で判断する。

## 実行

```sh
bun run format        # 整形して書き込む
bun run format:check  # 書き込まず検査。未整形なら失敗
bun run lint          # Oxlint。警告も失敗にする
bun run check         # 整形検査 → lint。先に失敗したらそこで終了
```

scripts 内の `bun fmt --no-script` は組み込み formatter を確実に選ぶための指定。
`bun run check` を `bun check` に、アプリで定義した `bun run test` を `bun test` に置き換えない。
後者は Bun の組み込み機能であり、package.json の同名 script とは別物。
Oxlint はローカルに固定した依存を scripts 経由で使い、CI で最新版を都度取得する `bunx oxlint` は使わない。

`bunfig.toml` は記事の6項目のみで overrides は含まない。Tailwind CSS 自体の追加は必須ではなく、
`sortTailwindcss` はプロジェクトに Tailwind CSS がなければクラスの順序を変えない。
生成物などの対象外パスはアプリに合わせて調整する。既存の Prettier / Oxfmt 設定がある場合は読み込まれるため、競合を確認する。

CI は GitHub-hosted runner で read-only の token を使い、checkout の認証情報を残さない。
Secrets・Environment・書込権限・共有 cache は使わない。PR のコードを実行するため、
`pull_request_target` や永続 self-hosted runner へ置き換えたり、Secrets を渡したりしない。
install・整形・lint の失敗を無視する設定は入れない。merge・deploy は実行しない。

仕様参照: [bun fmt](https://bun.com/docs/format)、[Bun 1.4.4](https://bun.com/blog/bun-v1.4.4)、
[Oxlint](https://oxc.rs/docs/guide/usage/linter.html)、[setup-bun](https://github.com/oven-sh/setup-bun)。
