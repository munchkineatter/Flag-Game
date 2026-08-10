/* Flags: a country name, four flags, click the one that belongs to it. */

(function () {
  'use strict';

  /** Codes whose image failed to load; dropped from every future question. */
  const broken = new Set();
  let ui = null;

  function flagSrc(code) {
    return 'https://flagcdn.com/w640/' + code + '.png';
  }

  function flagSrcset(code) {
    return 'https://flagcdn.com/w1280/' + code + '.png 2x';
  }

  function available() {
    return broken.size
      ? COUNTRIES.filter(function (country) {
          return !broken.has(country.code);
        })
      : COUNTRIES;
  }

  function handleImageError(question, index, country) {
    broken.add(country.code);

    const state = GameEngine.state;
    // A dead target makes the question unanswerable, so start a fresh one.
    if (!state.current || state.current.id !== question.id) return;
    if (country.code === question.target.code) {
      if (!state.locked) ui.nextQuestion();
      return;
    }
    if (state.locked || !ui.replaceOption(question, index)) ui.tiles[index].classList.add('missing');
  }

  GameEngine.register({
    id: 'flags',
    title: 'Flags',
    blurb: 'Click the flag that belongs to the country',
    trains: 'Flag recognition',
    layout: 'tiles',
    tileStyle: 'flag',
    promptLabel: 'Which flag belongs to',
    nextLabel: 'Next flag',
    idleCaption: 'Answer to see where it is',
    missedTitle: 'Flags to review',
    revealNames: true,
    hint:
      'Press <kbd>1</kbd>–<kbd>4</kbd> to answer, <kbd>Space</kbd> for the next flag. ' +
      'Flags you miss come back more often.',

    onEnter: function (api) {
      ui = api;
      broken.clear();
    },

    pool: function (state) {
      const all = available();
      const pool = GameEngine.util.byRegion(all, state.region);
      return pool.length >= GameEngine.util.optionCount ? pool : all;
    },

    hardPool: function (target) {
      return available().filter(function (country) {
        return country.region === target.region;
      });
    },

    widePool: available,

    renderOption: function (body, country, index, question) {
      const img = document.createElement('img');
      img.className = 'tile-flag';
      img.alt = 'Flag option ' + (index + 1);
      img.decoding = 'async';
      img.onerror = function () {
        handleImageError(question, index, country);
      };
      img.srcset = flagSrcset(country.code);
      img.src = flagSrc(country.code);
      body.appendChild(img);
    },

    renderPrompt: function (question, api) {
      api.setPrompt(question.target.name);
    },

    preload: function (question) {
      question.options.forEach(function (country) {
        const img = new Image();
        img.srcset = flagSrcset(country.code);
        img.src = flagSrc(country.code);
      });
    },

    reveal: function (question, result, api) {
      api.map.show(question.target);
      return result.correct
        ? { text: 'Correct \u2014 ' + question.target.name }
        : { text: 'That one is ' + result.picked.name + '. ' + question.target.name + ' is highlighted.' };
    },

    missedCard: function (country) {
      const card = document.createElement('div');
      card.className = 'missed-card';

      const img = document.createElement('img');
      img.src = flagSrc(country.code);
      img.alt = 'Flag of ' + country.name;
      img.loading = 'lazy';

      const label = document.createElement('span');
      label.textContent = country.name;

      card.append(img, label);
      return card;
    },

    emptyMessage: function () {
      return 'Flag images could not be loaded. Check your connection, then press Restart.';
    },
  });
})();
