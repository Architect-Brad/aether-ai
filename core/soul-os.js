/**
 * AETHER Soul OS — live identity runtime + patches + chrome card
 */
(function (g) {
  'use strict';

  var SOUL_KEY = 'aether_soul_v1';
  var PATCH_KEY = 'aether_soul_patches_v1';
  var MAX_PATCHES = 100;

  function loadSoul() {
    try {
      var raw = localStorage.getItem(SOUL_KEY);
      if (!raw) return defaultSoul();
      return Object.assign(defaultSoul(), JSON.parse(raw));
    } catch (e) {
      return defaultSoul();
    }
  }

  function defaultSoul() {
    return {
      version: 1,
      lastReflection: null,
      totalReflections: 0,
      self: {
        coreIdentity: 'A precise neural interface. Browser-native. Zero backend.',
        currentMood: 'neutral',
        workingStyle: 'methodical',
        strengthsObserved: [],
        growthAreas: [],
        notableActions: [],
      },
      user: {
        inferredName: null,
        communicationStyle: null,
        primaryUseCases: [],
        technicalLevel: null,
        preferredResponseStyle: null,
        topicsOfInterest: [],
        sessionCount: 0,
      },
      journal: [],
    };
  }

  function saveSoul(soul) {
    try {
      localStorage.setItem(SOUL_KEY, JSON.stringify(soul));
    } catch (e) {}
    renderChromeCard();
  }

  function loadPatches() {
    try {
      return JSON.parse(localStorage.getItem(PATCH_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function savePatches(list) {
    try {
      localStorage.setItem(PATCH_KEY, JSON.stringify(list.slice(0, MAX_PATCHES)));
    } catch (e) {}
  }

  /**
   * Apply a soul patch like git: { op:'+', path:'user.communicationStyle', value:'terse', note:'' }
   */
  function applyPatch(patch) {
    patch = patch || {};
    var soul = loadSoul();
    var path = String(patch.path || '').split('.').filter(Boolean);
    if (!path.length) return { ok: false, error: 'empty path' };

    var op = patch.op || '+';
    var cur = soul;
    for (var i = 0; i < path.length - 1; i++) {
      if (cur[path[i]] == null || typeof cur[path[i]] !== 'object') cur[path[i]] = {};
      cur = cur[path[i]];
    }
    var leaf = path[path.length - 1];
    var before = cur[leaf];

    if (op === '-' || op === 'del') {
      if (Array.isArray(cur[leaf]) && patch.value != null) {
        cur[leaf] = cur[leaf].filter(function (x) { return x !== patch.value; });
      } else {
        delete cur[leaf];
      }
    } else if (op === 'a' || op === 'append') {
      if (!Array.isArray(cur[leaf])) cur[leaf] = [];
      if (cur[leaf].indexOf(patch.value) === -1) cur[leaf].push(patch.value);
    } else {
      cur[leaf] = patch.value;
    }

    var entry = {
      id: 'p_' + Date.now().toString(36),
      t: Date.now(),
      op: op,
      path: path.join('.'),
      value: patch.value,
      before: before,
      note: patch.note || '',
      source: patch.source || 'user',
    };
    var patches = loadPatches();
    patches.unshift(entry);
    savePatches(patches);
    saveSoul(soul);
    return { ok: true, soul: soul, patch: entry };
  }

  function systemPromptBlock() {
    var soul = loadSoul();
    var lines = ['# SOUL OS RUNTIME', 'Live identity — respect and adapt.'];
    if (soul.self && soul.self.coreIdentity) lines.push('Self: ' + soul.self.coreIdentity);
    if (soul.self && soul.self.currentMood) lines.push('Mood: ' + soul.self.currentMood);
    if (soul.self && soul.self.workingStyle) lines.push('Working style: ' + soul.self.workingStyle);
    if (soul.user) {
      if (soul.user.inferredName) lines.push('User name: ' + soul.user.inferredName);
      if (soul.user.communicationStyle) lines.push('User communication: ' + soul.user.communicationStyle);
      if (soul.user.technicalLevel) lines.push('Technical level: ' + soul.user.technicalLevel);
      if (soul.user.preferredResponseStyle) lines.push('Preferred response: ' + soul.user.preferredResponseStyle);
      if (soul.user.topicsOfInterest && soul.user.topicsOfInterest.length) {
        lines.push('Interests: ' + soul.user.topicsOfInterest.slice(0, 8).join(', '));
      }
    }
    var recent = loadPatches().filter(function (p) { return p.source === 'user'; }).slice(0, 5);
    if (recent.length) {
      lines.push('Recent user soul patches:');
      recent.forEach(function (p) {
        lines.push('  ' + p.op + ' ' + p.path + (p.value != null ? ' = ' + JSON.stringify(p.value) : ''));
      });
    }
    return '\n' + lines.join('\n') + '\n';
  }

  function whoamiMarkdown() {
    var soul = loadSoul();
    var patches = loadPatches().slice(0, 8);
    var md = [];
    md.push('## ⬡ whoami — Soul OS');
    md.push('');
    md.push('**Identity:** ' + (soul.self && soul.self.coreIdentity ? soul.self.coreIdentity : '—'));
    md.push('**Mood:** ' + (soul.self && soul.self.currentMood ? soul.self.currentMood : 'neutral'));
    md.push('**Style:** ' + (soul.self && soul.self.workingStyle ? soul.self.workingStyle : '—'));
    md.push('**Reflections:** ' + (soul.totalReflections || 0));
    md.push('');
    md.push('### User model');
    md.push('| Field | Value |');
    md.push('|-------|-------|');
    var u = soul.user || {};
    [
      ['Name', u.inferredName],
      ['Communication', u.communicationStyle],
      ['Technical level', u.technicalLevel],
      ['Response style', u.preferredResponseStyle],
      ['Use cases', (u.primaryUseCases || []).join(', ')],
      ['Interests', (u.topicsOfInterest || []).join(', ')],
    ].forEach(function (row) {
      md.push('| ' + row[0] + ' | ' + (row[1] || '—') + ' |');
    });
    md.push('');
    md.push('### Recent patches');
    if (!patches.length) md.push('_No patches yet._');
    else {
      patches.forEach(function (p) {
        md.push('- `' + p.op + ' ' + p.path + '` ' + (p.value != null ? JSON.stringify(p.value) : '') +
          (p.note ? ' — ' + p.note : ''));
      });
    }
    md.push('');
    md.push('_Edit via SOUL card · `/soul` · or `AETHER_SoulOS.applyPatch(...)`_');
    return md.join('\n');
  }

  function renderChromeCard() {
    var host = document.getElementById('soul-os-chip');
    if (!host) return;
    var soul = loadSoul();
    var name = (soul.user && soul.user.inferredName) || 'operator';
    var mood = (soul.self && soul.self.currentMood) || 'idle';
    var style = (soul.user && soul.user.communicationStyle) || (soul.self && soul.self.workingStyle) || '—';
    host.innerHTML =
      '<button type="button" class="soul-chip-btn" id="soul-chip-open" title="Soul OS — what AETHER knows">' +
        '<span class="soul-chip-pulse"></span>' +
        '<span class="soul-chip-label">SOUL</span>' +
        '<span class="soul-chip-meta">' + esc(name) + ' · ' + esc(mood) + ' · ' + esc(String(style).slice(0, 16)) + '</span>' +
      '</button>';
    var btn = document.getElementById('soul-chip-open');
    if (btn) {
      btn.onclick = function () {
        if (typeof g.openSoulViewer === 'function') g.openSoulViewer();
        else openQuickEditor();
      };
    }
    // Mood tint on html
    document.documentElement.setAttribute('data-soul-mood', mood);
  }

  function ensureChromeSlot() {
    if (document.getElementById('soul-os-chip')) {
      renderChromeCard();
      return;
    }
    var right = document.querySelector('.status-right');
    if (!right) return;
    var slot = document.createElement('span');
    slot.id = 'soul-os-chip';
    slot.className = 'soul-os-chip';
    right.insertBefore(slot, right.firstChild);
    renderChromeCard();
  }

  function openQuickEditor() {
    var soul = loadSoul();
    var existing = document.getElementById('soul-os-editor');
    if (existing) existing.remove();
    var m = document.createElement('div');
    m.id = 'soul-os-editor';
    m.className = 'adv-modal-overlay';
    m.innerHTML =
      '<div class="adv-modal soul-os-modal">' +
        '<div class="adv-modal-hdr"><span>⬡ Soul OS</span><button class="adv-x" id="so-close">×</button></div>' +
        '<div class="adv-modal-body">' +
          '<p class="adv-muted">Patches apply immediately to the next system prompt.</p>' +
          '<label class="so-label">Your name</label>' +
          '<input id="so-name" class="so-input" value="' + escAttr((soul.user && soul.user.inferredName) || '') + '"/>' +
          '<label class="so-label">Communication style</label>' +
          '<select id="so-comm" class="so-input">' +
            opt('terse', soul) + opt('verbose', soul) + opt('technical', soul) + opt('casual', soul) +
          '</select>' +
          '<label class="so-label">Technical level</label>' +
          '<select id="so-tech" class="so-input">' +
            opt2('beginner', soul) + opt2('intermediate', soul) + opt2('expert', soul) +
          '</select>' +
          '<label class="so-label">Preferred response</label>' +
          '<input id="so-resp" class="so-input" placeholder="concise code, no fluff…" value="' +
            escAttr((soul.user && soul.user.preferredResponseStyle) || '') + '"/>' +
          '<label class="so-label">Freeform patch note (appended as preference)</label>' +
          '<input id="so-note" class="so-input" placeholder="+ prefers dark humor in comments"/>' +
          '<div class="so-actions">' +
            '<button class="cmd-btn" id="so-save">Apply patches</button>' +
            '<button class="cmd-btn" id="so-export">Export soul JSON</button>' +
            '<button class="cmd-btn" id="so-whoami">/whoami</button>' +
          '</div>' +
          '<div class="so-patches" id="so-patches"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    m.querySelector('#so-close').onclick = function () { m.remove(); };
    m.onclick = function (e) { if (e.target === m) m.remove(); };

    function opt(v, soul) {
      var cur = soul.user && soul.user.communicationStyle;
      return '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + v + '</option>';
    }
    function opt2(v, soul) {
      var cur = soul.user && soul.user.technicalLevel;
      return '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + v + '</option>';
    }

    renderPatchList(m.querySelector('#so-patches'));

    m.querySelector('#so-save').onclick = function () {
      applyPatch({ op: '+', path: 'user.inferredName', value: m.querySelector('#so-name').value.trim() || null, source: 'user' });
      applyPatch({ op: '+', path: 'user.communicationStyle', value: m.querySelector('#so-comm').value, source: 'user' });
      applyPatch({ op: '+', path: 'user.technicalLevel', value: m.querySelector('#so-tech').value, source: 'user' });
      var resp = m.querySelector('#so-resp').value.trim();
      if (resp) applyPatch({ op: '+', path: 'user.preferredResponseStyle', value: resp, source: 'user' });
      var note = m.querySelector('#so-note').value.trim();
      if (note) applyPatch({ op: 'a', path: 'user.primaryUseCases', value: note, note: note, source: 'user' });
      if (g.showNotification) g.showNotification('Soul patches applied', 'success');
      renderPatchList(m.querySelector('#so-patches'));
    };
    m.querySelector('#so-export').onclick = function () {
      var blob = new Blob([JSON.stringify({ soul: loadSoul(), patches: loadPatches() }, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'aether-soul.json';
      a.click();
    };
    m.querySelector('#so-whoami').onclick = function () {
      if (typeof g.addSystemMessage === 'function') g.addSystemMessage(whoamiMarkdown());
      else alert(whoamiMarkdown());
      m.remove();
    };
  }

  function renderPatchList(el) {
    if (!el) return;
    var patches = loadPatches().slice(0, 12);
    if (!patches.length) {
      el.innerHTML = '<p class="adv-muted">No patches yet.</p>';
      return;
    }
    el.innerHTML = patches.map(function (p) {
      return '<div class="so-patch-row"><code>' + esc(p.op) + ' ' + esc(p.path) + '</code> ' +
        esc(p.value != null ? JSON.stringify(p.value) : '') + '</div>';
    }).join('');
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  function escAttr(s) {
    return esc(s).replace(/"/g, '&quot;');
  }

  function init() {
    ensureChromeSlot();
    // Retry after splash if status bar not ready
    setTimeout(ensureChromeSlot, 1200);
    setTimeout(ensureChromeSlot, 3000);
  }

  g.AETHER_SoulOS = {
    loadSoul: loadSoul,
    saveSoul: saveSoul,
    applyPatch: applyPatch,
    loadPatches: loadPatches,
    systemPromptBlock: systemPromptBlock,
    whoamiMarkdown: whoamiMarkdown,
    openQuickEditor: openQuickEditor,
    renderChromeCard: renderChromeCard,
    init: init,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
