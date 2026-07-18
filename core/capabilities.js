/**
 * AETHER capability probe — surface degraded CDN / optional features
 * so users know what is online without reading the console.
 */
(function (g) {
  'use strict';

  var PROBES = [
    { id: 'localforage', label: 'Storage (localforage)', ok: function () { return !!(g.localforage && g.localforage.getItem); }, critical: false },
    { id: 'mathjs', label: 'Math engine', ok: function () { return !!(g.math && g.math.evaluate); }, critical: false },
    { id: 'hljs', label: 'Code highlight', ok: function () { return !!g.hljs; }, critical: false },
    { id: 'prettier', label: 'Code formatter', ok: function () { return !!g.prettier; }, critical: false },
    { id: 'mermaid', label: 'Diagrams (Mermaid)', ok: function () { return !!(g.mermaid && g.mermaid.run); }, critical: false },
    { id: 'katex', label: 'Math rendering (KaTeX)', ok: function () { return !!g.katex; }, critical: false },
    { id: 'ort', label: 'ONNX Runtime', ok: function () { return !!g.ort; }, critical: false },
    { id: 'tesseract', label: 'OCR (Tesseract)', ok: function () { return !!g.Tesseract; }, critical: false },
    { id: 'chart', label: 'Charts', ok: function () { return !!g.Chart; }, critical: false },
    { id: 'pdf', label: 'PDF.js', ok: function () { return !!g.pdfjsLib; }, critical: false },
    { id: 'mammoth', label: 'DOCX reader', ok: function () { return !!g.mammoth; }, critical: false },
    { id: 'transformers', label: 'Whisper / Transformers.js', ok: function () { return !!(g.transformers || g.pipeline); }, critical: false },
  ];

  function scan() {
    var results = PROBES.map(function (p) {
      var ok = false;
      try { ok = !!p.ok(); } catch (e) { ok = false; }
      return { id: p.id, label: p.label, ok: ok, critical: p.critical };
    });
    return {
      results: results,
      missing: results.filter(function (r) { return !r.ok; }),
      ready: results.filter(function (r) { return r.ok; }),
      allOk: results.every(function (r) { return r.ok; }),
    };
  }

  function renderBanner(report) {
    if (!report || !report.missing || !report.missing.length) return null;
    var existing = document.getElementById('aether-cap-banner');
    if (existing) existing.remove();

    var el = document.createElement('div');
    el.id = 'aether-cap-banner';
    el.className = 'aether-cap-banner';
    el.setAttribute('role', 'status');

    var names = report.missing.map(function (m) { return m.label; }).slice(0, 6).join(' · ');
    var more = report.missing.length > 6 ? ' +' + (report.missing.length - 6) + ' more' : '';

    el.innerHTML =
      '<div class="cap-banner-inner">' +
        '<span class="cap-banner-icon">⬡</span>' +
        '<span class="cap-banner-text"><strong>Degraded mode</strong> — optional modules unavailable (CDN blocked/offline): ' +
          names + more +
          '. Core chat still works.</span>' +
        '<button type="button" class="cap-banner-dismiss" aria-label="Dismiss">×</button>' +
      '</div>';

    el.querySelector('.cap-banner-dismiss').addEventListener('click', function () {
      el.remove();
      try { sessionStorage.setItem('aether_cap_banner_dismissed', '1'); } catch (e) {}
    });

    return el;
  }

  function showIfNeeded(delayMs) {
    // v5.38: optional CDNs are lazy-loaded. Missing-at-boot is normal — do not
    // scare users with a "degraded mode" banner for libs that simply haven't
    // been requested yet. Only surface *critical* failures.
    delayMs = typeof delayMs === 'number' ? delayMs : 4000;
    setTimeout(function () {
      try {
        if (sessionStorage.getItem('aether_cap_banner_dismissed') === '1') return;
      } catch (e) {}
      var report = scan();
      g.AETHER_CAPABILITIES = report;
      var criticalMissing = (report.missing || []).filter(function (m) {
        return m.critical;
      });
      if (!criticalMissing.length) return;
      var banner = renderBanner({
        results: report.results,
        missing: criticalMissing,
        ready: report.ready,
        allOk: false,
      });
      if (!banner) return;
      var host = document.getElementById('main-app') || document.body;
      host.insertBefore(banner, host.firstChild);
    }, delayMs);
  }

  g.AETHER_probeCapabilities = scan;
  g.AETHER_showCapabilityBanner = showIfNeeded;
})(typeof globalThis !== 'undefined' ? globalThis : window);
