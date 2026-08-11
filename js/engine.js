/* Shared session engine.
 *
 * Owns everything that is the same whichever game you are playing: the settings
 * bar, weighted question selection, scoring, the sprint clock, persistence and
 * the summary sheet. Games register themselves with GameEngine.register and
 * supply only the parts that are actually specific to them.
 *
 * A game object looks like this. Everything except id, title and pool has a
 * sensible default:
 *
 *   {
 *     id, title, blurb,            // identity, also used for the menu card
 *     layout: 'tiles' | 'map-click',
 *     tileStyle: 'flag' | 'text',  // picks the tile shape in styles.css
 *     supports: { region, difficulty },
 *     promptLabel, nextLabel, hint, idleCaption, missedTitle,
 *     pool(state)          -> items to draw questions from
 *     keyOf(item)          -> stable string, used for repetition weights
 *     labelOf(item)        -> display name
 *     hardPool(target, s)  -> candidates hard mode prefers as wrong answers
 *     buildOptions(target, state) -> the four tiles, when they are not the pool
 *     renderPrompt(question, ui)
 *     renderOption(tile, option, index, question)
 *     isCorrect(option, question)
 *     reveal(question, result, ui) -> { text, tone }
 *     missedCard(target)   -> element for the summary sheet
 *     preload(question), onEnter(ui), onExit(), onStart(ui)
 *   }
 */

const GameEngine = (function () {
  'use strict';

  const STORAGE_KEY = 'geo-trainer.v2';
  const LEGACY_KEY = 'flag-game.v1';
  const SPRINT_SECONDS = 60;
  const MISS_WEIGHT = 4;
  const OPTION_COUNT = 4;

  const games = [];
  const byId = {};

  const el = {};
  let tiles = [];
  let ui = null;
  let booted = false;
  let questionSeq = 0;

  const state = {
    game: null,
    pace: 'endless',
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

  /* ---------- persistence ---------- */

  const saved = loadProgress();

  function loadProgress() {
    const fresh = { version: 2, games: {} };
    let parsed = null;
    try {
      parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (err) {
      parsed = null;
    }
    if (parsed && parsed.games && typeof parsed.games === 'object') {
      fresh.games = parsed.games;
      return fresh;
    }

    // One-time lift of the single-game save into its own slot.
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
      if (legacy) {
        fresh.games.flags = {
          bestStreak: Number(legacy.bestStreak) || 0,
          weights: legacy.weights && typeof legacy.weights === 'object' ? legacy.weights : {},
          scopeStats: legacy.regionStats && typeof legacy.regionStats === 'object' ? legacy.regionStats : {},
        };
      }
    } catch (err) {
      /* nothing worth keeping */
    }
    return fresh;
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch (err) {
      /* private browsing or a full quota: progress just stays in memory */
    }
  }

  function progressFor(id) {
    if (!saved.games[id]) saved.games[id] = { bestStreak: 0, weights: {}, scopeStats: {} };
    const entry = saved.games[id];
    if (typeof entry.bestStreak !== 'number') entry.bestStreak = 0;
    if (!entry.weights || typeof entry.weights !== 'object') entry.weights = {};
    if (!entry.scopeStats || typeof entry.scopeStats !== 'object') entry.scopeStats = {};
    return entry;
  }

  function getWeight(key) {
    const stored = progressFor(state.game.id).weights[key];
    return typeof stored === 'number' && stored >= 1 ? stored : 1;
  }

  function setWeight(key, weight) {
    const weights = progressFor(state.game.id).weights;
    if (weight <= 1) delete weights[key];
    else weights[key] = weight;
  }

  /** Region for country games, a single bucket for the rest. */
  function scope() {
    return state.game.supports.region ? state.region : 'All';
  }

  /* ---------- helpers shared with games ---------- */

  function shuffle(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function sample(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function byRegion(list, region) {
    return region === 'All' ? list : list.filter(function (item) {
      return item.region === region;
    });
  }

  function accuracyText(correct, asked) {
    return asked ? Math.round((correct / asked) * 100) + '%' : '\u2014';
  }

  function plural(count, word) {
    return count + ' ' + word + (count === 1 ? '' : 's');
  }

  /* ---------- question generation ---------- */

  function keyOf(item) {
    return state.game.keyOf(item);
  }

  function labelOf(item) {
    return state.game.labelOf(item);
  }

  /** Weighted draw, skipping anything asked recently so a small pool still feels varied. */
  function pickTarget(pool) {
    const avoid = new Set(state.recent);
    let candidates = pool.filter(function (item) {
      return !avoid.has(keyOf(item));
    });
    if (!candidates.length) candidates = pool;

    const weights = candidates.map(function (item) {
      return getWeight(keyOf(item));
    });
    const total = weights.reduce(function (sum, w) {
      return sum + w;
    }, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < candidates.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  function rememberTarget(key, poolSize) {
    state.recent.push(key);
    const limit = Math.min(12, Math.max(0, Math.floor(poolSize / 2)));
    while (state.recent.length > limit) state.recent.shift();
  }

  /** Wrong answers, drawn from each source in turn until there are enough. */
  function pickDistractors(target, sources, exclude) {
    const used = new Set(exclude || []);
    used.add(keyOf(target));

    const chosen = [];
    for (const source of sources) {
      if (!source) continue;
      for (const item of shuffle(source)) {
        if (chosen.length >= OPTION_COUNT - 1) break;
        const key = keyOf(item);
        if (used.has(key)) continue;
        used.add(key);
        chosen.push(item);
      }
      if (chosen.length >= OPTION_COUNT - 1) break;
    }
    return chosen;
  }

  function buildQuestion() {
    const game = state.game;
    const pool = game.pool(state);
    if (pool.length < (game.layout === 'map-click' ? 1 : OPTION_COUNT)) return null;

    const target = pickTarget(pool);
    rememberTarget(keyOf(target), pool.length);

    if (game.layout === 'map-click') return { id: ++questionSeq, target: target };

    return { id: ++questionSeq, target: target, options: buildOptions(target) };
  }

  /* Normally the tiles are the target plus wrong answers from the same pool. A
   * game whose answer is not the same kind of thing as the question, like a road
   * sign answered with a country, builds its own. */
  function buildOptions(target) {
    const game = state.game;
    if (game.buildOptions) return shuffle(game.buildOptions(target, state));

    const sources = [];
    if (state.difficulty === 'hard' && game.hardPool) sources.push(game.hardPool(target, state));
    sources.push(game.pool(state));
    if (game.widePool) sources.push(game.widePool(state));
    return shuffle([target].concat(pickDistractors(target, sources)));
  }

  /** Swaps one wrong answer for another, used when a game finds an option it cannot draw. */
  function replaceOption(question, index) {
    const game = state.game;
    const pool = game.pool(state);
    const sources = [];
    if (state.difficulty === 'hard' && game.hardPool) sources.push(game.hardPool(question.target, state));
    sources.push(pool);
    const replacement = pickDistractors(
      question.target,
      sources,
      question.options.map(keyOf)
    )[0];
    if (!replacement) return false;
    question.options[index] = replacement;
    paintTile(tiles[index], question, index);
    return true;
  }

  /* ---------- rendering ---------- */

  function render(question) {
    el.promptMedia.textContent = '';
    el.promptMedia.hidden = true;
    state.game.renderPrompt(question, ui);
    if (state.game.layout === 'tiles') {
      tiles.forEach(function (tile, index) {
        paintTile(tile, question, index);
      });
    }
  }

  function paintTile(tile, question, index) {
    const option = question.options[index];
    tile.className = 'tile';
    tile.disabled = false;
    tile.hidden = false;
    tile.dataset.key = keyOf(option);
    tile.dataset.name = labelOf(option);
    tile.querySelector('.tile-name').textContent = '';
    const body = tile.querySelector('.tile-body');
    body.textContent = '';
    state.game.renderOption(body, option, index, question);
  }

  function revealTiles(pickedIndex, question) {
    tiles.forEach(function (tile, index) {
      const right = isCorrectOption(question.options[index], question);
      tile.disabled = true;
      tile.classList.add('revealed');
      if (state.game.revealNames !== false) tile.querySelector('.tile-name').textContent = tile.dataset.name;

      if (right) tile.classList.add('correct');
      else if (index === pickedIndex) tile.classList.add('wrong');
      else tile.classList.add('dimmed');

      if (index === pickedIndex) tile.classList.add('picked', right ? 'correct' : 'wrong');
    });
  }

  function updateStats() {
    const progress = progressFor(state.game.id);
    el.score.textContent = state.correct;
    el.streak.textContent = state.streak;
    el.best.textContent = progress.bestStreak;
    el.accuracy.textContent = accuracyText(state.correct, state.asked);
    el.accuracy.parentElement.title = lifetimeText();
  }

  function lifetimeText() {
    const stats = progressFor(state.game.id).scopeStats[scope()];
    const where = state.game.supports.region ? scope() : state.game.title;
    if (!stats || !stats.asked) return 'No lifetime history for ' + where + ' yet';
    return 'Lifetime ' + where + ': ' + accuracyText(stats.correct, stats.asked) + ' of ' + stats.asked + ' answers';
  }

  function setFeedback(text, tone) {
    el.feedback.textContent = text || '\u00a0';
    el.feedback.className = 'feedback' + (tone ? ' ' + tone : '');
  }

  /* ---------- answering ---------- */

  function canAnswer() {
    return state.running && !state.locked && Boolean(state.current);
  }

  function isCorrectOption(option, question) {
    if (!option) return false;
    return state.game.isCorrect
      ? state.game.isCorrect(option, question)
      : keyOf(option) === keyOf(question.target);
  }

  function answer(index) {
    if (!canAnswer() || state.game.layout !== 'tiles') return;
    const question = state.current;
    const option = question.options[index];
    if (!option) return;

    state.locked = true;
    const correct = isCorrectOption(option, question);

    revealTiles(index, question);
    const info = state.game.reveal
      ? state.game.reveal(question, { correct: correct, picked: option, index: index }, ui)
      : null;
    record(question, correct, info);
  }

  /** How games with their own answer surface, like clicking the map, report a result. */
  function submit(result) {
    if (!canAnswer()) return;
    state.locked = true;
    record(state.current, Boolean(result.correct), result);
  }

  function record(question, correct, info) {
    const progress = progressFor(state.game.id);
    const key = keyOf(question.target);

    state.asked += 1;
    const stats = progress.scopeStats[scope()] || { asked: 0, correct: 0 };
    stats.asked += 1;

    if (correct) {
      state.correct += 1;
      state.streak += 1;
      stats.correct += 1;
      setWeight(key, Math.max(1, getWeight(key) - 1));
      if (state.streak > progress.bestStreak) progress.bestStreak = state.streak;
    } else {
      state.streak = 0;
      setWeight(key, MISS_WEIGHT);
      if (!state.missed.some(function (item) {
        return keyOf(item) === key;
      })) {
        state.missed.push(question.target);
      }
    }

    progress.scopeStats[scope()] = stats;
    saveProgress();
    updateStats();

    if (info && info.text) setFeedback(info.text, info.tone || (correct ? 'good' : 'bad'));
    else setFeedback((correct ? 'Correct \u2014 ' : 'It was ') + labelOf(question.target), correct ? 'good' : 'bad');

    el.next.disabled = false;
    el.next.focus();
  }

  /* ---------- session flow ---------- */

  function nextQuestion() {
    if (!state.running) return;
    el.next.disabled = true;

    const question = state.pending || buildQuestion();
    state.pending = null;

    if (!question) {
      stopTimer();
      state.running = false;
      state.locked = true;
      el.prompt.textContent = 'Nothing to ask';
      setFeedback(state.game.emptyMessage ? state.game.emptyMessage() : 'This game has no questions left. Press Restart.', 'bad');
      return;
    }

    state.current = question;
    state.locked = false;
    render(question);
    setFeedback('');
    MapView.reset();
    MapView.setClickable(true);

    state.pending = buildQuestion();
    if (state.pending && state.game.preload) state.game.preload(state.pending);
  }

  function startSession() {
    if (!state.game) return;
    stopTimer();

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
    el.timerWrap.hidden = state.pace !== 'sprint';
    el.timerWrap.classList.remove('urgent');
    el.timer.textContent = SPRINT_SECONDS;

    if (state.game.onStart) state.game.onStart(ui);
    updateStats();
    nextQuestion();

    if (state.pace === 'sprint') startTimer();
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
    if (!state.game) return;
    stopTimer();
    state.running = false;
    state.locked = true;
    el.next.disabled = true;
    MapView.setClickable(false);
    tiles.forEach(function (tile) {
      tile.disabled = true;
    });
    showSummary();
  }

  function showSummary() {
    el.sumScore.textContent = state.correct;
    el.sumAccuracy.textContent = accuracyText(state.correct, state.asked);
    el.sumStreak.textContent = progressFor(state.game.id).bestStreak;
    el.summaryTitle.textContent = state.game.title + ' \u2014 session summary';
    el.missedTitle.textContent = state.missed.length ? state.game.missedTitle || 'Worth reviewing' : '';
    el.missed.textContent = '';

    if (!state.missed.length) {
      const note = document.createElement('p');
      note.className = 'missed-empty';
      note.textContent = state.asked ? 'Clean run \u2014 nothing missed.' : 'No answers yet this session.';
      el.missed.appendChild(note);
    } else {
      state.missed.forEach(function (item) {
        el.missed.appendChild(missedCard(item));
      });
    }

    el.summary.classList.remove('hidden');
    el.again.focus();
  }

  function missedCard(item) {
    if (state.game.missedCard) return state.game.missedCard(item);
    const card = document.createElement('div');
    card.className = 'missed-card missed-card-text';
    const label = document.createElement('span');
    label.textContent = labelOf(item);
    card.appendChild(label);
    return card;
  }

  /* ---------- entering and leaving a game ---------- */

  function applySettingsBar() {
    const game = state.game;
    el.controlDifficulty.hidden = !game.supports.difficulty;
    el.controlRegion.hidden = !game.supports.region;
    el.hint.innerHTML = game.hint || '';
    el.next.textContent = game.nextLabel || 'Next';
    el.promptLabel.textContent = game.promptLabel || '';
    el.board.dataset.tiles = game.tileStyle || 'text';
    el.board.hidden = game.layout !== 'tiles';
    el.stage.dataset.layout = game.layout;
    el.stage.dataset.game = game.id;
    el.gameTitle.textContent = game.title;
    el.gameBlurb.textContent = game.blurb;
    MapView.setIdleCaption(game.idleCaption);
  }

  function start(id) {
    if (!byId[id]) return false;
    if (state.game && state.game !== byId[id] && state.game.onExit) state.game.onExit();

    state.game = byId[id];
    MapView.disableClicks();
    applySettingsBar();
    if (state.game.onEnter) state.game.onEnter(ui);
    startSession();
    return true;
  }

  function leave() {
    stopTimer();
    state.running = false;
    state.locked = true;
    el.summary.classList.add('hidden');
    MapView.disableClicks();
    if (state.game && state.game.onExit) state.game.onExit();
    state.game = null;
  }

  /* ---------- setup ---------- */

  function register(game) {
    game.supports = Object.assign({ region: true, difficulty: true }, game.supports);
    game.layout = game.layout || 'tiles';
    if (!game.keyOf) {
      game.keyOf = function (item) {
        return item.code || item.id;
      };
    }
    if (!game.labelOf) {
      game.labelOf = function (item) {
        return item.name;
      };
    }
    games.push(game);
    byId[game.id] = game;
    return game;
  }

  function collect() {
    el.score = document.getElementById('stat-score');
    el.streak = document.getElementById('stat-streak');
    el.best = document.getElementById('stat-best');
    el.accuracy = document.getElementById('stat-accuracy');
    el.timer = document.getElementById('stat-timer');
    el.timerWrap = document.getElementById('stat-timer-wrap');
    el.gameTitle = document.getElementById('game-title');
    el.gameBlurb = document.getElementById('game-blurb');
    el.stage = document.getElementById('stage');
    el.promptLabel = document.getElementById('prompt-label');
    el.prompt = document.getElementById('prompt');
    el.promptMedia = document.getElementById('prompt-media');
    el.board = document.getElementById('board');
    el.feedback = document.getElementById('feedback');
    el.next = document.getElementById('btn-next');
    el.hint = document.getElementById('hint');
    el.controlDifficulty = document.getElementById('control-difficulty');
    el.controlRegion = document.getElementById('control-region');
    el.regionSelect = document.getElementById('region-select');
    el.restart = document.getElementById('btn-restart');
    el.end = document.getElementById('btn-end');
    el.again = document.getElementById('btn-again');
    el.summary = document.getElementById('summary');
    el.summaryTitle = document.getElementById('summary-title');
    el.sumScore = document.getElementById('sum-score');
    el.sumAccuracy = document.getElementById('sum-accuracy');
    el.sumStreak = document.getElementById('sum-streak');
    el.missed = document.getElementById('missed');
    el.missedTitle = document.getElementById('missed-title');
    tiles = Array.from(el.board.querySelectorAll('.tile'));
  }

  function initRegionSelect() {
    ['All'].concat(REGIONS).forEach(function (region) {
      const option = document.createElement('option');
      option.value = region;
      option.textContent = region === 'All' ? 'All regions' : region;
      el.regionSelect.appendChild(option);
    });
    el.regionSelect.value = state.region;
  }

  function bindEvents() {
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
      if (!state.game || event.altKey || event.ctrlKey || event.metaKey) return;

      if (state.game.layout === 'tiles' && event.key >= '1' && event.key <= '4') {
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
  }

  function boot() {
    if (booted) return;
    booted = true;
    collect();
    MapView.init();
    initRegionSelect();
    bindEvents();

    ui = {
      prompt: el.prompt,
      promptLabel: el.promptLabel,
      media: el.promptMedia,
      board: el.board,
      tiles: tiles,
      next: el.next,
      map: MapView,
      state: state,
      setFeedback: setFeedback,
      setPrompt: function (text) {
        el.prompt.textContent = text;
      },
      showMedia: function (node) {
        el.promptMedia.textContent = '';
        el.promptMedia.hidden = false;
        el.promptMedia.appendChild(node);
      },
      replaceOption: replaceOption,
      nextQuestion: nextQuestion,
      submit: submit,
    };
  }

  /** Lifetime numbers for a game, for the menu cards. */
  function statsFor(id) {
    const progress = saved.games[id];
    if (!progress) return { bestStreak: 0, asked: 0, correct: 0 };
    let asked = 0;
    let correct = 0;
    Object.keys(progress.scopeStats || {}).forEach(function (key) {
      asked += progress.scopeStats[key].asked || 0;
      correct += progress.scopeStats[key].correct || 0;
    });
    return { bestStreak: progress.bestStreak || 0, asked: asked, correct: correct };
  }

  return {
    register: register,
    boot: boot,
    start: start,
    leave: leave,
    submit: submit,
    restart: startSession,
    list: function () {
      return games.slice();
    },
    has: function (id) {
      return Boolean(byId[id]);
    },
    statsFor: statsFor,
    state: state,
    util: {
      shuffle: shuffle,
      sample: sample,
      byRegion: byRegion,
      accuracyText: accuracyText,
      plural: plural,
      optionCount: OPTION_COUNT,
    },
  };
})();
