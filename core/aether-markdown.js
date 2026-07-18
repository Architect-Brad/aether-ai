/**
 * AETHER Markdown Engine v1 — flagship chat renderer
 * Copyright (C) 2026 The Architect · GPL-3.0-or-later
 *
 * GFM-oriented pipeline for a zero-backend agent OS:
 *   split think · extract Aether plan/todo · blocks · inline · sanitize
 *   · code chrome · KaTeX hook · tool pills · citations
 *
 * Host injects createCodeBlock / renderGraph / buildPlanDOM via configure().
 * Load before script.js.
 */
(function (g) {
  'use strict';

  var VERSION = '1.0';
  var _host = {};
  var _pillStore = new Map();
  var _log = [];
  var LOG_MAX = 200;

  function configure(opts) {
    _host = Object.assign({}, _host, opts || {});
    return api;
  }

  function log(level, msg, detail) {
    var entry = {
      ts: new Date().toISOString(),
      level: level,
      msg: String(msg || '').slice(0, 200),
      detail: detail ? String(detail).slice(0, 400) : '',
    };
    _log.push(entry);
    if (_log.length > LOG_MAX) _log.shift();
    if (level === 'error' && g.console) {
      try {
        g.console.warn('[AETHER MD]', msg, detail || '');
      } catch (e) {}
    }
  }

  // ── Escape / sanitize ──────────────────────────────────────

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function safeHref(url) {
    var u = String(url || '').trim();
    if (!u) return '#';
    // block javascript:, data:text/html, vbscript:
    if (/^\s*(javascript|vbscript|data\s*:\s*text\/html)/i.test(u)) return '#';
    // allow http(s), mailto, tel, #anchors, relative paths
    if (/^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/|[a-z0-9_./-])/i.test(u)) return u;
    return '#';
  }

  // ── Language + fence meta ──────────────────────────────────

  function normLang(raw) {
    var l = String(raw || '')
      .toLowerCase()
      .trim();
    var aliases = {
      js: 'javascript',
      jsx: 'javascript',
      mjs: 'javascript',
      cjs: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      rb: 'ruby',
      rs: 'rust',
      sh: 'bash',
      shell: 'bash',
      zsh: 'bash',
      yml: 'yaml',
      htm: 'html',
      'c++': 'cpp',
      cc: 'cpp',
      md: 'markdown',
      dockerfile: 'dockerfile',
    };
    return aliases[l] || l;
  }

  function parseCodingFence(langLine) {
    var raw = String(langLine || '').trim();
    // ```js:app.js  or  ```python title=app.py  or  ```javascript
    var m = raw.match(/^([^\s:{]+)(?::([^\s]+))?/);
    if (m) {
      var lang = m[1] || 'code';
      var filename = m[2] || null;
      var titleM = raw.match(/(?:title|file)=["']?([^\s"']+)/i);
      if (!filename && titleM) filename = titleM[1];
      return { lang: lang, filename: filename };
    }
    return { lang: raw || 'code', filename: null };
  }

  // ── Inline ─────────────────────────────────────────────────

  function parseInline(t) {
    t = String(t == null ? '' : t);

    // Tool pills before escape
    t = t.replace(/\[\[TOOL_PILL:([^|\n]+)\|([^|\n]+)\|([^\]\n]*)\]\]/g, function (_, label, toolName, arg) {
      var id = 'tp_' + Math.random().toString(36).slice(2, 9);
      var pill =
        '<span class="tool-pill" data-tool="' +
        esc(toolName) +
        '" title="' +
        esc(String(arg).slice(0, 80)) +
        '">' +
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle;margin-right:4px"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>' +
        esc(label) +
        '</span>';
      var key = '\x00PILL_' + id + '_END\x00';
      _pillStore.set(key, pill);
      return key;
    });

    // Protect inline code first
    var codeSlots = [];
    t = t.replace(/`([^`\n]+)`/g, function (_, code) {
      var i = codeSlots.length;
      codeSlots.push('<code class="inline-code">' + esc(code) + '</code>');
      return '\x00CODE' + i + '\x00';
    });

    // Escape HTML
    t = esc(t);

    // Images ![alt](url)
    t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, function (_, alt, url, title) {
      var src = safeHref(url);
      if (src === '#') return esc(alt || 'image');
      return (
        '<img class="md-img" src="' +
        esc(src) +
        '" alt="' +
        esc(alt) +
        '"' +
        (title ? ' title="' + esc(title) + '"' : '') +
        ' loading="lazy">'
      );
    });

    // Links [text](url)
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, function (_, text, url, title) {
      var href = safeHref(url);
      return (
        '<a href="' +
        esc(href) +
        '" target="_blank" rel="noopener noreferrer"' +
        (title ? ' title="' + esc(title) + '"' : '') +
        '>' +
        text +
        '</a>'
      );
    });

    // Autolink bare URLs (http/https only)
    t = t.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?'")\]])/g, function (_, pre, url) {
      var href = safeHref(url);
      return pre + '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer" class="md-autolink">' + url + '</a>';
    });

    // Source links [[source: URL|title]]
    t = t.replace(/\[\[source:\s*([^\]|]+?)(?:\|([^\]]+))?\]\]/gi, function (_, url, title) {
      var href = safeHref(url.trim());
      return (
        '<a href="' +
        esc(href) +
        '" target="_blank" rel="noopener noreferrer" class="source-link">' +
        esc(title ? title.trim() : url.trim()) +
        '</a>'
      );
    });

    // Bold / italic / strike / mark (order matters; no lookbehind for WebView)
    t = t
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/___(.+?)___/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s).,!?]|$)/g, '$1<em>$2</em>')
      .replace(/(^|[\s(])_([^_\n]+?)_(?=[\s).,!?]|$)/g, '$1<em>$2</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/==(.+?)==/g, '<mark>$1</mark>');

    // Citations [1] [2,3]
    t = t.replace(/\[(\d+(?:,\s*\d+)*)\]/g, function (_, nums) {
      return nums
        .split(',')
        .map(function (n) {
          n = n.trim();
          return '<sup class="citation-ref" title="Source ' + n + '">' + n + '</sup>';
        })
        .join('');
    });

    // Restore code slots
    codeSlots.forEach(function (html, i) {
      t = t.split('\x00CODE' + i + '\x00').join(html);
    });

    // Restore pills
    _pillStore.forEach(function (html, key) {
      if (t.indexOf(key) >= 0) t = t.split(key).join(html);
    });
    _pillStore.clear();

    return t;
  }

  // ── Block typing ───────────────────────────────────────────

  function getBlockType(l) {
    var t = String(l || '').trim();
    if (!t) return 'empty';
    if (/^#{1,6}\s/.test(t)) return 'heading';
    if (t === '>' || t.startsWith('> ')) return 'blockquote';
    if (/^[-*_]{3,}\s*$/.test(t)) return 'hr';
    if (/^(\s*)([-*+]|\d+\.)\s+\[([ xX])\]\s/.test(t) || /^- \[[ xX]\]\s/.test(t)) return 'task';
    if (/^(\s*)([-*+])\s+/.test(t)) return 'ul';
    if (/^(\s*)\d+\.\s+/.test(t)) return 'ol';
    if (t.startsWith('|') && t.indexOf('|', 1) > 0) return 'table-row';
    if (t.startsWith('```') || t.startsWith('~~~')) {
      var g0 = t.slice(3).trim().toLowerCase();
      if (/^(graph|bar|line|pie)\b/.test(g0)) {
        return { type: 'graph', graphType: g0.split(/\s+/)[0], fence: t.slice(0, 3) };
      }
      return { type: 'code-fence', fence: t.slice(0, 3), meta: t.slice(3).trim() };
    }
    // footnote def [^id]: text
    if (/^\[\^[^\]]+\]:/.test(t)) return 'footnote-def';
    return 'paragraph';
  }

  // ── Tables (GFM alignment) ─────────────────────────────────

  function splitTableCells(line) {
    var raw = String(line || '').trim();
    if (raw.charAt(0) === '|') raw = raw.slice(1);
    if (raw.charAt(raw.length - 1) === '|') raw = raw.slice(0, -1);
    return raw.split('|').map(function (c) {
      return c.trim();
    });
  }

  function isAlignRow(line) {
    var cells = splitTableCells(line);
    if (!cells.length) return false;
    return cells.every(function (c) {
      return /^:?-{3,}:?$/.test(c);
    });
  }

  function parseAlignRow(line) {
    return splitTableCells(line).map(function (c) {
      var left = c.charAt(0) === ':';
      var right = c.charAt(c.length - 1) === ':';
      if (left && right) return 'center';
      if (right) return 'right';
      if (left) return 'left';
      return null;
    });
  }

  function renderTable(lines) {
    var table = document.createElement('table');
    table.className = 'modern-table md-table';
    var aligns = null;
    var body = document.createElement('tbody');
    var head = document.createElement('thead');
    var headerDone = false;

    (lines || []).forEach(function (line) {
      if (isAlignRow(line)) {
        aligns = parseAlignRow(line);
        return;
      }
      var cells = splitTableCells(line);
      if (!cells.length) return;

      var tr = document.createElement('tr');
      var isHeader = !headerDone;
      cells.forEach(function (c, ci) {
        var cell = document.createElement(isHeader ? 'th' : 'td');
        cell.innerHTML = parseInline(c);
        if (aligns && aligns[ci]) {
          try {
            cell.style.textAlign = aligns[ci];
          } catch (e) {}
        }
        tr.appendChild(cell);
      });
      if (isHeader) {
        head.appendChild(tr);
        headerDone = true;
      } else {
        body.appendChild(tr);
      }
    });

    if (head.children && head.children.length) table.appendChild(head);
    else if (head.childNodes && head.childNodes.length) table.appendChild(head);
    if (body.children && body.children.length) table.appendChild(body);
    else if (body.childNodes && body.childNodes.length) table.appendChild(body);

    // Fallback if environment has no children tracking: still attach
    if (!table.children || !table.children.length) {
      if (head) table.appendChild(head);
      if (body) table.appendChild(body);
    }

    var wrapper = document.createElement('div');
    wrapper.className = 'table-wrapper modern-table md-table-wrap';
    wrapper.appendChild(table);
    return wrapper;
  }

  // ── Lists (nested + task) ──────────────────────────────────

  function listIndent(line) {
    var m = String(line).match(/^(\s*)/);
    return m ? m[1].length : 0;
  }

  function renderList(lines, startI) {
    var first = lines[startI];
    var baseIndent = listIndent(first);
    var firstType = getBlockType(first);
    var listTag = firstType === 'ol' ? 'ol' : 'ul';
    var list = document.createElement(listTag);
    list.className = firstType === 'task' ? 'task-list modern-list' : 'modern-list';

    var i = startI;
    while (i < lines.length) {
      var line = lines[i];
      var ind = listIndent(line);
      var t = getBlockType(line);
      if (t === 'empty') {
        // allow blank between loose list items
        if (i + 1 < lines.length && listIndent(lines[i + 1]) >= baseIndent && /list|task|ul|ol|paragraph/.test(String(getBlockType(lines[i + 1])))) {
          i++;
          continue;
        }
        break;
      }
      if (ind < baseIndent) break;
      if (t !== 'ul' && t !== 'ol' && t !== 'task' && t !== 'paragraph') break;

      // nested list
      if ((t === 'ul' || t === 'ol' || t === 'task') && ind > baseIndent) {
        var nested = renderList(lines, i);
        if (list.lastElementChild) list.lastElementChild.appendChild(nested.element);
        else list.appendChild(nested.element);
        i = nested.nextIndex;
        continue;
      }

      if (t === 'paragraph' && list.lastElementChild) {
        var p = document.createElement('p');
        p.className = 'modern-paragraph';
        p.innerHTML = parseInline(line.trim());
        list.lastElementChild.appendChild(p);
        i++;
        continue;
      }

      var li = document.createElement('li');
      var taskMatch = line.trim().match(/^([-*+]|\d+\.)\s+\[([ xX])\]\s+(.*)$/) || line.trim().match(/^- \[([ xX])\]\s+(.*)$/);
      var txt;
      if (taskMatch && taskMatch.length >= 3) {
        var checked = (taskMatch[2] || taskMatch[1] || '').toLowerCase() === 'x';
        var content = taskMatch[3] != null ? taskMatch[3] : taskMatch[2];
        // normalize when first form
        if (taskMatch[0].indexOf('] ') >= 0) {
          var m2 = line.trim().match(/\[([ xX])\]\s+(.*)$/);
          if (m2) {
            checked = m2[1].toLowerCase() === 'x';
            content = m2[2];
          }
        }
        var chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.disabled = true;
        chk.checked = checked;
        li.appendChild(chk);
        li.classList.add('task-item');
        if (checked) li.classList.add('task-done');
        list.classList.add('task-list');
        txt = content;
      } else {
        txt = line.replace(/^\s*([-*+]|\d+\.)\s+/, '').replace(/^\s*-\s+\[[ xX]\]\s+/, '');
      }
      var span = document.createElement('span');
      span.innerHTML = parseInline(txt);
      li.appendChild(span);
      list.appendChild(li);
      i++;
    }
    return { element: list, nextIndex: i };
  }

  // ── Built-in code chrome (host can override) ───────────────

  function setData(el, key, val) {
    try {
      if (el.dataset) el.dataset[key] = val;
      else el.setAttribute('data-' + key, val);
    } catch (e) {
      try {
        el.setAttribute('data-' + key, val);
      } catch (e2) {}
    }
  }

  function defaultCodeBlock(lang, code, filename) {
    var wrapper = document.createElement('div');
    wrapper.className = 'code-block modern-code md-code';
    setData(wrapper, 'lang', lang || 'code');
    if (filename) setData(wrapper, 'file', filename);

    var header = document.createElement('div');
    header.className = 'code-header md-code-header';
    var badge = document.createElement('span');
    badge.className = 'code-lang-badge';
    badge.textContent = (filename || (lang || 'code').toUpperCase()).slice(0, 40);
    var lines = document.createElement('span');
    lines.className = 'code-line-count';
    var n = code.split('\n').length;
    lines.textContent = n + ' line' + (n === 1 ? '' : 's');
    var wrapBtn = document.createElement('button');
    wrapBtn.type = 'button';
    wrapBtn.className = 'code-copy-btn modern-copy md-wrap-btn';
    wrapBtn.textContent = 'Wrap';
    wrapBtn.title = 'Toggle word wrap';
    var copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'code-copy-btn modern-copy';
    copyBtn.innerHTML = 'Copy';
    copyBtn.onclick = function () {
      try {
        navigator.clipboard.writeText(code).then(function () {
          copyBtn.textContent = 'Copied';
          setTimeout(function () {
            copyBtn.textContent = 'Copy';
          }, 1600);
        });
      } catch (e) {
        copyBtn.textContent = 'Fail';
      }
    };
    header.appendChild(badge);
    header.appendChild(lines);
    header.appendChild(wrapBtn);
    header.appendChild(copyBtn);

    var container = document.createElement('div');
    container.className = 'code-container md-code-body';
    var nums = document.createElement('div');
    nums.className = 'line-numbers';
    code.split('\n').forEach(function (_, i) {
      var s = document.createElement('span');
      s.textContent = String(i + 1);
      nums.appendChild(s);
    });
    var pre = document.createElement('pre');
    var codeEl = document.createElement('code');
    codeEl.textContent = code;
    highlight(codeEl, lang);
    pre.appendChild(codeEl);
    container.appendChild(nums);
    container.appendChild(pre);
    wrapBtn.onclick = function () {
      pre.classList.toggle('md-wrap');
      wrapBtn.classList.toggle('on');
    };

    // Collapse very long blocks
    if (n > 40) {
      wrapper.classList.add('md-code-long');
      var more = document.createElement('button');
      more.type = 'button';
      more.className = 'md-code-expand';
      more.textContent = 'Show all ' + n + ' lines';
      more.onclick = function () {
        wrapper.classList.add('md-code-expanded');
        more.remove();
      };
      wrapper.appendChild(header);
      wrapper.appendChild(container);
      wrapper.appendChild(more);
      return wrapper;
    }

    wrapper.appendChild(header);
    wrapper.appendChild(container);
    return wrapper;
  }

  function highlight(codeEl, lang) {
    if (_host.highlight) {
      try {
        _host.highlight(codeEl, lang);
        return;
      } catch (e) {}
    }
    if (g.hljs) {
      try {
        var canonical = normLang(lang);
        var known = g.hljs.getLanguage(canonical) ? canonical : null;
        var result = known
          ? g.hljs.highlight(codeEl.textContent, { language: known, ignoreIllegals: true })
          : g.hljs.highlightAuto(codeEl.textContent);
        codeEl.innerHTML = result.value;
        return;
      } catch (e) {}
    }
    // minimal escape already textContent
  }

  function makeCodeBlock(lang, code, filename) {
    if (_host.createCodeBlock) {
      try {
        return _host.createCodeBlock(lang, code, filename);
      } catch (e) {
        log('error', 'createCodeBlock failed', e.message);
      }
    }
    return defaultCodeBlock(lang, code, filename);
  }

  // ── Blocks ─────────────────────────────────────────────────

  function renderBlocks(lines, parent) {
    var i = 0;
    while (i < lines.length) {
      var bt = getBlockType(lines[i]);
      var t = lines[i].trim();
      if (bt === 'empty') {
        i++;
        continue;
      }
      if (bt === 'hr') {
        parent.appendChild(document.createElement('hr'));
        i++;
        continue;
      }
      if (bt === 'footnote-def') {
        var fm = t.match(/^\[\^([^\]]+)\]:\s*(.*)$/);
        if (fm) {
          var fd = document.createElement('div');
          fd.className = 'md-footnote-def';
          fd.innerHTML = '<sup class="citation-ref">' + esc(fm[1]) + '</sup> ' + parseInline(fm[2]);
          parent.appendChild(fd);
        }
        i++;
        continue;
      }
      try {
        if (typeof bt === 'object' && bt.type === 'graph') {
          var fence = bt.fence || '```';
          i++;
          var gLines = [];
          while (i < lines.length && !lines[i].trim().startsWith(fence) && !lines[i].trim().startsWith('```')) {
            gLines.push(lines[i]);
            i++;
          }
          i++;
          if (_host.renderGraph) parent.appendChild(_host.renderGraph(bt.graphType, gLines));
          else {
            var gf = document.createElement('pre');
            gf.className = 'md-graph-fallback';
            gf.textContent = gLines.join('\n');
            parent.appendChild(gf);
          }
          continue;
        }
        if (typeof bt === 'object' && bt.type === 'code-fence') {
          var fenceCh = bt.fence || '```';
          var meta = bt.meta || t.slice(3).trim();
          var parsed = parseCodingFence(meta);
          i++;
          var cLines = [];
          while (i < lines.length) {
            var close = String(lines[i] == null ? '' : lines[i]).trim();
            if (close === '```' || close === '~~~' || close.indexOf(fenceCh) === 0) {
              i++;
              break;
            }
            cLines.push(lines[i]);
            i++;
          }
          parent.appendChild(makeCodeBlock(parsed.lang || 'code', cLines.join('\n'), parsed.filename));
          continue;
        }
        switch (bt) {
          case 'heading': {
            var lvl = t.match(/^#+/)[0].length;
            var h = document.createElement('h' + Math.min(lvl, 6));
            h.className = 'modern-heading md-h';
            var hText = t.replace(/^#+\s*/, '');
            h.innerHTML = parseInline(hText);
            // optional anchor id from text
            var id = hText
              .toLowerCase()
              .replace(/[^\w\s-]/g, '')
              .trim()
              .replace(/\s+/g, '-')
              .slice(0, 64);
            if (id) h.id = 'md-' + id;
            parent.appendChild(h);
            i++;
            break;
          }
          case 'blockquote': {
            var bq = document.createElement('blockquote');
            bq.className = 'modern-blockquote md-quote';
            var bqLines = [];
            while (i < lines.length && (lines[i].trim().startsWith('>') || lines[i].trim() === '>')) {
              bqLines.push(lines[i].replace(/^>\s?/, ''));
              i++;
            }
            renderBlocks(bqLines, bq);
            parent.appendChild(bq);
            break;
          }
          case 'ul':
          case 'ol':
          case 'task': {
            var r = renderList(lines, i);
            parent.appendChild(r.element);
            i = r.nextIndex;
            break;
          }
          case 'table-row': {
            var tLines = [];
            while (i < lines.length && lines[i].trim().startsWith('|')) {
              tLines.push(lines[i]);
              i++;
            }
            parent.appendChild(renderTable(tLines));
            break;
          }
          default: {
            var pLines = [];
            while (i < lines.length) {
              var nb = getBlockType(lines[i]);
              if (nb === 'empty' || nb !== 'paragraph') break;
              pLines.push(lines[i]);
              i++;
            }
            var p = document.createElement('p');
            p.className = 'modern-paragraph';
            // soft line breaks: two spaces at EOL already joined with space; preserve double-newline as new p
            p.innerHTML = parseInline(pLines.join(' '));
            parent.appendChild(p);
            break;
          }
        }
      } catch (e) {
        log('error', 'block render failed', e.message);
        var fb = document.createElement('p');
        fb.className = 'modern-paragraph md-error';
        fb.textContent = lines[i] || '';
        parent.appendChild(fb);
        i++;
      }
    }
  }

  // ── Think / plan split ─────────────────────────────────────

  function splitThink(text) {
    text = String(text == null ? '' : text);
    var oTag = text.indexOf('<think>');
    if (oTag === -1) return { think: null, visible: text, thinkOpen: false };
    var cTag = text.indexOf('</think>', oTag + 7);
    if (cTag === -1) {
      return { think: text.slice(oTag + 7), visible: text.slice(0, oTag).trim(), thinkOpen: true };
    }
    return {
      think: text.slice(oTag + 7, cTag).trim(),
      visible: (text.slice(0, oTag) + text.slice(cTag + 8)).trim(),
      thinkOpen: false,
    };
  }

  function buildDefaultPlanDOM(rawContent, isTodo) {
    var steps = String(rawContent || '')
      .trim()
      .split('\n')
      .filter(function (l) {
        return l.trim();
      });
    var doneCount = steps.filter(function (s) {
      return s.indexOf('[x]') >= 0 || s.indexOf('\u2705') >= 0;
    }).length;
    var block = document.createElement('div');
    block.className = isTodo ? 'ac-todo-block ac-plan-block' : 'ac-plan-block';
    var hdr = document.createElement('div');
    hdr.className = 'ac-plan-header';
    hdr.textContent = (isTodo ? 'Todo' : 'Plan') + ' · ' + doneCount + '/' + steps.length;
    block.appendChild(hdr);
    steps.forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'ac-plan-step';
      row.textContent = s.replace(/^\s*-\s*\[[^\]]*\]\s*/, '').trim();
      block.appendChild(row);
    });
    return block;
  }

  // ── Streaming helper: close open fences for mid-stream preview ──

  function stabilizeForStream(text) {
    var t = String(text || '');
    // incomplete code fence
    var ticks = (t.match(/```/g) || []).length;
    if (ticks % 2 === 1) t += '\n```';
    // incomplete think
    if (t.indexOf('<think>') >= 0 && t.indexOf('</think>') < 0) {
      /* leave open — splitThink handles */
    }
    // incomplete tool call
    t = t.replace(/\[\[\w+:[^\]]*$/, '');
    return t;
  }

  // ── Main parse ─────────────────────────────────────────────

  function parse(text, opts) {
    opts = opts || {};
    if (opts.host) configure(opts.host);

    var split = splitThink(text);
    var container = document.createElement('div');
    container.className = 'aether-md md-root';
    container.setAttribute('data-md-engine', VERSION);

    var showThoughts = _host.showThoughts != null ? !!_host.showThoughts() : opts.showThoughts !== false;
    var liveThink = _host.getLiveThinkEl ? _host.getLiveThinkEl() : null;

    if (split.think && showThoughts && !liveThink) {
      var tokens = Math.round((split.think.match(/\S+/g) || []).length);
      var td = document.createElement('div');
      td.className = 'thought-process modern-thought';
      td.innerHTML =
        '<div class="thought-header">' +
        '<span class="thought-title">Chain of Thought</span>' +
        '<span class="thought-token-count">~' +
        tokens +
        ' tokens</span>' +
        '<button type="button" class="thought-toggle" onclick="this.closest(\'.thought-process\').classList.toggle(\'collapsed\')">▾</button>' +
        '</div>' +
        '<div class="thought-content">' +
        esc(split.think).replace(/\n/g, '<br>') +
        '</div>';
      container.appendChild(td);
    }

    var displayText = split.visible || text || '';
    if (opts.stream) displayText = stabilizeForStream(displayText);

    // Aether plan/todo segments
    var PLAN_RE = /<aether:(plan|todo)>([\s\S]*?)<\/aether:\1>/gi;
    var segments = [];
    var lastIdx = 0;
    var pm;
    PLAN_RE.lastIndex = 0;
    while ((pm = PLAN_RE.exec(displayText)) !== null) {
      if (pm.index > lastIdx) segments.push({ type: 'text', val: displayText.slice(lastIdx, pm.index) });
      segments.push({ type: pm[1], val: pm[2] });
      lastIdx = PLAN_RE.lastIndex;
    }
    if (lastIdx < displayText.length) segments.push({ type: 'text', val: displayText.slice(lastIdx) });
    if (!segments.length) segments.push({ type: 'text', val: displayText });

    segments.forEach(function (seg) {
      if (seg.type === 'text') {
        if (String(seg.val).trim()) renderBlocks(String(seg.val).split('\n'), container);
      } else {
        var builder = _host.buildPlanDOM || buildDefaultPlanDOM;
        container.appendChild(builder(seg.val, seg.type === 'todo'));
      }
    });

    // Math
    if (_host.renderMath) {
      try {
        _host.renderMath(container);
      } catch (e) {}
    } else if (typeof g.renderMathInElement === 'function') {
      try {
        g.renderMathInElement(container, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true },
          ],
          throwOnError: false,
        });
      } catch (e) {}
    }

    return container;
  }

  // ── Serialize tree (works without full browser HTML parser) ──

  function serialize(node) {
    if (!node) return '';
    if (node.nodeType === 3) return node.textContent || '';
    var tag = (node.tagName || 'div').toLowerCase();
    var attrs = '';
    if (node.attrs) {
      Object.keys(node.attrs).forEach(function (k) {
        attrs += ' ' + k + '="' + String(node.attrs[k]).replace(/"/g, '&quot;') + '"';
      });
    }
    if (node.getAttribute && node.getAttribute('href') && attrs.indexOf('href=') < 0) {
      attrs += ' href="' + String(node.getAttribute('href')).replace(/"/g, '&quot;') + '"';
    }
    if (node.className && attrs.indexOf('class=') < 0) {
      attrs += ' class="' + String(node.className).replace(/"/g, '&quot;') + '"';
    }
    if (node.type && tag === 'input') attrs += ' type="' + node.type + '"';
    if (node.checked) attrs += ' checked="checked"';
    var open = '<' + tag + attrs + '>';
    var inner = '';
    if (node.children && node.children.length) {
      inner = node.children
        .map(function (c) {
          return serialize(c);
        })
        .join('');
    } else if (node.innerHTML) {
      inner = String(node.innerHTML);
    } else if (node.textContent) {
      inner = esc(node.textContent);
    }
    if (tag === 'img' || tag === 'input' || tag === 'br' || tag === 'hr') return open;
    return open + inner + '</' + tag + '>';
  }

  // ── Golden fixtures ────────────────────────────────────────

  function runGoldenFixtures() {
    var fixtures = [
      {
        name: 'heading_bold',
        md: '# Hello **world**\n\nPara with `code`.',
        expect: function (html) {
          return /<h1[\s>]/.test(html) && /<strong>/.test(html) && /inline-code/.test(html);
        },
      },
      {
        name: 'table_gfm',
        md: '| A | B |\n| --- | ---: |\n| 1 | 2 |',
        expect: function (html) {
          return /<table[\s>]/.test(html) && /<td[\s>]/.test(html);
        },
      },
      {
        name: 'task_list',
        md: '- [x] Done\n- [ ] Todo',
        expect: function (html) {
          return (html.match(/type="checkbox"/g) || []).length >= 2 && /checked/.test(html);
        },
      },
      {
        name: 'strike_link',
        md: '~~old~~ [link](https://example.com)',
        expect: function (html) {
          return /<del>/.test(html) && /href="https:\/\/example\.com"/.test(html);
        },
      },
      {
        name: 'xss_js_href',
        md: '[x](javascript:alert(1))',
        expect: function (html) {
          return /href="#"/ .test(html) && !/javascript:/i.test(html);
        },
      },
      {
        name: 'code_fence',
        md: '```js\nconst x = 1;\n```',
        expect: function (html) {
          return /<pre[\s>]/.test(html) || /code-block/.test(html) || /md-code/.test(html);
        },
      },
      {
        name: 'blockquote',
        md: '> quoted **text**',
        expect: function (html) {
          return /<blockquote[\s>]/.test(html) && /<strong>/.test(html);
        },
      },
      {
        name: 'nested_list',
        md: '- a\n  - b\n  - c\n- d',
        expect: function (html) {
          return (html.match(/<ul[\s>]/g) || []).length >= 2;
        },
      },
      {
        name: 'autolink',
        md: 'See https://aether.example/path for more.',
        expect: function (html) {
          return /https:\/\/aether\.example\/path/.test(html) && /<a[\s>]/.test(html);
        },
      },
      {
        name: 'stream_fence_stabilize',
        md: stabilizeForStream('```python\nprint(1)'),
        expect: function (html) {
          return /print\(1\)/.test(html) && (/pre|code-block|md-code/.test(html));
        },
      },
      {
        name: 'safe_href_unit',
        md: 'x',
        expect: function () {
          return safeHref('javascript:alert(1)') === '#' && safeHref('https://ok.test') === 'https://ok.test';
        },
      },
    ];

    var results = [];
    fixtures.forEach(function (f) {
      var pass = false;
      var err = '';
      try {
        var el = parse(f.md);
        var html = serialize(el);
        pass = !!f.expect(html, el);
      } catch (e) {
        err = e.message || String(e);
      }
      results.push({ name: f.name, pass: pass, detail: err });
    });
    var passed = results.filter(function (r) {
      return r.pass;
    }).length;
    return {
      version: VERSION,
      ok: passed === results.length,
      passed: passed,
      total: results.length,
      results: results,
    };
  }

  var api = {
    version: VERSION,
    configure: configure,
    parse: parse,
    parseMarkdown: parse,
    parseInline: parseInline,
    renderBlocks: renderBlocks,
    getBlockType: getBlockType,
    splitThink: splitThink,
    stabilizeForStream: stabilizeForStream,
    normLang: normLang,
    parseCodingFence: parseCodingFence,
    esc: esc,
    safeHref: safeHref,
    runGoldenFixtures: runGoldenFixtures,
    getLog: function () {
      return _log.slice();
    },
    clearLog: function () {
      _log = [];
    },
  };

  g.AETHER_Markdown = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
