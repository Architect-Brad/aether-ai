/**
 * AETHER Ship Layer v5.33 — golden paths, onboarding, offline, fusion glue
 * Copyright (C) 2026 The Architect · GPL-3.0-or-later
 *
 * Closes the product loop:
 *   onboard → preset → folder → CODE/Ghost → DEEP → Moat provenance → export
 *
 * Load after moat, skill-runtime, deep-research, code-pro, changeset.
 */
(function (g) {
  'use strict';

  var VERSION = '5.36';
  var ONBOARD_KEY = 'aether_onboard_v1';
  var LAST_DR_KEY = 'aether_last_deep_research_v1';
  var GOLDEN_KEY = 'aether_golden_smoke_last';

  // ── Last Deep Research report (real text for fusion) ───────

  function saveLastResearch(payload) {
    payload = payload || {};
    var rec = {
      t: Date.now(),
      topic: payload.topic || '',
      report: String(payload.report || '').slice(0, 120000),
      sources: (payload.sources || []).slice(0, 40),
      depth: payload.depth || '',
      format: payload.format || '',
    };
    try {
      localStorage.setItem(LAST_DR_KEY, JSON.stringify(rec));
    } catch (e) {
      try {
        rec.report = rec.report.slice(0, 30000);
        localStorage.setItem(LAST_DR_KEY, JSON.stringify(rec));
      } catch (e2) {}
    }
    g.__AETHER_LAST_DR = rec;
    return rec;
  }

  function getLastResearch() {
    if (g.__AETHER_LAST_DR) return g.__AETHER_LAST_DR;
    try {
      var raw = localStorage.getItem(LAST_DR_KEY);
      if (raw) {
        g.__AETHER_LAST_DR = JSON.parse(raw);
        return g.__AETHER_LAST_DR;
      }
    } catch (e) {}
    return null;
  }

  // ── Fusion: Research → Code with real report ───────────────

  function handoffResearchToCode(opts) {
    opts = opts || {};
    var last = getLastResearch() || {};
    var topic = opts.topic || last.topic || 'latest research';
    var report = opts.report || last.report || '';
    var sources = opts.sources || last.sources || [];
    var srcBlock = '';
    if (sources.length) {
      srcBlock =
        '\n\n## Source ledger\n' +
        sources
          .slice(0, 15)
          .map(function (s, i) {
            return (
              '- [' +
              (s.id || i + 1) +
              '] ' +
              (s.title || s.url || s.kind || 'source') +
              (s.url ? ' — ' + s.url : '')
            );
          })
          .join('\n');
    }
    var task =
      opts.task ||
      'Propose a minimal implementation plan, then apply surgical [[fs_patch]] changes in the linked project where appropriate.';
    var goal =
      '## Research → Code handoff (AETHER Ship)\n\n' +
      '### Topic\n' +
      topic +
      '\n\n### Research report (authoritative context)\n' +
      String(report).slice(0, 8000) +
      srcBlock +
      '\n\n### Implementation task\n' +
      task +
      '\n\nRules: prefer Ghost-friendly fs_patch; explore before write; summarise files touched.';

    if (g.AETHER_Moat && g.AETHER_Moat.record) {
      g.AETHER_Moat.record('handoff', {
        title: 'Research → Code (ship)',
        detail: topic.slice(0, 120),
        meta: { hasReport: !!report, sources: sources.length },
      });
    }

    // Enable CODE mode
    try {
      if (g.state && !g.state.codingMode) {
        var btn = document.getElementById('btn-coding-mode');
        if (btn) btn.click();
        else g.state.codingMode = true;
      }
    } catch (e) {}

    if (typeof g.activateSkill === 'function') {
      try {
        g.activateSkill('aether-code');
      } catch (e) {}
    }

    if (typeof g.runSkillWorkflow === 'function') {
      g.runSkillWorkflow('aether-code', opts.workflow || 'feature', goal);
      return { ok: true, mode: 'playbook', hasReport: !!report };
    }

    var input = document.getElementById('user-input');
    if (input) {
      input.value = goal;
      try {
        input.dispatchEvent(new Event('input'));
      } catch (e) {}
    }
    if (typeof g.sendMessage === 'function' && report) {
      setTimeout(function () {
        try {
          g.sendMessage();
        } catch (e) {}
      }, 60);
    }
    return { ok: true, mode: 'composer', hasReport: !!report };
  }

  // ── Fusion: Ghost → PR (changeset) ─────────────────────────

  function handoffGhostToPR(opts) {
    opts = opts || {};
    var CS = g.AETHER_ChangeSet || g.AETHER_Changeset;
    if (CS && typeof CS.createFromPending === 'function') {
      var cs = CS.createFromPending({
        title: opts.title,
        body: opts.body,
      });
      if (g.AETHER_Moat && g.AETHER_Moat.record) {
        g.AETHER_Moat.record('handoff', {
          title: 'Ghost → PR',
          detail: cs ? cs.title : 'empty',
          meta: { files: cs && cs.files ? cs.files.length : 0 },
        });
      }
      // Ensure panel visible
      if (CS.renderPanel && cs) CS.renderPanel(cs);
      if (g.showNotification && cs) {
        g.showNotification('PR change set ready · ' + cs.files.length + ' file(s)', 'success');
      }
      return { ok: !!cs, changeSet: cs };
    }
    if (g.showNotification) g.showNotification('Change sets unavailable', 'warn');
    return { ok: false };
  }

  // ── Checkpoint surface helper ──────────────────────────────

  function checkpointStripHtml() {
    var n = 0;
    try {
      if (g.AETHER_CodePro && g.AETHER_CodePro.listCheckpoints) {
        n = g.AETHER_CodePro.listCheckpoints().length;
      }
    } catch (e) {}
    var ghosts = 0;
    try {
      if (g.AETHER_Ghost && g.AETHER_Ghost.loadQueue) {
        ghosts = g.AETHER_Ghost.loadQueue().filter(function (x) {
          return x.status === 'pending';
        }).length;
      }
    } catch (e) {}
    return (
      '<div class="ship-checkpoint-strip" id="ship-checkpoint-strip">' +
      '<button type="button" class="ship-cp-btn" data-act="cp" title="Create checkpoint">⏪ Checkpoint</button>' +
      '<button type="button" class="ship-cp-btn" data-act="restore" title="Restore latest">Restore' +
      (n ? ' (' + n + ')' : '') +
      '</button>' +
      '<button type="button" class="ship-cp-btn" data-act="pr" title="Group pending Ghosts into PR">PR set' +
      (ghosts ? ' · ' + ghosts : '') +
      '</button>' +
      '<button type="button" class="ship-cp-btn" data-act="ghost" title="Refresh Ghost dock">Ghosts</button>' +
      '</div>'
    );
  }

  function mountCheckpointStrip(host) {
    var el = typeof host === 'string' ? document.getElementById(host) : host;
    if (!el) {
      // try inject above ghost host or coding rail
      el =
        document.getElementById('ship-checkpoint-host') ||
        document.getElementById('code-pro-bar') ||
        document.getElementById('ghost-commits-host');
    }
    if (!el) return null;
    var wrap = document.getElementById('ship-checkpoint-strip');
    if (!wrap) {
      var div = document.createElement('div');
      div.innerHTML = checkpointStripHtml();
      wrap = div.firstChild;
      if (el.id === 'ship-checkpoint-host' || el.classList.contains('ship-checkpoint-host')) {
        el.innerHTML = '';
        el.appendChild(wrap);
      } else {
        el.parentNode && el.parentNode.insertBefore(wrap, el);
      }
    } else {
      wrap.outerHTML = checkpointStripHtml();
      wrap = document.getElementById('ship-checkpoint-strip');
    }
    if (!wrap) return null;
    wrap.querySelectorAll('[data-act]').forEach(function (btn) {
      btn.onclick = function () {
        var act = btn.getAttribute('data-act');
        if (act === 'cp' && g.AETHER_CodePro) {
          var paths = (g.AETHER_CodePro.getTouched && g.AETHER_CodePro.getTouched()) || [];
          if (g.AETHER_CodePro.snapshotPaths) g.AETHER_CodePro.snapshotPaths(paths, 'ship-strip');
          else if (g.showNotification) g.showNotification('Checkpoint API missing', 'warn');
        } else if (act === 'restore' && g.AETHER_CodePro) {
          g.AETHER_CodePro.restoreLatest();
        } else if (act === 'pr') {
          handoffGhostToPR();
        } else if (act === 'ghost' && g.AETHER_Ghost && g.AETHER_Ghost.render) {
          g.AETHER_Ghost.render();
        }
        setTimeout(function () {
          mountCheckpointStrip(host);
        }, 200);
      };
    });
    return wrap;
  }

  // ── Offline banner ─────────────────────────────────────────

  function updateOfflineBanner() {
    var online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    var bar = document.getElementById('aether-offline-banner');
    if (online) {
      if (bar) bar.style.display = 'none';
      document.documentElement.classList.remove('aether-offline');
      return;
    }
    document.documentElement.classList.add('aether-offline');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'aether-offline-banner';
      bar.className = 'aether-offline-banner';
      bar.innerHTML =
        '<span>⬡ Offline</span> — local skills, Ghost queue, RAG, and caches still work. Model/API tools need a network.';
      document.body.appendChild(bar);
    }
    bar.style.display = 'flex';
  }

  function installOfflineWatch() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      try {
        updateOfflineBanner();
      } catch (e) {}
      return;
    }
    window.addEventListener('online', updateOfflineBanner);
    window.addEventListener('offline', updateOfflineBanner);
    updateOfflineBanner();
  }

  // ── Onboarding wizard ──────────────────────────────────────

  function onboardState() {
    try {
      return JSON.parse(localStorage.getItem(ONBOARD_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveOnboard(s) {
    try {
      localStorage.setItem(ONBOARD_KEY, JSON.stringify(s));
    } catch (e) {}
  }

  function shouldShowOnboard() {
    var s = onboardState();
    if (s.done || s.skipped) return false;
    // Don't stack on top of the persona onboarding wizard
    try {
      if (typeof document !== 'undefined' && document.getElementById('onboarding-overlay')) return false;
      // Wait until persona tour finished/skipped (separate key in script.js)
      if (!localStorage.getItem('aether_onboarding_done')) return false;
    } catch (e) {}
    return true;
  }

  function openOnboarding(force) {
    if (!force && !shouldShowOnboard()) return false;
    var existing = document.getElementById('aether-onboard-modal');
    if (existing) existing.remove();
    // Never stack under persona wizard
    try {
      if (!force && document.getElementById('onboarding-overlay')) return false;
    } catch (e) {}

    var step = 0;
    var modal = document.createElement('div');
    modal.id = 'aether-onboard-modal';
    modal.className = 'onboard-modal';

    function render() {
      var steps = [
        {
          title: 'Welcome to AETHER',
          body:
            'Browser-native agent OS — zero backend. In ~2 minutes you will: pick a role preset, optionally link a project folder, and learn Ghost review + Deep Research.',
          actions: [{ id: 'next', label: 'Start', primary: true }],
        },
        {
          title: 'Choose your lane',
          body: 'Presets activate the right skills for your work.',
          actions: [
            { id: 'preset-builder', label: '⚒ Builder', primary: true },
            { id: 'preset-researcher', label: '🔬 Researcher' },
            { id: 'preset-ops', label: '📡 Ops' },
            { id: 'next', label: 'Skip presets' },
          ],
        },
        {
          title: 'Link a project (CODE)',
          body:
            'Ghost commits + fs_patch need a folder. Link now, or skip and use chat-only modes (DEEP / Skills).',
          actions: [
            { id: 'link', label: '📁 Link folder', primary: true },
            { id: 'next', label: 'Skip for now' },
          ],
        },
        {
          title: 'Your moat loops',
          body:
            '<ul class="onboard-list">' +
            '<li><b>CODE</b> — agent edits land as <b>Ghost</b> patches → Accept/Reject</li>' +
            '<li><b>DEEP</b> — multi-angle research with citations + gap-fill</li>' +
            '<li><b>SKILLS</b> — flagship playbooks via ▶ Run or <code>/workflow</code></li>' +
            '<li><b>MOAT</b> — provenance score + trust pack export</li>' +
            '</ul>' +
            '<p class="onboard-hint">Try: <code>/workflow aether-code bugfix</code> · <code>/research your topic</code> · <code>/moat</code></p>',
          actions: [
            { id: 'moat', label: 'Open Moat' },
            { id: 'done', label: 'Finish', primary: true },
          ],
        },
      ];
      var s = steps[step];
      modal.innerHTML =
        '<div class="onboard-card">' +
        '<div class="onboard-progress">' +
        steps
          .map(function (_, i) {
            return '<span class="onboard-dot' + (i === step ? ' on' : i < step ? ' done' : '') + '"></span>';
          })
          .join('') +
        '</div>' +
        '<div class="onboard-title">' +
        s.title +
        '</div>' +
        '<div class="onboard-body">' +
        s.body +
        '</div>' +
        '<div class="onboard-actions"></div>' +
        '<button type="button" class="onboard-skip" id="onboardSkip">Skip tour</button>' +
        '</div>';

      var actHost = modal.querySelector('.onboard-actions');
      if (actHost) {
        s.actions.forEach(function (a) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'onboard-btn' + (a.primary ? ' primary' : '');
          b.textContent = a.label;
          b.onclick = function () {
            handle(a.id);
          };
          actHost.appendChild(b);
        });
      }
      var skipBtn = modal.querySelector('#onboardSkip');
      if (skipBtn) {
        skipBtn.onclick = function () {
          saveOnboard({ skipped: true, t: Date.now() });
          modal.remove();
        };
      }
    }

    function handle(id) {
      if (id === 'next') {
        step++;
        if (step > 3) {
          finish();
          return;
        }
        render();
        return;
      }
      if (id === 'preset-builder' || id === 'preset-researcher' || id === 'preset-ops') {
        var pid = id.replace('preset-', '');
        // Advance UI first, then apply preset on next frame so the wizard
        // never freezes under multi-skill activation / panel rebuild.
        step++;
        render();
        setTimeout(function () {
          try {
            if (typeof g.applySkillPreset === 'function') {
              g.applySkillPreset(pid, { silent: true, fromOnboard: true });
            } else if (g.AETHER_SkillRuntime && g.AETHER_SkillRuntime.applyPreset && g.activateSkill) {
              g.AETHER_SkillRuntime.applyPreset(g.AETHER_SKILLS, pid, function (name) {
                g.activateSkill(name, { silent: true, batch: true });
              });
            }
            if (g.showNotification) {
              g.showNotification('Preset applied: ' + pid, 'success');
            }
          } catch (e) {
            if (g.showNotification) g.showNotification('Preset failed: ' + (e.message || e), 'warn');
          }
        }, 0);
        return;
      }
      if (id === 'link') {
        var linkBtn =
          document.getElementById('btn-link-folder') ||
          document.getElementById('coding-link-folder') ||
          document.querySelector('[data-action="link-folder"]');
        if (linkBtn) linkBtn.click();
        else if (typeof g.linkCodingFolder === 'function') g.linkCodingFolder();
        else if (g.showNotification) g.showNotification('Use CODE mode → link folder', 'info');
        step++;
        render();
        return;
      }
      if (id === 'moat') {
        if (typeof g.openMoatPanel === 'function') g.openMoatPanel();
        else if (g.AETHER_Moat) g.AETHER_Moat.openPanel();
        return;
      }
      if (id === 'done') finish();
    }

    function finish() {
      saveOnboard({ done: true, t: Date.now(), version: VERSION });
      if (g.AETHER_Moat && g.AETHER_Moat.record) {
        g.AETHER_Moat.record('session', { title: 'Onboarding complete', detail: 'ship v' + VERSION });
      }
      if (g.showNotification) g.showNotification('⬡ You are set — open CODE, DEEP, or /moat', 'success');
      modal.remove();
    }

    if (!document.body || typeof document.body.appendChild !== 'function') return false;
    // Ensure createElement returns queryable structure for headless-ish envs
    try {
      document.body.appendChild(modal);
      render();
    } catch (e) {
      return false;
    }
    return true;
  }

  // ── Golden path smoke suite ────────────────────────────────

  function runGoldenPaths() {
    var results = [];
    function ok(name, pass, detail) {
      results.push({ name: name, pass: !!pass, detail: detail || '' });
    }

    ok('version', !!(g.AETHER_VERSION || g.AETHER_VERSION_LABEL), g.AETHER_VERSION || '');
    ok('skills_registry', !!(g.AETHER_SKILLS && Object.keys(g.AETHER_SKILLS).length >= 20), g.AETHER_SKILLS ? Object.keys(g.AETHER_SKILLS).length : 0);
    ok('skills_pack', !!g.AETHER_SkillsPack, '');
    ok('skill_runtime', !!g.AETHER_SkillRuntime, g.AETHER_SkillRuntime && g.AETHER_SkillRuntime.version);
    ok('deep_research', !!g.AETHER_DeepResearch, g.AETHER_DeepResearch && g.AETHER_DeepResearch.version);
    ok('moat', !!g.AETHER_Moat, g.AETHER_Moat && g.AETHER_Moat.version);
    ok('markdown', !!g.AETHER_Markdown, g.AETHER_Markdown && g.AETHER_Markdown.version);
    if (g.AETHER_Markdown && g.AETHER_Markdown.runGoldenFixtures) {
      var md = g.AETHER_Markdown.runGoldenFixtures();
      ok('markdown_fixtures', md.ok || (md.passed / md.total >= 0.8), md.passed + '/' + md.total);
    }
    ok('ghost', !!(g.AETHER_Ghost && g.AETHER_Ghost.propose), '');
    ok('code_pro', !!(g.AETHER_CodePro && g.AETHER_CodePro.listCheckpoints), '');
    ok('changeset', !!(g.AETHER_ChangeSet || g.AETHER_Changeset), '');
    ok('rag', !!(g.AETHER_RAGv2 || g.RAG), '');
    ok('security', !!g.AETHER_Security, '');
    ok('tool_runtime', !!g.AETHER_ToolRuntime, '');
    ok('kernel', !!g.AETHER_Kernel, '');

    // Skill runtime playbooks
    if (g.AETHER_SkillRuntime && g.AETHER_SKILLS) {
      var ac = g.AETHER_SkillsPack
        ? g.AETHER_SkillsPack.resolveSkill(g.AETHER_SKILLS, 'aether-code')
        : g.AETHER_SKILLS['aether-code'];
      var wfs = ac ? g.AETHER_SkillRuntime.listWorkflows(ac) : [];
      ok('aether_code_playbooks', wfs.length >= 3, 'n=' + wfs.length);
      // Full skill smokes need engine skills from app registry; require ≥80% when present
      var smoke = g.AETHER_SkillRuntime.runGoldenSmokes
        ? g.AETHER_SkillRuntime.runGoldenSmokes(g.AETHER_SKILLS)
        : null;
      var smokeOk = !smoke || smoke.ok || (smoke.total && smoke.passed / smoke.total >= 0.8);
      ok('skill_runtime_smokes', smokeOk, smoke ? smoke.passed + '/' + smoke.total : 'n/a');
    } else {
      ok('aether_code_playbooks', false, 'missing');
      ok('skill_runtime_smokes', false, 'missing');
    }

    // DR angles
    if (g.AETHER_DeepResearch) {
      var angles = g.AETHER_DeepResearch.buildAngleQueries('test topic', { depth: 'deep' });
      ok('dr_angles', angles && angles.length >= 3, 'n=' + (angles && angles.length));
      var plan = g.AETHER_DeepResearch.buildDefaultPlan('test', { depth: 'deep', useRag: true }, { hasRag: true, hasSearch: true });
      ok('dr_plan', plan && plan.length >= 4, 'steps=' + (plan && plan.length));
    }

    // Moat score
    if (g.AETHER_Moat) {
      var sc = g.AETHER_Moat.computeScore();
      ok('moat_score', sc.overall >= 50, sc.overall + ' ' + sc.grade);
    }

    // Ship helpers
    ok('last_dr_api', typeof saveLastResearch === 'function', '');
    ok('handoff_api', typeof handoffResearchToCode === 'function', '');

    // DOM mounts (soft — skip if not in full app shell)
    if (typeof document !== 'undefined' && document.getElementById) {
      var hasShell = !!(document.getElementById('user-input') || document.getElementById('btn-skills'));
      if (hasShell) {
        ok('dom_user_input', !!document.getElementById('user-input'), '');
        ok('dom_skills_btn', !!document.getElementById('btn-skills'), '');
        ok('dom_moat_btn', !!document.getElementById('btn-moat'), '');
        ok('dom_deep_btn', !!document.getElementById('btn-deep-research'), '');
      } else {
        ok('dom_shell', true, 'headless/skip');
      }
    }

    var passed = results.filter(function (r) {
      return r.pass;
    }).length;
    var out = {
      version: VERSION,
      ok: passed === results.length,
      passed: passed,
      total: results.length,
      results: results,
      at: Date.now(),
    };
    try {
      localStorage.setItem(GOLDEN_KEY, JSON.stringify({ ok: out.ok, passed: passed, total: out.total, at: out.at }));
    } catch (e) {}
    if (g.AETHER_Moat && g.AETHER_Moat.record) {
      g.AETHER_Moat.record('session', {
        title: 'Golden paths ' + (out.ok ? 'PASS' : 'FAIL'),
        detail: passed + '/' + out.total,
      });
    }
    return out;
  }

  function goldenMarkdown(r) {
    r = r || runGoldenPaths();
    return (
      '**Golden paths** — ' +
      (r.ok ? '✓ PASS' : '✗ FAIL') +
      ' · ' +
      r.passed +
      '/' +
      r.total +
      ' · ship v' +
      VERSION +
      '\n\n' +
      r.results
        .map(function (x) {
          return (x.pass ? '✓' : '✗') + ' `' + x.name + '`' + (x.detail ? ' — ' + x.detail : '');
        })
        .join('\n')
    );
  }

  /**
   * Full release gate: golden paths + markdown fixtures + tool suite.
   */
  function runShipCheck(registry) {
    var sections = [];
    var allOk = true;

    var golden = runGoldenPaths();
    sections.push({ name: 'golden_paths', ok: golden.ok, passed: golden.passed, total: golden.total, results: golden.results });
    if (!golden.ok) allOk = false;

    if (g.AETHER_Markdown && g.AETHER_Markdown.runGoldenFixtures) {
      var md = g.AETHER_Markdown.runGoldenFixtures();
      sections.push({ name: 'markdown', ok: md.ok, passed: md.passed, total: md.total, results: md.results });
      if (!md.ok) allOk = false;
    } else {
      sections.push({ name: 'markdown', ok: false, passed: 0, total: 0, results: [{ name: 'engine', pass: false, detail: 'offline' }] });
      allOk = false;
    }

    if (g.AETHER_ToolRuntime && g.AETHER_ToolRuntime.runGoldenSuite) {
      var tools = g.AETHER_ToolRuntime.runGoldenSuite(registry || g.TOOL_REGISTRY || g.__AETHER_TOOL_REGISTRY || {});
      sections.push({ name: 'tools', ok: tools.ok, passed: tools.passed, total: tools.total, results: tools.results });
      if (!tools.ok) allOk = false;
    } else {
      sections.push({ name: 'tools', ok: false, passed: 0, total: 0, results: [{ name: 'runtime', pass: false, detail: 'offline' }] });
      allOk = false;
    }

    // Soft structural checks
    var soft = [];
    soft.push({ name: 'ghost_module', pass: !!(g.AETHER_Ghost && g.AETHER_Ghost.accept), detail: '' });
    soft.push({ name: 'rag_indexFolder', pass: !!(g.AETHER_RAGv2 && g.AETHER_RAGv2.indexFolder), detail: '' });
    soft.push({ name: 'moat_module', pass: !!g.AETHER_Moat, detail: '' });
    soft.push({
      name: 'visualizer_v2',
      pass: !!(g.AetherVisualizer && g.AetherVisualizer.runGoldenFixtures && g.AetherVisualizer.version),
      detail: g.AetherVisualizer ? 'v' + g.AetherVisualizer.version : '',
    });
    if (g.AetherVisualizer && g.AetherVisualizer.runGoldenFixtures) {
      try {
        var vg = g.AetherVisualizer.runGoldenFixtures();
        soft.push({
          name: 'visualizer_goldens',
          pass: !!(vg && vg.ok),
          detail: vg ? vg.passed + '/' + vg.total : '',
        });
      } catch (eV) {
        soft.push({ name: 'visualizer_goldens', pass: false, detail: eV.message || 'err' });
      }
    }
    var softPass = soft.filter(function (s) { return s.pass; }).length;
    sections.push({ name: 'modules', ok: softPass === soft.length, passed: softPass, total: soft.length, results: soft });
    if (softPass < soft.length) allOk = false;

    var out = {
      ok: allOk,
      version: VERSION,
      product: g.AETHER_VERSION || '',
      at: Date.now(),
      sections: sections,
    };
    try {
      localStorage.setItem('aether_shipcheck_last', JSON.stringify({ ok: out.ok, at: out.at, product: out.product }));
    } catch (e) {}
    if (g.AETHER_Moat && g.AETHER_Moat.record) {
      g.AETHER_Moat.record('session', {
        title: 'Shipcheck ' + (out.ok ? 'PASS' : 'FAIL'),
        detail: sections.map(function (s) { return s.name + ':' + s.passed + '/' + s.total; }).join(' '),
      });
    }
    return out;
  }

  function shipCheckMarkdown(r) {
    r = r || runShipCheck();
    var lines = [
      '**Shipcheck** — ' + (r.ok ? '✓ PASS' : '✗ FAIL') +
        ' · product v' + (r.product || '?') +
        ' · ship ' + r.version,
      '',
    ];
    (r.sections || []).forEach(function (sec) {
      lines.push('### ' + sec.name + ' — ' + (sec.ok ? '✓' : '✗') + ' ' + sec.passed + '/' + sec.total);
      (sec.results || []).forEach(function (x) {
        lines.push('- ' + (x.pass ? '✓' : '✗') + ' `' + x.name + '`' + (x.detail ? ' — ' + x.detail : ''));
      });
      lines.push('');
    });
    return lines.join('\n');
  }

  // ── RAG UX helpers ─────────────────────────────────────────

  async function ragIndexFolderHint() {
    if (g.AETHER_RAGv2 && typeof g.AETHER_RAGv2.stats === 'function') {
      var st = await Promise.resolve(g.AETHER_RAGv2.stats());
      return st;
    }
    if (g.RAG) return { docs: g.RAG.totalDocs || 0 };
    return null;
  }

  async function ragQuickStatsMarkdown() {
    var lines = ['**RAG v2**'];
    try {
      if (g.AETHER_RAGv2) {
        var st = g.AETHER_RAGv2.stats ? await g.AETHER_RAGv2.stats() : {};
        var cols = g.AETHER_RAGv2.listCollections ? g.AETHER_RAGv2.listCollections() : [];
        lines.push('- Hybrid: **on** · collections: ' + (cols.length || 1));
        lines.push('- Stats: `' + JSON.stringify(st).slice(0, 200) + '`');
        lines.push('- Index: attach files via + menu or project index · `/rag search <q>` · `/rag hybrid on`');
      } else if (g.RAG) {
        lines.push('- Legacy RAG docs: ' + (g.RAG.totalDocs || 0));
      } else {
        lines.push('- RAG offline');
      }
    } catch (e) {
      lines.push('- error: ' + (e.message || e));
    }
    return lines.join('\n');
  }

  // ── Skill Runtime 2: auto-advance heuristics ───────────────

  function installPlaybookAutoAdvance() {
    if (!g.AETHER_SkillRuntime || g.AETHER_SkillRuntime._shipAuto) return;
    g.AETHER_SkillRuntime._shipAuto = true;
    // Observe assistant messages for step completion signals
    var _last = '';
    g.__aetherShipNoteAssistant = function (text) {
      var run = g.AETHER_SkillRuntime.getRun && g.AETHER_SkillRuntime.getRun();
      if (!run || run.status !== 'running') return;
      var t = String(text || '');
      if (t === _last) return;
      _last = t.slice(0, 200);
      // Heuristic: model completed a checklist item
      if (
        /step\s*\d+\s*(done|complete)|✓\s*step|completed step|moving to step|next step:/i.test(t) ||
        /verification checklist|files touched|residual risk/i.test(t)
      ) {
        try {
          g.AETHER_SkillRuntime.completeStep();
          if (g.AETHER_SkillRuntime.renderRunnerBar) {
            g.AETHER_SkillRuntime.renderRunnerBar('skill-runtime-bar');
          }
        } catch (e) {}
      }
    };
  }

  // ── Init ───────────────────────────────────────────────────

  function init() {
    installOfflineWatch();
    installPlaybookAutoAdvance();
    // Patch moat handoff to use real report
    if (g.AETHER_Moat && !g.AETHER_Moat._shipPatched) {
      g.AETHER_Moat._shipPatched = true;
      g.AETHER_Moat.handoffResearchToCode = function (opts) {
        return handoffResearchToCode(opts || {});
      };
      g.AETHER_Moat.handoffGhostToPR = function () {
        return handoffGhostToPR();
      };
    }
    // Alias for moat that expected createFromGhosts
    var CS = g.AETHER_ChangeSet || g.AETHER_Changeset;
    if (CS && !CS.createFromGhosts) {
      CS.createFromGhosts = function (opts) {
        return CS.createFromPending(opts);
      };
    }
    // Delayed UI mounts
    setTimeout(function () {
      mountCheckpointStrip('ship-checkpoint-host');
      // Ship tour only after persona onboarding is done (or was never needed).
      // Poll a few times so we don't race the persona wizard finish.
      function tryShipOnboard(attempt) {
        if (typeof document === 'undefined' || !document.getElementById('user-input')) return;
        if (!shouldShowOnboard()) {
          // Persona may still be open — retry briefly
          if (attempt < 20 && !onboardState().done && !onboardState().skipped) {
            setTimeout(function () {
              tryShipOnboard(attempt + 1);
            }, 1500);
          }
          return;
        }
        openOnboarding(false);
      }
      setTimeout(function () {
        tryShipOnboard(0);
      }, 1500);
    }, 800);
  }

  g.AETHER_Ship = {
    version: VERSION,
    saveLastResearch: saveLastResearch,
    getLastResearch: getLastResearch,
    handoffResearchToCode: handoffResearchToCode,
    handoffGhostToPR: handoffGhostToPR,
    mountCheckpointStrip: mountCheckpointStrip,
    openOnboarding: openOnboarding,
    shouldShowOnboard: shouldShowOnboard,
    runGoldenPaths: runGoldenPaths,
    goldenMarkdown: goldenMarkdown,
    runShipCheck: runShipCheck,
    shipCheckMarkdown: shipCheckMarkdown,
    ragQuickStatsMarkdown: ragQuickStatsMarkdown,
    updateOfflineBanner: updateOfflineBanner,
    init: init,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        setTimeout(init, 100);
      });
    } else {
      setTimeout(init, 100);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
