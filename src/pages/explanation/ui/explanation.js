export function mountExplanation(root) {
  root.innerHTML = `
    <section class="page-intro explanation-intro">
      <div>
      <p class="eyebrow">BEHIND THE MOVEMENT</p>
      <h1>加速度から、動きの強さへ。</h1>
      </div>
      <a class="back-link" href="#/">← モニターへ</a>
      </section>
    <div class="explanation-banner">
      <strong>測るのは、動きの強さ。</strong>
      <span>「遅い・普通・速い」は加速度の変化に付けたラベルです。移動速度や歩行速度は測っていません。</span>
      </div>
    <section class="explanation-section">
      <div class="section-heading">
      <p class="eyebrow">01 / SETUP</p>
      <h2>片方のJoy-Conをつなぐ</h2>
      </div>
      <div class="connection-flow">
        <div>
      <span class="flow-number">01</span>
      <h3>OSでペアリング</h3>
      <p>初代Joy-ConのSYNCボタンを長押しし、PCのBluetooth設定からJoy-Con (L)または(R)を登録します。</p>
      </div>
        <span class="flow-arrow" aria-hidden="true">→</span>
        <div>
      <span class="flow-number">02</span>
      <h3>ブラウザーで許可</h3>
      <p>HTTPSまたはlocalhostのPC版Chrome / Edgeで開き、「Joy-Conに接続」から1台を選びます。他の接続アプリは終了してください。</p>
      </div>
        <span class="flow-arrow" aria-hidden="true">→</span>
        <div>
      <span class="flow-number">03</span>
      <h3>1秒ほど静止</h3>
      <p>受信開始後は机などに置いて静止。準備が終わったら、周囲の安全を確かめ、軽く動かします。</p>
      </div>
      </div>
      <p class="small muted">初代L / RのBluetooth接続専用です。Joy-Con 2・Proコントローラー・USB接続は対象外。OSやブラウザーがHID機器を公開しない環境では接続できません。タブを離れる、画面を切り替える、接続が切れる場合は再接続してください。</p>
    </section>
    <section class="explanation-section">
      <div class="section-heading">
      <p class="eyebrow">02 / SIGNAL PATH</p>
      <h2>4つの処理で、3つの分類に。</h2>
      </div>
      <div class="processing-grid">
        <article>
      <span class="step-number">01</span>
      <h3>3軸を読む</h3>
      <p>WebHIDでIMUを有効にし、0x30レポートを受信。1パケット内の3サンプルを、5 ms間隔のデータとして扱います。符号付き16 bit値に0.000244を掛け、おおよそのgへ換算します。</p>
      <span class="formula">RAW → APPROXIMATE g</span>
      </article>
        <article>
      <span class="step-number">02</span>
      <h3>重力を推定して引く</h3>
      <p>最初のサンプルを基準に、時定数0.5秒のローパスでゆっくり変わる成分を推定。各軸から引きます。最初の1秒は分類を保留します。工場出荷時の校正値は読みません。</p>
      <span class="formula">a − LOW-PASS(a)</span>
      </article>
        <article>
      <span class="step-number">03</span>
      <h3>短い窓でならす</h3>
      <p>補正した3軸の二乗和を、直近60サンプル（約0.3秒）で平均し平方根を取ります。このRMSが動きの強さ。波形は補正後の瞬間的な大きさ、3軸表示は重力を含む受信値です。</p>
      <span class="formula">RMS · 300 ms</span>
      </article>
        <article>
      <span class="step-number">04</span>
      <h3>境界で分類する</h3>
      <p>初期境界は0.22 gと0.55 g。下の分類へ戻るときは0.025 g低い値を使い、境界付近でのちらつきを抑えます。受信が0.5秒止まったら分類を消します。</p>
      <span class="formula">THRESHOLDS + HYSTERESIS</span>
      </article>
      </div>
      <div class="technical-note">
      <strong>ブラウザー内だけで処理</strong>
      <p>センサー値の外部送信・保存や解析サービスはありません。ページを離れると受信を終了します。接続時の設定はIMUとレポートモードのみで、ファームウェアや校正領域は書き換えません。</p>
      </div>
    </section>
    <section class="limits-section">
      <div>
      <p class="eyebrow">03 / LIMITS</p>
      <h2>速く動くことと、<br>強く揺れることは別。</h2>
      </div>
      <div>
      <p>一定の速度で移動していても、加速度の変化が小さければ「遅い」になります。手だけの振動や急な姿勢変更でも大きく反応します。</p>
      <p>ゆっくりした姿勢変化には重力推定が追従しますが、急な回転では重力が一時的に動きとして残ります。個体差、持ち方、Bluetoothの遅延も影響します。</p>
      <p class="small">精密計測・医療・安全判断には使わず、動作確認の目安として利用してください。1 gは約9.81 m/s²ですが、このアプリは速度への積分を行いません。</p>
      </div>
      </section>
    <section class="explanation-section manual-section">
      <div>
      <p class="eyebrow">04 / HARDWARE CHECK</p>
      <h2>手元の実機で確かめる</h2>
      </div>
      <ol class="manual-list">
      <li>
      <strong>接続と静止</strong>
      <span>L / Rを1台ずつ試す。受信数が増え、3軸の合成が静止時におおよそ1 g、準備後のRMSが小さくなることを確認。</span>
      </li>
      <li>
      <strong>軽い動きから、少し強い動きへ</strong>
      <span>安全な範囲で振り幅やテンポを変え、RMSと分類が変わるか確認。必要なら境界を調整し、初期値に戻せることも確認。</span>
      </li>
      <li>
      <strong>姿勢と限界</strong>
      <span>ゆっくり傾ける場合と急に傾ける場合を比べる。手の動きだけでも分類が上がり得ることを確認。</span>
      </li>
      <li>
      <strong>切断・中断・再接続</strong>
      <span>切断ボタン、Bluetooth切断、選択キャンセル、タブ移動を試す。古い数値が消え、再接続後に受信と準備がやり直されることを確認。</span>
      </li>
    </ol>
      </section>`
  return () => {}
}
