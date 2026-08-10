/* Regenerates js/worldmap.js from Natural Earth data.
 *
 *   node tools/build-map.mjs
 *
 * Run this only when the country list or the projection settings change; the
 * game itself never touches this script or the network for map data. */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ---------- settings ---------- */

const PX_PER_DEG = 30;
const LAT_TOP = 84;
const LAT_BOTTOM = -58;

/** Rings smaller than this (in px²) are dropped, unless a country has nothing else. */
const MIN_RING_AREA = 6;

/* Two levels of detail. Natural Earth carries far more precision than a map panel can
 * show, and redrawing all of it on every frame of a zoom is what makes the animation
 * stutter. SHAPE_TOLERANCE is the most the panel can resolve at full zoom, so it costs
 * nothing visible. BACKDROP_TOLERANCE is a much cheaper world outline, used while the
 * view is wide enough that the difference lands inside a single pixel. */
const SHAPE_TOLERANCE = 0.4;
const BACKDROP_TOLERANCE = 3;

/** Outlying rings further than this from the main landmass are left out of the zoom box. */
const CLUSTER_GAP = 30 * PX_PER_DEG;

const WIDTH = 360 * PX_PER_DEG;
const HEIGHT = (LAT_TOP - LAT_BOTTOM) * PX_PER_DEG;

const ATLAS_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json';
const ISO_URL = 'https://cdn.jsdelivr.net/npm/world-countries@5.1.0/countries.json';

/* Natural Earth stores -99 instead of a numeric ISO code for a handful of
 * countries, so those have to be matched by name. */
const NAME_ALIASES = {
  France: 'fr',
  Norway: 'no',
  Kosovo: 'xk',
};

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/* ---------- topojson ---------- */

function decodeArcs(topology) {
  const [sx, sy] = topology.transform.scale;
  const [tx, ty] = topology.transform.translate;
  return topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * sx + tx, y * sy + ty];
    });
  });
}

function ringPoints(indexes, arcs) {
  const points = [];
  for (const index of indexes) {
    const arc = index < 0 ? arcs[~index].slice().reverse() : arcs[index];
    for (let i = points.length ? 1 : 0; i < arc.length; i++) points.push(arc[i]);
  }
  return points;
}

function geometryRings(geometry, arcs) {
  if (geometry.type === 'Polygon') return geometry.arcs.map((ring) => ringPoints(ring, arcs));
  if (geometry.type === 'MultiPolygon') {
    return geometry.arcs.flatMap((polygon) => polygon.map((ring) => ringPoints(ring, arcs)));
  }
  return [];
}

/* ---------- projection ---------- */

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Runs longitudes continuously so a ring crossing the antimeridian stays in one piece. */
function unwrap(ring) {
  const out = [];
  let previous = null;
  for (const [lon, lat] of ring) {
    let value = lon;
    if (previous !== null) {
      while (value - previous > 180) value -= 360;
      while (previous - value > 180) value += 360;
    }
    previous = value;
    out.push([value, lat]);
  }
  return out;
}

function meanLon(ring) {
  let sum = 0;
  for (const [lon] of ring) sum += lon;
  return sum / ring.length;
}

function project(ring, shift) {
  const out = [];
  for (const [lon, lat] of ring) {
    const x = Math.round((lon + shift + 180) * PX_PER_DEG);
    const y = Math.round((LAT_TOP - clamp(lat, LAT_BOTTOM, LAT_TOP)) * PX_PER_DEG);
    const last = out[out.length - 1];
    if (!last || last[0] !== x || last[1] !== y) out.push([x, y]);
  }
  while (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) {
    out.pop();
  }
  return out;
}

/** Projects a country's rings, pulling outlying pieces to the side of the map its bulk sits on. */
function projectCountry(rings) {
  const unwrapped = rings.map(unwrap);
  const anchor = meanLon(unwrapped.reduce((a, b) => (a.length >= b.length ? a : b)));
  return unwrapped
    .map((ring) => project(ring, -360 * Math.round((meanLon(ring) - anchor) / 360)))
    .filter((ring) => ring.length >= 3);
}

/* ---------- simplification ---------- */

function segmentDistSq(point, start, end) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;
  if (dx || dy) {
    const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = end[0];
      y = end[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

/** Douglas-Peucker, kept iterative so a long coastline cannot overflow the stack. */
function simplifyRing(ring, tolerance) {
  if (ring.length <= 4) return ring;

  // A closed ring needs a second anchor opposite the first, or the whole loop
  // collapses onto the line between one point and itself.
  let far = 1;
  let farDist = -1;
  for (let i = 1; i < ring.length; i++) {
    const dx = ring[i][0] - ring[0][0];
    const dy = ring[i][1] - ring[0][1];
    const dist = dx * dx + dy * dy;
    if (dist > farDist) {
      farDist = dist;
      far = i;
    }
  }

  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[far] = 1;
  keep[ring.length - 1] = 1;

  const tolSq = tolerance * tolerance;
  const spans = [[0, far], [far, ring.length - 1]];
  while (spans.length) {
    const [first, last] = spans.pop();
    let index = -1;
    let worst = tolSq;
    for (let i = first + 1; i < last; i++) {
      const dist = segmentDistSq(ring[i], ring[first], ring[last]);
      if (dist > worst) {
        index = i;
        worst = dist;
      }
    }
    if (index === -1) continue;
    keep[index] = 1;
    spans.push([first, index], [index, last]);
  }

  const out = [];
  for (let i = 0; i < ring.length; i++) {
    if (keep[i]) out.push(ring[i]);
  }
  return out.length >= 3 ? out : ring;
}

function simplifyRings(rings, tolerance) {
  return rings.map((ring) => simplifyRing(ring, tolerance)).filter((ring) => ring.length >= 3);
}

function ringArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(sum) / 2;
}

function ringBox(ring) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

function boxGap(a, b) {
  const gapX = Math.max(b[0] - a[2], a[0] - b[2], 0);
  const gapY = Math.max(b[1] - a[3], a[1] - b[3], 0);
  return Math.max(gapX, gapY);
}

function mergeBox(a, b) {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/** Zoom box around the main landmass, ignoring far-flung territories. */
function primaryBox(rings) {
  const parts = rings
    .map((ring) => ({ area: ringArea(ring), box: ringBox(ring) }))
    .sort((a, b) => b.area - a.area);

  let box = parts[0].box;
  const used = new Set([0]);
  let grew = true;
  while (grew) {
    grew = false;
    parts.forEach((part, index) => {
      if (used.has(index) || boxGap(box, part.box) > CLUSTER_GAP) return;
      box = mergeBox(box, part.box);
      used.add(index);
      grew = true;
    });
  }
  return [box[0], box[1], box[2] - box[0], box[3] - box[1]];
}

/* ---------- path output ---------- */

function joinNumbers(numbers) {
  let out = '';
  for (const number of numbers) {
    const text = String(number);
    if (out && text[0] !== '-') out += ' ';
    out += text;
  }
  return out;
}

function pathFromRings(rings) {
  let out = '';
  for (const ring of rings) {
    let [x, y] = ring[0];
    const deltas = [];
    for (let i = 1; i < ring.length; i++) {
      deltas.push(ring[i][0] - x, ring[i][1] - y);
      x = ring[i][0];
      y = ring[i][1];
    }
    out += 'M' + joinNumbers([ring[0][0], ring[0][1]]) + 'l' + joinNumbers(deltas) + 'Z';
  }
  return out;
}

/* ---------- inputs ---------- */

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch ' + url + ': ' + response.status);
  return response.json();
}

function gameCountries() {
  const source = readFileSync(join(root, 'js', 'countries.js'), 'utf8');
  return new Function(source + '\nreturn COUNTRIES;')();
}

/* ---------- build ---------- */

const countries = gameCountries();
const wanted = new Map(countries.map((country) => [country.code, country.name]));

const [atlas, isoData] = await Promise.all([getJson(ATLAS_URL), getJson(ISO_URL)]);

const numericToCode = new Map();
const codeToLatLng = new Map();
for (const entry of isoData) {
  const code = String(entry.cca2).toLowerCase();
  if (entry.ccn3) numericToCode.set(String(entry.ccn3), code);
  if (Array.isArray(entry.latlng) && entry.latlng.length === 2) codeToLatLng.set(code, entry.latlng);
}

const arcs = decodeArcs(atlas);
const shapes = new Map();
const otherPaths = [];
const backdropPaths = [];

for (const geometry of atlas.objects.countries.geometries) {
  const name = geometry.properties && geometry.properties.name;
  const code = numericToCode.get(String(geometry.id)) || NAME_ALIASES[name];

  let rings = projectCountry(geometryRings(geometry, arcs));
  if (!rings.length) continue;

  const kept = rings.filter((ring) => ringArea(ring) >= MIN_RING_AREA);
  rings = kept.length ? kept : [rings.reduce((a, b) => (ringArea(a) >= ringArea(b) ? a : b))];

  const detailed = simplifyRings(rings, SHAPE_TOLERANCE);
  if (!detailed.length) continue;

  backdropPaths.push(pathFromRings(simplifyRings(rings, BACKDROP_TOLERANCE)));
  const d = pathFromRings(detailed);

  if (code && wanted.has(code)) {
    const existing = shapes.get(code);
    shapes.set(
      code,
      existing ? { d: existing.d + d, rings: existing.rings.concat(detailed) } : { d, rings: detailed }
    );
  } else {
    otherPaths.push(d);
  }
}

const mapCountries = {};
for (const [code] of [...shapes].sort(([a], [b]) => a.localeCompare(b))) {
  const shape = shapes.get(code);
  mapCountries[code] = { d: shape.d, box: primaryBox(shape.rings) };
}

const points = {};
const missing = [];
for (const [code, name] of [...wanted].sort(([a], [b]) => a.localeCompare(b))) {
  if (mapCountries[code]) continue;
  const latlng = codeToLatLng.get(code);
  if (!latlng) {
    missing.push(code + ' (' + name + ')');
    continue;
  }
  points[code] = [
    clamp(Math.round((latlng[1] + 180) * PX_PER_DEG), 0, WIDTH),
    Math.round((LAT_TOP - clamp(latlng[0], LAT_BOTTOM, LAT_TOP)) * PX_PER_DEG),
  ];
}

/* ---------- write ---------- */

const lines = [
  '/* Country outlines for the map panel, generated by tools/build-map.mjs.',
  ' * Do not edit by hand.',
  ' *',
  ' * Equirectangular projection at ' + PX_PER_DEG + 'px per degree, latitude clipped to',
  ' * ' + LAT_TOP + '..' + LAT_BOTTOM + '. Country boxes are [x, y, width, height] around the main',
  ' * landmass. Countries too small to draw at this scale get a point instead.',
  ' *',
  ' * Country shapes carry ' + SHAPE_TOLERANCE + 'px of detail, as much as the panel can resolve at',
  ' * full zoom. `land` is the same world at ' + BACKDROP_TOLERANCE + 'px, cheap enough to redraw on',
  ' * every frame of a zoom while the view is still wide.',
  ' *',
  ' * Source: Natural Earth 1:50m via world-atlas, public domain. */',
  '',
  'const WORLD_MAP = {',
  '  width: ' + WIDTH + ',',
  '  height: ' + HEIGHT + ',',
  '  countries: {',
];

for (const [code, shape] of Object.entries(mapCountries)) {
  lines.push("    " + code + ": { box: [" + shape.box.join(', ') + "], d: '" + shape.d + "' },");
}

lines.push('  },');
lines.push('  points: {');
for (const [code, point] of Object.entries(points)) {
  lines.push('    ' + code + ': [' + point.join(', ') + '],');
}
lines.push('  },');
lines.push("  other: '" + otherPaths.join('') + "',");
lines.push("  land: '" + backdropPaths.join('') + "',");
lines.push('};');
lines.push('');

const outPath = join(root, 'js', 'worldmap.js');
mkdirSync(dirname(outPath), { recursive: true });
const output = lines.join('\n');
writeFileSync(outPath, output, 'utf8');

console.log('viewBox      ' + WIDTH + ' x ' + HEIGHT);
console.log('shapes       ' + Object.keys(mapCountries).length + ' of ' + wanted.size + ' countries');
console.log('points       ' + Object.keys(points).length + ' (' + Object.keys(points).join(', ') + ')');
console.log('extras       ' + otherPaths.length + ' territories outside the country list');
console.log('detail       ' + SHAPE_TOLERANCE + 'px shapes, ' + BACKDROP_TOLERANCE + 'px backdrop');
console.log('backdrop     ' + Math.round(backdropPaths.join('').length / 1024) + ' KB');
console.log('output       ' + Math.round(output.length / 1024) + ' KB -> js/worldmap.js');
if (missing.length) console.log('UNMATCHED    ' + missing.join(', '));
