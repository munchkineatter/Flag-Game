/* Road signs, grouped by the design conventions that give a country away.
 *
 * Each entry is one sign design. `countries` is every country the game will
 * accept as an answer, and `contrast` is the pool the wrong answers come from:
 * countries whose own version of that sign looks clearly different. Keeping the
 * wrong answers on a list rather than picking them at random is what stops the
 * game asking something unanswerable, like offering both the United States and
 * Australia under a yellow diamond.
 *
 * `image` is a file on Wikimedia Commons, fetched through Special:FilePath so
 * the URL survives the file being re-uploaded. `art` is the drawn stand-in used
 * when that fetch fails; see js/signart.js. Run tools/check-signs.mjs to confirm
 * the filenames still resolve. */

const SIGNS = (function () {
  'use strict';

  /* The three warning-sign families. Which one a country belongs to is the
   * single most useful sign fact in GeoGuessr, so most entries lean on these. */

  const EUROPE_WHITE = [
    'de', 'fr', 'it', 'es', 'pt', 'nl', 'be', 'lu', 'at', 'ch', 'cz', 'sk', 'si',
    'hu', 'ro', 'bg', 'ee', 'lv', 'lt', 'dk', 'gb', 'tr', 'ua', 'ru', 'by', 'md', 'al', 'mt', 'cy',
  ];

  const AFRICA_WHITE = [
    'za', 'na', 'bw', 'zw', 'zm', 'mw', 'mz', 'ls', 'sz', 'ke', 'tz', 'ug',
    'ng', 'gh', 'eg', 'ma', 'dz', 'tn', 'sn', 'ci', 'cm', 'et',
  ];

  const ASIA_WHITE = ['in', 'pk', 'bd', 'lk', 'il', 'jo', 'sa', 'ae', 'qa', 'kw', 'om', 'bh'];

  const WHITE_TRIANGLE = EUROPE_WHITE.concat(AFRICA_WHITE, ASIA_WHITE);

  const YELLOW_TRIANGLE = ['se', 'fi', 'no', 'is', 'pl', 'gr', 'hr', 'ba', 'rs', 'me', 'mk'];

  const YELLOW_DIAMOND = [
    'us', 'ca', 'mx', 'au', 'nz', 'jp', 'ie', 'br', 'ar', 'cl', 'uy', 'py', 'bo',
    'pe', 'ec', 'co', 've', 'cr', 'pa', 'gt', 'hn', 'ni', 'sv', 'do', 'my', 'id', 'th', 'ph',
  ];

  const EUROPE_ALL = EUROPE_WHITE.concat(YELLOW_TRIANGLE);

  const ALTO = ['mx', 'gt', 'hn', 'sv', 'ni', 'cr'];
  const PARE = ['br', 'ar', 'uy', 'py', 'bo', 'pe', 'ec', 'co', 've', 'cl', 'pa'];
  const GULF = ['sa', 'ae', 'qa', 'kw', 'om', 'bh'];

  function without(list, drop) {
    return list.filter(function (code) {
      return drop.indexOf(code) === -1;
    });
  }

  /** Countries that leave the give-way triangle empty rather than writing on it. */
  const BLANK_YIELD = without(EUROPE_ALL, ['gb', 'mt', 'cy']).concat(AFRICA_WHITE);

  return [
    /* ---------- warning sign families ---------- */
    {
      id: 'warn-white-triangle',
      name: 'General warning',
      image: 'Zeichen 101 - Gefahrstelle, StVO 1970.svg',
      countries: WHITE_TRIANGLE,
      contrast: YELLOW_TRIANGLE.concat(YELLOW_DIAMOND),
      tells:
        'A red-bordered white triangle is the ordinary warning sign across most of Europe, and across Africa, the Middle East and South Asia with it. Yellow behind the triangle moves you to the Nordics, Poland or the western Balkans; a yellow diamond takes you out of that world entirely, or to Ireland.',
      art: { shape: 'triangle', fill: '#ffffff', border: '#d52b1e', text: '!' },
    },
    {
      id: 'warn-white-sadc',
      name: 'Animals ahead',
      image: 'SADC road sign W311.svg',
      countries: WHITE_TRIANGLE,
      contrast: YELLOW_TRIANGLE.concat(YELLOW_DIAMOND),
      tells:
        'Southern Africa uses the same white triangle as Europe, drawn to the shared SADC standard from South Africa up to Tanzania. The sign will not narrow the country down, but it does rule out the yellow-diamond half of the world.',
      art: { shape: 'triangle', fill: '#ffffff', border: '#d52b1e', text: '!' },
    },
    {
      id: 'warn-yellow-triangle',
      name: 'Bend ahead',
      image: 'Sweden road sign A1-1.svg',
      countries: YELLOW_TRIANGLE,
      contrast: WHITE_TRIANGLE.concat(YELLOW_DIAMOND),
      tells:
        'Yellow behind a red-bordered triangle means the Nordics, Poland, Greece or the western Balkans. Denmark is the odd one out up north: its warning signs are white like the rest of Europe.',
      art: { shape: 'triangle', fill: '#f5c518', border: '#d52b1e', glyph: 'bend' },
    },
    {
      id: 'warn-yellow-animals',
      name: 'Wild animals',
      image: 'Znak A-18b.svg',
      countries: YELLOW_TRIANGLE,
      contrast: WHITE_TRIANGLE.concat(YELLOW_DIAMOND),
      tells:
        'Another yellow triangle. Poland shares the yellow warning background with the Nordics and most of ex-Yugoslavia, while Czechia, Slovakia and Germany next door all use white.',
      art: { shape: 'triangle', fill: '#f5c518', border: '#d52b1e', text: '!' },
    },
    {
      id: 'warn-yellow-diamond',
      name: 'Bend ahead',
      image: 'MUTCD W1-1L.svg',
      countries: YELLOW_DIAMOND,
      contrast: WHITE_TRIANGLE.concat(YELLOW_TRIANGLE),
      tells:
        'Yellow diamonds cover the Americas, Australia, New Zealand, Japan and much of Southeast Asia. In Europe only Ireland uses them, which makes a diamond on a European-looking road a strong Ireland call.',
      art: { shape: 'diamond', fill: '#f5c518', border: '#111111', ring: 0.9, glyph: 'bend' },
    },
    {
      id: 'warn-diamond-ireland',
      name: 'Crossroads ahead',
      image: 'Ireland road sign W 001.svg',
      countries: ['ie'],
      contrast: without(EUROPE_ALL, ['ie']),
      tells:
        'Ireland is the only country in Europe that warns with yellow diamonds instead of triangles. Northern Ireland uses UK white triangles, so the diamond also tells you which side of that border you are on.',
      art: { shape: 'diamond', fill: '#f5c518', border: '#111111', ring: 0.9, glyph: 'cross' },
    },
    {
      id: 'warn-moose',
      name: 'Elk crossing',
      image: 'Finland road sign 155.svg',
      countries: ['fi', 'se', 'no'],
      contrast: without(WHITE_TRIANGLE, []).concat(['pl', 'gr', 'hr', 'rs']),
      tells:
        'An elk on a yellow triangle is Nordic. Estonia and Latvia have the same animals but draw them on white triangles, so the background colour is doing the work here.',
      art: { shape: 'triangle', fill: '#f5c518', border: '#d52b1e', text: '!' },
    },
    {
      id: 'warn-kangaroo',
      name: 'Kangaroos ahead',
      image: 'Australia road sign W5-29.svg',
      countries: ['au'],
      contrast: without(YELLOW_DIAMOND, ['au']),
      tells:
        'Kangaroo warnings are Australia only. New Zealand has no kangaroos, so this sign also settles the most common mix-up in the southern hemisphere.',
      art: { shape: 'diamond', fill: '#f5c518', border: '#111111', ring: 0.9, text: '!' },
    },

    /* ---------- what the stop sign says ---------- */
    {
      id: 'stop-alto',
      name: 'Stop',
      image: 'Mexico road sign SR-06.svg',
      countries: ALTO,
      contrast: PARE.concat(['us', 'ca', 'es', 'pt', 'gb']),
      tells:
        'ALTO is Mexico and most of Central America. Spanish-speaking South America writes PARE instead, so the word on the octagon splits the continent in two.',
      art: { shape: 'octagon', fill: '#c8102e', border: '#ffffff', ring: 0.88, ink: '#ffffff', text: 'ALTO' },
    },
    {
      id: 'stop-pare',
      name: 'Stop',
      image: 'Brasil R-1.svg',
      countries: PARE,
      contrast: ALTO.concat(['us', 'ca', 'es', 'pt', 'gb']),
      tells:
        'PARE covers Brazil and Spanish-speaking South America. Mexico and Central America use ALTO, and Portugal, despite the language, uses plain STOP.',
      art: { shape: 'octagon', fill: '#c8102e', border: '#ffffff', ring: 0.88, ink: '#ffffff', text: 'PARE' },
    },
    {
      id: 'stop-pare-chile',
      name: 'Stop',
      image: 'Chile road sign RPO-1.svg',
      countries: PARE,
      contrast: ALTO.concat(['us', 'ca', 'es', 'pt', 'gb']),
      tells:
        'Chile, Argentina, Colombia and the rest of Spanish-speaking South America all write PARE. Only Mexico and Central America say ALTO.',
      art: { shape: 'octagon', fill: '#c8102e', border: '#ffffff', ring: 0.88, ink: '#ffffff', text: 'PARE' },
    },
    {
      id: 'stop-japan',
      name: 'Stop',
      image: 'Japan road sign 330-A.svg',
      countries: ['jp'],
      contrast: ['kr', 'cn', 'tw', 'th', 'us', 'ca', 'au', 'nz', 'de', 'fr'],
      tells:
        'Japan is the one major country that does not use an octagon. Its stop sign is a red downward triangle reading 止まれ, so a triangle at a junction is an instant Japan call.',
      art: { shape: 'triangle-down', fill: '#c8102e', border: '#ffffff', ring: 0.86, ink: '#ffffff', text: '止まれ' },
    },
    {
      id: 'stop-israel',
      name: 'Stop',
      image: 'Israel road sign 302.svg',
      countries: ['il'],
      contrast: ['jo', 'eg', 'tr', 'gr', 'cy', 'sa', 'ae', 'it', 'es'],
      tells:
        'Israel puts a raised hand on the octagon instead of a word, which sidesteps having to write it in Hebrew, Arabic and English. No other country signs a stop that way.',
      art: { shape: 'octagon', fill: '#c8102e', border: '#ffffff', ring: 0.88, ink: '#ffffff', glyph: 'hand' },
    },
    {
      id: 'stop-arabic',
      name: 'Stop',
      image: 'Saudi Arabia - Road Sign - Stop.svg',
      countries: GULF,
      contrast: ['il', 'tr', 'ir', 'pk', 'in', 'eg', 'ma', 'gr', 'es'],
      tells:
        'The Gulf states stack Arabic قف over the English STOP on one octagon. Egypt and the Maghreb usually write only in Arabic and French, so the bilingual Arabic-English pairing points at the Gulf.',
      art: { shape: 'octagon', fill: '#c8102e', border: '#ffffff', ring: 0.88, ink: '#ffffff', text: 'قف\nSTOP' },
    },

    /* ---------- give way ---------- */
    {
      id: 'yield-blank',
      name: 'Give way',
      image: 'Zeichen 205.svg',
      countries: BLANK_YIELD,
      contrast: ['us', 'ca', 'gb', 'au', 'nz', 'ie', 'in'],
      tells:
        'Continental Europe leaves the give-way triangle empty and lets the shape speak, and most of Africa follows it. The English-speaking world writes it out instead: YIELD in North America, GIVE WAY in Britain and Australasia.',
      art: { shape: 'triangle-down', fill: '#ffffff', border: '#d52b1e', ring: 0.72 },
    },
    {
      id: 'yield-blank-kenya',
      name: 'Give way',
      image: 'Kenya road sign R02 1975-2009.svg',
      countries: BLANK_YIELD,
      contrast: ['us', 'ca', 'gb', 'au', 'nz', 'ie', 'in'],
      tells:
        'East Africa inherited the empty give-way triangle rather than the British lettered one, even though Kenya, Tanzania and Uganda all drive on the left.',
      art: { shape: 'triangle-down', fill: '#ffffff', border: '#d52b1e', ring: 0.72 },
    },
    {
      id: 'yield-word',
      name: 'Give way',
      image: 'MUTCD R1-2.svg',
      countries: ['us', 'ca'],
      contrast: ['au', 'nz', 'gb', 'ie', 'de', 'fr', 'es', 'mx', 'br'],
      tells:
        'YIELD is North American wording. Everywhere else that writes on the triangle says GIVE WAY, and continental Europe leaves it blank.',
      art: { shape: 'triangle-down', fill: '#ffffff', border: '#c8102e', ring: 0.72, text: 'YIELD' },
    },
    {
      id: 'yield-giveway',
      name: 'Give way',
      image: 'Australia road sign R1-2.svg',
      countries: ['au', 'nz', 'gb'],
      contrast: ['us', 'ca', 'mx', 'de', 'fr', 'es', 'it', 'br', 'jp'],
      tells:
        'GIVE WAY is British and Australasian. The United States and Canada say YIELD, and continental Europe writes nothing at all.',
      art: { shape: 'triangle-down', fill: '#ffffff', border: '#c8102e', ring: 0.72, text: 'GIVE\nWAY' },
    },

    /* ---------- speed limits ---------- */
    {
      id: 'speed-ring',
      name: 'Speed limit',
      image: 'Zeichen 274-50 - Zulässige Höchstgeschwindigkeit, StVO 2017.svg',
      countries: EUROPE_ALL.concat(AFRICA_WHITE, ASIA_WHITE, ['ie', 'jp', 'br', 'ar', 'mx', 'th', 'id']),
      contrast: ['us', 'ca', 'au', 'nz'],
      tells:
        'A number in a red ring is the world standard. The exceptions are worth memorising: the United States and Canada use black-on-white rectangles, and Australia and New Zealand put the ring on a white plate.',
      art: { shape: 'circle', fill: '#ffffff', border: '#d52b1e', text: '50' },
    },
    {
      id: 'speed-us',
      name: 'Speed limit',
      image: 'MUTCD R2-1.svg',
      countries: ['us'],
      contrast: ['ca', 'mx', 'au', 'nz', 'gb', 'ie', 'de', 'br'],
      tells:
        'Spelling out SPEED LIMIT in black on a white rectangle is the United States. Canada writes MAXIMUM, and almost everyone else uses a red ring.',
      art: { shape: 'rect-tall', fill: '#ffffff', border: '#111111', ring: 0.94, text: 'SPEED\nLIMIT\n55' },
    },
    {
      id: 'speed-canada',
      name: 'Speed limit',
      image: 'Ontario Rb-1.svg',
      countries: ['ca'],
      contrast: ['us', 'mx', 'au', 'nz', 'gb', 'ie', 'fr', 'br'],
      tells:
        'MAXIMUM on a white rectangle is Canada, and the numbers are km/h. The same rectangle reading SPEED LIMIT, in mph, is the United States.',
      art: { shape: 'rect-tall', fill: '#ffffff', border: '#111111', ring: 0.94, text: 'MAXIMUM\n50' },
    },
    {
      id: 'speed-plate',
      name: 'Speed limit',
      image: 'Australia road sign R4-1 (60).svg',
      countries: ['au', 'nz'],
      contrast: ['us', 'ca', 'gb', 'ie', 'de', 'fr', 'jp', 'za'],
      tells:
        'Australia and New Zealand keep the red ring but mount it on a white rectangular plate rather than a round sign. Europe uses the bare circle.',
      art: { shape: 'circle', fill: '#ffffff', border: '#d52b1e', plate: true, text: '60' },
    },

    /* ---------- signs that only exist in some places ---------- */
    {
      id: 'priority-road',
      name: 'Priority road',
      image: 'Zeichen 306 - Vorfahrtstraße, StVO 1970.svg',
      countries: without(EUROPE_ALL, ['gb', 'mt', 'cy']),
      contrast: ['us', 'ca', 'mx', 'au', 'nz', 'gb', 'ie', 'jp', 'br'],
      tells:
        'The yellow diamond priority-road sign is a European fixture and has no equivalent in Britain, Ireland or North America. Seeing one rules out a very large part of the world.',
      art: { shape: 'diamond', fill: '#f5c518', border: '#ffffff', ring: 0.72 },
    },
    {
      id: 'roundabout-blue',
      name: 'Roundabout',
      image: 'Zeichen 215 - Kreisverkehr, StVO 2000.svg',
      countries: without(EUROPE_ALL, ['gb']),
      contrast: ['us', 'ca', 'mx', 'au', 'nz', 'jp', 'br'],
      tells:
        'Europe orders you round a roundabout with a blue circle of arrows. North America warns about one with a yellow diamond instead, and never uses the blue mandatory circle.',
      art: { shape: 'circle', fill: '#003399', border: '#003399', ink: '#ffffff', text: '\u21bb' },
    },
    {
      id: 'crossing-blue',
      name: 'Pedestrian crossing',
      image: 'Vienna Convention road sign E12a-V1.svg',
      countries: EUROPE_ALL,
      contrast: ['us', 'ca', 'mx', 'au', 'nz'],
      tells:
        'Europe marks a crossing with a blue square and a walking figure. North America uses a yellow or fluorescent-green diamond, which is a warning rather than an instruction.',
      art: { shape: 'rect', fill: '#003399', border: '#003399', ink: '#ffffff', glyph: 'person' },
    },
    {
      id: 'crossing-diamond',
      name: 'Pedestrian crossing',
      image: 'MUTCD W11-2.svg',
      countries: ['us', 'ca', 'mx'],
      contrast: without(EUROPE_ALL, []).concat(['jp', 'au']),
      tells:
        'A walking figure on a yellow diamond is North American. Europe puts the same figure on a blue square, and Australia uses its own rectangular signs.',
      art: { shape: 'diamond', fill: '#f5c518', border: '#111111', ring: 0.9, glyph: 'person' },
    },
    {
      id: 'school-pentagon',
      name: 'School zone',
      image: 'MUTCD S1-1.svg',
      countries: ['us', 'ca'],
      contrast: ['gb', 'ie', 'au', 'nz', 'de', 'fr', 'es', 'mx', 'jp'],
      tells:
        'The five-sided school sign in fluorescent yellow-green is North America only. That shade of green appears on nothing else, so it is visible from a long way off.',
      art: { shape: 'pentagon', fill: '#c6ee2a', border: '#111111', ring: 0.92, glyph: 'person' },
    },
    {
      id: 'interstate-shield',
      name: 'Route marker',
      image: 'MUTCD M1-1.svg',
      countries: ['us'],
      contrast: ['ca', 'mx', 'au', 'nz', 'gb', 'ie', 'de', 'fr', 'br'],
      tells:
        'The red and blue shield is the US Interstate marker. Canada uses provincial shields of its own and Mexico numbers roads on plain white rectangles.',
      art: { shape: 'rect-tall', fill: '#003399', border: '#c8102e', ring: 0.78, ink: '#ffffff', text: '22' },
    },
    {
      id: 'us-route-shield',
      name: 'Route marker',
      image: 'MUTCD M1-4.svg',
      countries: ['us'],
      contrast: ['ca', 'mx', 'au', 'nz', 'gb', 'ie', 'de', 'fr', 'br'],
      tells:
        'The white escutcheon on a black square is the US Highway marker, the older cousin of the Interstate shield. Both are United States only.',
      art: { shape: 'rect-tall', fill: '#111111', border: '#111111', glyph: 'shield' },
    },
    {
      id: 'motorway-green',
      name: 'Motorway',
      image: 'Italian traffic signs - autostrada.svg',
      countries: ['it', 'ch'],
      contrast: ['fr', 'de', 'es', 'pt', 'at', 'be', 'nl', 'gb', 'pl'],
      tells:
        'Italy and Switzerland sign motorways in green and everything else in blue. France does the exact opposite, blue for autoroutes and green for trunk roads, which is the classic way to tell a French road from an Italian one.',
      art: { shape: 'rect', fill: '#0d7a3d', border: '#0d7a3d', ink: '#ffffff', glyph: 'motorway' },
    },
    {
      id: 'town-plate',
      name: 'Town name',
      image: 'France road sign EB10.svg',
      countries: ['fr'],
      contrast: ['es', 'it', 'de', 'be', 'ch', 'gb', 'pt', 'nl', 'pl'],
      tells:
        'France announces a town on a white plate with a red border. Germany uses yellow, Spain white with a blue strip, and Italy white with a black border, so the frame alone places you.',
      art: { shape: 'rect', fill: '#ffffff', border: '#d52b1e', ring: 0.84, text: 'DREUX' },
    },
    {
      id: 'police-morocco',
      name: 'Police checkpoint',
      image: 'MA road sign 325.2.svg',
      countries: ['ma'],
      contrast: ['dz', 'tn', 'eg', 'sn', 'es', 'fr', 'pt', 'tr', 'sa'],
      tells:
        'Morocco warns of a police checkpoint with a sign labelled in Arabic and French. Arabic alongside French, rather than alongside English, puts you in the Maghreb rather than the Gulf.',
      art: { shape: 'circle', fill: '#ffffff', border: '#d52b1e', ring: 0.8, text: 'POLICE' },
    },
  ];
})();
