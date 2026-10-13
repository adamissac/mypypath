/* Decorative mission scenery. The existing trail renderer owns every phase. */
export function expeditionScenes() {
  const stars = Array.from({ length: 32 }, (_, i) => `<circle cx="${(i * 137 + 29) % 700}" cy="${(i * 73 + 17) % 420}" r="${i % 5 === 0 ? 2 : 1}"/>`).join('');
  const snow = Array.from({ length: 12 }, (_, i) => `<circle cx="${i * 53 + 24}" cy="${(i * 37) % 180 + 25}" r="${i % 3 + 1}"/>`).join('');
  return `
              <div class="expedition" aria-hidden="true">
                <div class="expedition__sunset"></div><div class="expedition__night"></div>
                <svg class="expedition__art" viewBox="0 0 700 480" focusable="false">
                  <defs>
                    <linearGradient id="mission-hull" x2="1" y2="1"><stop stop-color="#f1ecf8"/><stop offset="1" stop-color="#88729f"/></linearGradient>
                    <linearGradient id="mission-glass" x2="0" y2="1"><stop stop-color="#0c4566"/><stop offset="1" stop-color="#21162f"/></linearGradient>
                  </defs>
                  <g class="expedition__stars" fill="#d4c8e1">${stars}</g>
                  <g class="expedition__launch">
                    <g transform="translate(350 160)"><g class="expedition__rocket">
                      <path d="M-18 57 Q0 120 18 57 Q0 82-18 57" fill="#f2bc63" class="expedition__flame"/>
                      <path d="M-23 12 L-48 55 L-19 48 M23 12 L48 55 L19 48" fill="#a78bfa" stroke="#4d365f" stroke-width="3"/>
                      <path d="M0-80 Q-33-46-25 48 H25 Q33-46 0-80Z" fill="url(#mission-hull)" stroke="#4d365f" stroke-width="3"/>
                      <path d="M0-80 Q-13-67-20-47 H20 Q13-67 0-80" fill="#0ea5e9"/>
                      <circle cy="-16" r="15" fill="url(#mission-glass)" stroke="#d4c8e1" stroke-width="5"/>
                      <path d="M-10-21 L6-30" stroke="#38bdf8" stroke-width="3" stroke-linecap="round"/>
                    </g></g>
                    <image class="expedition__mountain" href="/assets/img/summit.png" x="110" y="135" width="480" height="345"/>
                  </g>
                  <g class="expedition__moon"><image href="/assets/img/data-moon.svg" x="430" y="12" width="200" height="200"/></g>
                  <g class="expedition__streaks" stroke="#d4c8e1" stroke-width="2" opacity="0">${Array.from({length: 16}, (_, i) => { const a=i*Math.PI/8; return `<path d="M${350+Math.cos(a)*95} ${200+Math.sin(a)*95} L${350+Math.cos(a)*440} ${200+Math.sin(a)*440}"/>`; }).join('')}</g>
                  <g class="expedition__seat" fill="#30213f" stroke="#b6a5cb" stroke-width="3"><path d="M270 480 V320 Q270 280 300 280 H400 Q430 280 430 320 V480Z"/><rect x="307" y="246" width="86" height="64" rx="24"/><path d="M294 345 V440 M406 345 V440" stroke="#75608f" stroke-width="8"/></g>
                  <g class="expedition__cockpit" fill="none" stroke="#b6a5cb" stroke-width="3">
                    <path d="M-15 490 V80 Q350-115 715 80 V490" stroke="#21162f" stroke-width="35"/>
                    <path d="M-15 490 V80 Q350-115 715 80 V490"/>
                    <path d="M350-5 V62 M26 77 L90 115 M674 77 L610 115" stroke="#75608f" stroke-width="12"/>
                    <path d="M0 408 Q350 340 700 408 V480 H0Z" fill="#21162f" stroke="#75608f"/>
                    <path d="M30 445 H145 M555 445 H670" stroke="#a78bfa" stroke-width="8" stroke-linecap="round"/>
                    <g class="expedition__lights" fill="#38bdf8" stroke="none"><circle cx="175" cy="445" r="5"/><circle cx="194" cy="445" r="5"/><circle cx="213" cy="445" r="5"/><circle cx="487" cy="445" r="5"/><circle cx="506" cy="445" r="5"/><circle cx="525" cy="445" r="5"/></g>
                    <g class="expedition__belt-left"><path d="M80 480 L325 385" stroke="#75608f" stroke-width="22"/><path d="M80 480 L325 385" stroke="#d4c8e1" stroke-width="2"/></g>
                    <g class="expedition__belt-right"><path d="M620 480 L375 385" stroke="#75608f" stroke-width="22"/><path d="M620 480 L375 385" stroke="#d4c8e1" stroke-width="2"/></g>
                    <rect class="expedition__buckle" x="324" y="375" width="52" height="30" rx="7" fill="#d4c8e1" stroke="#38bdf8"/>
                  </g>
                  <g class="expedition__fork" transform="translate(110 330)" fill="none" stroke="#0c4566" stroke-width="3" stroke-linecap="round">
                    <path d="M0 80 V30 Q0 0-55-10 M0 30 Q0 0 55-10" opacity=".35"/>
                    <path class="expedition__chosen" d="M0 80 V30 Q0 0-55-10" stroke="#0ea5e9" stroke-width="5"/>
                    <g class="expedition__sign"><path d="M0 25 V-55"/><path d="M-55-47 H-4 V-20 H-55 L-68-34Z M4-47 H55 L68-34 L55-20 H4Z" fill="#edf5fa"/><text x="-35" y="-29" stroke="none">if</text><text x="34" y="-29" stroke="none">else</text></g>
                    <path d="M75 60 C150 100 160-10 105 0 C50 10 95 60 145 40" stroke="#0ea5e9" stroke-dasharray="4 7"/>
                    <g class="expedition__loop-hiker"><circle r="7" fill="#0c4566"/><path d="M0 8 V23 M-10 15 L0 10 L10 15 M0 23 L-8 35 M0 23 L8 35"/></g>
                  </g>
                  <g class="expedition__cleanup" transform="translate(110 320)">
                    <g class="expedition__debris"><path d="M-58-27 L-32-38 L-8-19 L-18 12 L-52 15 L-67-4Z"/><text x="-38" y="-6">NaN</text><path d="M14-55 L50-58 L67-37 L55-10 L23-12 L5-34Z"/><text x="37" y="-30">"twelve"</text><path d="M-8 25 L43 18 L65 40 L40 64 L-7 55Z"/><text x="27" y="43">row × 2</text></g>
                    <path class="expedition__laser" d="M-95 95 L40-35 M-95 95 L-38-8 M-95 95 L27 43" fill="none" stroke="#38bdf8" stroke-width="3"/>
                    <g class="expedition__grid"><rect x="-55" y="-40" width="125" height="96" rx="8"/><path d="M-55-8 H70 M-55 24 H70 M-12-40 V56 M28-40 V56"/><text x="-32" y="-18">12</text><text x="8" y="14">✓</text><text x="48" y="46">1</text></g>
                  </g>
                  <g class="expedition__docking" transform="translate(350 345)">
                    <g class="expedition__ship-left"><path d="M-180-32 H-40 L-20 0 L-40 32 H-180 L-205 0Z"/><text x="-110" y="-5">Table A</text><text x="-110" y="18">id: 42</text><path d="M-22 0 H0"/></g>
                    <g class="expedition__ship-right"><path d="M180-32 H40 L20 0 L40 32 H180 L205 0Z"/><text x="110" y="-5">Table B</text><text x="110" y="18">id: 42</text><path d="M22 0 H0"/></g>
                    <g class="expedition__dock-lock"><circle r="15"/><path d="M-7 0 L-1 6 L9-7" fill="none" stroke="#38bdf8" stroke-width="3"/></g>
                  </g>
                  <g class="expedition__summit" transform="translate(550 335)" stroke="#0c4566" stroke-width="3" fill="none">
                    <path d="M-75 85 L0-50 L75 85" fill="#d6effc"/><path d="M-20-14 L0-50 L20-14 L0-23Z" fill="#fff"/>
                    <g class="expedition__flag"><path d="M7-15 V-110"/><path class="expedition__flag-cloth" d="M7-110 H105 L85-91 L105-72 H7Z" fill="#0ea5e9"/><text class="expedition__flag-copy" x="51" y="-85" stroke="none" fill="#fff">Capstone</text></g>
                    <g class="expedition__hiker"><circle cx="-25" cy="-13" r="9" fill="#0c4566"/><path d="M-25-3 V26 M-25 3 L5-12 M-25 26 L-40 52 M-25 26 L-10 52"/></g>
                  </g>
                  <g class="expedition__snow" fill="#fff">${snow}</g>
                  <g class="expedition__landing" transform="translate(350 285)">
                    <path d="M-200 84 Q0 38 200 84" fill="#75608f" stroke="#d4c8e1" stroke-width="2"/>
                    <g class="expedition__lander" fill="url(#mission-hull)" stroke="#4d365f" stroke-width="3"><path d="M-37-50 L-22-80 H22 L37-50 V0 H-37Z"/><path d="M-35-10 L-65 62 H-80 M35-10 L65 62 H80" fill="none"/><rect x="-17" y="-55" width="34" height="26" rx="6" fill="url(#mission-glass)"/></g>
                    <g class="expedition__dust" fill="#d4c8e1"><ellipse cx="-60" cy="70" rx="45" ry="10"/><ellipse cx="60" cy="70" rx="45" ry="10"/></g>
                    <g class="expedition__footprint" fill="#21162f"><ellipse cx="100" cy="86" rx="9" ry="16" transform="rotate(25 100 86)"/><circle cx="112" cy="70" r="4"/></g>
                  </g>
                </svg>
                <div class="expedition__countdown"><span data-launch-count>3</span><small data-launch-label>Strap in. Next stop: the moon.</small></div>
                <div class="expedition__hud"><span>Foundations complete <b data-mission-units>0 / 10</b></span><span>Fuel · progress <b data-mission-fuel>0%</b></span><i><i data-mission-meter></i></i><small class="expedition__certificate">One small step. Your certificate awaits.</small></div>
              </div>`;
}
