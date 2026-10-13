/* Decorative mission scenery. The existing trail renderer owns every phase. */
export function expeditionScenes() {
  const stars = Array.from({ length: 32 }, (_, i) => `<circle cx="${(i * 137 + 29) % 700}" cy="${(i * 73 + 17) % 420}" r="${i % 5 === 0 ? 2 : 1}"/>`).join('');
  return `
              <div class="expedition" aria-hidden="true">
                <div class="expedition__sunset"></div><div class="expedition__night"></div>
                <svg class="expedition__art" viewBox="0 0 700 480" focusable="false">
                  <g class="expedition__stars" fill="#d4c8e1">${stars}</g>
                </svg>
              </div>`;
}
