/* Scripts: read a sign, name the language.
 *
 * Answering reveals the letters that give the language away and highlights
 * everywhere it is spoken, which is the part that carries over into a round. */

(function () {
  'use strict';

  const byCode = {};
  COUNTRIES.forEach(function (country) {
    byCode[country.code] = country;
  });

  const byId = {};
  LANGUAGES.forEach(function (language) {
    byId[language.id] = language;
  });

  /** Where a language is spoken, as country objects the map can draw. */
  function placesOf(language) {
    return language.countries
      .map(function (code) {
        return byCode[code];
      })
      .filter(Boolean);
  }

  const languages = LANGUAGES.filter(function (language) {
    return placesOf(language).length > 0;
  });

  // A language belongs to every region it is spoken in, not just the first one,
  // so filtering to the Americas keeps Spanish and Brazilian Portuguese in play.
  languages.forEach(function (language) {
    const places = placesOf(language);
    language.region = places[0].region;
    language.regions = places
      .map(function (place) {
        return place.region;
      })
      .filter(function (region, index, all) {
        return all.indexOf(region) === index;
      });
  });

  let card = null;

  function signCard(question) {
    card = document.createElement('div');
    card.className = 'sign';

    const text = document.createElement('p');
    text.className = 'sign-text';
    text.dataset.script = question.target.script;
    text.textContent = question.sample;
    if (question.target.dir) text.dir = question.target.dir;

    const tells = document.createElement('p');
    tells.className = 'sign-tells';
    tells.hidden = true;

    card.append(text, tells);
    return card;
  }

  function captionFor(language) {
    const places = placesOf(language);
    if (places.length === 1) return language.name + ' \u00b7 ' + places[0].name;
    if (places.length <= 3) {
      return language.name + ' \u00b7 ' + places.map(function (place) {
        return place.name;
      }).join(', ');
    }
    return language.name + ' \u00b7 spoken in ' + places.length + ' countries';
  }

  GameEngine.register({
    id: 'language',
    title: 'Scripts',
    blurb: 'Read the sign and name the language',
    trains: 'Signs and alphabets',
    layout: 'tiles',
    tileStyle: 'text',
    promptLabel: 'Which language is this',
    nextLabel: 'Next sign',
    idleCaption: 'Answer to see where it is spoken',
    missedTitle: 'Languages to review',
    revealNames: false,
    hint:
      'Press <kbd>1</kbd>–<kbd>4</kbd> to answer, <kbd>Space</kbd> for the next sign. ' +
      'Every answer shows the letters that give the language away.',

    keyOf: function (language) {
      return language.id;
    },

    pool: function (state) {
      if (state.region === 'All') return languages;
      const pool = languages.filter(function (language) {
        return language.regions.indexOf(state.region) !== -1;
      });
      return pool.length >= GameEngine.util.optionCount ? pool : languages;
    },

    // Hard mode asks you to separate the languages that actually look alike.
    hardPool: function (target) {
      const near = (target.confusable || [])
        .map(function (id) {
          return byId[id];
        })
        .filter(Boolean);
      const sameScript = languages.filter(function (language) {
        return language.script === target.script && language.id !== target.id;
      });
      return near.concat(sameScript);
    },

    widePool: function () {
      return languages;
    },

    renderPrompt: function (question, api) {
      if (!question.sample) question.sample = GameEngine.util.sample(question.target.samples);
      api.setPrompt('');
      api.showMedia(signCard(question));
    },

    renderOption: function (body, language) {
      const label = document.createElement('span');
      label.className = 'tile-text';
      label.textContent = language.name;
      body.appendChild(label);
    },

    reveal: function (question, result, api) {
      const target = question.target;
      const tells = card && card.querySelector('.sign-tells');
      if (tells) {
        tells.textContent = target.tells;
        tells.hidden = false;
      }

      api.map.show(placesOf(target), { caption: captionFor(target) });

      return result.correct
        ? { text: 'Correct \u2014 ' + target.name }
        : { text: 'That is ' + result.picked.name + '. This is ' + target.name + '.' };
    },

    missedCard: function (language) {
      const item = document.createElement('div');
      item.className = 'missed-card missed-card-language';

      const sample = document.createElement('span');
      sample.className = 'missed-sample';
      sample.dataset.script = language.script;
      sample.textContent = language.samples[0];
      if (language.dir) sample.dir = language.dir;

      const label = document.createElement('span');
      label.textContent = language.name;

      item.append(sample, label);
      return item;
    },
  });
})();
