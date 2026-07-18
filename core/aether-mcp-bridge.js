/**
 * AETHER MCP Bridge (Phase B) — browser-safe MCP-compatible tool import
 *
 * Does NOT spawn stdio MCP servers (impossible pure-browser).
 * Does:
 *  - Import MCP tool descriptors (tools/list shape) → TOOL_REGISTRY
 *  - Route calls through callTool / Tool Runtime envelopes
 *  - Optional HTTP/JSON-RPC transport to a local bridge (localhost)
 *  - Alias match: if tool name already exists in Aether, re-use it
 *  - Register a Tool Pack for enable/disable
 *
 * Spec-inspired shapes:
 *  { tools: [ { name, description, inputSchema } ] }
 *  { name, description, inputSchema }  // single tool
 *  { server, endpoint, tools: [...] }  // full server import
 */
(function (g) {
  'use strict';

  var STORE_KEY = 'aether_mcp_servers_v1';
  var MAX_SERVERS = 20;
  var MAX_RESULT = 14000;

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function loadServers() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveServers(list) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, MAX_SERVERS)));
    } catch (e) {}
  }

  function sanitizeId(s) {
    return String(s || 'mcp')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 48);
  }

  function sanitizeToolName(s) {
    return String(s || 'tool')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^([0-9])/, '_$1')
      .slice(0, 64);
  }

  /**
   * Normalize various MCP-ish payloads into { tools: [...] }
   */
  function extractTools(raw) {
    var j = raw;
    if (typeof raw === 'string') {
      try {
        j = JSON.parse(raw);
      } catch (e) {
        throw new Error('Invalid JSON: ' + e.message);
      }
    }
    if (!j) throw new Error('Empty MCP payload');

    // JSON-RPC result wrapper
    if (j.result && j.result.tools) j = j.result;
    if (j.result && Array.isArray(j.result) && j.result[0] && j.result[0].name) {
      return { tools: j.result, meta: j };
    }

    // Standard tools/list
    if (Array.isArray(j.tools)) return { tools: j.tools, meta: j };
    if (Array.isArray(j)) return { tools: j, meta: {} };

    // Single tool
    if (j.name && (j.inputSchema || j.input_schema || j.parameters || j.description != null)) {
      return { tools: [j], meta: {} };
    }

    // Nested server
    if (j.server && j.server.tools) return { tools: j.server.tools, meta: j.server };

    throw new Error('Unrecognized MCP shape — need tools[] or {name,inputSchema}');
  }

  function normalizeToolDesc(t) {
    if (!t || !t.name) return null;
    var schema = t.inputSchema || t.input_schema || t.parameters || {
      type: 'object',
      properties: { query: { type: 'string' } },
    };
    // OpenAI-style nested
    if (schema && schema.type === 'object' && schema.properties) {
      /* ok */
    } else if (t.function && t.function.parameters) {
      schema = t.function.parameters;
    }
    return {
      name: sanitizeToolName(t.name),
      originalName: t.name,
      description: t.description || t.desc || t.name,
      inputSchema: schema,
    };
  }

  function getRegistry() {
    return g.TOOL_REGISTRY || g.__AETHER_TOOL_REGISTRY || null;
  }

  /**
   * HTTP JSON-RPC tools/call against a local bridge endpoint.
   */
  async function httpToolsCall(endpoint, toolName, args, timeoutMs) {
    timeoutMs = timeoutMs || 30000;
    if (g.AETHER_Security && g.AETHER_Security.validateUrl) {
      var vu = g.AETHER_Security.validateUrl(endpoint, { localhostOnly: true });
      if (!vu.ok) throw new Error('MCP endpoint blocked: ' + vu.error);
      endpoint = vu.url;
    }
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller
      ? setTimeout(function () {
          controller.abort();
        }, timeoutMs)
      : null;
    try {
      var res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: args && typeof args === 'object' && !Array.isArray(args) ? args : { query: args },
          },
        }),
        signal: controller ? controller.signal : undefined,
      });
      if (!res.ok) {
        var errText = await res.text().catch(function () {
          return '';
        });
        throw new Error('HTTP ' + res.status + (errText ? ': ' + errText.slice(0, 200) : ''));
      }
      var data = await res.json();
      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }
      var result = data.result != null ? data.result : data;
      // MCP content array
      if (result && Array.isArray(result.content)) {
        return result.content
          .map(function (c) {
            if (typeof c === 'string') return c;
            if (c && c.text) return c.text;
            if (c && c.type === 'text' && c.text) return c.text;
            return JSON.stringify(c);
          })
          .join('\n');
      }
      if (typeof result === 'string') return result;
      return JSON.stringify(result, null, 2);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function httpToolsList(endpoint, timeoutMs) {
    timeoutMs = timeoutMs || 20000;
    if (g.AETHER_Security && g.AETHER_Security.validateUrl) {
      var vu = g.AETHER_Security.validateUrl(endpoint, { localhostOnly: true });
      if (!vu.ok) throw new Error('MCP endpoint blocked: ' + vu.error);
      endpoint = vu.url;
    }
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller
      ? setTimeout(function () {
          controller.abort();
        }, timeoutMs)
      : null;
    try {
      var res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/list',
          params: {},
        }),
        signal: controller ? controller.signal : undefined,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      if (data.error) throw new Error(data.error.message || 'tools/list error');
      var tools = (data.result && data.result.tools) || data.tools || [];
      return tools;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Build a TOOL_REGISTRY fn for an MCP tool descriptor.
   */
  function makeToolFn(server, toolDesc) {
    var originalName = toolDesc.originalName || toolDesc.name;
    var localName = toolDesc.name;
    var endpoint = server.endpoint || '';
    var transport = server.transport || (endpoint ? 'http' : 'alias');

    return async function mcpToolFn(arg) {
      // Prefer alias to native Aether tool if same name exists and not self
      var reg = getRegistry();
      if (transport === 'alias' || transport === 'auto') {
        if (reg && reg[localName] && reg[localName]._mcp !== true && typeof reg[localName].fn === 'function') {
          // Avoid recursion: call native
          return reg[localName].fn(typeof arg === 'string' ? arg : arg);
        }
        // Try common renames
        var aliasMap = {
          read_file: 'fs_read',
          write_file: 'fs_write',
          list_directory: 'fs_list',
          search_files: 'grep_files',
          run_terminal_cmd: 'shell',
          bash: 'shell',
        };
        var mapped = aliasMap[localName] || aliasMap[originalName];
        if (mapped && reg && reg[mapped] && typeof reg[mapped].fn === 'function') {
          var packed = arg;
          if (g.AETHER_ToolRuntime && g.AETHER_ToolRuntime.normalizeArgs) {
            var n = g.AETHER_ToolRuntime.normalizeArgs(mapped, arg);
            return reg[mapped].fn.apply(null, n.callArgs);
          }
          return reg[mapped].fn(typeof packed === 'string' ? packed : packed);
        }
        if (!endpoint) {
          return (
            'ok=false error=MCP tool "' +
            originalName +
            '" has no HTTP endpoint and no native Aether alias. ' +
            'Re-import with endpoint (local bridge) or use a matching Aether tool name.'
          );
        }
      }

      if (!endpoint) {
        return 'ok=false error=No MCP endpoint configured for server ' + server.id;
      }

      // Normalize args to object for MCP
      var argsObj = arg;
      if (typeof arg === 'string') {
        try {
          argsObj = JSON.parse(arg);
        } catch (e) {
          // Map string to first required property or query
          var schema = toolDesc.inputSchema || {};
          var req = (schema.required && schema.required[0]) || 'query';
          argsObj = {};
          argsObj[req] = arg;
        }
      } else if (arg == null) {
        argsObj = {};
      }

      var text = await httpToolsCall(endpoint, originalName, argsObj, server.timeout || 30000);
      if (String(text).length > MAX_RESULT) {
        text = String(text).slice(0, MAX_RESULT) + '\n…[truncated]';
      }
      return text;
    };
  }

  /**
   * Register MCP tools onto TOOL_REGISTRY + tool pack.
   */
  function registerServer(spec) {
    spec = spec || {};
    var id = sanitizeId(spec.id || spec.name || spec.server || 'mcp_' + Date.now().toString(36));
    var label = spec.label || spec.name || spec.server || id;
    var endpoint = (spec.endpoint || spec.url || '').trim();
    var transport = (spec.transport || (endpoint ? 'http' : 'auto')).toLowerCase();
    var extracted = extractTools(spec.tools != null ? { tools: spec.tools } : spec);
    var tools = (extracted.tools || []).map(normalizeToolDesc).filter(Boolean);
    if (!tools.length) throw new Error('No tools in MCP payload');

    var server = {
      id: id,
      label: label,
      desc: spec.desc || spec.description || 'MCP-compatible tools',
      endpoint: endpoint,
      transport: transport,
      timeout: spec.timeout || 30000,
      tools: tools,
      t: Date.now(),
    };

    var reg = getRegistry();
    if (!reg) throw new Error('TOOL_REGISTRY not ready');

    var registeredNames = [];
    tools.forEach(function (td) {
      // Avoid clobbering core tools unless force
      var name = td.name;
      if (reg[name] && !reg[name]._mcp && !spec.force) {
        // Prefix with server id
        name = sanitizeToolName(id + '_' + td.name);
      }
      reg[name] = {
        fn: makeToolFn(server, td),
        desc: '[MCP:' + label + '] ' + td.description,
        meta: {
          name: name,
          class: transport === 'http' ? 'net' : 'call',
          timeout: server.timeout,
          maxResult: MAX_RESULT,
          desc: td.description,
          schema: td.inputSchema,
          mcp: true,
          mcpServer: id,
          originalName: td.originalName,
        },
        _mcp: true,
        _mcpServer: id,
      };
      registeredNames.push(name);
      // Also register under original name if free
      if (td.originalName && td.originalName !== name && !reg[sanitizeToolName(td.originalName)]) {
        var on = sanitizeToolName(td.originalName);
        reg[on] = reg[name];
        registeredNames.push(on);
      }
    });

    server.registeredNames = registeredNames;

    // Persist
    var list = loadServers().filter(function (s) {
      return s.id !== id;
    });
    list.unshift(server);
    saveServers(list);

    // Tool pack
    if (g.AETHER_ToolPacks && g.AETHER_ToolPacks.registerCustom) {
      g.AETHER_ToolPacks.registerCustom({
        id: 'mcp_' + id,
        label: 'MCP: ' + label,
        desc: server.desc + (endpoint ? ' @ ' + endpoint : ' (alias/local)'),
        icon: '🔌',
        tools: registeredNames,
        defaultOn: true,
      });
    }

    try {
      if (g.AETHER_ToolRuntime && g.AETHER_ToolRuntime.enrichRegistry) {
        g.AETHER_ToolRuntime.enrichRegistry(reg);
      }
    } catch (e) {}

    if (g.showNotification) {
      g.showNotification('MCP: ' + registeredNames.length + ' tools from ' + label, 'success');
    }
    return server;
  }

  /**
   * Import from pasted JSON (descriptors only or full server).
   */
  function importJSON(raw) {
    try {
      var j = typeof raw === 'string' ? JSON.parse(raw) : raw;
      // If looks like tools/list only
      if (j.tools || Array.isArray(j) || j.name) {
        return registerServer({
          id: j.id || j.server || j.name || 'imported',
          label: j.label || j.server || j.name || 'Imported MCP',
          endpoint: j.endpoint || j.url || '',
          transport: j.transport,
          tools: j.tools || (Array.isArray(j) ? j : [j]),
          desc: j.description || j.desc,
          force: !!j.force,
        });
      }
      return registerServer(j);
    } catch (e) {
      if (g.showNotification) g.showNotification('MCP import failed: ' + e.message, 'error');
      return null;
    }
  }

  /**
   * Fetch tools/list from endpoint then register.
   */
  async function importFromEndpoint(endpoint, opts) {
    opts = opts || {};
    endpoint = String(endpoint || '').trim();
    if (!endpoint) throw new Error('endpoint required');
    // Browser security: only allow http(s) localhost / private by user choice
    var tools = await httpToolsList(endpoint, opts.timeout || 20000);
    return registerServer({
      id: opts.id || 'remote_' + Date.now().toString(36),
      label: opts.label || endpoint.replace(/^https?:\/\//, '').slice(0, 32),
      endpoint: endpoint,
      transport: 'http',
      tools: tools,
      desc: 'Remote MCP bridge',
      timeout: opts.timeout || 30000,
    });
  }

  function promptImport() {
    var raw = window.prompt(
      'Paste MCP tools JSON (tools/list) or server manifest.\n\n' +
        'Example:\n{"id":"demo","endpoint":"http://127.0.0.1:3921/mcp","tools":[{"name":"ping","description":"Ping","inputSchema":{"type":"object","properties":{}}}]}',
      ''
    );
    if (!raw) return null;
    // If user pasted only a URL
    if (/^https?:\/\//i.test(raw.trim()) && raw.trim().indexOf('{') === -1) {
      return importFromEndpoint(raw.trim()).catch(function (e) {
        if (g.showNotification) g.showNotification('MCP fetch failed: ' + e.message, 'error');
        return null;
      });
    }
    return Promise.resolve(importJSON(raw));
  }

  function uninstall(serverId) {
    var reg = getRegistry();
    var list = loadServers();
    var srv = list.find(function (s) {
      return s.id === serverId;
    });
    if (srv && reg) {
      (srv.registeredNames || []).forEach(function (n) {
        if (reg[n] && reg[n]._mcpServer === serverId) delete reg[n];
      });
    }
    list = list.filter(function (s) {
      return s.id !== serverId;
    });
    saveServers(list);
    if (g.showNotification) g.showNotification('MCP server removed: ' + serverId, 'info');
    return true;
  }

  /**
   * Re-hydrate TOOL_REGISTRY from localStorage on boot.
   */
  function hydrate() {
    var reg = getRegistry();
    if (!reg) return 0;
    var n = 0;
    loadServers().forEach(function (srv) {
      try {
        // Re-register without duplicating pack spam — silent
        var tools = srv.tools || [];
        tools.forEach(function (td) {
          var name = td.name;
          if (reg[name] && !reg[name]._mcp && !srv.force) {
            name = sanitizeToolName(srv.id + '_' + td.name);
          }
          reg[name] = {
            fn: makeToolFn(srv, td),
            desc: '[MCP:' + srv.label + '] ' + (td.description || td.name),
            meta: {
              name: name,
              class: srv.endpoint ? 'net' : 'call',
              timeout: srv.timeout || 30000,
              maxResult: MAX_RESULT,
              desc: td.description,
              schema: td.inputSchema,
              mcp: true,
              mcpServer: srv.id,
              originalName: td.originalName || td.name,
            },
            _mcp: true,
            _mcpServer: srv.id,
          };
          n++;
        });
        if (g.AETHER_ToolPacks && g.AETHER_ToolPacks.registerCustom) {
          g.AETHER_ToolPacks.registerCustom({
            id: 'mcp_' + srv.id,
            label: 'MCP: ' + srv.label,
            desc: srv.desc || 'MCP tools',
            icon: '🔌',
            tools: srv.registeredNames || tools.map(function (t) {
              return t.name;
            }),
            defaultOn: true,
          });
        }
      } catch (e) {}
    });
    try {
      if (g.AETHER_ToolRuntime) g.AETHER_ToolRuntime.enrichRegistry(reg);
    } catch (e2) {}
    return n;
  }

  function listMarkdown() {
    var list = loadServers();
    if (!list.length) return '_No MCP servers imported. Use /mcp or paste tools/list JSON._';
    return list
      .map(function (s) {
        return (
          '### 🔌 ' +
          esc(s.label) +
          ' (`' +
          s.id +
          '`)\n' +
          '- transport: `' +
          (s.transport || 'auto') +
          '`\n' +
          (s.endpoint ? '- endpoint: `' + s.endpoint + '`\n' : '- endpoint: _(none — alias mode)_\n') +
          '- tools: ' +
          (s.tools || [])
            .map(function (t) {
              return '`' + t.name + '`';
            })
            .join(' · ')
        );
      })
      .join('\n\n');
  }

  function promptSnippet() {
    var list = loadServers();
    if (!list.length) return '';
    var lines = ['\n## MCP-compatible tools (imported)'];
    list.forEach(function (s) {
      lines.push(
        '- **' +
          s.label +
          '**: ' +
          (s.registeredNames || (s.tools || []).map(function (t) {
            return t.name;
          })).join(', ')
      );
    });
    return lines.join('\n') + '\n';
  }

  g.AETHER_MCP = {
    importJSON: importJSON,
    importFromEndpoint: importFromEndpoint,
    registerServer: registerServer,
    promptImport: promptImport,
    uninstall: uninstall,
    hydrate: hydrate,
    loadServers: loadServers,
    listMarkdown: listMarkdown,
    promptSnippet: promptSnippet,
    httpToolsList: httpToolsList,
    extractTools: extractTools,
  };

  // Hydrate after TOOL_REGISTRY exists (script.js loads after this file)
  function boot() {
    // Retry until registry ready
    var tries = 0;
    var tick = function () {
      tries++;
      if (getRegistry()) {
        var n = hydrate();
        if (n && g.console) console.log('[AETHER MCP] hydrated ' + n + ' tools');
        return;
      }
      if (tries < 40) setTimeout(tick, 200);
    };
    setTimeout(tick, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
