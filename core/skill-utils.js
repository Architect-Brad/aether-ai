/**
 * AETHER Skill Utils v1.3 — soft JSON parse + repair retry + kernel bridge
 * Used by Discovery + Documents Supremacy (and any future engine skill).
 */
(function (g) {
  'use strict';

  /**
   * Soft-parse model output into a skill JSON object.
   * Handles: fences, prose wrappers, trailing commas, truncated braces.
   */
  function softParseSpec(text, opts) {
    opts = opts || {};
    var requireKey = opts.requireKey || null; // 'action' | 'type'
    if (text == null) return null;
    var raw = String(text).trim();
    if (!raw) return null;

    var candidates = [];

    // 1) full text
    candidates.push(raw);

    // 2) fenced blocks (complete)
    var fenceRe = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
    var m;
    while ((m = fenceRe.exec(raw))) {
      if (m[1] && m[1].trim()) candidates.push(m[1].trim());
    }
    // 2b) unclosed fence (truncated stream)
    var openFence = raw.match(/```(?:json|JSON)?\s*([\s\S]+)$/);
    if (openFence && openFence[1]) candidates.push(openFence[1].trim());

    // 3) first { to last }
    var start = raw.indexOf('{');
    var end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      candidates.push(raw.slice(start, end + 1));
    }
    // 3b) truncated: first { to end of string
    if (start >= 0) {
      candidates.push(raw.slice(start));
    }

    // 4) multiple JSON objects — take largest { ... }
    var reObj = /\{[\s\S]*?\}/g;
    var mm;
    var largest = '';
    while ((mm = reObj.exec(raw))) {
      if (mm[0].length > largest.length) largest = mm[0];
    }
    if (largest) candidates.push(largest);

    function tryParse(s) {
      var attempts = [s, repairJson(s), aggressiveRepair(s, requireKey)];
      for (var i = 0; i < attempts.length; i++) {
        if (!attempts[i]) continue;
        try {
          var p = JSON.parse(attempts[i]);
          if (!p || typeof p !== 'object') continue;
          if (requireKey && p[requireKey] == null) continue;
          return p;
        } catch (e) {}
      }
      return null;
    }

    for (var c = 0; c < candidates.length; c++) {
      var hit = tryParse(candidates[c]);
      if (hit) return normalizeSkillSpec(hit, requireKey);
    }
    return null;
  }

  /** Ensure recovered specs are executable by engines */
  function normalizeSkillSpec(p, requireKey) {
    if (!p || typeof p !== 'object') return p;
    if (requireKey === 'type' || p.type) {
      if (p.type === 'presentation' && !p.slides) {
        p.slides = [{ type: 'title', title: (p.meta && p.meta.title) || 'Draft', subtitle: 'Recovered draft' }];
      }
      if ((p.type === 'document' || p.type === 'epub') && !p.body) {
        p.body = [
          { block: 'heading', level: 1, text: (p.meta && p.meta.title) || 'Document' },
          { block: 'paragraph', text: '(Recovered from partial model output.)' },
        ];
      }
      if (p.type === 'spreadsheet' && !p.sheets) {
        p.sheets = [{
          name: 'Sheet1', type: 'data',
          columns: [{ header: 'Note', key: 'note', width: 40 }],
          rows: [{ note: 'Recovered draft' }],
        }];
      }
      if (p.type === 'document' && !p.format) p.format = 'docx';
      if (p.type === 'presentation' && !p.format) p.format = 'pptx';
      if (p.type === 'spreadsheet' && !p.format) p.format = 'xlsx';
      if (!p.meta) p.meta = { title: 'Untitled' };
      if (!p.meta.filename) {
        var base = String(p.meta.title || 'document').replace(/\s+/g, '-').toLowerCase();
        p.meta.filename = base + (p.type === 'presentation' ? '.pptx' : p.type === 'spreadsheet' ? '.xlsx' : p.type === 'epub' ? '.epub' : '.docx');
      }
    }
    if ((requireKey === 'action' || p.action) && p.action === 'weather' && !p.location) {
      p.location = 'London';
    }
    if ((requireKey === 'action' || p.action) && !p.query && p.action !== 'weather' && p.action !== 'route') {
      p.query = p.query || 'general';
    }
    return p;
  }

  function repairJson(s) {
    if (!s) return s;
    var t = String(s)
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');

    // Close unclosed strings: if odd number of unescaped quotes, append "
    var quoteCount = 0;
    for (var i = 0; i < t.length; i++) {
      if (t[i] === '"' && t[i - 1] !== '\\') quoteCount++;
    }
    if (quoteCount % 2 === 1) t += '"';

    var open = (t.match(/\{/g) || []).length;
    var close = (t.match(/\}/g) || []).length;
    if (open > close) t += '}'.repeat(open - close);
    var openB = (t.match(/\[/g) || []).length;
    var closeB = (t.match(/\]/g) || []).length;
    if (openB > closeB) t += ']'.repeat(openB - closeB);

    return t;
  }

  /**
   * Stronger repair for mid-stream truncation:
   * - strip trailing incomplete key/value fragments
   * - inject minimal defaults for known skill shapes
   */
  function aggressiveRepair(s, requireKey) {
    if (!s) return s;
    var t = repairJson(s);

    // Trim to last complete key-value boundary
    t = t.replace(/,\s*"[^"]*$/g, ''); // trailing incomplete key
    t = t.replace(/:\s*"[^"]*$/g, ': ""'); // incomplete string value
    t = t.replace(/:\s*-?\d+\.?$/g, ': 0'); // incomplete number
    t = t.replace(/,\s*$/g, '');
    t = repairJson(t);

    try {
      var p = JSON.parse(t);
      return JSON.stringify(p);
    } catch (e) {}

    // Heuristic minimal specs if we can see the key
    if (requireKey === 'action') {
      var act = s.match(/"action"\s*:\s*"([^"]+)"/);
      var q = s.match(/"query"\s*:\s*"([^"]*)/);
      var loc = s.match(/"location"\s*:\s*"([^"]*)/);
      if (act) {
        var mini = { action: act[1] };
        if (q) mini.query = q[1];
        if (loc) mini.location = loc[1];
        if (act[1] === 'weather' && !mini.location) mini.location = 'London';
        if (!mini.query && act[1] !== 'weather' && act[1] !== 'route') mini.query = 'general';
        return JSON.stringify(mini);
      }
    }
    if (requireKey === 'type') {
      var typ = s.match(/"type"\s*:\s*"([^"]+)"/);
      var fmt = s.match(/"format"\s*:\s*"([^"]+)"/);
      var title = s.match(/"title"\s*:\s*"([^"]*)/);
      if (typ) {
        var doc = {
          type: typ[1],
          format: fmt ? fmt[1] : typ[1] === 'presentation' ? 'pptx' : typ[1] === 'spreadsheet' ? 'xlsx' : 'docx',
          meta: {
            title: title ? title[1] : 'Untitled',
            filename:
              (title ? title[1].replace(/\s+/g, '-').toLowerCase() : 'document') +
              (typ[1] === 'presentation' ? '.pptx' : typ[1] === 'spreadsheet' ? '.xlsx' : typ[1] === 'epub' ? '.epub' : '.docx'),
          },
        };
        if (typ[1] === 'document' || typ[1] === 'epub') {
          doc.body = [{ block: 'heading', level: 1, text: doc.meta.title }, { block: 'paragraph', text: '(Recovered from truncated model output — expand or re-run for full content.)' }];
        }
        if (typ[1] === 'presentation') {
          doc.slides = [{ type: 'title', title: doc.meta.title, subtitle: 'Recovered draft' }];
        }
        if (typ[1] === 'spreadsheet') {
          doc.sheets = [{ name: 'Sheet1', type: 'data', columns: [{ header: 'Note', key: 'note', width: 40 }], rows: [{ note: 'Recovered from truncated JSON' }] }];
        }
        if (typ[1] === 'database') {
          doc.tables = [{ name: 'notes', columns: [{ name: 'id', type: 'INTEGER', primaryKey: true }, { name: 'text', type: 'TEXT' }], rows: [{ text: 'recovered' }] }];
        }
        if (typ[1] === 'markdown') {
          doc.markdown = '# ' + doc.meta.title + '\n\nRecovered from truncated model output.';
        }
        if (typ[1] === 'use-template') {
          var tid = s.match(/"templateId"\s*:\s*"([^"]+)"/);
          doc.templateId = tid ? tid[1] : 'business-report';
          doc.variables = { TITLE: doc.meta.title, AUTHOR: 'AETHER', DATE: new Date().toISOString().slice(0, 10) };
        }
        return JSON.stringify(doc);
      }
    }
    return t;
  }

  function isLikelySkillJson(text, requireKey) {
    if (!text) return false;
    var t = String(text);
    if (t.indexOf('{') === -1) return false;
    if (requireKey === 'action' && /"action"\s*:/.test(t)) return true;
    if (requireKey === 'type' && /"type"\s*:/.test(t)) return true;
    if (/```json/i.test(t) && t.indexOf('{') >= 0) return true;
    return false;
  }

  function isLikelyTruncated(text) {
    if (!text) return false;
    var t = String(text).trim();
    if (/```(?:json)?\s*\{[\s\S]*$/i.test(t) && t.indexOf('```', 3) === -1) return true;
    var open = (t.match(/\{/g) || []).length;
    var close = (t.match(/\}/g) || []).length;
    if (open > close) return true;
    if (/"[^"]*$/.test(t) && (t.match(/"/g) || []).length % 2 === 1) return true;
    if (/,\s*$/.test(t)) return true;
    return false;
  }

  /**
   * Parse with multi-stage repair. Sync only (no model call).
   * Returns { spec, method } or { spec: null, truncated, raw }.
   */
  function parseWithRepair(text, opts) {
    opts = opts || {};
    var requireKey = opts.requireKey || null;
    var spec = softParseSpec(text, { requireKey: requireKey });
    if (spec) return { spec: spec, method: 'soft', truncated: false };

    var truncated = isLikelyTruncated(text) || isLikelySkillJson(text, requireKey);
    if (truncated) {
      // one more pass with aggressive on full slice
      var start = String(text).indexOf('{');
      if (start >= 0) {
        var slice = String(text).slice(start);
        try {
          var repaired = aggressiveRepair(slice, requireKey);
          var p = JSON.parse(repaired);
          if (p && (!requireKey || p[requireKey] != null)) {
            return { spec: p, method: 'aggressive', truncated: true };
          }
        } catch (e) {}
      }
    }
    return {
      spec: null,
      method: null,
      truncated: truncated,
      raw: text,
      likely: isLikelySkillJson(text, requireKey),
    };
  }

  /**
   * Ask the model to repair truncated JSON (one shot).
   * @param {string} text - broken output
   * @param {object} opts
   *   requireKey: 'action'|'type'
   *   callModel: async (messages) => string  — host injects callAISimple
   *   skillHint: 'discovery'|'documents'
   */
  async function repairSpecWithModel(text, opts) {
    opts = opts || {};
    var callModel = opts.callModel || g.callAISimple || g.__aetherCallModel;
    if (typeof callModel !== 'function') return null;

    var requireKey = opts.requireKey || 'type';
    var hint =
      opts.skillHint === 'discovery'
        ? 'Valid Discovery actions: search, images, news, places, route, weather. Output ONE JSON object with "action".'
        : 'Valid Documents types: document, presentation, spreadsheet, database, epub, markdown, convert, use-template. Output ONE complete JSON object with "type".';

    var messages = [
      {
        role: 'system',
        content:
          'You repair truncated JSON for an AETHER skill. Output ONLY valid complete JSON. No markdown fences. No commentary. ' +
          hint,
      },
      {
        role: 'user',
        content:
          'This model output was truncated or invalid. Repair it into a complete minimal-but-valid skill JSON.\n\n---\n' +
          String(text).slice(0, 12000) +
          '\n---',
      },
    ];

    try {
      kernelLog('skill.repair', (opts.skillHint || 'skill') + ' model repair', 'call');
      var out = await callModel(messages);
      var parsed = parseWithRepair(out, { requireKey: requireKey });
      if (parsed.spec) {
        kernelLog('skill.repair.ok', parsed.method || 'model', 'call', { ok: true });
        return parsed.spec;
      }
      // try soft only on raw model out
      return softParseSpec(out, { requireKey: requireKey });
    } catch (e) {
      kernelLog('skill.repair.ERR', e.message || String(e), 'call', { ok: false });
      return null;
    }
  }

  /**
   * Full pipeline: soft → aggressive → optional model repair.
   */
  async function parseWithRetry(text, opts) {
    opts = opts || {};
    var first = parseWithRepair(text, opts);
    if (first.spec) return first;

    if (opts.allowModelRepair !== false && (first.truncated || first.likely)) {
      var fixed = await repairSpecWithModel(text, opts);
      if (fixed) return { spec: fixed, method: 'model', truncated: true };
    }
    return first;
  }

  function kernelLog(syscall, detail, cls, extra) {
    try {
      if (g.AETHER_Kernel && typeof g.AETHER_Kernel.log === 'function') {
        g.AETHER_Kernel.log(syscall, detail, cls || 'call', extra || {});
        return;
      }
    } catch (e) {}
  }

  function kernelFlight(kind, goal) {
    try {
      if (g.AETHER_Kernel && typeof g.AETHER_Kernel.beginFlight === 'function') {
        if (!g.AETHER_Kernel.getActive || !g.AETHER_Kernel.getActive()) {
          g.AETHER_Kernel.beginFlight({ kind: kind || 'skill', goal: goal || 'skill' });
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  function kernelEnd(status) {
    try {
      if (g.AETHER_Kernel && g.AETHER_Kernel.getActive && g.AETHER_Kernel.getActive()) {
        g.AETHER_Kernel.endFlight(status || 'landed');
      }
    } catch (e) {}
  }

  /**
   * Sync Discovery KeyStore from Aether hooks / localStorage aliases.
   */
  function syncKeysFromHost(KeyStore) {
    if (!KeyStore || typeof KeyStore.set !== 'function') return;
    var map = {
      tavily: ['tavily', 'aether_hook_tavily', 'hooks_tavily'],
      serper: ['serper', 'aether_hook_serper', 'hooks_serper'],
      brave: ['brave', 'aether_hook_brave', 'hooks_brave'],
      openweather: ['openweather', 'aether_hook_openweather', 'openweathermap'],
    };

    // Prefer in-memory hooksConfig if main app exposed it
    var hooks = g.hooksConfig || g.__AETHER_HOOKS || null;
    if (hooks && typeof hooks === 'object') {
      if (hooks.tavily) KeyStore.set('tavily', hooks.tavily);
      if (hooks.serper) KeyStore.set('serper', hooks.serper);
      if (hooks.brave) KeyStore.set('brave', hooks.brave);
      if (hooks.openweather || hooks.openWeather) KeyStore.set('openweather', hooks.openweather || hooks.openWeather);
    }

    try {
      Object.keys(map).forEach(function (provider) {
        if (KeyStore.has && KeyStore.has(provider)) return;
        var keys = map[provider];
        for (var i = 0; i < keys.length; i++) {
          var v = localStorage.getItem(keys[i]) || localStorage.getItem('aether_key_' + provider);
          if (v) {
            KeyStore.set(provider, v);
            break;
          }
        }
      });
    } catch (e) {}

    // Main app often stores encrypted hooks under aether_hooks — try plain JSON mirror
    try {
      var plain = localStorage.getItem('aether_hooks_plain');
      if (plain) {
        var p = JSON.parse(plain);
        ['tavily', 'serper', 'brave', 'openweather'].forEach(function (k) {
          if (p[k] && (!KeyStore.has || !KeyStore.has(k))) KeyStore.set(k, p[k]);
        });
      }
    } catch (e) {}
  }

  /** Resolve skill by registry key or skill.name (uses SkillsPack when present). */
  function resolveSkill(registry, idOrName) {
    if (g.AETHER_SkillsPack && typeof g.AETHER_SkillsPack.resolveSkill === 'function') {
      return g.AETHER_SkillsPack.resolveSkill(registry, idOrName);
    }
    if (!registry || !idOrName) return null;
    if (registry[idOrName]) return registry[idOrName];
    var keys = Object.keys(registry);
    for (var i = 0; i < keys.length; i++) {
      if (registry[keys[i]] && registry[keys[i]].name === idOrName) return registry[keys[i]];
    }
    return null;
  }

  g.AETHER_SkillUtils = {
    softParseSpec: softParseSpec,
    repairJson: repairJson,
    aggressiveRepair: aggressiveRepair,
    normalizeSkillSpec: normalizeSkillSpec,
    isLikelyTruncated: isLikelyTruncated,
    isLikelySkillJson: isLikelySkillJson,
    parseWithRepair: parseWithRepair,
    resolveSkill: resolveSkill,
    parseWithRetry: parseWithRetry,
    repairSpecWithModel: repairSpecWithModel,
    kernelLog: kernelLog,
    kernelFlight: kernelFlight,
    kernelEnd: kernelEnd,
    syncKeysFromHost: syncKeysFromHost,
    version: '1.3.0',
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
