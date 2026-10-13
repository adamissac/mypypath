/* Decorative mission scenery. The existing trail renderer owns every phase. */
export function expeditionScenes() {
  const stars = Array.from({ length: 32 }, (_, i) => `<circle cx="${(i * 137 + 29) % 700}" cy="${(i * 73 + 17) % 420}" r="${i % 5 === 0 ? 2 : 1}"/>`).join('');
  return `
              <div class="expedition" aria-hidden="true">
                <div class="expedition__sunset"></div><div class="expedition__night"></div>
                <svg class="expedition__art" viewBox="0 0 700 480" focusable="false">
                  <g class="expedition__stars" fill="#d4c8e1">${stars}</g>
                </svg>
                <div class="expedition__hud"><span>Foundations complete <b data-mission-units>0 / 10</b></span><span>Fuel · progress <b data-mission-fuel>0%</b></span><i><i data-mission-meter></i></i><small class="expedition__certificate">One small step. Your certificate awaits.</small></div>
              </div>`;
}

/* The launch is separate from the map so course labels never cross the scene. */
export function launchScene() {
  return `
          <dialog class="trail-launch" aria-labelledby="trail-launch-title" aria-describedby="trail-launch-description">
            <p class="trail-launch__eyebrow">Next stop: Python for Data</p>
            <h2 id="trail-launch-title">Ready for liftoff</h2>
            <p id="trail-launch-description" class="visually-hidden">Your launch plays automatically, then opens the first Python for Data unit on the trail.</p>
            <div class="trail-launch__scene" aria-hidden="true">
              <svg viewBox="0 0 600 360" focusable="false">
                <g fill="#d4c8e1"><circle cx="75" cy="55" r="2"/><circle cx="490" cy="65" r="2"/><circle cx="150" cy="130" r="2"/><circle cx="540" cy="180" r="2"/><circle cx="390" cy="30" r="2"/></g>
                <g class="trail-launch__rocket">
                  <path class="trail-launch__flame" d="M285 231 Q300 310 315 231Z" fill="#f2bc63"/>
                  <path d="M281 193 L259 238 L285 226 M319 193 L341 238 L315 226" fill="#a78bfa"/>
                  <path d="M300 116 Q269 150 280 231 H320 Q331 150 300 116Z" fill="#f1ecf8" stroke="#88729f" stroke-width="3"/>
                  <path d="M300 116 Q286 132 282 148 H318 Q314 132 300 116Z" fill="#38bdf8"/>
                  <circle cx="300" cy="177" r="14" fill="#21162f" stroke="#a78bfa" stroke-width="5"/>
                </g>
                <image href="/assets/img/summit.png" x="50" y="245" width="500" height="190"/>
              </svg>
            </div>
            <p class="trail-launch__status" aria-live="polite" aria-atomic="true">Launching in <strong data-launch-count>3</strong></p>
            <button type="button" class="btn-path btn-path--ghost" data-launch-skip autofocus>Skip launch</button>
          </dialog>`;
}
