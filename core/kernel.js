/**
 * AETHER Kernel — syscalls + flight recorder
 * Turns tool calls into audited OS-like operations.
 */
(function (g) {
  'use strict';

  var FLIGHT_KEY = 'aether_flight_log_v1';
  var MAX_FLIGHTS = 40;
  var MAX_EVENTS = 200;

  var _active = null; // current flight
  var _panel = null;
  var _listeners = [];

  function uid(p) {
    return (p || 'f') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function classify(name) {
    name = String(name || '').toLowerCase();
    if (/read_file|fs_read|fs_list|fs_stat|fs_exists|glob|grep|cat/.test(name)) return 'read';
    if (/write_file|fs_write|fs_patch|fs_mkdir|fs_rename|fs_copy|fs_delete|unzip|search_replace/.test(name)) return 'write';
    if (/shell|puter_terminal|piston|exec|run/.test(name)) return 'exec';
    if (/search|scrape|crawl|weather|github|slack|notion|jira|trello|x_|web_|email|cal_|location|puter_browse/.test(name)) return 'net';
    if (/ocr|image|stt|tts|mic|vision|browser_agent/.test(name)) return 'sense';
    return 'call';
  }

  function loadFlights() {
    try {
      return JSON.parse(localStorage.getItem(FLIGHT_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveFlights(list) {
    try {
      localStorage.setItem(FLIGHT_KEY, JSON.stringify(list.slice(0, MAX_FLIGHTS)));
    } catch (e) {}
  }

  function beginFlight(meta) {
    meta = meta || {};
    _active = {
      id: uid('flight'),
      goal: meta.goal || 'session',
      kind: meta.kind || 'agent',
      startedAt: Date.now(),
      endedAt: null,
      status: 'flying',
      events: [],
      stats: { read: 0, write: 0, exec: 0, net: 0, sense: 0, call: 0, errors: 0 },
    };
    log('KERNEL', 'Flight ' + _active.id + ' armed — ' + (_active.goal || '').slice(0, 80), 'kernel');
    emit('begin', _active);
    renderPanel();
    return _active.id;
  }

  function endFlight(status) {
    if (!_active) return null;
    _active.status = status || 'landed';
    _active.endedAt = Date.now();
    log('KERNEL', 'Flight ' + _active.status + ' · ' + _active.events.length + ' events · ' + durationStr(_active), 'kernel');
    var list = loadFlights();
    list.unshift(JSON.parse(JSON.stringify(_active)));
    saveFlights(list);
    var done = _active;
    _active = null;
    emit('end', done);
    renderPanel();
    return done;
  }

  function durationStr(f) {
    var ms = (f.endedAt || Date.now()) - f.startedAt;
    if (ms < 1000) return ms + 'ms';
    return (ms / 1000).toFixed(1) + 's';
  }

  function log(syscall, detail, cls, extra) {
    var ev = {
      t: Date.now(),
      syscall: syscall,
      class: cls || classify(syscall),
      detail: String(detail || '').slice(0, 500),
      ok: extra && extra.ok === false ? false : true,
      ms: extra && extra.ms != null ? extra.ms : null,
    };
    if (_active) {
      _active.events.push(ev);
      if (_active.events.length > MAX_EVENTS) _active.events.shift();
      if (_active.stats[ev.class] != null) _active.stats[ev.class]++;
      if (!ev.ok) _active.stats.errors++;
    }
    emit('event', ev);
    appendPanelLine(ev);
    return ev;
  }

  /**
   * Wrap an async tool fn with kernel auditing.
   */
  function wrapTool(name, fn) {
    return async function audited() {
      var args = Array.prototype.slice.call(arguments);
      var preview = args.map(function (a) {
        return typeof a === 'string' ? a.slice(0, 80) : JSON.stringify(a).slice(0, 80);
      }).join(' | ');
      var cls = classify(name);
      var t0 = performance.now ? performance.now() : Date.now();
      log(name, preview, cls);
      try {
        var result = await fn.apply(null, args);
        var ms = Math.round((performance.now ? performance.now() : Date.now()) - t0);
        log(name + '.ok', String(result).slice(0, 120), cls, { ok: true, ms: ms });
        if (g.AETHER_Theater && g.AETHER_Theater.toolPulse) g.AETHER_Theater.toolPulse(name, true);
        return result;
      } catch (e) {
        var ms2 = Math.round((performance.now ? performance.now() : Date.now()) - t0);
        log(name + '.ERR', e.message || String(e), cls, { ok: false, ms: ms2 });
        if (g.AETHER_Theater && g.AETHER_Theater.toolPulse) g.AETHER_Theater.toolPulse(name, false);
        throw e;
      }
    };
  }

  /** Instrument a TOOL_REGISTRY object in place */
  function instrumentRegistry(registry) {
    if (!registry || typeof registry !== 'object') return 0;
    var n = 0;
    Object.keys(registry).forEach(function (key) {
      var entry = registry[key];
      if (!entry || typeof entry.fn !== 'function' || entry._kernelWrapped) return;
      entry.fn = wrapTool(key, entry.fn);
      entry._kernelWrapped = true;
      n++;
    });
    return n;
  }

  function on(fn) {
    _listeners.push(fn);
    return function () {
      _listeners = _listeners.filter(function (x) { return x !== fn; });
    };
  }

  function emit(type, payload) {
    _listeners.forEach(function (fn) {
      try { fn(type, payload); } catch (e) {}
    });
  }

  function ensurePanel() {
    if (_panel && document.body.contains(_panel)) return _panel;
    _panel = document.createElement('div');
    _panel.id = 'aether-kernel-panel';
    _panel.className = 'kernel-panel collapsed';
    _panel.innerHTML =
      '<div class="kernel-panel-hdr">' +
        '<span class="kernel-title">⬡ KERNEL</span>' +
        '<span class="kernel-flight-id" id="kernel-flight-id">idle</span>' +
        '<button type="button" class="kernel-btn" id="kernel-toggle">▸</button>' +
        '<button type="button" class="kernel-btn" id="kernel-export" title="Export flight JSON">↓</button>' +
        '<button type="button" class="kernel-btn" id="kernel-clear" title="Clear panel">×</button>' +
      '</div>' +
      '<div class="kernel-timeline" id="kernel-timeline"></div>';
    document.body.appendChild(_panel);
    _panel.querySelector('#kernel-toggle').onclick = function () {
      _panel.classList.toggle('collapsed');
      this.textContent = _panel.classList.contains('collapsed') ? '▸' : '▾';
    };
    _panel.querySelector('#kernel-export').onclick = exportActive;
    _panel.querySelector('#kernel-clear').onclick = function () {
      var tl = document.getElementById('kernel-timeline');
      if (tl) tl.innerHTML = '';
    };
    return _panel;
  }

  function appendPanelLine(ev) {
    try {
      ensurePanel();
      var tl = document.getElementById('kernel-timeline');
      if (!tl || typeof tl.appendChild !== 'function') return;
      var row = document.createElement('div');
      row.className = 'kernel-ev kernel-' + (ev.class || 'call') + (ev.ok === false ? ' kernel-err' : '');
      var ts = new Date(ev.t).toLocaleTimeString('en-GB', { hour12: false });
      row.innerHTML =
        '<span class="kev-ts">' + ts + '</span>' +
        '<span class="kev-sys">' + escapeHtml(ev.syscall) + '</span>' +
        '<span class="kev-det">' + escapeHtml(ev.detail) + '</span>' +
        (ev.ms != null ? '<span class="kev-ms">' + ev.ms + 'ms</span>' : '');
      tl.appendChild(row);
      if (tl.children && tl.children.length > 80 && tl.removeChild && tl.firstChild) {
        while (tl.children.length > 80) tl.removeChild(tl.firstChild);
      }
      if (tl.scrollTop != null) tl.scrollTop = tl.scrollHeight || 0;
    } catch (e) { /* headless / test envs */ }
  }

  function renderPanel() {
    ensurePanel();
    var idEl = document.getElementById('kernel-flight-id');
    if (idEl) {
      idEl.textContent = _active
        ? _active.id.slice(0, 14) + ' · ' + _active.status
        : 'idle · ' + loadFlights().length + ' archived';
    }
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function exportActive() {
    var data = _active || loadFlights()[0];
    if (!data) {
      if (g.showNotification) g.showNotification('No flight to export', 'warn');
      return;
    }
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'aether-flight-' + (data.id || 'log') + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function openTimelineModal() {
    var flights = loadFlights();
    var existing = document.getElementById('kernel-flights-modal');
    if (existing) existing.remove();
    var m = document.createElement('div');
    m.id = 'kernel-flights-modal';
    m.className = 'adv-modal-overlay';
    m.innerHTML =
      '<div class="adv-modal kernel-modal">' +
        '<div class="adv-modal-hdr"><span>⬡ Flight Recorder</span><button class="adv-x" id="kf-close">×</button></div>' +
        '<div class="adv-modal-body" id="kf-body"></div>' +
      '</div>';
    document.body.appendChild(m);
    m.querySelector('#kf-close').onclick = function () { m.remove(); };
    m.onclick = function (e) { if (e.target === m) m.remove(); };
    var body = m.querySelector('#kf-body');
    if (!flights.length) {
      body.innerHTML = '<p class="adv-muted">No flights recorded yet. Run AGENT or enable kernel auto-flight.</p>';
      return;
    }
    flights.forEach(function (f) {
      var card = document.createElement('div');
      card.className = 'flight-card';
      card.innerHTML =
        '<div class="flight-card-top">' +
          '<strong>' + escapeHtml(f.kind) + '</strong> · ' + escapeHtml((f.goal || '').slice(0, 60)) +
        '</div>' +
        '<div class="flight-card-meta">' +
          new Date(f.startedAt).toLocaleString() + ' · ' + (f.events || []).length + ' events · ' +
          (f.status || '') + ' · ' + durationStr(f) +
        '</div>' +
        '<div class="flight-stats">' +
          Object.keys(f.stats || {}).map(function (k) {
            return '<span class="fstat">' + k + ':' + f.stats[k] + '</span>';
          }).join('') +
        '</div>';
      card.onclick = function () {
        var blob = new Blob([JSON.stringify(f, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = f.id + '.json';
        a.click();
      };
      body.appendChild(card);
    });
  }

  g.AETHER_Kernel = {
    beginFlight: beginFlight,
    endFlight: endFlight,
    log: log,
    wrapTool: wrapTool,
    instrumentRegistry: instrumentRegistry,
    on: on,
    ensurePanel: ensurePanel,
    openTimelineModal: openTimelineModal,
    exportActive: exportActive,
    loadFlights: loadFlights,
    getActive: function () { return _active; },
    classify: classify,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
