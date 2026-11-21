/**
 * AETHER Mobile UI — small viewport helpers
 * Copyright (C) 2026 The Architect · GPL-3.0-or-later
 *
 * Classic script. No deps. No build. Self-inits on DOMContentLoaded.
 * CSS does the heavy lifting; this only keeps state classes honest and
 * adds a ⋯ toggle for the compact header. Missing nodes are a no-op.
 */
(function (g) {
  'use strict';

  var ROOT = document.documentElement;
  var EXPANDED = 'mobile-header-expanded';
  var TOGGLE_ID = 'mobile-header-toggle';

  var ready = false;

  function one(sel) {
    try { return document.querySelector(sel); } catch (e) { return null; }
  }

  function on(node, type, fn) {
    if (node && typeof node.addEventListener === 'function') node.addEventListener(type, fn);
  }

  function setClass(node, cls, yes) {
    if (!node || !node.classList) return;
    if (yes) node.classList.add(cls); else node.classList.remove(cls);
  }

  function mq(query) {
    try { return !!(g.matchMedia && g.matchMedia(query).matches); } catch (e) { return false; }
  }

  function isMobileUI() {
    return mq('(max-width: 820px)') || (typeof g.innerWidth === 'number' && g.innerWidth <= 820);
  }

  function isCompact() {
    return mq('(max-width: 480px)') || (typeof g.innerWidth === 'number' && g.innerWidth <= 480);
  }

  // Header overflow toggle — injected, so index.html stays untouched.
  function makeToggle() {
    if (one('#' + TOGGLE_ID)) return;
    var host = one('.status-right') || one('.status-bar');
    if (!host || typeof host.appendChild !== 'function' || typeof document.createElement !== 'function') return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = TOGGLE_ID;
    btn.className = 'mobile-header-toggle';
    btn.textContent = '⋯';
    btn.setAttribute('aria-label', 'Show more status');
    btn.setAttribute('aria-expanded', ROOT.classList.contains(EXPANDED) ? 'true' : 'false');

    on(btn, 'click', function () {
      var open = ROOT.classList.toggle(EXPANDED);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'Hide extra status' : 'Show more status');
    });

    try { host.appendChild(btn); } catch (e) {}
  }

  function dropToggle() {
    var btn = one('#' + TOGGLE_ID);
    if (btn && btn.parentNode) {
      try { btn.parentNode.removeChild(btn); } catch (e) {}
    }
    setClass(ROOT, EXPANDED, false);
  }

  // Recompute classes + toggle. Safe to call any time (rotation, panels, tests).
  function refresh() {
    var mobile = isMobileUI();
    var compact = isCompact();
    var body = document.body;

    setClass(ROOT, 'mobile-ui', mobile);
    setClass(ROOT, 'mobile-ui-compact', compact);
    setClass(body, 'mobile-ui', mobile);
    setClass(body, 'mobile-ui-compact', compact);

    if (mobile && compact) makeToggle();
    else dropToggle();

    var btn = one('#' + TOGGLE_ID);
    if (btn) btn.setAttribute('aria-expanded', ROOT.classList.contains(EXPANDED) ? 'true' : 'false');
  }

  function init() {
    if (ready) { refresh(); return; }
    ready = true;
    refresh();

    var queued = false;
    function onResize() {
      if (queued) return;
      queued = true;
      var run = function () { queued = false; refresh(); };
      if (typeof g.requestAnimationFrame === 'function') g.requestAnimationFrame(run);
      else run();
    }
    on(g, 'resize', onResize);
    on(g, 'orientationchange', onResize);
  }

  g.AETHER_MobileUI = { refresh: refresh, init: init };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
