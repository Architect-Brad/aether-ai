/**
 * AETHER Neural Thread Graph — constellation of conversation nodes
 */
(function (g) {
  'use strict';

  var STORE_KEY = 'aether_thread_graph_v1';
  var _panel = null;
  var _raf = null;

  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (d && d.nodes) return d;
    } catch (e) {}
    return { nodes: [], edges: [], focus: null };
  }

  function save(gdata) {
    try {
      // Cap size
      if (gdata.nodes.length > 300) gdata.nodes = gdata.nodes.slice(-300);
      if (gdata.edges.length > 400) gdata.edges = gdata.edges.slice(-400);
      localStorage.setItem(STORE_KEY, JSON.stringify(gdata));
    } catch (e) {}
  }

  function addNode(spec) {
    spec = spec || {};
    var gdata = load();
    var node = {
      id: spec.id || ('n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6)),
      type: spec.type || 'msg', // msg | agent | research | council | branch | system
      label: (spec.label || 'node').slice(0, 80),
      convId: spec.convId || null,
      t: Date.now(),
      x: spec.x != null ? spec.x : 0.3 + Math.random() * 0.4,
      y: spec.y != null ? spec.y : 0.2 + Math.random() * 0.6,
      meta: spec.meta || {},
      active: !!spec.active,
    };
    // Deactivate others
    gdata.nodes.forEach(function (n) { n.active = false; });
    node.active = true;
    gdata.nodes.push(node);
    gdata.focus = node.id;

    if (spec.parentId) {
      gdata.edges.push({ from: spec.parentId, to: node.id, kind: spec.edgeKind || 'flow' });
    } else if (gdata.nodes.length > 1) {
      var prev = gdata.nodes[gdata.nodes.length - 2];
      if (prev) gdata.edges.push({ from: prev.id, to: node.id, kind: 'flow' });
    }

    save(gdata);
    render();
    return node;
  }

  function branchFrom(nodeId, label) {
    return addNode({
      type: 'branch',
      label: label || 'branch',
      parentId: nodeId,
      edgeKind: 'branch',
      x: 0.55 + Math.random() * 0.3,
      y: 0.3 + Math.random() * 0.4,
    });
  }

  function ensurePanel() {
    if (_panel && document.body.contains(_panel)) return _panel;
    _panel = document.createElement('div');
    _panel.id = 'thread-graph-panel';
    _panel.className = 'thread-graph-panel hidden';
    _panel.innerHTML =
      '<div class="tg-hdr">' +
        '<span>⬡ NEURAL GRAPH</span>' +
        '<button type="button" class="kernel-btn" id="tg-clear" title="Clear graph">CLR</button>' +
        '<button type="button" class="kernel-btn" id="tg-close">×</button>' +
      '</div>' +
      '<canvas id="thread-graph-canvas" width="360" height="220"></canvas>' +
      '<div class="tg-legend">' +
        '<span class="tg-l msg">msg</span>' +
        '<span class="tg-l agent">agent</span>' +
        '<span class="tg-l research">research</span>' +
        '<span class="tg-l council">council</span>' +
        '<span class="tg-l branch">branch</span>' +
      '</div>' +
      '<div class="tg-list" id="tg-list"></div>';
    document.body.appendChild(_panel);
    _panel.querySelector('#tg-close').onclick = function () {
      _panel.classList.add('hidden');
    };
    _panel.querySelector('#tg-clear').onclick = function () {
      save({ nodes: [], edges: [], focus: null });
      render();
    };
    var canvas = _panel.querySelector('#thread-graph-canvas');
    canvas.addEventListener('click', onCanvasClick);
    return _panel;
  }

  function toggle() {
    ensurePanel();
    _panel.classList.toggle('hidden');
    if (!_panel.classList.contains('hidden')) render();
  }

  function show() {
    ensurePanel();
    _panel.classList.remove('hidden');
    render();
  }

  function colorFor(type) {
    return (
      {
        msg: '#00f3ff',
        agent: '#ffd700',
        research: '#9b59b6',
        council: '#ff6600',
        branch: '#00ff88',
        system: '#668899',
      }[type] || '#00f3ff'
    );
  }

  function render() {
    ensurePanel();
    var gdata = load();
    var canvas = document.getElementById('thread-graph-canvas');
    if (!canvas || typeof canvas.getContext !== 'function') {
      // Still update list in non-canvas environments
      try { updateList(gdata); } catch (e) {}
      return;
    }
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var w = canvas.width || 360;
    var h = canvas.height || 220;
    ctx.clearRect(0, 0, w, h);

    // backdrop stars
    ctx.fillStyle = 'rgba(0,243,255,0.04)';
    for (var i = 0; i < 40; i++) {
      ctx.fillRect((i * 97) % w, (i * 53) % h, 1, 1);
    }

    // edges
    gdata.edges.forEach(function (e) {
      var a = gdata.nodes.find(function (n) { return n.id === e.from; });
      var b = gdata.nodes.find(function (n) { return n.id === e.to; });
      if (!a || !b) return;
      ctx.beginPath();
      ctx.strokeStyle = e.kind === 'branch' ? 'rgba(0,255,136,0.35)' : 'rgba(0,243,255,0.22)';
      ctx.lineWidth = e.kind === 'branch' ? 1.5 : 1;
      ctx.moveTo(a.x * w, a.y * h);
      ctx.lineTo(b.x * w, b.y * h);
      ctx.stroke();
    });

    // nodes
    gdata.nodes.forEach(function (n) {
      var x = n.x * w;
      var y = n.y * h;
      var col = colorFor(n.type);
      if (n.active) {
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.35;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      ctx.arc(x, y, n.active ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
    });

    updateList(gdata);
  }

  function updateList(gdata) {
    var list = document.getElementById('tg-list');
    if (!list) return;
    list.innerHTML = gdata.nodes
      .slice()
      .reverse()
      .slice(0, 12)
      .map(function (n) {
        return (
          '<div class="tg-item' +
          (n.active ? ' active' : '') +
          '" data-id="' +
          n.id +
          '">' +
          '<span class="tg-dot" style="background:' +
          colorFor(n.type) +
          '"></span>' +
          '<span class="tg-type">' +
          n.type +
          '</span> ' +
          esc(n.label) +
          '</div>'
        );
      })
      .join('');
    if (list.querySelectorAll) {
      list.querySelectorAll('.tg-item').forEach(function (el) {
        el.onclick = function () {
          focusNode(el.getAttribute('data-id'));
        };
      });
    }
  }

  function focusNode(id) {
    var gdata = load();
    gdata.nodes.forEach(function (n) {
      n.active = n.id === id;
    });
    gdata.focus = id;
    save(gdata);
    render();
    var node = gdata.nodes.find(function (n) { return n.id === id; });
    if (node && node.meta && node.meta.scrollTo && typeof g.document !== 'undefined') {
      var el = document.getElementById(node.meta.scrollTo);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function onCanvasClick(ev) {
    var canvas = ev.target;
    var rect = canvas.getBoundingClientRect();
    var x = (ev.clientX - rect.left) / rect.width;
    var y = (ev.clientY - rect.top) / rect.height;
    var gdata = load();
    var hit = null;
    var best = 0.05;
    gdata.nodes.forEach(function (n) {
      var d = Math.hypot(n.x - x, n.y - y);
      if (d < best) {
        best = d;
        hit = n;
      }
    });
    if (hit) focusNode(hit.id);
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Track high-level activity from outside
  function trackMessage(role, preview, convId) {
    addNode({
      type: role === 'user' ? 'msg' : 'msg',
      label: (role === 'user' ? 'U: ' : 'A: ') + (preview || '').slice(0, 48),
      convId: convId,
      meta: { role: role },
    });
  }

  g.AETHER_ThreadGraph = {
    addNode: addNode,
    branchFrom: branchFrom,
    toggle: toggle,
    show: show,
    render: render,
    load: load,
    trackMessage: trackMessage,
    focusNode: focusNode,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
