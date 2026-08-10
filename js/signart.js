/* Draws a road sign from a description of its shape and colours.
 *
 * Every sign in the game names a picture on Wikimedia Commons, and that is what
 * you normally see. This is the understudy for when the network is down or a
 * file has been renamed. It is a fair substitute because the thing the game is
 * actually testing — the outline and the colours — is exactly what it can draw;
 * only the pictogram inside is lost, and each sign says in words what it means.
 *
 * A description looks like:
 *   { shape: 'triangle', fill: '#fff', border: '#d52b1e', text: '!' }
 *
 * Shapes are laid out in a 100 x 100 box. The border is drawn by filling the
 * outline in the border colour and laying a shrunken copy on top in the fill
 * colour, which keeps the border parallel to every edge. */

const SignArt = (function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  const SHAPES = {
    octagon: [[29.3, 0], [70.7, 0], [100, 29.3], [100, 70.7], [70.7, 100], [29.3, 100], [0, 70.7], [0, 29.3]],
    triangle: [[50, 3], [97, 84], [3, 84]],
    'triangle-down': [[3, 16], [97, 16], [50, 97]],
    diamond: [[50, 1], [99, 50], [50, 99], [1, 50]],
    pentagon: [[50, 2], [97, 37], [79, 97], [21, 97], [3, 37]],
    rect: [[2, 16], [98, 16], [98, 84], [2, 84]],
    'rect-tall': [[10, 2], [90, 2], [90, 98], [10, 98]],
  };

  /** Default gap between the outline and the face, as a share of the shape. */
  const RING = {
    circle: 0.74,
    octagon: 0.82,
    triangle: 0.78,
    'triangle-down': 0.74,
    diamond: 0.84,
    pentagon: 0.86,
    rect: 0.9,
    'rect-tall': 0.88,
  };

  function node(name, attrs) {
    const element = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (key) {
      element.setAttribute(key, attrs[key]);
    });
    return element;
  }

  function centroid(points) {
    return points.reduce(
      function (acc, point) {
        return [acc[0] + point[0] / points.length, acc[1] + point[1] / points.length];
      },
      [0, 0]
    );
  }

  /** The shape shrunk towards its own centre, so borders stay parallel. */
  function pointsAt(points, scale) {
    const mid = centroid(points);
    return points
      .map(function (point) {
        return (mid[0] + (point[0] - mid[0]) * scale).toFixed(2) + ',' + (mid[1] + (point[1] - mid[1]) * scale).toFixed(2);
      })
      .join(' ');
  }

  function face(shape, scale, fill) {
    if (shape === 'circle') return node('circle', { cx: 50, cy: 50, r: (49 * scale).toFixed(2), fill: fill });
    return node('polygon', { points: pointsAt(SHAPES[shape] || SHAPES.rect, scale), fill: fill });
  }

  /* How much of the 100-wide box the lettering may use, and where it sits. A
   * triangle has no room at its point, so its text drops towards the base. */
  const TEXT_ROOM = {
    circle: { width: 62, height: 56, middle: 52 },
    octagon: { width: 70, height: 58, middle: 52 },
    triangle: { width: 46, height: 32, middle: 62 },
    'triangle-down': { width: 44, height: 32, middle: 40 },
    diamond: { width: 52, height: 44, middle: 52 },
    pentagon: { width: 58, height: 48, middle: 58 },
    rect: { width: 72, height: 48, middle: 52 },
    'rect-tall': { width: 62, height: 66, middle: 52 },
  };

  /** Rough advance width per character, since CJK glyphs are close to square. */
  function textWidth(line) {
    return Array.from(line).reduce(function (total, character) {
      return total + (/[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(character) ? 1.02 : 0.62);
    }, 0);
  }

  function addText(svg, spec) {
    const lines = String(spec.text).split('\n');
    const widest = lines.reduce(function (max, line) {
      return Math.max(max, textWidth(line));
    }, 1);

    // Fit to whichever runs out first, the width or the stack of lines.
    const room = TEXT_ROOM[spec.shape] || TEXT_ROOM.rect;
    const size = Math.min(room.width / widest, room.height / (lines.length * 1.05));
    const start = room.middle - ((lines.length - 1) * size * 1.05) / 2;

    lines.forEach(function (line, index) {
      const text = node('text', {
        x: 50,
        y: (start + index * size * 1.05).toFixed(2),
        fill: spec.ink || '#111',
        'font-size': size.toFixed(2),
        'font-weight': '700',
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      text.textContent = line;
      svg.appendChild(text);
    });
  }

  /** Pictograms are drawn full-box, then shrunk to fit whatever shape holds them. */
  const GLYPH_FIT = {
    circle: { scale: 0.84, middle: 50 },
    octagon: { scale: 0.88, middle: 50 },
    triangle: { scale: 0.58, middle: 62 },
    'triangle-down': { scale: 0.56, middle: 42 },
    diamond: { scale: 0.72, middle: 50 },
    pentagon: { scale: 0.76, middle: 56 },
    rect: { scale: 0.76, middle: 50 },
    'rect-tall': { scale: 0.9, middle: 50 },
  };

  /* Pictograms simple enough to be worth drawing. Anything more detailed than
   * these reads better as the sign's own wording. */
  const GLYPHS = {
    bar: function (spec) {
      return [node('rect', { x: 18, y: 43, width: 64, height: 14, rx: 2, fill: spec.ink || '#fff' })];
    },
    bend: function (spec) {
      return [
        node('path', {
          d: 'M42 78 L42 52 Q42 34 60 34 L60 34',
          fill: 'none',
          stroke: spec.ink || '#111',
          'stroke-width': 9,
        }),
        node('polygon', { points: '52,20 76,34 52,48', fill: spec.ink || '#111' }),
      ];
    },
    cross: function (spec) {
      return [
        node('rect', { x: 44, y: 22, width: 12, height: 56, fill: spec.ink || '#111' }),
        node('rect', { x: 22, y: 44, width: 56, height: 12, fill: spec.ink || '#111' }),
      ];
    },
    person: function (spec) {
      const ink = spec.ink || '#111';
      return [
        node('circle', { cx: 50, cy: 28, r: 8, fill: ink }),
        node('path', { d: 'M50 38 L50 62', stroke: ink, 'stroke-width': 8, 'stroke-linecap': 'round' }),
        node('path', { d: 'M50 62 L38 82 M50 62 L62 82', stroke: ink, 'stroke-width': 8, fill: 'none', 'stroke-linecap': 'round' }),
        node('path', { d: 'M36 46 L64 42', stroke: ink, 'stroke-width': 7, 'stroke-linecap': 'round' }),
      ];
    },
    motorway: function (spec) {
      const ink = spec.ink || '#fff';
      return [
        node('path', { d: 'M30 84 L30 34 Q30 20 44 20', stroke: ink, 'stroke-width': 8, fill: 'none' }),
        node('path', { d: 'M70 84 L70 34 Q70 20 56 20', stroke: ink, 'stroke-width': 8, fill: 'none' }),
        node('rect', { x: 46, y: 40, width: 8, height: 44, fill: ink }),
      ];
    },
    hand: function (spec) {
      const ink = spec.ink || '#fff';
      const fingers = [30, 40, 50, 60].map(function (x) {
        return node('rect', { x: x - 4, y: 26, width: 8, height: 30, rx: 4, fill: ink });
      });
      return fingers.concat([
        node('rect', { x: 26, y: 46, width: 38, height: 30, rx: 8, fill: ink }),
        node('rect', { x: 62, y: 44, width: 8, height: 22, rx: 4, fill: ink, transform: 'rotate(28 66 55)' }),
      ]);
    },
    shield: function (spec) {
      return [
        node('path', {
          d: 'M50 14 L82 24 Q82 62 50 82 Q18 62 18 24 Z',
          fill: spec.ink || '#fff',
          stroke: '#111',
          'stroke-width': 3,
        }),
      ];
    },
  };

  /** Builds the sign as a standalone <svg>. */
  function draw(spec, options) {
    const settings = options || {};
    const svg = node('svg', {
      viewBox: '0 0 100 100',
      class: 'sign-art',
      role: 'img',
      'aria-label': settings.label || 'road sign',
    });

    if (spec.plate) {
      svg.appendChild(node('rect', { x: 0, y: 12, width: 100, height: 76, rx: 4, fill: '#fff', stroke: '#8a8f98', 'stroke-width': 1.5 }));
    }

    const shape = spec.shape || 'rect';
    const scale = spec.plate ? 0.62 : 1;
    const inner = (spec.ring || RING[shape] || 0.85) * scale;

    if (spec.border) svg.appendChild(face(shape, scale, spec.border));
    svg.appendChild(face(shape, spec.border ? inner : scale, spec.fill || '#fff'));

    if (spec.glyph && GLYPHS[spec.glyph]) {
      const fit = GLYPH_FIT[shape] || GLYPH_FIT.rect;
      const group = node('g', {
        transform: 'translate(50 ' + fit.middle + ') scale(' + fit.scale + ') translate(-50 -50)',
      });
      GLYPHS[spec.glyph](spec).forEach(function (part) {
        group.appendChild(part);
      });
      svg.appendChild(group);
    }
    if (spec.text) addText(svg, spec);

    return svg;
  }

  return { draw: draw };
})();
