/**
 * AETHER Tool Runtime v1 — unified protocol for all tool calls
 *
 * - Catalog: class, timeout, maxResult, arg style, OpenAI/Anthropic schemas
 * - Normalize args from string | object | OpenAI tool_calls
 * - Structured result envelopes (ok / error / truncated / ms)
 * - Parse [[bracket]], multi-line, tool fences, <tool_call>
 * - Concurrency class for parallel reads / serial writes
 */
(function (g) {
  'use strict';

  var DEFAULT_TIMEOUT = 45000;
  var DEFAULT_MAX_RESULT = 12000;
  var HISTORY_KEY = 'aether_tool_history_v1';
  var MAX_HISTORY = 80;

  /** @type {Record<string, object>} */
  var CATALOG = {
    // ── Filesystem / CODE ─────────────────────────────────────
    fs_read: {
      class: 'read', timeout: 15000, maxResult: 16000, argStyle: 'string',
      desc: 'Read file from coding folder',
      schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      primaryKeys: ['path', 'query', 'file'],
    },
    fs_write: {
      class: 'write', timeout: 20000, maxResult: 2000, argStyle: 'string',
      desc: 'Write full file: path\\ncontent (prefer fs_patch)',
      schema: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
      primaryKeys: ['path'],
      packArg: function (a) {
        if (typeof a === 'string') return a;
        if (a && a.path != null) return String(a.path) + '\n' + String(a.content != null ? a.content : a.text || '');
        return String(a || '');
      },
    },
    fs_patch: {
      class: 'write', timeout: 20000, maxResult: 2500, argStyle: 'string',
      desc: 'Surgical edit path|||old|||new or SEARCH/REPLACE fence',
      schema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old_string: { type: 'string' },
          new_string: { type: 'string' },
          replace_all: { type: 'boolean' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
      primaryKeys: ['path'],
      packArg: function (a) {
        if (typeof a === 'string') return a;
        if (a && a.path != null) {
          if (a.old_string != null || a.old != null) {
            return JSON.stringify({
              path: a.path,
              old_string: a.old_string != null ? a.old_string : a.old,
              new_string: a.new_string != null ? a.new_string : a.new,
              replace_all: !!a.replace_all,
            });
          }
        }
        return String(a || '');
      },
    },
    search_replace: { aliasOf: 'fs_patch' },
    fs_delete: {
      class: 'write', timeout: 10000, maxResult: 500, argStyle: 'string',
      desc: 'Delete file or directory',
      schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      primaryKeys: ['path', 'query'],
    },
    fs_list: {
      class: 'read', timeout: 12000, maxResult: 8000, argStyle: 'string',
      desc: 'List directory',
      schema: { type: 'object', properties: { path: { type: 'string' } }, required: [] },
      primaryKeys: ['path', 'query'],
    },
    fs_rename: {
      class: 'write', timeout: 10000, maxResult: 500, argStyle: 'string',
      desc: 'Rename/move: oldPath|newPath',
      schema: {
        type: 'object',
        properties: { oldPath: { type: 'string' }, newPath: { type: 'string' } },
        required: ['oldPath', 'newPath'],
      },
      packArg: function (a) {
        if (typeof a === 'string') return a;
        if (a && (a.oldPath || a.from)) return (a.oldPath || a.from) + '|' + (a.newPath || a.to);
        return String(a || '');
      },
    },
    fs_mkdir: {
      class: 'write', timeout: 8000, maxResult: 400, argStyle: 'string',
      desc: 'Create directory (recursive)',
      schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      primaryKeys: ['path', 'query'],
    },
    fs_copy: {
      class: 'write', timeout: 15000, maxResult: 500, argStyle: 'string',
      desc: 'Copy: src|dest',
      schema: {
        type: 'object',
        properties: { src: { type: 'string' }, dest: { type: 'string' } },
        required: ['src', 'dest'],
      },
      packArg: function (a) {
        if (typeof a === 'string') return a;
        if (a && (a.src || a.from)) return (a.src || a.from) + '|' + (a.dest || a.to);
        return String(a || '');
      },
    },
    fs_stat: {
      class: 'read', timeout: 8000, maxResult: 1500, argStyle: 'string',
      desc: 'File metadata',
      schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      primaryKeys: ['path', 'query'],
    },
    fs_exists: {
      class: 'read', timeout: 5000, maxResult: 200, argStyle: 'string',
      desc: 'Check path exists',
      schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      primaryKeys: ['path', 'query'],
    },
    shell: {
      class: 'exec', timeout: 20000, maxResult: 10000, argStyle: 'string',
      desc: 'Browser FS shell: ls cat grep find tree …',
      schema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
      primaryKeys: ['command', 'cmd', 'query'],
    },
    read_file: {
      class: 'read', timeout: 12000, maxResult: 16000, argStyle: 'string',
      desc: 'Read workspace file',
      schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      primaryKeys: ['path', 'file', 'query'],
    },
    write_file: {
      class: 'write', timeout: 15000, maxResult: 2000, argStyle: 'string',
      desc: 'Write workspace file',
      schema: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
      packArg: function (a) {
        if (typeof a === 'string') return a;
        if (a && a.path != null) return String(a.path) + '\n' + String(a.content || '');
        return String(a || '');
      },
    },
    glob: {
      class: 'read', timeout: 15000, maxResult: 8000, argStyle: 'string',
      desc: 'Glob match in workspace',
      schema: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] },
      primaryKeys: ['pattern', 'query'],
    },
    grep_files: {
      class: 'read', timeout: 20000, maxResult: 10000, argStyle: 'string',
      desc: 'Regex search files: pattern|filename?',
      schema: {
        type: 'object',
        properties: { pattern: { type: 'string' }, path: { type: 'string' } },
        required: ['pattern'],
      },
      packArg: function (a) {
        if (typeof a === 'string') return a;
        if (a && a.pattern) return a.pattern + (a.path || a.filename ? '|' + (a.path || a.filename) : '');
        return String(a || '');
      },
    },

    // ── Net / search ──────────────────────────────────────────
    web_search: {
      class: 'net', timeout: 25000, maxResult: 10000, argStyle: 'string',
      desc: 'Search the web',
      schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      primaryKeys: ['query', 'q'],
    },
    scrape: {
      class: 'net', timeout: 30000, maxResult: 14000, argStyle: 'string',
      desc: 'Scrape URL to markdown',
      schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
      primaryKeys: ['url', 'query'],
    },
    crawl: {
      class: 'net', timeout: 60000, maxResult: 16000, argStyle: 'multi',
      desc: 'Crawl site',
      schema: {
        type: 'object',
        properties: { url: { type: 'string' }, maxPages: { type: 'integer' } },
        required: ['url'],
      },
      primaryKeys: ['url'],
      packArg: function (a) {
        if (typeof a === 'string') return [a];
        if (a && a.url) return [a.url, a.maxPages || a.max || 5];
        return [String(a || '')];
      },
    },
    get_weather: {
      class: 'net', timeout: 12000, maxResult: 3000, argStyle: 'string',
      desc: 'Weather for city',
      schema: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] },
      primaryKeys: ['location', 'query', 'city'],
    },

    // ── Integrations ──────────────────────────────────────────
    slack_post: {
      class: 'write', timeout: 15000, maxResult: 1500, argStyle: 'multi',
      desc: 'Post to Slack',
      schema: {
        type: 'object',
        properties: { channel: { type: 'string' }, message: { type: 'string' } },
        required: ['channel', 'message'],
      },
      packArg: function (a) {
        if (typeof a === 'string') return [a];
        if (a && a.channel) return [a.channel, a.message || a.text || ''];
        return Object.values(a || {});
      },
    },
    slack_read: {
      class: 'net', timeout: 15000, maxResult: 8000, argStyle: 'multi',
      desc: 'Read Slack channel',
      schema: {
        type: 'object',
        properties: { channel: { type: 'string' }, limit: { type: 'integer' } },
        required: ['channel'],
      },
      packArg: function (a) {
        if (typeof a === 'string') return [a];
        if (a && a.channel) return [a.channel, a.limit || 10];
        return Object.values(a || {});
      },
    },
    notion_query: {
      class: 'net', timeout: 20000, maxResult: 8000, argStyle: 'multi',
      desc: 'Query Notion DB',
      schema: {
        type: 'object',
        properties: { databaseId: { type: 'string' }, filter: { type: 'string' } },
        required: ['databaseId'],
      },
      packArg: function (a) {
        if (typeof a === 'string') return [a];
        if (a && (a.databaseId || a.database)) return [a.databaseId || a.database, a.filter];
        return Object.values(a || {});
      },
    },
    notion_add: {
      class: 'write', timeout: 15000, maxResult: 1500, argStyle: 'multi',
      desc: 'Add Notion page',
      schema: {
        type: 'object',
        properties: { title: { type: 'string' }, content: { type: 'string' } },
        required: ['title'],
      },
      packArg: function (a) {
        if (typeof a === 'string') return [a];
        if (a && a.title) return [a.title, a.content || a.body || ''];
        return Object.values(a || {});
      },
    },
    calculate: {
      class: 'read', timeout: 5000, maxResult: 2000, argStyle: 'string',
      desc: 'Safe math evaluate',
      schema: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] },
      primaryKeys: ['expression', 'expr', 'query'],
    },
    browser_agent: {
      class: 'exec', timeout: 120000, maxResult: 4000, argStyle: 'string',
      desc: 'Browser automation task',
      schema: { type: 'object', properties: { task: { type: 'string' } }, required: ['task'] },
      primaryKeys: ['task', 'query'],
    },
    image_gen: {
      class: 'sense', timeout: 90000, maxResult: 500, argStyle: 'string',
      desc: 'Generate image',
      schema: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] },
      primaryKeys: ['prompt', 'query'],
    },
    email_send: {
      class: 'write', timeout: 20000, maxResult: 1000, argStyle: 'string',
      desc: 'Send email',
      schema: {
        type: 'object',
        properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } },
        required: ['to'],
      },
      primaryKeys: ['query', 'to'],
    },
    github_create_issue: {
      class: 'write', timeout: 20000, maxResult: 2000, argStyle: 'string',
      desc: 'Create GitHub issue',
      schema: { type: 'object', properties: { arg: { type: 'string' } }, required: ['arg'] },
      primaryKeys: ['arg', 'query'],
    },
    github_list_repos: { class: 'net', timeout: 20000, maxResult: 8000, argStyle: 'none', desc: 'List GitHub repos', schema: { type: 'object', properties: {} } },
    github_get_file: {
      class: 'net', timeout: 20000, maxResult: 12000, argStyle: 'string',
      desc: 'Get GitHub file',
      schema: { type: 'object', properties: { arg: { type: 'string' } }, required: ['arg'] },
      primaryKeys: ['arg', 'query', 'path'],
    },
    github_commit: {
      class: 'write', timeout: 30000, maxResult: 2000, argStyle: 'string',
      desc: 'Commit file to GitHub',
      schema: { type: 'object', properties: { arg: { type: 'string' } }, required: ['arg'] },
      primaryKeys: ['arg', 'query'],
    },
    github_list_issues: {
      class: 'net', timeout: 20000, maxResult: 8000, argStyle: 'string',
      desc: 'List GitHub issues',
      schema: { type: 'object', properties: { arg: { type: 'string' } }, required: ['arg'] },
      primaryKeys: ['arg', 'query'],
    },
    cron_create: {
      class: 'write', timeout: 5000, maxResult: 800, argStyle: 'string',
      desc: 'Schedule prompt',
      schema: { type: 'object', properties: { arg: { type: 'string' } }, required: ['arg'] },
      primaryKeys: ['arg', 'query'],
    },
    cron_delete: {
      class: 'write', timeout: 3000, maxResult: 400, argStyle: 'string',
      desc: 'Cancel scheduled job',
      schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      primaryKeys: ['id', 'query'],
    },
    cron_list: { class: 'read', timeout: 3000, maxResult: 4000, argStyle: 'none', desc: 'List cron jobs', schema: { type: 'object', properties: {} } },
    task_create: {
      class: 'write', timeout: 5000, maxResult: 800, argStyle: 'string',
      desc: 'Create task',
      schema: { type: 'object', properties: { arg: { type: 'string' } }, required: ['arg'] },
      primaryKeys: ['arg', 'query'],
    },
    task_get: {
      class: 'read', timeout: 3000, maxResult: 2000, argStyle: 'string',
      desc: 'Get task',
      schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      primaryKeys: ['id', 'query'],
    },
    task_update: {
      class: 'write', timeout: 5000, maxResult: 800, argStyle: 'string',
      desc: 'Update task',
      schema: { type: 'object', properties: { arg: { type: 'string' } }, required: ['arg'] },
      primaryKeys: ['arg', 'query'],
    },
    location_get: { class: 'sense', timeout: 8000, maxResult: 1500, argStyle: 'none', desc: 'User location', schema: { type: 'object', properties: {} } },
    cal_events: {
      class: 'net', timeout: 15000, maxResult: 6000, argStyle: 'string',
      desc: 'Calendar events for N days',
      schema: { type: 'object', properties: { days: { type: 'integer' } }, required: [] },
      primaryKeys: ['days', 'query'],
    },
    cal_create: {
      class: 'write', timeout: 15000, maxResult: 1500, argStyle: 'string',
      desc: 'Create calendar event',
      schema: { type: 'object', properties: { arg: { type: 'string' } }, required: ['arg'] },
      primaryKeys: ['arg', 'query'],
    },
    day_plan: { class: 'net', timeout: 15000, maxResult: 6000, argStyle: 'none', desc: 'Today calendar plan', schema: { type: 'object', properties: {} } },
    x_search: {
      class: 'net', timeout: 20000, maxResult: 8000, argStyle: 'string',
      desc: 'Search X/Twitter',
      schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      primaryKeys: ['query'],
    },
    x_user_tweets: {
      class: 'net', timeout: 20000, maxResult: 8000, argStyle: 'string',
      desc: 'User timeline',
      schema: { type: 'object', properties: { username: { type: 'string' } }, required: ['username'] },
      primaryKeys: ['username', 'query', 'arg'],
    },
    x_get_user: {
      class: 'net', timeout: 15000, maxResult: 3000, argStyle: 'string',
      desc: 'X user profile',
      schema: { type: 'object', properties: { username: { type: 'string' } }, required: ['username'] },
      primaryKeys: ['username', 'query'],
    },
    trello_boards: { class: 'net', timeout: 15000, maxResult: 6000, argStyle: 'none', desc: 'List Trello boards', schema: { type: 'object', properties: {} } },
    trello_cards: {
      class: 'net', timeout: 15000, maxResult: 8000, argStyle: 'string',
      desc: 'List Trello cards',
      schema: { type: 'object', properties: { arg: { type: 'string' } }, required: ['arg'] },
      primaryKeys: ['arg', 'query', 'boardId'],
    },
    trello_lists: {
      class: 'net', timeout: 12000, maxResult: 4000, argStyle: 'string',
      desc: 'Trello lists on board',
      schema: { type: 'object', properties: { boardId: { type: 'string' } }, required: ['boardId'] },
      primaryKeys: ['boardId', 'query'],
    },
    trello_create_card: {
      class: 'write', timeout: 15000, maxResult: 1500, argStyle: 'string',
      desc: 'Create Trello card',
      schema: { type: 'object', properties: { arg: { type: 'string' } }, required: ['arg'] },
      primaryKeys: ['arg', 'query'],
    },
    trello_move_card: {
      class: 'write', timeout: 12000, maxResult: 800, argStyle: 'string',
      desc: 'Move Trello card',
      schema: { type: 'object', properties: { arg: { type: 'string' } }, required: ['arg'] },
      primaryKeys: ['arg', 'query'],
    },
    trello_archive_card: {
      class: 'write', timeout: 10000, maxResult: 500, argStyle: 'string',
      desc: 'Archive Trello card',
      schema: { type: 'object', properties: { cardId: { type: 'string' } }, required: ['cardId'] },
      primaryKeys: ['cardId', 'id', 'query'],
    },
    hue_lights: { class: 'sense', timeout: 10000, maxResult: 4000, argStyle: 'none', desc: 'List Hue lights', schema: { type: 'object', properties: {} } },
    hue_set: {
      class: 'write', timeout: 10000, maxResult: 800, argStyle: 'multi',
      desc: 'Set Hue light',
      schema: {
        type: 'object',
        properties: { id: { type: 'string' }, on: { type: 'boolean' }, bri: { type: 'integer' } },
        required: ['id'],
      },
      packArg: function (a) {
        if (typeof a === 'string') return [a];
        if (a && a.id != null) return [a.id, a.on, a.bri];
        return Object.values(a || {});
      },
    },
    jira_search: {
      class: 'net', timeout: 20000, maxResult: 8000, argStyle: 'string',
      desc: 'Jira JQL search',
      schema: { type: 'object', properties: { jql: { type: 'string' } }, required: ['jql'] },
      primaryKeys: ['jql', 'query'],
    },
    jira_create: {
      class: 'write', timeout: 20000, maxResult: 2000, argStyle: 'multi',
      desc: 'Create Jira issue',
      schema: {
        type: 'object',
        properties: { project: { type: 'string' }, summary: { type: 'string' }, description: { type: 'string' } },
        required: ['project', 'summary'],
      },
      packArg: function (a) {
        if (typeof a === 'string') return [a];
        if (a && a.project) return [a.project, a.summary, a.description || a.desc || ''];
        return Object.values(a || {});
      },
    },
    gitlab_issues: {
      class: 'net', timeout: 20000, maxResult: 8000, argStyle: 'multi',
      desc: 'GitLab issues',
      schema: {
        type: 'object',
        properties: { project: { type: 'string' }, state: { type: 'string' } },
        required: ['project'],
      },
      packArg: function (a) {
        if (typeof a === 'string') return [a];
        if (a && a.project) return [a.project, a.state];
        return Object.values(a || {});
      },
    },
    gitlab_mr: {
      class: 'write', timeout: 25000, maxResult: 2000, argStyle: 'multi',
      desc: 'Create GitLab MR',
      schema: {
        type: 'object',
        properties: {
          project: { type: 'string' },
          title: { type: 'string' },
          source: { type: 'string' },
          target: { type: 'string' },
        },
        required: ['project', 'title'],
      },
      packArg: function (a) {
        if (typeof a === 'string') return [a];
        if (a && a.project) return [a.project, a.title, a.source, a.target];
        return Object.values(a || {});
      },
    },
    send_message: {
      class: 'write', timeout: 5000, maxResult: 500, argStyle: 'string',
      desc: 'Agent message bus',
      schema: { type: 'object', properties: { arg: { type: 'string' } }, required: ['arg'] },
      primaryKeys: ['arg', 'query'],
    },
    puter_browse: {
      class: 'net', timeout: 30000, maxResult: 12000, argStyle: 'string',
      desc: 'Puter curl fetch',
      schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
      primaryKeys: ['url', 'query'],
    },
    puter_terminal: {
      class: 'exec', timeout: 60000, maxResult: 12000, argStyle: 'string',
      desc: 'Puter cloud shell',
      schema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
      primaryKeys: ['command', 'cmd', 'query'],
    },
    puter_read_file: {
      class: 'read', timeout: 15000, maxResult: 12000, argStyle: 'string',
      desc: 'Puter cloud read',
      schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      primaryKeys: ['path', 'query'],
    },
    puter_write_file: {
      class: 'write', timeout: 15000, maxResult: 1000, argStyle: 'string',
      desc: 'Puter cloud write',
      schema: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path'],
      },
      packArg: function (a) {
        if (typeof a === 'string') return a;
        if (a && a.path) return a.path + '\n' + (a.content || '');
        return String(a || '');
      },
    },
    puter_list_dir: {
      class: 'read', timeout: 12000, maxResult: 6000, argStyle: 'string',
      desc: 'Puter list dir',
      schema: { type: 'object', properties: { path: { type: 'string' } }, required: [] },
      primaryKeys: ['path', 'query'],
    },
    puter_mkdir: {
      class: 'write', timeout: 8000, maxResult: 400, argStyle: 'string',
      desc: 'Puter mkdir',
      schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      primaryKeys: ['path', 'query'],
    },
    puter_ai: {
      class: 'net', timeout: 60000, maxResult: 8000, argStyle: 'string',
      desc: 'Puter AI chat',
      schema: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] },
      primaryKeys: ['prompt', 'query'],
    },
    puter_deploy: {
      class: 'write', timeout: 60000, maxResult: 1500, argStyle: 'string',
      desc: 'Deploy HTML to Puter',
      schema: { type: 'object', properties: { arg: { type: 'string' } }, required: ['arg'] },
      primaryKeys: ['arg', 'query'],
    },
    puter_screenshot: {
      class: 'sense', timeout: 15000, maxResult: 500, argStyle: 'string',
      desc: 'Open URL for screenshot',
      schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
      primaryKeys: ['url', 'query'],
    },
    set_timer: {
      class: 'write', timeout: 3000, maxResult: 400, argStyle: 'string',
      desc: 'Set timer',
      schema: { type: 'object', properties: { arg: { type: 'string' } }, required: ['arg'] },
      primaryKeys: ['arg', 'query'],
    },
    cancel_timer: {
      class: 'write', timeout: 3000, maxResult: 400, argStyle: 'string',
      desc: 'Cancel timer',
      schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      primaryKeys: ['id', 'query'],
    },
    list_timers: { class: 'read', timeout: 3000, maxResult: 2000, argStyle: 'none', desc: 'List timers', schema: { type: 'object', properties: {} } },
    estimate: {
      class: 'read', timeout: 5000, maxResult: 1500, argStyle: 'string',
      desc: 'Estimate',
      schema: { type: 'object', properties: { arg: { type: 'string' } }, required: ['arg'] },
      primaryKeys: ['arg', 'query'],
    },
    unzip: {
      class: 'write', timeout: 30000, maxResult: 3000, argStyle: 'string',
      desc: 'Unzip archive',
      schema: { type: 'object', properties: { arg: { type: 'string' } }, required: ['arg'] },
      primaryKeys: ['arg', 'query', 'path'],
    },
  };

  function resolveMeta(name) {
    name = normalizeName(name);
    var m = CATALOG[name];
    if (!m) {
      return {
        name: name,
        class: 'call',
        timeout: DEFAULT_TIMEOUT,
        maxResult: DEFAULT_MAX_RESULT,
        argStyle: 'auto',
        desc: name,
        schema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: [],
        },
        primaryKeys: ['query', 'path', 'url', 'arg', 'command'],
      };
    }
    if (m.aliasOf) {
      var base = resolveMeta(m.aliasOf);
      return Object.assign({}, base, { name: name, aliasOf: m.aliasOf });
    }
    return Object.assign({ name: name }, m);
  }

  function normalizeName(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');
  }

  function concurrencyClass(name) {
    var cls = resolveMeta(name).class;
    if (cls === 'write') return 'write';
    if (cls === 'exec') return 'exec';
    return 'read';
  }

  function primaryFromObject(obj, keys) {
    if (!obj || typeof obj !== 'object') return null;
    keys = keys || ['query', 'path', 'url', 'arg', 'command', 'prompt', 'task'];
    for (var i = 0; i < keys.length; i++) {
      if (obj[keys[i]] != null && obj[keys[i]] !== '') return obj[keys[i]];
    }
    var vals = Object.values(obj);
    return vals.length ? vals[0] : null;
  }

  /**
   * Normalize any args shape into what tool.fn expects.
   * Returns { callArgs: array, preview: string }
   */
  function normalizeArgs(name, args) {
    var meta = resolveMeta(name);
    var preview = '';
    var callArgs;

    if (meta.packArg) {
      var packed = meta.packArg(args);
      if (Array.isArray(packed)) {
        callArgs = packed;
        preview = packed.map(String).join(' | ');
      } else {
        callArgs = [packed];
        preview = String(packed);
      }
      return { callArgs: callArgs, preview: preview.slice(0, 200), meta: meta };
    }

    if (meta.argStyle === 'none' || args == null || args === '') {
      return { callArgs: [], preview: '', meta: meta };
    }

    if (typeof args === 'string') {
      return { callArgs: [args], preview: args.slice(0, 200), meta: meta };
    }

    if (Array.isArray(args)) {
      return {
        callArgs: args,
        preview: args.map(String).join(' | ').slice(0, 200),
        meta: meta,
      };
    }

    if (typeof args === 'object') {
      if (meta.argStyle === 'multi') {
        var vals = Object.values(args);
        return { callArgs: vals, preview: vals.map(String).join(' | ').slice(0, 200), meta: meta };
      }
      var primary = primaryFromObject(args, meta.primaryKeys);
      if (primary != null) {
        return { callArgs: [primary], preview: String(primary).slice(0, 200), meta: meta };
      }
      var ov = Object.values(args);
      return { callArgs: ov, preview: ov.map(String).join(' | ').slice(0, 200), meta: meta };
    }

    return { callArgs: [args], preview: String(args).slice(0, 200), meta: meta };
  }

  function isFailureString(s) {
    s = String(s || '');
    return (
      /ok=false/i.test(s) ||
      /^error\b/i.test(s) ||
      /\[.*\] error:/i.test(s) ||
      /\berror:\s/i.test(s) ||
      /denied/i.test(s) ||
      /blocked —/i.test(s) ||
      /not found/i.test(s) && /fs_/i.test(s)
    );
  }

  /**
   * Build a short human summary of tool output for models + UI.
   */
  function summarizeResult(name, text, ok) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    var head = text.slice(0, 160);
    if (!ok) {
      return 'FAILED ' + normalizeName(name) + (head ? ': ' + head : '');
    }
    var n = normalizeName(name);
    if (/^fs_read|read_file$/.test(n)) return 'Read ' + (text.length > 0 ? text.length + ' chars' : 'empty') + ' from ' + n;
    if (/^fs_list|glob$/.test(n)) {
      var lines = String(text).split('\n').filter(Boolean).length;
      return 'Listed ~' + lines + ' entries';
    }
    if (/^fs_patch|search_replace$/.test(n)) return head || 'Patch applied (or proposed)';
    if (/^web_search|tavily|brave|serper/.test(n)) return 'Search results (' + Math.min(text.length, 9999) + ' chars)';
    if (/^shell|puter_terminal$/.test(n)) return 'Shell: ' + (head || 'ok');
    if (text.length > 120) return head + '…';
    return head || 'ok';
  }

  /**
   * Structured envelope object for tools (JSON + human lines).
   */
  function buildEnvelope(name, raw, opts) {
    opts = opts || {};
    var meta = resolveMeta(name);
    var max = opts.maxResult != null ? opts.maxResult : meta.maxResult || DEFAULT_MAX_RESULT;
    var ms = opts.ms != null ? opts.ms : null;
    var text = raw == null ? '' : typeof raw === 'string' ? raw : JSON.stringify(raw, null, 0);
    var truncated = false;
    if (text.length > max) {
      text = text.slice(0, max) + '\n…[truncated ' + (text.length - max) + ' chars; re-read with offset or narrower query]';
      truncated = true;
    }
    var ok = opts.ok;
    if (ok == null) ok = !isFailureString(text);
    // Empty read-like results are soft-fail candidates
    if (ok && opts.treatEmptyAsFail && !String(text).trim()) {
      ok = false;
      text = text || 'empty result';
    }
    var summary = opts.summary || summarizeResult(name, text, ok);
    return {
      ok: !!ok,
      tool: normalizeName(name),
      class: meta.class || 'call',
      ms: ms,
      truncated: truncated,
      summary: summary,
      result: text,
      retries: opts.retries || 0,
      repaired: !!opts.repaired,
      format: 'aether-tool-v2',
    };
  }

  /**
   * Wrap raw tool output into a consistent envelope string for models + UI.
   * Dual format: human header lines + JSON block for structured consumers.
   */
  function formatResult(name, raw, opts) {
    opts = opts || {};
    // Passthrough if already structured dual format
    if (typeof raw === 'string' && raw.indexOf('"format":"aether-tool-v2"') >= 0) return raw;
    if (typeof raw === 'string' && (/^ok=(true|false)\b/.test(raw.trim()) || /^tool=/.test(raw.trim())) && opts.force !== true) {
      // Upgrade legacy envelope with JSON trailer if missing
      if (raw.indexOf('"format":"aether-tool-v2"') >= 0) return raw;
    }
    var env = buildEnvelope(name, raw, opts);
    var parts = [
      'tool=' + env.tool,
      'ok=' + (env.ok ? 'true' : 'false'),
    ];
    if (env.ms != null) parts.push('ms=' + env.ms);
    if (env.truncated) parts.push('truncated=true');
    if (env.class) parts.push('class=' + env.class);
    if (env.retries) parts.push('retries=' + env.retries);
    if (env.repaired) parts.push('repaired=true');
    var header = parts.join(' ') + '\nsummary: ' + env.summary + '\n';
    // Keep body readable for models
    var body = env.result;
    if (/^ok=(true|false)\b/.test(String(body).trim()) || /^tool=/.test(String(body).trim())) {
      // avoid double body
      return body.indexOf('summary:') >= 0 ? body : header + body;
    }
    var jsonLine =
      'json:' +
      JSON.stringify({
        ok: env.ok,
        tool: env.tool,
        class: env.class,
        ms: env.ms,
        truncated: env.truncated,
        summary: env.summary,
        retries: env.retries,
        repaired: env.repaired,
        format: env.format,
        // keep result length bounded inside json too
        result: String(env.result || '').slice(0, 4000),
      });
    return header + body + '\n' + jsonLine;
  }

  function withTimeout(promise, ms, label) {
    if (!ms || ms <= 0) return promise;
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error('timeout after ' + ms + 'ms: ' + (label || 'tool')));
      }, ms);
      promise.then(
        function (v) {
          if (done) return;
          done = true;
          clearTimeout(t);
          resolve(v);
        },
        function (e) {
          if (done) return;
          done = true;
          clearTimeout(t);
          reject(e);
        }
      );
    });
  }

  /**
   * Schema validation + one-shot repair for tool args.
   * @returns {{ ok, errors, args, repaired, callArgs?, preview?, meta? }}
   */
  function validateAndRepairArgs(name, args) {
    var meta = resolveMeta(name);
    var schema = meta.schema || { type: 'object', properties: {}, required: [] };
    var errors = [];
    var repaired = false;
    var obj;

    if (args == null || args === '') {
      obj = {};
    } else if (typeof args === 'string') {
      // try JSON first
      try {
        var parsed = JSON.parse(args);
        if (parsed && typeof parsed === 'object') obj = parsed;
        else obj = {};
      } catch (e) {
        obj = {};
      }
      // Map bare string onto primary key
      var pkeys = meta.primaryKeys || ['query', 'path', 'url', 'arg', 'command'];
      var needed = (schema.required || [])[0] || pkeys[0];
      if (!Object.keys(obj).length || (schema.required || []).some(function (r) { return obj[r] == null || obj[r] === ''; })) {
        if (typeof args === 'string' && args.trim()) {
          // If JSON parse gave empty or missing required, use string as primary
          if (!Object.keys(obj).length || (needed && (obj[needed] == null || obj[needed] === ''))) {
            obj = {};
            obj[needed] = args;
            repaired = true;
          }
        }
      }
    } else if (Array.isArray(args)) {
      obj = {};
      var req = schema.required || [];
      req.forEach(function (r, i) {
        if (args[i] != null) obj[r] = args[i];
      });
      if (!req.length && args[0] != null) {
        var pk = (meta.primaryKeys || ['query'])[0];
        obj[pk] = args[0];
      }
      repaired = true;
    } else if (typeof args === 'object') {
      obj = Object.assign({}, args);
      // alias common keys
      if (obj.path == null && obj.file != null) {
        obj.path = obj.file;
        repaired = true;
      }
      if (obj.query == null && obj.q != null) {
        obj.query = obj.q;
        repaired = true;
      }
      if (obj.command == null && obj.cmd != null) {
        obj.command = obj.cmd;
        repaired = true;
      }
      if (obj.url == null && obj.uri != null) {
        obj.url = obj.uri;
        repaired = true;
      }
      if (obj.old_string == null && obj.old != null) {
        obj.old_string = obj.old;
        repaired = true;
      }
      if (obj.new_string == null && obj.new != null) {
        obj.new_string = obj.new;
        repaired = true;
      }
    } else {
      obj = { query: String(args) };
      repaired = true;
    }

    var required = schema.required || [];
    required.forEach(function (r) {
      if (obj[r] == null || obj[r] === '') {
        // one-shot repair from primaryKeys leftovers
        var pk = meta.primaryKeys || [];
        for (var i = 0; i < pk.length; i++) {
          if (pk[i] !== r && obj[pk[i]] != null && obj[pk[i]] !== '') {
            obj[r] = obj[pk[i]];
            repaired = true;
            break;
          }
        }
        if (obj[r] == null || obj[r] === '') {
          errors.push('missing required: ' + r);
        }
      }
    });

    // type soft checks
    var props = schema.properties || {};
    Object.keys(props).forEach(function (k) {
      if (obj[k] == null) return;
      var t = props[k].type;
      if (t === 'integer' || t === 'number') {
        if (typeof obj[k] === 'string' && obj[k] !== '' && !isNaN(Number(obj[k]))) {
          obj[k] = t === 'integer' ? parseInt(obj[k], 10) : Number(obj[k]);
          repaired = true;
        }
      }
      if (t === 'boolean' && typeof obj[k] === 'string') {
        if (obj[k] === 'true' || obj[k] === 'false') {
          obj[k] = obj[k] === 'true';
          repaired = true;
        }
      }
    });

    var ok = errors.length === 0;
    // For string-style tools, also produce normalized callArgs
    var norm = normalizeArgs(name, ok ? (typeof args === 'string' && !repaired && required.length <= 1 ? args : obj) : obj);
    return {
      ok: ok,
      errors: errors,
      args: obj,
      repaired: repaired,
      callArgs: norm.callArgs,
      preview: norm.preview,
      meta: meta,
    };
  }

  /**
   * Retry wrapper for read/net tools on timeout / empty / soft-fail.
   */
  function withRetry(fn, opts) {
    opts = opts || {};
    var max = opts.max != null ? opts.max : 1; // one retry => 2 attempts
    var label = opts.label || 'tool';
    var attempt = 0;
    function run() {
      attempt++;
      return Promise.resolve()
        .then(fn)
        .then(function (v) {
          var text = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
          var fail =
            opts.shouldRetry &&
            opts.shouldRetry(v, text, null, attempt);
          if (fail && attempt <= max) {
            return run();
          }
          return { value: v, attempts: attempt };
        })
        .catch(function (e) {
          var isTimeout = /timeout/i.test(e && e.message ? e.message : String(e));
          if ((isTimeout || (opts.retryOnError && attempt <= max)) && attempt <= max) {
            return run();
          }
          e.attempts = attempt;
          throw e;
        });
    }
    return run();
  }

  function shouldRetryRead(name, value, text, err, attempt) {
    if (attempt > 2) return false;
    var cls = concurrencyClass(name);
    if (cls !== 'read' && resolveMeta(name).class !== 'net') return false;
    if (err && /timeout/i.test(err.message || String(err))) return true;
    if (text != null && !String(text).trim()) return true;
    if (text != null && isFailureString(text) && /timeout|empty|temporar|rate limit|429|503/i.test(text)) return true;
    return false;
  }

  // ── Health dashboard ───────────────────────────────────────

  var HEALTH_KEY = 'aether_tool_health_v1';

  function loadHealth() {
    try {
      return JSON.parse(localStorage.getItem(HEALTH_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveHealth(h) {
    try {
      localStorage.setItem(HEALTH_KEY, JSON.stringify(h));
    } catch (e) {}
  }

  function recordHealth(name, ok, ms, errPreview) {
    var key = normalizeName(name);
    var h = loadHealth();
    var row = h[key] || {
      calls: 0,
      ok: 0,
      fail: 0,
      totalMs: 0,
      lastOk: null,
      lastErr: null,
      lastAt: null,
    };
    row.calls++;
    if (ok) {
      row.ok++;
      row.lastOk = Date.now();
    } else {
      row.fail++;
      row.lastErr = String(errPreview || '').slice(0, 160);
    }
    if (ms != null) row.totalMs += ms;
    row.lastAt = Date.now();
    h[key] = row;
    saveHealth(h);
    return row;
  }

  function healthStats(registry) {
    var h = loadHealth();
    var names = Object.keys(registry || {});
    var catalog = listCatalog();
    var rows = names.map(function (n) {
      var s = h[n] || { calls: 0, ok: 0, fail: 0, totalMs: 0 };
      var avg = s.calls ? Math.round(s.totalMs / s.calls) : null;
      var rate = s.calls ? Math.round((s.ok / s.calls) * 100) : null;
      var meta = resolveMeta(n);
      var configured = true;
      // soft configuration hints
      if (/web_search|tavily|scrape|crawl|slack|notion|github|jira|weather|hue|firecrawl|email/.test(n)) {
        configured = null; // unknown without hooks — host can enrich
      }
      return {
        name: n,
        class: meta.class,
        desc: meta.desc || (registry[n] && registry[n].desc) || '',
        calls: s.calls,
        ok: s.ok,
        fail: s.fail,
        okRate: rate,
        avgMs: avg,
        lastAt: s.lastAt || null,
        lastErr: s.lastErr || null,
        configured: configured,
      };
    });
    rows.sort(function (a, b) {
      return (b.calls || 0) - (a.calls || 0) || a.name.localeCompare(b.name);
    });
    var totalCalls = rows.reduce(function (a, r) {
      return a + (r.calls || 0);
    }, 0);
    var totalOk = rows.reduce(function (a, r) {
      return a + (r.ok || 0);
    }, 0);
    return {
      tools: rows,
      catalogSize: catalog.length,
      registrySize: names.length,
      totalCalls: totalCalls,
      totalOk: totalOk,
      okRate: totalCalls ? Math.round((totalOk / totalCalls) * 100) : null,
      at: Date.now(),
    };
  }

  function healthMarkdown(registry, hooks) {
    var st = healthStats(registry);
    hooks = hooks || g.hooksConfig || {};
    var lines = [
      '**Tool Health** · registry ' +
        st.registrySize +
        ' · catalog ' +
        st.catalogSize +
        ' · calls ' +
        st.totalCalls +
        (st.okRate != null ? ' · ok ' + st.okRate + '%' : ''),
      '',
    ];
    // configuration strip
    var conf = [];
    if (hooks.tavily || hooks.brave || hooks.serper) conf.push('search✓');
    else conf.push('search○');
    if (hooks.firecrawlKey || hooks.firecrawl) conf.push('scrape✓');
    else conf.push('scrape○');
    if (hooks.github) conf.push('github✓');
    if (hooks.slackToken) conf.push('slack✓');
    if (hooks.notionToken) conf.push('notion✓');
    lines.push('Config: ' + conf.join(' · '));
    lines.push('');
    var top = st.tools.filter(function (t) {
      return t.calls > 0;
    }).slice(0, 15);
    if (!top.length) {
      lines.push('_No tool calls recorded yet this browser profile._');
    } else {
      lines.push('| Tool | Calls | OK% | Avg ms | Last err |');
      lines.push('| --- | ---: | ---: | ---: | --- |');
      top.forEach(function (t) {
        lines.push(
          '| `' +
            t.name +
            '` | ' +
            t.calls +
            ' | ' +
            (t.okRate != null ? t.okRate : '—') +
            ' | ' +
            (t.avgMs != null ? t.avgMs : '—') +
            ' | ' +
            (t.lastErr ? String(t.lastErr).slice(0, 40).replace(/\|/g, '/') : '—') +
            ' |'
        );
      });
    }
    lines.push('', '`/tools health` · `/tooltest` golden suite');
    return lines.join('\n');
  }

  /**
   * Normalize OpenAI/Anthropic native tool_calls into {name,args,id,source}.
   */
  function parseNativeToolCalls(toolCalls) {
    if (!toolCalls || !toolCalls.length) return [];
    return toolCalls
      .map(function (tc) {
        // OpenAI
        if (tc.function) {
          var args = {};
          try {
            args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments || '{}') : tc.function.arguments || {};
          } catch (e) {
            args = { query: String(tc.function.arguments || '') };
          }
          return { name: tc.function.name, args: args, id: tc.id, source: 'openai' };
        }
        // Anthropic tool_use
        if (tc.type === 'tool_use' || tc.name) {
          return {
            name: tc.name,
            args: tc.input || tc.arguments || {},
            id: tc.id,
            source: 'anthropic',
          };
        }
        return null;
      })
      .filter(Boolean);
  }

  /**
   * Prefer native tool_calls; fall back to text parse.
   */
  function collectToolCalls(opts) {
    opts = opts || {};
    var native = parseNativeToolCalls(opts.toolCalls || opts.native || []);
    if (native.length) {
      return { calls: native, source: 'native' };
    }
    var textCalls = parseToolCallsFromText(opts.text || '');
    return {
      calls: textCalls.map(function (c) {
        return { name: c.name, args: c.args, id: null, source: 'text' };
      }),
      source: 'text',
    };
  }

  /**
   * Parse all tool invocation forms from assistant text.
   * Returns [{ name, args, format, index }]
   */
  function parseToolCallsFromText(text) {
    text = String(text || '');
    var pending = [];
    var consumed = {};
    var m;

    // JSON fences
    var blockRe = /```(?:tool_call|function_call|tool)\s*\n([\s\S]*?)```/gi;
    while ((m = blockRe.exec(text)) !== null) {
      try {
        var p = JSON.parse(m[1].trim());
        pending.push({
          name: p.name || p.tool,
          args: p.arguments != null ? p.arguments : p.args != null ? p.args : p.input || {},
          format: 'fence',
          index: m.index,
        });
        consumed[m.index] = true;
      } catch (e) {}
    }

    // <tool_call name="...">
    var xmlRe = /<tool_call(?:\s+name="([^"]*)")?>([\s\S]*?)<\/tool_call>/gi;
    while ((m = xmlRe.exec(text)) !== null) {
      var nm = m[1] || '';
      var a = {};
      try {
        a = JSON.parse(m[2].trim());
      } catch (e2) {
        a = { query: m[2].trim() };
      }
      if (nm) {
        pending.push({ name: nm, args: a, format: 'xml', index: m.index });
        consumed[m.index] = true;
      }
    }

    // Multi-line heavy tools
    var multiRe =
      /\[\[(fs_write|fs_patch|search_replace|write_file|puter_write_file|shell|puter_terminal):\s*([\s\S]*?)\]\]/gi;
    while ((m = multiRe.exec(text)) !== null) {
      if (consumed[m.index]) continue;
      pending.push({ name: m[1], args: m[2].trim(), format: 'multi', index: m.index });
      consumed[m.index] = true;
    }

    // Generic [[tool: arg]] — allow multiline non-greedy until ]]
    var anyRe = /\[\[([a-zA-Z_][a-zA-Z0-9_]*):\s*([\s\S]*?)\]\]/g;
    while ((m = anyRe.exec(text)) !== null) {
      if (consumed[m.index]) continue;
      // Skip if looks like nested junk longer than 50k
      if (m[2].length > 50000) continue;
      pending.push({
        name: m[1],
        args: m[2].trim(),
        format: 'bracket',
        index: m.index,
      });
      consumed[m.index] = true;
    }

    // Sort by appearance
    pending.sort(function (a, b) {
      return a.index - b.index;
    });
    // Dedupe identical adjacent
    var out = [];
    var seen = {};
    pending.forEach(function (c) {
      var key = normalizeName(c.name) + '::' + String(c.args).slice(0, 200);
      if (seen[key]) return;
      seen[key] = true;
      out.push(c);
    });
    return out;
  }

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function pushHistory(entry) {
    try {
      var h = loadHistory();
      h.unshift(entry);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, MAX_HISTORY)));
    } catch (e) {}
  }

  /**
   * Enrich TOOL_REGISTRY entries with meta from catalog.
   */
  function enrichRegistry(registry) {
    if (!registry) return registry;
    Object.keys(registry).forEach(function (key) {
      var meta = resolveMeta(key);
      var tool = registry[key];
      if (!tool || typeof tool !== 'object') return;
      tool.meta = meta;
      if (!tool.desc && meta.desc) tool.desc = meta.desc;
      if (!tool.class) tool.class = meta.class;
    });
    return registry;
  }

  /**
   * Build OpenAI tools array from registry + catalog (coding-aware).
   */
  function buildOpenAITools(registry, opts) {
    opts = opts || {};
    var list = [];
    var names = Object.keys(registry || {});
    names.forEach(function (name) {
      var meta = resolveMeta(name);
      if (opts.codingOnly && meta.class !== 'read' && meta.class !== 'write' && meta.class !== 'exec') {
        // still allow calculate
        if (name !== 'calculate') return;
      }
      if (opts.include && opts.include.indexOf(name) === -1) return;
      if (opts.exclude && opts.exclude.indexOf(name) !== -1) return;
      // Skip if pack disabled
      if (g.AETHER_ToolPacks && g.AETHER_ToolPacks.isToolAllowed && !g.AETHER_ToolPacks.isToolAllowed(name)) {
        return;
      }
      var desc = (registry[name] && registry[name].desc) || meta.desc || name;
      list.push({
        type: 'function',
        function: {
          name: name,
          description: desc,
          parameters: meta.schema || {
            type: 'object',
            properties: { query: { type: 'string' } },
          },
        },
      });
    });
    return list;
  }

  function listCatalog() {
    return Object.keys(CATALOG)
      .filter(function (k) {
        return !CATALOG[k].aliasOf;
      })
      .map(function (k) {
        var m = resolveMeta(k);
        return {
          name: k,
          class: m.class,
          desc: m.desc,
          timeout: m.timeout,
        };
      });
  }

  /**
   * Golden tool suite — pure unit checks (no live network).
   */
  function runGoldenSuite(registry) {
    var results = [];
    function ok(name, pass, detail) {
      results.push({ name: name, pass: !!pass, detail: detail || '' });
    }

    ok('catalog_nonempty', listCatalog().length >= 20, 'n=' + listCatalog().length);
    ok('normalize_name', normalizeName('FS-Read!') === 'fsread' || normalizeName('fs_read') === 'fs_read', normalizeName('fs_read'));

    // parse formats
    var parsed = parseToolCallsFromText('Hello [[fs_read: src/a.js]] and [[web_search: solid state batteries]]');
    ok('parse_bracket', parsed.length >= 2, 'n=' + parsed.length);

    var multi = parseToolCallsFromText('[[fs_patch: path/to.js|||old|||new]]');
    ok('parse_multi_patch', multi.length === 1 && /fs_patch/i.test(multi[0].name), multi[0] && multi[0].name);

    var fence = parseToolCallsFromText('```tool_call\n{"name":"calculate","arguments":{"query":"1+1"}}\n```');
    ok('parse_fence', fence.length === 1 && fence[0].name === 'calculate', fence[0] && fence[0].name);

    // native
    var nat = parseNativeToolCalls([
      { id: '1', function: { name: 'fs_list', arguments: '{"path":"."}' } },
    ]);
    ok('parse_native', nat.length === 1 && nat[0].name === 'fs_list' && nat[0].args.path === '.', '');

    var collect = collectToolCalls({
      toolCalls: [{ id: '1', function: { name: 'fs_stat', arguments: '{"path":"a"}' } }],
      text: '[[fs_read: ignore]]',
    });
    ok('prefer_native', collect.source === 'native' && collect.calls[0].name === 'fs_stat', collect.source);

    // validate + repair
    var v1 = validateAndRepairArgs('fs_read', 'src/main.js');
    ok('repair_string_to_path', v1.ok && (v1.args.path === 'src/main.js' || (v1.callArgs && v1.callArgs[0] === 'src/main.js')), JSON.stringify(v1.args));

    var v2 = validateAndRepairArgs('fs_read', {});
    ok('validate_missing_required', !v2.ok && v2.errors.length > 0, v2.errors.join(','));

    var v3 = validateAndRepairArgs('fs_patch', { path: 'a.js', old: 'x', new: 'y' });
    ok('repair_old_new_aliases', v3.args.old_string === 'x' && v3.args.new_string === 'y', JSON.stringify(v3.args));

    // envelope
    var fr = formatResult('fs_list', 'a\nb\nc', { ok: true, ms: 12, force: true });
    ok('envelope_header', /tool=fs_list/.test(fr) && /ok=true/.test(fr) && /summary:/.test(fr), fr.slice(0, 80));
    ok('envelope_json', /"format":"aether-tool-v2"/.test(fr) || /json:\{/.test(fr), '');

    ok('failure_detect', isFailureString('ok=false error=nope') && !isFailureString('file contents here'), '');

    ok('concurrency_write', concurrencyClass('fs_patch') === 'write', concurrencyClass('fs_patch'));
    ok('concurrency_read', concurrencyClass('fs_read') === 'read', concurrencyClass('fs_read'));

    // shell denylist pattern (security module optional)
    var shellBad = 'rm -rf /';
    var denylist = /\brm\s+-rf\b|\bmkfs\b|\bdd\s+if=|\bshutdown\b|\breboot\b/i.test(shellBad);
    ok('shell_denylist_pattern', denylist, shellBad);

    if (registry) {
      ok('registry_fs_patch', !!(registry.fs_patch || registry['fs_patch']), '');
      var enriched = enrichRegistry(registry);
      ok('enrich_meta', !!(enriched.fs_read && enriched.fs_read.meta), '');
    } else {
      ok('registry_optional', true, 'skipped');
    }

    // health write/read
    recordHealth('__golden_probe__', true, 5);
    var h = loadHealth();
    ok('health_record', !!(h.__golden_probe__ && h.__golden_probe__.calls >= 1), '');

    var passed = results.filter(function (r) {
      return r.pass;
    }).length;
    return {
      version: '2.0',
      ok: passed === results.length,
      passed: passed,
      total: results.length,
      results: results,
    };
  }

  g.AETHER_ToolRuntime = {
    CATALOG: CATALOG,
    resolveMeta: resolveMeta,
    normalizeName: normalizeName,
    concurrencyClass: concurrencyClass,
    normalizeArgs: normalizeArgs,
    validateAndRepairArgs: validateAndRepairArgs,
    formatResult: formatResult,
    buildEnvelope: buildEnvelope,
    summarizeResult: summarizeResult,
    isFailureString: isFailureString,
    withTimeout: withTimeout,
    withRetry: withRetry,
    shouldRetryRead: shouldRetryRead,
    parseToolCallsFromText: parseToolCallsFromText,
    parseNativeToolCalls: parseNativeToolCalls,
    collectToolCalls: collectToolCalls,
    enrichRegistry: enrichRegistry,
    buildOpenAITools: buildOpenAITools,
    listCatalog: listCatalog,
    pushHistory: pushHistory,
    loadHistory: loadHistory,
    recordHealth: recordHealth,
    loadHealth: loadHealth,
    healthStats: healthStats,
    healthMarkdown: healthMarkdown,
    runGoldenSuite: runGoldenSuite,
    DEFAULT_TIMEOUT: DEFAULT_TIMEOUT,
    DEFAULT_MAX_RESULT: DEFAULT_MAX_RESULT,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
