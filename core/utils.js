/**
 * AETHER Shared Utilities
 * Canonical implementations of esc(), uid(), and shared constants.
 * Load BEFORE all other core modules.
 *
 * Copyright (C) 2026 The Architect · GPL-3.0-or-later
 */
(function (g) {
  'use strict';

  /** Canonical HTML escape — 5 entities. Use everywhere instead of local copies. */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Unique ID with optional prefix */
  function uid(p) {
    return (p || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /** Shared timing constants */
  var TIMING = {
    MOBILE_SIDEBAR_COLLAPSE_MS: 3000,
    TPS_THROTTLE_MS: 500,
    BUTTON_RESET_MS: 2000,
    PRETTIER_ERROR_MS: 2500,
    FORMAT_FLASH_MS: 120,
    STT_RESTART_MS: 150,
    SEARCH_CACHE_TTL_MS: 3 * 60 * 1000,
    RATE_LIMIT_WINDOW_MS: 800,
  };

  /** Shared UI constants */
  var UI = {
    MOBILE_BREAKPOINT: 768,
    TABLET_BREAKPOINT: 1100,
    MAX_CONCURRENT_TOOLS: 8,
    MAX_CONCURRENT_TOOLS_CODING: 12,
    MAX_TOOL_CARDS: 40,
    HISTORY_PREVIEW_CHARS: 120,
  };

  // ── Also expose as globals for backward compat ──────────────
  g.escapeHtml = esc;
  g.esc = esc;
  g.AETHER_Utils = {
    esc: esc,
    escapeHtml: esc,
    uid: uid,
    TIMING: TIMING,
    UI: UI,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
