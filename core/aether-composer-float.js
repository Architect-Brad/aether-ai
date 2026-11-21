/**
 * AETHER Composer Float — snap chat input raised ↔ docked
 * Copyright (C) 2026 The Architect · GPL-3.0-or-later
 *
 * Problem: on many mobile browsers the bottom input sits under chrome /
 * home-indicator / soft keyboard — hard to reach.
 *
 * Solution: two snap modes
 *   raised — floating bar above keyboard + raise offset (Kernel height band)
 *   docked — classic bottom of chat column; scroll chat into view
 *
 * Drag the handle, tap the float toggle, or let focus auto-raise on narrow screens.
 */
(function (g) {
  'use strict';

  var VERSION = '1.0';
  var MODE_KEY = 'aether_composer_mode_v1';
  var RAISE_PX = 96; // snap height above keyboard/safe bottom (near Kernel zone)
  var DRAG_THRESHOLD = 36;

  var _mode = 'raised'; // default raised on first visit for mobile-friendly UX
  var _deck = null;
  var _spacer = null;
  var _handle = null;
  var _toggle = null;
  var _dragging = false;
  var _dragStartY = 0;
  var _dragDelta = 0;
  var _didDragSnap = false; // prevent click from undoing pointer-up snap
  var _bound = false;
  var _handlers = []; // tracked so disabling the pack can unbind every listener
  var _ro = null;
  var _throttledCache = null; // runtime-bound wrappers, reset on destroy

  // Smooth runtime is optional; this pack also stands alone.
  function smoothRuntime() {
    return g.AETHER_Smooth || null;
  }

  /** Defer a one-shot callback to the next frame via the shared ticker. */
  function nextFrame(cb) {
    var s = smoothRuntime();
    if (s && typeof s.throttleToFrame === 'function') {
      s.throttleToFrame(function () { cb(); })();
    } else if (g.requestAnimationFrame) {
      g.requestAnimationFrame(cb);
    } else {
      setTimeout(cb, 16);
    }
  }

  /** Coalesce rapid event writes into one call per frame. */
  function throttled(key, fn) {
    var s = smoothRuntime();
    if (!s || typeof s.throttleToFrame !== 'function') return fn;
    if (!_throttledCache) _throttledCache = {};
    if (!_throttledCache[key]) _throttledCache[key] = s.throttleToFrame(fn);
    return _throttledCache[key];
  }

  function isNarrow() {
    return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 820px)').matches;
  }

  function loadMode() {
    try {
      var m = localStorage.getItem(MODE_KEY);
      if (m === 'docked' || m === 'raised') return m;
    } catch (e) {}
    // First visit: raised on phone, docked on wide desktop
    return isNarrow() ? 'raised' : 'docked';
  }

  function saveMode(m) {
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch (e) {}
  }

  function ensureEls() {
    _deck = document.querySelector('.input-deck');
    if (!_deck) return false;

    // Drag / snap handle
    if (!_deck.querySelector('.composer-float-handle')) {
      _handle = document.createElement('button');
      _handle.type = 'button';
      _handle.className = 'composer-float-handle';
      _handle.id = 'composer-float-handle';
      _handle.setAttribute('aria-label', 'Drag to raise or dock chat input');
      _handle.title = 'Drag up to raise · Drag down to dock';
      _handle.innerHTML =
        '<span class="composer-float-grip" aria-hidden="true"></span>' +
        '<span class="composer-float-hint" id="composer-float-hint">RAISED</span>';
      _deck.insertBefore(_handle, _deck.firstChild);
    } else {
      _handle = _deck.querySelector('.composer-float-handle');
    }

    // Toggle in footer if present
    var footer = _deck.querySelector('.input-footer .input-info') || _deck.querySelector('.input-footer');
    if (footer && !document.getElementById('composer-float-toggle')) {
      _toggle = document.createElement('button');
      _toggle.type = 'button';
      _toggle.id = 'composer-float-toggle';
      _toggle.className = 'composer-float-toggle';
      _toggle.title = 'Toggle floating composer';
      footer.appendChild(_toggle);
    } else {
      _toggle = document.getElementById('composer-float-toggle');
    }

    // Spacer keeps layout when deck is position:fixed
    if (!_deck.previousElementSibling || !_deck.previousElementSibling.classList.contains('input-deck-spacer')) {
      _spacer = document.createElement('div');
      _spacer.className = 'input-deck-spacer';
      _spacer.id = 'input-deck-spacer';
      _spacer.setAttribute('aria-hidden', 'true');
      _deck.parentNode.insertBefore(_spacer, _deck);
    } else {
      _spacer = _deck.previousElementSibling;
    }
    return true;
  }

  function updateViewportInsets() {
    var kb = 0;
    var offsetTop = 0;
    if (window.visualViewport) {
      var vv = window.visualViewport;
      kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      offsetTop = vv.offsetTop || 0;
    }
    document.documentElement.style.setProperty('--composer-kb', kb + 'px');
    document.documentElement.style.setProperty('--composer-vv-top', offsetTop + 'px');
    document.documentElement.style.setProperty(
      '--composer-raise',
      _mode === 'raised' ? RAISE_PX + 'px' : '0px'
    );
    document.body.classList.toggle('composer-kb-open', kb > 60);
    syncSpacer();
    return kb;
  }

  function syncSpacer() {
    if (!_deck || !_spacer) return;
    if (_mode === 'raised' || _deck.classList.contains('is-floating')) {
      // Measure deck height for chat padding
      var h = _deck.offsetHeight || 0;
      var raise = _mode === 'raised' ? RAISE_PX : 0;
      var kb = 0;
      try {
        kb = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--composer-kb'), 10) || 0;
      } catch (e) {}
      _spacer.style.height = h + raise + Math.min(kb, 40) + 'px';
      _spacer.style.display = 'block';
      document.documentElement.style.setProperty('--composer-deck-h', h + 'px');
    } else {
      _spacer.style.height = '0px';
      _spacer.style.display = 'none';
      document.documentElement.style.setProperty('--composer-deck-h', '0px');
    }
  }

  function scrollChatToEnd(smooth) {
    var srt = smoothRuntime();
    var reduce = srt && typeof srt.motionEnabled === 'function' && !srt.motionEnabled();
    var behavior = smooth && !reduce ? 'smooth' : 'auto';
    var display =
      document.getElementById('chat-display') ||
      document.getElementById('messages') ||
      document.getElementById('chat-messages') ||
      document.querySelector('.chat-display') ||
      document.querySelector('.messages-container') ||
      document.querySelector('#display');
    // Common AETHER targets
    var candidates = [
      display,
      document.getElementById('chat-container'),
      document.querySelector('.chat-area'),
      document.querySelector('.messages'),
      document.querySelector('main'),
    ].filter(Boolean);

    candidates.forEach(function (el) {
      try {
        if (typeof el.scrollTo === 'function') {
          el.scrollTo({ top: el.scrollHeight, behavior: behavior });
        } else {
          el.scrollTop = el.scrollHeight;
        }
      } catch (e) {}
    });

    // Force browser layout / address-bar settle on mobile
    try {
      if (_deck && typeof _deck.scrollIntoView === 'function') {
        _deck.scrollIntoView({ block: 'end', behavior: behavior });
      }
      // Nudge window so chrome collapses toward bottom when docking
      if (_mode === 'docked' && window.scrollY > 0) {
        window.scrollTo({ top: document.body.scrollHeight, behavior: behavior });
      }
    } catch (e2) {}
  }

  function setMode(mode, opts) {
    opts = opts || {};
    if (mode !== 'raised' && mode !== 'docked') return;
    _mode = mode;
    saveMode(mode);
    if (!_deck && !ensureEls()) return;

    document.body.classList.toggle('composer-raised', mode === 'raised');
    document.body.classList.toggle('composer-docked', mode === 'docked');
    _deck.classList.toggle('is-raised', mode === 'raised');
    _deck.classList.toggle('is-docked', mode === 'docked');
    _deck.classList.toggle('is-floating', mode === 'raised');

    var hint = document.getElementById('composer-float-hint');
    if (hint) hint.textContent = mode === 'raised' ? 'RAISED · drag down to dock' : 'DOCKED · drag up to float';
    if (_toggle) {
      _toggle.textContent = mode === 'raised' ? '⬇ dock' : '⬆ float';
      _toggle.setAttribute('aria-pressed', mode === 'raised' ? 'true' : 'false');
    }

    updateViewportInsets();

    if (mode === 'docked') {
      // Snap browser/chat down with the input
      nextFrame(function () {
        scrollChatToEnd(!opts.instant);
        setTimeout(function () {
          scrollChatToEnd(false);
          updateViewportInsets();
        }, 120);
      });
    } else if (!opts.silent) {
      // Raised: keep latest messages visible above the float bar
      nextFrame(function () {
        scrollChatToEnd(false);
      });
    }

    if (g.showNotification && opts.notify) {
      g.showNotification(mode === 'raised' ? 'Composer raised' : 'Composer docked', 'info');
    }
  }

  function toggle() {
    setMode(_mode === 'raised' ? 'docked' : 'raised', { notify: false });
  }

  function onPointerDown(e) {
    if (!_handle) return;
    // Only primary button / touch
    if (e.type === 'mousedown' && e.button !== 0) return;
    _dragging = true;
    _dragDelta = 0;
    _dragStartY = e.touches ? e.touches[0].clientY : e.clientY;
    _deck.classList.add('is-dragging');
    try {
      _handle.setPointerCapture && e.pointerId != null && _handle.setPointerCapture(e.pointerId);
    } catch (err) {}
    e.preventDefault();
  }

  function applyPreview(delta) {
    if (_deck) _deck.style.transform = 'translateY(' + delta + 'px)';
  }

  function onPointerMove(e) {
    if (!_dragging) return;
    var y = e.touches ? e.touches[0].clientY : e.clientY;
    _dragDelta = y - _dragStartY;
    // Live preview translate (capped) — one style write per frame, not per event.
    var preview = Math.max(-80, Math.min(80, _dragDelta * 0.35));
    throttled('preview', applyPreview)(preview);
  }

  function onPointerUp() {
    if (!_dragging) return;
    _dragging = false;
    // Drop any preview queued for this frame before clearing the transform.
    var pendingPreview = throttled('preview', applyPreview);
    if (pendingPreview.cancel) pendingPreview.cancel();
    if (_deck) {
      _deck.classList.remove('is-dragging');
      _deck.style.transform = '';
    }
    if (_dragDelta <= -DRAG_THRESHOLD) {
      _didDragSnap = true;
      setMode('raised');
    } else if (_dragDelta >= DRAG_THRESHOLD) {
      _didDragSnap = true;
      setMode('docked');
    }
    _dragDelta = 0;
    // Clear snap flag after click event would have fired
    setTimeout(function () {
      _didDragSnap = false;
    }, 50);
  }

  // Resize / visualViewport can fire in bursts — fold them into one frame.
  function queueInsets() {
    throttled('insets', updateViewportInsets)();
  }

  function _on(target, type, fn, opts) {
    if (!target) return;
    target.addEventListener(type, fn, opts);
    _handlers.push([target, type, fn, opts]);
  }

  function wireEvents() {
    if (_bound || !_deck) return;
    _bound = true;

    // Pointer events cover mouse + touch (no separate touch listeners — avoids double-fire)
    _on(_handle, 'pointerdown', onPointerDown, { passive: false });
    _on(window, 'pointermove', onPointerMove, { passive: true });
    _on(window, 'pointerup', onPointerUp, { passive: true });
    _on(window, 'pointercancel', onPointerUp, { passive: true });
    _on(_handle, 'click', function (e) {
      // Tap handle = toggle only if we did not just snap via drag
      if (_didDragSnap) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (Math.abs(_dragDelta) < 8) toggle();
    });

    _on(_toggle, 'click', function () { toggle(); });

    // Keyboard / visual viewport
    _on(window.visualViewport, 'resize', queueInsets);
    _on(window.visualViewport, 'scroll', queueInsets);
    _on(window, 'resize', queueInsets);
    _on(window, 'orientationchange', function () {
      setTimeout(updateViewportInsets, 200);
    });

    // Auto-raise when focusing input on narrow screens (keyboard coming up)
    var input = document.getElementById('user-input');
    if (input) {
      _on(input, 'focus', function () {
        updateViewportInsets();
        if (isNarrow() && _mode === 'docked') {
          // Soft auto-raise so keyboard doesn't bury the field
          setMode('raised', { silent: true });
        } else {
          setTimeout(function () {
            updateViewportInsets();
            scrollChatToEnd(false);
          }, 80);
        }
      });
      _on(input, 'blur', function () {
        setTimeout(updateViewportInsets, 100);
      });
    }

    // Keep spacer in sync when textarea grows
    if (typeof ResizeObserver !== 'undefined' && _deck) {
      _ro = new ResizeObserver(function () { syncSpacer(); });
      _ro.observe(_deck);
    }
  }

  function init() {
    if (!ensureEls()) return false;
    _mode = loadMode();
    wireEvents();
    setMode(_mode, { instant: true, silent: true });
    updateViewportInsets();
    return true;
  }

  /** Unbind every listener and clear pack-owned UI state (pack disable path). */
  function destroy() {
    _handlers.forEach(function (h) {
      try { h[0].removeEventListener(h[1], h[2], h[3]); } catch (e) {}
    });
    _handlers = [];
    if (_ro) {
      try { _ro.disconnect(); } catch (e) {}
      _ro = null;
    }
    _bound = false;
    _dragging = false;
    _dragDelta = 0;
    if (_throttledCache) {
      Object.keys(_throttledCache).forEach(function (k) {
        var w = _throttledCache[k];
        if (w && w.cancel) w.cancel();
      });
    }
    _throttledCache = null;
    document.body.classList.remove('composer-raised', 'composer-docked', 'composer-kb-open');
    if (_deck) _deck.classList.remove('is-raised', 'is-docked', 'is-floating', 'is-dragging');
    if (_spacer) _spacer.style.height = '';
  }

  g.AETHER_ComposerFloat = {
    version: VERSION,
    init: init,
    setMode: setMode,
    toggle: toggle,
    destroy: destroy,
    getMode: function () {
      return _mode;
    },
    update: updateViewportInsets,
    scrollChatToEnd: scrollChatToEnd,
  };

  function boot() {
    // Wait for DOM shell (input-deck exists after HTML parse)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        setTimeout(init, 200);
      });
    } else {
      setTimeout(init, 200);
    }
  }
  boot();
})(typeof globalThis !== 'undefined' ? globalThis : window);
