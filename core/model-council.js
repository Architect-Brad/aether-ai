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
      callModel = async function (messages) {
        if (typeof g.callAISimple === 'function') return g.callAISimple(messages);
        if (typeof g.callModelDirect === 'function') {
          return g.callModelDirect(messages.map(function (m) { return m.content; }).join('\n\n'));
        }
        throw new Error('No model caller available — wire callAISimple');
      };
    }

    // Parallel seats
    var tasks = seats.map(function (seat) {
      return (async function () {
        setSeatState(chamber, seat.id, 'deliberating');
        var t0 = Date.now();
        try {
          var messages = [
            { role: 'system', content: seat.system + '\nRespond as your seat. Sign your key points clearly.' },
            { role: 'user', content: prompt },
          ];
          var text = await callModel(messages, seat);
          var ms = Date.now() - t0;
          setSeatState(chamber, seat.id, 'done', text, ms);
          return { seat: seat, text: text, ms: ms, ok: true };
        } catch (e) {
          setSeatState(chamber, seat.id, 'error', e.message || String(e), Date.now() - t0);
          return { seat: seat, text: e.message || String(e), ms: Date.now() - t0, ok: false };
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
        synthesis = await callModel(synthMessages, { id: 'speaker', role: 'Speaker' });
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
    seats.forEach(function (s) {
      var card = document.createElement('div');
      card.className = 'council-seat';
      card.id = 'seat-' + s.id;
      card.style.borderColor = s.color;
      card.innerHTML =
        '<div class="seat-hdr" style="color:' + s.color + '">' +
          '<span class="seat-orb" style="background:' + s.color + '"></span>' +
          esc(s.role) +
          '<span class="seat-state">waiting</span>' +
          '<span class="seat-ms"></span>' +
        '</div>' +
        '<div class="seat-body"><span class="seat-wait">Awaiting deliberation…</span></div>';
      seatsEl.appendChild(card);
    });

    if (host.scrollTop != null) host.scrollTop = host.scrollHeight;
    return el;
  }

  function setSeatState(chamber, seatId, state, text, ms) {
    var card = chamber.querySelector('#seat-' + seatId);
    if (!card) return;
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

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
    openConfig: openConfig,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
