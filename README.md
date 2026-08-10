# Geo Trainer

Four practice drills for GeoGuessr, built around the things a round actually asks of you: reading a flag, reading a sign, knowing a shape, and knowing where a place is.

No build step and no dependencies — just open `index.html` in a browser. Flag images come from [flagcdn.com](https://flagcdn.com) and a handful of Noto webfonts come from Google Fonts, so an internet connection is required.

## The games

| Game | What you do | What it trains |
| --- | --- | --- |
| **Flags** | A country name and four flags; click the matching one | Flag recognition |
| **Scripts** | A sign written in some language; name the language | Reading signs and telling look-alike alphabets apart |
| **Outlines** | A country silhouette and four names; pick the country | Borders and coastlines |
| **Locate** | A country name and the whole world; click where it is | Knowing where places actually are |

Pick one from the menu. <kbd>Esc</kbd> takes you back. Each game keeps its own score, streak and repetition weights, so improving at flags does not quietly reset your script practice.

## How a round works

- Answer with the mouse, or press <kbd>1</kbd>–<kbd>4</kbd> for the games that use tiles. Locate is answered by clicking the map.
- A wrong answer tells you what you actually picked as well as what the answer was, so each miss teaches you two things rather than one.
- Once you answer, the map zooms from the whole world in to the country, with enough of its neighbours in frame to place it. Countries too small to see at that scale get a marker ring instead.
- Nothing moves on until you say so. Take as long as you like with the map, then press the next button or <kbd>Space</kbd>.

Everything sits in one screenful, so there is nothing to scroll past while you play. Narrow or short windows stack the board above the map and scroll instead.

## Settings

| Setting | Options | Effect |
| --- | --- | --- |
| Mode | Endless, Sprint 60s | Sprint runs a 60 second countdown and then opens the summary. The clock keeps running while you study the map, so time spent there costs you |
| Difficulty | Easy, Hard | Hard draws the wrong answers from the ones that are genuinely easy to confuse: the target's own region for flags and shapes, and look-alike languages for scripts |
| Region | All, Africa, Americas, Asia, Europe, Oceania | Limits what is in play. A language counts as belonging to every region it is spoken in, so the Americas keeps Spanish and Brazilian Portuguese |

Locate has no difficulty setting: there is nothing to make harder except the map itself. Changing any setting restarts the session.

## Getting better over time

Every flag, shape, language and country carries its own repetition weight. Missing one raises its weight to 4, which makes it roughly four times as likely to come back; each later correct answer decays the weight toward 1. Weights live in `localStorage`, so your weak spots keep resurfacing across sessions.

The session summary lists everything you missed, with the flag, the silhouette or a sample of the language so it is worth looking at rather than just reading. Hovering the accuracy stat shows your lifetime accuracy for the current game and region.

Progress lives under the `geo-trainer.v2` key. A save left by the older flag-only version, under `flag-game.v1`, is migrated into the Flags slot the first time you open the page. Clearing your browser's site data resets everything.

## Project layout

```
index.html            markup: menu, stats, settings bar, tile board, map panel, summary sheet
styles.css            dark responsive theme, tiles, sign plate, map states, menu cards
js/countries.js       197 countries as { name, code, region }, ISO 3166-1 alpha-2 codes
js/languages.js       73 languages with samples, identifying tells and look-alike sets
js/worldmap.js        generated country outlines, do not edit by hand
js/mapview.js         the map panel: zoom, highlighting, and the click layer
js/engine.js          sessions, scoring, weighted question picking, timer, persistence
js/main.js            menu and hash routing
js/modes/*.js         one file per game
tools/build-map.mjs   regenerates js/worldmap.js, run manually
tools/check-data.mjs  checks the hand-written data for typos, run manually
```

Scripts are plain `<script src>` tags rather than ES modules so the page works straight from `file://` without a local server.

## Adding another game

A game is one file in `js/modes/` that calls `GameEngine.register`. The engine already owns the settings bar, the weighted picker, the sprint clock, scoring, persistence and the summary sheet; a game supplies only what makes it different.

```js
GameEngine.register({
  id: 'capitals',
  title: 'Capitals',
  blurb: 'Match the country to its capital',
  trains: 'City names',
  layout: 'tiles',              // or 'map-click' for a map answer
  tileStyle: 'text',            // 'flag' for image tiles
  supports: { region: true, difficulty: true },
  pool: (state) => GameEngine.util.byRegion(COUNTRIES, state.region),
  hardPool: (target) => COUNTRIES.filter((c) => c.region === target.region),
  renderPrompt: (question, ui) => ui.setPrompt(question.target.name),
  renderOption: (body, country) => { body.textContent = capitalOf(country); },
  reveal: (question, result, ui) => {
    ui.map.show(question.target);
    return { text: result.correct ? 'Correct' : 'It was ' + question.target.name };
  },
});
```

Add a `<script src>` for it in `index.html` and it appears on the menu with its own saved progress. `ui.map` is the `MapView` module: `show(countries)` highlights and zooms to one country or many, `enableClicks(handler)` turns the map into an answer surface, and `distanceKm` grades a near miss.

Games not built yet, in rough order of how much they would help: top-level domains on signs (.hr, .ge, .lv), which side of the road traffic drives on, capitals, bordering countries, currency and dialling codes, and a mixed drill that rotates through everything.

## Data

`js/countries.js` and `js/languages.js` are written by hand. `node tools/check-data.mjs` verifies that every country code a language claims exists, that every look-alike id resolves, and that every country has map geometry.

Language samples are the kind of text that ends up on a street sign, a shopfront or a road marking, because that is all you get to read in a round. Each language also carries the letters and habits that give it away, which is what the game shows you after you answer.

`js/worldmap.js` holds every country as an SVG path in an equirectangular projection, 30px per degree, latitude clipped to 84N–58S. Each country also carries the box the map zooms to, measured around its main landmass so overseas territories do not drag the view out to sea. The two countries too small to draw at 1:50m, Tuvalu and Vatican City, are stored as points; the Outlines game skips countries whose shape is too small to be a fair question.

The world is stored at two levels of detail, because the whole backdrop is repainted on every frame of a zoom and Natural Earth carries far more precision than the panel can show. Country shapes keep 0.4px of detail, the most the panel can resolve at full zoom. `land` is the same world at 3px, cheap enough to animate, and its error stays inside a single pixel at any zoom wide enough to be using it. The detailed backdrop is swapped in partway through a zoom, once the view is narrow enough that most of the world is clipped away.

Regenerate it with `node tools/build-map.mjs`. The script downloads [Natural Earth](https://www.naturalearthdata.com/) 1:50m boundaries via [world-atlas](https://github.com/topojson/world-atlas) and ISO code mappings via [world-countries](https://github.com/mledoze/countries), then writes the file; the game itself never fetches map data.

Flag images courtesy of [flagcdn.com](https://flagcdn.com). Country outlines from Natural Earth, public domain.
