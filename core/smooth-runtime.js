/**
 * AETHER Smooth Runtime — one rAF ticker for every optional effect.
 * Zero-build classic script. No dependencies, no pack assumptions.
 * Loads before or after the packs; they feature-detect this global.
 */
(function (g) {
  'use strict';

  var doc = g.document || (typeof document !== 'undefined' ? document : null);
  var raf = g.requestAnimationFrame || function (cb) {
    return (g.setTimeout || setTimeout)(function () { cb(Date.now()); }, 16);
  };
  var caf = g.cancelAnimationFrame || function (id) {
    (g.clearTimeout || clearTimeout)(id);
  };

  /* ── Motion preference: read live, never cached as a hard dependency. */
  var mq = null;
  var _override = null; // null = follow the OS; explicit bool wins when set
  try {
    if (g.matchMedia) mq = g.matchMedia('(prefers-reduced-motion: reduce)');
  } catch (e) {}
  if (mq) {
    try {
      if (mq.addEventListener) mq.addEventListener('change', function () {});
      else if (mq.addListener) mq.addListener(function () {});
    } catch (e) {}
  }

  function prefersReducedMotion() {
    if (_override !== null) return !_override;
    return !!(mq && mq.matches);
  }
  function motionEnabled() { return !prefersReducedMotion(); }
  function setMotionEnabled(on) { _override = !!on; }

  /* ── One ticker. Subscribers get a rAF timestamp; a thrown callback is
     isolated so one bad pack cannot stall the whole frame bus. */
  var _subs = [];
  var _rafId = null;
  var _ticking = false;
  var _hidden = !!(doc && doc.hidden);

  function stopTicker() {
    _ticking = false;
    if (_rafId !== null) { caf(_rafId); _rafId = null; }
  }
  function tick(ts) {
    _rafId = null;
    if (_hidden || !_subs.length) { _ticking = false; return; }
    var list = _subs.slice();
    for (var i = 0; i < list.length; i++) {
      if (_subs.indexOf(list[i]) === -1) continue; // unsubscribed mid-frame
      try { list[i](ts); } catch (e) { /* keep the bus alive */ }
    }
    if (_hidden || !_subs.length) { _ticking = false; return; }
    _rafId = raf(tick);
  }
  function startTicker() {
    if (_ticking || _hidden || !_subs.length) return;
    _ticking = true;
    _rafId = raf(tick);
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return fn;
    if (_subs.indexOf(fn) === -1) _subs.push(fn);
    startTicker();
    return fn;
  }
  function unsubscribe(fn) {
    var i = _subs.indexOf(fn);
    if (i !== -1) _subs.splice(i, 1);
    if (!_subs.length) stopTicker();
    return fn;
  }

  // Background tabs cost nothing. Foreground tabs resume where they left off.
  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('visibilitychange', function () {
      _hidden = !!doc.hidden;
      if (_hidden) stopTicker();
      else startTicker();
    });
  }

  /** Run fn only while el is on-screen. Returns a one-shot cleanup.
   *  No IntersectionObserver → behaves like a plain subscribe(). */
  function pauseWhenVisible(el, fn) {
    if (typeof fn !== 'function') return function () {};
    var io = null;
    var attached = false;
    var live = true;
    if (el && g.IntersectionObserver) {
      try {
        io = new g.IntersectionObserver(function (entries) {
          if (!live) return;
          var e = entries[entries.length - 1];
          var vis = !!(e && e.isIntersecting);
          if (vis && !attached) { attached = true; subscribe(fn); }
          else if (!vis && attached) { attached = false; unsubscribe(fn); }
        }, { root: null, rootMargin: '0px', threshold: 0 });
        io.observe(el);
      } catch (err) { io = null; }
    }
    if (!io) subscribe(fn);
    return function stop() {
      if (!live) return;
      live = false;
      if (io) { try { io.disconnect(); } catch (e) {} }
      if (attached) unsubscribe(fn);
    };
  }

  /** Coalesce a burst of calls into one invocation on the next frame.
   *  .cancel() drops a pending call without retiring the wrapper. */
  function throttleToFrame(fn) {
    if (typeof fn !== 'function') return function () {};
    var pending = false;
    var args = null;
    var ctx = null;
    function run() {
      pending = false;
      var a = args, c = ctx;
      args = null; ctx = null;
      unsubscribe(run);
      try { fn.apply(c, a || []); } catch (e) {}
    }
    var wrapped = function () {
      ctx = this;
      args = arguments;
      if (!pending) { pending = true; subscribe(run); }
    };
    wrapped.cancel = function () {
      pending = false;
      args = null;
      ctx = null;
      unsubscribe(run);
    };
    return wrapped;
  }

  g.AETHER_Smooth = {
    version: '1.0',
    subscribe: subscribe,
    unsubscribe: unsubscribe,
    motionEnabled: motionEnabled,
    prefersReducedMotion: prefersReducedMotion,
    setMotionEnabled: setMotionEnabled,
    pauseWhenVisible: pauseWhenVisible,
    throttleToFrame: throttleToFrame
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
