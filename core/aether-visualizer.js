/**
 * AETHER Visualizer v2 — flagship chat artifact runtime
 * Copyright (C) 2026 The Architect · GPL-3.0-or-later
 *
 * Zero-backend charts & diagrams for the agent OS.
 * Spec schema: aether-viz-v1 (JSON with type field) or ```viz / ```aether-viz fences.
 *
 * Phases shipped:
 *   A — normalizeSpec (flow/struct/svg), multi-spec, error→markdown fallback, goldens
 *   B — modular core, theme tokens, mobile export, mermaid sanitize, stable fences
 *   C — stream-stable open fences, moat/kernel record, export to CODE folder
 */
(function (g) {
  'use strict';

  var VERSION = '2.0';
  var SCHEMA = 'aether-viz-v1';

  var VIZ_COLORS = {
    blue:   { fill: '#0d1e30', stroke: '#378ADD', text: '#7ab8f0' },
    purple: { fill: '#140e2a', stroke: '#7F77DD', text: '#b0aaee' },
    teal:   { fill: '#091e18', stroke: '#1D9E75', text: '#5ecfaa' },
    amber:  { fill: '#1e1400', stroke: '#BA7517', text: '#e0a040' },
    coral:  { fill: '#200a00', stroke: '#D85A30', text: '#f0906a' },
    pink:   { fill: '#200010', stroke: '#D4537E', text: '#f08aaa' },
    green:  { fill: '#0a1a00', stroke: '#639922', text: '#90cc44' },
    red:    { fill: '#200000', stroke: '#E24B4A', text: '#f08080' },
    gray:   { fill: '#0d1520', stroke: '#334455', text: '#8aaabb' },
    cyan:   { fill: '#001e22', stroke: '#00c8d8', text: '#44e0ee' },
  };
  var VIZ_PALETTE = [
    '#378ADD', '#7F77DD', '#1D9E75', '#BA7517', '#D85A30',
    '#D4537E', '#639922', '#E24B4A', '#00c8d8', '#f0c040',
  ];

  var CHART_TYPES = {
    bar: 1, 'bar-horizontal': 1, 'horizontal-bar': 1,
    'stacked-bar': 1, 'stacked-line': 1,
    line: 1, area: 1, donut: 1, pie: 1,
    scatter: 1, bubble: 1, radar: 1, spider: 1,
  };
  var DOMAIN_TYPES = {
    flow: 1, struct: 1, table: 1, gantt: 1,
    heatmap: 1, timeline: 1, svg: 1,
  };
  var ALL_TYPES = Object.keys(CHART_TYPES).concat(Object.keys(DOMAIN_TYPES));

  var ARROW =
    '<defs><marker id="av-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
    '<path d="M2 1L8 5L2 9" fill="none" stroke="#556677" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker>' +
    '<marker id="av-arrow-lr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">' +
    '<path d="M2 1L8 5L2 9" fill="none" stroke="#556677" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>';

  var SAFE_TAGS = {
    svg: 1, g: 1, rect: 1, circle: 1, ellipse: 1, line: 1, path: 1,
    polyline: 1, polygon: 1, text: 1, tspan: 1, defs: 1, marker: 1,
    linearGradient: 1, radialGradient: 1, stop: 1, clipPath: 1,
    title: 1, desc: 1,
  };
  var SAFE_ATTRS = {
    viewBox: 1, width: 1, height: 1, xmlns: 1, x: 1, y: 1, x1: 1, y1: 1,
    x2: 1, y2: 1, cx: 1, cy: 1, r: 1, rx: 1, ry: 1, d: 1, points: 1,
    fill: 1, stroke: 1, 'stroke-width': 1, 'stroke-dasharray': 1,
    'stroke-linecap': 1, 'stroke-linejoin': 1, 'stroke-opacity': 1,
    'fill-opacity': 1, opacity: 1, transform: 1, 'text-anchor': 1,
    'dominant-baseline': 1, 'font-size': 1, 'font-weight': 1, 'font-family': 1,
    'marker-end': 1, 'marker-start': 1, id: 1, style: 1, offset: 1,
    'stop-color': 1, 'stop-opacity': 1, gradientUnits: 1,
    markerWidth: 1, markerHeight: 1, refX: 1, refY: 1, orient: 1,
    preserveAspectRatio: 1, class: 1,
  };

  var _chartCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var _mermaidReady = false;
  var _theme = 'void';

  // ── Theme ──────────────────────────────────────────────────

  function isIvory() {
    try {
      var t =
        (g.document && g.document.documentElement && g.document.documentElement.getAttribute('data-aether-theme')) ||
        '';
      return t === 'ivory' || (g.document && g.document.documentElement && g.document.documentElement.classList.contains('theme-light'));
    } catch (e) {
      return false;
    }
  }

  function themeChartColors() {
    if (isIvory()) {
      return {
        tick: '#5c5346',
        grid: 'rgba(139,90,43,0.12)',
        title: '#2c2416',
        legend: '#5c5346',
        tooltipBg: 'rgba(245,241,235,0.96)',
        tooltipTitle: '#2c2416',
        tooltipBody: '#5c5346',
        tooltipBorder: 'rgba(139,90,43,0.25)',
      };
    }
    return {
      tick: '#556677',
      grid: 'rgba(255,255,255,0.05)',
      title: '#c8d8e8',
      legend: '#8aaabb',
      tooltipBg: 'rgba(6,8,16,0.92)',
      tooltipTitle: '#c8d8e8',
      tooltipBody: '#8aaabb',
      tooltipBorder: '#1e3048',
    };
  }

  // ── Utils ──────────────────────────────────────────────────

  function vc(name) {
    return VIZ_COLORS[name] || VIZ_COLORS.gray;
  }
  function vcPalette(i) {
    return VIZ_PALETTE[i % VIZ_PALETTE.length];
  }
  function clamp(v, mn, mx) {
    return Math.max(mn, Math.min(mx, v));
  }
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function baseContainer(c) {
    c.innerHTML = '';
    c.classList.add('aether-viz-container');
    c.setAttribute('data-aether-viz', VERSION);
    return c;
  }

  function vizErr(c, msg, rawSpec) {
    c.innerHTML =
      '<div class="aether-viz-error">' +
      '<strong>⚠ Visualizer error:</strong> ' +
      escHtml(msg) +
      (rawSpec
        ? '<details class="aether-viz-error-details"><summary>Show spec</summary><pre>' +
          escHtml(typeof rawSpec === 'string' ? rawSpec : JSON.stringify(rawSpec, null, 2)) +
          '</pre></details>'
        : '') +
      '</div>';
  }

  function recordEvent(kind, detail, meta) {
    try {
      if (g.AETHER_Kernel && g.AETHER_Kernel.log) {
        g.AETHER_Kernel.log('viz.' + kind, String(detail || '').slice(0, 120), 'call', meta || {});
      }
    } catch (e) {}
    try {
      if (g.AETHER_Moat && g.AETHER_Moat.record) {
        g.AETHER_Moat.record('viz', {
          title: 'Viz ' + kind,
          detail: String(detail || '').slice(0, 200),
          meta: meta || {},
        });
      }
    } catch (e2) {}
  }

  // ── Sanitize SVG ───────────────────────────────────────────

  function sanitizeSVG(svgStr) {
    if (typeof DOMParser === 'undefined') {
      return String(svgStr).replace(/<script[\s\S]*?<\/script>/gi, '');
    }
    var parser = new DOMParser();
    var doc = parser.parseFromString(String(svgStr), 'image/svg+xml');
    if (doc.querySelector('parseerror,parsererror')) throw new Error('Invalid SVG');
    function clean(node) {
      if (node.nodeType === 1) {
        var tag = node.tagName.toLowerCase().replace(/^svg:/, '');
        if (!SAFE_TAGS[tag]) {
          node.parentNode && node.parentNode.removeChild(node);
          return;
        }
        var attrs = node.attributes ? Array.prototype.slice.call(node.attributes) : [];
        for (var i = 0; i < attrs.length; i++) {
          var a = attrs[i];
          if (/^on|href|xlink|src|action|formaction|data:/i.test(a.name) || !SAFE_ATTRS[a.name]) {
            node.removeAttribute(a.name);
          }
        }
        var style = node.getAttribute('style');
        if (style) node.setAttribute('style', style.replace(/url\s*\(|javascript:/gi, ''));
        var ch = node.childNodes ? Array.prototype.slice.call(node.childNodes) : [];
        for (var j = 0; j < ch.length; j++) clean(ch[j]);
      } else if (node.nodeType !== 3 && node.nodeType !== 8) {
        node.parentNode && node.parentNode.removeChild(node);
      }
    }
    clean(doc.documentElement);
    return new XMLSerializer().serializeToString(doc.documentElement);
  }

  // ── Schema normalization (Phase A fix) ─────────────────────

  function normalizeSpec(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var type = String(raw.type || '').toLowerCase();
    if (!type) return null;

    // Domain types — accept with their native fields (was broken in v0.1)
    if (type === 'flow' && (raw.nodes || raw.edges)) {
      return Object.assign({}, raw, { type: 'flow' });
    }
    if (type === 'struct' && (raw.regions || raw.label)) {
      return Object.assign({}, raw, { type: 'struct' });
    }
    if (type === 'svg' && raw.svg) {
      return Object.assign({}, raw, { type: 'svg' });
    }
    if (type === 'table' && (raw.headers || raw.rows)) {
      return Object.assign({}, raw, { type: 'table' });
    }
    if (type === 'gantt' && raw.tasks) {
      return Object.assign({}, raw, { type: 'gantt' });
    }
    if (type === 'heatmap' && raw.data) {
      return Object.assign({}, raw, { type: 'heatmap' });
    }
    if (type === 'timeline' && raw.events) {
      return Object.assign({}, raw, { type: 'timeline' });
    }

    // Already correct chart format
    if (raw.datasets) return Object.assign({}, raw, { type: type });

    // Chart.js native: {type, data: {labels, datasets}, options}
    if (raw.data && raw.data.datasets) {
      return {
        type: type,
        labels: raw.data.labels || [],
        datasets: raw.data.datasets,
        options: raw.options && raw.options.plugins && raw.options.plugins.title
          ? { title: raw.options.plugins.title.text || raw.options.plugins.title }
          : raw.options || {},
      };
    }

    // Flat: {type, data: [1,2,3], labels, label}
    if (Array.isArray(raw.data) && !(raw.data[0] && raw.data[0].data)) {
      return {
        type: type,
        labels: raw.labels || [],
        datasets: [{ label: raw.label || '', data: raw.data, color: raw.color }],
        options: raw.options || {},
      };
    }

    // Known chart type with datasets missing — still return for clearer errors
    if (CHART_TYPES[type] || DOMAIN_TYPES[type]) {
      return Object.assign({}, raw, { type: type });
    }

    return null;
  }

  // ── Extraction: multi-spec (Phase A + B fences) ────────────

  function tryParseJson(str) {
    try {
      var p = JSON.parse(str);
      return normalizeSpec(p);
    } catch (e) {
      return null;
    }
  }

  /** Balanced-brace extractor for JSON objects containing "type" */
  function extractJsonObjects(text) {
    var results = [];
    var i = 0;
    var n = text.length;
    while (i < n) {
      var start = text.indexOf('{', i);
      if (start < 0) break;
      var depth = 0;
      var inStr = false;
      var esc = false;
      var end = -1;
      for (var j = start; j < n; j++) {
        var ch = text[j];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === '\\') esc = true;
          else if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') {
          inStr = true;
          continue;
        }
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            end = j;
            break;
          }
        }
      }
      if (end > start) {
        var slice = text.slice(start, end + 1);
        if (/"type"\s*:/.test(slice)) {
          var spec = tryParseJson(slice);
          if (spec) {
            results.push({ kind: 'spec', spec: spec, start: start, end: end + 1, raw: slice });
          }
        }
        i = end + 1;
      } else {
        i = start + 1;
      }
    }
    return results;
  }

  /**
   * Extract all visual artifacts from text.
   * @returns {{ artifacts: Array, remainder: string }}
   */
  function extractAll(text) {
    if (!text || typeof text !== 'string') return { artifacts: [], remainder: text || '' };
    var artifacts = [];
    var occupied = []; // [start,end) ranges to strip for remainder
    var t = text;

    // 1) Fenced blocks: ```viz | ```aether-viz | ```json | ```chart | ```mermaid
    var fenceRe = /```(aether-viz|viz|json|chart|visuali[sz]er|mermaid)\s*\n?([\s\S]*?)```/gi;
    var m;
    while ((m = fenceRe.exec(t)) !== null) {
      var lang = m[1].toLowerCase();
      var body = (m[2] || '').trim();
      var start = m.index;
      var end = m.index + m[0].length;
      if (lang === 'mermaid') {
        if (body) {
          artifacts.push({ kind: 'mermaid', syntax: body, start: start, end: end });
          occupied.push([start, end]);
        }
      } else {
        var spec = tryParseJson(body);
        if (spec) {
          artifacts.push({ kind: 'spec', spec: spec, start: start, end: end, raw: body });
          occupied.push([start, end]);
        }
      }
    }

    // 2) Unfenced JSON objects (skip ranges already occupied)
    var objs = extractJsonObjects(t);
    objs.forEach(function (o) {
      var overlap = occupied.some(function (r) {
        return !(o.end <= r[0] || o.start >= r[1]);
      });
      if (!overlap) {
        artifacts.push(o);
        occupied.push([o.start, o.end]);
      }
    });

    // Sort by position
    artifacts.sort(function (a, b) {
      return a.start - b.start;
    });

    // Build remainder
    occupied.sort(function (a, b) {
      return a[0] - b[0];
    });
    var rem = '';
    var cursor = 0;
    occupied.forEach(function (r) {
      if (r[0] > cursor) rem += t.slice(cursor, r[0]);
      cursor = Math.max(cursor, r[1]);
    });
    if (cursor < t.length) rem += t.slice(cursor);
    rem = rem.replace(/\n{3,}/g, '\n\n').trim();

    return { artifacts: artifacts, remainder: rem };
  }

  function extractSpec(text) {
    var all = extractAll(text);
    for (var i = 0; i < all.artifacts.length; i++) {
      if (all.artifacts[i].kind === 'spec') return all.artifacts[i].spec;
    }
    return null;
  }

  function extractMermaid(text) {
    var all = extractAll(text);
    for (var i = 0; i < all.artifacts.length; i++) {
      if (all.artifacts[i].kind === 'mermaid') return all.artifacts[i].syntax;
    }
    return null;
  }

  // ── Stream-stable (Phase C) ────────────────────────────────

  /**
   * Stabilize incomplete open fences mid-stream so UI doesn't thrash.
   * Returns { display, pending: boolean, openFence: string|null }
   */
  function stabilizeStream(text) {
    text = text || '';
    var open = text.match(/```(aether-viz|viz|json|chart|visuali[sz]er|mermaid)\s*\n?([\s\S]*)$/i);
    if (!open) return { display: text, pending: false, openFence: null };
    // Count fences — odd trailing open fence
    var ticks = text.match(/```/g);
    if (!ticks || ticks.length % 2 === 0) return { display: text, pending: false, openFence: null };
    var lang = open[1];
    var body = open[2] || '';
    // Hide incomplete fence from display; show placeholder
    var closed = text.slice(0, open.index);
    var placeholder =
      '\n\n_[AetherViz · streaming ' + lang + '… ' + body.length + ' chars]_\n';
    return {
      display: closed + placeholder,
      pending: true,
      openFence: lang,
      openBody: body,
    };
  }

  // ── Export helpers ─────────────────────────────────────────

  function downloadBlob(blob, filename) {
    try {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 2000);
      return true;
    } catch (e) {
      return false;
    }
  }

  async function exportToCodingFolder(blob, filename) {
    try {
      var handle = g.codingFolderHandle;
      if (typeof g.fsFolderWrite === 'function' && handle) {
        var path = 'aether-viz/' + filename.replace(/[^\w.\-]+/g, '_');
        // Host fsFolderWrite expects "path\ncontent"
        if (/svg|csv|json|text|xml/i.test(blob.type || '') || /\.(svg|csv|json|txt)$/i.test(filename)) {
          var text = await blob.text();
          var r = await g.fsFolderWrite(path + '\n' + text, { force: true });
          if (g.showNotification) g.showNotification('Saved to folder: ' + path, 'success');
          recordEvent('export.folder', path, { ok: true });
          return { ok: true, path: path, result: r };
        }
        // Binary (png): best-effort via force write of base64 note
        var ab = await blob.arrayBuffer();
        var b64 = '';
        try {
          b64 = btoa(String.fromCharCode.apply(null, new Uint8Array(ab)));
        } catch (e2) {
          downloadBlob(blob, filename);
          return { ok: true, mode: 'download' };
        }
        var note =
          path.replace(/\.png$/i, '.png.b64.txt') +
          '\n# AetherViz PNG base64 — decode offline\n' +
          b64;
        var r2 = await g.fsFolderWrite(note, { force: true });
        if (g.showNotification) g.showNotification('Saved base64 to folder (PNG)', 'info');
        recordEvent('export.folder', path + '.b64', { ok: true });
        return { ok: true, path: path, result: r2, mode: 'b64' };
      }
    } catch (e) {
      recordEvent('export.folder', e.message || String(e), { ok: false });
    }
    downloadBlob(blob, filename);
    return { ok: true, mode: 'download' };
  }

  function addExportBtn(container, getBlob, filename) {
    var bar = document.createElement('div');
    bar.className = 'aether-viz-export-bar';
    var dl = document.createElement('button');
    dl.type = 'button';
    dl.className = 'aether-viz-export-btn';
    dl.textContent = '↓ Export';
    dl.title = 'Download ' + filename;
    dl.onclick = async function () {
      try {
        var blob = await getBlob();
        if (blob) downloadBlob(blob, filename);
      } catch (e) {}
    };
    bar.appendChild(dl);

    // CODE folder export — always shown; prompts if no folder linked
    var folderBtn = document.createElement('button');
    folderBtn.type = 'button';
    folderBtn.className = 'aether-viz-export-btn aether-viz-export-folder';
    folderBtn.textContent = '📁 Folder';
    folderBtn.title = 'Save into linked CODE folder (aether-viz/)';
    folderBtn.onclick = async function () {
      try {
        if (!g.codingFolderHandle) {
          if (g.showNotification) g.showNotification('Link a CODE folder first', 'warn');
          return;
        }
        var blob = await getBlob();
        if (blob) await exportToCodingFolder(blob, filename);
        else if (g.showNotification) g.showNotification('Export failed', 'warn');
      } catch (e) {
        if (g.showNotification) g.showNotification('Folder export: ' + (e.message || e), 'warn');
      }
    };
    bar.appendChild(folderBtn);

    container.style.position = 'relative';
    container.appendChild(bar);
  }

  // ── Chart.js ───────────────────────────────────────────────

  async function ensureChartJS() {
    if (g.Chart) return;
    if (g.AETHER_Lazy) {
      var ok = await g.AETHER_Lazy.ensure('chart');
      if (ok && g.Chart) return;
    }
    await new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
      s.onload = resolve;
      s.onerror = function () {
        reject(new Error('Chart.js load failed'));
      };
      document.head.appendChild(s);
    });
  }

  async function renderChart(spec, container, type) {
    await ensureChartJS();
    var canvas = document.createElement('canvas');
    canvas.style.maxHeight = '320px';
    container.appendChild(canvas);
    if (_chartCache) {
      var prev = _chartCache.get(container);
      if (prev && prev.destroy) prev.destroy();
    }

    var isDonut = type === 'donut' || type === 'pie';
    var isScatter = type === 'scatter';
    var isBubble = type === 'bubble';
    var isRadar = type === 'radar';
    var isHBar = type === 'bar-horizontal';
    var isStacked = type === 'stacked-bar' || type === 'stacked-line';
    var baseType = isDonut
      ? 'doughnut'
      : isHBar
        ? 'bar'
        : isStacked
          ? type === 'stacked-line'
            ? 'line'
            : 'bar'
          : type;
    var isArea = type === 'area';
    var tc = themeChartColors();

    var datasets = (spec.datasets || []).map(function (d, i) {
      return {
        label: d.label || '',
        data: d.data,
        backgroundColor: isDonut
          ? d.colors || VIZ_PALETTE.slice(0, (d.data || []).length)
          : isArea
            ? (d.color || vcPalette(i)) + '44'
            : (d.color || vcPalette(i)) + 'cc',
        borderColor: isDonut
          ? d.colors || VIZ_PALETTE.slice(0, (d.data || []).length)
          : d.color || vcPalette(i),
        borderWidth: 2,
        borderRadius: isDonut || isScatter || isBubble || isRadar || isArea ? 0 : 4,
        tension: 0.4,
        fill: isArea ? 'origin' : d.fill || false,
        pointRadius: isScatter || isBubble ? 5 : 3,
        pointHoverRadius: 6,
      };
    });

    var inst = new g.Chart(canvas, {
      type: isArea ? 'line' : baseType,
      data: { labels: spec.labels || [], datasets: datasets },
      options: {
        responsive: true,
        animation: { duration: 280 },
        indexAxis: isHBar ? 'y' : 'x',
        plugins: {
          legend: {
            display: !!(isDonut || isRadar || datasets.length > 1),
            labels: { color: tc.legend, font: { size: 11 }, boxWidth: 12 },
          },
          title: {
            display: !!(spec.options && spec.options.title),
            text: (spec.options && spec.options.title) || '',
            color: tc.title,
            font: { size: 13, weight: '500' },
          },
          tooltip: {
            backgroundColor: tc.tooltipBg,
            titleColor: tc.tooltipTitle,
            bodyColor: tc.tooltipBody,
            borderColor: tc.tooltipBorder,
            borderWidth: 1,
            padding: 10,
          },
        },
        scales:
          isDonut || isRadar
            ? isRadar
              ? {
                  r: {
                    ticks: { color: tc.tick, backdropColor: 'transparent' },
                    grid: { color: tc.grid },
                    pointLabels: { color: tc.legend, font: { size: 11 } },
                  },
                }
              : {}
            : {
                x: {
                  stacked: isStacked,
                  ticks: { color: tc.tick, maxRotation: 45 },
                  grid: { color: tc.grid },
                  title: {
                    display: !!(spec.options && spec.options.xLabel),
                    text: (spec.options && spec.options.xLabel) || '',
                    color: tc.tick,
                    font: { size: 11 },
                  },
                },
                y: {
                  stacked: isStacked,
                  ticks: { color: tc.tick },
                  grid: { color: tc.grid },
                  title: {
                    display: !!(spec.options && spec.options.yLabel),
                    text: (spec.options && spec.options.yLabel) || '',
                    color: tc.tick,
                    font: { size: 11 },
                  },
                },
              },
      },
    });
    if (_chartCache) _chartCache.set(container, inst);
    addExportBtn(
      container,
      function () {
        return new Promise(function (res) {
          canvas.toBlob(res, 'image/png');
        });
      },
      ((spec.options && spec.options.title) || type) + '.png'
    );
  }

  // ── Table ──────────────────────────────────────────────────

  function renderTable(spec, container) {
    var headers = spec.headers || [];
    var rows = spec.rows || [];
    var sortCol = -1;
    var sortAsc = true;
    var wrap = document.createElement('div');
    wrap.className = 'aether-viz-table-wrap';

    function buildTable() {
      var sorted =
        sortCol >= 0
          ? rows.slice().sort(function (a, b) {
              var av = a[sortCol];
              var bv = b[sortCol];
              var n = function (v) {
                return !isNaN(parseFloat(v));
              };
              var cmp =
                n(av) && n(bv) ? parseFloat(av) - parseFloat(bv) : String(av).localeCompare(String(bv));
              return sortAsc ? cmp : -cmp;
            })
          : rows;
      var html =
        '<table class="aether-data-table" style="width:100%;border-collapse:collapse;font-size:.78rem;font-family:var(--font-mono,monospace);">';
      if (headers.length) {
        html +=
          '<thead><tr>' +
          headers
            .map(function (h, i) {
              var active = sortCol === i;
              var icon = active ? (sortAsc ? ' ↑' : ' ↓') : '';
              return (
                '<th data-col="' +
                i +
                '" class="aether-data-th" style="font-weight:600;padding:9px 12px;text-align:left;cursor:pointer;user-select:none;white-space:nowrap;">' +
                escHtml(h) +
                icon +
                '</th>'
              );
            })
            .join('') +
          '</tr></thead>';
      }
      html +=
        '<tbody>' +
        sorted
          .map(function (row, ri) {
            return (
              '<tr class="' +
              (ri % 2 === 0 ? 'row-even' : 'row-odd') +
              '">' +
              row
                .map(function (cell) {
                  return (
                    '<td style="padding:8px 12px;white-space:nowrap;">' + escHtml(cell) + '</td>'
                  );
                })
                .join('') +
              '</tr>'
            );
          })
          .join('') +
        '</tbody></table>';
      wrap.innerHTML = html;
      wrap.querySelectorAll('th[data-col]').forEach(function (th) {
        th.onclick = function () {
          var col = +th.dataset.col;
          if (sortCol === col) sortAsc = !sortAsc;
          else {
            sortCol = col;
            sortAsc = true;
          }
          buildTable();
        };
      });
    }
    buildTable();
    container.appendChild(wrap);
    addExportBtn(
      container,
      function () {
        var lines = [
          headers.join(','),
          rows
            .map(function (r) {
              return r
                .map(function (c) {
                  return '"' + String(c).replace(/"/g, '""') + '"';
                })
                .join(',');
            })
            .join('\n'),
        ];
        // fix join - rows should each be a line
        lines = [headers.join(',')].concat(
          rows.map(function (r) {
            return r
              .map(function (c) {
                return '"' + String(c).replace(/"/g, '""') + '"';
              })
              .join(',');
          })
        );
        return Promise.resolve(new Blob([lines.join('\n')], { type: 'text/csv' }));
      },
      ((spec.options && spec.options.title) || 'table') + '.csv'
    );
  }

  // ── Gantt ──────────────────────────────────────────────────

  function renderGantt(spec, container) {
    var tasks = spec.tasks || [];
    if (!tasks.length) {
      vizErr(container, 'No tasks');
      return;
    }
    var PAD = 24;
    var LABEL_W = 160;
    var ROW_H = 36;
    var HEADER_H = 40;
    var allDates = tasks.flatMap(function (t) {
      return [new Date(t.start), new Date(t.end)];
    });
    var minD = new Date(Math.min.apply(null, allDates));
    var maxD = new Date(Math.max.apply(null, allDates));
    var totalMs = maxD - minD || 1;
    var W = 800;
    var chartW = W - LABEL_W - PAD * 2;
    var H = HEADER_H + tasks.length * ROW_H + PAD;
    var svg =
      '<svg width="100%" viewBox="0 0 ' + W + ' ' + H + '" font-family="system-ui" font-size="11">';
    svg += '<rect x="0" y="0" width="' + W + '" height="' + HEADER_H + '" fill="#0a1018"/>';
    var ms = new Date(minD);
    ms.setDate(1);
    while (ms <= maxD) {
      var x = LABEL_W + PAD + ((ms - minD) / totalMs) * chartW;
      svg +=
        '<text x="' +
        x +
        '" y="' +
        HEADER_H / 2 +
        '" dominant-baseline="central" fill="#556677" font-size="10">' +
        ms.toLocaleString('default', { month: 'short' }) +
        '</text>';
      svg +=
        '<line x1="' +
        x +
        '" y1="' +
        HEADER_H +
        '" x2="' +
        x +
        '" y2="' +
        H +
        '" stroke="#1e2535" stroke-width="1"/>';
      ms.setMonth(ms.getMonth() + 1);
    }
    var todayX = LABEL_W + PAD + ((Date.now() - minD) / totalMs) * chartW;
    if (todayX > LABEL_W && todayX < W) {
      svg +=
        '<line x1="' +
        todayX +
        '" y1="' +
        HEADER_H +
        '" x2="' +
        todayX +
        '" y2="' +
        H +
        '" stroke="#00f3ff" stroke-width="1" stroke-dasharray="4 3" opacity="0.5"/>';
    }
    tasks.forEach(function (t, i) {
      var y = HEADER_H + i * ROW_H;
      var tx = LABEL_W + PAD + ((new Date(t.start) - minD) / totalMs) * chartW;
      var tw = Math.max(4, ((new Date(t.end) - new Date(t.start)) / totalMs) * chartW);
      var col = vcPalette(i);
      var bg = i % 2 === 0 ? '#060810' : '#080e16';
      svg += '<rect x="0" y="' + y + '" width="' + W + '" height="' + ROW_H + '" fill="' + bg + '"/>';
      svg +=
        '<text x="' +
        (LABEL_W - 8) +
        '" y="' +
        (y + ROW_H / 2) +
        '" text-anchor="end" dominant-baseline="central" fill="#8aaabb" font-size="11">' +
        escHtml(t.label || t.name || t.task || 'Task') +
        '</text>';
      svg +=
        '<rect x="' +
        tx +
        '" y="' +
        (y + 6) +
        '" width="' +
        tw +
        '" height="' +
        (ROW_H - 12) +
        '" rx="4" fill="' +
        col +
        '33" stroke="' +
        col +
        '" stroke-width="1"/>';
      if (t.progress != null) {
        var pw = tw * Math.min(1, Math.max(0, t.progress / 100));
        svg +=
          '<rect x="' +
          tx +
          '" y="' +
          (y + ROW_H - 8) +
          '" width="' +
          pw +
          '" height="3" rx="1" fill="' +
          col +
          '" opacity="0.7"/>';
      }
    });
    svg += '</svg>';
    container.innerHTML = svg;
    addExportBtn(
      container,
      function () {
        return Promise.resolve(new Blob([svg], { type: 'image/svg+xml' }));
      },
      ((spec.options && spec.options.title) || 'gantt') + '.svg'
    );
  }

  // ── Heatmap ────────────────────────────────────────────────

  function renderHeatmap(spec, container) {
    var data = spec.data || [];
    var xLabels = spec.xLabels || [];
    var yLabels = spec.yLabels || [];
    var options = spec.options || {};
    if (!data.length) {
      vizErr(container, 'No data');
      return;
    }
    var allVals = data.flat().filter(function (v) {
      return v != null;
    });
    var minV = Math.min.apply(null, allVals);
    var maxV = Math.max.apply(null, allVals);
    var CELL = 44;
    var LABEL_H = 64;
    var LABEL_W = 80;
    var W = LABEL_W + xLabels.length * CELL + 8;
    var H = LABEL_H + yLabels.length * CELL + 8;
    var baseColor = options.color || '#378ADD';
    var hex2rgb = function (h) {
      return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    };
    var rgb = hex2rgb(baseColor);
    var br = rgb[0];
    var bg = rgb[1];
    var bb = rgb[2];
    var svg = '<svg width="100%" viewBox="0 0 ' + W + ' ' + H + '" font-family="system-ui">';
    xLabels.forEach(function (l, i) {
      svg +=
        '<text x="' +
        (LABEL_W + i * CELL + CELL / 2) +
        '" y="' +
        (LABEL_H - 8) +
        '" text-anchor="middle" fill="#556677" font-size="10">' +
        escHtml(l) +
        '</text>';
    });
    yLabels.forEach(function (l, i) {
      svg +=
        '<text x="' +
        (LABEL_W - 8) +
        '" y="' +
        (LABEL_H + i * CELL + CELL / 2) +
        '" text-anchor="end" dominant-baseline="central" fill="#556677" font-size="10">' +
        escHtml(l) +
        '</text>';
    });
    data.forEach(function (row, ri) {
      row.forEach(function (val, ci) {
        if (val == null) return;
        var t = maxV === minV ? 0.5 : (val - minV) / (maxV - minV);
        var r = Math.round(br * t + 20 * (1 - t));
        var gg = Math.round(bg * t + 30 * (1 - t));
        var b = Math.round(bb * t + 50 * (1 - t));
        var x = LABEL_W + ci * CELL;
        var y = LABEL_H + ri * CELL;
        svg +=
          '<rect x="' +
          (x + 2) +
          '" y="' +
          (y + 2) +
          '" width="' +
          (CELL - 4) +
          '" height="' +
          (CELL - 4) +
          '" rx="4" fill="rgba(' +
          r +
          ',' +
          gg +
          ',' +
          b +
          ',' +
          (0.3 + t * 0.7) +
          ')"/>';
        svg +=
          '<text x="' +
          (x + CELL / 2) +
          '" y="' +
          (y + CELL / 2) +
          '" text-anchor="middle" dominant-baseline="central" font-size="10" fill="' +
          (t > 0.5 ? '#c8d8e8' : '#8aaabb') +
          '">' +
          (typeof val === 'number' ? val.toLocaleString() : val) +
          '</text>';
      });
    });
    svg += '</svg>';
    container.innerHTML = svg;
    addExportBtn(
      container,
      function () {
        return Promise.resolve(new Blob([svg], { type: 'image/svg+xml' }));
      },
      'heatmap.svg'
    );
  }

  // ── Timeline ───────────────────────────────────────────────

  function renderTimeline(spec, container) {
    var events = spec.events || [];
    if (!events.length) {
      vizErr(container, 'No events');
      return;
    }
    var PAD = 24;
    var ITEM_H = 64;
    var DOT_R = 7;
    var LINE_X = 120;
    var H = PAD + events.length * ITEM_H + PAD;
    var svg = '<svg width="100%" viewBox="0 0 700 ' + H + '" font-family="system-ui">';
    svg +=
      '<line x1="' +
      LINE_X +
      '" y1="' +
      PAD +
      '" x2="' +
      LINE_X +
      '" y2="' +
      (H - PAD) +
      '" stroke="#1e3048" stroke-width="2"/>';
    events.forEach(function (ev, i) {
      var y = PAD + i * ITEM_H + ITEM_H / 2;
      var col = vcPalette(i);
      svg +=
        '<circle cx="' +
        LINE_X +
        '" cy="' +
        y +
        '" r="' +
        DOT_R +
        '" fill="' +
        col +
        '" stroke="#060810" stroke-width="2"/>';
      if (ev.date || ev.time)
        svg +=
          '<text x="' +
          (LINE_X - 16) +
          '" y="' +
          y +
          '" text-anchor="end" dominant-baseline="central" fill="#556677" font-size="10">' +
          escHtml(ev.date || ev.time) +
          '</text>';
      svg +=
        '<text x="' +
        (LINE_X + 20) +
        '" y="' +
        (y - (ev.description ? 8 : 0)) +
        '" dominant-baseline="central" fill="#c8d8e8" font-size="13" font-weight="500">' +
        escHtml(ev.label || ev.title || ev.event) +
        '</text>';
      if (ev.description)
        svg +=
          '<text x="' +
          (LINE_X + 20) +
          '" y="' +
          (y + 14) +
          '" dominant-baseline="central" fill="#556677" font-size="11">' +
          escHtml(ev.description) +
          '</text>';
    });
    svg += '</svg>';
    container.innerHTML = svg;
    addExportBtn(
      container,
      function () {
        return Promise.resolve(new Blob([svg], { type: 'image/svg+xml' }));
      },
      'timeline.svg'
    );
  }

  // ── Flow ───────────────────────────────────────────────────

  function renderFlow(spec, container) {
    var nodes = spec.nodes || [];
    var edges = spec.edges || [];
    var layout = String(spec.layout || 'TB').toUpperCase();
    var NW = 140;
    var NH = 48;
    var GAPX = 70;
    var GAPY = 80;
    var PAD = 30;
    var rank = {};
    nodes.forEach(function (n) {
      rank[n.id] = 0;
    });
    var changed = true;
    for (var pass = 0; pass < nodes.length && changed; pass++) {
      changed = false;
      edges.forEach(function (e) {
        if (rank[e.to] <= rank[e.from]) {
          rank[e.to] = rank[e.from] + 1;
          changed = true;
        }
      });
    }
    var layers = [];
    nodes.forEach(function (n) {
      var r = rank[n.id] || 0;
      (layers[r] = layers[r] || []).push(n);
    });
    var pos = {};
    var maxX = 0;
    var maxY = 0;

    if (layout === 'RADIAL') {
      var cx = 320;
      var cy = 280;
      var R_INNER = 90;
      var R_OUTER = 220;
      var center =
        nodes.find(function (n) {
          return !edges.some(function (e) {
            return e.to === n.id;
          });
        }) || nodes[0];
      if (center) pos[center.id] = { x: cx - NW / 2, y: cy - NH / 2 };
      var rest = nodes.filter(function (n) {
        return n.id !== (center && center.id);
      });
      rest.forEach(function (n, i) {
        var angle = (i / Math.max(1, rest.length)) * Math.PI * 2 - Math.PI / 2;
        var r = rest.length > 6 ? R_OUTER : R_INNER + 40;
        pos[n.id] = { x: cx + Math.cos(angle) * r - NW / 2, y: cy + Math.sin(angle) * r - NH / 2 };
      });
      return renderFlowPositioned(spec, container, pos, nodes, edges, NW, NH, 700, 580);
    }

    if (layout === 'LR') {
      layers.forEach(function (layer, li) {
        var x = PAD + li * (NW + GAPX);
        var totalH = layer.length * (NH + GAPY) - GAPY;
        layer.forEach(function (n, ni) {
          var y = PAD + ni * (NH + GAPY) + (totalH < 300 ? (300 - totalH) / 2 : 0);
          pos[n.id] = { x: x, y: y };
          maxX = Math.max(maxX, x + NW);
          maxY = Math.max(maxY, y + NH);
        });
      });
    } else {
      layers.forEach(function (layer, li) {
        var y = PAD + li * (NH + GAPY);
        var totalW = layer.length * (NW + GAPX) - GAPX;
        layer.forEach(function (n, ni) {
          var x = PAD + ni * (NW + GAPX) + (totalW < 400 ? (400 - totalW) / 2 : 0);
          pos[n.id] = { x: x, y: y };
          maxX = Math.max(maxX, x + NW);
          maxY = Math.max(maxY, y + NH);
        });
      });
    }
    return renderFlowPositioned(spec, container, pos, nodes, edges, NW, NH, maxX + PAD, maxY + PAD);
  }

  function renderFlowPositioned(spec, container, pos, nodes, edges, NW, NH, maxX, maxY) {
    var edgeSvg = '';
    var nodeSvg = '';
    edges.forEach(function (e) {
      var s = pos[e.from];
      var t = pos[e.to];
      if (!s || !t) return;
      var x1 = s.x + NW / 2;
      var y1 = s.y + NH;
      var x2 = t.x + NW / 2;
      var y2 = t.y;
      var isBack = s.y >= t.y && s.x === t.x;
      if (isBack) {
        var cx = Math.max(x1, x2) + 50;
        edgeSvg +=
          '<path d="M' +
          x1 +
          ' ' +
          (s.y + NH / 2) +
          ' L' +
          cx +
          ' ' +
          (s.y + NH / 2) +
          ' L' +
          cx +
          ' ' +
          (t.y + NH / 2) +
          ' L' +
          x2 +
          ' ' +
          (t.y + NH / 2) +
          '" fill="none" stroke="#334455" stroke-width="1.5" stroke-dasharray="5 3" marker-end="url(#av-arrow)"/>';
      } else {
        var mx = (x1 + x2) / 2;
        var my = (y1 + y2) / 2;
        edgeSvg +=
          '<path d="M' +
          x1 +
          ' ' +
          y1 +
          ' C' +
          x1 +
          ' ' +
          (my + 20) +
          ',' +
          x2 +
          ' ' +
          (my - 20) +
          ',' +
          x2 +
          ' ' +
          y2 +
          '" fill="none" stroke="#334455" stroke-width="1.5" marker-end="url(#av-arrow)"/>';
        if (e.label)
          edgeSvg +=
            '<text x="' +
            (mx + 6) +
            '" y="' +
            my +
            '" font-size="10" fill="#556677" font-family="system-ui">' +
            escHtml(e.label) +
            '</text>';
      }
    });
    nodes.forEach(function (n) {
      var p = pos[n.id] || { x: 0, y: 0 };
      var x = p.x;
      var y = p.y;
      var c = vc(n.color || 'gray');
      var shape = n.shape || 'rect';
      var ty = n.sub ? y + NH * 0.36 : y + NH / 2;
      if (shape === 'diamond') {
        var cx2 = x + NW / 2;
        var cy2 = y + NH / 2;
        nodeSvg +=
          '<g><polygon points="' +
          cx2 +
          ',' +
          y +
          ' ' +
          (x + NW) +
          ',' +
          cy2 +
          ' ' +
          cx2 +
          ',' +
          (y + NH) +
          ' ' +
          x +
          ',' +
          cy2 +
          '" fill="' +
          c.fill +
          '" stroke="' +
          c.stroke +
          '" stroke-width="1"/>';
      } else if (shape === 'circle') {
        nodeSvg +=
          '<g><ellipse cx="' +
          (x + NW / 2) +
          '" cy="' +
          (y + NH / 2) +
          '" rx="' +
          NW / 2 +
          '" ry="' +
          NH / 2 +
          '" fill="' +
          c.fill +
          '" stroke="' +
          c.stroke +
          '" stroke-width="1"/>';
      } else {
        nodeSvg +=
          '<g><rect x="' +
          x +
          '" y="' +
          y +
          '" width="' +
          NW +
          '" height="' +
          NH +
          '" rx="8" fill="' +
          c.fill +
          '" stroke="' +
          c.stroke +
          '" stroke-width="1"/>';
      }
      nodeSvg +=
        '<text x="' +
        (x + NW / 2) +
        '" y="' +
        ty +
        '" text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="500" fill="' +
        c.text +
        '" font-family="system-ui">' +
        escHtml(n.label || n.id) +
        '</text>';
      if (n.sub)
        nodeSvg +=
          '<text x="' +
          (x + NW / 2) +
          '" y="' +
          (y + NH * 0.72) +
          '" text-anchor="middle" dominant-baseline="central" font-size="9" fill="' +
          c.stroke +
          '" font-family="system-ui">' +
          escHtml(n.sub) +
          '</text>';
      nodeSvg += '</g>';
    });
    var W = clamp(maxX, 300, 1000);
    var H = clamp(maxY, 100, 1400);
    var svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('width', '100%');
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svgEl.style.overflow = 'visible';
    svgEl.innerHTML = ARROW + edgeSvg + nodeSvg;
    container.appendChild(svgEl);
    addExportBtn(
      container,
      function () {
        var s = new XMLSerializer().serializeToString(svgEl);
        return Promise.resolve(new Blob([s], { type: 'image/svg+xml' }));
      },
      ((spec.options && spec.options.title) || 'flow') + '.svg'
    );
  }

  // ── Struct ─────────────────────────────────────────────────

  function renderStruct(spec, container) {
    var regions = spec.regions || [];
    var W = 640;
    var PAD = 20;
    var OUTER_X = 20;
    var OUTER_Y = 20;
    var OUTER_W = W - 40;
    var R_H = (spec.layout && spec.layout.regionHeight) || 110;
    var GAP = 12;
    var totalW = OUTER_W - PAD * 2;
    var rW = regions.length > 0 ? Math.floor((totalW - (regions.length - 1) * GAP) / regions.length) : totalW;
    var OUTER_H = R_H + 70;
    var c = vc(spec.color || 'purple');
    var rSvg = '';
    regions.forEach(function (r, i) {
      var rx = OUTER_X + PAD + (rW + GAP) * i;
      var ry = OUTER_Y + 48;
      var rc = vc(r.color || 'blue');
      rSvg +=
        '<rect x="' +
        rx +
        '" y="' +
        ry +
        '" width="' +
        rW +
        '" height="' +
        R_H +
        '" rx="8" fill="' +
        rc.fill +
        '" stroke="' +
        rc.stroke +
        '" stroke-width="0.5"/>' +
        '<text x="' +
        (rx + rW / 2) +
        '" y="' +
        (ry + (r.sub ? 36 : R_H / 2)) +
        '" text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="500" fill="' +
        rc.text +
        '" font-family="system-ui">' +
        escHtml(r.label) +
        '</text>' +
        (r.sub
          ? '<text x="' +
            (rx + rW / 2) +
            '" y="' +
            (ry + 60) +
            '" text-anchor="middle" dominant-baseline="central" font-size="10" fill="' +
            rc.stroke +
            '" font-family="system-ui">' +
            escHtml(r.sub) +
            '</text>'
          : '');
    });
    var svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('width', '100%');
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + (OUTER_H + 40));
    svgEl.innerHTML =
      '<rect x="' +
      OUTER_X +
      '" y="' +
      OUTER_Y +
      '" width="' +
      OUTER_W +
      '" height="' +
      OUTER_H +
      '" rx="14" fill="' +
      c.fill +
      '" stroke="' +
      c.stroke +
      '" stroke-width="0.5" stroke-dasharray="6 4"/>' +
      '<text x="' +
      (OUTER_X + 16) +
      '" y="' +
      (OUTER_Y + 24) +
      '" dominant-baseline="central" font-size="12" font-weight="500" fill="' +
      c.text +
      '" font-family="system-ui">' +
      escHtml(spec.label || 'Container') +
      '</text>' +
      rSvg;
    container.appendChild(svgEl);
    addExportBtn(
      container,
      function () {
        var s = new XMLSerializer().serializeToString(svgEl);
        return Promise.resolve(new Blob([s], { type: 'image/svg+xml' }));
      },
      'struct.svg'
    );
  }

  // ── Mermaid ────────────────────────────────────────────────

  async function ensureMermaid() {
    if (_mermaidReady || g.__aether_mermaid) {
      _mermaidReady = true;
      return;
    }
    if (!g.mermaid) {
      if (g.AETHER_Lazy) {
        try {
          await g.AETHER_Lazy.ensure('mermaid');
        } catch (e) {}
      }
      if (!g.mermaid) {
        try {
          var mod = await import('https://esm.sh/mermaid@11/dist/mermaid.esm.min.mjs');
          g.__aether_mermaid = mod.default || mod;
        } catch (e) {
          throw new Error('Mermaid not available');
        }
      } else {
        g.__aether_mermaid = g.mermaid;
      }
    } else {
      g.__aether_mermaid = g.mermaid;
    }
    g.__aether_mermaid.initialize({
      startOnLoad: false,
      theme: isIvory() ? 'default' : 'base',
      fontFamily: 'system-ui, sans-serif',
      securityLevel: 'strict',
      themeVariables: isIvory()
        ? { fontSize: '13px' }
        : {
            darkMode: true,
            background: '#060810',
            primaryColor: '#0d1520',
            primaryTextColor: '#c8d8e8',
            primaryBorderColor: '#1e3048',
            lineColor: '#334455',
            textColor: '#8aaabb',
            fontSize: '13px',
          },
    });
    _mermaidReady = true;
  }

  async function renderMermaid(syntax, container) {
    await ensureMermaid();
    var id = 'av-mermaid-' + Math.random().toString(36).slice(2);
    var result = await g.__aether_mermaid.render(id, syntax);
    var svg = result.svg || result;
    // Phase B: sanitize Mermaid SVG output
    try {
      svg = sanitizeSVG(svg);
    } catch (e) {
      /* keep raw if sanitize fails on mermaid quirks */
    }
    container.innerHTML = svg;
    var svgEl = container.querySelector('svg');
    if (svgEl) {
      svgEl.style.background = 'transparent';
      svgEl.setAttribute('width', '100%');
    }
    addExportBtn(
      container,
      function () {
        return Promise.resolve(new Blob([svg], { type: 'image/svg+xml' }));
      },
      'diagram.svg'
    );
  }

  // ── Master render ──────────────────────────────────────────

  async function render(spec, container) {
    if (!spec || !spec.type) throw new Error('No type in spec');
    baseContainer(container);
    var t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    var type = String(spec.type).toLowerCase();
    switch (type) {
      case 'bar':
        await renderChart(spec, container, 'bar');
        break;
      case 'bar-horizontal':
      case 'horizontal-bar':
        await renderChart(spec, container, 'bar-horizontal');
        break;
      case 'stacked-bar':
        await renderChart(spec, container, 'stacked-bar');
        break;
      case 'stacked-line':
        await renderChart(spec, container, 'stacked-line');
        break;
      case 'line':
        await renderChart(spec, container, 'line');
        break;
      case 'area':
        await renderChart(spec, container, 'area');
        break;
      case 'donut':
      case 'pie':
        await renderChart(spec, container, 'donut');
        break;
      case 'scatter':
        await renderChart(spec, container, 'scatter');
        break;
      case 'bubble':
        await renderChart(spec, container, 'bubble');
        break;
      case 'radar':
      case 'spider':
        await renderChart(spec, container, 'radar');
        break;
      case 'flow':
        renderFlow(spec, container);
        break;
      case 'struct':
        renderStruct(spec, container);
        break;
      case 'table':
        renderTable(spec, container);
        break;
      case 'gantt':
        renderGantt(spec, container);
        break;
      case 'heatmap':
        renderHeatmap(spec, container);
        break;
      case 'timeline':
        renderTimeline(spec, container);
        break;
      case 'svg':
        if (!spec.svg) throw new Error('No svg field');
        container.innerHTML = sanitizeSVG(spec.svg);
        addExportBtn(
          container,
          function () {
            return Promise.resolve(new Blob([spec.svg], { type: 'image/svg+xml' }));
          },
          'diagram.svg'
        );
        break;
      default:
        throw new Error('Unknown spec type: ' + type);
    }
    var ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
    recordEvent('render', type, { ok: true, ms: ms, type: type });
  }

  /**
   * Render all artifacts found in text into host container.
   * @returns {{ rendered: boolean, count: number, remainder: string, errors: number }}
   */
  async function autoDetect(text, container) {
    var extracted = extractAll(text);
    if (!extracted.artifacts.length) {
      return { rendered: false, count: 0, remainder: text, errors: 0 };
    }

    baseContainer(container);
    var okCount = 0;
    var errCount = 0;

    for (var i = 0; i < extracted.artifacts.length; i++) {
      var art = extracted.artifacts[i];
      var slot = document.createElement('div');
      slot.className = 'aether-viz-slot';
      container.appendChild(slot);
      try {
        if (art.kind === 'spec') {
          await render(art.spec, slot);
          okCount++;
        } else if (art.kind === 'mermaid') {
          await renderMermaid(art.syntax, slot);
          okCount++;
        }
      } catch (e) {
        errCount++;
        vizErr(slot, e.message || String(e), art.spec || art.syntax || art.raw);
        recordEvent('render', e.message || 'fail', { ok: false, type: art.kind });
      }
    }

    // Phase A: if ALL failed, treat as not rendered so host falls through to markdown
    if (okCount === 0 && errCount > 0) {
      return {
        rendered: false,
        count: 0,
        remainder: text,
        errors: errCount,
        failed: true,
      };
    }

    return {
      rendered: okCount > 0,
      count: okCount,
      remainder: extracted.remainder,
      errors: errCount,
    };
  }

  // Backward-compatible boolean wrapper used by older host code
  async function autoDetectBool(text, container) {
    var r = await autoDetect(text, container);
    return !!r.rendered;
  }

  // ── Golden fixtures ────────────────────────────────────────

  function runGoldenFixtures() {
    var results = [];
    function ok(name, pass, detail) {
      results.push({ name: name, pass: !!pass, detail: detail || '' });
    }

    // normalizeSpec: flow/struct/svg (the v0.1 regression)
    var flow = normalizeSpec({
      type: 'flow',
      nodes: [{ id: 'a', label: 'A' }],
      edges: [],
    });
    ok('normalize_flow', !!(flow && flow.type === 'flow' && flow.nodes), JSON.stringify(flow && flow.type));

    var struct = normalizeSpec({
      type: 'struct',
      label: 'Sys',
      regions: [{ label: 'FE' }],
    });
    ok('normalize_struct', !!(struct && struct.type === 'struct'), '');

    var svgSpec = normalizeSpec({ type: 'svg', svg: '<svg><rect x="0" y="0" width="10" height="10"/></svg>' });
    ok('normalize_svg', !!(svgSpec && svgSpec.svg), '');

    var bar = normalizeSpec({
      type: 'bar',
      labels: ['A', 'B'],
      datasets: [{ data: [1, 2] }],
    });
    ok('normalize_bar', !!(bar && bar.datasets), '');

    var flat = normalizeSpec({ type: 'line', data: [1, 2, 3], labels: ['a', 'b', 'c'] });
    ok('normalize_flat', !!(flat && flat.datasets && flat.datasets[0].data.length === 3), '');

    // multi-spec extract
    var multi = extractAll(
      'Here is data:\n```viz\n{"type":"table","headers":["A"],"rows":[["1"]]}\n```\n' +
        'And mermaid:\n```mermaid\ngraph TD; A-->B\n```\nDone.'
    );
    ok('extract_multi', multi.artifacts.length >= 2, 'n=' + multi.artifacts.length);
    ok('extract_remainder', /Done/.test(multi.remainder) && !/headers/.test(multi.remainder), multi.remainder.slice(0, 40));

    // fence aether-viz
    var av = extractAll('```aether-viz\n{"type":"timeline","events":[{"date":"2024","label":"X"}]}\n```');
    ok('fence_aether_viz', av.artifacts.length === 1 && av.artifacts[0].kind === 'spec', '');

    // sanitize strips script
    try {
      var dirty = sanitizeSVG('<svg><script>alert(1)</script><rect x="0" y="0" width="1" height="1"/></svg>');
      ok('sanitize_script', dirty.indexOf('script') === -1, dirty.slice(0, 60));
    } catch (e) {
      ok('sanitize_script', false, e.message);
    }

    // stream stabilize
    var st = stabilizeStream('Hello\n```viz\n{"type":"bar"');
    ok('stream_stabilize', st.pending === true && /streaming/.test(st.display), '');

    var st2 = stabilizeStream('```viz\n{"type":"bar","labels":["A"],"datasets":[{"data":[1]}]}\n```\nDone');
    ok('stream_closed', st2.pending === false, '');

    // types list completeness
    ok('types_list', ALL_TYPES.length >= 16, 'n=' + ALL_TYPES.length);

    var passed = results.filter(function (r) {
      return r.pass;
    }).length;
    return {
      version: VERSION,
      schema: SCHEMA,
      ok: passed === results.length,
      passed: passed,
      total: results.length,
      results: results,
    };
  }

  function typeListMarkdown() {
    return (
      'Charts: bar · bar-horizontal · stacked-bar · stacked-line · line · area · donut · pie · scatter · bubble · radar\n' +
      'Diagrams: flow (TB|LR|RADIAL) · struct · table · gantt · heatmap · timeline · svg · mermaid\n' +
      'Fences: ```viz · ```aether-viz · ```json · ```mermaid · or raw JSON with "type"'
    );
  }

  // ── Public API ─────────────────────────────────────────────

  g.AetherVisualizer = {
    version: VERSION,
    schema: SCHEMA,
    render: render,
    renderMermaid: renderMermaid,
    autoDetect: autoDetect,
    autoDetectBool: autoDetectBool,
    extractSpec: extractSpec,
    extractMermaid: extractMermaid,
    extractAll: extractAll,
    normalizeSpec: normalizeSpec,
    sanitizeSVG: sanitizeSVG,
    stabilizeStream: stabilizeStream,
    runGoldenFixtures: runGoldenFixtures,
    typeListMarkdown: typeListMarkdown,
    colors: VIZ_COLORS,
    palette: VIZ_PALETTE,
    types: ALL_TYPES.slice(),
  };

  // Alias
  g.AETHER_Visualizer = g.AetherVisualizer;
})(typeof globalThis !== 'undefined' ? globalThis : window);
