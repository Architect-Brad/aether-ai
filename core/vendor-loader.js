/**
 * AETHER Vendor Loader — local-first, CDN-fallback ESM imports
 * Documents Supremacy (and others) resolve heavy deps without baking them
 * into the repo. Drop prebuilt modules into ./vendor/ for offline use.
 *
 * Resolution order:
 *   1. window.AETHER_VENDOR_MAP[key]  (runtime override)
 *   2. localStorage aether_vendor_base + relative path
 *   3. ./vendor/<file>  (same-origin offline pack)
 *   4. CDN URLs (esm.sh / jsdelivr) in order
 */
(function (g) {
  'use strict';

  var _cache = {};
  var _status = {}; // key -> { source, ok, error, ms }

  /** Default offline + CDN candidates per library key */
  var CATALOG = {
    docx: {
      local: ['./vendor/docx.js', './vendor/docx/index.js', './vendor/docx.mjs'],
      cdn: [
        'https://esm.sh/docx@8',
        'https://cdn.jsdelivr.net/npm/docx@8/+esm',
      ],
    },
    mammoth: {
      local: ['./vendor/mammoth.js', './vendor/mammoth.browser.mjs'],
      cdn: [
        'https://esm.sh/mammoth@1.6.0',
        'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/+esm',
      ],
    },
    jszip: {
      local: ['./vendor/jszip.js', './vendor/jszip.min.js'],
      cdn: [
        'https://esm.sh/jszip@3.10.1',
        'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm',
      ],
    },
    pptxgen: {
      local: ['./vendor/pptxgenjs.js', './vendor/pptxgen.bundle.js'],
      cdn: [
        'https://esm.sh/pptxgenjs@3.12.0',
        'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/+esm',
      ],
    },
    xlsx: {
      local: ['./vendor/xlsx.js', './vendor/xlsx.full.min.js'],
      cdn: [
        'https://esm.sh/xlsx@0.18.5',
        'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm',
      ],
    },
    'pdf-lib': {
      local: ['./vendor/pdf-lib.js', './vendor/pdf-lib.esm.js'],
      cdn: [
        'https://esm.sh/pdf-lib@1.17.1',
        'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm',
      ],
    },
    'sql.js': {
      local: ['./vendor/sql-wasm.js', './vendor/sql.js'],
      cdn: ['https://esm.sh/sql.js@1.10.2'],
      // special: needs wasm path
      wasmLocal: ['./vendor/sql-wasm.wasm', './vendor/sql-wasm.wasm'],
      wasmCdn: ['https://esm.sh/sql.js@1.10.2/dist/sql-wasm.wasm'],
    },
  };

  function vendorBase() {
    try {
      return localStorage.getItem('aether_vendor_base') || '';
    } catch (e) {
      return '';
    }
  }

  function resolveUrls(key) {
    var cat = CATALOG[key];
    if (!cat) return [];
    var urls = [];
    var map = g.AETHER_VENDOR_MAP || {};
    if (map[key]) urls.push(map[key]);

    var base = vendorBase();
    (cat.local || []).forEach(function (p) {
      if (base) urls.push(base.replace(/\/$/, '') + '/' + p.replace(/^\.\//, ''));
      urls.push(p);
    });
    (cat.cdn || []).forEach(function (u) {
      urls.push(u);
    });
    return urls;
  }

  async function tryImport(url) {
    var mod = await import(/* @vite-ignore */ url);
    return mod.default || mod;
  }

  /**
   * Load a catalogued dependency.
   * @param {string} key - catalog key (docx, xlsx, …)
   * @returns {Promise<any>} module
   */
  async function load(key) {
    if (_cache[key]) return _cache[key];
    var urls = resolveUrls(key);
    if (!urls.length) throw new Error('Unknown vendor key: ' + key);

    var errs = [];
    var t0 = Date.now();
    for (var i = 0; i < urls.length; i++) {
      var url = urls[i];
      try {
        var mod = await tryImport(url);
        _cache[key] = mod;
        _status[key] = { source: url, ok: true, error: null, ms: Date.now() - t0 };
        if (g.AETHER_Kernel) {
          try {
            g.AETHER_Kernel.log('vendor.load', key + ' ← ' + url.slice(0, 60), 'read', {
              ok: true,
              ms: _status[key].ms,
            });
          } catch (e) {}
        }
        return mod;
      } catch (e) {
        errs.push(url + ': ' + (e && e.message ? e.message : e));
      }
    }
    _status[key] = { source: null, ok: false, error: errs.join(' | '), ms: Date.now() - t0 };
    throw new Error('Vendor load failed for "' + key + '": ' + errs.slice(0, 3).join(' · '));
  }

  /**
   * sql.js needs wasm binary path resolution.
   */
  async function loadSql() {
    if (_cache.sql) return _cache.sql;
    var initMod = await load('sql.js');
    var init = initMod.default || initMod;
    if (typeof init !== 'function') {
      // already initialized instance
      _cache.sql = initMod;
      return _cache.sql;
    }

    var wasmCandidates = [];
    var base = vendorBase();
    var cat = CATALOG['sql.js'];
    (cat.wasmLocal || []).forEach(function (p) {
      if (base) wasmCandidates.push(base.replace(/\/$/, '') + '/' + p.replace(/^\.\//, ''));
      wasmCandidates.push(p);
    });
    (cat.wasmCdn || []).forEach(function (u) {
      wasmCandidates.push(u);
    });

    var lastErr = null;
    for (var i = 0; i < wasmCandidates.length; i++) {
      try {
        var SQL = await init({
          locateFile: function () {
            return wasmCandidates[i];
          },
        });
        _cache.sql = SQL;
        _status.sql = { source: wasmCandidates[i], ok: true, error: null, ms: 0 };
        return SQL;
      } catch (e) {
        lastErr = e;
      }
    }
    // Final attempt: esm.sh default locateFile
    try {
      var SQL2 = await init({
        locateFile: function (f) {
          return 'https://esm.sh/sql.js@1.10.2/dist/' + f;
        },
      });
      _cache.sql = SQL2;
      return SQL2;
    } catch (e2) {
      throw lastErr || e2;
    }
  }

  function status() {
    return Object.assign({}, _status);
  }

  function isOfflineReady(key) {
    var s = _status[key];
    if (s && s.ok && s.source && s.source.indexOf('http') !== 0) return true;
    return false;
  }

  function setMap(map) {
    g.AETHER_VENDOR_MAP = Object.assign({}, g.AETHER_VENDOR_MAP || {}, map || {});
  }

  g.AETHER_Vendor = {
    CATALOG: CATALOG,
    load: load,
    loadSql: loadSql,
    status: status,
    isOfflineReady: isOfflineReady,
    setMap: setMap,
    resolveUrls: resolveUrls,
    version: '1.0.0',
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
