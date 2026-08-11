/* Road signs: name the design, then see who uses it.
 *
 * The question is only the picture. Naming the design is the answer; the map
 * and the country list under it are the payoff. After you answer, each tile
 * also shows what that design looks like, so the wrong options teach you too. */

(function () {
  'use strict';

  const COMMONS = 'https://commons.wikimedia.org/wiki/Special:FilePath/';
  const IMAGE_WIDTH = 400;
  const THUMB_WIDTH = 160;

  const byCode = {};
  COUNTRIES.forEach(function (country) {
    byCode[country.code] = country;
  });

  const byId = {};

  function placesOf(codes) {
    return codes
      .map(function (code) {
        return byCode[code];
      })
      .filter(Boolean);
  }

  const signs = SIGNS.filter(function (sign) {
    return placesOf(sign.countries).length > 0;
  });

  signs.forEach(function (sign) {
    byId[sign.id] = sign;
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

  function imageUrl(sign, width) {
    return COMMONS + encodeURIComponent(sign.image) + '?width=' + (width || IMAGE_WIDTH);
  }

  function warmImage(sign) {
    if (sign && sign.image) new Image().src = imageUrl(sign, THUMB_WIDTH);
  }

  /** The picture if it loads, the drawn version if it does not. */
  function signFigure(sign, options) {
    const settings = options || {};
    const frame = document.createElement('div');
    frame.className = settings.thumb ? 'sign-option-thumb' : 'sign-art-frame';

    const label = sign.label || sign.name;
    if (!sign.image) {
      frame.appendChild(SignArt.draw(sign.art, { label: label }));
      return frame;
    }

    const image = document.createElement('img');
    image.className = settings.thumb ? 'sign-option-photo' : 'sign-photo';
    image.alt = label;
    image.loading = settings.thumb ? 'lazy' : 'eager';
    image.src = imageUrl(sign, settings.thumb ? THUMB_WIDTH : IMAGE_WIDTH);
    image.addEventListener('error', function () {
      frame.textContent = '';
      frame.appendChild(SignArt.draw(sign.art, { label: label }));
    });
    frame.appendChild(image);
    return frame;
  }

  function signPlate(sign) {
    const plate = document.createElement('div');
    plate.className = 'sign-plate';
    plate.appendChild(signFigure(sign));
    return plate;
  }

  function clearPlaces() {
    const list = document.getElementById('places-list');
    const note = document.getElementById('places-note');
    if (list) {
      list.textContent = '';
      list.hidden = true;
    }
    if (note) {
      note.textContent = '';
      note.hidden = true;
    }
  }

  /** Written list under the map, grouped by region when the design spans many. */
  function showPlaces(sign) {
    const list = document.getElementById('places-list');
    const note = document.getElementById('places-note');
    if (!list || !note) return;

    list.textContent = '';
    note.textContent = sign.tells;
    note.hidden = false;

    const byRegion = {};
    sign.places.forEach(function (place) {
      if (!byRegion[place.region]) byRegion[place.region] = [];
      byRegion[place.region].push(place.name);
    });

    const regions = Object.keys(byRegion).sort();
    if (regions.length === 1 && byRegion[regions[0]].length <= 8) {
      const item = document.createElement('li');
      item.textContent = byRegion[regions[0]].join(', ');
      list.appendChild(item);
    } else {
      regions.forEach(function (region) {
        const item = document.createElement('li');
        const head = document.createElement('strong');
        head.textContent = region;
        item.append(head, document.createTextNode(' \u2014 ' + byRegion[region].slice().sort().join(', ')));
        list.appendChild(item);
      });
    }

    list.hidden = false;
  }

  /** Put each option's artwork on its tile so the wrong answers teach their look too. */
  function revealOptionArt(question, api) {
    question.options.forEach(function (option, index) {
      const tile = api.tiles[index];
      if (!tile) return;
      const body = tile.querySelector('.tile-body');
      if (!body || body.querySelector('.sign-option-thumb')) return;
      body.insertBefore(signFigure(option, { thumb: true }), body.firstChild);
    });
  }

  GameEngine.register({
    id: 'signs',
    title: 'Road signs',
    blurb: 'Name the sign design, then see who uses it',
    trains: 'Sign conventions',
    layout: 'tiles',
    tileStyle: 'sign',
    promptLabel: 'What type of sign is this',
    nextLabel: 'Next sign',
    idleCaption: 'Answer to see who uses this design',
    missedTitle: 'Designs to review',
    revealNames: false,
    hint:
      'Press <kbd>1</kbd>–<kbd>4</kbd> to answer, <kbd>Space</kbd> for the next sign. ' +
      'Hard mode draws the wrong answers from designs that look alike. ' +
      'After you answer, each option shows its sign so you can compare.',

    keyOf: function (sign) {
      return sign.id;
    },

    labelOf: function (sign) {
      return sign.label || sign.name;
    },

    pool: function (state) {
      if (state.region === 'All') return signs;
      const pool = signs.filter(function (sign) {
        return sign.regions.indexOf(state.region) !== -1;
      });
      return pool.length >= GameEngine.util.optionCount ? pool : signs;
    },

    hardPool: function (target) {
      return (target.confusable || [])
        .map(function (id) {
          return byId[id];
        })
        .filter(Boolean);
    },

    widePool: function () {
      return signs;
    },

    renderPrompt: function (question, api) {
      clearPlaces();
      // Leave the heading empty until they answer — putting the name here gives it away.
      api.setPrompt('');
      api.showMedia(signPlate(question.target));
      // Warm the other options so their examples are ready the moment you answer.
      question.options.forEach(warmImage);
    },

    renderOption: function (body, sign) {
      const label = document.createElement('span');
      label.className = 'tile-text';
      label.textContent = sign.label || sign.name;
      body.appendChild(label);
    },

    preload: function (question) {
      warmImage(question.target);
      if (question.options) question.options.forEach(warmImage);
    },

    reveal: function (question, result, api) {
      const sign = question.target;
      api.setPrompt(sign.label || sign.name);
      revealOptionArt(question, api);
      api.map.show(sign.places, {
        caption:
          sign.places.length === 1
            ? 'Used in ' + sign.places[0].name
            : 'Used in ' + sign.places.length + ' countries',
      });
      showPlaces(sign);

      // The tell and country list grow the map column; keep Next on screen.
      if (api.next && api.next.scrollIntoView) {
        window.requestAnimationFrame(function () {
          api.next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
      }

      return result.correct
        ? { text: 'Correct \u2014 ' + (sign.label || sign.name) }
        : { text: 'That is ' + (result.picked.label || result.picked.name) + '. This is ' + (sign.label || sign.name) + '.' };
    },

    onExit: clearPlaces,

    missedCard: function (sign) {
      const item = document.createElement('div');
      item.className = 'missed-card missed-card-sign';

      const art = SignArt.draw(sign.art, { label: sign.label || sign.name });
      art.classList.add('missed-sign-art');

      const label = document.createElement('span');
      label.textContent = sign.label || sign.name;

      item.append(art, label);
      return item;
    },
  });
})();
