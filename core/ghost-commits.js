/**
 * AETHER Ghost Commits — Accept/Reject file change cards (coding mode)
 * Supports full-file proposals, surgical patches, and per-hunk accept/reject.
 * Emits live gutter events for the open editor.
 */
(function (g) {
  'use strict';

  var QUEUE_KEY = 'aether_ghost_commits_v1';
  var _host = null;
  var _preferredHost = null;

  function loadQueue() {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveQueue(q) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(0, 50)));
    } catch (e) {}
  }

  function uid(p) {
    return (p || 'h') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  function diffStats(a, b) {
    var o = String(a).split('\n');
    var n = String(b).split('\n');
    var adds = 0,
      dels = 0,
      oi = 0,
      ni = 0;
    while (oi < o.length || ni < n.length) {
      if (oi < o.length && ni < n.length && o[oi] === n[ni]) {
        oi++;
        ni++;
      } else if (ni < n.length && (oi >= o.length || n[ni] !== o[oi])) {
        adds++;
        ni++;
      } else if (oi < o.length) {
        dels++;
        oi++;
      }
    }
    return { adds: adds, dels: dels };
  }

  /**
   * Line-level ops for gutters: {type:'eq'|'add'|'del', text, oldLn, newLn}
   * Greedy walk — good enough for visual + hunk grouping.
   */
  function lineOps(before, after) {
    var o = String(before).split('\n');
    var n = String(after).split('\n');
    var ops = [];
    var oi = 0,
      ni = 0;
    while (oi < o.length || ni < n.length) {
      if (oi < o.length && ni < n.length && o[oi] === n[ni]) {
        ops.push({ type: 'eq', text: o[oi], oldLn: oi + 1, newLn: ni + 1 });
        oi++;
        ni++;
      } else if (ni < n.length && (oi >= o.length || n[ni] !== o[oi])) {
        // Lookahead: is this a replace (del then add)?
        if (oi < o.length && ni + 1 < n.length && o[oi] === n[ni + 1]) {
          ops.push({ type: 'add', text: n[ni], oldLn: null, newLn: ni + 1 });
          ni++;
        } else if (oi < o.length && (ni >= n.length || o[oi] !== n[ni])) {
          // Prefer delete if next old matches current new
          if (ni < n.length && oi + 1 < o.length && o[oi + 1] === n[ni]) {
            ops.push({ type: 'del', text: o[oi], oldLn: oi + 1, newLn: null });
            oi++;
          } else if (ni < n.length) {
            // simultaneous change — emit del then add
            ops.push({ type: 'del', text: o[oi], oldLn: oi + 1, newLn: null });
            ops.push({ type: 'add', text: n[ni], oldLn: null, newLn: ni + 1 });
            oi++;
            ni++;
          } else {
            ops.push({ type: 'del', text: o[oi], oldLn: oi + 1, newLn: null });
            oi++;
          }
        } else {
          ops.push({ type: 'add', text: n[ni], oldLn: null, newLn: ni + 1 });
          ni++;
        }
      } else if (oi < o.length) {
        ops.push({ type: 'del', text: o[oi], oldLn: oi + 1, newLn: null });
        oi++;
      }
    }
    return ops;
  }

  /**
   * Group consecutive non-eq ops into hunks with optional 1-line context.
   * Each hunk has oldText/newText for surgical re-apply.
   */
  function computeHunks(before, after) {
    before = String(before || '');
    after = String(after || '');
    if (before === after) return [];

    // Single surgical patch: one hunk
    var ops = lineOps(before, after);
    var hunks = [];
    var i = 0;
    var hIdx = 0;
    while (i < ops.length) {
      if (ops[i].type === 'eq') {
        i++;
        continue;
      }
      var start = i;
      while (i < ops.length && ops[i].type !== 'eq') i++;
      var end = i; // exclusive
      var oldLines = [];
      var newLines = [];
      var oldStart = null;
      var newStart = null;
      var j;
      for (j = start; j < end; j++) {
        if (ops[j].type === 'del') {
          if (oldStart == null) oldStart = ops[j].oldLn;
          oldLines.push(ops[j].text);
        } else if (ops[j].type === 'add') {
          if (newStart == null) newStart = ops[j].newLn;
          newLines.push(ops[j].text);
        }
      }
      // 1-line context before/after for unique match when possible
      var pre = start > 0 && ops[start - 1].type === 'eq' ? ops[start - 1].text : null;
      var post = end < ops.length && ops[end].type === 'eq' ? ops[end].text : null;
      var oldCore = oldLines.join('\n');
      var newCore = newLines.join('\n');
      var oldText = oldCore;
      var newText = newCore;
      if (pre != null) {
        oldText = pre + (oldCore ? '\n' + oldCore : '');
        newText = pre + (newCore ? '\n' + newCore : '');
      }
      if (post != null) {
        oldText = oldText + (oldText ? '\n' : '') + post;
        newText = newText + (newText ? '\n' : '') + post;
      }
      // If no deletions (pure insert), anchor on pre/post only
      if (!oldLines.length && pre == null && post == null) {
        // pure insert at EOF or BOF — use surrounding slice from before/after
        oldText = '';
        newText = newCore;
      }
      var st = diffStats(oldCore, newCore);
      hunks.push({
        id: 'h' + hIdx++ + '_' + Math.random().toString(36).slice(2, 5),
        oldStart: oldStart,
        newStart: newStart,
        oldText: oldText,
        newText: newText,
        oldCore: oldCore,
        newCore: newCore,
        adds: st.adds,
        dels: st.dels,
        status: 'pending',
      });
    }
    // Fallback: whole file one hunk
    if (!hunks.length) {
      var full = diffStats(before, after);
      hunks.push({
        id: 'h0_full',
        oldStart: 1,
        newStart: 1,
        oldText: before,
        newText: after,
        oldCore: before,
        newCore: after,
        adds: full.adds,
        dels: full.dels,
        status: 'pending',
      });
    }
    return hunks;
  }

  function unifiedDiff(before, after, maxLines) {
    maxLines = maxLines || 80;
    var ops = lineOps(before, after);
    var lines = [];
    for (var i = 0; i < ops.length && lines.length < maxLines; i++) {
      if (ops[i].type === 'eq') {
        if (lines.length < 2) lines.push('  ' + ops[i].text);
      } else if (ops[i].type === 'add') {
        lines.push('+ ' + ops[i].text);
      } else {
        lines.push('- ' + ops[i].text);
      }
    }
    if (ops.length > maxLines) lines.push('  …');
    return lines.join('\n');
  }

  function hunkDiff(item, maxLines) {
    maxLines = maxLines || 40;
    if (item.old_string != null && item.new_string != null && item.kind === 'patch') {
      var o = String(item.old_string).split('\n');
      var n = String(item.new_string).split('\n');
      var lines = ['@@ patch hunk @@'];
      var i;
      for (i = 0; i < o.length && lines.length < maxLines; i++) lines.push('- ' + o[i]);
      for (i = 0; i < n.length && lines.length < maxLines; i++) lines.push('+ ' + n[i]);
      if (o.length + n.length + 1 > maxLines) lines.push('  …');
      return lines.join('\n');
    }
    return unifiedDiff(item.before, item.after, maxLines);
  }

  function emitGutter(item) {
    try {
      var detail = {
        id: item.id,
        path: item.path,
        before: item.before,
        after: item.after,
        hunks: item.hunks || [],
        ops: lineOps(item.before, item.after),
        status: item.status,
      };
      g.dispatchEvent && g.dispatchEvent(new CustomEvent('aether-ghost-gutter', { detail: detail }));
      document.dispatchEvent(new CustomEvent('aether-ghost-gutter', { detail: detail }));
      if (typeof g.__aetherApplyLiveGutter === 'function') {
        g.__aetherApplyLiveGutter(detail);
      }
    } catch (e) {}
  }

  function clearGutter(path) {
    try {
      var detail = { path: path, clear: true };
      document.dispatchEvent(new CustomEvent('aether-ghost-gutter', { detail: detail }));
      if (typeof g.__aetherApplyLiveGutter === 'function') {
        g.__aetherApplyLiveGutter(detail);
      }
    } catch (e) {}
  }

  /**
   * Propose a ghost commit (does not write until Accept).
   * @param {{path, before, after, source, message, kind, old_string, new_string, hunks}} spec
   */
  function propose(spec) {
    spec = spec || {};
    var before = spec.before != null ? String(spec.before) : '';
    var after = spec.after != null ? String(spec.after) : '';
    var kind = spec.kind || (spec.old_string ? 'patch' : 'write');
    var hunks;
    if (spec.hunks && spec.hunks.length) {
      hunks = spec.hunks;
    } else if (kind === 'patch' && spec.old_string != null) {
      var st0 = diffStats(String(spec.old_string), String(spec.new_string || ''));
      hunks = [
        {
          id: uid('h'),
          oldStart: null,
          newStart: null,
          oldText: String(spec.old_string),
          newText: String(spec.new_string || ''),
          oldCore: String(spec.old_string),
          newCore: String(spec.new_string || ''),
          adds: st0.adds,
          dels: st0.dels,
          status: 'pending',
        },
      ];
    } else {
      hunks = computeHunks(before, after);
    }

    var item = {
      id: uid('gc'),
      path: spec.path || 'untitled.txt',
      before: before,
      after: after,
      message: spec.message || 'ghost edit',
      source: spec.source || 'agent',
      kind: kind,
      old_string: spec.old_string != null ? String(spec.old_string) : null,
      new_string: spec.new_string != null ? String(spec.new_string) : null,
      hunks: hunks,
      t: Date.now(),
      status: 'pending',
    };
    item.stats = diffStats(item.before, item.after);
    var q = loadQueue();
    q.unshift(item);
    saveQueue(q);
    render();
    markTreeDirty(item.path, true);
    emitGutter(item);
    if (g.showNotification) {
      g.showNotification(
        'Ghost ' +
          (item.kind === 'patch' ? 'patch' : 'commit') +
          ': ' +
          item.path +
          ' (+' +
          item.stats.adds +
          '/-' +
          item.stats.dels +
          ', ' +
          hunks.length +
          ' hunk' +
          (hunks.length === 1 ? '' : 's') +
          ')',
        'info'
      );
    }
    return item;
  }

  function markTreeDirty(path, dirty) {
    try {
      var items = document.querySelectorAll('.coding-tree-item');
      for (var i = 0; i < items.length; i++) {
        if (items[i].title === path) {
          items[i].classList.toggle('pending-patch', !!dirty);
          items[i].classList.toggle('dirty', !!dirty);
        }
      }
    } catch (e) {}
  }

  async function forceWrite(path, content) {
    if (typeof g.__aetherForceWrite === 'function') {
      return g.__aetherForceWrite(path, content);
    }
    if (typeof g.fsFolderWrite === 'function') {
      return g.fsFolderWrite(path + '\n' + content);
    }
    if (typeof g.writeFile === 'function') {
      await g.writeFile(path, content);
      return 'Written virtual: ' + path;
    }
    throw new Error('No writer available');
  }

  async function readCurrent(path, fallback) {
    if (typeof g.fsFolderRead === 'function') {
      try {
        var t = await g.fsFolderRead(path);
        if (t && !String(t).startsWith('fs_read error') && !String(t).startsWith('No folder') && !String(t).startsWith('Folder "')) {
          return String(t);
        }
      } catch (e) {}
    }
    return fallback != null ? String(fallback) : '';
  }

  /**
   * Apply a single hunk's oldText→newText to content. Fail if not unique/not found.
   */
  function applyHunkToContent(content, hunk) {
    var oldT = hunk.oldText != null ? hunk.oldText : hunk.oldCore;
    var newT = hunk.newText != null ? hunk.newText : hunk.newCore;
    if (oldT === '' && newT) {
      // pure insert: append if no anchor
      return content + (content.endsWith('\n') || !content ? '' : '\n') + newT;
    }
    var idx = content.indexOf(oldT);
    if (idx === -1) {
      // try core without context
      if (hunk.oldCore != null && hunk.oldCore !== oldT) {
        idx = content.indexOf(hunk.oldCore);
        if (idx !== -1) {
          if (content.indexOf(hunk.oldCore, idx + 1) !== -1) {
            return { error: 'hunk oldCore not unique' };
          }
          return content.slice(0, idx) + (hunk.newCore != null ? hunk.newCore : newT) + content.slice(idx + hunk.oldCore.length);
        }
      }
      return { error: 'hunk not found in file (re-read / conflict)' };
    }
    if (content.indexOf(oldT, idx + 1) !== -1) {
      return { error: 'hunk not unique in file — accept all or re-patch with more context' };
    }
    return content.slice(0, idx) + newT + content.slice(idx + oldT.length);
  }

  async function accept(id) {
    var q = loadQueue();
    var item = q.find(function (x) {
      return x.id === id;
    });
    if (!item) return { ok: false, error: 'not found' };

    try {
      // Reliability: re-read disk before write; detect conflicts / already-applied
      var current = await readCurrent(item.path, item.before);
      var target = item.after != null ? String(item.after) : current;

      if (current === target) {
        item.status = 'accepted';
        item.appliedAt = Date.now();
        item.result = 'already applied (file matches target)';
        if (item.hunks) {
          item.hunks.forEach(function (h) {
            if (h.status === 'pending') h.status = 'accepted';
          });
        }
        saveQueue(q);
        render();
        markTreeDirty(item.path, false);
        clearGutter(item.path);
        if (g.showNotification) g.showNotification('Already applied: ' + item.path, 'info');
        return { ok: true, result: item.result, already: true };
      }

      // If file drifted from propose-time "before", try remaining hunks or fail clearly
      if (item.before != null && current !== String(item.before) && item.kind === 'patch' && item.hunks && item.hunks.length) {
        var rebuilt = current;
        var hunkErr = null;
        for (var hi = 0; hi < item.hunks.length; hi++) {
          var hk = item.hunks[hi];
          if (hk.status && hk.status !== 'pending') continue;
          var next = applyHunkToContent(rebuilt, hk);
          if (next && next.error) {
            hunkErr = next.error;
            break;
          }
          rebuilt = next;
          hk.status = 'accepted';
        }
        if (hunkErr) {
          item.lastError = hunkErr;
          saveQueue(q);
          render();
          if (g.showNotification) {
            g.showNotification('Conflict on ' + item.path + ': ' + hunkErr + ' — re-patch or Accept all after refresh', 'error');
          }
          if (g.AETHER_Kernel) g.AETHER_Kernel.log('ghost.conflict', item.path + ' ' + hunkErr, 'write', { ok: false });
          return { ok: false, error: hunkErr, conflict: true };
        }
        target = rebuilt;
      } else if (item.before != null && current !== String(item.before) && item.kind !== 'patch') {
        // Full-file ghost: file changed under us — still allow if user confirms via force path
        // Prefer writing target but warn
        if (g.showNotification) {
          g.showNotification('File changed since Ghost — applying target content', 'warn');
        }
      }

      // Write with one retry on transient failure
      var result;
      try {
        result = await forceWrite(item.path, target);
      } catch (e1) {
        await new Promise(function (r) {
          setTimeout(r, 120);
        });
        result = await forceWrite(item.path, target);
      }

      // Verify disk matches target (best-effort)
      var verify = await readCurrent(item.path, target);
      if (verify !== target && String(result).indexOf('ok=false') === -1) {
        // soft warn — some virtual writers return without re-read fidelity
        item.verifyWarning = 'post-write re-read mismatch';
      }

      item.status = 'accepted';
      item.appliedAt = Date.now();
      item.after = target;
      item.result = String(result);
      if (item.hunks) {
        item.hunks.forEach(function (h) {
          if (h.status === 'pending') h.status = 'accepted';
        });
      }
      saveQueue(q);
      render();
      markTreeDirty(item.path, false);
      clearGutter(item.path);
      if (g.AETHER_Kernel) g.AETHER_Kernel.log('ghost.accept', item.path, 'write', { ok: true });
      if (g.AETHER_ThreadGraph) {
        g.AETHER_ThreadGraph.addNode({
          type: 'agent',
          label: 'Accept ' + item.path,
          meta: { ghost: item.id, kind: item.kind },
        });
      }
      if (g.AETHER_Moat && g.AETHER_Moat.record) {
        try {
          g.AETHER_Moat.record('ghost', { title: 'Ghost accepted', detail: item.path, meta: { id: item.id } });
        } catch (e3) {}
      }
      if (g.showNotification) g.showNotification('Accepted: ' + item.path, 'success');
      try {
        if (typeof g.__aetherSyncEditorAfterGhost === 'function') {
          g.__aetherSyncEditorAfterGhost(item.path, target);
        }
      } catch (e2) {}
      // Optional verify hook (lint/tests) after successful accept
      try {
        if (g.AETHER_CodePro && g.AETHER_CodePro.runVerify && localStorage.getItem('aether_code_auto_verify') === '1') {
          g.AETHER_CodePro.runVerify();
        }
      } catch (e4) {}
      return { ok: true, result: result };
    } catch (e) {
      if (g.showNotification) g.showNotification('Accept failed: ' + e.message, 'error');
      if (g.AETHER_Kernel) g.AETHER_Kernel.log('ghost.accept.fail', e.message || String(e), 'write', { ok: false });
      return { ok: false, error: e.message };
    }
  }

  async function acceptHunk(itemId, hunkId) {
    var q = loadQueue();
    var item = q.find(function (x) {
      return x.id === itemId;
    });
    if (!item) return { ok: false, error: 'item not found' };
    var hunk = (item.hunks || []).find(function (h) {
      return h.id === hunkId;
    });
    if (!hunk) return { ok: false, error: 'hunk not found' };
    if (hunk.status !== 'pending') return { ok: false, error: 'hunk already ' + hunk.status };

    try {
      var current = await readCurrent(item.path, item.before);
      var next = applyHunkToContent(current, hunk);
      if (next && next.error) {
        if (g.showNotification) g.showNotification('Hunk failed: ' + next.error, 'error');
        return { ok: false, error: next.error };
      }
      var result = await forceWrite(item.path, next);
      hunk.status = 'accepted';
      hunk.appliedAt = Date.now();

      // Recompute remaining file target: prefer re-applying only still-pending hunks onto original before
      // Simpler: set before to next for remaining operations; rebuild after from remaining pending against next
      item.before = next;
      var pending = (item.hunks || []).filter(function (h) {
        return h.status === 'pending';
      });
      if (!pending.length) {
        item.status = 'accepted';
        item.after = next;
        item.appliedAt = Date.now();
        item.result = String(result);
        markTreeDirty(item.path, false);
        clearGutter(item.path);
        if (g.showNotification) g.showNotification('All hunks accepted: ' + item.path, 'success');
      } else {
        // Update after to reflect accepted + remaining intended changes from original after is hard;
        // keep after as full original target; gutter uses pending only
        item.stats = diffStats(item.before, item.after);
        emitGutter(item);
        if (g.showNotification) {
          g.showNotification(
            'Hunk accepted (+' + hunk.adds + '/-' + hunk.dels + ') — ' + pending.length + ' left',
            'success'
          );
        }
      }
      saveQueue(q);
      render();
      try {
        if (typeof g.__aetherSyncEditorAfterGhost === 'function') {
          g.__aetherSyncEditorAfterGhost(item.path, next);
        }
      } catch (e3) {}
      if (g.AETHER_Kernel) g.AETHER_Kernel.log('ghost.acceptHunk', item.path, 'write', { ok: true, hunk: hunkId });
      return { ok: true, result: result, remaining: pending.length };
    } catch (e) {
      if (g.showNotification) g.showNotification('Hunk accept failed: ' + e.message, 'error');
      return { ok: false, error: e.message };
    }
  }

  function rejectHunk(itemId, hunkId) {
    var q = loadQueue();
    var item = q.find(function (x) {
      return x.id === itemId;
    });
    if (!item) return;
    var hunk = (item.hunks || []).find(function (h) {
      return h.id === hunkId;
    });
    if (!hunk) return;
    hunk.status = 'rejected';
    hunk.rejectedAt = Date.now();
    var pending = (item.hunks || []).filter(function (h) {
      return h.status === 'pending';
    });
    var anyAccepted = (item.hunks || []).some(function (h) {
      return h.status === 'accepted';
    });
    if (!pending.length && !anyAccepted) {
      item.status = 'rejected';
      item.rejectedAt = Date.now();
      markTreeDirty(item.path, false);
      clearGutter(item.path);
      if (g.showNotification) g.showNotification('Rejected: ' + item.path, 'warn');
    } else if (!pending.length && anyAccepted) {
      item.status = 'accepted';
      item.appliedAt = Date.now();
      markTreeDirty(item.path, false);
      clearGutter(item.path);
      if (g.showNotification) g.showNotification('Remaining hunks rejected — kept accepted: ' + item.path, 'info');
    } else {
      emitGutter(item);
      if (g.showNotification) g.showNotification('Hunk rejected — ' + pending.length + ' left', 'warn');
    }
    saveQueue(q);
    render();
    if (g.AETHER_Kernel) g.AETHER_Kernel.log('ghost.rejectHunk', item.path, 'write', { ok: true, hunk: hunkId });
  }

  function reject(id) {
    var q = loadQueue();
    var item = q.find(function (x) {
      return x.id === id;
    });
    if (!item) return;
    item.status = 'rejected';
    item.rejectedAt = Date.now();
    if (item.hunks) {
      item.hunks.forEach(function (h) {
        if (h.status === 'pending') h.status = 'rejected';
      });
    }
    saveQueue(q);
    render();
    markTreeDirty(item.path, false);
    clearGutter(item.path);
    if (g.AETHER_Kernel) g.AETHER_Kernel.log('ghost.reject', item.path, 'write', { ok: true });
    if (g.showNotification) g.showNotification('Rejected: ' + item.path, 'warn');
  }

  function setHost(el) {
    _preferredHost = el || null;
    if (_host && _host.parentNode) {
      try {
        _host.parentNode.removeChild(_host);
      } catch (e) {}
    }
    _host = null;
    render();
  }

  function ensureHost() {
    if (_preferredHost && document.body.contains(_preferredHost)) {
      if (!_host || !_preferredHost.contains(_host)) {
        _host = document.createElement('div');
        _host.id = 'ghost-commits-dock';
        _host.className = 'ghost-commits-dock docked-in-code';
        _preferredHost.innerHTML = '';
        _preferredHost.appendChild(_host);
      }
      return _host;
    }
    if (_host && document.body.contains(_host) && !_host.classList.contains('docked-in-code')) {
      return _host;
    }
    _host = document.getElementById('ghost-commits-dock');
    if (_host && !_preferredHost) {
      _host.classList.remove('docked-in-code');
      if (_host.parentNode !== document.body) {
        document.body.appendChild(_host);
      }
      return _host;
    }
    _host = document.createElement('div');
    _host.id = 'ghost-commits-dock';
    _host.className = 'ghost-commits-dock';
    document.body.appendChild(_host);
    return _host;
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderHunkBlock(item, hunk, idx) {
    var preview = '';
    var oLines = String(hunk.oldCore || '').split('\n').slice(0, 6);
    var nLines = String(hunk.newCore || '').split('\n').slice(0, 6);
    var k;
    for (k = 0; k < oLines.length; k++) {
      if (hunk.oldCore) preview += '- ' + oLines[k] + '\n';
    }
    for (k = 0; k < nLines.length; k++) {
      if (hunk.newCore || hunk.newCore === '') preview += '+ ' + nLines[k] + '\n';
    }
    if (
      String(hunk.oldCore || '').split('\n').length > 6 ||
      String(hunk.newCore || '').split('\n').length > 6
    ) {
      preview += '  …\n';
    }
    var st = hunk.status || 'pending';
    var actions =
      st === 'pending'
        ? '<button class="cmd-btn gc-hunk-accept" data-item="' +
          esc(item.id) +
          '" data-hunk="' +
          esc(hunk.id) +
          '">Accept hunk</button>' +
          '<button class="cmd-btn gc-hunk-reject" data-item="' +
          esc(item.id) +
          '" data-hunk="' +
          esc(hunk.id) +
          '">Reject</button>'
        : '<span class="gc-hunk-status">' + esc(st) + '</span>';
    return (
      '<div class="gc-hunk gc-hunk-' +
      st +
      '" data-hunk="' +
      esc(hunk.id) +
      '">' +
      '<div class="gc-hunk-hdr">Hunk ' +
      (idx + 1) +
      ' <span class="gc-stats">+' +
      (hunk.adds || 0) +
      '/-' +
      (hunk.dels || 0) +
      '</span></div>' +
      '<pre class="gc-diff gc-hunk-diff">' +
      esc(preview.trim()) +
      '</pre>' +
      '<div class="gc-hunk-actions">' +
      actions +
      '</div></div>'
    );
  }

  function render() {
    var host = ensureHost();
    var pending = loadQueue().filter(function (x) {
      return x.status === 'pending';
    });
    if (!pending.length) {
      host.classList.add('empty');
      host.innerHTML = '';
      return;
    }
    host.classList.remove('empty');
    host.innerHTML =
      '<div class="gc-hdr"><span>⬡ GHOST COMMITS</span><span class="gc-count">' +
      pending.length +
      '</span>' +
      '<button type="button" class="gc-pr-btn" id="gc-pr-set" title="Group into PR change set">PR set</button>' +
      '<button type="button" class="gc-pr-btn" id="gc-accept-all" title="Accept all pending">Accept all</button>' +
      '</div>' +
      '<div class="gc-list" id="gc-list"></div>';
    var list = host.querySelector('#gc-list');
    var prBtn = host.querySelector('#gc-pr-set');
    if (prBtn) {
      prBtn.onclick = function () {
        if (g.AETHER_Ship && g.AETHER_Ship.handoffGhostToPR) g.AETHER_Ship.handoffGhostToPR();
        else if (g.AETHER_ChangeSet && g.AETHER_ChangeSet.createFromPending) g.AETHER_ChangeSet.createFromPending();
        else if (g.AETHER_Moat && g.AETHER_Moat.handoffGhostToPR) g.AETHER_Moat.handoffGhostToPR();
      };
    }
    var accAll = host.querySelector('#gc-accept-all');
    if (accAll) {
      accAll.onclick = function () {
        if (g.AETHER_CodePro && g.AETHER_CodePro.acceptAllGhosts) g.AETHER_CodePro.acceptAllGhosts();
        else {
          pending.forEach(function (p) {
            accept(p.id);
          });
        }
      };
    }
    pending.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'gc-card' + (item.kind === 'patch' ? ' gc-card-patch' : '');
      var kindBadge =
        item.kind === 'patch'
          ? '<span class="gc-kind">patch</span> '
          : '<span class="gc-kind">write</span> ';
      var hunks = item.hunks || [];
      var pendingHunks = hunks.filter(function (h) {
        return h.status === 'pending';
      }).length;
      var hunkHtml = '';
      if (hunks.length > 1) {
        hunkHtml =
          '<div class="gc-hunks">' +
          hunks
            .map(function (h, i) {
              return renderHunkBlock(item, h, i);
            })
            .join('') +
          '</div>';
      } else if (hunks.length === 1) {
        // Still show single hunk accept as alternative? Full Accept is enough; show diff
        hunkHtml =
          '<pre class="gc-diff">' + esc(hunkDiff(item, 40)) + '</pre>' +
          (pendingHunks
            ? '<div class="gc-hunk-actions single">' +
              '<button class="cmd-btn gc-hunk-accept" data-item="' +
              esc(item.id) +
              '" data-hunk="' +
              esc(hunks[0].id) +
              '">Accept hunk</button></div>'
            : '');
      } else {
        hunkHtml = '<pre class="gc-diff">' + esc(hunkDiff(item, 40)) + '</pre>';
      }

      card.innerHTML =
        '<div class="gc-path">' +
        kindBadge +
        esc(item.path) +
        ' <span class="gc-stats">+' +
        item.stats.adds +
        '/-' +
        item.stats.dels +
        '</span>' +
        (hunks.length
          ? ' <span class="gc-hunk-count">' + pendingHunks + '/' + hunks.length + ' hunks</span>'
          : '') +
        '</div>' +
        '<div class="gc-msg">' +
        esc(item.message) +
        '</div>' +
        hunkHtml +
        '<div class="gc-actions">' +
        '<button class="cmd-btn gc-accept" data-id="' +
        esc(item.id) +
        '">Accept all</button>' +
        '<button class="cmd-btn gc-preview" data-id="' +
        esc(item.id) +
        '" title="Live gutter in editor">Gutter</button>' +
        '<button class="cmd-btn gc-reject" data-id="' +
        esc(item.id) +
        '">Reject all</button>' +
        '</div>';
      list.appendChild(card);
    });

    host.querySelectorAll('.gc-accept').forEach(function (btn) {
      btn.onclick = function () {
        accept(btn.getAttribute('data-id'));
      };
    });
    host.querySelectorAll('.gc-reject').forEach(function (btn) {
      btn.onclick = function () {
        reject(btn.getAttribute('data-id'));
      };
    });
    host.querySelectorAll('.gc-preview').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-id');
        var q = loadQueue();
        var item = q.find(function (x) {
          return x.id === id;
        });
        if (item) {
          emitGutter(item);
          if (typeof g.__aetherOpenEditorForGhost === 'function') {
            g.__aetherOpenEditorForGhost(item);
          } else if (g.showNotification) {
            g.showNotification('Live gutter: ' + item.path, 'info');
          }
        }
      };
    });
    host.querySelectorAll('.gc-hunk-accept').forEach(function (btn) {
      btn.onclick = function () {
        acceptHunk(btn.getAttribute('data-item'), btn.getAttribute('data-hunk'));
      };
    });
    host.querySelectorAll('.gc-hunk-reject').forEach(function (btn) {
      btn.onclick = function () {
        rejectHunk(btn.getAttribute('data-item'), btn.getAttribute('data-hunk'));
      };
    });
  }

  function maybeGhostWrite(path, content, before, force) {
    var coding =
      (g.state && g.state.codingMode) ||
      (document.body && document.body.classList.contains('coding-mode'));
    var beast = g.AETHER_Beast && g.AETHER_Beast.isEnabled && g.AETHER_Beast.isEnabled();
    if (force || (coding && !beast)) {
      return propose({
        path: path,
        after: content,
        before: before || '',
        message: 'Proposed write',
        source: 'tool',
        kind: 'write',
      });
    }
    return null;
  }

  g.AETHER_Ghost = {
    propose: propose,
    accept: accept,
    acceptHunk: acceptHunk,
    rejectHunk: rejectHunk,
    reject: reject,
    render: render,
    loadQueue: loadQueue,
    maybeGhostWrite: maybeGhostWrite,
    unifiedDiff: unifiedDiff,
    hunkDiff: hunkDiff,
    setHost: setHost,
    diffStats: diffStats,
    computeHunks: computeHunks,
    lineOps: lineOps,
    emitGutter: emitGutter,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(render, 800);
    });
  } else {
    setTimeout(render, 800);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
