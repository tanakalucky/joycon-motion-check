# Joy-Con Motion Check

初代Joy-Con L / Rの片方をBluetoothで接続し、加速度と動きの強さを確認する静的Webアプリです。「遅い・普通・速い」は動きの強さの目安であり、移動速度ではありません。

## 使い方

1. Joy-ConのSYNCボタンを長押しし、PCのBluetooth設定でペアリングします。
2. HTTPSまたはlocalhostでアプリをPC版Chrome / Edgeから開きます。
3. 「Joy-Conに接続」を押し、L / Rの1台を許可します。
4. 受信開始後、1秒ほど静止してから軽く動かします。

接続手順、処理の説明、実機での確認項目はアプリの「仕組みを知る」にあります。接続できない場合はOSのBluetooth接続と他の接続アプリを確認してください。ブラウザーやOSがWebHID機器を公開しない環境では利用できません。

## 対応と制約

- 初代Joy-Con L / R、Bluetooth、1台ずつ。Joy-Con 2、Proコントローラー、USBは対象外です。
- 3軸値は固定係数0.000244で換算したおおよそのg。工場校正値は使いません。
- 最初の値を基準にした低域フィルター（時定数0.5秒）で重力を推定し、直近60サンプル（約0.3秒）のRMSを分類します。初期境界0.22 / 0.55 g、下降時の余裕0.025 g。
- 急な姿勢変更や手の振動でも反応し、等速移動は測れません。精密計測・医療・安全判断向けではありません。
- 0.5秒受信が途絶えたら表示を中断。タブやページを離れると切断し、再接続は手動です。
- センサー値はブラウザー内のみで処理し、外部送信・保存・解析サービスは使いません。

## 開発

Bun **1.4.4**を使用します。

```sh
bun install --frozen-lockfile --ignore-scripts
bun run test
bun run check
bun run build
```

`dist/`を静的ホスティングで配信します。ローカル確認では、ビルド後に`python3 -m http.server 8080 --directory dist`を使い、`http://localhost:8080`を開けます。

テストは純粋な信号処理とfake HIDによる接続処理を対象とします。E2Eは構成に含みません。実機固有のBluetooth / OS動作はアプリ内の手動確認項目で確認します。

## 構成

ソースルートは`src/`、相対import、公開APIは各`index.js`です。FSDの依存方向は`app → pages → entities`。`app`は起動・ルーティング・全体スタイル、`pages/monitor`と`pages/explanation`は画面、`entities/joycon`は限定したHIDプロトコルと接続、`entities/motion`は純粋な信号処理を担当します。同一レイヤーの別スライス参照はありません。

## プロトコルの参照元

[joy-con-webhid](https://github.com/tomayac/joy-con-webhid/tree/103d33214f0e530019006ea81e696ae1552a1a5e)のコマンド構成と加速度デコードを参照・改変しています。Apache-2.0のライセンスと出典は`public/third-party.txt`に同梱しています。自動デバイス取得や無関係な機能を避けるため、限定アダプターで接続を管理します。上流の`actualAccelerometer`は時間を掛けた値なので使わず、3つのIMUサンプルを個別に換算します。
