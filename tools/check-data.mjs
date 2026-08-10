/* Consistency check for the hand-written data files.
 *
 *   node tools/check-data.mjs
 *
 * Verifies that every country code a language claims exists in js/countries.js,
 * that every confusable id resolves to a language, and that the outline game has
 * a usable shape for the countries it draws from. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function load(file, exported) {
  const source = readFileSync(join(root, 'js', file), 'utf8');
  return new Function(source + '\nreturn ' + exported + ';')();
}

const COUNTRIES = load('countries.js', 'COUNTRIES');
const LANGUAGES = load('languages.js', 'LANGUAGES');
const WORLD_MAP = load('worldmap.js', 'WORLD_MAP');

const codes = new Set(COUNTRIES.map((country) => country.code));
const ids = new Set(LANGUAGES.map((language) => language.id));
const problems = [];

const seen = new Set();
for (const language of LANGUAGES) {
  if (seen.has(language.id)) problems.push('duplicate language id: ' + language.id);
  seen.add(language.id);

  if (!language.name || !language.script || !language.tells) problems.push(language.id + ': missing a required field');
  if (!Array.isArray(language.samples) || language.samples.length < 3) {
    problems.push(language.id + ': needs at least three samples');
  }
  for (const code of language.countries) {
    if (!codes.has(code)) problems.push(language.id + ': unknown country code ' + code);
  }
  for (const other of language.confusable || []) {
    if (!ids.has(other)) problems.push(language.id + ': unknown confusable id ' + other);
    if (other === language.id) problems.push(language.id + ': listed as its own confusable');
  }
}

const shaped = COUNTRIES.filter((country) => {
  const shape = WORLD_MAP.countries[country.code];
  return shape && (shape.box[2] >= 20 || shape.box[3] >= 20);
});

const unmapped = COUNTRIES.filter(
  (country) => !WORLD_MAP.countries[country.code] && !WORLD_MAP.points[country.code]
);
for (const country of unmapped) problems.push('no map geometry for ' + country.name + ' (' + country.code + ')');

console.log('countries    ' + COUNTRIES.length);
console.log('languages    ' + LANGUAGES.length);
console.log('scripts      ' + new Set(LANGUAGES.map((l) => l.script)).size);
console.log('samples      ' + LANGUAGES.reduce((sum, l) => sum + l.samples.length, 0));
console.log('outlines     ' + shaped.length + ' countries big enough for the shape game');

if (problems.length) {
  console.log('\nPROBLEMS');
  for (const problem of problems) console.log('  ' + problem);
  process.exitCode = 1;
} else {
  console.log('\nall data consistent');
}
