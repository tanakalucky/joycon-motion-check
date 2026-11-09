import { controllerSvg, movementSvg } from "./illustrations.js"

export function monitorMarkup() {
  return `
    <section class="page-intro">
      <div>
      <p class="eyebrow">MOVEMENT, MADE VISIBLE</p>
      <h1>動きを、見えるかたちに。</h1>
      </div>
      <div class="intro-aside">
      <span class="tiny-label">DESIGNED FOR</span>
      <strong>初代 Joy-Con <span>L / R</span>
      </strong>
      <span>Bluetooth · 片方1台</span>
      </div>
    </section>
    <div class="monitor-layout">
      <section class="panel connection-panel">
        <div class="section-label">
      <span>01 / CONNECTION</span>
      <span class="status" id="connection-status">未接続</span>
      </div>
        <div class="controller-stage">${controllerSvg()}<span class="hardware-tag">Joy-Con (L) / ILLUSTRATION</span>
      </div>
        <h2>Joy-Conを接続</h2>
        <button class="primary-button" id="connect">Joy-Conに接続 →</button>
        <p class="connection-message" id="connection-message" role="status">
      </p>
        <a class="small muted" href="#/mechanism">接続手順・確認方法 ↗</a>
      </section>
      <div class="readings">
        <section class="panel result-panel" id="result" data-level="disconnected">
          <div class="section-label">
      <span>02 / MOTION LEVEL</span>
      <span id="packet-rate">— packets/s</span>
      </div>
          <div class="result-content">
            <div>
      <p class="tiny-label">動きの分類</p>
      <h2 id="classification" role="status">接続待ち</h2>
      <p id="reading-note">
      </p>
      </div>
            ${movementSvg()}
            <div class="score">
      <span class="tiny-label">動きの強さ / RMS</span>
      <strong id="score">—</strong>
      <span>g <small>（推定）</small>
      </span>
      </div>
          </div>
          <div class="meter" id="motion-meter">
      <span class="meter-slow">
      </span>
      <span class="meter-normal">
      </span>
      <span class="meter-fast">
      </span>
      <i id="meter-marker" aria-hidden="true">
      </i>
      </div>
          <div class="meter-labels">
      <span>遅い</span>
      <span>普通</span>
      <span>速い</span>
      </div>
          <p class="measurement-caution">移動速度ではなく、加速度から見た動きの強さの目安です。</p>
        </section>
        <section class="panel chart-panel">
          <div class="section-label">
      <span>03 / LIVE SIGNAL</span>
      <span id="last-received">最終受信 —</span>
      </div>
          <div class="chart-heading">
      <h2>動きの波形</h2>
      <span class="legend">
      <i>
      </i> 重力推定を除いた大きさ</span>
      </div>
          <div class="chart-wrap">
      <span class="chart-axis">g</span>
      <div class="chart-labels">
      <span>2.0</span>
      <span>1.0</span>
      <span>0.0</span>
      </div>
            <svg class="wave-chart" viewBox="0 0 680 175" preserveAspectRatio="none" role="img" aria-label="直近8秒の補正後の加速度。2 gを超える波形は上端に表示。">
              <path class="grid-line" d="M0 30H680 M0 90H680 M0 150H680 M0 0V150 M170 0V150 M340 0V150 M510 0V150 M680 0V150"/>
              <polyline id="wave-line" points="" fill="none" stroke="currentColor" stroke-width="2.5" vector-effect="non-scaling-stroke"/>
            </svg>
            <span class="chart-empty" id="chart-empty">受信待ち</span>
          </div>
          <div class="time-labels">
      <span>−8秒</span>
      <span>現在</span>
      </div>
          <div class="axis-readings">
            <div>
      <span class="axis-dot x">X</span>
      <strong id="axis-x">—</strong>
      <small>g</small>
      </div>
            <div>
      <span class="axis-dot y">Y</span>
      <strong id="axis-y">—</strong>
      <small>g</small>
      </div>
            <div>
      <span class="axis-dot z">Z</span>
      <strong id="axis-z">—</strong>
      <small>g</small>
      </div>
          </div>
          <p class="small muted axis-note">3軸：重力を含む受信値（固定係数で換算）</p>
        </section>
      </div>
    </div>
    <section class="panel threshold-panel">
      <div>
      <p class="section-label">04 / TUNING</p>
      <h2>判定の境界</h2>
      <button class="text-button" id="reset">初期値に戻す ↺</button>
      </div>
      <div class="threshold-controls">
        <label for="threshold-normal">遅い <span>→</span> 普通 <output id="threshold-normal-value" for="threshold-normal">0.22 g</output>
      </label>
        <input id="threshold-normal" type="range" min="0.05" max="0.90" step="0.01" value="0.22">
        <div class="range-ends">
      <span>0.05 g</span>
      <span>0.90 g</span>
      </div>
        <label for="threshold-fast">普通 <span>→</span> 速い <output id="threshold-fast-value" for="threshold-fast">0.55 g</output>
      </label>
        <input id="threshold-fast" type="range" min="0.10" max="1" step="0.01" value="0.55">
        <div class="range-ends">
      <span>0.10 g</span>
      <span>1.00 g</span>
      </div>
        <p id="threshold-error" role="alert" class="input-error">
      </p>
      </div>
      <aside class="tuning-note">
      <span aria-hidden="true">↗</span>
      <h3>しくみと測定の限界</h3>
      <a href="#/mechanism">仕組みを見る <span aria-hidden="true">→</span>
      </a>
      </aside>
    </section>`
}
