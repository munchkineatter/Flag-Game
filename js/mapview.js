/* The map panel: world view, zoom-to-country, and an optional click layer.
 *
 * Reads the WORLD_MAP global from js/worldmap.js and owns every element inside
 * the map figure. Games talk to it through show/reset/enableClicks and never
 * touch the SVG themselves. */

const MapView = (function () {
  'use strict';

  /** Degrees of surrounding map kept in view, so a country is never shown without neighbours. */
  const CONTEXT_DEGREES = 24;
  const MAX_SCALE = 15;
  const ZOOM_MS = 700;
  /** Zoom at which the cheap backdrop stops being pixel-perfect and the detailed one is worth its cost. */
  const DETAIL_SCALE = 4;
  /** Countries narrower than this many map units also get a ring drawn around them. */
  const TINY = 80;
  const PIN_RADIUS = 150;
  /** Latitude at the top edge of the projection. Must match tools/build-map.mjs. */
  const LAT_TOP = 84;
  const EARTH_RADIUS_KM = 6371;

  const el = {};
  let ready = false;
  let idleCaption = 'Answer to see where it is';

  let copyId = null;
  let resizeId = null;
  let detailId = null;
  /** What is drawn on the map right now, kept so a resize can redo the zoom. */
  let showing = null;
  /** The world at two levels of detail, and which one is on the map right now. */
  let landCoarse = '';
  let landFine = '';
  let landDetailed = false;

  let hitBuilt = false;
  let clickHandler = null;

  /* ---------- setup ---------- */

  function init() {
    el.map = document.getElementById('map');
    if (!el.map || typeof WORLD_MAP === 'undefined') {
      if (el.map) el.map.hidden = true;
      return false;
    }

    el.svg = document.getElementById('map-svg');
    el.world = document.getElementById('map-world');
    el.zoom = document.getElementById('map-zoom');
    el.ocean = document.getElementById('map-ocean');
    el.land = document.getElementById('map-land');
    el.country = document.getElementById('map-country');
    el.pick = document.getElementById('map-pick');
    el.pins = document.getElementById('map-pins');
    el.hit = document.getElementById('map-hit');
    el.copyLeft = document.getElementById('map-copy-left');
    el.copyRight = document.getElementById('map-copy-right');
    el.caption = document.getElementById('map-caption');

    const outlines = Object.keys(WORLD_MAP.countries).map(function (code) {
      return WORLD_MAP.countries[code].d;
    });
    landFine = WORLD_MAP.other + outlines.join('');
    landCoarse = WORLD_MAP.land || landFine;
    landDetailed = true;
    setLandDetail(false);

    el.svg.setAttribute('viewBox', '0 0 ' + WORLD_MAP.width + ' ' + WORLD_MAP.height);
    el.map.style.setProperty('--map-aspect', WORLD_MAP.width + ' / ' + WORLD_MAP.height);
    el.ocean.setAttribute('width', WORLD_MAP.width);
    el.ocean.setAttribute('height', WORLD_MAP.height);
    el.copyLeft.setAttribute('x', -WORLD_MAP.width);
    el.copyRight.setAttribute('x', WORLD_MAP.width);

    el.svg.addEventListener('click', onMapClick);
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeId);
      resizeId = window.setTimeout(refresh, 150);
    });

    ready = true;
    return true;
  }

  /* ---------- geometry ---------- */

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function pxPerDegree() {
    return WORLD_MAP.width / 360;
  }

  function known(country) {
    return Boolean(country && (WORLD_MAP.countries[country.code] || WORLD_MAP.points[country.code]));
  }

  function hasShape(code) {
    return Boolean(WORLD_MAP.countries[code]);
  }

  /** Every country reduced to the same [x, y, width, height] shape, points included. */
  function boxOf(country) {
    const shape = WORLD_MAP.countries[country.code];
    if (shape) return shape.box;
    const point = WORLD_MAP.points[country.code];
    return [point[0], point[1], 0, 0];
  }

  function mergeBoxes(boxes) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    boxes.forEach(function (box) {
      if (box[0] < minX) minX = box[0];
      if (box[1] < minY) minY = box[1];
      if (box[0] + box[2] > maxX) maxX = box[0] + box[2];
      if (box[1] + box[3] > maxY) maxY = box[1] + box[3];
    });
    return [minX, minY, maxX - minX, maxY - minY];
  }

  function centerOf(country) {
    const box = boxOf(country);
    return { x: box[0] + box[2] / 2, y: box[1] + box[3] / 2 };
  }

  function toLatLng(x, y) {
    return { lat: LAT_TOP - y / pxPerDegree(), lon: x / pxPerDegree() - 180 };
  }

  /** Great-circle distance between two map points, in kilometres. */
  function distanceKm(a, b) {
    const from = toLatLng(a.x, a.y);
    const to = toLatLng(b.x, b.y);
    const rad = Math.PI / 180;
    const dLat = (to.lat - from.lat) * rad;
    const dLon = (to.lon - from.lon) * rad;
    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(from.lat * rad) * Math.cos(to.lat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h))));
  }

  /* ---------- backdrop detail ---------- */

  /** The whole backdrop is repainted on every frame of a zoom, so it carries only as much
   * detail as the current view can show. Anything finer costs frames and looks identical. */
  function setLandDetail(detailed) {
    if (detailed === landDetailed) return;
    landDetailed = detailed;
    el.land.setAttribute('d', detailed ? landFine : landCoarse);
  }

  /** Detail is swapped in partway through the zoom rather than at the end: by then the view is
   * narrow enough that most of the world is clipped away, and the movement hides the change. */
  function detailWhenClose(scale) {
    window.clearTimeout(detailId);
    if (scale < DETAIL_SCALE) {
      setLandDetail(false);
      return;
    }
    detailId = window.setTimeout(function () {
      setLandDetail(true);
    }, ZOOM_MS * 0.6);
  }

  /* ---------- zooming ---------- */

  /** How much of the map is on screen, in map units. The panel rarely has the same shape as
   * the map, and the SVG letterboxes the difference, so this cannot be read off the viewBox. */
  function viewport() {
    const rect = el.svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return { width: WORLD_MAP.width, height: WORLD_MAP.height };
    const fit = Math.min(rect.width / WORLD_MAP.width, rect.height / WORLD_MAP.height);
    return { width: rect.width / fit, height: rect.height / fit };
  }

  function zoomTo(centerX, centerY, scale) {
    const view = viewport();
    const halfWidth = view.width / (2 * scale);
    const halfHeight = view.height / (2 * scale);
    const y = halfHeight * 2 >= WORLD_MAP.height
      ? WORLD_MAP.height / 2
      : clamp(centerY, halfHeight, WORLD_MAP.height - halfHeight);

    el.zoom.style.transform =
      'translate(' +
      (WORLD_MAP.width / 2 - scale * centerX) + 'px, ' +
      (WORLD_MAP.height / 2 - scale * y) + 'px) scale(' + scale + ')';

    // A degree of slack, so the world view does not pay for copies it cannot show.
    useWorldCopies(centerX - halfWidth < -30, centerX + halfWidth > WORLD_MAP.width + 30);
  }

  /** Copies of the world sit either side of the original so views across the date line stay
   * whole. Drawing the world twice over is the most expensive thing the panel can do, and a
   * wide view never reaches past the date line anyway, so the switch waits until the zoom is
   * well under way: too late to cost anything, too early to be seen. */
  function useWorldCopies(left, right) {
    window.clearTimeout(copyId);
    copyId = window.setTimeout(function () {
      el.map.classList.toggle('wrap-left', left);
      el.map.classList.toggle('wrap-right', right);
    }, ZOOM_MS * 0.4);
  }

  /** Scale that fits a box with room for its surroundings, capped so a tiny country
   * does not fill the panel with empty sea. */
  function scaleFor(box) {
    const view = viewport();
    const context = CONTEXT_DEGREES * pxPerDegree();
    const spanX = Math.max(box[2] * 1.5, context);
    const spanY = Math.max(box[3] * 1.5, (context * view.height) / view.width);
    return clamp(Math.min(view.width / spanX, view.height / spanY), 1, MAX_SCALE);
  }

  /* ---------- highlighting ---------- */

  function pin(x, y, radius) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('class', 'map-pin');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', radius);
    el.pins.appendChild(circle);
  }

  /** Draws one or more countries and zooms to fit them all. */
  function show(countries, options) {
    if (!ready) return;
    const list = (Array.isArray(countries) ? countries : [countries]).filter(known);
    if (!list.length) {
      reset();
      return;
    }

    const settings = options || {};
    const box = mergeBoxes(list.map(boxOf));
    const centerX = box[0] + box[2] / 2;
    const centerY = box[1] + box[3] / 2;
    const scale = scaleFor(box);

    el.country.setAttribute(
      'd',
      list
        .filter(function (country) {
          return hasShape(country.code);
        })
        .map(function (country) {
          return WORLD_MAP.countries[country.code].d;
        })
        .join('')
    );

    el.pins.textContent = '';
    list.forEach(function (country) {
      const own = boxOf(country);
      if (own[2] >= TINY && own[3] >= TINY) return;
      pin(own[0] + own[2] / 2, own[1] + own[3] / 2, PIN_RADIUS / scale);
    });

    zoomTo(centerX, centerY, scale);
    detailWhenClose(scale);
    showing = { countries: list, caption: settings.caption };
    el.map.classList.add('located');
    el.caption.textContent =
      settings.caption || (list.length === 1 ? list[0].name + ' \u00b7 ' + list[0].region : list.length + ' countries');
  }

  /** A second, differently coloured country: where the player clicked, when that was wrong. */
  function markPick(country) {
    if (!ready) return;
    el.pick.setAttribute('d', country && hasShape(country.code) ? WORLD_MAP.countries[country.code].d : '');
    el.map.classList.toggle('has-pick', Boolean(country) && hasShape(country.code));
  }

  function reset() {
    if (!ready) return;
    showing = null;
    window.clearTimeout(detailId);
    setLandDetail(false);
    el.map.classList.remove('located', 'has-pick');
    el.country.setAttribute('d', '');
    el.pick.setAttribute('d', '');
    el.pins.textContent = '';
    el.caption.textContent = idleCaption;
    zoomTo(WORLD_MAP.width / 2, WORLD_MAP.height / 2, 1);
  }

  function refresh() {
    if (!ready) return;
    if (showing) show(showing.countries, { caption: showing.caption });
    else zoomTo(WORLD_MAP.width / 2, WORLD_MAP.height / 2, 1);
  }

  function setIdleCaption(text) {
    idleCaption = text || 'Answer to see where it is';
    if (ready && !showing) el.caption.textContent = idleCaption;
  }

  /* ---------- click layer ---------- */

  /** One transparent shape per country, so a click resolves to an ISO code.
   * Built once, on the first game that asks for it. */
  function buildHitLayer() {
    if (hitBuilt) return;
    const ns = 'http://www.w3.org/2000/svg';
    const fragment = document.createDocumentFragment();

    Object.keys(WORLD_MAP.countries).forEach(function (code) {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', WORLD_MAP.countries[code].d);
      path.setAttribute('data-code', code);
      fragment.appendChild(path);
    });

    // Countries too small to draw still need something to aim at.
    Object.keys(WORLD_MAP.points).forEach(function (code) {
      const point = WORLD_MAP.points[code];
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', point[0]);
      circle.setAttribute('cy', point[1]);
      circle.setAttribute('r', PIN_RADIUS);
      circle.setAttribute('data-code', code);
      fragment.appendChild(circle);
    });

    el.hit.appendChild(fragment);
    hitBuilt = true;
  }

  /** Where a pointer event landed, in map units. */
  function eventPoint(event) {
    const matrix = el.world.getScreenCTM();
    if (!matrix) return null;
    const point = el.svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const mapped = point.matrixTransform(matrix.inverse());
    return { x: mapped.x, y: mapped.y };
  }

  function onMapClick(event) {
    if (!clickHandler) return;
    const target = event.target.closest('[data-code]');
    const point = eventPoint(event);
    if (!point) return;
    clickHandler({ code: target ? target.getAttribute('data-code') : null, x: point.x, y: point.y });
  }

  function enableClicks(handler) {
    if (!ready) return;
    buildHitLayer();
    clickHandler = handler;
    el.map.classList.add('clickable');
  }

  function disableClicks() {
    clickHandler = null;
    if (ready) el.map.classList.remove('clickable');
  }

  /** Stops clicks landing while an answer is being revealed, without tearing the layer down. */
  function setClickable(on) {
    if (ready) el.map.classList.toggle('locked', !on);
  }

  return {
    init: init,
    show: show,
    markPick: markPick,
    reset: reset,
    refresh: refresh,
    setIdleCaption: setIdleCaption,
    enableClicks: enableClicks,
    disableClicks: disableClicks,
    setClickable: setClickable,
    centerOf: centerOf,
    distanceKm: distanceKm,
    hasShape: hasShape,
    isReady: function () {
      return ready;
    },
  };
})();
