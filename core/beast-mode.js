/**
 * AETHER Beast Mode — max-aggression agent profile
 * Toggles autonomy, research depth, tool latitude, and UI chrome.
 */
(function (g) {
  'use strict';

  var STORAGE_KEY = 'aether_beast_mode';

  var DEFAULTS = {
    enabled: false,
    agentMode: 'auto',
    deepResearch: {
      depth: 'exhaustive',
      width: 'comprehensive',
      criticality: 'critical',
      maxPages: 10,
      maxSources: 10,
      selfCritique: true,
      gapFill: true,
      useRag: true,
      useX: true,
      includeCitations: true,
    },
    // When on: agent auto-runs without asking; coding tools less gated
    autoAgent: true,
    unlockAdvancedToolbar: true,
    label: 'BEAST',
  };

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { enabled: false };
      return Object.assign({}, DEFAULTS, JSON.parse(raw));
    } catch (e) {
      return { enabled: false };
    }
  }

  function save(cfg) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch (e) {}
  }

  /**
   * Apply beast profile onto app state + UI.
   * @param {boolean} on
   * @param {object} ctx — { state, saveState, showNotification, deepResearchSettings }
   */
  function setBeastMode(on, ctx) {
    ctx = ctx || {};
    var cfg = load();
    cfg.enabled = !!on;
    if (on) {
      cfg = Object.assign({}, DEFAULTS, cfg, { enabled: true });
      if (ctx.state) {
        ctx.state.beastMode = true;
        ctx.state.agentMode = 'auto';
        ctx.state.coTEnabled = true;
        ctx.state.ragEnabled = true;
        ctx.state.streamingEnabled = true;
        if (ctx.state.deepResearchSettings) {
          Object.assign(ctx.state.deepResearchSettings, DEFAULTS.deepResearch);
        }
      }
      document.documentElement.classList.add('beast-mode');
      document.body && document.body.classList.add('beast-mode');
    } else {
      if (ctx.state) ctx.state.beastMode = false;
      document.documentElement.classList.remove('beast-mode');
      document.body && document.body.classList.remove('beast-mode');
    }
    save(cfg);
    if (typeof ctx.saveState === 'function') ctx.saveState();
    var btn = document.getElementById('btn-beast-mode');
    if (btn) {
      btn.classList.toggle('active', !!on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.title = on
        ? 'Beast Mode ON — max agent autonomy, exhaustive research, full tools'
        : 'Beast Mode — max agent autonomy, exhaustive research, full tools';
    }
    var badge = document.getElementById('beast-mode-badge');
    if (badge) badge.style.display = on ? 'inline-flex' : 'none';
    // Auto-expand hero MODES strip when Beast engages so user sees the control
    if (on && typeof window !== 'undefined' && typeof window._aetherExpandModes === 'function') {
      try { window._aetherExpandModes(); } catch (e) {}
    }
    var modesBtn = document.getElementById('btn-hero-modes');
    if (modesBtn) modesBtn.classList.toggle('has-active-mode', !!on);
    if (typeof ctx.showNotification === 'function') {
      ctx.showNotification(
        on ? '⬡ BEAST MODE ONLINE — max autonomy' : 'Beast Mode off — standard profile',
        on ? 'success' : 'info'
      );
    }
    return cfg;
  }

  function isEnabled() {
    return !!load().enabled;
  }

  function toggle(ctx) {
    return setBeastMode(!isEnabled(), ctx);
  }

  function systemPromptAddon() {
    if (!isEnabled()) return '';
    return [
      '',
      '# BEAST MODE ACTIVE',
      'You are operating at maximum capability:',
      '- Prefer multi-step tool use over speculation',
      '- Be thorough; verify claims; use tools liberally',
      '- When coding: plan, execute, verify — do not stop early',
      '- When researching: exhaustive depth, critical self-check',
      '- Bias toward action. Ask only if blocked by missing credentials or destructive ambiguity.',
      '',
    ].join('\n');
  }

  g.AETHER_Beast = {
    load: load,
    save: save,
    set: setBeastMode,
    toggle: toggle,
    isEnabled: isEnabled,
    systemPromptAddon: systemPromptAddon,
    DEFAULTS: DEFAULTS,
    STORAGE_KEY: STORAGE_KEY,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
