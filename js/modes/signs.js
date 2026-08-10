/* Road signs: name the country from the way the sign is drawn.
 *
 * The question is a sign design and the answers are countries, so this game
 * builds its own tiles rather than letting the engine draw them from the pool.
 * Wrong answers come from the sign's own contrast list, which keeps them
 * genuinely wrong: a yellow diamond is never offered against another yellow
 * diamond country. */

(function () {
  'use strict';

  const COMMONS = 'https://commons.wikimedia.org/wiki/Special:FilePath/';
  const IMAGE_WIDTH = 400;

  const byCode = {};
  COUNTRIES.forEach(function (country) {
    byCode[country.code] = country;
  });

  function placesOf(codes) {
    return codes
      .map(function (code) {
        return byCode[code];
      })
      .filter(Boolean);
  }

  const signs = SIGNS.filter(function (sign) {
    return placesOf(sign.countries).length > 0 && placesOf(sign.contrast).length >= 3;
  });

  // A sign belongs to every region that uses it, so filtering to Europe keeps
  // the European answer for a design that is also used elsewhere.
  signs.forEach(function (sign) {
    sign.places = placesOf(sign.countries);
    sign.region = sign.places[0].region;
    sign.regions = sign.places
      .map(function (place) {
        return place.region;
      })
      .filter(function (region, index, all) {
        return all.indexOf(region) === index;
      });
  });

  function imageUrl(sign) {
    return COMMONS + encodeURIComponent(sign.image) + '?width=' + IMAGE_WIDTH;
  }

  /** The picture if it loads, the drawn version if it does not. */
  function signFigure(sign) {
    const frame = document.createElement('div');
    frame.className = 'sign-art-frame';

    if (!sign.image) {
      frame.appendChild(SignArt.draw(sign.art, { label: sign.name }));
      return frame;
    }

    const image = document.createElement('img');
    image.className = 'sign-photo';
    image.alt = sign.name + ' sign';
    image.loading = 'eager';
    image.src = imageUrl(sign);
    image.addEventListener('error', function () {
      frame.textContent = '';
      frame.appendChild(SignArt.draw(sign.art, { label: sign.name }));
    });
    frame.appendChild(image);
    return frame;
  }

  let plate = null;

  function signPlate(sign) {
    plate = document.createElement('div');
    plate.className = 'sign-plate';

    const tells = document.createElement('p');
    tells.className = 'sign-tells';
    tells.hidden = true;

    plate.append(signFigure(sign), tells);
    return plate;
  }

  function captionFor(sign) {
    const places = sign.places;
    if (places.length <= 3) {
      return sign.name + ' \u00b7 ' + places.map(function (place) {
        return place.name;
      }).join(', ');
    }
    return sign.name + ' \u00b7 this design is used in ' + places.length + ' countries';
  }

  GameEngine.register({
    id: 'signs',
    title: 'Road signs',
    blurb: 'Name the country from the sign design',
    trains: 'Sign conventions',
    layout: 'tiles',
    tileStyle: 'text',
    promptLabel: 'Which country uses this design',
    nextLabel: 'Next sign',
    idleCaption: 'Answer to see who uses this design',
    missedTitle: 'Designs to review',
    revealNames: false,
    hint:
      'Press <kbd>1</kbd>–<kbd>4</kbd> to answer, <kbd>Space</kbd> for the next sign. ' +
      'Hard mode draws the wrong answers from the same part of the world.',

    keyOf: function (item) {
      return item.id || item.code;
    },

    pool: function (state) {
      if (state.region === 'All') return signs;
      const pool = signs.filter(function (sign) {
        return sign.regions.indexOf(state.region) !== -1;
      });
      return pool.length >= GameEngine.util.optionCount ? pool : signs;
    },

    buildOptions: function (sign, state) {
      const shuffle = GameEngine.util.shuffle;

      let answers = sign.places;
      if (state.region !== 'All') {
        const local = answers.filter(function (place) {
          return place.region === state.region;
        });
        if (local.length) answers = local;
      }
      const correct = GameEngine.util.sample(answers);

      // Hard mode, and any region filter, keep the wrong answers nearby so the
      // sign has to be read rather than guessed from the odd one out.
      const wrong = placesOf(sign.contrast);
      const focus = state.region !== 'All' ? state.region : state.difficulty === 'hard' ? correct.region : null;
      const near = focus
        ? wrong.filter(function (place) {
            return place.region === focus;
          })
        : [];

      const picked = [];
      shuffle(near.length >= 3 ? near : wrong).concat(shuffle(wrong)).forEach(function (place) {
        if (picked.length >= 3) return;
        if (place.code === correct.code) return;
        if (picked.indexOf(place) !== -1) return;
        picked.push(place);
      });

      return [correct].concat(picked);
    },

    isCorrect: function (option, question) {
      return question.target.countries.indexOf(option.code) !== -1;
    },

    renderPrompt: function (question, api) {
      api.setPrompt(question.target.name);
      api.showMedia(signPlate(question.target));
    },

    renderOption: function (body, country) {
      const label = document.createElement('span');
      label.className = 'tile-text';
      label.textContent = country.name;
      body.appendChild(label);
    },

    preload: function (question) {
      if (question.target.image) new Image().src = imageUrl(question.target);
    },

    reveal: function (question, result, api) {
      const sign = question.target;
      const tells = plate && plate.querySelector('.sign-tells');
      if (tells) {
        tells.textContent = sign.tells;
        tells.hidden = false;
      }

      api.map.show(sign.places, { caption: captionFor(sign) });

      if (result.correct) return { text: 'Correct \u2014 ' + result.picked.name + ' uses this design' };

      const answer = question.options.filter(function (option) {
        return sign.countries.indexOf(option.code) !== -1;
      })[0];
      return { text: result.picked.name + ' does not use this design. ' + answer.name + ' does.' };
    },

    missedCard: function (sign) {
      const item = document.createElement('div');
      item.className = 'missed-card missed-card-sign';

      const art = SignArt.draw(sign.art, { label: sign.name });
      art.classList.add('missed-sign-art');

      const label = document.createElement('span');
      label.textContent = sign.name + ' \u00b7 ' + sign.places[0].name;

      item.append(art, label);
      return item;
    },
  });
})();
