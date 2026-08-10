/* Outlines: one country silhouette, four names.
 *
 * The shape is drawn into its own bounding box rather than the world's, so the
 * only thing left to read is the shape itself. */

(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  /** Shapes narrower than this in both directions have too few points left to be a fair question. */
  const MIN_SPAN = 20;

  const shaped = COUNTRIES.filter(function (country) {
    const shape = WORLD_MAP.countries[country.code];
    return Boolean(shape) && (shape.box[2] >= MIN_SPAN || shape.box[3] >= MIN_SPAN);
  });

  function silhouette(country, className) {
    const shape = WORLD_MAP.countries[country.code];
    const box = shape.box;
    const pad = Math.max(box[2], box[3]) * 0.06;

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute(
      'viewBox',
      [box[0] - pad, box[1] - pad, box[2] + pad * 2, box[3] + pad * 2].join(' ')
    );
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('aria-hidden', 'true');

    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', shape.d);
    svg.appendChild(path);
    return svg;
  }

  GameEngine.register({
    id: 'outline',
    title: 'Outlines',
    blurb: 'Name the country from its shape alone',
    trains: 'Borders and coastlines',
    layout: 'tiles',
    tileStyle: 'text',
    promptLabel: 'Which country is this',
    nextLabel: 'Next shape',
    idleCaption: 'Answer to see where it is',
    missedTitle: 'Shapes to review',
    revealNames: false,
    hint:
      'Press <kbd>1</kbd>–<kbd>4</kbd> to answer, <kbd>Space</kbd> for the next shape. ' +
      'Shapes are drawn to fit the frame, so size is never the clue.',

    pool: function (state) {
      const pool = GameEngine.util.byRegion(shaped, state.region);
      return pool.length >= GameEngine.util.optionCount ? pool : shaped;
    },

    hardPool: function (target) {
      return shaped.filter(function (country) {
        return country.region === target.region;
      });
    },

    widePool: function () {
      return shaped;
    },

    renderPrompt: function (question, api) {
      api.setPrompt('');
      api.showMedia(silhouette(question.target, 'outline-shape'));
    },

    renderOption: function (body, country) {
      const label = document.createElement('span');
      label.className = 'tile-text';
      label.textContent = country.name;
      body.appendChild(label);
    },

    reveal: function (question, result, api) {
      api.map.show(question.target);
      return result.correct
        ? { text: 'Correct \u2014 ' + question.target.name }
        : { text: 'That shape is ' + question.target.name + ', not ' + result.picked.name + '.' };
    },

    missedCard: function (country) {
      const card = document.createElement('div');
      card.className = 'missed-card missed-card-outline';
      const label = document.createElement('span');
      label.textContent = country.name;
      card.append(silhouette(country, 'outline-thumb'), label);
      return card;
    },
  });
})();
