/**
 * AETHER Feature Packs — lightweight on-demand loader for optional modules.
 * Phase 1: novelty/visual parity features load as classic scripts only when
 * the user enables them. Keeps the core boot lean and stable.
 *
 * Conventions (mirrors beast-mode.js persistence):
 *   - Storage key : aether_packs_v1  (JSON map packId -> bool)
 *   - API         : g.AETHER_Packs.load(id) -> Promise; registers manifest
 *
 * Each pack is a normal classic <script> that self-initializes (all Phase-1
 * packs already branch on document.readyState, so late injection is safe).
 */
(function (g) {
  'use strict';

  var STORAGE_KEY = 'aether_packs_v1';

  var MANIFEST = {
    'boot-cinematic': {
      label: 'Boot Cinematic',
      desc: 'Ship-computer system-check splash on startup',
      src: 'core/boot-cinematic.js',
      global: 'AETHER_Boot',
      default: false
    },
    'cognition-theater': {
      label: 'Cognition Theater',
      desc: 'Live reasoning/tool-pulse overlay while AETHER thinks',
      src: 'core/cognition-theater.js',
      global: 'AETHER_Theater',
      default: false
    },
    'composer-float': {
      label: 'Composer Float',
      desc: 'Float/snap chat input raised above the deck',
      src: 'core/aether-composer-float.js',
      global: 'AETHER_ComposerFloat',
      default: false
    }
  };

  var loaded = {};

  function readCfg() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function writeCfg(cfg) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch (e) {}
  }

  function isEnabled(id) {
    var pk = MANIFEST[id];
    if (!pk) return false;
    var cfg = readCfg();
    return cfg[id] === undefined ? !!pk.default : !!cfg[id];
  }

  /** Inject the pack's script and resolve on load/error. No-op if already loaded. */
  function load(id) {
    var pk = MANIFEST[id];
    if (!pk) return Promise.reject(new Error('Unknown pack: ' + id));
    if (loaded[id]) return Promise.resolve(g[pk.global] || true);
    // Already present (e.g. rollback of a boot-time removal) — treat as loaded.
    if (g[pk.global]) { loaded[id] = true; return Promise.resolve(g[pk.global]); }

    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.async = true;
      s.src = pk.src;
      s.onload = function () { loaded[id] = true; resolve(g[pk.global] || true); };
      s.onerror = function () { reject(new Error('Failed to load pack: ' + id)); };
      document.head.appendChild(s);
    });
  }

  /** Enable/disable a pack and (re)load it if turning on. */
  function setEnabled(id, on) {
    if (!MANIFEST[id]) return Promise.reject(new Error('Unknown pack: ' + id));
    var cfg = readCfg();
    cfg[id] = !!on;
    writeCfg(cfg);
    if (on) return load(id);
    loaded[id] = false;
    return Promise.resolve();
  }

  /** Sync-inject every pack that is currently enabled (called at boot). */
  function autoLoad() {
    Object.keys(MANIFEST).forEach(function (id) {
      if (isEnabled(id)) {
        load(id).catch(function () {});
      }
    });
  }

  var API = {
    MANIFEST: MANIFEST,
    list: function () {
      return Object.keys(MANIFEST).map(function (id) {
        var pk = MANIFEST[id];
        return { id: id, label: pk.label, desc: pk.desc, global: pk.global, enabled: isEnabled(id) };
      });
    },
    isEnabled: isEnabled,
    load: load,
    setEnabled: setEnabled,
    autoLoad: autoLoad
  };

  g.AETHER_Packs = API;
  g.AETHER_PACKS = API;
})(typeof globalThis !== 'undefined' ? globalThis : window);
