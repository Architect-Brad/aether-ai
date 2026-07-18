/**
 * AETHER theme packs
 * Void / Plasma / Monolith — cyberpunk power users
 * Warm Ivory — calm light theme for everyone else (#F5F1EB)
 */
(function (g) {
  'use strict';

  var KEY = 'aether_theme_v1';

  var THEMES = {
    void: {
      id: 'void',
      label: 'Void',
      family: 'dark',
      vars: {
        '--bg-primary': '#020308',
        '--void-bg': '#050505',
        '--neon-cyan': '#00f3ff',
        '--neon-magenta': '#0088ff',
        '--neon-green': '#00ff88',
        '--neon-orange': '#ff6600',
        '--neon-yellow': '#ffff00',
        '--neon-white': '#ffffff',
        '--text-main': '#c8d8e8',
        '--text-dim': '#556677',
        '--glass': 'rgba(10, 20, 30, 0.95)',
        '--surface': '#0a0a0a',
        '--surface-2': '#060810',
        '--border-subtle': 'rgba(0, 243, 255, 0.12)',
        '--glow-cyan': '0 0 10px rgba(0, 243, 255, 0.5)',
        '--table-bg': 'rgba(0, 0, 0, 0.4)',
        '--table-fg': '#ccc',
      },
    },
    plasma: {
      id: 'plasma',
      label: 'Plasma',
      family: 'dark',
      vars: {
        '--bg-primary': '#0a0314',
        '--void-bg': '#0a0314',
        '--neon-cyan': '#ff2bd6',
        '--neon-magenta': '#b44dff',
        '--neon-green': '#7cffc4',
        '--neon-orange': '#ff9f1c',
        '--neon-yellow': '#ffe08a',
        '--neon-white': '#fff5ff',
        '--text-main': '#f0e6ff',
        '--text-dim': '#8877aa',
        '--glass': 'rgba(20, 8, 30, 0.95)',
        '--surface': '#12061c',
        '--surface-2': '#0c0414',
        '--border-subtle': 'rgba(255, 43, 214, 0.18)',
        '--glow-cyan': '0 0 12px rgba(255, 43, 214, 0.4)',
        '--table-bg': 'rgba(10, 4, 18, 0.6)',
        '--table-fg': '#e8d8f8',
      },
    },
    monolith: {
      id: 'monolith',
      label: 'Monolith',
      family: 'dark',
      vars: {
        '--bg-primary': '#0b0d10',
        '--void-bg': '#0b0d10',
        '--neon-cyan': '#e8ecf1',
        '--neon-magenta': '#c5ccd6',
        '--neon-green': '#a8b0ba',
        '--neon-orange': '#ffffff',
        '--neon-yellow': '#dde2e8',
        '--neon-white': '#ffffff',
        '--text-main': '#d0d5dc',
        '--text-dim': '#6a7280',
        '--glass': 'rgba(12, 14, 18, 0.96)',
        '--surface': '#12151a',
        '--surface-2': '#0e1014',
        '--border-subtle': 'rgba(232, 236, 241, 0.12)',
        '--glow-cyan': '0 0 8px rgba(232, 236, 241, 0.2)',
        '--table-bg': 'rgba(14, 16, 20, 0.8)',
        '--table-fg': '#c8d0d8',
      },
    },
    /**
     * Warm Ivory — for mere mortals and stock users.
     * Calm paper UI. No scanline cosplay. Still AETHER.
     */
    ivory: {
      id: 'ivory',
      label: 'Warm Ivory',
      family: 'light',
      vars: {
        '--bg-primary': '#F5F1EB',
        '--void-bg': '#F5F1EB',
        '--neon-cyan': '#8B5A2B',       /* warm walnut accent (replaces cyan) */
        '--neon-magenta': '#A65D3F',     /* terracotta */
        '--neon-green': '#4F6F52',       /* sage */
        '--neon-orange': '#C45C26',      /* clay */
        '--neon-yellow': '#B8860B',      /* muted gold */
        '--neon-white': '#2C2416',       /* ink */
        '--text-main': '#2C2416',
        '--text-dim': '#7A6F60',
        '--glass': 'rgba(255, 252, 247, 0.92)',
        '--surface': '#FFFCFA',
        '--surface-2': '#EFE8DC',
        '--border-subtle': 'rgba(44, 36, 22, 0.12)',
        '--glow-cyan': '0 1px 3px rgba(44, 36, 22, 0.08)',
        '--glow-magenta': '0 1px 3px rgba(166, 93, 63, 0.12)',
        '--glow-green': '0 1px 3px rgba(79, 111, 82, 0.12)',
        '--glow-white': 'none',
        /* tables (chat .modern-table uses these) */
        '--table-bg': '#FFFCFA',
        '--table-fg': '#2C2416',
        /* ivory-specific tokens */
        '--ivory-paper': '#F5F1EB',
        '--ivory-cream': '#FFFCFA',
        '--ivory-sand': '#E8DFD0',
        '--ivory-ink': '#2C2416',
        '--ivory-mute': '#7A6F60',
        '--ivory-walnut': '#8B5A2B',
        '--ivory-clay': '#C45C26',
        '--ivory-sage': '#4F6F52',
      },
    },
  };

  function apply(id) {
    var theme = THEMES[id] || THEMES.void;
    var root = document.documentElement;
    root.setAttribute('data-aether-theme', theme.id);
    root.setAttribute('data-theme-family', theme.family || 'dark');
    root.classList.toggle('theme-light', theme.family === 'light');
    root.classList.toggle('theme-dark', theme.family !== 'light');
    if (document.body) {
      document.body.classList.toggle('theme-light', theme.family === 'light');
      document.body.classList.toggle('theme-dark', theme.family !== 'light');
      if (theme.family === 'light') {
        document.body.style.backgroundColor = theme.vars['--bg-primary'] || '#F5F1EB';
        document.body.style.color = theme.vars['--text-main'] || '#2C2416';
      } else {
        document.body.style.backgroundColor = '';
        document.body.style.color = '';
      }
    }

    Object.keys(theme.vars).forEach(function (k) {
      root.style.setProperty(k, theme.vars[k]);
    });
    // Aliases used across CSS / JS
    root.style.setProperty('--bg', theme.vars['--bg-primary'] || theme.vars['--void-bg']);
    if (theme.vars['--void-bg']) root.style.setProperty('--void-bg', theme.vars['--void-bg']);
    if (theme.vars['--text-main']) root.style.setProperty('--text-main', theme.vars['--text-main']);
    if (theme.vars['--text-dim']) root.style.setProperty('--text-dim', theme.vars['--text-dim']);
    if (theme.vars['--glass']) root.style.setProperty('--glass', theme.vars['--glass']);
    if (theme.vars['--neon-cyan']) root.style.setProperty('--neon-cyan', theme.vars['--neon-cyan']);

    // Soften CRT scanlines on light theme
    var scan = document.querySelector('.scanline');
    if (scan) {
      scan.style.opacity = theme.family === 'light' ? '0' : '';
      scan.style.display = theme.family === 'light' ? 'none' : '';
    }

    // Mobile browser chrome color
    try {
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute(
          'content',
          theme.family === 'light'
            ? theme.vars['--bg-primary'] || '#F5F1EB'
            : theme.vars['--bg-primary'] || '#020308'
        );
      }
    } catch (e) {}

    try {
      localStorage.setItem(KEY, theme.id);
    } catch (e) {}

    try {
      if (g.AETHER_Kernel) g.AETHER_Kernel.log('theme.apply', theme.label, 'call', { ok: true });
    } catch (e) {}

    // Notify pane controller (Ivory copy / ring recolor)
    try {
      if (typeof g._apOnThemeChange === 'function') g._apOnThemeChange();
    } catch (e) {}

    return theme;
  }

  function current() {
    try {
      return localStorage.getItem(KEY) || 'void';
    } catch (e) {
      return 'void';
    }
  }

  function cycle() {
    var order = ['void', 'plasma', 'monolith', 'ivory'];
    var i = order.indexOf(current());
    if (i < 0) i = 0;
    var next = order[(i + 1) % order.length];
    var t = apply(next);
    if (g.showNotification) {
      var msg =
        t.id === 'ivory'
          ? 'Theme: Warm Ivory — calm mode for mere mortals'
          : 'Theme: ' + t.label;
      g.showNotification(msg, 'info');
    }
    return t;
  }

  function list() {
    return Object.keys(THEMES).map(function (k) {
      return { id: THEMES[k].id, label: THEMES[k].label, family: THEMES[k].family };
    });
  }

  function init() {
    // Apply ASAP so Ivory paints before cyberpunk flash
    apply(current());
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        apply(current());
      });
    }
    // Re-apply after full load (CSS sheets settled)
    window.addEventListener('load', function () {
      apply(current());
    });
  }

  // Early head hint: if ivory saved, mark html before body paint
  try {
    var early = localStorage.getItem(KEY);
    if (early === 'ivory' && document.documentElement) {
      document.documentElement.setAttribute('data-aether-theme', 'ivory');
      document.documentElement.classList.add('theme-light');
      document.documentElement.style.backgroundColor = '#F5F1EB';
      document.documentElement.style.color = '#2C2416';
    }
  } catch (e) {}

  g.AETHER_Themes = {
    THEMES: THEMES,
    apply: apply,
    cycle: cycle,
    current: current,
    list: list,
    init: init,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof globalThis !== 'undefined' ? globalThis : window);
