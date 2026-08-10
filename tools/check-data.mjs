/* Consistency check for the hand-written data files.
 *
 *   node tools/check-data.mjs
 *
 * Verifies that every country code a language or a road sign claims exists in
 * js/countries.js, that every confusable id resolves to a language, that no sign
 * can offer a right answer as a wrong one, and that the outline game has a usable
 * shape for the countries it draws from. */

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
const SIGNS = load('roadsigns.js', 'SIGNS');

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

const signIds = new Set();
for (const sign of SIGNS) {
  if (signIds.has(sign.id)) problems.push('duplicate sign id: ' + sign.id);
  signIds.add(sign.id);

  if (!sign.name || !sign.tells || !sign.art) problems.push(sign.id + ': missing a required field');
  for (const code of sign.countries) {
    if (!codes.has(code)) problems.push(sign.id + ': unknown country code ' + code);
  }
  for (const code of sign.contrast) {
    if (!codes.has(code)) problems.push(sign.id + ': unknown contrast code ' + code);
    // A wrong answer that also uses the design would make the question unfair.
    if (sign.countries.includes(code)) problems.push(sign.id + ': ' + code + ' is both an answer and a distractor');
  }
  if (sign.contrast.length < 3) problems.push(sign.id + ': needs at least three distractors');
  if (!sign.countries.length) problems.push(sign.id + ': has no answer');
}

// The region filter only works if each region can fill a board on its own.
const regionOf = new Map(COUNTRIES.map((country) => [country.code, country.region]));
for (const region of new Set(regionOf.values())) {
  const usable = SIGNS.filter((sign) => sign.countries.some((code) => regionOf.get(code) === region));
  if (usable.length && usable.length < 4) {
    problems.push('only ' + usable.length + ' signs available when filtered to ' + region);
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
console.log('road signs   ' + SIGNS.length);
console.log('outlines     ' + shaped.length + ' countries big enough for the shape game');

if (problems.length) {
  console.log('\nPROBLEMS');
  for (const problem of problems) console.log('  ' + problem);
  process.exitCode = 1;
} else {
  console.log('\nall data consistent');
}
