/**
 * AETHER Neural Interface — Single source of version truth
 * Copyright (C) 2026 The Architect · GPL-3.0-or-later
 *
 * Load this BEFORE script.js / sw consumers. Everything else should
 * read window.AETHER_VERSION instead of hardcoding "v5.xx".
 */
(function (g) {
  'use strict';
  var VERSION = '5.40';
  var CODENAME = 'Hero Path';
  var BUILD = '2026.07.18';

  g.AETHER_VERSION = VERSION;
  g.AETHER_CODENAME = CODENAME;
  g.AETHER_BUILD = BUILD;
  g.AETHER_VERSION_LABEL = 'v' + VERSION;
  g.AETHER_FULL_LABEL = 'AETHER Neural Interface v' + VERSION + ' — ' + CODENAME;

  g.AETHER_META = {
    version: VERSION,
    codename: CODENAME,
    build: BUILD,
    label: g.AETHER_FULL_LABEL,
    license: 'GPL-3.0-or-later',
    architecture: 'browser-native zero-backend',
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
