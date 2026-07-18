/**
 * AETHER Git Lite — browser-native git awareness (zero-backend)
 * Reads .git via File System Access when present; no real git binary.
 * Surfaces branch, HEAD, dirty ghosts, and PR-friendly status for Code Pro.
 */
(function (g) {
  'use strict';

  var _cache = { t: 0, data: null };
  var CACHE_MS = 8000;

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  async function readGitFile(relPath) {
    if (typeof g.fsFolderRead !== 'function') return null;
    try {
      var t = await g.fsFolderRead(relPath);
      if (!t || String(t).startsWith('fs_read error') || String(t).startsWith('No folder') || String(t).startsWith('Folder "')) {
        return null;
      }
      return String(t);
    } catch (e) {
      return null;
    }
  }

  async function exists(path) {
    if (typeof g.fsFolderExists === 'function') {
      try {
        var r = await g.fsFolderExists(path);
        return String(r).indexOf('true') === 0;
      } catch (e) {
        return false;
      }
    }
    var t = await readGitFile(path);
    return !!t;
  }

  /**
   * Parse .git/HEAD → branch name or detached SHA
   */
  async function getHead() {
    var head = await readGitFile('.git/HEAD');
    if (!head) return { ok: false, reason: 'no .git/HEAD (not a git repo or .git not readable)' };
    head = head.trim();
    var m = head.match(/^ref:\s*refs\/heads\/(.+)$/);
    if (m) {
      var branch = m[1].trim();
      var sha = await readGitFile('.git/refs/heads/' + branch);
      return {
        ok: true,
        branch: branch,
        sha: sha ? sha.trim().slice(0, 12) : null,
        detached: false,
        raw: head,
      };
    }
    // detached HEAD
    if (/^[0-9a-f]{7,40}$/i.test(head)) {
      return { ok: true, branch: null, sha: head.slice(0, 12), detached: true, raw: head };
    }
    return { ok: true, branch: null, sha: null, detached: true, raw: head };
  }

  async function getRemoteHint() {
    var cfg = await readGitFile('.git/config');
    if (!cfg) return null;
    var m = cfg.match(/\[remote\s+"origin"\][\s\S]*?url\s*=\s*(\S+)/);
    return m ? m[1] : null;
  }

  function ghostDirty() {
    if (!g.AETHER_Ghost || !g.AETHER_Ghost.loadQueue) return [];
    return g.AETHER_Ghost.loadQueue().filter(function (x) {
      return x.status === 'pending';
    });
  }

  function touchedFiles() {
    if (g.AETHER_CodePro && g.AETHER_CodePro.getTouched) return g.AETHER_CodePro.getTouched();
    return [];
  }

  /**
   * Full status snapshot for UI + prompt injection
   */
  async function status(force) {
    var now = Date.now();
    if (!force && _cache.data && now - _cache.t < CACHE_MS) return _cache.data;

    var hasGit = await exists('.git/HEAD');
    var head = hasGit ? await getHead() : { ok: false };
    var remote = hasGit ? await getRemoteHint() : null;
    var ghosts = ghostDirty();
    var touched = touchedFiles();

    var data = {
      hasGit: !!hasGit,
      branch: head.branch || (head.detached ? '(detached)' : null),
      sha: head.sha,
      detached: !!head.detached,
      remote: remote,
      pendingGhosts: ghosts.length,
      ghostPaths: ghosts.map(function (g) {
        return g.path;
      }),
      touched: touched,
      dirty: ghosts.length > 0 || touched.length > 0,
      t: now,
    };
    _cache = { t: now, data: data };
    return data;
  }

  function statusMarkdown(st) {
    st = st || _cache.data;
    if (!st) return '_Git status not loaded_';
    var lines = ['## Git Lite'];
    if (!st.hasGit) {
      lines.push('- Repo: **not detected** (link a folder with `.git` readable)');
    } else {
      lines.push('- Branch: `' + (st.branch || '?') + '`' + (st.sha ? ' @ `' + st.sha + '`' : ''));
      if (st.remote) lines.push('- Origin: `' + st.remote + '`');
    }
    lines.push('- Pending ghosts: **' + st.pendingGhosts + '**');
    if (st.ghostPaths && st.ghostPaths.length) {
      st.ghostPaths.slice(0, 20).forEach(function (p) {
        lines.push('  - `' + p + '`');
      });
    }
    lines.push('- Blast radius: **' + (st.touched ? st.touched.length : 0) + '** file(s)');
    if (st.touched && st.touched.length) {
      st.touched.slice(0, 15).forEach(function (p) {
        lines.push('  - `' + p + '`');
      });
    }
    return lines.join('\n');
  }

  function promptSnippet() {
    var st = _cache.data;
    if (!st) return '';
    var s = '\n## Git context (Git Lite)\n';
    if (st.hasGit) s += '- Branch: ' + (st.branch || 'detached') + (st.sha ? ' @ ' + st.sha : '') + '\n';
    else s += '- No .git visible in linked folder\n';
    if (st.pendingGhosts) s += '- Uncommitted agent patches (ghosts): ' + st.pendingGhosts + '\n';
    return s;
  }

  async function refreshChip() {
    var st = await status(true);
    var chip = document.getElementById('code-git-chip');
    if (!chip) {
      chip = document.createElement('span');
      chip.id = 'code-git-chip';
      chip.className = 'code-git-chip';
      chip.title = 'Git Lite status — click for details';
      var left = document.querySelector('.code-pro-left') || document.getElementById('code-session-rail');
      if (left) left.appendChild(chip);
      else return st;
      chip.onclick = async function () {
        var s = await status(true);
        if (typeof g.addSystemMessage === 'function') g.addSystemMessage(statusMarkdown(s));
        else if (g.showNotification) g.showNotification((s.branch || 'no-git') + ' · ' + s.pendingGhosts + ' ghosts', 'info');
      };
    }
    var on =
      (g.state && g.state.codingMode) ||
      (document.body && document.body.classList.contains('coding-mode'));
    chip.style.display = on ? 'inline-flex' : 'none';
    if (!st.hasGit) {
      chip.textContent = '⎇ no git';
      chip.dataset.state = 'none';
    } else {
      chip.textContent = '⎇ ' + (st.branch || 'detached') + (st.dirty ? ' ●' : '');
      chip.dataset.state = st.dirty ? 'dirty' : 'clean';
    }
    return st;
  }

  /**
   * Draft a conventional commit message from pending ghosts / change set
   */
  function draftCommitMessage() {
    var cs = g.AETHER_ChangeSet && g.AETHER_ChangeSet.getActive && g.AETHER_ChangeSet.getActive();
    if (cs && cs.title) {
      return cs.title.replace(/^AETHER patch:\s*/i, 'feat: ');
    }
    var ghosts = ghostDirty();
    if (!ghosts.length) return 'chore: aether agent update';
    var paths = ghosts.map(function (x) {
      return x.path.split('/').pop();
    });
    return 'feat: update ' + paths.slice(0, 3).join(', ') + (paths.length > 3 ? '…' : '');
  }

  g.AETHER_GitLite = {
    status: status,
    getHead: getHead,
    statusMarkdown: statusMarkdown,
    promptSnippet: promptSnippet,
    refreshChip: refreshChip,
    draftCommitMessage: draftCommitMessage,
  };

  function boot() {
    setTimeout(function () {
      refreshChip().catch(function () {});
    }, 900);
    if (document.body) {
      var obs = new MutationObserver(function () {
        refreshChip().catch(function () {});
      });
      obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
