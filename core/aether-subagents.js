/**
 * AETHER Subagents — multi-agent workers for Code Pro (zero-backend)
 * Roles: explore (read-only) · plan (read-only) · edit (write via Ghost)
 *
 * Orchestrator can run a swarm: explore → plan → edit
 */
(function (g) {
  'use strict';

  var MAX_STEPS = 6;
  var MAX_TOOL_RESULT = 3500;
  var _running = false;
  var _jobs = [];

  var ROLES = {
    explore: {
      label: 'Explore',
      icon: '🔎',
      tools: ['fs_read', 'fs_list', 'fs_stat', 'fs_exists', 'shell', 'glob', 'grep_files', 'read_file'],
      system:
        'You are an EXPLORE subagent. READ-ONLY. Map the codebase relevant to the goal. ' +
        'Use tools liberally. End with a concise findings report (paths, symbols, risks). ' +
        'Tool syntax: [[tool: arg]]. Never write or patch files.',
    },
    plan: {
      label: 'Plan',
      icon: '🧭',
      tools: ['fs_read', 'fs_list', 'fs_stat', 'fs_exists', 'shell', 'read_file'],
      system:
        'You are a PLAN subagent. READ-ONLY. Produce an execution plan only. ' +
        'Output exactly:\n<aether:plan>\n- [ ] steps…\n</aether:plan>\n' +
        'Then brief rationale. No code writes. Tools: [[tool: arg]].',
    },
    edit: {
      label: 'Edit',
      icon: '🩹',
      tools: [
        'fs_read',
        'fs_list',
        'fs_stat',
        'fs_exists',
        'fs_patch',
        'search_replace',
        'fs_write',
        'fs_mkdir',
        'shell',
        'read_file',
      ],
      system:
        'You are an EDIT subagent. Prefer [[fs_patch: path|||old|||new]] surgical edits. ' +
        'Read before patch. Never rewrite whole files unless creating new. ' +
        'When done, summarize files touched. Tools: [[tool: arg]].',
    },
    review: {
      label: 'Review',
      icon: '🧐',
      tools: ['fs_read', 'fs_list', 'shell', 'read_file'],
      system:
        'You are a REVIEW subagent. Critique the proposed changes for bugs, security, and style. ' +
        'Recommend Accept/Reject per file. READ-ONLY. Tools: [[tool: arg]].',
    },
  };

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function uid() {
    return 'sub_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  function getDisplay() {
    return document.getElementById('chat-display');
  }

  function cardEl(job) {
    var el = document.createElement('div');
    el.className = 'aether-msg subagent-card subagent-' + job.role;
    el.id = 'subagent-' + job.id;
    el.innerHTML =
      '<div class="subagent-hdr">' +
      '<span class="subagent-icon">' +
      esc(ROLES[job.role].icon) +
      '</span>' +
      '<span class="subagent-title">' +
      esc(ROLES[job.role].label) +
      ' agent</span>' +
      '<span class="subagent-status" data-st="running">running</span>' +
      '</div>' +
      '<div class="subagent-goal">' +
      esc(job.goal.slice(0, 200)) +
      '</div>' +
      '<div class="subagent-log"></div>' +
      '<div class="subagent-result"></div>';
    return el;
  }

  function logLine(job, text, cls) {
    var host = document.getElementById('subagent-' + job.id);
    if (!host) return;
    var log = host.querySelector('.subagent-log');
    if (!log) return;
    var line = document.createElement('div');
    line.className = 'subagent-log-line' + (cls ? ' ' + cls : '');
    line.textContent = text;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  function setStatus(job, st) {
    job.status = st;
    var host = document.getElementById('subagent-' + job.id);
    if (!host) return;
    var s = host.querySelector('.subagent-status');
    if (s) {
      s.dataset.st = st;
      s.textContent = st;
    }
  }

  function setResult(job, md) {
    var host = document.getElementById('subagent-' + job.id);
    if (!host) return;
    var r = host.querySelector('.subagent-result');
    if (!r) return;
    if (typeof g.parseMarkdown === 'function') {
      r.innerHTML = '';
      try {
        r.appendChild(g.parseMarkdown(md));
      } catch (e) {
        r.textContent = md;
      }
    } else {
      r.textContent = md;
    }
  }

  async function callModel(messages, model) {
    if (typeof g.callAISimple === 'function') {
      return g.callAISimple(messages, model);
    }
    // Fallback: try window API
    if (typeof g.callAI === 'function') {
      return g.callAI(messages);
    }
    throw new Error('No model caller (callAISimple) available');
  }

  async function runTool(name, arg) {
    // Prefer unified callTool so pack gates, envelopes, kernel, history all apply
    if (typeof g.callTool === 'function') {
      try {
        return String(await g.callTool(name, arg)).slice(0, MAX_TOOL_RESULT);
      } catch (e0) {
        return 'ERROR: ' + e0.message;
      }
    }
    var reg = g.TOOL_REGISTRY || g.__AETHER_TOOL_REGISTRY;
    if (!reg || !reg[name] || !reg[name].fn) {
      return 'Unknown tool: ' + name;
    }
    try {
      var packed = arg;
      if (g.AETHER_ToolRuntime && g.AETHER_ToolRuntime.normalizeArgs) {
        var n = g.AETHER_ToolRuntime.normalizeArgs(name, arg);
        var out0 = await reg[name].fn.apply(null, n.callArgs);
        return g.AETHER_ToolRuntime.formatResult
          ? g.AETHER_ToolRuntime.formatResult(name, out0)
          : String(out0).slice(0, MAX_TOOL_RESULT);
      }
      var out = await reg[name].fn(packed);
      return String(out).slice(0, MAX_TOOL_RESULT);
    } catch (e) {
      return 'ERROR: ' + e.message;
    }
  }

  function parseTools(text, allowed) {
    var calls = [];
    var re = /\[\[(\w+):\s*([\s\S]*?)\]\]/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      var name = m[1];
      if (allowed.indexOf(name) === -1) continue;
      calls.push({ name: name, arg: m[2].trim() });
    }
    // single-line fallback
    if (!calls.length) {
      var re2 = /\[\[(\w+):\s*([^\]]+)\]\]/g;
      while ((m = re2.exec(text)) !== null) {
        if (allowed.indexOf(m[1]) === -1) continue;
        calls.push({ name: m[1], arg: m[2].trim() });
      }
    }
    return calls.slice(0, 4);
  }

  async function runJob(job) {
    var role = ROLES[job.role] || ROLES.explore;
    var history = [
      { role: 'system', content: role.system + '\nAllowed tools: ' + role.tools.join(', ') },
      { role: 'user', content: 'GOAL:\n' + job.goal },
    ];
    // Inject CODE memory if present
    try {
      if (g.AETHER_CodePro && g.AETHER_CodePro.memoryForPrompt) {
        var mem = g.AETHER_CodePro.memoryForPrompt();
        if (mem) history[0].content += '\n' + mem;
      }
    } catch (e) {}

    var display = getDisplay();
    if (display) {
      var el = cardEl(job);
      display.appendChild(el);
      if (typeof g.smoothScrollToBottom === 'function') g.smoothScrollToBottom();
    }

    setStatus(job, 'running');
    if (typeof g.setCodeSessionStatus === 'function') {
      g.setCodeSessionStatus('thinking', role.label + ' agent…');
    }

    var lastText = '';
    for (var step = 0; step < (job.maxSteps || MAX_STEPS); step++) {
      if (job.abort) {
        setStatus(job, 'aborted');
        break;
      }
      logLine(job, 'step ' + (step + 1) + '…', 'dim');
      var response;
      try {
        response = await callModel(history);
      } catch (e) {
        logLine(job, 'model error: ' + e.message, 'err');
        setStatus(job, 'error');
        job.error = e.message;
        break;
      }
      lastText = String(response || '');
      history.push({ role: 'assistant', content: lastText });

      var tools = parseTools(lastText, role.tools);
      if (!tools.length) {
        // Done — no more tools
        break;
      }
      var toolBlock = '';
      for (var t = 0; t < tools.length; t++) {
        logLine(job, '[[' + tools[t].name + ': ' + tools[t].arg.slice(0, 60) + ']]', 'tool');
        if (typeof g.pushCodeToolCard === 'function') {
          try {
            g.pushCodeToolCard(tools[t].name, 'running', tools[t].arg);
          } catch (e2) {}
        }
        var result = await runTool(tools[t].name, tools[t].arg);
        logLine(job, '→ ' + result.slice(0, 120), /error|ok=false/i.test(result) ? 'err' : 'ok');
        toolBlock += '[' + tools[t].name + ']\n' + result + '\n\n';
      }
      history.push({ role: 'user', content: 'Tool results:\n' + toolBlock + '\nContinue or finish with a clear summary.' });
    }

    // Strip tool call markup for final display
    var clean = lastText
      .replace(/\[\[(?:fs_write|fs_patch|search_replace|write_file):[\s\S]*?\]\]/gi, '')
      .replace(/\[\[\w+:\s*[^\]]*\]\]/g, '')
      .trim();
    job.result = clean || lastText;
    setResult(job, '### ' + role.label + ' result\n\n' + job.result);
    if (job.status === 'running') setStatus(job, 'done');
    if (typeof g.setCodeSessionStatus === 'function') {
      g.setCodeSessionStatus('idle', 'Plan → Patch → Verify');
    }
    if (g.AETHER_Kernel) {
      g.AETHER_Kernel.log('subagent.' + job.role, job.goal.slice(0, 80), 'call', { ok: job.status === 'done' });
    }
    if (g.AETHER_ThreadGraph) {
      try {
        g.AETHER_ThreadGraph.addNode({
          type: 'agent',
          label: role.label + ': ' + job.goal.slice(0, 40),
          meta: { subagent: job.id, role: job.role },
        });
      } catch (e3) {}
    }
    if (g.showNotification) {
      g.showNotification(role.label + ' agent ' + job.status, job.status === 'done' ? 'success' : 'warn');
    }
    return job;
  }

  async function spawn(opts) {
    opts = opts || {};
    var role = (opts.role || 'explore').toLowerCase();
    if (!ROLES[role]) role = 'explore';
    var goal = String(opts.goal || '').trim();
    if (!goal) {
      if (g.showNotification) g.showNotification('Subagent needs a goal', 'warn');
      return null;
    }
    var job = {
      id: uid(),
      role: role,
      goal: goal,
      status: 'queued',
      maxSteps: opts.maxSteps || MAX_STEPS,
      t: Date.now(),
      abort: false,
      result: '',
    };
    _jobs.unshift(job);
    _jobs = _jobs.slice(0, 20);
    await runJob(job);
    return job;
  }

  /**
   * Parallel explore: multiple angles at once, then merge findings.
   */
  async function parallelExplore(goal, opts) {
    opts = opts || {};
    var angles = opts.angles || [
      'Map entry points, main modules, and config related to: ' + goal,
      'Find tests, types, and edge cases related to: ' + goal,
      'Search for TODOs, bugs, security risks, and related symbols for: ' + goal,
    ];
    if (g.showNotification) {
      g.showNotification('Parallel explore ×' + angles.length, 'info');
    }
    var jobs = await Promise.all(
      angles.map(function (a, i) {
        return spawn({
          role: 'explore',
          goal: '[angle ' + (i + 1) + '/' + angles.length + '] ' + a,
          maxSteps: opts.exploreSteps || 4,
        });
      })
    );
    var merged = jobs
      .filter(Boolean)
      .map(function (j, i) {
        return '### Explore angle ' + (i + 1) + '\n' + (j.result || '(empty)');
      })
      .join('\n\n');
    return { jobs: jobs, merged: merged };
  }

  /**
   * Swarm: explore → plan → (optional) edit
   * opts.parallel = true → 3 explore agents in parallel first
   * opts.autoPr = true → open change set after edit
   */
  async function swarm(goal, opts) {
    opts = opts || {};
    if (_running) {
      if (g.showNotification) g.showNotification('A swarm is already running', 'warn');
      return null;
    }
    _running = true;
    goal = String(goal || '').trim();
    if (!goal) {
      _running = false;
      return null;
    }
    var mode = opts.parallel ? 'parallel-explore → plan' : 'explore → plan';
    if (g.showNotification) {
      g.showNotification('Swarm: ' + mode + (opts.edit ? ' → edit' : ''), 'info');
    }
    try {
      var findings = '';
      var ex = null;
      var parallel = null;
      if (opts.parallel) {
        parallel = await parallelExplore(goal, opts);
        findings = parallel.merged || '';
      } else {
        ex = await spawn({ role: 'explore', goal: goal, maxSteps: opts.exploreSteps || 5 });
        findings = (ex && ex.result) || '';
      }
      var planGoal = goal + '\n\nFindings from explore:\n' + findings.slice(0, 4000);
      var pl = await spawn({ role: 'plan', goal: planGoal, maxSteps: opts.planSteps || 4 });
      var ed = null;
      if (opts.edit) {
        var editGoal =
          goal +
          '\n\nApproved plan:\n' +
          (pl && pl.result ? pl.result.slice(0, 2500) : '') +
          '\n\nExecute the plan with fs_patch. Prefer surgical edits.';
        ed = await spawn({ role: 'edit', goal: editGoal, maxSteps: opts.editSteps || 6 });
        if (opts.autoPr !== false && g.AETHER_ChangeSet && g.AETHER_ChangeSet.createFromPending) {
          try {
            g.AETHER_ChangeSet.createFromPending({
              title: 'feat: ' + goal.slice(0, 72),
              body: '## Swarm edit\n\n' + goal + '\n\n### Plan\n' + ((pl && pl.result) || '').slice(0, 1500),
            });
          } catch (ePr) {}
        }
      }
      // Optional review pass
      if (opts.review && ed) {
        await spawn({
          role: 'review',
          goal: 'Review changes for: ' + goal + '\n\nPlan:\n' + ((pl && pl.result) || '').slice(0, 1500),
          maxSteps: 3,
        });
      }
      return { explore: ex, parallel: parallel, plan: pl, edit: ed };
    } finally {
      _running = false;
      try {
        if (g.AETHER_GitLite && g.AETHER_GitLite.refreshChip) g.AETHER_GitLite.refreshChip();
      } catch (e2) {}
    }
  }

  function listJobs() {
    return _jobs.slice();
  }

  function isRunning() {
    return _running;
  }

  function abortAll() {
    _jobs.forEach(function (j) {
      if (j.status === 'running' || j.status === 'queued') j.abort = true;
    });
    _running = false;
  }

  g.AETHER_Subagents = {
    ROLES: ROLES,
    spawn: spawn,
    swarm: swarm,
    parallelExplore: parallelExplore,
    listJobs: listJobs,
    isRunning: isRunning,
    abortAll: abortAll,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
