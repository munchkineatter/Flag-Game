/* Locate: a country name, the whole world, click where it is. */

(function () {
  'use strict';

  /** Below this the wrong answer is close enough to be worth showing next to the right one. */
  const NEARBY_KM = 2500;

  const byCode = {};
  COUNTRIES.forEach(function (country) {
    byCode[country.code] = country;
  });

  const locatable = COUNTRIES.filter(function (country) {
    return MapView.hasShape(country.code) || Boolean(WORLD_MAP.points[country.code]);
  });

  let ui = null;

  function distanceText(km) {
    return km >= 1000 ? Math.round(km / 100) / 10 + ' thousand km' : km + ' km';
  }

  function onClick(hit) {
    const state = GameEngine.state;
    if (!state.running || state.locked || !state.current) return;

    const target = state.current.target;
    const picked = hit.code ? byCode[hit.code] : null;
    const correct = Boolean(picked) && picked.code === target.code;
    const km = MapView.distanceKm(hit, MapView.centerOf(target));

    let text;
    if (correct) {
      text = 'Correct \u2014 ' + target.name + ' \u00b7 ' + target.region;
    } else if (picked) {
      MapView.markPick(picked);
      text = 'That is ' + picked.name + ', about ' + distanceText(km) + ' from ' + target.name + '.';
    } else {
      text = 'That is open water, about ' + distanceText(km) + ' from ' + target.name + '.';
    }

    // A near miss is worth seeing side by side; a wild one is not worth zooming out for.
    const focus = !correct && picked && km <= NEARBY_KM ? [target, picked] : target;
    MapView.show(focus, { caption: target.name + ' \u00b7 ' + target.region });
    MapView.setClickable(false);

    ui.submit({ correct: correct, text: text });
  }

  GameEngine.register({
    id: 'locate',
    title: 'Locate',
    blurb: 'Click the country on the world map',
    trains: 'Where places actually are',
    layout: 'map-click',
    supports: { region: true, difficulty: false },
    promptLabel: 'Click this country on the map',
    nextLabel: 'Next country',
    idleCaption: 'Click the country on the map',
    missedTitle: 'Countries to review',
    hint:
      'Click the map to answer, then <kbd>Space</kbd> for the next country. ' +
      'Scroll or use <kbd>+</kbd>/<kbd>−</kbd> to zoom; drag to pan when zoomed in. ' +
      'Countries too small to click have a marker circle around them.',

    onEnter: function (api) {
      ui = api;
      api.map.enableClicks(onClick);
      api.map.setInteractive(true);
    },

    onExit: function () {
      MapView.setInteractive(false);
      MapView.disableClicks();
    },

    pool: function (state) {
      const pool = GameEngine.util.byRegion(locatable, state.region);
      return pool.length ? pool : locatable;
    },

    renderPrompt: function (question, api) {
      api.setPrompt(question.target.name);
    },

    missedCard: function (country) {
      const card = document.createElement('div');
      card.className = 'missed-card missed-card-text';
      const label = document.createElement('span');
      label.textContent = country.name + ' \u00b7 ' + country.region;
      card.appendChild(label);
      return card;
    },
  });
})();
