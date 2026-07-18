/**
 * AETHER Code Mobile — touch-first CODE Pro shell (v5.24)
 * Tabs · swipe · ghost FAB · scroll FAB · landscape · haptics · chrome density
 */
(function (g) {
  'use strict';

  var _tab = 'stream';
  var _bound = false;
  var BREAKPOINT = 768;
  var TAB_ORDER = ['stream', 'files', 'tools', 'term', 'more'];
  var _swipe = { x: 0, y: 0, t: 0, active: false };
  var _chromeHidden = false;
  var _lastScrollTop = 0;

  function isMobileCode() {
    var w = window.innerWidth || 0;
    var coarse = false;
    try {
      coarse = window.matchMedia('(pointer: coarse)').matches;
    } catch (e) {}
    if (!codingOn()) return false;
    return w <= BREAKPOINT || (coarse && w <= 900);
  }

  function isLandscapeMobile() {
    return isMobileCode() && window.innerWidth > window.innerHeight && window.innerWidth >= 560;
  }

  function codingOn() {
    return (
      (g.state && g.state.codingMode) ||
      (document.body && document.body.classList.contains('coding-mode'))
    );
  }

  function haptic(kind) {
    try {
      if (navigator.vibrate) {
        if (kind === 'light') navigator.vibrate(8);
        else if (kind === 'ok') navigator.vibrate([10, 30, 10]);
        else if (kind === 'err') navigator.vibrate([30, 40, 30]);
        else navigator.vibrate(12);
      }
    } catch (e) {}
  }

  function setTab(tab, opts) {
    opts = opts || {};
    var prev = _tab;
    _tab = tab || 'stream';
    if (TAB_ORDER.indexOf(_tab) === -1) _tab = 'stream';
    document.body.setAttribute('data-code-tab', _tab);
    document.body.classList.toggle('code-landscape', isLandscapeMobile());

    var tabs = document.querySelectorAll('.code-m-tab');
    tabs.forEach(function (btn) {
      var on = btn.getAttribute('data-code-tab') === _tab;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    applyPanelVisibility();
    if (!opts.silent && prev !== _tab) haptic('light');

    try {
      if (_tab === 'stream' && typeof g.smoothScrollToBottom === 'function') {
        g.smoothScrollToBottom();
      }
      if (_tab === 'term') {
        var inp = document.getElementById('coding-terminal-input');
        if (inp) setTimeout(function () { inp.focus({ preventScroll: true }); }, 120);
      }
    } catch (e) {}

    updateGhostFab();
    updateScrollFab();
  }

  function tabIndex(name) {
    var i = TAB_ORDER.indexOf(name);
    return i < 0 ? 0 : i;
  }

  function shiftTab(dir) {
    var i = tabIndex(_tab) + dir;
    if (i < 0 || i >= TAB_ORDER.length) {
      haptic('err');
      return;
    }
    setTab(TAB_ORDER[i]);
  }

  function applyPanelVisibility() {
    var mobile = isMobileCode();
    var coding = codingOn();
    var landscape = isLandscapeMobile();
    var tabs = document.getElementById('code-mobile-tabs');
    var more = document.getElementById('code-mobile-more');
    var tree = document.getElementById('coding-file-tree');
    var rail = document.getElementById('code-right-rail');
    var term = document.getElementById('coding-terminal');
    var chat = document.getElementById('chat-display');
    var proBar = document.getElementById('code-pro-bar');
    var sessionRail = document.getElementById('code-session-rail');
    var fab = ensureGhostFab();
    var scrollFab = ensureScrollFab();

    if (tabs) {
      tabs.style.display = coding && mobile ? 'flex' : 'none';
      tabs.setAttribute('aria-hidden', coding && mobile ? 'false' : 'true');
    }

    document.body.classList.toggle('code-mobile', !!(coding && mobile));
    document.body.classList.toggle('code-landscape', !!(coding && landscape));
    document.body.classList.toggle('code-chrome-hidden', !!(coding && mobile && _chromeHidden));

    if (!coding) {
      if (more) {
        more.style.display = 'none';
        more.setAttribute('aria-hidden', 'true');
      }
      if (fab) fab.style.display = 'none';
      if (scrollFab) scrollFab.style.display = 'none';
      document.body.classList.remove('code-mobile', 'code-landscape', 'code-chrome-hidden');
      return;
    }

    if (!mobile) {
      if (more) {
        more.style.display = 'none';
        more.setAttribute('aria-hidden', 'true');
      }
      if (chat) chat.style.display = '';
      if (proBar) {
        proBar.classList.remove('code-pro-bar-collapsed', 'code-pro-bar-mobile');
      }
      if (fab) fab.style.display = 'none';
      if (scrollFab) scrollFab.style.display = 'none';
      return;
    }

    var show = function (el, on, flex) {
      if (!el) return;
      if (on) {
        el.style.display = flex || 'flex';
        el.setAttribute('aria-hidden', 'false');
      } else {
        el.style.display = 'none';
        el.setAttribute('aria-hidden', 'true');
      }
    };

    // Landscape: chat + tools side-by-side when on stream or tools
    if (landscape && (_tab === 'stream' || _tab === 'tools')) {
      show(chat, true, 'flex');
      show(rail, true, 'flex');
      show(tree, false);
      show(term, false);
      show(more, false);
      document.body.setAttribute('data-code-tab', _tab === 'tools' ? 'tools' : 'stream');
    } else {
      show(chat, _tab === 'stream', 'flex');
      show(tree, _tab === 'files', 'flex');
      show(rail, _tab === 'tools', 'flex');
      show(term, _tab === 'term', 'flex');
      show(more, _tab === 'more', 'flex');
    }

    if (term && _tab === 'term') {
      term.classList.remove('minimized');
      term.style.maxHeight = '';
    }

    // Mobile: densify pro bar — hide full action strip on stream (actions in More / FAB)
    if (proBar) {
      proBar.classList.add('code-pro-bar-mobile');
      var hideActions = _tab === 'stream' || _tab === 'term';
      proBar.classList.toggle('code-pro-bar-compact', hideActions);
    }
    if (sessionRail) {
      sessionRail.classList.toggle('code-session-compact', _tab === 'stream' && _chromeHidden);
    }

    updateGhostFab();
    updateScrollFab();
    updateGhostBadge();
  }

  function pendingGhosts() {
    try {
      if (g.AETHER_Ghost && g.AETHER_Ghost.loadQueue) {
        return g.AETHER_Ghost.loadQueue().filter(function (x) {
          return x.status === 'pending';
        });
      }
    } catch (e) {}
    return [];
  }

  function updateGhostBadge() {
    var badge = document.getElementById('code-m-ghost-badge');
    var n = pendingGhosts().length;
    if (!badge) return;
    if (n > 0) {
      badge.style.display = 'inline-flex';
      badge.textContent = n > 9 ? '9+' : String(n);
    } else {
      badge.style.display = 'none';
    }
    var fabBadge = document.getElementById('code-ghost-fab-count');
    if (fabBadge) fabBadge.textContent = String(n);
  }

  function ensureGhostFab() {
    var fab = document.getElementById('code-ghost-fab');
    if (fab) return fab;
    fab = document.createElement('div');
    fab.id = 'code-ghost-fab';
    fab.className = 'code-ghost-fab';
    fab.style.display = 'none';
    fab.innerHTML =
      '<button type="button" class="code-ghost-fab-main" id="code-ghost-fab-open" aria-label="Review ghost patches">' +
      '<span class="code-ghost-fab-ico">👻</span>' +
      '<span class="code-ghost-fab-label">Review</span>' +
      '<span class="code-ghost-fab-count" id="code-ghost-fab-count">0</span>' +
      '</button>' +
      '<div class="code-ghost-fab-actions" id="code-ghost-fab-actions">' +
      '<button type="button" class="code-ghost-fab-btn ok" id="code-ghost-fab-accept" title="Accept all">✓ All</button>' +
      '<button type="button" class="code-ghost-fab-btn" id="code-ghost-fab-review" title="Open tools">Open</button>' +
      '<button type="button" class="code-ghost-fab-btn bad" id="code-ghost-fab-reject" title="Reject all">✕</button>' +
      '</div>';
    var deck = document.querySelector('.input-deck');
    if (deck && deck.parentNode) deck.parentNode.insertBefore(fab, deck);
    else document.body.appendChild(fab);

    fab.querySelector('#code-ghost-fab-open').onclick = function () {
      haptic('light');
      setTab('tools');
    };
    fab.querySelector('#code-ghost-fab-review').onclick = function () {
      setTab('tools');
    };
    fab.querySelector('#code-ghost-fab-accept').onclick = function () {
      haptic('ok');
      if (g.AETHER_CodePro && g.AETHER_CodePro.acceptAllGhosts) g.AETHER_CodePro.acceptAllGhosts();
      updateGhostFab();
    };
    fab.querySelector('#code-ghost-fab-reject').onclick = function () {
      haptic('err');
      if (g.AETHER_CodePro && g.AETHER_CodePro.rejectAllGhosts) g.AETHER_CodePro.rejectAllGhosts();
      updateGhostFab();
    };
    return fab;
  }

  function updateGhostFab() {
    var fab = ensureGhostFab();
    if (!fab) return;
    var n = pendingGhosts().length;
    var show = isMobileCode() && codingOn() && n > 0 && (_tab === 'stream' || _tab === 'files');
    fab.style.display = show ? 'flex' : 'none';
    fab.classList.toggle('expanded', n > 0);
    updateGhostBadge();
  }

  function ensureScrollFab() {
    var fab = document.getElementById('code-scroll-fab');
    if (fab) return fab;
    fab = document.createElement('button');
    fab.id = 'code-scroll-fab';
    fab.className = 'code-scroll-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Scroll to bottom');
    fab.innerHTML = '↓';
    fab.style.display = 'none';
    fab.onclick = function () {
      haptic('light');
      var chat = document.getElementById('chat-display');
      if (chat) chat.scrollTop = chat.scrollHeight;
      if (typeof g.smoothScrollToBottom === 'function') g.smoothScrollToBottom();
      fab.style.display = 'none';
    };
    document.body.appendChild(fab);
    return fab;
  }

  function updateScrollFab() {
    var fab = ensureScrollFab();
    var chat = document.getElementById('chat-display');
    if (!fab || !chat) return;
    if (!isMobileCode() || !codingOn() || _tab !== 'stream') {
      fab.style.display = 'none';
      return;
    }
    var dist = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
    fab.style.display = dist > 120 ? 'flex' : 'none';
  }

  function bindSwipe(el) {
    if (!el || el._codeSwipeBound) return;
    el._codeSwipeBound = true;
    el.addEventListener(
      'touchstart',
      function (e) {
        if (!isMobileCode() || !codingOn()) return;
        if (e.touches.length !== 1) return;
        // Don't steal horizontal scroll from pro-bar / code blocks
        var t = e.target;
        if (t && t.closest && (t.closest('.code-pro-bar') || t.closest('pre') || t.closest('.code-mention-palette'))) {
          _swipe.active = false;
          return;
        }
        _swipe.x = e.touches[0].clientX;
        _swipe.y = e.touches[0].clientY;
        _swipe.t = Date.now();
        _swipe.active = true;
      },
      { passive: true }
    );
    el.addEventListener(
      'touchend',
      function (e) {
        if (!_swipe.active) return;
        _swipe.active = false;
        if (!isMobileCode() || !codingOn()) return;
        var touch = e.changedTouches && e.changedTouches[0];
        if (!touch) return;
        var dx = touch.clientX - _swipe.x;
        var dy = touch.clientY - _swipe.y;
        var dt = Date.now() - _swipe.t;
        if (dt > 600) return;
        if (Math.abs(dx) < 64) return;
        if (Math.abs(dx) < Math.abs(dy) * 1.35) return; // vertical scroll wins
        // swipe left → next tab, right → prev
        if (dx < 0) shiftTab(1);
        else shiftTab(-1);
      },
      { passive: true }
    );
  }

  function bindChatChrome(chat) {
    if (!chat || chat._codeChromeBound) return;
    chat._codeChromeBound = true;
    chat.addEventListener(
      'scroll',
      function () {
        if (!isMobileCode() || !codingOn() || _tab !== 'stream') return;
        var st = chat.scrollTop;
        var delta = st - _lastScrollTop;
        _lastScrollTop = st;
        // Hide chrome when scrolling down in long threads
        if (st > 80 && delta > 8) {
          if (!_chromeHidden) {
            _chromeHidden = true;
            document.body.classList.add('code-chrome-hidden');
          }
        } else if (delta < -8 || st < 40) {
          if (_chromeHidden) {
            _chromeHidden = false;
            document.body.classList.remove('code-chrome-hidden');
          }
        }
        updateScrollFab();
      },
      { passive: true }
    );
  }

  function runMoreAction(action) {
    haptic('light');
    switch (action) {
      case 'checkpoint':
        if (g.AETHER_CodePro && g.AETHER_CodePro.snapshotPaths) {
          var paths = (g.AETHER_CodePro.getTouched && g.AETHER_CodePro.getTouched()) || [];
          g.AETHER_CodePro.snapshotPaths(paths, 'mobile');
        }
        break;
      case 'restore':
        if (g.AETHER_CodePro) g.AETHER_CodePro.restoreLatest();
        break;
      case 'acceptall':
        haptic('ok');
        if (g.AETHER_CodePro) g.AETHER_CodePro.acceptAllGhosts();
        setTab('tools');
        break;
      case 'rejectall':
        haptic('err');
        if (g.AETHER_CodePro) g.AETHER_CodePro.rejectAllGhosts();
        break;
      case 'pr':
        if (g.AETHER_ChangeSet) g.AETHER_ChangeSet.createFromPending();
        setTab('tools');
        break;
      case 'verify':
        if (g.AETHER_CodePro) g.AETHER_CodePro.runVerify();
        setTab('term');
        break;
      case 'swarm':
        var goal = window.prompt('Swarm goal:', '');
        if (goal && g.AETHER_Subagents) {
          g.AETHER_Subagents.swarm(goal, { parallel: true, edit: false });
          setTab('stream');
        }
        break;
      case 'git':
        if (g.AETHER_GitLite) {
          g.AETHER_GitLite.status(true).then(function (st) {
            if (typeof g.addSystemMessage === 'function') {
              g.addSystemMessage(g.AETHER_GitLite.statusMarkdown(st));
            }
            setTab('stream');
          });
        }
        break;
      case 'folder':
        var btn = document.getElementById('code-rail-link-folder') || document.getElementById('coding-folder-btn');
        if (btn) btn.click();
        else if (typeof g.openCodingFolder === 'function') g.openCodingFolder();
        break;
      case 'memory':
        var note = window.prompt('CODE memory note:', '');
        if (note && g.AETHER_CodePro) g.AETHER_CodePro.addMemory(note);
        break;
      case 'packs':
        if (g.AETHER_ToolPacks) {
          if (typeof g.addSystemMessage === 'function') {
            g.addSystemMessage('**Tool packs**\n\n' + g.AETHER_ToolPacks.listMarkdown());
          }
          setTab('stream');
        }
        break;
      default:
        break;
    }
  }

  function bind() {
    if (_bound) return;
    _bound = true;

    document.querySelectorAll('.code-m-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setTab(btn.getAttribute('data-code-tab'));
      });
    });

    document.querySelectorAll('[data-m-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        runMoreAction(btn.getAttribute('data-m-action'));
      });
    });

    // Swipe on main workspace + terminal + more
    ['chat-row', 'coding-terminal', 'code-mobile-more', 'chat-display'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) bindSwipe(el);
    });

    var chat = document.getElementById('chat-display');
    if (chat) bindChatChrome(chat);

    window.addEventListener(
      'resize',
      function () {
        if (!codingOn()) return;
        if (!isMobileCode()) {
          document.body.classList.remove('code-mobile', 'code-landscape', 'code-chrome-hidden');
          document.body.removeAttribute('data-code-tab');
          var c = document.getElementById('chat-display');
          if (c) c.style.display = '';
          if (typeof g.syncCodeAgentShell === 'function') g.syncCodeAgentShell();
        } else {
          applyPanelVisibility();
        }
      },
      { passive: true }
    );

    window.addEventListener(
      'orientationchange',
      function () {
        setTimeout(function () {
          if (codingOn()) applyPanelVisibility();
        }, 200);
      },
      { passive: true }
    );

    // Soft keyboard inset
    if (window.visualViewport) {
      var vv = window.visualViewport;
      var onVv = function () {
        if (!codingOn() || !isMobileCode()) {
          document.documentElement.style.setProperty('--code-kb-inset', '0px');
          return;
        }
        var offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        document.documentElement.style.setProperty('--code-kb-inset', offset + 'px');
        document.body.classList.toggle('code-kb-open', offset > 80);
      };
      vv.addEventListener('resize', onVv);
      vv.addEventListener('scroll', onVv);
      onVv();
    }

    if (document.body) {
      var obs = new MutationObserver(function () {
        if (codingOn()) {
          if (isMobileCode() && !document.body.getAttribute('data-code-tab')) {
            setTab('stream', { silent: true });
          } else {
            applyPanelVisibility();
          }
          updateGhostBadge();
        } else {
          document.body.classList.remove('code-mobile', 'code-landscape', 'code-chrome-hidden');
          document.body.removeAttribute('data-code-tab');
          var t = document.getElementById('code-mobile-tabs');
          if (t) t.style.display = 'none';
          var fab = document.getElementById('code-ghost-fab');
          if (fab) fab.style.display = 'none';
        }
      });
      obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    document.addEventListener('aether-ghost-gutter', function (ev) {
      updateGhostBadge();
      updateGhostFab();
      try {
        if (
          isMobileCode() &&
          codingOn() &&
          ev &&
          ev.detail &&
          !ev.detail.clear &&
          _tab === 'stream'
        ) {
          var n = pendingGhosts().length;
          if (n === 1 && g.showNotification) {
            g.showNotification('Ghost ready — Review button or swipe to Tools', 'info');
          }
        }
      } catch (e2) {}
    });

    // Double-tap brand to toggle chrome
    var brand = document.querySelector('.code-session-brand');
    if (brand) {
      var lastTap = 0;
      brand.addEventListener('click', function () {
        if (!isMobileCode()) return;
        var now = Date.now();
        if (now - lastTap < 320) {
          _chromeHidden = !_chromeHidden;
          document.body.classList.toggle('code-chrome-hidden', _chromeHidden);
          haptic('light');
        }
        lastTap = now;
      });
    }

    setInterval(function () {
      if (codingOn() && isMobileCode()) {
        updateGhostBadge();
        updateGhostFab();
      }
    }, 4000);
  }

  function sync() {
    if (!codingOn()) return;
    if (isMobileCode()) {
      if (!document.body.getAttribute('data-code-tab')) setTab('stream', { silent: true });
      else applyPanelVisibility();
      updateGhostBadge();
      updateGhostFab();
    } else {
      document.body.classList.remove('code-mobile', 'code-landscape', 'code-chrome-hidden');
      applyPanelVisibility();
    }
  }

  g.AETHER_CodeMobile = {
    setTab: setTab,
    sync: sync,
    isMobileCode: isMobileCode,
    updateGhostBadge: updateGhostBadge,
    updateGhostFab: updateGhostFab,
    haptic: haptic,
    shiftTab: shiftTab,
  };

  function boot() {
    bind();
    sync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(boot, 350);
    });
  } else {
    setTimeout(boot, 350);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
