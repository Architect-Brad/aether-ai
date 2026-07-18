/**
 * AETHER Boot Cinematic — ship-computer system checks
 * Runs once per session unless forced; enhances splash.
 */
(function (g) {
  'use strict';

  var SESSION_KEY = 'aether_boot_cinematic_done';

  function checks() {
    return [
      { id: 'core', label: 'NEURAL CORE', ok: function () { return !!g.AETHER_VERSION; } },
      { id: 'kernel', label: 'KERNEL / FLIGHT RECORDER', ok: function () { return !!g.AETHER_Kernel; } },
      { id: 'soul', label: 'SOUL OS', ok: function () { return !!g.AETHER_SoulOS; } },
      { id: 'council', label: 'MODEL COUNCIL', ok: function () { return !!g.AETHER_Council; } },
      { id: 'graph', label: 'THREAD GRAPH', ok: function () { return !!g.AETHER_ThreadGraph; } },
      { id: 'ghost', label: 'GHOST COMMITS', ok: function () { return !!g.AETHER_Ghost; } },
      { id: 'theater', label: 'COGNITION THEATER', ok: function () { return !!g.AETHER_Theater; } },
      { id: 'storage', label: 'LOCAL STORAGE', ok: function () {
        try {
          localStorage.setItem('__aether_boot', '1');
          localStorage.removeItem('__aether_boot');
          return true;
        } catch (e) {
          return false;
        }
      } },
      { id: 'secure', label: 'SECURE CONTEXT', ok: function () { return !!window.isSecureContext || /localhost|127\.0\.0\.1/.test(location.hostname); } },
    ];
  }

  function run(force) {
    try {
      if (!force && sessionStorage.getItem(SESSION_KEY) === '1') return Promise.resolve();
    } catch (e) {}

    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.id = 'aether-boot-cinematic';
      overlay.className = 'boot-cinematic';
      overlay.innerHTML =
        '<div class="boot-inner">' +
          '<div class="boot-brand">AETHER ' +
          (g.AETHER_VERSION_LABEL || '') +
          ' · ' +
          (g.AETHER_CODENAME || 'NEURAL OS') +
          '</div>' +
          '<div class="boot-sub">SOVEREIGN BOOT SEQUENCE</div>' +
          '<div class="boot-checks" id="boot-checks"></div>' +
          '<div class="boot-bar"><div class="boot-bar-fill" id="boot-bar-fill"></div></div>' +
          '<div class="boot-footer" id="boot-footer">INITIALIZING…</div>' +
        '</div>';
      document.body.appendChild(overlay);

      var list = checks();
      var box = overlay.querySelector('#boot-checks');
      var fill = overlay.querySelector('#boot-bar-fill');
      var footer = overlay.querySelector('#boot-footer');
      var i = 0;

      function next() {
        if (i >= list.length) {
          fill.style.width = '100%';
          footer.textContent = 'ALL SYSTEMS NOMINAL · ENTERING INTERFACE';
          try {
            sessionStorage.setItem(SESSION_KEY, '1');
          } catch (e) {}
          setTimeout(function () {
            overlay.classList.add('boot-out');
            setTimeout(function () {
              overlay.remove();
              resolve();
            }, 500);
          }, 450);
          return;
        }
        var c = list[i];
        var ok = false;
        try {
          ok = !!c.ok();
        } catch (e) {
          ok = false;
        }
        var row = document.createElement('div');
        row.className = 'boot-row ' + (ok ? 'ok' : 'fail');
        row.innerHTML =
          '<span class="boot-mark">' +
          (ok ? '✓' : '!') +
          '</span><span class="boot-lab">' +
          c.label +
          '</span><span class="boot-st">' +
          (ok ? 'ONLINE' : 'DEGRADED') +
          '</span>';
        box.appendChild(row);
        i++;
        fill.style.width = Math.round((i / list.length) * 100) + '%';
        footer.textContent = c.label + (ok ? ' · OK' : ' · WARN');
        setTimeout(next, 120 + Math.random() * 80);
      }

      setTimeout(next, 200);
    });
  }

  g.AETHER_Boot = { run: run, checks: checks };

  // Auto-run after brief delay (alongside splash)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(function () {
        run(false);
      }, 300);
    });
  } else {
    setTimeout(function () {
      run(false);
    }, 300);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
