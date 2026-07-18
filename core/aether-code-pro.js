/**
 * AETHER Code Pro — competitive agent features (zero-backend)
 *
 * Checkpoints · @mentions · change-sets · verify · session memory · blast radius
 * Loaded after ghost-commits.js; wired by script.js via window.AETHER_CodePro
 */
(function (g) {
  'use strict';

  var CP_KEY = 'aether_code_checkpoints_v1';
  var MEM_KEY = 'aether_code_memory_v1';
  var TOUCH_KEY = 'aether_code_touched_v1';
  var MAX_CHECKPOINTS = 12;
  var MAX_FILE_BYTES = 400000;

  var _mentionEl = null;
  var _mentionItems = [];
  var _mentionIdx = 0;
  var _barEl = null;
  var _autoVerify = false;

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function loadJSON(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch (e) {
      return fallback;
    }
  }

  function saveJSON(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {}
  }

  // ═══════════════════════════════════════════════════════════
  // CHECKPOINTS — pre-agent undo (Cursor-class)
  // ═══════════════════════════════════════════════════════════

  function listCheckpoints() {
    return loadJSON(CP_KEY, []);
  }

  async function snapshotPaths(paths, label) {
    paths = (paths || []).filter(Boolean);
    if (!paths.length) return null;
    var files = {};
    var i;
    for (i = 0; i < paths.length; i++) {
      var p = paths[i];
      try {
        if (typeof g.fsFolderRead === 'function') {
          var t = await g.fsFolderRead(p);
          if (t && !String(t).startsWith('fs_read error') && !String(t).startsWith('No folder') && !String(t).startsWith('Folder "')) {
            if (String(t).length <= MAX_FILE_BYTES) files[p] = String(t);
          }
        }
      } catch (e) {}
    }
    if (!Object.keys(files).length) return null;
    var cp = {
      id: 'cp_' + Date.now().toString(36),
      t: Date.now(),
      label: label || 'checkpoint',
      files: files,
      paths: Object.keys(files),
    };
    var list = listCheckpoints();
    list.unshift(cp);
    saveJSON(CP_KEY, list.slice(0, MAX_CHECKPOINTS));
    touchPaths(Object.keys(files));
    if (g.showNotification) {
      g.showNotification('Checkpoint: ' + cp.paths.length + ' file(s) — ' + cp.label, 'info');
    }
    renderBar();
    return cp;
  }

  async function checkpointFromGhost(item) {
    if (!item || !item.path) return null;
    var before = item.before != null ? String(item.before) : '';
    // Prefer snapshotting the pre-edit content even if read fails later
    var files = {};
    files[item.path] = before;
    var cp = {
      id: 'cp_' + Date.now().toString(36),
      t: Date.now(),
      label: 'pre-ghost ' + item.path,
      files: files,
      paths: [item.path],
      ghostId: item.id,
    };
    var list = listCheckpoints();
    // Dedup rapid same-path checkpoints within 2s
    if (list[0] && list[0].paths && list[0].paths[0] === item.path && Date.now() - list[0].t < 2000) {
      list[0] = cp;
    } else {
      list.unshift(cp);
    }
    saveJSON(CP_KEY, list.slice(0, MAX_CHECKPOINTS));
    touchPaths([item.path]);
    renderBar();
    return cp;
  }

  async function restoreCheckpoint(id) {
    var list = listCheckpoints();
    var cp = list.find(function (x) {
      return x.id === id;
    });
    if (!cp) {
      if (g.showNotification) g.showNotification('Checkpoint not found', 'error');
      return { ok: false };
    }
    var writer =
      typeof g.__aetherForceWrite === 'function'
        ? g.__aetherForceWrite
        : async function (path, content) {
            if (typeof g.fsFolderWrite === 'function') return g.fsFolderWrite(path + '\n' + content);
            throw new Error('No writer');
          };
    var restored = 0;
    var paths = Object.keys(cp.files || {});
    for (var i = 0; i < paths.length; i++) {
      try {
        await writer(paths[i], cp.files[paths[i]]);
        restored++;
        if (typeof g.__aetherSyncEditorAfterGhost === 'function') {
          g.__aetherSyncEditorAfterGhost(paths[i], cp.files[paths[i]]);
        }
      } catch (e) {}
    }
    if (g.showNotification) {
      g.showNotification('Restored ' + restored + ' file(s) from checkpoint', restored ? 'success' : 'error');
    }
    if (g.AETHER_Kernel) g.AETHER_Kernel.log('code.restore', cp.id, 'write', { ok: restored > 0, n: restored });
    renderBar();
    return { ok: restored > 0, restored: restored };
  }

  async function restoreLatest() {
    var list = listCheckpoints();
    if (!list.length) {
      if (g.showNotification) g.showNotification('No checkpoints yet', 'warn');
      return { ok: false };
    }
    return restoreCheckpoint(list[0].id);
  }

  // ═══════════════════════════════════════════════════════════
  // BLAST RADIUS — files touched this CODE session
  // ═══════════════════════════════════════════════════════════

  function touchPaths(paths) {
    var set = loadJSON(TOUCH_KEY, {});
    (paths || []).forEach(function (p) {
      set[p] = Date.now();
    });
    saveJSON(TOUCH_KEY, set);
    renderBar();
  }

  function getTouched() {
    var set = loadJSON(TOUCH_KEY, {});
    return Object.keys(set).sort(function (a, b) {
      return set[b] - set[a];
    });
  }

  function clearTouched() {
    saveJSON(TOUCH_KEY, {});
    renderBar();
  }

  // ═══════════════════════════════════════════════════════════
  // SESSION MEMORY — sticky CODE notes (project brain)
  // ═══════════════════════════════════════════════════════════

  function getMemory() {
    return loadJSON(MEM_KEY, { notes: [], rules: '' });
  }

  function addMemory(note) {
    note = String(note || '').trim();
    if (!note) return;
    var m = getMemory();
    m.notes = m.notes || [];
    m.notes.unshift({ t: Date.now(), text: note.slice(0, 500) });
    m.notes = m.notes.slice(0, 40);
    saveJSON(MEM_KEY, m);
    if (g.showNotification) g.showNotification('CODE memory saved', 'success');
  }

  function setRules(rules) {
    var m = getMemory();
    m.rules = String(rules || '').slice(0, 2000);
    saveJSON(MEM_KEY, m);
  }

  function memoryForPrompt() {
    var m = getMemory();
    var parts = [];
    if (m.rules) parts.push('## CODE Session Rules\n' + m.rules);
    if (m.notes && m.notes.length) {
      parts.push(
        '## CODE Working Memory (recent)\n' +
          m.notes
            .slice(0, 8)
            .map(function (n) {
              return '- ' + n.text;
            })
            .join('\n')
      );
    }
    var touched = getTouched();
    if (touched.length) {
      parts.push('## Blast radius (files touched this session)\n' + touched.slice(0, 30).map(function (p) {
        return '- ' + p;
      }).join('\n'));
    }
    return parts.length ? '\n' + parts.join('\n') + '\n' : '';
  }

  // ═══════════════════════════════════════════════════════════
  // CHANGE SET — Accept/Reject all ghosts + verify
  // ═══════════════════════════════════════════════════════════

  function pendingGhosts() {
    if (!g.AETHER_Ghost || !g.AETHER_Ghost.loadQueue) return [];
    return g.AETHER_Ghost.loadQueue().filter(function (x) {
      return x.status === 'pending';
    });
  }

  async function acceptAllGhosts() {
    var pend = pendingGhosts();
    if (!pend.length) {
      if (g.showNotification) g.showNotification('No pending ghosts', 'info');
      return { ok: true, n: 0 };
    }
    // Checkpoint first
    await snapshotPaths(
      pend.map(function (p) {
        return p.path;
      }),
      'pre-accept-all'
    );
    var n = 0;
    for (var i = 0; i < pend.length; i++) {
      try {
        var r = await g.AETHER_Ghost.accept(pend[i].id);
        if (r && r.ok) n++;
      } catch (e) {}
    }
    if (g.showNotification) g.showNotification('Accepted ' + n + '/' + pend.length + ' ghosts', 'success');
    if (_autoVerify) await runVerify();
    renderBar();
    return { ok: true, n: n };
  }

  function rejectAllGhosts() {
    var pend = pendingGhosts();
    pend.forEach(function (p) {
      try {
        g.AETHER_Ghost.reject(p.id);
      } catch (e) {}
    });
    if (g.showNotification) g.showNotification('Rejected ' + pend.length + ' ghost(s)', 'warn');
    renderBar();
  }

  async function runVerify(cmd) {
    cmd = (cmd || '').trim();
    if (!cmd) {
      // Heuristics: package.json scripts, pytest, cargo, go
      try {
        if (typeof g.fsFolderRead === 'function') {
          var pkg = await g.fsFolderRead('package.json');
          if (pkg && pkg[0] === '{') {
            var j = JSON.parse(pkg);
            if (j.scripts) {
              if (j.scripts.test) cmd = 'npm test';
              else if (j.scripts.lint) cmd = 'npm run lint';
              else if (j.scripts.check) cmd = 'npm run check';
            }
          }
        }
      } catch (e) {}
      if (!cmd) {
        try {
          var exists = typeof g.fsFolderExists === 'function' ? await g.fsFolderExists('pytest.ini') : 'false';
          if (String(exists).indexOf('true') === 0) cmd = 'python -m pytest -q';
        } catch (e2) {}
      }
      if (!cmd) cmd = 'ls';
    }
    if (g.showNotification) g.showNotification('Verify: ' + cmd, 'info');
    if (typeof g.setCodeSessionStatus === 'function') g.setCodeSessionStatus('shell', 'verify…');
    var result = '';
    try {
      // Prefer puter terminal if available for real shell; else browser shell
      if (g.TOOL_REGISTRY && g.TOOL_REGISTRY.puter_terminal && g.TOOL_REGISTRY.puter_terminal.fn) {
        result = await g.TOOL_REGISTRY.puter_terminal.fn(cmd);
      } else if (typeof g.fsFolderShell === 'function') {
        // Browser FS shell is limited — still useful for ls/grep style checks
        result = await g.fsFolderShell(cmd);
      } else {
        result = 'No shell available for verify';
      }
    } catch (e) {
      result = 'Verify error: ' + e.message;
    }
    // Surface in terminal panel + chat
    try {
      var termBody = document.getElementById('coding-terminal-body');
      if (termBody) {
        var line = document.createElement('div');
        line.className = 'coding-terminal-line';
        line.innerHTML = '<span style="color:#ffd700">verify$</span> ' + esc(cmd);
        termBody.appendChild(line);
        var out = document.createElement('div');
        out.className = 'coding-terminal-line ' + (/error|fail|Error/i.test(result) ? 'error' : 'success');
        out.textContent = String(result).slice(0, 4000);
        termBody.appendChild(out);
        termBody.scrollTop = termBody.scrollHeight;
      }
    } catch (e3) {}
    if (typeof g.addSystemMessage === 'function') {
      g.addSystemMessage('**Verify** `' + cmd + '`\n\n```\n' + String(result).slice(0, 3000) + '\n```');
    } else if (g.showNotification) {
      g.showNotification(String(result).slice(0, 120), /error|fail/i.test(result) ? 'error' : 'success');
    }
    if (g.AETHER_Kernel) g.AETHER_Kernel.log('code.verify', cmd, 'exec', { ok: !/error|fail/i.test(String(result)) });
    return result;
  }

  function reviewPrompt() {
    var pend = pendingGhosts();
    if (!pend.length) {
      if (g.showNotification) g.showNotification('No pending patches to review', 'info');
      return;
    }
    var body =
      'Review these pending AETHER Ghost patches as a senior engineer. ' +
      'For each file: risk, correctness, better approach, and Accept/Reject recommendation.\n\n';
    pend.slice(0, 12).forEach(function (p) {
      body += '### ' + p.path + ' (+' + (p.stats && p.stats.adds) + '/-' + (p.stats && p.stats.dels) + ')\n';
      if (p.kind === 'patch' && p.old_string != null) {
        body += '```diff\n- ' + String(p.old_string).slice(0, 400).split('\n').join('\n- ') + '\n+ ' + String(p.new_string || '').slice(0, 400).split('\n').join('\n+ ') + '\n```\n';
      } else if (g.AETHER_Ghost && g.AETHER_Ghost.unifiedDiff) {
        body += '```diff\n' + g.AETHER_Ghost.unifiedDiff(p.before, p.after, 40) + '\n```\n';
      }
    });
    var inp = document.getElementById('user-input');
    if (inp) {
      inp.value = body;
      inp.dispatchEvent(new Event('input'));
      inp.focus();
      if (g.showNotification) g.showNotification('Review prompt loaded — press Send', 'info');
    }
  }

  // ═══════════════════════════════════════════════════════════
  // @ MENTIONS — @file · @symbol · @blast
  // ═══════════════════════════════════════════════════════════

  function collectFilePaths() {
    var paths = [];
    try {
      var items = document.querySelectorAll('.coding-tree-item:not(.dir)');
      items.forEach(function (el) {
        if (el.title) paths.push(el.title);
      });
    } catch (e) {}
    // symbols index
    try {
      if (g._symbolIndex && g._symbolIndex.length) {
        g._symbolIndex.slice(0, 200).forEach(function (s) {
          if (s.file && paths.indexOf(s.file) === -1) paths.push(s.file);
        });
      }
    } catch (e2) {}
    getTouched().forEach(function (p) {
      if (paths.indexOf(p) === -1) paths.push(p);
    });
    return paths;
  }

  function collectSymbols(q) {
    var out = [];
    try {
      var idx = g._symbolIndex || [];
      q = (q || '').toLowerCase();
      for (var i = 0; i < idx.length && out.length < 30; i++) {
        if (!q || idx[i].name.toLowerCase().indexOf(q) !== -1) {
          out.push({ type: 'symbol', label: idx[i].name, meta: idx[i].file, insert: '@' + idx[i].name, file: idx[i].file });
        }
      }
    } catch (e) {}
    return out;
  }

  function hideMentions() {
    if (_mentionEl) {
      _mentionEl.style.display = 'none';
      _mentionEl.innerHTML = '';
    }
    _mentionItems = [];
    _mentionIdx = 0;
  }

  function showMentions(query, inputEl) {
    query = (query || '').toLowerCase();
    var items = [];
    // special tokens
    if (!query || 'blast'.indexOf(query) === 0) {
      items.push({ type: 'special', label: 'blast', meta: 'files touched this session', insert: '@blast ' });
    }
    if (!query || 'memory'.indexOf(query) === 0) {
      items.push({ type: 'special', label: 'memory', meta: 'inject CODE session memory', insert: '@memory ' });
    }
    if (!query || 'plan'.indexOf(query) === 0) {
      items.push({ type: 'special', label: 'plan', meta: 'force plan-only turn', insert: '@plan ' });
    }
    // files
    collectFilePaths().forEach(function (p) {
      var base = p.split('/').pop().toLowerCase();
      if (!query || p.toLowerCase().indexOf(query) !== -1 || base.indexOf(query) !== -1) {
        items.push({ type: 'file', label: p, meta: 'file', insert: '@' + p + ' ', file: p });
      }
    });
    // symbols
    collectSymbols(query).forEach(function (s) {
      items.push(s);
    });
    items = items.slice(0, 40);
    _mentionItems = items;
    _mentionIdx = 0;
    if (!items.length) {
      hideMentions();
      return;
    }
    if (!_mentionEl) {
      _mentionEl = document.createElement('div');
      _mentionEl.id = 'code-mention-palette';
      _mentionEl.className = 'code-mention-palette';
      document.body.appendChild(_mentionEl);
    }
    _mentionEl.innerHTML = items
      .map(function (it, i) {
        return (
          '<div class="code-mention-item' +
          (i === 0 ? ' active' : '') +
          '" data-i="' +
          i +
          '"><span class="cm-type">' +
          esc(it.type) +
          '</span><span class="cm-label">' +
          esc(it.label) +
          '</span><span class="cm-meta">' +
          esc(it.meta || '') +
          '</span></div>'
        );
      })
      .join('');
    // position above input
    try {
      var rect = inputEl.getBoundingClientRect();
      _mentionEl.style.display = 'block';
      _mentionEl.style.left = Math.max(8, rect.left) + 'px';
      _mentionEl.style.width = Math.min(rect.width, 480) + 'px';
      _mentionEl.style.bottom = window.innerHeight - rect.top + 6 + 'px';
    } catch (e) {
      _mentionEl.style.display = 'block';
    }
    _mentionEl.querySelectorAll('.code-mention-item').forEach(function (el) {
      el.onmousedown = function (ev) {
        ev.preventDefault();
        pickMention(parseInt(el.getAttribute('data-i'), 10), inputEl);
      };
    });
  }

  function pickMention(i, inputEl) {
    var it = _mentionItems[i];
    if (!it || !inputEl) return;
    var v = inputEl.value;
    var caret = inputEl.selectionStart || v.length;
    var before = v.slice(0, caret);
    var after = v.slice(caret);
    var at = before.lastIndexOf('@');
    if (at === -1) return;
    inputEl.value = before.slice(0, at) + it.insert + after;
    var pos = (before.slice(0, at) + it.insert).length;
    inputEl.selectionStart = inputEl.selectionEnd = pos;
    inputEl.dispatchEvent(new Event('input'));
    hideMentions();
    // Prefetch file into a pin chip for context expansion on send
    if (it.file) pinContext(it.file);
  }

  var _pinned = [];

  function pinContext(path) {
    if (!path) return;
    if (_pinned.indexOf(path) === -1) _pinned.unshift(path);
    _pinned = _pinned.slice(0, 12);
    renderPins();
  }

  function clearPins() {
    _pinned = [];
    renderPins();
  }

  function renderPins() {
    var host = document.getElementById('code-context-pins');
    if (!host) return;
    if (!_pinned.length) {
      host.innerHTML = '';
      host.style.display = 'none';
      return;
    }
    host.style.display = 'flex';
    host.innerHTML =
      _pinned
        .map(function (p) {
          return '<span class="code-pin" data-path="' + esc(p) + '" title="Pinned context">@' + esc(p.split('/').pop()) + ' <b>×</b></span>';
        })
        .join('') + '<button type="button" class="code-pin-clear" id="code-pin-clear">clear</button>';
    host.querySelectorAll('.code-pin').forEach(function (el) {
      el.onclick = function (e) {
        if (e.target.tagName === 'B' || e.target.closest('b')) {
          _pinned = _pinned.filter(function (p) {
            return p !== el.getAttribute('data-path');
          });
          renderPins();
        }
      };
    });
    var clr = document.getElementById('code-pin-clear');
    if (clr) clr.onclick = clearPins;
  }

  async function expandMentionsInMessage(msg) {
    // Expand @path, @blast, @memory into system-visible context block
    var extra = [];
    var text = String(msg || '');
    // @blast
    if (/@blast\b/i.test(text)) {
      var touched = getTouched();
      extra.push('[@blast files]\n' + (touched.length ? touched.join('\n') : '(none yet)'));
      text = text.replace(/@blast\b/gi, '').trim();
    }
    if (/@memory\b/i.test(text)) {
      extra.push(memoryForPrompt() || '(no CODE memory)');
      text = text.replace(/@memory\b/gi, '').trim();
    }
    if (/@plan\b/i.test(text)) {
      extra.push('[MODE] Plan only — output <aether:plan> and wait. Do not write or patch files this turn.');
      text = text.replace(/@plan\b/gi, '').trim();
    }
    // @file paths
    var fileRe = /@([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)/g;
    var m;
    var seen = {};
    while ((m = fileRe.exec(msg)) !== null) {
      var fp = m[1];
      if (seen[fp]) continue;
      seen[fp] = true;
      pinContext(fp);
      try {
        if (typeof g.fsFolderRead === 'function') {
          var content = await g.fsFolderRead(fp);
          if (content && !String(content).startsWith('fs_read error')) {
            extra.push('[file @' + fp + ']\n```\n' + String(content).slice(0, 6000) + '\n```');
          }
        }
      } catch (e) {}
    }
    // pinned files not already expanded
    for (var i = 0; i < _pinned.length; i++) {
      var p = _pinned[i];
      if (seen[p]) continue;
      seen[p] = true;
      try {
        if (typeof g.fsFolderRead === 'function') {
          var c2 = await g.fsFolderRead(p);
          if (c2 && !String(c2).startsWith('fs_read error')) {
            extra.push('[pinned @' + p + ']\n```\n' + String(c2).slice(0, 6000) + '\n```');
          }
        }
      } catch (e2) {}
    }
    // symbol names @Foo → open matching symbol file snippet
    try {
      var idx = g._symbolIndex || [];
      var symRe = /@([A-Za-z_][A-Za-z0-9_]{1,60})\b/g;
      var sm;
      while ((sm = symRe.exec(msg)) !== null) {
        var name = sm[1];
        if (seen['sym:' + name]) continue;
        var hit = idx.find(function (s) {
          return s.name === name;
        });
        if (hit) {
          seen['sym:' + name] = true;
          extra.push('[symbol @' + name + ' in ' + hit.file + ']\n`' + hit.line + '`');
        }
      }
    } catch (e3) {}

    return {
      userText: text,
      contextBlock: extra.length ? '\n\n---\nAETHER CODE CONTEXT\n' + extra.join('\n\n') + '\n---\n' : '',
    };
  }

  function wireMentions(inputEl) {
    if (!inputEl || inputEl._codeMentionsBound) return;
    inputEl._codeMentionsBound = true;
    inputEl.addEventListener('input', function () {
      if (!(g.state && g.state.codingMode) && !(document.body && document.body.classList.contains('coding-mode'))) {
        hideMentions();
        return;
      }
      var caret = inputEl.selectionStart || 0;
      var before = inputEl.value.slice(0, caret);
      var m = before.match(/@([A-Za-z0-9_./-]*)$/);
      if (m) showMentions(m[1], inputEl);
      else hideMentions();
    });
    inputEl.addEventListener('keydown', function (e) {
      if (!_mentionEl || _mentionEl.style.display === 'none' || !_mentionItems.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        _mentionIdx = Math.min(_mentionIdx + 1, _mentionItems.length - 1);
        paintMentionActive();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _mentionIdx = Math.max(_mentionIdx - 1, 0);
        paintMentionActive();
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pickMention(_mentionIdx, inputEl);
      } else if (e.key === 'Escape') {
        hideMentions();
      }
    });
  }

  function paintMentionActive() {
    if (!_mentionEl) return;
    _mentionEl.querySelectorAll('.code-mention-item').forEach(function (el, i) {
      el.classList.toggle('active', i === _mentionIdx);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // CHANGE-SET BAR UI
  // ═══════════════════════════════════════════════════════════

  function ensureBar() {
    if (_barEl && document.body.contains(_barEl)) return _barEl;
    _barEl = document.getElementById('code-pro-bar');
    if (_barEl) return _barEl;
    _barEl = document.createElement('div');
    _barEl.id = 'code-pro-bar';
    _barEl.className = 'code-pro-bar';
    var rail = document.getElementById('code-session-rail');
    if (rail && rail.parentNode) {
      rail.parentNode.insertBefore(_barEl, rail.nextSibling);
    } else {
      document.body.appendChild(_barEl);
    }
    return _barEl;
  }

  function renderBar() {
    var on =
      (g.state && g.state.codingMode) ||
      (document.body && document.body.classList.contains('coding-mode'));
    var bar = ensureBar();
    if (!on) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'flex';
    var pend = pendingGhosts().length;
    var cps = listCheckpoints().length;
    var touched = getTouched().length;
    bar.innerHTML =
      '<div class="code-pro-left">' +
      '<span class="code-pro-chip" title="Pending ghost patches">👻 ' +
      pend +
      '</span>' +
      '<span class="code-pro-chip" title="Checkpoints">⏪ ' +
      cps +
      '</span>' +
      '<span class="code-pro-chip" title="Blast radius">💥 ' +
      touched +
      '</span>' +
      '<label class="code-pro-verify-toggle" title="Auto-run verify after Accept all">' +
      '<input type="checkbox" id="code-auto-verify"' +
      (_autoVerify ? ' checked' : '') +
      '> auto-verify</label>' +
      '</div>' +
      '<div class="code-pro-actions">' +
      '<button type="button" class="code-rail-btn" id="cp-checkpoint" title="Snapshot linked files about to change">Checkpoint</button>' +
      '<button type="button" class="code-rail-btn" id="cp-restore" title="Restore latest checkpoint">Restore</button>' +
      '<button type="button" class="code-rail-btn" id="cp-accept-all" title="Accept all ghosts">Accept all</button>' +
      '<button type="button" class="code-rail-btn" id="cp-reject-all" title="Reject all ghosts">Reject all</button>' +
      '<button type="button" class="code-rail-btn" id="cp-review" title="Load AI review prompt">Review</button>' +
      '<button type="button" class="code-rail-btn" id="cp-verify" title="Run tests / verify">Verify</button>' +
      '<button type="button" class="code-rail-btn" id="cp-blast" title="Show blast radius">Blast</button>' +
      '<button type="button" class="code-rail-btn" id="cp-pr" title="Group ghosts into a PR-style change set">PR</button>' +
      '<button type="button" class="code-rail-btn" id="cp-swarm" title="Launch explore→plan swarm">Swarm</button>' +
      '</div>';

    var av = document.getElementById('code-auto-verify');
    if (av) {
      av.onchange = function () {
        _autoVerify = !!av.checked;
        try {
          localStorage.setItem('aether_code_auto_verify', _autoVerify ? '1' : '0');
        } catch (e) {}
      };
    }
    var b1 = document.getElementById('cp-checkpoint');
    if (b1)
      b1.onclick = async function () {
        var paths = pendingGhosts().map(function (p) {
          return p.path;
        });
        if (!paths.length) paths = getTouched().slice(0, 20);
        if (!paths.length && typeof g.fsFolderShell === 'function') {
          // snapshot common roots
          paths = ['package.json', 'README.md', 'AETHER.md'];
        }
        await snapshotPaths(paths, 'manual');
      };
    var b2 = document.getElementById('cp-restore');
    if (b2) b2.onclick = function () {
      restoreLatest();
    };
    var b3 = document.getElementById('cp-accept-all');
    if (b3) b3.onclick = function () {
      acceptAllGhosts();
    };
    var b4 = document.getElementById('cp-reject-all');
    if (b4) b4.onclick = function () {
      rejectAllGhosts();
    };
    var b5 = document.getElementById('cp-review');
    if (b5) b5.onclick = reviewPrompt;
    var b6 = document.getElementById('cp-verify');
    if (b6) b6.onclick = function () {
      runVerify();
    };
    var b7 = document.getElementById('cp-blast');
    if (b7)
      b7.onclick = function () {
        var t = getTouched();
        if (typeof g.addSystemMessage === 'function') {
          g.addSystemMessage(
            '**Blast radius** — ' +
              t.length +
              ' file(s)\n\n' +
              (t.length ? t.map(function (p) {
                return '- `' + p + '`';
              }).join('\n') : '_Nothing touched yet_')
          );
        } else if (g.showNotification) {
          g.showNotification(t.length + ' files in blast radius', 'info');
        }
      };
    var b8 = document.getElementById('cp-pr');
    if (b8)
      b8.onclick = function () {
        if (g.AETHER_ChangeSet) g.AETHER_ChangeSet.createFromPending();
        else if (g.showNotification) g.showNotification('Change sets offline', 'warn');
      };
    var b9 = document.getElementById('cp-swarm');
    if (b9)
      b9.onclick = function () {
        var goal = window.prompt('Swarm goal (parallel explore → plan). Add " --edit" to patch:', '');
        if (!goal) return;
        var edit = /\s--edit\b/i.test(goal);
        goal = goal.replace(/\s--edit\b/i, '').trim();
        if (g.AETHER_Subagents) {
          g.AETHER_Subagents.swarm(goal, { edit: edit, parallel: true, autoPr: edit });
        } else if (g.showNotification) g.showNotification('Subagents offline', 'warn');
      };
  }

  // Hook ghost propose → auto checkpoint of before
  function installGhostHook() {
    if (!g.AETHER_Ghost || g.AETHER_Ghost._codeProHooked) return;
    var orig = g.AETHER_Ghost.propose;
    if (typeof orig !== 'function') return;
    g.AETHER_Ghost.propose = function (spec) {
      var item = orig.call(g.AETHER_Ghost, spec);
      try {
        checkpointFromGhost(item);
      } catch (e) {}
      try {
        renderBar();
      } catch (e2) {}
      return item;
    };
    g.AETHER_Ghost._codeProHooked = true;
  }

  function init() {
    try {
      _autoVerify = localStorage.getItem('aether_code_auto_verify') === '1';
    } catch (e) {}
    installGhostHook();
    // retry hook if ghost loads late
    setTimeout(installGhostHook, 500);
    setTimeout(installGhostHook, 1500);
    var input = document.getElementById('user-input');
    if (input) wireMentions(input);
    // context pins host
    if (!document.getElementById('code-context-pins')) {
      var pins = document.createElement('div');
      pins.id = 'code-context-pins';
      pins.className = 'code-context-pins';
      pins.style.display = 'none';
      var deck = document.querySelector('.input-deck');
      if (deck) deck.insertBefore(pins, deck.firstChild);
      else document.body.appendChild(pins);
    }
    renderBar();
    // observe coding mode
    var obs = new MutationObserver(function () {
      renderBar();
      installGhostHook();
    });
    if (document.body) obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  g.AETHER_CodePro = {
    init: init,
    snapshotPaths: snapshotPaths,
    restoreCheckpoint: restoreCheckpoint,
    restoreLatest: restoreLatest,
    listCheckpoints: listCheckpoints,
    acceptAllGhosts: acceptAllGhosts,
    rejectAllGhosts: rejectAllGhosts,
    runVerify: runVerify,
    reviewPrompt: reviewPrompt,
    getMemory: getMemory,
    addMemory: addMemory,
    setRules: setRules,
    memoryForPrompt: memoryForPrompt,
    getTouched: getTouched,
    touchPaths: touchPaths,
    clearTouched: clearTouched,
    expandMentionsInMessage: expandMentionsInMessage,
    pinContext: pinContext,
    clearPins: clearPins,
    wireMentions: wireMentions,
    renderBar: renderBar,
    installGhostHook: installGhostHook,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(init, 400);
    });
  } else {
    setTimeout(init, 400);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
