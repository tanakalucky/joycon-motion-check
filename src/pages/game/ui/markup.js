export function gameMarkup() {
  return `
    <section class="page-intro">
      <div>
        <p class="eyebrow">MOVEMENT, MADE PLAYABLE</p>
        <h1>だるまさんがころんだ</h1>
      </div>
      <div class="intro-aside">
        <span class="tiny-label">MINI GAME</span>
        <strong>ひとりでも、みんなでも</strong>
        <span>初代 Joy-Con · Bluetooth</span>
      </div>
    </section>
    <div class="monitor-layout">
      <section class="panel connection-panel">
        <p class="section-label">01 / CONTROLLER</p>
        <h2>Joy-Conを選ぶ</h2>
        <p class="small muted">スタート前に、プレイヤーごとにJoy-Conを1台追加します。</p>
        <button class="primary-button" id="game-connect" type="button">＋ Joy-Conを追加</button>
        <a class="small muted" href="#/mechanism">接続手順 ↗</a>
      </section>
      <section class="panel result-panel game-panel">
        <p class="section-label">02 / RED LIGHT, GREEN LIGHT</p>
        <h2 class="game-signal" id="game-signal" role="status">スタート待ち</h2>
        <p class="small game-hint" id="game-hint"></p>
        <div id="game-players"></div>
        <div class="game-actions">
          <button id="game-start" class="primary-button" type="button">スタート</button>
          <button id="game-reset" class="text-button" type="button">最初から ↺</button>
        </div>
        <p class="measurement-caution">青で振ると進みます。強く振るほど速く進みます。赤で急な揺れを検知すると一度だけ少し戻ります。</p>
        <p class="small muted">ストラップを着け、周囲に注意して軽く振ってください。振る向きや実際の速度は測りません。</p>
      </section>
    </div>`
}

export function playerMarkup(id) {
  return `<h3>プレイヤー ${id}</h3>
    <p class="small muted" data-field="connection" role="status"></p>
    <p class="small game-hint" data-field="hint" role="status"></p>
    <button type="button" data-field="disconnect" class="text-button">このJoy-Conを切断</button>
      <div class="game-track" aria-hidden="true">
          <div class="game-lane">
            <svg data-field="runner" class="game-runner" viewBox="0 0 64 64" fill="none">
              <circle cx="42" cy="12" r="6" fill="#d9785a"/>
              <path d="m37 24-13 14 15 6-5 13m3-33 10 12 10-4m-20-9-14 1-8 9m9 5-7 16-9 4" stroke="#315e50" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="game-track-labels"><span>START</span><span>GOAL</span></div>
        </div>
        <label class="small game-meter">ゴールまで <progress data-field="progress" max="1" value="0"></progress></label>
        <label class="small game-meter">動きの強さ <meter data-field="strength" max="1" value="0"></meter></label>
  `
}
