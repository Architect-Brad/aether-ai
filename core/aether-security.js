/**
 * AETHER Security Hardening
 * - Path traversal guards
 * - Shell allowlist / denylist
 * - Secret redaction (logs, history, tool previews)
 * - URL / SSRF guards for MCP & fetch tools
 * - Safe HTML escape
 * - Tool rate limiting
 * - Expanded destructive tool set
 */
(function (g) {
  'use strict';

  var RATE_WINDOW_MS = 10000;
  var RATE_MAX_CALLS = 40;
  var _rateBucket = [];
  var _sessionFlags = {
    confirmAllWrites: true,
    blockPrivateHttp: true, // SSRF: block non-localhost private IPs for remote fetches
    allowPuterTerminal: true,
  };

  // ─── HTML ──────────────────────────────────────────────────

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Strip script/style/event-handler attrs from a simple HTML subset (not a full sanitizer) */
  function stripDangerousHtml(html) {
    return String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/javascript:/gi, 'blocked:')
      .replace(/data:text\/html/gi, 'blocked:');
  }

  // ─── Secrets ───────────────────────────────────────────────

  var SECRET_PATTERNS = [
    /\b(sk-[a-zA-Z0-9]{20,})\b/g,
    /\b(sk-ant-[a-zA-Z0-9\-_]{20,})\b/g,
    /\b(sk-or-[a-zA-Z0-9\-_]{20,})\b/g,
    /\b(xai-[a-zA-Z0-9]{20,})\b/g,
    /\b(ghp_[a-zA-Z0-9]{20,})\b/g,
    /\b(gho_[a-zA-Z0-9]{20,})\b/g,
    /\b(github_pat_[a-zA-Z0-9_]{20,})\b/g,
    /\b(xox[baprs]-[a-zA-Z0-9-]{10,})\b/g,
    /\b(AKIA[0-9A-Z]{16})\b/g,
    /\b(AIza[0-9A-Za-z\-_]{20,})\b/g,
    /\b(Bearer\s+[a-zA-Z0-9\-._~+/]+=*)\b/gi,
    /\b(api[_-]?key\s*[:=]\s*['"]?)([a-zA-Z0-9\-._]{16,})/gi,
    /\b(password\s*[:=]\s*['"]?)([^\s'"]{6,})/gi,
    /\b(secret\s*[:=]\s*['"]?)([^\s'"]{8,})/gi,
  ];

  function redactSecrets(text) {
    var s = String(text == null ? '' : text);
    for (var i = 0; i < SECRET_PATTERNS.length; i++) {
      s = s.replace(SECRET_PATTERNS[i], function () {
        if (arguments.length >= 3 && typeof arguments[1] === 'string' && arguments[1].length < 40) {
          // groups like api_key=
          return arguments[1] + '[REDACTED]';
        }
        return '[REDACTED]';
      });
    }
    return s;
  }

  // ─── Paths ─────────────────────────────────────────────────

  /**
   * Normalize and reject path traversal / absolute escapes outside folder root.
   * Returns { ok, path, error }
   */
  function safePath(input) {
    var p = String(input == null ? '' : input).trim();
    if (!p || p === '.' || p === './') return { ok: true, path: '' };
    // Null bytes
    if (p.indexOf('\0') !== -1) return { ok: false, path: '', error: 'null byte in path' };
    // Windows drive / UNC
    if (/^[a-zA-Z]:[\\/]/.test(p) || p.indexOf('\\\\') === 0) {
      return { ok: false, path: '', error: 'absolute/UNC paths not allowed' };
    }
    // Leading slash → treat as relative to project root
    p = p.replace(/^\/+/, '');
    var parts = p.split(/[/\\]+/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (!part || part === '.') continue;
      if (part === '..') {
        return { ok: false, path: '', error: 'path traversal (..) blocked' };
      }
      // Block weird names
      if (/^~/.test(part)) return { ok: false, path: '', error: 'home-relative paths blocked' };
      out.push(part);
    }
    // Sensitive files (warn-only flag — still allow read of AETHER.md etc., block writes to .git internals)
    var joined = out.join('/');
    return { ok: true, path: joined, sensitive: isSensitivePath(joined) };
  }

  function isSensitivePath(p) {
    p = String(p || '').toLowerCase();
    return (
      /(^|\/)\.env(\.|$)/.test(p) ||
      /(^|\/)\.git(\/|$)/.test(p) ||
      /(^|\/)id_rsa/.test(p) ||
      /(^|\/)id_ed25519/.test(p) ||
      /\.pem$/.test(p) ||
      /\.p12$/.test(p) ||
      /(^|\/)credentials\.json$/.test(p) ||
      /(^|\/)secrets?\//.test(p)
    );
  }

  // ─── Shell ─────────────────────────────────────────────────

  var SHELL_ALLOW = {
    ls: 1, cat: 1, head: 1, tail: 1, wc: 1, grep: 1, find: 1, tree: 1, pwd: 1,
    mkdir: 1, touch: 1, sort: 1, uniq: 1, diff: 1, help: 1, clear: 1, echo: 1,
  };

  var SHELL_DENY_RE = [
    /[;&|`$]/, // chaining / substitution
    /\n/,
    />/,
    /</,
    /\brm\b/i,
    /\bmv\b/i,
    /\bcp\b/i,
    /\bchmod\b/i,
    /\bchown\b/i,
    /\bcurl\b/i,
    /\bwget\b/i,
    /\bnc\b/i,
    /\bpython\b/i,
    /\bnode\b/i,
    /\bbash\b/i,
    /\bsh\b/i,
    /\bsudo\b/i,
    /\bkill\b/i,
    /\bdd\b/i,
    /\bmkfs\b/i,
    /\beval\b/i,
    /\bexec\b/i,
    /\bsource\b/i,
    /\.\.\//,
  ];

  function validateShellCommand(cmd) {
    cmd = String(cmd || '').trim();
    if (!cmd) return { ok: false, error: 'empty command' };
    if (cmd.length > 500) return { ok: false, error: 'command too long' };
    for (var i = 0; i < SHELL_DENY_RE.length; i++) {
      if (SHELL_DENY_RE[i].test(cmd)) {
        return { ok: false, error: 'blocked pattern in shell command (security)' };
      }
    }
    var prog = cmd.split(/\s+/)[0].toLowerCase();
    if (!SHELL_ALLOW[prog]) {
      return {
        ok: false,
        error: 'command not in allowlist: ' + prog + ' (allowed: ' + Object.keys(SHELL_ALLOW).join(', ') + ')',
      };
    }
    // Path args
    var parts = cmd.split(/\s+/).slice(1);
    for (var j = 0; j < parts.length; j++) {
      if (parts[j].startsWith('-')) continue;
      var sp = safePath(parts[j]);
      if (!sp.ok && parts[j].indexOf('/') !== -1) {
        return { ok: false, error: 'unsafe path in shell: ' + sp.error };
      }
    }
    return { ok: true, command: cmd };
  }

  // ─── URLs / SSRF ───────────────────────────────────────────

  function validateUrl(url, opts) {
    opts = opts || {};
    var raw = String(url || '').trim();
    if (!raw) return { ok: false, error: 'empty URL' };
    if (raw.length > 2048) return { ok: false, error: 'URL too long' };

    var host = '';
    var protocol = '';
    var href = raw;
    try {
      var URLImpl = g.URL || (typeof URL !== 'undefined' ? URL : null);
      if (URLImpl) {
        var u = new URLImpl(raw);
        protocol = (u.protocol || '').toLowerCase();
        host = (u.hostname || '').toLowerCase();
        href = u.href;
      } else {
        // Minimal parse fallback
        var m = raw.match(/^(https?):\/\/([^\/\?#:]+)(?::\d+)?/i);
        if (!m) return { ok: false, error: 'invalid URL' };
        protocol = m[1].toLowerCase() + ':';
        host = m[2].toLowerCase();
      }
    } catch (e) {
      return { ok: false, error: 'invalid URL' };
    }

    if (protocol !== 'http:' && protocol !== 'https:') {
      return { ok: false, error: 'only http(s) URLs allowed' };
    }
    if (!host) return { ok: false, error: 'missing host' };

    var isLocal =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host === '::1' ||
      host === '0.0.0.0';

    if (opts.localhostOnly && !isLocal) {
      return { ok: false, error: 'MCP/bridge endpoints must be localhost (got ' + host + ')' };
    }

    // Block obvious private/metadata ranges when blockPrivateHttp
    if (_sessionFlags.blockPrivateHttp && !isLocal && !opts.allowPrivate) {
      if (
        /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.|100\.64\.)/.test(host) ||
        host === 'metadata.google.internal' ||
        host.endsWith('.local') ||
        host === 'metadata'
      ) {
        return { ok: false, error: 'private/metadata host blocked (SSRF guard): ' + host };
      }
    }

    return { ok: true, url: href, host: host, isLocal: isLocal };
  }

  // ─── Destructive tools ─────────────────────────────────────

  var DESTRUCTIVE_TOOLS = [
    'write_file', 'fs_write', 'fs_delete', 'fs_rename', 'fs_copy', 'fs_mkdir',
    'fs_patch', 'search_replace',
    'puter_deploy', 'puter_terminal', 'puter_write_file', 'puter_mkdir',
    'email_send', 'slack_post', 'notion_add',
    'github_commit', 'github_create_issue',
    'jira_create', 'gitlab_mr', 'trello_create_card', 'trello_move_card', 'trello_archive_card',
    'cron_create', 'cron_delete', 'task_create', 'task_update',
    'hue_set', 'cal_create', 'browser_agent',
    'shell', // still allowlisted cmds, but confirm on first use in coding when strict
  ];

  function isDestructive(name) {
    name = String(name || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    return DESTRUCTIVE_TOOLS.indexOf(name) !== -1;
  }

  // ─── Rate limit ────────────────────────────────────────────

  function checkRateLimit() {
    var now = Date.now();
    _rateBucket = _rateBucket.filter(function (t) {
      return now - t < RATE_WINDOW_MS;
    });
    if (_rateBucket.length >= RATE_MAX_CALLS) {
      return {
        ok: false,
        error: 'tool rate limit: max ' + RATE_MAX_CALLS + ' calls / ' + RATE_WINDOW_MS / 1000 + 's',
      };
    }
    _rateBucket.push(now);
    return { ok: true };
  }

  // ─── Pre-flight for callTool ───────────────────────────────

  /**
   * @returns {{ ok:boolean, error?:string, args?:any, preview?:string }}
   */
  function preflightTool(name, args) {
    name = String(name || '').toLowerCase().replace(/[^a-z0-9_]/g, '');

    var rate = checkRateLimit();
    if (!rate.ok) return rate;

    // Shell
    if (name === 'shell' || name === 'ws_shell') {
      var cmd = typeof args === 'string' ? args : (args && (args.command || args.cmd || args.query)) || '';
      var vs = validateShellCommand(cmd);
      if (!vs.ok) return { ok: false, error: vs.error };
      return { ok: true, args: vs.command, preview: redactSecrets(vs.command) };
    }

    // Puter terminal — high risk
    if (name === 'puter_terminal') {
      if (!_sessionFlags.allowPuterTerminal) {
        return { ok: false, error: 'puter_terminal disabled by security policy' };
      }
      var pcmd = typeof args === 'string' ? args : (args && (args.command || args.query)) || '';
      // Soft denylist only (cloud shell is real)
      if (/rm\s+-rf\s+[\/~]/i.test(pcmd) || /curl\s+.*\|\s*(ba)?sh/i.test(pcmd)) {
        return { ok: false, error: 'dangerous puter_terminal command blocked' };
      }
      return { ok: true, args: args, preview: redactSecrets(String(pcmd).slice(0, 200)) };
    }

    // FS path tools
    var pathTools = {
      fs_read: 1, fs_write: 1, fs_delete: 1, fs_list: 1, fs_stat: 1, fs_exists: 1,
      fs_mkdir: 1, fs_rename: 1, fs_copy: 1, fs_patch: 1, search_replace: 1,
      read_file: 1, write_file: 1,
    };
    if (pathTools[name]) {
      var pathCandidate = null;
      if (typeof args === 'string') {
        // path\ncontent or path|||...
        pathCandidate = args.split('\n')[0].split('|||')[0].split('|')[0];
      } else if (args && typeof args === 'object') {
        pathCandidate = args.path || args.file || args.filename || args.oldPath || args.src || args.from;
      }
      if (pathCandidate) {
        var sp = safePath(pathCandidate);
        if (!sp.ok) return { ok: false, error: 'path blocked: ' + sp.error };
        // Block writes to sensitive paths
        if (sp.sensitive && /write|delete|patch|rename|copy|mkdir|search_replace/i.test(name)) {
          return { ok: false, error: 'write to sensitive path blocked: ' + sp.path };
        }
      }
      // rename/copy second path
      if ((name === 'fs_rename' || name === 'fs_copy') && typeof args === 'string' && args.indexOf('|') !== -1) {
        var pair = args.split('|');
        var sp2 = safePath(pair[1]);
        if (!sp2.ok) return { ok: false, error: 'dest path blocked: ' + sp2.error };
      }
    }

    // MCP / HTTP URLs
    if (name === 'scrape' || name === 'crawl' || name === 'puter_browse' || name === 'puter_screenshot') {
      var url = typeof args === 'string' ? args : (args && (args.url || args.query));
      if (url) {
        var vu = validateUrl(url, { allowPrivate: false });
        if (!vu.ok) return { ok: false, error: vu.error };
      }
    }

    var preview =
      typeof args === 'string'
        ? args
        : args && typeof args === 'object'
          ? JSON.stringify(args)
          : String(args || '');
    return { ok: true, args: args, preview: redactSecrets(preview).slice(0, 240) };
  }

  function audit(event, detail) {
    try {
      if (g.AETHER_Kernel && g.AETHER_Kernel.log) {
        g.AETHER_Kernel.log('security.' + event, redactSecrets(String(detail || '')).slice(0, 200), 'call', {
          ok: event.indexOf('deny') === -1 && event.indexOf('block') === -1,
        });
      }
    } catch (e) {}
  }

  g.AETHER_Security = {
    escapeHtml: escapeHtml,
    stripDangerousHtml: stripDangerousHtml,
    redactSecrets: redactSecrets,
    safePath: safePath,
    isSensitivePath: isSensitivePath,
    validateShellCommand: validateShellCommand,
    validateUrl: validateUrl,
    isDestructive: isDestructive,
    DESTRUCTIVE_TOOLS: DESTRUCTIVE_TOOLS,
    checkRateLimit: checkRateLimit,
    preflightTool: preflightTool,
    audit: audit,
    flags: _sessionFlags,
    setFlag: function (k, v) {
      if (Object.prototype.hasOwnProperty.call(_sessionFlags, k)) _sessionFlags[k] = !!v;
    },
  };

  // Patch global escapeHtml if missing
  if (typeof g.escapeHtml !== 'function') g.escapeHtml = escapeHtml;
})(typeof globalThis !== 'undefined' ? globalThis : window);
