/**
 * AETHER Skill Runtime v5.30 — make skills operational
 * Copyright (C) 2026 The Architect · GPL-3.0-or-later
 *
 * - Workflow / playbook runner (step checklist + prompt kickoff)
 * - Tool policy from active skills (preferred tools, soft/hard gate)
 * - CODE fusion hints (Ghost, fs_patch, coding mode)
 * - Presets (builder / researcher / ops)
 * - Golden smoke checks for skill injection integrity
 *
 * Load after aether-skills-pack.js + tool-runtime; host wires activeSkills.
 */
(function (g) {
  'use strict';

  var VERSION = '5.30';
  var RUN_KEY = 'aether_skill_run_v1';
  var PRESET_KEY = 'aether_skill_preset_v1';
  var POLICY_KEY = 'aether_skill_tool_policy';
  var ALWAYS_ALLOW = {
    calculate: 1, web_search: 1, tavily_search: 1, x_search: 1,
    read_file: 1, glob: 1, grep_files: 1, get_weather: 1,
  };

  /** Extra playbooks beyond skill.workflows (flagship defaults) */
  var PLAYBOOKS = {
    'aether-code': {
      bugfix: {
        desc: 'Reproduce → locate → patch → verify (CODE + Ghost)',
        codeFusion: true,
        preferTools: ['fs_list', 'fs_read', 'shell', 'fs_patch', 'fs_stat'],
        steps: [
          'Reproduce or state the bug hypothesis clearly',
          'Locate the failing path (list / grep / read)',
          'Read surrounding code before editing',
          'Apply a minimal [[fs_patch]] (prefer surgical over rewrite)',
          'Suggest or run verification (tests / lint / smoke)',
          'Summarise root cause, files touched, residual risk',
        ],
        kickoff:
          'Run the Aether Code **bugfix** playbook on my request below.\n' +
          'Follow every step in order. Prefer [[fs_read]] / [[shell]] explore before any write.\n' +
          'Use [[fs_patch]] for edits. End with a short verification checklist.\n\n' +
          'User task:\n',
      },
      feature: {
        desc: 'Ship a feature end-to-end with acceptance criteria',
        codeFusion: true,
        preferTools: ['fs_list', 'fs_read', 'fs_patch', 'fs_write', 'shell'],
        steps: [
          'Clarify acceptance criteria (or state assumptions)',
          'Map touch points in the repo',
          'Implement the core path with minimal diffs',
          'Handle edge cases and errors',
          'Add or update tests if present in repo',
          'Summarise behaviour change + how to verify',
        ],
        kickoff:
          'Run the Aether Code **feature** playbook.\n' +
          'Explore first, then implement with [[fs_patch]] / [[fs_write]] as needed.\n\nTask:\n',
      },
      refactor: {
        desc: 'Safe structural change with invariants preserved',
        codeFusion: true,
        preferTools: ['fs_read', 'fs_patch', 'shell', 'fs_list'],
        steps: [
          'Define the invariant that must not change',
          'Characterise current behaviour (tests or examples)',
          'Apply incremental patches',
          'Verify behaviour unchanged',
          'Clean up only related noise',
        ],
        kickoff: 'Run the Aether Code **refactor** playbook. Preserve behaviour. Task:\n',
      },
      review: {
        desc: 'Code review pass (correctness, security, tests)',
        codeFusion: true,
        preferTools: ['fs_read', 'fs_list', 'shell'],
        steps: [
          'Correctness vs stated intent',
          'Security / input boundaries',
          'Edge cases',
          'API / design clarity',
          'Tests adequacy',
          'Maintainability notes',
        ],
        kickoff: 'Run the Aether Code **review** playbook on the code or change described:\n',
      },
    },
    'debug-detective': {
      rca: {
        desc: 'Scientific root-cause analysis',
        codeFusion: true,
        preferTools: ['fs_read', 'fs_list', 'shell', 'fs_patch', 'web_search'],
        steps: [
          'Reproduce (or best-effort conditions)',
          'Expected vs actual',
          'Ranked hypotheses',
          'Cheapest experiment to kill hypotheses',
          'Root cause + minimal fix',
          'Regression-proofing note',
        ],
        kickoff: 'Run Debug Detective **RCA** playbook. Scientific method. Issue:\n',
      },
    },
    'test-engineering': {
      suite: {
        desc: 'Design and sketch a test suite',
        codeFusion: true,
        preferTools: ['fs_read', 'fs_list', 'fs_patch', 'shell'],
        steps: [
          'List behaviours under test',
          'Happy paths',
          'Edge cases',
          'Failure modes',
          'Write or sketch tests matching project runner',
          'Coverage gaps + residual risk',
        ],
        kickoff: 'Run Test Engineering **suite** playbook for:\n',
      },
    },
    'rag-librarian': {
      index: {
        desc: 'Design / improve retrieval grounding',
        preferTools: ['web_search', 'fs_read', 'fs_list'],
        steps: [
          'Corpus inventory',
          'Chunk policy',
          'Metadata plan',
          'Hybrid retrieval params',
          'Eval queries',
          'Refresh / hygiene policy',
        ],
        kickoff:
          'Run RAG Librarian **index** playbook. Prefer grounded answers with citations. Topic:\n',
      },
    },
    'research-analyst': {
      deepDive: {
        desc: 'Full research pipeline with confidence',
        preferTools: ['web_search', 'x_search', 'tavily_search'],
        steps: [
          'Define research question',
          'Source identification',
          'Primary source review',
          'Counter-evidence search',
          'Synthesis',
          'Confidence assessment + report',
        ],
        kickoff: 'Run Research Analyst **deepDive** playbook:\n',
      },
    },
    architect: {
      systemDesign: {
        desc: 'System design with trade-offs + diagrams',
        preferTools: ['web_search', 'fs_read', 'fs_list'],
        steps: [
          'Requirements + scale estimates',
          'High-level design',
          'Component deep-dive',
          'Data model',
          'API sketch',
          'Trade-offs + AETHER flow/struct diagram',
        ],
        kickoff: 'Run System Architecture **systemDesign** playbook:\n',
      },
    },
    'sre-incident': {
      incident: {
        desc: 'Incident response command flow',
        preferTools: ['web_search', 'fs_read'],
        steps: [
          'Detect / declare severity',
          'Mitigate (stop bleeding)',
          'Comms template',
          'Stabilize',
          'Postmortem outline',
        ],
        kickoff: 'Run SRE **incident** playbook for this situation:\n',
      },
    },
  };

  var PRESETS = {
    builder: {
      label: 'Builder',
      desc: 'Code, debug, test, ship',
      skills: ['aether-code', 'debug-detective', 'test-engineering', 'web-dev', 'architect'],
    },
    researcher: {
      label: 'Researcher',
      desc: 'Search, synthesise, ground answers',
      skills: ['research-analyst', 'discovery', 'rag-librarian', 'critical-thinking', 'data-viz'],
    },
    ops: {
      label: 'Ops',
      desc: 'Reliability, security, releases',
      skills: ['devops', 'sre-incident', 'security-hardening', 'observability-pro', 'release-engineering'],
    },
  };

  // ── State ──────────────────────────────────────────────────
  var _run = null; // { skillName, workflowId, steps, stepIndex, status, startedAt, preferTools, codeFusion, label }
  var _policyMode = 'prefer'; // prefer | strict | off
  try {
    var pm = localStorage.getItem(POLICY_KEY);
    if (pm === 'prefer' || pm === 'strict' || pm === 'off') _policyMode = pm;
  } catch (e) {}

  function loadRun() {
    try {
      var raw = sessionStorage.getItem(RUN_KEY);
      if (raw) _run = JSON.parse(raw);
    } catch (e) {
      _run = null;
    }
    return _run;
  }

  function saveRun() {
    try {
      if (_run) sessionStorage.setItem(RUN_KEY, JSON.stringify(_run));
      else sessionStorage.removeItem(RUN_KEY);
    } catch (e) {}
  }

  function getRun() {
    return _run || loadRun();
  }

  function clearRun() {
    _run = null;
    saveRun();
    emit('clear', null);
  }

  function setPolicyMode(mode) {
    if (mode !== 'prefer' && mode !== 'strict' && mode !== 'off') return _policyMode;
    _policyMode = mode;
    try {
      localStorage.setItem(POLICY_KEY, mode);
    } catch (e) {}
    return _policyMode;
  }

  function getPolicyMode() {
    return _policyMode;
  }

  // ── Resolve skill workflows + playbooks ────────────────────

  function resolveSkill(registry, id) {
    if (g.AETHER_SkillsPack && g.AETHER_SkillsPack.resolveSkill) {
      return g.AETHER_SkillsPack.resolveSkill(registry, id);
    }
    if (!registry) return null;
    if (registry[id]) return registry[id];
    var keys = Object.keys(registry);
    for (var i = 0; i < keys.length; i++) {
      if (registry[keys[i]] && registry[keys[i]].name === id) return registry[keys[i]];
    }
    return null;
  }

  function listWorkflows(skill) {
    if (!skill) return [];
    var out = [];
    var seen = {};
    var pack = PLAYBOOKS[skill.name] || {};
    Object.keys(pack).forEach(function (id) {
      seen[id] = 1;
      out.push({
        id: id,
        desc: pack[id].desc || id,
        steps: pack[id].steps || [],
        source: 'playbook',
        codeFusion: !!pack[id].codeFusion,
      });
    });
    var wfs = skill.workflows || {};
    Object.keys(wfs).forEach(function (id) {
      if (seen[id]) {
        // enrich existing
        var item = out.filter(function (x) {
          return x.id === id;
        })[0];
        if (item && (!item.steps || !item.steps.length) && wfs[id].steps) item.steps = wfs[id].steps;
        return;
      }
      out.push({
        id: id,
        desc: (wfs[id] && wfs[id].desc) || id,
        steps: (wfs[id] && wfs[id].steps) || [],
        source: 'skill',
        codeFusion: false,
      });
    });
    return out;
  }

  function getPlaybook(skillName, workflowId) {
    var pack = PLAYBOOKS[skillName];
    if (pack && pack[workflowId]) return pack[workflowId];
    return null;
  }

  // ── Tool policy ────────────────────────────────────────────

  function collectPreferredTools(skills) {
    var set = {};
    (skills || []).forEach(function (s) {
      (s.tools || []).forEach(function (t) {
        set[String(t).toLowerCase()] = 1;
      });
      var wfs = listWorkflows(s);
      wfs.forEach(function (w) {
        var pb = getPlaybook(s.name, w.id);
        if (pb && pb.preferTools) {
          pb.preferTools.forEach(function (t) {
            set[String(t).toLowerCase()] = 1;
          });
        }
      });
    });
    if (_run && _run.preferTools) {
      _run.preferTools.forEach(function (t) {
        set[String(t).toLowerCase()] = 1;
      });
    }
    // Always allow aliases of preferred
    if (set.fs_patch) set.search_replace = 1;
    if (set.web_search) {
      set.tavily_search = 1;
      set.brave_search = 1;
    }
    return Object.keys(set);
  }

  /**
   * @returns {{ mode, preferred, allowed, reason? }}
   */
  function getToolPolicy(activeSkills) {
    var preferred = collectPreferredTools(activeSkills);
    return {
      mode: _policyMode,
      preferred: preferred,
      hasSkills: !!(activeSkills && activeSkills.length),
    };
  }

  /**
   * Gate a tool call. Soft prefer = always allow but mark. Strict = block non-preferred (except ALWAYS_ALLOW).
   * @returns {{ ok: boolean, soft?: boolean, reason?: string }}
   */
  function checkToolAllowed(toolName, activeSkills) {
    if (_policyMode === 'off') return { ok: true };
    var key = String(toolName || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');
    if (!activeSkills || !activeSkills.length) return { ok: true };
    var preferred = collectPreferredTools(activeSkills);
    if (!preferred.length) return { ok: true };
    if (ALWAYS_ALLOW[key]) return { ok: true };
    if (preferred.indexOf(key) >= 0) return { ok: true, preferred: true };

    if (_policyMode === 'strict') {
      return {
        ok: false,
        reason:
          'skill policy (strict): `' +
          key +
          '` not in preferred tools [' +
          preferred.slice(0, 12).join(', ') +
          ']. /skillpolicy prefer to soften.',
      };
    }
    // prefer mode — allow with soft flag
    return {
      ok: true,
      soft: true,
      reason: 'outside skill preferred tools (prefer mode allows)',
    };
  }

  // ── CODE fusion ────────────────────────────────────────────

  var CODE_SKILLS = {
    'aether-code': 1,
    'debug-detective': 1,
    'test-engineering': 1,
    'web-dev': 1,
    'low-level': 1,
    devops: 1,
    'frontend-systems': 1,
    'database-pro': 1,
    'api-design': 1,
    'release-engineering': 1,
    'performance-eng': 1,
    'mcp-toolsmith': 1,
  };

  function needsCodeFusion(skill) {
    if (!skill) return false;
    if (CODE_SKILLS[skill.name]) return true;
    if ((skill.tools || []).some(function (t) {
      return /fs_|shell|search_replace/.test(t);
    }))
      return true;
    var pb = PLAYBOOKS[skill.name];
    if (pb) {
      return Object.keys(pb).some(function (k) {
        return pb[k].codeFusion;
      });
    }
    return false;
  }

  function codeFusionHints(skill) {
    if (!needsCodeFusion(skill)) return null;
    return {
      skill: skill.name,
      label: skill.label,
      tips: [
        'Prefer [[fs_patch]] over full-file rewrites',
        'Ghost commits review surgical edits in CODE mode',
        'Explore with fs_list / shell before writing',
        'Link a project folder for real FS tools',
      ],
      enableCodingMode: true,
    };
  }

  // ── Workflow runner ────────────────────────────────────────

  function startWorkflow(registry, skillName, workflowId, opts) {
    opts = opts || {};
    var skill = resolveSkill(registry || g.AETHER_SKILLS, skillName);
    if (!skill) return { ok: false, error: 'unknown skill: ' + skillName };

    var pb = getPlaybook(skill.name, workflowId);
    var skillWf = skill.workflows && skill.workflows[workflowId];
    if (!pb && !skillWf) return { ok: false, error: 'unknown workflow: ' + workflowId };

    var steps = (pb && pb.steps) || (skillWf && skillWf.steps) || [];
    if (!steps.length) steps = ['Execute the workflow intent', 'Verify result', 'Summarise'];

    _run = {
      skillName: skill.name,
      skillLabel: skill.label,
      workflowId: workflowId,
      label: (pb && pb.desc) || (skillWf && skillWf.desc) || workflowId,
      steps: steps.slice(),
      stepIndex: 0,
      stepDone: steps.map(function () {
        return false;
      }),
      status: 'running',
      startedAt: Date.now(),
      preferTools: (pb && pb.preferTools) || skill.tools || [],
      codeFusion: !!(pb && pb.codeFusion) || needsCodeFusion(skill),
      userGoal: opts.goal || '',
    };
    saveRun();
    emit('start', _run);

    var kickoffBase =
      (pb && pb.kickoff) ||
      'Execute skill workflow **' +
        workflowId +
        '** for skill **' +
        skill.label +
        '**.\nFollow steps in order.\n\nTask:\n';
    var goal = opts.goal || opts.task || '';
    var message =
      kickoffBase +
      (goal || '(Awaiting details — ask me clarifying questions if needed, then proceed through the checklist.)');

    message +=
      '\n\n---\n**Active playbook:** ' +
      skill.label +
      ' / `' +
      workflowId +
      '`\n' +
      steps
        .map(function (s, i) {
          return (i + 1) + '. ' + s;
        })
        .join('\n') +
      '\n\nMark progress mentally; complete every step. Prefer tools: `' +
      (_run.preferTools || []).slice(0, 10).join('`, `') +
      '`.';

    return {
      ok: true,
      run: _run,
      message: message,
      codeFusion: _run.codeFusion,
      skill: skill,
    };
  }

  function advanceStep(n) {
    var run = getRun();
    if (!run || run.status !== 'running') return null;
    if (typeof n === 'number') run.stepIndex = Math.max(0, Math.min(run.steps.length - 1, n));
    else run.stepIndex = Math.min(run.steps.length - 1, run.stepIndex + 1);
    if (run.stepDone && run.stepIndex > 0) run.stepDone[run.stepIndex - 1] = true;
    if (run.stepIndex >= run.steps.length - 1 && run.stepDone) {
      run.stepDone[run.stepIndex] = true;
    }
    saveRun();
    emit('step', run);
    return run;
  }

  function completeStep(index) {
    var run = getRun();
    if (!run) return null;
    var i = typeof index === 'number' ? index : run.stepIndex;
    if (run.stepDone && i >= 0 && i < run.stepDone.length) run.stepDone[i] = true;
    // move to next incomplete
    var next = run.stepDone
      ? run.stepDone.findIndex(function (d) {
          return !d;
        })
      : -1;
    if (next >= 0) run.stepIndex = next;
    else {
      run.status = 'done';
      run.stepIndex = run.steps.length - 1;
    }
    saveRun();
    emit('step', run);
    return run;
  }

  function finishRun(status) {
    var run = getRun();
    if (!run) return null;
    run.status = status || 'done';
    if (run.stepDone) {
      for (var i = 0; i < run.stepDone.length; i++) run.stepDone[i] = true;
    }
    saveRun();
    emit('finish', run);
    return run;
  }

  // ── Prompt addon ───────────────────────────────────────────

  function buildRuntimePromptAddon(activeSkills) {
    var parts = [];
    var policy = getToolPolicy(activeSkills);
    if (policy.hasSkills && policy.preferred.length && _policyMode !== 'off') {
      parts.push(
        '## SKILL RUNTIME — TOOL POLICY\n' +
          'Mode: **' +
          _policyMode +
          '**. Preferred tools for active skill(s): `' +
          policy.preferred.slice(0, 24).join('`, `') +
          '`.\n' +
          (_policyMode === 'strict'
            ? 'STRICT: Do not call tools outside this set unless the user explicitly overrides.\n'
            : 'PREFER: Use preferred tools first; only reach for others when necessary and say why.\n') +
          'Edits: prefer `fs_patch` over `fs_write` for existing files.'
      );
    }

    var run = getRun();
    if (run && run.status === 'running') {
      var checklist = run.steps
        .map(function (s, i) {
          var mark = run.stepDone && run.stepDone[i] ? 'x' : i === run.stepIndex ? '>' : ' ';
          return '- [' + mark + '] ' + (i + 1) + '. ' + s;
        })
        .join('\n');
      parts.push(
        '## ACTIVE PLAYBOOK RUN\n' +
          'Skill: **' +
          run.skillLabel +
          '** · Workflow: `' +
          run.workflowId +
          '` — ' +
          run.label +
          '\n' +
          'Current step index: ' +
          (run.stepIndex + 1) +
          '/' +
          run.steps.length +
          '\n' +
          checklist +
          '\n' +
          'Work the current step (`>`), then proceed. Do not skip verification steps.'
      );
      if (run.codeFusion) {
        parts.push(
          '## CODE FUSION\n' +
            'Coding-folder tools + Ghost-friendly patches are in play. Explore before edit. Surgical diffs. Summarise files touched.'
        );
      }
    } else if (activeSkills && activeSkills.length) {
      var codeOnes = activeSkills.filter(needsCodeFusion);
      if (codeOnes.length) {
        parts.push(
          '## CODE FUSION (skill-aware)\n' +
            'Active coding-oriented skill(s): ' +
            codeOnes
              .map(function (s) {
                return s.label;
              })
              .join(', ') +
            '.\nPrefer fs_patch, list workflows via skill playbooks when multi-step.'
        );
      }
    }

    if (!parts.length) return '';
    return '\n\n---\n' + parts.join('\n\n') + '\n';
  }

  // ── Presets ────────────────────────────────────────────────

  function listPresets() {
    return Object.keys(PRESETS).map(function (id) {
      return { id: id, label: PRESETS[id].label, desc: PRESETS[id].desc, skills: PRESETS[id].skills.slice() };
    });
  }

  function applyPreset(registry, presetId, activateFn) {
    var p = PRESETS[presetId];
    if (!p) return { ok: false, error: 'unknown preset' };
    var activated = [];
    p.skills.forEach(function (name) {
      var sk = resolveSkill(registry || g.AETHER_SKILLS, name);
      if (sk && typeof activateFn === 'function') {
        activateFn(sk.name);
        activated.push(sk.name);
      }
    });
    try {
      localStorage.setItem(PRESET_KEY, presetId);
    } catch (e) {}
    return { ok: true, preset: presetId, activated: activated };
  }

  // ── Events / UI helpers ────────────────────────────────────

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
    try {
      if (g.AETHER_Kernel && g.AETHER_Kernel.log) {
        g.AETHER_Kernel.log('skill.runtime.' + type, (data && (data.workflowId || data.skillName)) || '', 'call');
      }
    } catch (e) {}
  }

  function renderRunnerBar(host) {
    var el = typeof host === 'string' ? document.getElementById(host) : host;
    if (!el) return;
    var run = getRun();
    if (!run || run.status === 'done' || run.status === 'cancelled') {
      el.style.display = 'none';
      el.innerHTML = '';
      return;
    }
    el.style.display = 'block';
    var pct = run.steps.length
      ? Math.round(
          ((run.stepDone ? run.stepDone.filter(Boolean).length : run.stepIndex) / run.steps.length) * 100
        )
      : 0;
    var stepsHtml = run.steps
      .map(function (s, i) {
        var cls =
          run.stepDone && run.stepDone[i]
            ? 'done'
            : i === run.stepIndex
              ? 'current'
              : 'todo';
        return (
          '<div class="skill-run-step ' +
          cls +
          '" data-i="' +
          i +
          '"><span class="skill-run-n">' +
          (i + 1) +
          '</span> ' +
          escapeHtml(s) +
          '</div>'
        );
      })
      .join('');

    el.innerHTML =
      '<div class="skill-run-bar-inner">' +
      '<div class="skill-run-head">' +
      '<span class="skill-run-title">▶ ' +
      escapeHtml(run.skillLabel) +
      ' · ' +
      escapeHtml(run.workflowId) +
      '</span>' +
      '<span class="skill-run-pct">' +
      pct +
      '%</span>' +
      '<button type="button" class="skill-run-btn" data-act="done-step">Done step</button>' +
      '<button type="button" class="skill-run-btn" data-act="next">Next</button>' +
      '<button type="button" class="skill-run-btn skill-run-finish" data-act="finish">Finish</button>' +
      '<button type="button" class="skill-run-btn skill-run-cancel" data-act="cancel">Cancel</button>' +
      '</div>' +
      '<div class="skill-run-label">' +
      escapeHtml(run.label || '') +
      '</div>' +
      '<div class="skill-run-steps">' +
      stepsHtml +
      '</div>' +
      '</div>';

    el.querySelectorAll('[data-act]').forEach(function (btn) {
      btn.onclick = function () {
        var act = btn.getAttribute('data-act');
        if (act === 'done-step') completeStep();
        else if (act === 'next') advanceStep();
        else if (act === 'finish') {
          finishRun('done');
          clearRun();
        } else if (act === 'cancel') {
          finishRun('cancelled');
          clearRun();
        }
        renderRunnerBar(el);
      };
    });
    el.querySelectorAll('.skill-run-step').forEach(function (row) {
      row.onclick = function () {
        var i = parseInt(row.getAttribute('data-i'), 10);
        completeStep(i);
        renderRunnerBar(el);
      };
    });
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Golden smoke tests ─────────────────────────────────────

  function runGoldenSmokes(registry) {
    var reg = registry || g.AETHER_SKILLS || {};
    var results = [];
    function ok(name, pass, detail) {
      results.push({ name: name, pass: !!pass, detail: detail || '' });
    }

    ok('registry_nonempty', Object.keys(reg).length >= 20, 'count=' + Object.keys(reg).length);
    ok('has_aether_code', !!resolveSkill(reg, 'aether-code'), 'aether-code');
    ok('has_discovery', !!resolveSkill(reg, 'discovery'), 'discovery');
    ok('has_documents', !!resolveSkill(reg, 'documents-supremacy'), 'documents-supremacy');

    var ac = resolveSkill(reg, 'aether-code');
    ok('aether_code_tools', ac && (ac.tools || []).indexOf('fs_patch') >= 0, 'fs_patch in tools');
    ok('aether_code_playbooks', listWorkflows(ac).length >= 3, 'workflows=' + (ac ? listWorkflows(ac).length : 0));

    var start = startWorkflow(reg, 'aether-code', 'bugfix', { goal: 'smoke test only — do not execute' });
    ok('start_bugfix', start.ok && start.message && start.message.indexOf('bugfix') >= 0, start.error || 'msg');
    ok('run_state', !!getRun() && getRun().workflowId === 'bugfix', 'run');
    clearRun();
    ok('clear_run', !getRun(), 'cleared');

    var pol = getToolPolicy(ac ? [ac] : []);
    ok('policy_preferred', pol.preferred.indexOf('fs_patch') >= 0, pol.preferred.slice(0, 5).join(','));

    setPolicyMode('strict');
    var block = checkToolAllowed('email_send', ac ? [ac] : []);
    ok('strict_blocks_foreign', !block.ok, block.reason || '');
    setPolicyMode('prefer');
    var soft = checkToolAllowed('email_send', ac ? [ac] : []);
    ok('prefer_allows_soft', soft.ok && soft.soft, soft.reason || '');

    var preset = listPresets();
    ok('presets', preset.length >= 3, 'n=' + preset.length);

    var addon = buildRuntimePromptAddon(ac ? [ac] : []);
    ok('prompt_addon', addon.indexOf('TOOL POLICY') >= 0, 'addon');

    var passed = results.filter(function (r) {
      return r.pass;
    }).length;
    return {
      version: VERSION,
      passed: passed,
      total: results.length,
      ok: passed === results.length,
      results: results,
    };
  }

  // boot load
  loadRun();

  g.AETHER_SkillRuntime = {
    version: VERSION,
    PLAYBOOKS: PLAYBOOKS,
    PRESETS: PRESETS,
    listWorkflows: listWorkflows,
    getPlaybook: getPlaybook,
    startWorkflow: startWorkflow,
    getRun: getRun,
    clearRun: clearRun,
    advanceStep: advanceStep,
    completeStep: completeStep,
    finishRun: finishRun,
    getToolPolicy: getToolPolicy,
    checkToolAllowed: checkToolAllowed,
    setPolicyMode: setPolicyMode,
    getPolicyMode: getPolicyMode,
    collectPreferredTools: collectPreferredTools,
    needsCodeFusion: needsCodeFusion,
    codeFusionHints: codeFusionHints,
    buildRuntimePromptAddon: buildRuntimePromptAddon,
    listPresets: listPresets,
    applyPreset: applyPreset,
    renderRunnerBar: renderRunnerBar,
    runGoldenSmokes: runGoldenSmokes,
    on: on,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
