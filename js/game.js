(function () {
  'use strict';

  const STORAGE_KEY = 'flag-game.v1';
  const SPRINT_SECONDS = 60;
  const MISS_WEIGHT = 4;
  const OPTION_COUNT = 4;

  /** Degrees of surrounding map kept in view, so a country is never shown without neighbours. */
  const MAP_CONTEXT_DEGREES = 24;
  const MAP_MAX_SCALE = 15;
  const MAP_ZOOM_MS = 700;
  /** Countries narrower than this many map units also get a ring drawn around them. */
  const MAP_TINY = 80;
  const MAP_PIN_RADIUS = 150;
  const MAP_IDLE_CAPTION = 'Answer to see where it is';

  const el = {
    score: document.getElementById('stat-score'),
    streak: document.getElementById('stat-streak'),
    best: document.getElementById('stat-best'),
    accuracy: document.getElementById('stat-accuracy'),
    timer: document.getElementById('stat-timer'),
    timerWrap: document.getElementById('stat-timer-wrap'),
    prompt: document.getElementById('prompt'),
    feedback: document.getElementById('feedback'),
    board: document.getElementById('board'),
    regionSelect: document.getElementById('region-select'),
    restart: document.getElementById('btn-restart'),
    end: document.getElementById('btn-end'),
    next: document.getElementById('btn-next'),
    again: document.getElementById('btn-again'),
    summary: document.getElementById('summary'),
    sumScore: document.getElementById('sum-score'),
    sumAccuracy: document.getElementById('sum-accuracy'),
    sumStreak: document.getElementById('sum-streak'),
    missed: document.getElementById('missed'),
    missedTitle: document.getElementById('missed-title'),
    map: document.getElementById('map'),
    mapSvg: document.getElementById('map-svg'),
    mapZoom: document.getElementById('map-zoom'),
    mapOcean: document.getElementById('map-ocean'),
    mapLand: document.getElementById('map-land'),
    mapCountry: document.getElementById('map-country'),
    mapPin: document.getElementById('map-pin'),
    mapCopyLeft: document.getElementById('map-copy-left'),
    mapCopyRight: document.getElementById('map-copy-right'),
    mapCaption: document.getElementById('map-caption'),
  };

  const tiles = Array.from(el.board.querySelectorAll('.tile'));

  const saved = loadProgress();

  const state = {
    mode: 'endless',
    difficulty: 'easy',
    region: 'All',
    running: false,
    locked: false,
    asked: 0,
    correct: 0,
    streak: 0,
    current: null,
    pending: null,
    recent: [],
    missed: [],
    timeLeft: SPRINT_SECONDS,
    timerId: null,
  };

  /** Codes whose image failed to load; dropped from every future question. */
  const brokenCodes = new Set();
  let questionSeq = 0;
  let mapReady = false;
  let mapCopyId = null;
  let mapResizeId = null;
  /** Country currently drawn on the map, kept so a resize can redo the zoom. */
  let mapShowing = null;

  /* ---------- persistence ---------- */

  function loadProgress() {
    const empty = { bestStreak: 0, weights: {}, regionStats: {} };
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        bestStreak: Number(parsed.bestStreak) || 0,
        weights: parsed.weights && typeof parsed.weights === 'object' ? parsed.weights : {},
        regionStats: parsed.regionStats && typeof parsed.regionStats === 'object' ? parsed.regionStats : {},
      };
    } catch (err) {
      return empty;
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch (err) {
      /* private browsing or a full quota: progress just stays in memory */
    }
  }

  function getWeight(code) {
    const stored = saved.weights[code];
    return typeof stored === 'number' && stored >= 1 ? stored : 1;
  }

  function setWeight(code, weight) {
    if (weight <= 1) {
      delete saved.weights[code];
    } else {
      saved.weights[code] = weight;
    }
  }

  /* ---------- helpers ---------- */

  function flagSrc(code) {
    return 'https://flagcdn.com/w640/' + code + '.png';
  }

  function flagSrcset(code) {
    return 'https://flagcdn.com/w1280/' + code + '.png 2x';
  }

  function shuffle(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function availableCountries() {
    return brokenCodes.size ? COUNTRIES.filter((c) => !brokenCodes.has(c.code)) : COUNTRIES;
  }

  function activePool() {
    const all = availableCountries();
    const pool = state.region === 'All' ? all : all.filter((c) => c.region === state.region);
    return pool.length >= OPTION_COUNT ? pool : all;
  }

  function accuracyText(correct, asked) {
    return asked ? Math.round((correct / asked) * 100) + '%' : '—';
  }

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  /* ---------- map ---------- */

  function initMap() {
    if (typeof WORLD_MAP === 'undefined' || !el.map) {
      if (el.map) el.map.hidden = true;
      return false;
    }

    const outlines = Object.keys(WORLD_MAP.countries).map(function (code) {
      return WORLD_MAP.countries[code].d;
    });
    el.mapLand.setAttribute('d', WORLD_MAP.other + outlines.join(''));
    el.mapSvg.setAttribute('viewBox', '0 0 ' + WORLD_MAP.width + ' ' + WORLD_MAP.height);
    el.map.style.setProperty('--map-aspect', WORLD_MAP.width + ' / ' + WORLD_MAP.height);
    el.mapOcean.setAttribute('width', WORLD_MAP.width);
    el.mapOcean.setAttribute('height', WORLD_MAP.height);
    el.mapCopyLeft.setAttribute('x', -WORLD_MAP.width);
    el.mapCopyRight.setAttribute('x', WORLD_MAP.width);
    return true;
  }

  /** How much of the map is on screen, in map units. The panel rarely has the same shape as
   * the map, and the SVG letterboxes the difference, so this cannot be read off the viewBox. */
  function mapViewport() {
    const rect = el.mapSvg.getBoundingClientRect();
    if (!rect.width || !rect.height) return { width: WORLD_MAP.width, height: WORLD_MAP.height };
    const fit = Math.min(rect.width / WORLD_MAP.width, rect.height / WORLD_MAP.height);
    return { width: rect.width / fit, height: rect.height / fit };
  }

  function zoomMap(centerX, centerY, scale) {
    const view = mapViewport();
    const halfWidth = view.width / (2 * scale);
    const halfHeight = view.height / (2 * scale);
    const y = halfHeight * 2 >= WORLD_MAP.height
      ? WORLD_MAP.height / 2
      : clamp(centerY, halfHeight, WORLD_MAP.height - halfHeight);

    el.mapZoom.style.transform =
      'translate(' +
      (WORLD_MAP.width / 2 - scale * centerX) + 'px, ' +
      (WORLD_MAP.height / 2 - scale * y) + 'px) scale(' + scale + ')';

    useWorldCopies(centerX - halfWidth < 0 || centerX + halfWidth > WORLD_MAP.width);
  }

  /** Copies of the world sit either side of the original so views across the date line stay
   * whole. They are switched off again only once the zoom has finished, or land would blink
   * away halfway through the animation back to the world view. */
  function useWorldCopies(needed) {
    window.clearTimeout(mapCopyId);
    if (needed) {
      el.map.classList.add('wrapped');
    } else if (el.map.classList.contains('wrapped')) {
      mapCopyId = window.setTimeout(function () {
        el.map.classList.remove('wrapped');
      }, MAP_ZOOM_MS);
    }
  }

  function showOnMap(country) {
    if (!mapReady) return;

    const shape = WORLD_MAP.countries[country.code];
    const point = WORLD_MAP.points[country.code];
    if (!shape && !point) {
      resetMap();
      return;
    }

    const view = mapViewport();
    const box = shape ? shape.box : [point[0], point[1], 0, 0];
    const centerX = box[0] + box[2] / 2;
    const centerY = box[1] + box[3] / 2;
    const context = MAP_CONTEXT_DEGREES * (WORLD_MAP.width / 360);
    const spanX = Math.max(box[2] * 1.5, context);
    const spanY = Math.max(box[3] * 1.5, (context * view.height) / view.width);
    const scale = clamp(Math.min(view.width / spanX, view.height / spanY), 1, MAP_MAX_SCALE);

    el.mapCountry.setAttribute('d', shape ? shape.d : '');
    el.mapPin.setAttribute('cx', centerX);
    el.mapPin.setAttribute('cy', centerY);
    el.mapPin.setAttribute('r', box[2] < MAP_TINY || box[3] < MAP_TINY ? MAP_PIN_RADIUS / scale : 0);

    zoomMap(centerX, centerY, scale);
    mapShowing = country;
    el.map.classList.add('located');
    el.mapCaption.textContent = country.name + ' · ' + country.region;
  }

  function resetMap() {
    if (!mapReady) return;
    mapShowing = null;
    el.map.classList.remove('located');
    el.mapCaption.textContent = MAP_IDLE_CAPTION;
    zoomMap(WORLD_MAP.width / 2, WORLD_MAP.height / 2, 1);
  }

  /* ---------- question generation ---------- */

  function pickTarget(pool) {
    const avoid = new Set(state.recent);
    let candidates = pool.filter((c) => !avoid.has(c.code));
    if (!candidates.length) candidates = pool;

    const weights = candidates.map((c) => getWeight(c.code));
    const total = weights.reduce((sum, w) => sum + w, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < candidates.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  function pickDistractors(target, pool, exclude) {
    const used = new Set(exclude || []);
    used.add(target.code);

    // Hard mode prefers neighbours from the same region, then widens if needed.
    const sources = [];
    if (state.difficulty === 'hard') {
      sources.push(availableCountries().filter((c) => c.region === target.region));
    }
    sources.push(pool, availableCountries());

    const chosen = [];
    for (const source of sources) {
      for (const country of shuffle(source)) {
        if (chosen.length >= OPTION_COUNT - 1) break;
        if (used.has(country.code)) continue;
        used.add(country.code);
        chosen.push(country);
      }
      if (chosen.length >= OPTION_COUNT - 1) break;
    }
    return chosen;
  }

  function buildQuestion() {
    const pool = activePool();
    const target = pickTarget(pool);
    rememberTarget(target.code, pool.length);
    return {
      id: ++questionSeq,
      target: target,
      options: shuffle([target].concat(pickDistractors(target, pool))),
    };
  }

  function rememberTarget(code, poolSize) {
    state.recent.push(code);
    const limit = Math.min(12, Math.max(0, Math.floor(poolSize / 2)));
    while (state.recent.length > limit) state.recent.shift();
  }

  function preload(question) {
    question.options.forEach((country) => {
      const img = new Image();
      img.srcset = flagSrcset(country.code);
      img.src = flagSrc(country.code);
    });
  }

  /* ---------- rendering ---------- */

  function render(question) {
    el.prompt.textContent = question.target.name;
    tiles.forEach((tile, index) => {
      paintTile(tile, question, index);
    });
  }

  function paintTile(tile, question, index) {
    const country = question.options[index];
    tile.className = 'tile';
    tile.disabled = false;
    tile.dataset.code = country.code;
    tile.dataset.name = country.name;
    tile.querySelector('.tile-name').textContent = '';

    const img = tile.querySelector('.tile-flag');
    img.onerror = function () {
      handleImageError(question, index);
    };
    img.srcset = flagSrcset(country.code);
    img.src = flagSrc(country.code);
  }

  function handleImageError(question, index) {
    const country = question.options[index];
    if (!country) return;
    brokenCodes.add(country.code);

    // A dead target makes the question unanswerable, so start a fresh one.
    if (!state.current || state.current.id !== question.id) return;
    if (country.code === question.target.code) {
      if (!state.locked) nextQuestion();
      return;
    }

    if (state.locked) {
      tiles[index].classList.add('missing');
      return;
    }

    const replacement = pickDistractors(
      question.target,
      activePool(),
      question.options.map((c) => c.code)
    )[0];

    if (!replacement) {
      tiles[index].classList.add('missing');
      return;
    }
    question.options[index] = replacement;
    paintTile(tiles[index], question, index);
  }

  function updateStats() {
    el.score.textContent = state.correct;
    el.streak.textContent = state.streak;
    el.best.textContent = saved.bestStreak;
    el.accuracy.textContent = accuracyText(state.correct, state.asked);
    el.accuracy.parentElement.title = lifetimeText();
  }

  function lifetimeText() {
    const stats = saved.regionStats[state.region];
    if (!stats || !stats.asked) return 'No lifetime history for this region yet';
    return (
      'Lifetime ' + state.region + ': ' + accuracyText(stats.correct, stats.asked) + ' of ' + stats.asked + ' answers'
    );
  }

  function setFeedback(text, tone) {
    el.feedback.textContent = text || '\u00a0';
    el.feedback.className = 'feedback' + (tone ? ' ' + tone : '');
  }

  /* ---------- answering ---------- */

  function answer(index) {
    if (!state.running || state.locked || !state.current) return;
    const question = state.current;
    const picked = question.options[index];
    if (!picked) return;

    state.locked = true;
    const isCorrect = picked.code === question.target.code;

    state.asked += 1;
    const regionStats = saved.regionStats[state.region] || { asked: 0, correct: 0 };
    regionStats.asked += 1;

    if (isCorrect) {
      state.correct += 1;
      state.streak += 1;
      regionStats.correct += 1;
      setWeight(question.target.code, Math.max(1, getWeight(question.target.code) - 1));
      if (state.streak > saved.bestStreak) saved.bestStreak = state.streak;
      setFeedback('Correct — ' + question.target.name, 'good');
    } else {
      state.streak = 0;
      setWeight(question.target.code, MISS_WEIGHT);
      recordMiss(question.target);
      setFeedback('That one is ' + picked.name + '. ' + question.target.name + ' is highlighted.', 'bad');
    }

    saved.regionStats[state.region] = regionStats;
    saveProgress();
    updateStats();
    revealAnswers(index, isCorrect);

    el.next.disabled = false;
    el.next.focus();
  }

  function revealAnswers(pickedIndex, isCorrect) {
    const targetCode = state.current.target.code;
    showOnMap(state.current.target);
    tiles.forEach((tile, index) => {
      tile.disabled = true;
      tile.classList.add('revealed');
      tile.querySelector('.tile-name').textContent = tile.dataset.name;

      if (tile.dataset.code === targetCode) {
        tile.classList.add('correct');
      } else if (index === pickedIndex) {
        tile.classList.add('wrong');
      } else {
        tile.classList.add('dimmed');
      }
      if (index === pickedIndex) {
        tile.classList.add('picked', isCorrect ? 'correct' : 'wrong');
      }
    });
  }

  function recordMiss(country) {
    if (!state.missed.some((c) => c.code === country.code)) {
      state.missed.push(country);
    }
  }

  /* ---------- session flow ---------- */

  function nextQuestion() {
    if (!state.running) return;
    el.next.disabled = true;

    if (availableCountries().length < OPTION_COUNT) {
      stopTimer();
      state.running = false;
      state.locked = true;
      el.prompt.textContent = 'Offline';
      setFeedback('Flag images could not be loaded. Check your connection, then press Restart.', 'bad');
      return;
    }

    state.current = state.pending || buildQuestion();
    state.pending = null;
    state.locked = false;
    render(state.current);
    setFeedback('');
    resetMap();

    state.pending = buildQuestion();
    preload(state.pending);
  }

  function startSession() {
    stopTimer();
    brokenCodes.clear();

    state.running = true;
    state.locked = false;
    state.asked = 0;
    state.correct = 0;
    state.streak = 0;
    state.missed = [];
    state.recent = [];
    state.current = null;
    state.pending = null;
    state.timeLeft = SPRINT_SECONDS;

    el.summary.classList.add('hidden');
    el.timerWrap.hidden = state.mode !== 'sprint';
    el.timerWrap.classList.remove('urgent');
    el.timer.textContent = SPRINT_SECONDS;

    updateStats();
    nextQuestion();

    if (state.mode === 'sprint') startTimer();
  }

  function startTimer() {
    state.timerId = window.setInterval(function () {
      state.timeLeft -= 1;
      el.timer.textContent = Math.max(0, state.timeLeft);
      el.timerWrap.classList.toggle('urgent', state.timeLeft <= 10);
      if (state.timeLeft <= 0) endSession();
    }, 1000);
  }

  function stopTimer() {
    if (state.timerId) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function endSession() {
    stopTimer();
    state.running = false;
    state.locked = true;
    el.next.disabled = true;
    tiles.forEach((tile) => {
      tile.disabled = true;
    });
    showSummary();
  }

  function showSummary() {
    el.sumScore.textContent = state.correct;
    el.sumAccuracy.textContent = accuracyText(state.correct, state.asked);
    el.sumStreak.textContent = saved.bestStreak;
    el.missedTitle.textContent = state.missed.length ? 'Flags to review' : '';
    el.missed.innerHTML = '';

    if (!state.missed.length) {
      const note = document.createElement('p');
      note.className = 'missed-empty';
      note.textContent = state.asked ? 'Clean run — nothing missed.' : 'No answers yet this session.';
      el.missed.appendChild(note);
    } else {
      state.missed.forEach((country) => {
        const card = document.createElement('div');
        card.className = 'missed-card';

        const img = document.createElement('img');
        img.src = flagSrc(country.code);
        img.alt = 'Flag of ' + country.name;
        img.loading = 'lazy';

        const label = document.createElement('span');
        label.textContent = country.name;

        card.append(img, label);
        el.missed.appendChild(card);
      });
    }

    el.summary.classList.remove('hidden');
    el.again.focus();
  }

  /* ---------- events ---------- */

  function initRegionSelect() {
    const options = ['All'].concat(REGIONS);
    options.forEach((region) => {
      const option = document.createElement('option');
      option.value = region;
      option.textContent = region === 'All' ? 'All regions' : region;
      el.regionSelect.appendChild(option);
    });
    el.regionSelect.value = state.region;
  }

  el.board.addEventListener('click', function (event) {
    const tile = event.target.closest('.tile');
    if (tile) answer(Number(tile.dataset.index));
  });

  document.querySelectorAll('.seg').forEach(function (button) {
    button.addEventListener('click', function () {
      const setting = button.dataset.setting;
      if (state[setting] === button.dataset.value) return;
      state[setting] = button.dataset.value;
      document.querySelectorAll('.seg[data-setting="' + setting + '"]').forEach(function (sibling) {
        sibling.setAttribute('aria-pressed', String(sibling === button));
      });
      startSession();
    });
  });

  el.regionSelect.addEventListener('change', function () {
    state.region = el.regionSelect.value;
    startSession();
  });

  el.restart.addEventListener('click', startSession);
  el.again.addEventListener('click', startSession);
  el.end.addEventListener('click', endSession);
  el.next.addEventListener('click', nextQuestion);

  document.addEventListener('keydown', function (event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    if (event.key >= '1' && event.key <= '4') {
      answer(Number(event.key) - 1);
      return;
    }

    // The Next button handles its own keys once it has focus.
    if ((event.key === ' ' || event.key === 'Enter') && event.target !== el.next) {
      if (el.next.disabled) return;
      event.preventDefault();
      nextQuestion();
    }
  });

  window.addEventListener('resize', function () {
    if (!mapReady) return;
    window.clearTimeout(mapResizeId);
    mapResizeId = window.setTimeout(function () {
      if (mapShowing) showOnMap(mapShowing);
      else zoomMap(WORLD_MAP.width / 2, WORLD_MAP.height / 2, 1);
    }, 150);
  });

  mapReady = initMap();
  initRegionSelect();
  startSession();
})();
