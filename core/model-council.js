/**
 * AETHER Model Council — multi-seat parallel deliberation + synthesis
 */
(function (g) {
  'use strict';

  var SEATS_KEY = 'aether_council_seats_v1';

  function defaultSeats() {
    return [
      { id: 'alpha', role: 'Specialist A', color: '#00f3ff', provider: null, model: null, system: 'You are Council seat Alpha — precise technical specialist. Be concrete.' },
      { id: 'beta', role: 'Specialist B', color: '#00ff88', provider: null, model: null, system: 'You are Council seat Beta — creative alternative angle. Challenge assumptions.' },
      { id: 'critic', role: 'Critic', color: '#ff6600', provider: null, model: null, system: 'You are Council Critic — find holes, risks, and unsupported claims. Be harsh but fair.' },
    ];
  }

  function loadSeats() {
    try {
      var s = JSON.parse(localStorage.getItem(SEATS_KEY) || 'null');
      if (s && s.length) return s;
    } catch (e) {}
    return defaultSeats();
  }

  function saveSeats(seats) {
    try { localStorage.setItem(SEATS_KEY, JSON.stringify(seats)); } catch (e) {}
  }

  /** Sanitise a seat id before it is used as a DOM id / selector. */
  function safeSeatId(value) {
    var s = String(value == null ? '' : value).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 48);
    return s || 'seat';
  }

  /** Only allow validated CSS colours (never interpolate raw config). */
  function safeColor(value, fallback) {
    var c = String(value == null ? '' : value).trim();
    if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c)) return c;
    var named = ['red', 'green', 'blue', 'orange', 'yellow', 'cyan', 'magenta',
      'white', 'black', 'gray', 'grey', 'purple', 'pink', 'lime', 'teal'];
    var lower = c.toLowerCase();
    if (named.indexOf(lower) !== -1) return lower;
    return fallback || '#00f3ff';
  }

  /**
   * Best-effort read of the active provider/model without touching script.js.
   * An explicit hook wins; otherwise read the SETUP fields / saved config.
   */
  function configuredModel() {
    var out = { provider: '', model: '' };
    try {
      if (typeof g.__aetherGetApiConfig === 'function') {
        var cfg = g.__aetherGetApiConfig() || {};
        out.provider = cfg.provider || '';
        out.model = cfg.model || '';
      }
    } catch (e) {}
    try {
      var ps = document.getElementById('provider-select');
      var mi = document.getElementById('model-input');
      if (!out.provider && ps && ps.value) out.provider = ps.value;
      if (!out.model && mi && mi.value) out.model = mi.value;
    } catch (e2) {}
    try {
      if (!out.provider || !out.model) {
        var raw = localStorage.getItem('aether_api_config');
        if (raw) {
          var saved = JSON.parse(raw);
          // Encrypted blobs carry salt/iv and cannot be read here.
          if (saved && !saved.salt && !saved.iv) {
            out.provider = out.provider || saved.provider || '';
            out.model = out.model || saved.model || '';
          }
        }
      }
    } catch (e3) {}
    return out;
  }

  /** Resolve a seat to a concrete provider/model, falling back to the active one. */
  function resolveSeat(seat) {
    seat = seat || {};
    var cfg = configuredModel();
    var model = seat.model == null ? '' : String(seat.model).trim();
    var provider = seat.provider == null ? '' : String(seat.provider).trim();
    return {
      id: seat.id,
      role: seat.role,
      color: seat.color,
      system: seat.system,
      provider: provider || cfg.provider || null,
      model: model || cfg.model || null,
      custom: !!(provider || model),
    };
  }

  /**
   * Run council.
   * @param {string} prompt
   * @param {object} opts
   *   callModel: async (messages, seat) => string
   *   onSeatUpdate: (seatId, partial) => void
   *   synthesize: bool
   *   beast: bool — use 3 seats always
   */
  async function convene(prompt, opts) {
    opts = opts || {};
    var seats = loadSeats();
    if (opts.beast && seats.length < 3) seats = defaultSeats();

    var chamber = openChamber(seats, prompt);
    var results = [];

    var callModel = opts.callModel;
    if (typeof callModel !== 'function') {
      callModel = async function (messages, seat) {
        var model = seat && seat.model;
        if (typeof g.callAISimple === 'function') return g.callAISimple(messages, model || undefined);
        if (typeof g.callModelDirect === 'function') {
          return g.callModelDirect(messages.map(function (m) { return m.content; }).join('\n\n'));
        }
        throw new Error('No model caller available — wire callAISimple');
      };
    }

    // Parallel seats
    var tasks = seats.map(function (seat) {
      return (async function () {
        // Each seat gets its own resolved provider/model; seats with no
        // override gracefully use the single configured model.
        var target = resolveSeat(seat);
        setSeatState(chamber, seat.id, 'deliberating');
        var t0 = Date.now();
        try {
          var messages = [
            { role: 'system', content: (seat.system || '') + '\nRespond as your seat. Sign your key points clearly.' },
            { role: 'user', content: prompt },
          ];
          var text = await callModel(messages, target);
          var ms = Date.now() - t0;
          setSeatState(chamber, seat.id, 'done', text, ms);
          return { seat: seat, target: target, provider: target.provider, model: target.model, text: text, ms: ms, ok: true };
        } catch (e) {
          setSeatState(chamber, seat.id, 'error', e.message || String(e), Date.now() - t0);
          return { seat: seat, target: target, provider: target.provider, model: target.model, text: e.message || String(e), ms: Date.now() - t0, ok: false };
        }
      })();
    });

    results = await Promise.all(tasks);

    var synthesis = '';
    if (opts.synthesize !== false) {
      setChamberPhase(chamber, 'synthesizing');
      try {
        var dossier = results.map(function (r) {
          return '### ' + r.seat.role + ' (' + r.seat.id + ')' + (r.ok ? '' : ' [FAILED]') + '\n' + r.text;
        }).join('\n\n');
        var synthMessages = [
          {
            role: 'system',
            content:
              'You are the Council Speaker. Merge the seats into one decisive answer. ' +
              'Cite which seat contributed key claims. Flag unresolved disagreements. Structure: Verdict, Key points, Dissent, Confidence.',
          },
          { role: 'user', content: 'Original question:\n' + prompt + '\n\nSeat briefs:\n' + dossier },
        ];
        synthesis = await callModel(synthMessages, resolveSeat({ id: 'speaker', role: 'Speaker' }));
        setChamberPhase(chamber, 'complete', synthesis);
      } catch (e) {
        synthesis = 'Synthesis failed: ' + e.message;
        setChamberPhase(chamber, 'error', synthesis);
      }
    } else {
      setChamberPhase(chamber, 'complete', results.map(function (r) { return r.text; }).join('\n\n---\n\n'));
    }

    if (g.AETHER_ThreadGraph && g.AETHER_ThreadGraph.addNode) {
      g.AETHER_ThreadGraph.addNode({
        type: 'council',
        label: 'Council: ' + prompt.slice(0, 40),
        meta: { seats: results.length, synthesis: synthesis.slice(0, 200) },
      });
    }

    return { results: results, synthesis: synthesis, prompt: prompt };
  }

  function openChamber(seats, prompt) {
    var existing = document.getElementById('council-chamber');
    if (existing) existing.remove();

    var el = document.createElement('div');
    el.id = 'council-chamber';
    el.className = 'council-chamber';
    el.innerHTML =
      '<div class="council-hdr">' +
        '<span class="council-title">⬡ MODEL COUNCIL</span>' +
        '<span class="council-phase" id="council-phase">convening</span>' +
        '<button type="button" class="adv-x" id="council-close">×</button>' +
      '</div>' +
      '<div class="council-prompt">' + esc(prompt.slice(0, 280)) + (prompt.length > 280 ? '…' : '') + '</div>' +
      '<div class="council-seats" id="council-seats"></div>' +
      '<div class="council-synth" id="council-synth" style="display:none"></div>';

    var host = document.getElementById('chat-display') || document.body;
    host.appendChild(el);
    el.querySelector('#council-close').onclick = function () { el.remove(); };

    var seatsEl = el.querySelector('#council-seats');
    var seatDomIds = Object.create(null); // raw seat id -> sanitised DOM id
    var usedIds = Object.create(null);
    el._seatDomIds = seatDomIds;
    seats.forEach(function (s, i) {
      var rawId = s.id == null ? '' : String(s.id);
      var safeId = safeSeatId(rawId);
      if (usedIds[safeId]) safeId = safeId + '_' + i;
      usedIds[safeId] = true;
      seatDomIds[rawId] = safeId;
      var color = safeColor(s.color);
      var card = document.createElement('div');
      card.className = 'council-seat';
      card.id = 'seat-' + safeId;
      // Colours are applied as properties, never interpolated into markup.
      card.style.borderColor = color;
      card.innerHTML =
        '<div class="seat-hdr">' +
          '<span class="seat-orb"></span>' +
          esc(s.role) +
          '<span class="seat-state">waiting</span>' +
          '<span class="seat-ms"></span>' +
        '</div>' +
        '<div class="seat-body"><span class="seat-wait">Awaiting deliberation…</span></div>';
      var hdr = card.querySelector('.seat-hdr');
      var orb = card.querySelector('.seat-orb');
      if (hdr) hdr.style.color = color;
      if (orb) orb.style.background = color;
      seatsEl.appendChild(card);
    });

    if (host.scrollTop != null) host.scrollTop = host.scrollHeight;
    return el;
  }

  function setSeatState(chamber, seatId, state, text, ms) {
    if (!chamber) return;
    var key = seatId == null ? '' : String(seatId);
    var map = chamber._seatDomIds || {};
    var safeId = Object.prototype.hasOwnProperty.call(map, key) ? map[key] : safeSeatId(key);
    // getElementById + containment check: no selector string from config, and
    // no chance of updating a look-alike card from another chamber.
    var card = document.getElementById('seat-' + safeId);
    if (!card || !chamber.contains(card)) return;
    var st = card.querySelector('.seat-state');
    var body = card.querySelector('.seat-body');
    var msEl = card.querySelector('.seat-ms');
    if (st) st.textContent = state;
    card.classList.toggle('active', state === 'deliberating');
    card.classList.toggle('done', state === 'done');
    card.classList.toggle('err', state === 'error');
    if (ms != null && msEl) msEl.textContent = ms + 'ms';
    if (text != null && body) {
      body.textContent = text.slice(0, 4000);
    }
  }

  function setChamberPhase(chamber, phase, synth) {
    var p = chamber.querySelector('#council-phase');
    if (p) p.textContent = phase;
    if (synth != null) {
      var s = chamber.querySelector('#council-synth');
      if (s) {
        s.style.display = 'block';
        s.innerHTML = '<div class="synth-label">SPEAKER SYNTHESIS</div><div class="synth-body"></div>';
        s.querySelector('.synth-body').textContent = synth;
      }
    }
  }

  function openConfig() {
    var seats = loadSeats();
    var m = document.createElement('div');
    m.className = 'adv-modal-overlay';
    m.innerHTML =
      '<div class="adv-modal">' +
        '<div class="adv-modal-hdr"><span>Council seats</span><button class="adv-x" id="cc-x">×</button></div>' +
        '<div class="adv-modal-body"><p class="adv-muted">Roles define system prompts. Models use your active SETUP endpoint unless customized later.</p>' +
        '<pre class="so-input" style="white-space:pre-wrap;min-height:120px">' + esc(JSON.stringify(seats, null, 2)) + '</pre>' +
        '<button class="cmd-btn" id="cc-reset">Reset seats</button></div></div>';
    document.body.appendChild(m);
    m.querySelector('#cc-x').onclick = function () { m.remove(); };
    m.querySelector('#cc-reset').onclick = function () {
      saveSeats(defaultSeats());
      if (g.showNotification) g.showNotification('Council seats reset', 'info');
      m.remove();
    };
  }

  g.AETHER_Council = {
    convene: convene,
    loadSeats: loadSeats,
    saveSeats: saveSeats,
    defaultSeats: defaultSeats,
    resolveSeat: resolveSeat,
    configuredModel: configuredModel,
    openConfig: openConfig,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
