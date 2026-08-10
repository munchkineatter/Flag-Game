/* Menu, routing and boot.
 *
 * Routing is done with the hash so the page still works from file:// without a
 * local server. An empty hash is the menu; #/<game id> is that game. */

(function () {
  'use strict';

  const menu = document.getElementById('menu');
  const app = document.getElementById('app');
  const grid = document.getElementById('menu-grid');
  const summary = document.getElementById('summary');

  GameEngine.boot();

  /* ---------- menu ---------- */

  function card(game) {
    const link = document.createElement('a');
    link.className = 'menu-card';
    link.href = '#/' + game.id;
    link.dataset.game = game.id;

    const kicker = document.createElement('span');
    kicker.className = 'menu-kicker';
    kicker.textContent = game.trains || '';

    const title = document.createElement('h2');
    title.textContent = game.title;

    const blurb = document.createElement('p');
    blurb.className = 'menu-blurb';
    blurb.textContent = game.blurb;

    const stats = document.createElement('p');
    stats.className = 'menu-stats';

    link.append(kicker, title, blurb, stats);
    return link;
  }

  function buildMenu() {
    GameEngine.list().forEach(function (game) {
      grid.appendChild(card(game));
    });
  }

  function refreshMenuStats() {
    GameEngine.list().forEach(function (game) {
      const line = grid.querySelector('[data-game="' + game.id + '"] .menu-stats');
      if (!line) return;
      const stats = GameEngine.statsFor(game.id);
      line.textContent = stats.asked
        ? GameEngine.util.accuracyText(stats.correct, stats.asked) +
          ' over ' +
          GameEngine.util.plural(stats.asked, 'answer') +
          ' \u00b7 best streak ' +
          stats.bestStreak
        : 'Not played yet';
    });
  }

  /* ---------- routing ---------- */

  function currentId() {
    return (window.location.hash || '').replace(/^#\/?/, '');
  }

  function showMenu() {
    GameEngine.leave();
    app.hidden = true;
    menu.hidden = false;
    refreshMenuStats();
    document.title = 'Geo Trainer — GeoGuessr practice drills';
  }

  function showGame(id) {
    menu.hidden = true;
    app.hidden = false;
    // The map measures itself against the panel, so the panel has to be on screen first.
    GameEngine.start(id);
    MapView.refresh();
    document.title = document.getElementById('game-title').textContent + ' — Geo Trainer';
  }

  function route() {
    const id = currentId();
    if (id && GameEngine.has(id)) showGame(id);
    else showMenu();
  }

  function goToMenu() {
    if (currentId()) window.location.hash = '';
    else route();
  }

  window.addEventListener('hashchange', route);

  document.getElementById('btn-menu').addEventListener('click', goToMenu);
  document.getElementById('btn-summary-menu').addEventListener('click', goToMenu);

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (!summary.classList.contains('hidden')) {
      summary.classList.add('hidden');
      return;
    }
    if (!app.hidden) goToMenu();
  });

  buildMenu();
  route();
})();
