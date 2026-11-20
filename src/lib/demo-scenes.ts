/**
 * Original, simple illustrations used by demo mode (no third-party photos). Locations and dates are
 * fictional-but-consistent: they describe the *illustrated* place, not any real person's memory.
 */
export type DemoScene = {
  svg: string;
  lat: number;
  lng: number;
  month: number;
  year: number;
  cropCenterX: number;
  cropCenterY: number;
  title: { he: string; en: string };
  story: { he: string; en: string };
};

const W = 1600;
const H = 1067;
const wrap = (body: string, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${body}</svg>`;
const grad = (id: string, stops: [number, string][], vertical = true) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;

function beach(): string {
  const waves = Array.from({ length: 9 }, (_, i) => `<path d="M0 ${620 + i * 38} q 100 -${14 + i} 200 0 t 200 0 t 200 0 t 200 0 t 200 0 t 200 0 t 200 0 t 200 0 v 12 h-1600z" fill="#1f5c8b" opacity="${0.16 + i * 0.04}"/>`).join('');
  return wrap(
    `<rect width="${W}" height="${H}" fill="url(#sky)"/>
     <circle cx="470" cy="560" r="150" fill="#ffd27a" opacity=".35"/><circle cx="470" cy="560" r="95" fill="#fff1b8"/>
     <rect y="600" width="${W}" height="260" fill="url(#sea)"/>${waves}
     <path d="M0 860 Q400 800 800 850 T1600 830 V1067 H0z" fill="#f2d8a7"/><path d="M0 930 Q500 880 900 930 T1600 910 V1067 H0z" fill="#e8c88f"/>
     <g transform="translate(1090 585)"><path d="M0 60 L170 60 L140 105 L30 105z" fill="#b8333d"/><path d="M85 55 V-120 L165 50z" fill="#fffaf0"/><path d="M78 55 V-90 L10 50z" fill="#f5d6c6"/><rect x="82" y="-130" width="5" height="190" fill="#5b3a29"/></g>
     <g transform="translate(250 560)"><path d="M0 330 Q40 150 20 0" stroke="#5b3a29" stroke-width="22" fill="none" stroke-linecap="round"/>
       ${[-130, -70, -15, 40, 100].map((a) => `<path d="M20 0 q ${a} -70 ${a * 1.5} 30 q -${a * 0.6} -40 -${a * 1.5} -30z" fill="#2f7d4f"/>`).join('')}</g>
     <g fill="#fff" opacity=".8"><path d="M900 140 q40 -40 90 -10 q40 -30 80 10z"/><path d="M1260 230 q30 -30 70 -5 q30 -20 60 5z"/></g>`,
    grad('sky', [[0, '#3b4f8f'], [0.45, '#e0728a'], [0.75, '#ffb36b'], [1, '#ffe2a0']]) + grad('sea', [[0, '#f09a7b'], [1, '#1c4a78']]),
  );
}

function cabin(): string {
  const pines = [80, 240, 1180, 1340, 1500]
    .map((x, i) => `<g transform="translate(${x} ${700 + (i % 2) * 30}) scale(${1 + (i % 3) * 0.15})"><rect x="-8" y="140" width="16" height="50" fill="#4a3426"/>${[0, 40, 80].map((y, k) => `<path d="M0 ${y - 30} L${60 - k * 8} ${y + 70} H-${60 - k * 8}z" fill="#1f4a3a"/><path d="M0 ${y - 30} L${22 - k * 3} ${y + 5} H-${22 - k * 3}z" fill="#f4f8fb"/>`).join('')}</g>`)
    .join('');
  return wrap(
    `<rect width="${W}" height="${H}" fill="url(#sky)"/>
     <path d="M0 640 L260 300 L420 480 L640 190 L900 520 L1120 330 L1360 560 L1600 400 V1067 H0z" fill="#8fa3bf"/>
     <path d="M640 190 L560 300 L610 280 L650 330 L700 290 L760 330z" fill="#fff"/><path d="M260 300 L205 375 L250 360 L290 395 L330 350z" fill="#fff"/><path d="M1120 330 L1060 410 L1110 395 L1150 430 L1195 385z" fill="#fff"/>
     <path d="M0 760 Q400 680 800 740 T1600 720 V1067 H0z" fill="#f4f8fb"/><path d="M0 880 Q500 820 900 880 T1600 860 V1067 H0z" fill="#e3ecf4"/>
     ${pines}
     <g transform="translate(420 600)"><rect x="0" y="80" width="330" height="200" fill="#8a5a3b"/>${[0, 1, 2, 3, 4].map((i) => `<rect x="0" y="${95 + i * 38}" width="330" height="3" fill="#6c4329"/>`).join('')}
       <path d="M-30 90 L165 -20 L360 90z" fill="#5b3a29"/><path d="M-30 90 L165 -20 L360 90 L340 90 L165 0 L-10 90z" fill="#f4f8fb"/>
       <rect x="210" y="130" width="80" height="80" fill="#ffd36e" stroke="#3b2418" stroke-width="8"/><path d="M250 130 V210 M210 170 H290" stroke="#3b2418" stroke-width="5"/>
       <rect x="40" y="170" width="70" height="110" fill="#4a2f1f"/><rect x="250" y="-10" width="36" height="70" fill="#5a5a5a"/></g>
     <g fill="#fff" opacity=".9">${Array.from({ length: 40 }, (_, i) => `<circle cx="${(i * 193) % 1600}" cy="${(i * 97) % 700}" r="${2 + (i % 3)}"/>`).join('')}</g>`,
    grad('sky', [[0, '#9ec3e8'], [1, '#e8f1f9']]),
  );
}

function tower(): string {
  const bld = Array.from({ length: 16 }, (_, i) => {
    const w = 80 + ((i * 37) % 60);
    const h = 180 + ((i * 71) % 260);
    const x = i * 105 - 20;
    const wins = Array.from({ length: 8 }, (_, k) => `<rect x="${x + 14 + (k % 3) * 24}" y="${1067 - h + 20 + Math.floor(k / 3) * 36}" width="12" height="18" fill="${(i + k) % 3 ? '#ffd98a' : '#3a3f63'}"/>`).join('');
    return `<rect x="${x}" y="${1067 - h}" width="${w}" height="${h}" fill="#2a2f55"/>${wins}`;
  }).join('');
  return wrap(
    `<rect width="${W}" height="${H}" fill="url(#sky)"/>
     <circle cx="1250" cy="200" r="60" fill="#fff6d8"/>
     ${bld}
     <g transform="translate(800 150)" fill="#1c1d38"><path d="M0 0 L12 120 L-12 120z"/><path d="M-12 120 L12 120 L40 380 L-40 380z"/><path d="M-60 380 H60 L120 760 H90 Q0 660 -90 760 H-120z"/>
       <rect x="-72" y="370" width="144" height="16"/><rect x="-26" y="115" width="52" height="10"/></g>
     <g transform="translate(800 150)" stroke="#ffd98a" stroke-width="3" opacity=".7"><path d="M-8 130 L-30 370 M8 130 L30 370"/></g>
     <rect y="1010" width="${W}" height="57" fill="#14152b"/>`,
    grad('sky', [[0, '#1b2250'], [0.6, '#6a4f8f'], [1, '#f2a176']]),
  );
}

function desert(): string {
  return wrap(
    `<rect width="${W}" height="${H}" fill="url(#sky)"/>
     <circle cx="1220" cy="220" r="90" fill="#fff3d6"/><circle cx="1250" cy="205" r="82" fill="#f7c78a" opacity=".5"/>
     <path d="M0 640 Q300 520 620 640 T1250 600 T1600 650 V1067 H0z" fill="#e2a45f"/>
     <path d="M0 760 Q400 640 900 760 T1600 720 V1067 H0z" fill="#d18c4b"/>
     <path d="M0 900 Q500 820 1000 900 T1600 880 V1067 H0z" fill="#b97639"/>
     <g transform="translate(360 640)" fill="#3b2418">
       ${[0, 260, 480].map((dx, k) => `<g transform="translate(${dx} ${k * 6}) scale(${1 - k * 0.12})"><path d="M0 70 Q-10 20 30 25 Q40 -30 70 -50 L78 -45 Q60 -10 80 20 L190 20 Q230 25 230 70 L226 140 H210 L206 90 H70 L66 140 H50 L48 90z"/><ellipse cx="120" cy="10" rx="40" ry="34"/><ellipse cx="170" cy="8" rx="30" ry="30"/><path d="M60 -50 q-22 -8 -28 8" stroke="#3b2418" stroke-width="10" fill="none"/></g>`).join('')}
     </g>
     <g fill="#fff" opacity=".8">${Array.from({ length: 60 }, (_, i) => `<circle cx="${(i * 271) % 1600}" cy="${(i * 53) % 380}" r="${1 + (i % 2)}"/>`).join('')}</g>`,
    grad('sky', [[0, '#2b2152'], [0.5, '#c4577a'], [1, '#f9b97a']]),
  );
}

function kyoto(): string {
  const blossoms = Array.from({ length: 140 }, (_, i) => `<circle cx="${(i * 389) % 1600}" cy="${(i * 113) % 520}" r="${14 + (i % 5) * 7}" fill="${['#f7c6d4', '#f2a9c0', '#fbdde6'][i % 3]}" opacity=".85"/>`).join('');
  const petals = Array.from({ length: 50 }, (_, i) => `<ellipse cx="${(i * 211) % 1600}" cy="${600 + ((i * 89) % 440)}" rx="8" ry="5" fill="#f7c6d4" transform="rotate(${i * 23} ${(i * 211) % 1600} ${600 + ((i * 89) % 440)})"/>`).join('');
  return wrap(
    `<rect width="${W}" height="${H}" fill="url(#sky)"/>
     <path d="M0 520 L300 360 L560 500 L860 340 L1200 520 L1600 380 V1067 H0z" fill="#b9c8b4" opacity=".7"/>
     ${blossoms}
     <rect y="860" width="${W}" height="207" fill="#c9b9a2"/><path d="M0 860 H1600" stroke="#a89880" stroke-width="6"/>
     ${Array.from({ length: 12 }, (_, i) => `<path d="M${i * 140} 1067 L${i * 140 + 260} 860" stroke="#b5a58c" stroke-width="3"/>`).join('')}
     <g transform="translate(500 330)"><rect x="40" y="130" width="60" height="460" fill="#c8312a"/><rect x="500" y="130" width="60" height="460" fill="#c8312a"/>
       <path d="M-50 70 Q300 120 650 70 L630 130 Q300 170 -30 130z" fill="#1f1a1a"/><path d="M-30 130 Q300 170 630 130 L620 175 Q300 215 -20 175z" fill="#c8312a"/>
       <rect x="40" y="230" width="520" height="40" fill="#c8312a"/><rect x="40" y="230" width="520" height="8" fill="#a82822"/></g>
     ${petals}`,
    grad('sky', [[0, '#d8e8f5'], [1, '#fdf0f3']]),
  );
}

function harbor(): string {
  const colors = ['#e4572e', '#f3a712', '#29b6a8', '#e0a1c0', '#5b8def', '#9bc53d', '#f28b6f'];
  const houses = colors
    .map((c, i) => {
      const x = i * 230 - 30;
      const h = 260 + ((i * 53) % 90);
      return `<g><rect x="${x}" y="${600 - h}" width="215" height="${h}" fill="${c}"/><path d="M${x - 8} ${600 - h} L${x + 107} ${600 - h - 70} L${x + 223} ${600 - h}z" fill="#3a3a4a"/>
      ${Array.from({ length: 6 }, (_, k) => `<rect x="${x + 28 + (k % 2) * 100}" y="${600 - h + 34 + Math.floor(k / 2) * 74}" width="48" height="50" fill="#fff8e7" stroke="#2f2f3a" stroke-width="4"/>`).join('')}</g>`;
    })
    .join('');
  return wrap(
    `<rect width="${W}" height="${H}" fill="url(#sky)"/>${houses}
     <rect y="600" width="${W}" height="467" fill="url(#water)"/>
     <rect y="590" width="${W}" height="28" fill="#8c7a63"/>
     <g opacity=".35">${colors.map((c, i) => `<rect x="${i * 230 - 30}" y="640" width="215" height="170" fill="${c}"/>`).join('')}</g>
     <g transform="translate(1000 800)"><path d="M0 40 H300 L260 110 H40z" fill="#f2c230"/><rect x="40" y="108" width="220" height="14" fill="#3b2f1e"/><rect x="140" y="-80" width="8" height="120" fill="#3b2f1e"/><path d="M148 -76 L148 30 L240 30z" fill="#fff"/></g>
     <g transform="translate(180 840)"><path d="M0 30 H220 L190 80 H30z" fill="#2f6fb3"/><rect x="100" y="-50" width="6" height="80" fill="#3b2f1e"/></g>
     ${Array.from({ length: 14 }, (_, i) => `<path d="M${(i * 131) % 1600} ${660 + ((i * 59) % 380)} h90" stroke="#fff" stroke-width="3" opacity=".25"/>`).join('')}`,
    grad('sky', [[0, '#8ec5f0'], [1, '#e8f4fb']]) + grad('water', [[0, '#2f6e9e'], [1, '#17426a']]),
  );
}

export const DEMO_SCENES: DemoScene[] = [
  { svg: beach(), lat: 32.08, lng: 34.77, month: 8, year: 2022, cropCenterX: 0.72, cropCenterY: 0.62, title: { he: 'שקיעה בחוף', en: 'Sunset at the beach' }, story: { he: 'הפלגה קטנה בסוף הקיץ — והשקיעה הכי יפה של השנה.', en: 'A little sail at the end of summer — and the best sunset of the year.' } },
  { svg: cabin(), lat: 46.02, lng: 7.75, month: 1, year: 2021, cropCenterX: 0.33, cropCenterY: 0.72, title: { he: 'הבקתה בהרים', en: 'The cabin in the mountains' }, story: { he: 'שלג עד הברכיים, שוקו חם, ואף אחד לא רצה לחזור הביתה.', en: 'Knee-deep snow, hot chocolate, and nobody wanted to go home.' } },
  { svg: tower(), lat: 48.86, lng: 2.29, month: 5, year: 2019, cropCenterX: 0.5, cropCenterY: 0.4, title: { he: 'הערב הראשון בעיר', en: 'First evening in the city' }, story: { he: 'הלכנו שעות בלי מפה, ואז הופיע המגדל בין הבניינים.', en: 'We wandered for hours without a map, then the tower appeared between the buildings.' } },
  { svg: desert(), lat: 29.57, lng: 35.42, month: 10, year: 2023, cropCenterX: 0.28, cropCenterY: 0.7, title: { he: 'שיירה במדבר', en: 'Caravan in the desert' }, story: { he: 'הלילה הכי כוכבי שראינו — והגמלים התעקשו לצלם איתנו.', en: 'The starriest night we ever saw — and the camels insisted on posing.' } },
  { svg: kyoto(), lat: 35.01, lng: 135.77, month: 4, year: 2024, cropCenterX: 0.5, cropCenterY: 0.58, title: { he: 'פריחת הדובדבן', en: 'Cherry blossom season' }, story: { he: 'שער אדום, עלי כותרת בכל מקום, ותה ירוק בסוף היום.', en: 'A red gate, petals everywhere, and green tea at the end of the day.' } },
  { svg: harbor(), lat: 55.68, lng: 12.59, month: 7, year: 2020, cropCenterX: 0.74, cropCenterY: 0.78, title: { he: 'הנמל הצבעוני', en: 'The colourful harbour' }, story: { he: 'ישבנו על קצה המזח עם גלידה והסתכלנו על הסירות.', en: 'We sat at the end of the pier with ice cream, watching the boats.' } },
];
