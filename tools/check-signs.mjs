/* Checks that every Wikimedia Commons file named in js/roadsigns.js still exists.
 *
 *   node tools/check-signs.mjs           verify the files the game references
 *   node tools/check-signs.mjs "search"  search Commons for a replacement
 *
 * Signs fall back to a drawn SVG when an image fails, so a miss here is not
 * fatal; it just means that sign shows the drawn version instead. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://commons.wikimedia.org/w/api.php';

function load(file, exported) {
  const source = readFileSync(join(root, 'js', file), 'utf8');
  return new Function(source + '\nreturn ' + exported + ';')();
}

async function api(params) {
  const url = API + '?' + new URLSearchParams({ format: 'json', origin: '*', ...params });
  const response = await fetch(url, { headers: { 'user-agent': 'geo-trainer-sign-check/1.0' } });
  if (!response.ok) throw new Error(url + ' -> ' + response.status);
  return response.json();
}

/** Commons resolves up to 50 titles per request. */
async function exists(titles) {
  const found = new Set();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const data = await api({ action: 'query', prop: 'imageinfo', titles: batch.map((t) => 'File:' + t).join('|') });
    const pages = (data.query && data.query.pages) || {};
    Object.values(pages).forEach((page) => {
      if (!('missing' in page) && page.imagerepository !== '') found.add(page.title.replace(/^File:/, ''));
    });
  }
  return found;
}

async function search(term) {
  const data = await api({
    action: 'query',
    list: 'search',
    srsearch: 'filetype:bitmap|drawing ' + term,
    srnamespace: '6',
    srlimit: '12',
  });
  return ((data.query && data.query.search) || []).map((hit) => hit.title.replace(/^File:/, ''));
}

const term = process.argv.slice(2).join(' ');
if (term) {
  const hits = await search(term);
  console.log('Commons matches for "' + term + '"');
  hits.forEach((hit) => console.log('  ' + hit));
  process.exit(0);
}

const SIGNS = load('roadsigns.js', 'SIGNS');
const named = SIGNS.filter((sign) => sign.image);
const found = await exists(named.map((sign) => sign.image));
const missing = named.filter((sign) => !found.has(sign.image.replace(/_/g, ' ')) && !found.has(sign.image));

console.log('signs        ' + SIGNS.length);
console.log('with images  ' + named.length);
console.log('resolved     ' + (named.length - missing.length));

if (missing.length) {
  console.log('\nMISSING ON COMMONS (these will show the drawn fallback)');
  missing.forEach((sign) => console.log('  ' + sign.id + '  ' + sign.image));
  process.exitCode = 1;
} else {
  console.log('\nevery referenced image resolves');
}
