/**
 * AETHER Advanced Bridge — wires Kernel, Soul, Council, Graph, Ghost, Theater
 * into the main app after script.js loads. Zero-build integration layer.
 */
(function (g) {
  'use strict';

  var _wired = false;

  function notify(msg, type) {
    if (typeof g.showNotification === 'function') g.showNotification(msg, type || 'info');
    else console.log('[AETHER]', msg);
  }

  function waitFor(pred, tries, ms) {
    return new Promise(function (resolve) {
      var n = 0;
      (function tick() {
        if (pred()) return resolve(true);
        if (++n >= (tries || 40)) return resolve(false);
        setTimeout(tick, ms || 150);
      })();
    });
  }

  async function instrumentTools() {
    // TOOL_REGISTRY lives inside DOMContentLoaded closure — expose hook via polling window
    // Main script may set window.__AETHER_TOOL_REGISTRY when we patch it; also try globals
    var reg =
      g.__AETHER_TOOL_REGISTRY ||
      g.TOOL_REGISTRY ||
      (g.AETHER && g.AETHER.TOOL_REGISTRY);
    if (reg && g.AETHER_Kernel) {
      var n = g.AETHER_Kernel.instrumentRegistry(reg);
      if (n) console.log('[AETHER Kernel] instrumented', n, 'tools');
      return n;
    }
    return 0;
  }

  function injectSlashCommands() {
    // If main app exposes command list later, we also handle key path via custom event
    g.AETHER_advancedSlash = function (cmd, arg) {
      cmd = (cmd || '').toLowerCase();
      if (cmd === 'whoami') {
        var md = g.AETHER_SoulOS ? g.AETHER_SoulOS.whoamiMarkdown() : 'Soul OS offline';
        if (typeof g.addSystemMessage === 'function') g.addSystemMessage(md);
        else notify(md.slice(0, 120), 'info');
        return true;
      }
      if (cmd === 'council') {
        runCouncil(arg || 'Summarise the state of open-source AI interfaces in 2026.');
        return true;
      }
      if (cmd === 'kernel' || cmd === 'flights') {
        if (g.AETHER_Kernel) g.AETHER_Kernel.openTimelineModal();
        return true;
      }
      if (cmd === 'graph') {
        if (g.AETHER_ThreadGraph) g.AETHER_ThreadGraph.toggle();
        return true;
      }
      if (cmd === 'theme') {
        if (g.AETHER_Themes) g.AETHER_Themes.cycle();
        return true;
      }
      if (cmd === 'ghost') {
        if (g.AETHER_Ghost) g.AETHER_Ghost.render();
        notify('Ghost commit dock refreshed', 'info');
        return true;
      }
      if (cmd === 'theater') {
        if (g.AETHER_Theater) {
          var on = !document.documentElement.classList.contains('cognition-theater');
          g.AETHER_Theater.setEnabled(on);
          notify('Cognition theater ' + (on ? 'ON' : 'OFF'), 'info');
        }
        return true;
      }
      if (cmd === 'boot') {
        if (g.AETHER_Boot) g.AETHER_Boot.run(true);
        return true;
      }
      if (cmd === 'soulpatch' || cmd === 'patch') {
        if (g.AETHER_SoulOS) g.AETHER_SoulOS.openQuickEditor();
        return true;
      }
      return false;
    };
  }

  async function runCouncil(prompt) {
    if (!g.AETHER_Council) {
      notify('Council offline', 'error');
      return;
    }
    if (g.AETHER_Kernel) g.AETHER_Kernel.beginFlight({ goal: prompt, kind: 'council' });
    if (g.AETHER_Theater) g.AETHER_Theater.pulseReasoning();

    var callModel = async function (messages) {
      if (typeof g.callAISimple === 'function') return await g.callAISimple(messages);
      // Fallback: use fetch against apiConfig if exposed
      throw new Error('callAISimple not exposed — open SETUP and use chat once, then retry Council');
    };

    try {
      var result = await g.AETHER_Council.convene(prompt, {
        callModel: callModel,
        synthesize: true,
        beast: g.AETHER_Beast && g.AETHER_Beast.isEnabled && g.AETHER_Beast.isEnabled(),
      });
      if (typeof g.addSystemMessage === 'function' && result.synthesis) {
        g.addSystemMessage('## Council Synthesis\n\n' + result.synthesis);
      }
      if (g.AETHER_Theater) g.AETHER_Theater.answerPulse();
      if (g.AETHER_Kernel) g.AETHER_Kernel.endFlight('landed');
      return result;
    } catch (e) {
      if (g.AETHER_Kernel) g.AETHER_Kernel.endFlight('aborted');
      notify('Council error: ' + e.message, 'error');
    }
  }

  function wireHeroButtons() {
    var hero = document.getElementById('control-hero');
    var adv = document.getElementById('control-advanced');
    if (!hero) return;

    function addBtn(id, label, title, onClick, cls) {
      if (document.getElementById(id)) return;
      var b = document.createElement('button');
      b.className = 'cmd-btn ' + (cls || 'hero-mode');
      b.id = id;
      b.title = title;
      b.textContent = label;
      b.addEventListener('click', onClick);
      // Hero modes strip (collapsible under MODES)
      hero.appendChild(b);
    }

    addBtn('btn-council', 'COUNCIL', 'Model Council — multi-model deliberation', function () {
      if (typeof window._aetherExpandModes === 'function') window._aetherExpandModes();
      var q = window.prompt('Council question:', 'What are the tradeoffs of local-first AI agents?');
      if (q) runCouncil(q);
    });

    addBtn('btn-graph', 'GRAPH', 'Neural Thread Graph', function () {
      if (typeof window._aetherExpandModes === 'function') window._aetherExpandModes();
      if (g.AETHER_ThreadGraph) g.AETHER_ThreadGraph.toggle();
    });

    if (adv) {
      function addAdv(id, label, title, fn) {
        if (document.getElementById(id)) return;
        var b = document.createElement('button');
        b.className = 'cmd-btn';
        b.id = id;
        b.title = title;
        b.textContent = label;
        b.onclick = fn;
        adv.appendChild(b);
      }
      addAdv('btn-kernel', 'KERNEL', 'Flight recorder', function () {
        if (g.AETHER_Kernel) {
          g.AETHER_Kernel.ensurePanel();
          g.AETHER_Kernel.openTimelineModal();
        }
      });
      addAdv('btn-theme', 'THEME', 'Cycle themes: Void · Plasma · Monolith · Warm Ivory', function () {
        if (g.AETHER_Themes) g.AETHER_Themes.cycle();
      });
      // Explicit Warm Ivory shortcut for mere mortals
      if (!document.getElementById('btn-theme-ivory')) {
        var ivoryBtn = document.createElement('button');
        ivoryBtn.className = 'cmd-btn';
        ivoryBtn.id = 'btn-theme-ivory';
        ivoryBtn.title = 'Warm Ivory — calm light theme for normal humans';
        ivoryBtn.innerHTML = 'IVORY';
        ivoryBtn.onclick = function () {
          if (g.AETHER_Themes) {
            g.AETHER_Themes.apply('ivory');
            if (g.showNotification) g.showNotification('Warm Ivory — paper mode online', 'success');
          }
        };
        adv.appendChild(ivoryBtn);
      }
      addAdv('btn-theater', 'THEATER', 'Cognition theater', function () {
        if (g.AETHER_Theater) {
          var on = !document.documentElement.classList.contains('cognition-theater');
          g.AETHER_Theater.setEnabled(on);
        }
      });
    }
  }

  function patchInputForSlash() {
    // Capture slash commands early on send
    document.addEventListener(
      'keydown',
      function (e) {
        if (e.key !== 'Enter' || e.shiftKey) return;
        var input = document.getElementById('user-input');
        if (!input || document.activeElement !== input) return;
        var val = (input.value || '').trim();
        if (val.charAt(0) !== '/') return;
        var parts = val.slice(1).split(/\s+/);
        var cmd = parts[0];
        var arg = parts.slice(1).join(' ');
        if (g.AETHER_advancedSlash && g.AETHER_advancedSlash(cmd, arg)) {
          e.preventDefault();
          e.stopPropagation();
          input.value = '';
        }
      },
      true
    );
  }

  function exposeHelpers() {
    // Make bridge functions visible for main script hooks
    g.AETHER_runCouncil = runCouncil;
    g.AETHER_instrumentTools = instrumentTools;
    g.__aetherBeginAgentFlight = function (goal) {
      if (g.AETHER_Kernel) {
        g.AETHER_Kernel.ensurePanel();
        return g.AETHER_Kernel.beginFlight({ goal: goal, kind: 'agent' });
      }
    };
    g.__aetherEndAgentFlight = function (status) {
      if (g.AETHER_Kernel) return g.AETHER_Kernel.endFlight(status || 'landed');
    };
    g.__aetherTrackGraph = function (type, label, meta) {
      if (g.AETHER_ThreadGraph) {
        return g.AETHER_ThreadGraph.addNode({ type: type, label: label, meta: meta });
      }
    };
    g.__aetherSoulPrompt = function () {
      return g.AETHER_SoulOS ? g.AETHER_SoulOS.systemPromptBlock() : '';
    };
    g.__aetherGhostPropose = function (path, after, before, message) {
      if (g.AETHER_Ghost) {
        return g.AETHER_Ghost.propose({
          path: path,
          after: after,
          before: before,
          message: message || 'Agent write',
        });
      }
    };
  }

  async function wire() {
    if (_wired) return;
    _wired = true;
    injectSlashCommands();
    exposeHelpers();
    patchInputForSlash();
    wireHeroButtons();

    if (g.AETHER_Kernel) g.AETHER_Kernel.ensurePanel();
    if (g.AETHER_SoulOS) g.AETHER_SoulOS.init();
    if (g.AETHER_Theater) g.AETHER_Theater.init();
    if (g.AETHER_Themes) g.AETHER_Themes.init();

    // Retry tool instrumentation as main app boots
    for (var i = 0; i < 20; i++) {
      var n = await instrumentTools();
      if (n > 0) break;
      await new Promise(function (r) { setTimeout(r, 400); });
    }

    // Seed graph root
    if (g.AETHER_ThreadGraph && g.AETHER_ThreadGraph.load().nodes.length === 0) {
      g.AETHER_ThreadGraph.addNode({
        type: 'system',
        label: 'AETHER ' + (g.AETHER_VERSION_LABEL || '') + ' online',
        x: 0.5,
        y: 0.5,
      });
    }

    console.log(
      '%c ⬡ AETHER ADVANCED LAYER ONLINE ',
      'background:#9b59b6;color:#fff;font-weight:bold;padding:3px 8px;font-family:monospace'
    );
    console.log(
      '%c Kernel · Soul OS · Council · Graph · Ghost · Theater · Themes · Boot ',
      'color:#00f3ff;font-family:monospace'
    );
  }

  g.AETHER_Advanced = {
    wire: wire,
    runCouncil: runCouncil,
    instrumentTools: instrumentTools,
  };

  function start() {
    // After splash / main app
    setTimeout(wire, 900);
    setTimeout(wire, 2500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof globalThis !== 'undefined' ? globalThis : window);
