/**
 * AETHER Moat — competitive defensive layer
 * Copyright (C) 2026 The Architect · GPL-3.0-or-later
 *
 * Moat thesis (not marketing fluff — encoded as runtime pillars):
 *
 *  1. ZERO-BACKEND — agent OS runs in the browser; keys stay local
 *  2. GHOST REVIEW — surgical edits are human-gated by default
 *  3. PROVENANCE   — flights, patches, research, skills form one audit chain
 *  4. LOCAL MEMORY — RAG v2 hybrid lives on-device (IndexedDB)
 *  5. SKILL RUNTIME— flagship playbooks + tool policy (not prompt stickers)
 *  6. DEEP RESEARCH— multi-angle grounded reports with source ledger
 *  7. SECURITY     — path/shell/SSRF/MCP localhost gates in the client
 *  8. FUSION       — handoffs: Research→Code, Skill→Workflow, Ghost→PR
 *
 * Competitors can copy a chat UI. They cannot casually copy a local-first
 * agent OS with reviewable provenance and fused research/code loops.
 *
 * Load after kernel, ghost, security, rag, skill-runtime, deep-research.
 */
(function (g) {
  'use strict';

  var VERSION = '1.0';
  var PROV_KEY = 'aether_moat_provenance_v1';
  var SCORE_KEY = 'aether_moat_score_cache';
  var MAX_PROV = 200;

  // ── Pillars (stable product identity) ──────────────────────

  var PILLARS = [
    {
      id: 'zero_backend',
      label: 'Zero-Backend Agent OS',
      weight: 18,
      blurb: 'Full agent stack in the browser — no Aether server, keys local, works offline for core loops.',
      check: function (ctx) {
        return {
          score: 100,
          detail: 'architecture=browser-native · no required control plane',
          ok: true,
        };
      },
    },
    {
      id: 'ghost_review',
      label: 'Ghost Review Loop',
      weight: 16,
      blurb: 'fs_patch / writes land as Ghost commits — Accept/Reject, hunks, change sets.',
      check: function (ctx) {
        var hasGhost = !!(g.AETHER_Ghost && g.AETHER_Ghost.propose);
        var pending = 0;
        try {
          if (g.AETHER_Ghost && g.AETHER_Ghost.loadQueue) {
            pending = g.AETHER_Ghost.loadQueue().filter(function (x) {
              return x.status === 'pending';
            }).length;
          }
        } catch (e) {}
        return {
          score: hasGhost ? 100 : 0,
          detail: hasGhost ? 'Ghost online · ' + pending + ' pending' : 'Ghost module missing',
          ok: hasGhost,
          pending: pending,
        };
      },
    },
    {
      id: 'provenance',
      label: 'Provenance Chain',
      weight: 14,
      blurb: 'Every research run, skill playbook, patch, and flight is chained into a local ledger.',
      check: function (ctx) {
        var n = loadProvenance().length;
        var score = n === 0 ? 40 : Math.min(100, 50 + n * 2);
        return { score: score, detail: n + ' provenance events', ok: true, count: n };
      },
    },
    {
      id: 'local_memory',
      label: 'Local RAG Memory',
      weight: 12,
      blurb: 'Hybrid BM25 + vector retrieval, collections, citations — on-device.',
      check: function (ctx) {
        var has = !!(g.AETHER_RAGv2 || g.RAG);
        var docs = 0;
        try {
          if (g.AETHER_RAGv2 && typeof g.AETHER_RAGv2.stats === 'function') {
            var st = g.AETHER_RAGv2.stats();
            docs = (st && (st.chunks || st.docs || st.total)) || 0;
          } else if (g.RAG) docs = g.RAG.totalDocs || 0;
        } catch (e) {}
        var score = !has ? 0 : docs > 0 ? 100 : 55;
        return {
          score: score,
          detail: has ? 'RAG online · ~' + docs + ' indexed units' : 'RAG offline',
          ok: has,
          docs: docs,
        };
      },
    },
    {
      id: 'skill_runtime',
      label: 'Skill Runtime',
      weight: 12,
      blurb: 'Flagship skills with playbooks, tool policy, CODE fusion — not decorative prompts.',
      check: function (ctx) {
        var rt = !!g.AETHER_SkillRuntime;
        var pack = !!g.AETHER_SkillsPack;
        var n = g.AETHER_SKILLS ? Object.keys(g.AETHER_SKILLS).length : 0;
        var score = rt && pack ? Math.min(100, 60 + Math.floor(n / 2)) : rt ? 50 : 0;
        return {
          score: score,
          detail: (rt ? 'runtime' : 'no-runtime') + ' · ' + n + ' skills',
          ok: rt,
          skills: n,
        };
      },
    },
    {
      id: 'deep_research',
      label: 'Deep Research v3',
      weight: 10,
      blurb: 'Multi-angle search, gap-fill, source ledger, RAG grounding.',
      check: function (ctx) {
        var has = !!(g.AETHER_DeepResearch && g.AETHER_DeepResearch.version);
        return {
          score: has ? 100 : 0,
          detail: has ? 'engine v' + g.AETHER_DeepResearch.version : 'engine missing',
          ok: has,
        };
      },
    },
    {
      id: 'security',
      label: 'Client Security Gates',
      weight: 10,
      blurb: 'Path traversal block, shell allowlist, secret redaction, MCP localhost-only, SSRF guard.',
      check: function (ctx) {
        var S = g.AETHER_Security;
        if (!S) return { score: 0, detail: 'security module missing', ok: false };
        var flags = S.flags || {};
        var score = 70;
        if (S.preflightTool) score += 15;
        if (S.redactSecrets) score += 10;
        if (flags.blockPrivateHttp !== false) score += 5;
        return {
          score: Math.min(100, score),
          detail: 'gates online · destructive=' + ((S.DESTRUCTIVE_TOOLS || []).length || '?'),
          ok: true,
        };
      },
    },
    {
      id: 'fusion',
      label: 'Cross-Feature Fusion',
      weight: 8,
      blurb: 'Handoffs: Research→Code, Skill playbooks, Ghost→Change sets, Kernel flights.',
      check: function (ctx) {
        var bits = [
          !!g.AETHER_Kernel,
          !!g.AETHER_Ghost,
          !!g.AETHER_SkillRuntime,
          !!g.AETHER_DeepResearch,
          !!g.AETHER_Changeset || !!g.AETHER_CodePro,
        ];
        var on = bits.filter(Boolean).length;
        return {
          score: Math.round((on / bits.length) * 100),
          detail: on + '/' + bits.length + ' fusion surfaces',
          ok: on >= 3,
        };
      },
    },
  ];

  // ── Provenance ledger ──────────────────────────────────────

  function loadProvenance() {
    try {
      return JSON.parse(localStorage.getItem(PROV_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveProvenance(list) {
    try {
      localStorage.setItem(PROV_KEY, JSON.stringify(list.slice(0, MAX_PROV)));
    } catch (e) {}
  }

  function uid(p) {
    return (p || 'p') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  /**
   * Record a moat-relevant event.
   * @param {string} kind — ghost|research|skill|flight|tool|handoff|security|session
   * @param {object} payload
   */
  function record(kind, payload) {
    payload = payload || {};
    var list = loadProvenance();
    var prev = list[0];
    var entry = {
      id: uid('moat'),
      t: Date.now(),
      kind: kind || 'event',
      title: payload.title || kind,
      detail: (payload.detail || '').slice(0, 400),
      meta: payload.meta || {},
      prevId: prev ? prev.id : null,
      hash: null,
    };
    // lightweight chain hash (not crypto strength — integrity hint)
    entry.hash = simpleHash(
      entry.id + '|' + entry.t + '|' + entry.kind + '|' + entry.title + '|' + (entry.prevId || '')
    );
    list.unshift(entry);
    saveProvenance(list);
    emit('record', entry);
    try {
      if (g.AETHER_Kernel && g.AETHER_Kernel.log) {
        g.AETHER_Kernel.log('moat.' + kind, entry.title.slice(0, 80), 'call');
      }
    } catch (e) {}
    return entry;
  }

  function simpleHash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  function recent(n) {
    return loadProvenance().slice(0, n || 20);
  }

  function clearProvenance() {
    saveProvenance([]);
    emit('clear', null);
  }

  // ── Score ──────────────────────────────────────────────────

  function computeScore(ctx) {
    ctx = ctx || {};
    var pillars = PILLARS.map(function (p) {
      var r;
      try {
        r = p.check(ctx) || { score: 0, detail: 'error', ok: false };
      } catch (e) {
        r = { score: 0, detail: e.message || 'check failed', ok: false };
      }
      return {
        id: p.id,
        label: p.label,
        weight: p.weight,
        blurb: p.blurb,
        score: Math.max(0, Math.min(100, r.score || 0)),
        detail: r.detail || '',
        ok: !!r.ok,
        extra: r,
      };
    });
    var totalW = pillars.reduce(function (a, p) {
      return a + p.weight;
    }, 0);
    var weighted = pillars.reduce(function (a, p) {
      return a + p.score * p.weight;
    }, 0);
    var overall = totalW ? Math.round(weighted / totalW) : 0;
    var grade =
      overall >= 90 ? 'A' : overall >= 80 ? 'B' : overall >= 70 ? 'C' : overall >= 55 ? 'D' : 'F';
    var result = {
      overall: overall,
      grade: grade,
      pillars: pillars,
      at: Date.now(),
      version: VERSION,
      product: (g.AETHER_FULL_LABEL || 'AETHER') + '',
    };
    try {
      localStorage.setItem(SCORE_KEY, JSON.stringify({ overall: overall, grade: grade, at: result.at }));
    } catch (e) {}
    return result;
  }

  // ── Handoffs (fusion) ──────────────────────────────────────

  /**
   * Research → Code: seed a coding playbook with research summary.
   */
  function handoffResearchToCode(opts) {
    opts = opts || {};
    var summary = opts.summary || opts.report || '';
    var topic = opts.topic || 'research findings';
    var goal =
      'Implement or prototype based on Deep Research findings.\n\n' +
      '## Research topic\n' +
      topic +
      '\n\n## Findings (context)\n' +
      String(summary).slice(0, 4000) +
      '\n\n## Task\n' +
      (opts.task || 'Propose a minimal implementation plan and apply surgical patches where a coding folder is linked.');

    record('handoff', {
      title: 'Research → Code',
      detail: topic.slice(0, 120),
      meta: { from: 'research', to: 'code' },
    });

    // Activate coding skill + start playbook if runtime present
    if (typeof g.activateSkill === 'function') {
      try {
        g.activateSkill('aether-code');
      } catch (e) {}
    }
    if (typeof g.runSkillWorkflow === 'function') {
      g.runSkillWorkflow('aether-code', opts.workflow || 'feature', goal);
      return { ok: true, mode: 'playbook' };
    }
    // Fallback: fill composer
    var input = document.getElementById('user-input');
    if (input) {
      input.value = goal;
      try {
        input.dispatchEvent(new Event('input'));
      } catch (e) {}
    }
    return { ok: true, mode: 'composer' };
  }

  /**
   * Skill → Deep Research: run DR on a skill-framed question.
   */
  function handoffSkillToResearch(skillName, question) {
    record('handoff', {
      title: 'Skill → Research',
      detail: (skillName || '') + ' · ' + String(question || '').slice(0, 80),
      meta: { from: 'skill', to: 'research', skill: skillName },
    });
    if (typeof g.activateSkill === 'function' && skillName) {
      try {
        g.activateSkill(skillName);
      } catch (e) {}
    }
    var q = question || 'Investigate best practices and current state for ' + skillName;
    if (typeof g.runDeepResearchPipeline === 'function') {
      try {
        if (g.state) g.state.deepResearch = true;
        var btn = document.getElementById('btn-deep-research');
        if (btn) btn.classList.add('active');
      } catch (e) {}
      g.runDeepResearchPipeline(q);
      return { ok: true };
    }
    return { ok: false, error: 'Deep Research pipeline unavailable' };
  }

  /**
   * Ghost queue → Change set / PR grouping if available.
   */
  function handoffGhostToPR() {
    record('handoff', {
      title: 'Ghost → PR',
      detail: 'bundle pending ghosts',
      meta: { from: 'ghost', to: 'pr' },
    });
    if (g.AETHER_Changeset && typeof g.AETHER_Changeset.createFromGhosts === 'function') {
      return { ok: true, result: g.AETHER_Changeset.createFromGhosts() };
    }
    if (g.AETHER_CodePro && typeof g.AETHER_CodePro.openPRPanel === 'function') {
      g.AETHER_CodePro.openPRPanel();
      return { ok: true, mode: 'panel' };
    }
    // slash-style notify
    if (typeof g.showNotification === 'function') {
      g.showNotification('Open /pr to group Ghost commits into a change set', 'info');
    }
    return { ok: true, mode: 'hint' };
  }

  // ── Trust pack export ──────────────────────────────────────

  function exportTrustPack() {
    var score = computeScore();
    var flights = [];
    try {
      if (g.AETHER_Kernel && g.AETHER_Kernel.loadFlights) flights = g.AETHER_Kernel.loadFlights().slice(0, 10);
      else if (g.AETHER_Kernel && g.AETHER_Kernel.getHistory) flights = g.AETHER_Kernel.getHistory().slice(0, 10);
    } catch (e) {}
    var ghosts = [];
    try {
      if (g.AETHER_Ghost && g.AETHER_Ghost.loadQueue) ghosts = g.AETHER_Ghost.loadQueue().slice(0, 20);
    } catch (e) {}
    var pack = {
      kind: 'aether-trust-pack',
      version: VERSION,
      exportedAt: new Date().toISOString(),
      product: g.AETHER_FULL_LABEL || 'AETHER',
      architecture: 'browser-native zero-backend',
      moatScore: { overall: score.overall, grade: score.grade, pillars: score.pillars },
      provenance: loadProvenance().slice(0, 80),
      recentFlights: flights,
      ghostQueueSummary: ghosts.map(function (x) {
        return { path: x.path, status: x.status, adds: x.adds, dels: x.dels, id: x.id };
      }),
      skillsActive: (g.activeSkills || []).map(function (s) {
        return s.name || s;
      }),
      disclaimer:
        'Local export only. Contains no API keys by design. Provenance hashes are integrity hints, not cryptographic proofs.',
    };
    // Strip anything that looks like a secret
    var json = JSON.stringify(pack, null, 2);
    if (g.AETHER_Security && g.AETHER_Security.redactSecrets) {
      json = g.AETHER_Security.redactSecrets(json);
    }
    return json;
  }

  function downloadTrustPack() {
    var json = exportTrustPack();
    try {
      var blob = new Blob([json], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'aether-trust-pack-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(a.href);
      }, 2000);
      record('session', { title: 'Trust pack exported', detail: 'download' });
      return true;
    } catch (e) {
      return false;
    }
  }

  // ── Competitive positioning (in-product, factual) ──────────

  function positioningMarkdown(score) {
    score = score || computeScore();
    var lines = [
      '# AETHER Moat',
      '',
      '**Score: ' + score.overall + '/100 (grade ' + score.grade + ')** · ' + (g.AETHER_FULL_LABEL || ''),
      '',
      '## Thesis',
      'AETHER is a **browser-native agent OS** — not a hosted chat wrapper and not an IDE plugin that phones home for agency.',
      '',
      '## Pillars',
    ];
    score.pillars.forEach(function (p) {
      lines.push(
        '- **' +
          p.label +
          '** (' +
          p.score +
          '%) — ' +
          p.blurb +
          (p.detail ? ' _[' + p.detail + ']_' : '')
      );
    });
    lines.push(
      '',
      '## What we refuse to be',
      '- Open WebUI clone (multi-user server admin surface)',
      '- AnythingLLM clone (desktop RAG box only)',
      '- Cursor clone without local agency/review semantics',
      '',
      '## What only this stack compounds',
      'Ghost review + Skill Runtime playbooks + Deep Research ledger + local RAG + Kernel flights + client security gates — **in one zero-backend runtime**.',
      '',
      '## Commands',
      '`/moat` · `/moat export` · `/moat handoff code` · `/moat score`',
      ''
    );
    return lines.join('\n');
  }

  // ── Auto-instrumentation ───────────────────────────────────

  var _wired = false;
  function installHooks() {
    if (_wired) return;
    _wired = true;

    // Ghost proposals
    try {
      if (g.AETHER_Ghost && g.AETHER_Ghost.propose && !g.AETHER_Ghost._moatWrapped) {
        var origPropose = g.AETHER_Ghost.propose.bind(g.AETHER_Ghost);
        g.AETHER_Ghost.propose = function (item) {
          var r = origPropose(item);
          try {
            record('ghost', {
              title: 'Ghost propose ' + (item && item.path ? item.path : ''),
              detail: (item && item.message) || (item && item.kind) || 'patch',
              meta: { path: item && item.path, kind: item && item.kind },
            });
          } catch (e) {}
          return r;
        };
        g.AETHER_Ghost._moatWrapped = true;
      }
    } catch (e) {}

    // Kernel flight begin/end
    try {
      if (g.AETHER_Kernel && g.AETHER_Kernel.on) {
        g.AETHER_Kernel.on(function (type, data) {
          if (type === 'begin') {
            record('flight', {
              title: 'Flight start',
              detail: (data && data.goal) || '',
              meta: { flightId: data && data.id },
            });
          } else if (type === 'end') {
            record('flight', {
              title: 'Flight ' + ((data && data.status) || 'landed'),
              detail: (data && data.events && data.events.length) + ' events',
              meta: { flightId: data && data.id, status: data && data.status },
            });
          }
        });
      }
    } catch (e) {}

    // Skill runtime
    try {
      if (g.AETHER_SkillRuntime && g.AETHER_SkillRuntime.on) {
        g.AETHER_SkillRuntime.on(function (type, data) {
          if (type === 'start') {
            record('skill', {
              title: 'Playbook ' + (data && data.skillName) + '/' + (data && data.workflowId),
              detail: (data && data.label) || '',
              meta: { skill: data && data.skillName, workflow: data && data.workflowId },
            });
          } else if (type === 'finish') {
            record('skill', {
              title: 'Playbook finished',
              detail: (data && data.workflowId) || '',
              meta: { status: data && data.status },
            });
          }
        });
      }
    } catch (e) {}

    record('session', {
      title: 'Moat hooks armed',
      detail: 'v' + VERSION,
      meta: { product: g.AETHER_VERSION || '' },
    });
  }

  // ── UI ─────────────────────────────────────────────────────

  var _listeners = [];
  function on(fn) {
    if (typeof fn === 'function') _listeners.push(fn);
    return function () {
      _listeners = _listeners.filter(function (f) {
        return f !== fn;
      });
    };
  }
  function emit(type, data) {
    _listeners.forEach(function (fn) {
      try {
        fn(type, data);
      } catch (e) {}
    });
  }

  function openPanel() {
    var existing = document.getElementById('aether-moat-modal');
    if (existing) existing.remove();

    var score = computeScore();
    var modal = document.createElement('div');
    modal.id = 'aether-moat-modal';
    modal.className = 'moat-modal';
    modal.innerHTML =
      '<div class="moat-modal-card">' +
      '<div class="moat-modal-header">' +
      '<div><div class="moat-modal-title">⬡ AETHER Moat</div>' +
      '<div class="moat-modal-sub">Local-first agent OS · defensive product layer</div></div>' +
      '<button type="button" class="moat-close" id="moatClose">&times;</button></div>' +
      '<div class="moat-score-hero">' +
      '<div class="moat-score-num">' +
      score.overall +
      '</div>' +
      '<div class="moat-score-meta"><div class="moat-grade">Grade ' +
      score.grade +
      '</div>' +
      '<div class="moat-score-label">Moat integrity score</div></div></div>' +
      '<div class="moat-pillars" id="moatPillars"></div>' +
      '<div class="moat-actions">' +
      '<button type="button" class="moat-btn" data-act="export">Export trust pack</button>' +
      '<button type="button" class="moat-btn" data-act="handoff-code">Research → Code</button>' +
      '<button type="button" class="moat-btn" data-act="ghost-pr">Ghost → PR</button>' +
      '<button type="button" class="moat-btn" data-act="brief">Post brief</button>' +
      '<button type="button" class="moat-btn moat-btn-ghost" data-act="refresh">Refresh</button>' +
      '</div>' +
      '<div class="moat-prov-title">Recent provenance</div>' +
      '<div class="moat-prov" id="moatProv"></div>' +
      '</div>';

    document.body.appendChild(modal);
    renderPillars(modal.querySelector('#moatPillars'), score);
    renderProv(modal.querySelector('#moatProv'));

    modal.querySelector('#moatClose').onclick = function () {
      modal.remove();
    };
    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.remove();
    });
    modal.querySelectorAll('[data-act]').forEach(function (btn) {
      btn.onclick = function () {
        var act = btn.getAttribute('data-act');
        if (act === 'export') {
          downloadTrustPack();
          if (typeof g.showNotification === 'function') g.showNotification('Trust pack downloaded', 'success');
        } else if (act === 'handoff-code') {
          var L = typeof g._drLastLedger === 'function' ? g._drLastLedger() : null;
          handoffResearchToCode({
            topic: 'last research',
            summary: L ? JSON.stringify(L.sources || []).slice(0, 2000) : 'Use latest Deep Research report in context.',
            task: 'Turn research insights into concrete code changes in the linked project.',
          });
          modal.remove();
        } else if (act === 'ghost-pr') {
          handoffGhostToPR();
        } else if (act === 'brief') {
          if (typeof g.addSystemMessage === 'function') g.addSystemMessage(positioningMarkdown(score));
          modal.remove();
        } else if (act === 'refresh') {
          var s2 = computeScore();
          renderPillars(modal.querySelector('#moatPillars'), s2);
          modal.querySelector('.moat-score-num').textContent = s2.overall;
          modal.querySelector('.moat-grade').textContent = 'Grade ' + s2.grade;
          renderProv(modal.querySelector('#moatProv'));
        }
      };
    });
  }

  function renderPillars(host, score) {
    if (!host) return;
    host.innerHTML = score.pillars
      .map(function (p) {
        return (
          '<div class="moat-pillar' +
          (p.ok ? '' : ' weak') +
          '">' +
          '<div class="moat-pillar-top"><span class="moat-pillar-label">' +
          escapeHtml(p.label) +
          '</span><span class="moat-pillar-score">' +
          p.score +
          '%</span></div>' +
          '<div class="moat-bar"><div class="moat-bar-fill" style="width:' +
          p.score +
          '%"></div></div>' +
          '<div class="moat-pillar-detail">' +
          escapeHtml(p.detail) +
          '</div>' +
          '<div class="moat-pillar-blurb">' +
          escapeHtml(p.blurb) +
          '</div></div>'
        );
      })
      .join('');
  }

  function renderProv(host) {
    if (!host) return;
    var list = recent(12);
    if (!list.length) {
      host.innerHTML = '<div class="moat-prov-empty">No events yet — use CODE, DEEP, Skills, or tools to build the chain.</div>';
      return;
    }
    host.innerHTML = list
      .map(function (e) {
        var t = new Date(e.t).toLocaleTimeString();
        return (
          '<div class="moat-prov-row">' +
          '<span class="moat-prov-kind">' +
          escapeHtml(e.kind) +
          '</span>' +
          '<span class="moat-prov-title">' +
          escapeHtml(e.title) +
          '</span>' +
          '<span class="moat-prov-hash">' +
          escapeHtml(e.hash || '') +
          '</span>' +
          '<span class="moat-prov-time">' +
          t +
          '</span></div>'
        );
      })
      .join('');
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Public
  g.AETHER_Moat = {
    version: VERSION,
    PILLARS: PILLARS,
    record: record,
    recent: recent,
    loadProvenance: loadProvenance,
    clearProvenance: clearProvenance,
    computeScore: computeScore,
    handoffResearchToCode: handoffResearchToCode,
    handoffSkillToResearch: handoffSkillToResearch,
    handoffGhostToPR: handoffGhostToPR,
    exportTrustPack: exportTrustPack,
    downloadTrustPack: downloadTrustPack,
    positioningMarkdown: positioningMarkdown,
    installHooks: installHooks,
    openPanel: openPanel,
    on: on,
  };

  // Auto-install when DOM ready-ish
  function scheduleInstall() {
    var run = function () {
      try {
        installHooks();
      } catch (e) {}
    };
    if (typeof setTimeout === 'function') setTimeout(run, 50);
    else run();
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', scheduleInstall);
    } else {
      scheduleInstall();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
