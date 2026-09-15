/* Flat-color lunar hero. Rebuild with node scripts/build-moon.mjs.
   Craters, route stops and satellite remain editable vector geometry. */
import fs from 'node:fs';

const route = 'M188 180 C211 162 242 146 265 152 S325 148 346 165 S408 190 394 222 S344 239 318 244 S260 247 241 260 S165 274 176 298 S178 351 208 363 S262 393 291 387 S349 378 370 353';
const stops = [[188,180],[265,152],[346,165],[394,222],[318,244],[241,260],[176,298],[208,363],[291,387],[370,353]];
const craters = [[201,227,25,.78,-20],[319,198,17,.9,15],[352,302,33,.78,-18],[247,323,15,.85,0],[299,444,28,.53,5],[142,247,13,.7,50],[393,146,15,.64,40],[413,386,20,.65,-40],[459,263,27,.61,75],[232,117,11,.52,-25]];
function crater([x,y,r,sy,angle]) {
  return `<g transform="translate(${x} ${y}) rotate(${angle}) scale(1 ${sy})">
      <circle r="${r+3}" fill="#c8bbda"/>
      <circle cy="2" r="${r}" fill="#88729f"/>
      <path d="M${-r} 2 A${r} ${r} 0 0 1 ${r} 2 A${r} ${r*.7} 0 0 0 ${-r} 2" fill="#68527f"/>
      <path d="M${-r*.76} ${r*.55} Q0 ${r*1.2} ${r*.76} ${r*.55}" stroke="#e8e0ef" stroke-width="2.5" stroke-linecap="round"/>
    </g>`;
}
function stop([x,y],i) {
  const final = i===9;
  return `<g transform="translate(${x} ${y})">
      ${final?'<circle r="23" fill="#f9a620" fill-opacity=".14"/><circle r="22" stroke="#f9a620" stroke-width="1"/>':''}
      <circle cy="3" r="12" fill="#24182f"/>
      <circle r="12" fill="${final?'#f9a620':'#3a2853'}" stroke="${final?'#fff0cb':'#f9a620'}" stroke-width="2"/>
      <text y="4" text-anchor="middle" fill="${final?'#24182f':'#fff4dc'}" font-family="system-ui, sans-serif" font-size="10.5" font-weight="700">${i+11}</text>
    </g>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="none">
  <title>Lunar expedition: Python for Data, stops 11 through 20</title>
  <defs><clipPath id="moon-disc"><circle cx="310" cy="300" r="207"/></clipPath></defs>
  <!-- Broken orbital track, behind the lunar body. -->
  <ellipse cx="310" cy="310" rx="279" ry="89" transform="rotate(-29 310 310)" stroke="#a490c2" stroke-width="1.2" stroke-dasharray="3 9" opacity=".55"/>
  <g fill="#a490c2">
    <circle cx="137" cy="105" r="2"/><circle cx="525" cy="305" r="2"/><circle cx="94" cy="375" r="2.5"/><circle cx="427" cy="517" r="2"/><circle cx="349" cy="63" r="1.5"/><circle cx="187" cy="494" r="1.5"/>
  </g>
  <g stroke="#a490c2" stroke-width="1.5" stroke-linecap="round">
    <path d="M94 191 h12 m-6 -6 v12 M455 80 h10 m-5 -5 v10 M500 445 h14 m-7 -7 v14"/>
  </g>
  <path d="M89 443 l3 -8 3 8 8 3 -8 3 -3 8 -3 -8 -8 -3Z" fill="#f9a620"/>
  <!-- Solid facets and a distinct night side give depth without gradients. -->
  <circle cx="310" cy="306" r="209" fill="#30213f"/>
  <circle cx="310" cy="300" r="207" fill="#75608f"/>
  <g clip-path="url(#moon-disc)">
    <path d="M310 93 C416 142 455 225 425 330 C402 414 335 473 244 499 L96 459 L72 267 L150 114Z" fill="#b6a5cb"/>
    <path d="M312 93 C247 95 159 126 126 201 L171 198 L198 147 L262 135 L322 158 L354 130Z" fill="#d4c8e1"/>
    <path d="M103 288 L145 275 L156 318 L187 346 L185 397 L237 416 L266 501 L160 487 L102 385Z" fill="#a08bb9"/>
    <path d="M281 99 L338 117 L355 165 L401 195 L415 258 L380 278 L397 315 L365 368 L346 420 L277 470 L276 500 C378 488 456 406 462 306 C466 204 408 123 310 93Z" fill="#9d87b7"/>
    <path d="M392 110 C471 237 461 389 316 508 C462 509 533 398 521 272 C511 199 461 137 392 110Z" fill="#4d365f"/>
    <path d="M460 167 L492 222 L503 290 L491 337 L470 324 L483 252Z" fill="#634a76"/>
    ${craters.map(crater).join('\n    ')}
    <g fill="#8b74a3" opacity=".8">
      <circle cx="218" cy="280" r="3"/><circle cx="224" cy="291" r="2"/><circle cx="213" cy="294" r="1.5"/>
      <circle cx="288" cy="344" r="3"/><circle cx="300" cy="337" r="1.5"/><circle cx="289" cy="330" r="2"/>
      <circle cx="374" cy="256" r="2"/><circle cx="378" cy="270" r="3"/><circle cx="437" cy="216" r="2"/>
    </g>
  </g>
  <!-- Expedition route is a flat gold ribbon with a solid offset shadow. -->
  <path d="${route}" transform="translate(0 3)" stroke="#4d365f" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${route}" stroke="#f9a620" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${route}" stroke="#fff0cb" stroke-width="1.4" stroke-dasharray="1 10" stroke-linecap="round"/>
  ${stops.map(stop).join('\n  ')}
  <!-- Mission flag and a small satellite, separate from the lesson marks. -->
  <g stroke-linejoin="round"><path d="M370 330 V301 L396 309 L370 318" fill="#f9a620" stroke="#3a2853" stroke-width="2"/><path d="M373 304 L387 309 L373 313Z" fill="#ffe5ac"/></g>
  <g transform="translate(504 138) rotate(28)">
    <path d="M-36 -11 h23 v24 h-23Z M13 -11 h23 v24 h-23Z" fill="#5b3f8f" stroke="#a490c2" stroke-width="1.5"/>
    <path d="M-28 -11 v24 M-20 -11 v24 M21 -11 v24 M29 -11 v24 M-36 1 h23 M13 1 h23" stroke="#a490c2" stroke-width="1"/>
    <path d="M-13 1 H13 M0 -13 V-23" stroke="#f9a620" stroke-width="3"/>
    <rect x="-9" y="-13" width="18" height="28" rx="4" fill="#e6def0" stroke="#4d365f" stroke-width="2"/>
    <path d="M-4 -8 h8 v9 h-8Z" fill="#f9a620"/><circle cy="8" r="2" fill="#5b3f8f"/>
    <path d="M-10 -25 Q0 -14 10 -25" stroke="#f9a620" stroke-width="2" stroke-linecap="round"/>
  </g>
  <g stroke="#a490c2" stroke-width="1" opacity=".55"><path d="M257 555 h30 m66 0 h30"/><circle cx="320" cy="555" r="3"/></g>
</svg>\n`;
fs.writeFileSync(new URL('../assets/img/data-moon.svg', import.meta.url), svg.replace(/ +$/gm, ''));
console.log('wrote assets/img/data-moon.svg');
