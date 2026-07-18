/**
 * AETHER Tool Packs — MCP-style capability packs (zero-backend)
 * Enable/disable groups of tools; custom packs via localStorage JSON.
 *
 * Built-in packs mirror common MCP server roles without a server.
 */
(function (g) {
  'use strict';

  var STATE_KEY = 'aether_tool_packs_v1';
  var CUSTOM_KEY = 'aether_tool_packs_custom_v1';

  var BUILTIN = {
    filesystem: {
      id: 'filesystem',
      label: 'Filesystem',
      desc: 'Read/write/patch project files + shell',
      icon: '📂',
      tools: [
        'fs_read',
        'fs_write',
        'fs_patch',
        'search_replace',
        'fs_list',
        'fs_stat',
        'fs_exists',
        'fs_mkdir',
        'fs_rename',
        'fs_copy',
        'fs_delete',
        'shell',
        'read_file',
        'write_file',
        'glob',
        'grep_files',
      ],
      defaultOn: true,
      codingOnly: true,
    },
    web: {
      id: 'web',
      label: 'Web',
      desc: 'Search & scrape (needs API keys in Hooks)',
      icon: '🌐',
      tools: ['web_search', 'scrape', 'crawl', 'get_weather'],
      defaultOn: true,
    },
    github: {
      id: 'github',
      label: 'GitHub',
      desc: 'Issues, files, commits',
      icon: '🐙',
      tools: [
        'github_create_issue',
        'github_list_repos',
        'github_get_file',
        'github_commit',
        'github_list_issues',
      ],
      defaultOn: false,
    },
    collab: {
      id: 'collab',
      label: 'Collab',
      desc: 'Slack · Notion · Trello · Email',
      icon: '💬',
      tools: [
        'slack_post',
        'slack_read',
        'notion_query',
        'notion_add',
        'trello_boards',
        'trello_cards',
        'trello_create_card',
        'email_send',
      ],
      defaultOn: false,
    },
    calendar: {
      id: 'calendar',
      label: 'Calendar',
      desc: 'Google Calendar events & day plan',
      icon: '📅',
      tools: ['cal_events', 'cal_create', 'day_plan'],
      defaultOn: false,
    },
    puter: {
      id: 'puter',
      label: 'Puter Cloud',
      desc: 'Cloud terminal, deploy, storage',
      icon: '☁',
      tools: [
        'puter_browse',
        'puter_screenshot',
        'puter_terminal',
        'puter_read_file',
        'puter_write_file',
        'puter_list_dir',
        'puter_mkdir',
        'puter_ai',
        'puter_deploy',
      ],
      defaultOn: false,
    },
    x: {
      id: 'x',
      label: 'X / Twitter',
      desc: 'Search tweets & profiles',
      icon: '𝕏',
      tools: ['x_search', 'x_user_tweets', 'x_get_user'],
      defaultOn: false,
    },
    agents: {
      id: 'agents',
      label: 'Agents',
      desc: 'Subagents, browser, tasks, cron',
      icon: '🤖',
      tools: [
        'browser_agent',
        'task_create',
        'task_get',
        'task_update',
        'cron_create',
        'cron_list',
        'cron_delete',
        'send_message',
      ],
      defaultOn: true,
    },
  };

  function loadState() {
    try {
      var s = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
      // defaults
      Object.keys(BUILTIN).forEach(function (id) {
        if (s[id] === undefined) s[id] = !!BUILTIN[id].defaultOn;
      });
      return s;
    } catch (e) {
      var d = {};
      Object.keys(BUILTIN).forEach(function (id) {
        d[id] = !!BUILTIN[id].defaultOn;
      });
      return d;
    }
  }

  function saveState(s) {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(s));
    } catch (e) {}
  }

  function loadCustom() {
    try {
      return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveCustom(list) {
    try {
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(list.slice(0, 20)));
    } catch (e) {}
  }

  function allPacks() {
    var list = Object.keys(BUILTIN).map(function (id) {
      return BUILTIN[id];
    });
    loadCustom().forEach(function (c) {
      list.push(c);
    });
    return list;
  }

  function isEnabled(id) {
    var s = loadState();
    return !!s[id];
  }

  function setEnabled(id, on) {
    var s = loadState();
    s[id] = !!on;
    saveState(s);
    applyGate();
    renderUI();
    if (g.showNotification) {
      g.showNotification('Pack ' + id + ': ' + (on ? 'ON' : 'OFF'), 'info');
    }
  }

  function toggle(id) {
    setEnabled(id, !isEnabled(id));
  }

  /**
   * Tools allowed by currently enabled packs.
   * If a tool isn't in any pack, allow it (forward-compat).
   */
  function allowedTools() {
    var set = {};
    var anyPackMentions = {};
    allPacks().forEach(function (p) {
      (p.tools || []).forEach(function (t) {
        anyPackMentions[t] = true;
        if (isEnabled(p.id)) set[t] = true;
      });
    });
    return { allowed: set, known: anyPackMentions };
  }

  function isToolAllowed(name) {
    name = String(name || '').toLowerCase().replace(/[^a-z_]/g, '');
    var a = allowedTools();
    // Unknown tools always allowed (not gated by packs)
    if (!a.known[name]) return true;
    return !!a.allowed[name];
  }

  /**
   * Wrap TOOL_REGISTRY call path — install once.
   */
  function applyGate() {
    if (g.__aetherToolPackGateInstalled) return;
    // Monkey-patch is optional; script.js callTool can consult isToolAllowed
    g.__aetherToolPackGateInstalled = true;
  }

  /**
   * Register a custom pack from JSON:
   * { id, label, desc, tools: string[], defaultOn? }
   */
  function registerCustom(pack) {
    if (!pack || !pack.id || !pack.tools) {
      if (g.showNotification) g.showNotification('Invalid pack JSON', 'error');
      return false;
    }
    pack.id = String(pack.id).replace(/[^a-z0-9_-]/gi, '').toLowerCase();
    pack.label = pack.label || pack.id;
    pack.desc = pack.desc || 'Custom pack';
    pack.icon = pack.icon || '📦';
    pack.tools = (pack.tools || []).map(String);
    var list = loadCustom().filter(function (p) {
      return p.id !== pack.id;
    });
    list.push(pack);
    saveCustom(list);
    var st = loadState();
    if (st[pack.id] === undefined) {
      st[pack.id] = pack.defaultOn !== false;
      saveState(st);
    }
    renderUI();
    if (g.showNotification) g.showNotification('Pack registered: ' + pack.id, 'success');
    return true;
  }

  /**
   * Import pack from JSON string (MCP-ish manifest)
   * Accepts {id,label,tools} or {name, tools:[{name}]} 
   */
  function importJSON(raw) {
    try {
      var j = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(j)) {
        var n = 0;
        j.forEach(function (p) {
          if (importOne(p)) n++;
        });
        return n > 0;
      }
      return importOne(j);
    } catch (e) {
      if (g.showNotification) g.showNotification('Pack import failed: ' + e.message, 'error');
      return false;
    }
  }

  function importOne(j) {
    if (!j) return false;
    var tools = j.tools;
    if (tools && tools.length && typeof tools[0] === 'object') {
      tools = tools.map(function (t) {
        return t.name || t.id || t.tool;
      });
    }
    return registerCustom({
      id: j.id || j.name || j.server,
      label: j.label || j.name || j.id,
      desc: j.desc || j.description || 'Imported pack',
      icon: j.icon || '📦',
      tools: tools || [],
      defaultOn: j.defaultOn !== false,
    });
  }

  function promptImport() {
    var raw = window.prompt(
      'Paste tool pack JSON or MCP tools/list:\n' +
        '{"id":"my-pack","tools":["fs_read"]}\n' +
        'or MCP: {"tools":[{"name":"ping","inputSchema":{...}}]}',
      ''
    );
    if (!raw) return;
    // Prefer MCP bridge if payload looks like MCP tool descriptors
    try {
      var j = JSON.parse(raw);
      var looksMcp =
        (j.tools && j.tools[0] && typeof j.tools[0] === 'object' && (j.tools[0].inputSchema || j.tools[0].input_schema)) ||
        (j.name && (j.inputSchema || j.input_schema)) ||
        j.endpoint ||
        j.jsonrpc;
      if (looksMcp && g.AETHER_MCP && g.AETHER_MCP.importJSON) {
        g.AETHER_MCP.importJSON(raw);
        return;
      }
    } catch (e) {}
    importJSON(raw);
  }

  function promptForPrompt() {
    // Tools list for system prompt injection
    var on = allPacks().filter(function (p) {
      return isEnabled(p.id);
    });
    if (!on.length) return '';
    return (
      '\n## Enabled tool packs\n' +
      on
        .map(function (p) {
          return '- **' + p.label + '**: ' + (p.tools || []).join(', ');
        })
        .join('\n') +
      '\n'
    );
  }

  function renderUI() {
    var host = document.getElementById('code-tool-packs');
    if (!host) {
      host = document.createElement('div');
      host.id = 'code-tool-packs';
      host.className = 'code-tool-packs';
      // Prefer right rail bottom
      var rail = document.getElementById('code-right-rail');
      if (rail) {
        var sec = document.createElement('div');
        sec.className = 'code-rail-section';
        sec.innerHTML = '<div class="code-rail-hdr">TOOL PACKS</div>';
        sec.appendChild(host);
        rail.appendChild(sec);
      } else if (document.body) {
        document.body.appendChild(host);
      } else {
        return; // DOM not ready
      }
    }
    var on =
      (g.state && g.state.codingMode) ||
      (document.body && document.body.classList.contains('coding-mode'));
    // Always keep packs usable; only expand in coding mode UI
    host.closest && host.closest('.code-rail-section');
    var packs = allPacks();
    host.innerHTML =
      packs
        .map(function (p) {
          var en = isEnabled(p.id);
          return (
            '<label class="tp-pack' +
            (en ? ' on' : '') +
            '" title="' +
            String(p.desc || '').replace(/"/g, '') +
            '">' +
            '<input type="checkbox" data-pack="' +
            p.id +
            '"' +
            (en ? ' checked' : '') +
            '> ' +
            '<span class="tp-icon">' +
            (p.icon || '📦') +
            '</span> ' +
            '<span class="tp-label">' +
            (p.label || p.id) +
            '</span>' +
            '<span class="tp-count">' +
            (p.tools || []).length +
            '</span>' +
            '</label>'
          );
        })
        .join('') +
      '<button type="button" class="code-rail-btn tp-import" id="tp-import-btn" title="Import pack JSON">+ Import pack</button>' +
      '<button type="button" class="code-rail-btn tp-import" id="tp-mcp-btn" title="Import MCP tools/list or connect bridge">+ MCP</button>';
    host.querySelectorAll('input[data-pack]').forEach(function (inp) {
      inp.onchange = function () {
        setEnabled(inp.getAttribute('data-pack'), inp.checked);
      };
    });
    var ib = document.getElementById('tp-import-btn');
    if (ib) ib.onclick = promptImport;
    var mb = document.getElementById('tp-mcp-btn');
    if (mb)
      mb.onclick = function () {
        if (g.AETHER_MCP && g.AETHER_MCP.promptImport) g.AETHER_MCP.promptImport();
        else if (g.showNotification) g.showNotification('MCP bridge offline', 'warn');
      };
  }

  function listMarkdown() {
    return allPacks()
      .map(function (p) {
        return (
          (isEnabled(p.id) ? '✅' : '⬜') +
          ' **' +
          p.label +
          '** (`' +
          p.id +
          '`) — ' +
          p.desc +
          '\n  tools: ' +
          (p.tools || []).join(', ')
        );
      })
      .join('\n');
  }

  g.AETHER_ToolPacks = {
    BUILTIN: BUILTIN,
    allPacks: allPacks,
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    toggle: toggle,
    isToolAllowed: isToolAllowed,
    allowedTools: allowedTools,
    registerCustom: registerCustom,
    importJSON: importJSON,
    promptImport: promptImport,
    promptForPrompt: promptForPrompt,
    renderUI: renderUI,
    listMarkdown: listMarkdown,
    applyGate: applyGate,
  };

  function boot() {
    applyGate();
    renderUI();
    if (document.body) {
      var obs = new MutationObserver(function () {
        renderUI();
      });
      obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(boot, 700);
    });
  } else {
    setTimeout(boot, 700);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
