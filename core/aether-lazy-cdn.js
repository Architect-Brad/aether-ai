/**
 * AETHER Lazy CDN — load heavy optional libs only when first needed
 * Copyright (C) 2026 The Architect · GPL-3.0-or-later
 *
 * Boot used to parse ~15 CDN scripts (transformers, onnx, prettier×6, …)
 * on every page load. That burns RAM and main-thread time for features
 * most sessions never touch.
 *
 * Usage:
 *   await AETHER_Lazy.ensure('hljs')
 *   await AETHER_Lazy.ensure(['prettier', 'prettier-babel'])
 *   AETHER_Lazy.isLoaded('mermaid')
 */
(function (g) {
  'use strict';

  var VERSION = '1.0';
  var _loading = Object.create(null);
  var _loaded = Object.create(null);
  var _failed = Object.create(null);

  /** Catalog: id → { urls, globalCheck, css?, deps? } */
  var CATALOG = {
    localforage: {
      urls: ['https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js'],
      ready: function () {
        return !!(g.localforage && g.localforage.getItem);
      },
    },
    mathjs: {
      urls: ['https://cdnjs.cloudflare.com/ajax/libs/mathjs/11.11.0/math.min.js'],
      ready: function () {
        return !!(g.math && g.math.evaluate);
      },
    },
    hljs: {
      urls: ['https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js'],
      css: ['https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/atom-one-dark.min.css'],
      ready: function () {
        return !!g.hljs;
      },
      onLoad: function () {
        try {
          if (g.hljs && g.hljs.configure) {
            g.hljs.configure({ ignoreUnescapedHTML: true });
          }
        } catch (e) {}
      },
    },
    mermaid: {
      urls: ['https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js'],
      ready: function () {
        return !!(g.mermaid && (g.mermaid.run || g.mermaid.init));
      },
      onLoad: function () {
        try {
          if (g.mermaid && g.mermaid.initialize) {
            g.mermaid.initialize({
              startOnLoad: false,
              theme: 'dark',
              themeVariables: {
                primaryColor: '#00f3ff',
                primaryTextColor: '#fff',
                primaryBorderColor: '#00f3ff',
                lineColor: '#00f3ff',
                background: '#0a0a0a',
                mainBkg: '#0a0a0a',
                textColor: '#e0e0e0',
                fontSize: '14px',
              },
            });
          }
        } catch (e) {}
      },
    },
    chart: {
      urls: ['https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'],
      ready: function () {
        return !!g.Chart;
      },
    },
    ort: {
      urls: ['https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.0/dist/ort.min.js'],
      ready: function () {
        return !!g.ort;
      },
      onLoad: function () {
        try {
          if (g.ort && g.ort.env && g.ort.env.wasm) {
            g.ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.0/dist/';
            g.ort.env.wasm.numThreads = 1;
          }
        } catch (e) {}
      },
    },
    ocr: {
      deps: ['ort'],
      urls: ['https://cdn.jsdelivr.net/npm/@gutenye/ocr-browser@1.4.8/dist/index.min.js'],
      ready: function () {
        return !!(g.OcrBrowser || g.OCR);
      },
    },
    tesseract: {
      urls: ['https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/tesseract.min.js'],
      ready: function () {
        return !!g.Tesseract;
      },
    },
    mammoth: {
      urls: ['https://cdn.jsdelivr.net/npm/mammoth@1.9.0/mammoth.browser.min.js'],
      ready: function () {
        return !!g.mammoth;
      },
    },
    pdfjs: {
      urls: ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js'],
      ready: function () {
        return !!g.pdfjsLib;
      },
    },
    prettier: {
      urls: ['https://cdn.jsdelivr.net/npm/prettier@3.5.3/standalone.js'],
      ready: function () {
        return !!g.prettier;
      },
      onLoad: function () {
        g.getPrettierPlugin =
          g.getPrettierPlugin ||
          function (name) {
            if (g.prettierPlugins && g.prettierPlugins[name]) return g.prettierPlugins[name];
            var cap = name.charAt(0).toUpperCase() + name.slice(1);
            return g['prettierPlugin' + cap] || null;
          };
      },
    },
    'prettier-babel': {
      deps: ['prettier'],
      urls: ['https://cdn.jsdelivr.net/npm/prettier@3.5.3/plugins/babel.js'],
      ready: function () {
        return !!(g.prettierPlugins && g.prettierPlugins.babel);
      },
    },
    'prettier-estree': {
      deps: ['prettier'],
      urls: ['https://cdn.jsdelivr.net/npm/prettier@3.5.3/plugins/estree.js'],
      ready: function () {
        return !!(g.prettierPlugins && g.prettierPlugins.estree);
      },
    },
    'prettier-typescript': {
      deps: ['prettier'],
      urls: ['https://cdn.jsdelivr.net/npm/prettier@3.5.3/plugins/typescript.js'],
      ready: function () {
        return !!(g.prettierPlugins && g.prettierPlugins.typescript);
      },
    },
    'prettier-postcss': {
      deps: ['prettier'],
      urls: ['https://cdn.jsdelivr.net/npm/prettier@3.5.3/plugins/postcss.js'],
      ready: function () {
        return !!(g.prettierPlugins && g.prettierPlugins.postcss);
      },
    },
    'prettier-html': {
      deps: ['prettier'],
      urls: ['https://cdn.jsdelivr.net/npm/prettier@3.5.3/plugins/html.js'],
      ready: function () {
        return !!(g.prettierPlugins && g.prettierPlugins.html);
      },
    },
    'prettier-markdown': {
      deps: ['prettier'],
      urls: ['https://cdn.jsdelivr.net/npm/prettier@3.5.3/plugins/markdown.js'],
      ready: function () {
        return !!(g.prettierPlugins && g.prettierPlugins.markdown);
      },
    },
    puter: {
      urls: ['https://js.puter.com/v2/'],
      ready: function () {
        return !!g.puter;
      },
    },
  };

  // Bundles: ensure these together
  var BUNDLES = {
    prettierAll: [
      'prettier',
      'prettier-babel',
      'prettier-estree',
      'prettier-typescript',
      'prettier-postcss',
      'prettier-html',
      'prettier-markdown',
    ],
    ocrAll: ['ort', 'ocr', 'tesseract'],
    docs: ['mammoth', 'pdfjs'],
  };

  function injectCss(href) {
    if (!href || typeof document === 'undefined') return;
    if (document.querySelector('link[data-aether-lazy="' + href + '"]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.setAttribute('data-aether-lazy', href);
    (document.head || document.documentElement).appendChild(l);
  }

  function injectScript(url) {
    return new Promise(function (resolve, reject) {
      if (typeof document === 'undefined') {
        reject(new Error('no document'));
        return;
      }
      // Already present?
      if (document.querySelector('script[data-aether-lazy-src="' + url + '"]')) {
        resolve();
        return;
      }
      var s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.setAttribute('data-aether-lazy-src', url);
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error('load failed: ' + url));
      };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  function isReady(id) {
    var cat = CATALOG[id];
    if (!cat) return false;
    if (_loaded[id]) return true;
    try {
      if (cat.ready && cat.ready()) {
        _loaded[id] = true;
        return true;
      }
    } catch (e) {}
    return false;
  }

  function ensureOne(id) {
    if (isReady(id)) return Promise.resolve(true);
    if (_failed[id]) return Promise.resolve(false);
    if (_loading[id]) return _loading[id];

    var cat = CATALOG[id];
    if (!cat) {
      return Promise.resolve(false);
    }

    _loading[id] = (async function () {
      // deps first
      if (cat.deps && cat.deps.length) {
        for (var d = 0; d < cat.deps.length; d++) {
          await ensureOne(cat.deps[d]);
        }
      }
      if (cat.css) {
        cat.css.forEach(injectCss);
      }
      var urls = cat.urls || [];
      var lastErr = null;
      for (var i = 0; i < urls.length; i++) {
        try {
          await injectScript(urls[i]);
          // give microtask for global registration
          await Promise.resolve();
          if (cat.ready && cat.ready()) {
            _loaded[id] = true;
            if (cat.onLoad) {
              try {
                cat.onLoad();
              } catch (e) {}
            }
            delete _loading[id];
            return true;
          }
        } catch (e) {
          lastErr = e;
        }
      }
      _failed[id] = true;
      delete _loading[id];
      if (g.console && g.console.warn) {
        g.console.warn('[AETHER Lazy] failed:', id, lastErr && lastErr.message);
      }
      return false;
    })();

    return _loading[id];
  }

  /**
   * @param {string|string[]} idOrList — catalog id, bundle name, or list
   * @returns {Promise<boolean>} true if all resolved ready
   */
  function ensure(idOrList) {
    var list;
    if (Array.isArray(idOrList)) list = idOrList.slice();
    else if (BUNDLES[idOrList]) list = BUNDLES[idOrList].slice();
    else list = [idOrList];

    return Promise.all(list.map(ensureOne)).then(function (results) {
      return results.every(Boolean);
    });
  }

  function isLoaded(id) {
    return isReady(id);
  }

  function status() {
    var out = {};
    Object.keys(CATALOG).forEach(function (id) {
      out[id] = {
        ready: isReady(id),
        failed: !!_failed[id],
        loading: !!_loading[id],
      };
    });
    return out;
  }

  // Prefetch low-priority libs after idle (optional)
  function scheduleIdlePrefetch(ids, delayMs) {
    ids = ids || ['hljs', 'mermaid'];
    delayMs = delayMs == null ? 6000 : delayMs;
    var run = function () {
      ids.forEach(function (id) {
        ensureOne(id).catch(function () {});
      });
    };
    if (typeof requestIdleCallback === 'function') {
      setTimeout(function () {
        requestIdleCallback(run, { timeout: 8000 });
      }, delayMs);
    } else {
      setTimeout(run, delayMs + 2000);
    }
  }

  g.AETHER_Lazy = {
    version: VERSION,
    ensure: ensure,
    ensureOne: ensureOne,
    isLoaded: isLoaded,
    status: status,
    scheduleIdlePrefetch: scheduleIdlePrefetch,
    CATALOG: CATALOG,
    BUNDLES: BUNDLES,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
