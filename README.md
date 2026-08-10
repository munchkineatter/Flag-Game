# Flag Game

A flag trainer for GeoGuessr practice. You get a country name and four flags; click the flag that belongs to it.

No build step and no dependencies — just open `index.html` in a browser. Flag images are fetched from [flagcdn.com](https://flagcdn.com), so an internet connection is required.

## How to play

- A country name appears above four flags. Click the matching flag, or press <kbd>1</kbd>–<kbd>4</kbd>.
- A correct answer bumps your score and streak. A wrong answer shows which country you actually picked and highlights the right flag, so each miss teaches you two flags.
- Once you answer, the map beside the board zooms from the whole world in to the country and fills in its outline, with enough of its neighbours in frame to place it. Countries too small to see at that scale get a marker ring instead.
- Nothing moves on until you say so. Take as long as you like with the map, then click **Next flag** or press <kbd>Space</kbd>.

The whole game sits in one screenful, so there is nothing to scroll past while you play. Narrow or short windows stack the board above the map and scroll instead.

## Settings

| Setting | Options | Effect |
| --- | --- | --- |
| Mode | Endless, Sprint 60s | Sprint runs a 60 second countdown and then opens the summary. The clock keeps running while you study the map, so time spent there costs you |
| Difficulty | Easy, Hard | Hard draws all three wrong answers from the target's own region |
| Region | All, Africa, Americas, Asia, Europe, Oceania | Limits the countries in play |

Changing any setting restarts the session.

## Getting better over time

Every country carries a repetition weight. Missing a flag raises its weight to 4, which makes it roughly four times as likely to be drawn again; each later correct answer decays the weight back toward 1. Weights are stored in `localStorage`, so your weak flags keep resurfacing across sessions.

The session summary lists every flag you missed with its name, alongside your score, accuracy, and best streak. Hovering the accuracy stat shows your lifetime accuracy for the currently selected region.

Progress lives under the `flag-game.v1` key in `localStorage`. Clearing your browser's site data resets it.

## Project layout

```
index.html        markup: header stats, settings bar, flag board, map panel, summary sheet
styles.css        dark responsive theme, flag grid, correct/wrong animations, map panel
js/countries.js   197 countries as { name, code, region }, ISO 3166-1 alpha-2 codes
js/game.js        question generation, scoring, timer, persistence, map zoom, DOM wiring
js/worldmap.js    generated country outlines, do not edit by hand
tools/build-map.mjs  regenerates js/worldmap.js, run manually
```

Scripts are plain `<script src>` tags rather than ES modules so the page works straight from `file://` without a local server.

## Map data

`js/worldmap.js` holds every country as an SVG path in an equirectangular projection, 30px per degree, latitude clipped to 84N–58S. Each country also carries the box the map zooms to, measured around its main landmass so overseas territories do not drag the view out to sea. The two countries too small to draw at 1:50m, Tuvalu and Vatican City, are stored as points.

Regenerate it with `node tools/build-map.mjs`. The script downloads [Natural Earth](https://www.naturalearthdata.com/) 1:50m boundaries via [world-atlas](https://github.com/topojson/world-atlas) and ISO code mappings via [world-countries](https://github.com/mledoze/countries), then writes the file; the game itself never fetches map data.

Flag images courtesy of [flagcdn.com](https://flagcdn.com). Country outlines from Natural Earth, public domain.
