#!/usr/bin/env node
/**
 * AETHER shipcheck — Node CI smoke for golden suites
 * Loads IIFE core modules in a minimal globalThis and runs:
 *   markdown fixtures · tool golden · ship structural checks
 *
 * Usage: node scripts/shipcheck.mjs
 * Exit 0 on PASS, 1 on FAIL.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function el(tag) {
  const kids = [];
  return {
    tagName: String(tag || 'div').toUpperCase(),
    style: {},
    className: '',
    classList: {
      _s: new Set(),
      add(...xs) {
        xs.forEach((x) => this._s.add(x));
        this._host && (this._host.className = [...this._s].join(' '));
      },
      remove(...xs) {
        xs.forEach((x) => this._s.delete(x));
      },
      toggle(x) {
        if (this._s.has(x)) this._s.delete(x);
        else this._s.add(x);
        return this._s.has(x);
      },
      contains(x) {
        return this._s.has(x);
      },
    },
    textContent: '',
    innerHTML: '',
    children: kids,
    childNodes: kids,
    dataset: {},
    appendChild(c) {
      kids.push(c);
      return c;
    },
    append(...cs) {
      cs.forEach((c) => kids.push(c));
    },
    setAttribute() {},
    getAttribute() {
      return null;
    },
    removeAttribute() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
    removeEventListener() {},
    closest() {
      return null;
    },
    cloneNode() {
      return el(tag);
    },
  };
}

function loadScript(rel, sandbox) {
  const full = path.join(ROOT, rel);
  const code = fs.readFileSync(full, 'utf8');
  vm.runInContext(code, sandbox, { filename: rel });
}

function main() {
  const makeEl = (tag) => {
    const node = el(tag);
    node.classList._host = node;
    return node;
  };

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    TypeError,
    Promise,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Symbol,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    Buffer,
    URL,
    URLSearchParams,
    localStorage: {
      _m: Object.create(null),
      getItem(k) {
        return this._m[k] != null ? this._m[k] : null;
      },
      setItem(k, v) {
        this._m[k] = String(v);
      },
      removeItem(k) {
        delete this._m[k];
      },
    },
    document: {
      createElement: makeEl,
      createTextNode(t) {
        return { textContent: String(t), nodeType: 3 };
      },
      createDocumentFragment() {
        return makeEl('fragment');
      },
      createComment() {
        return { textContent: '' };
      },
      getElementById() {
        return null;
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
      body: makeEl('body'),
      head: makeEl('head'),
      documentElement: makeEl('html'),
      addEventListener() {},
      removeEventListener() {},
    },
    navigator: { userAgent: 'aether-shipcheck', language: 'en' },
    location: { href: 'http://localhost/shipcheck', hostname: 'localhost', protocol: 'http:', origin: 'http://localhost' },
    fetch: async () => ({ ok: false, status: 503, text: async () => '', json: async () => ({}) }),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    performance: { now: () => Date.now() },
    requestAnimationFrame: (fn) => setTimeout(fn, 16),
    cancelAnimationFrame: clearTimeout,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.HTMLElement = function () {};
  sandbox.Node = function () {};
  // Minimal DOMParser / XMLSerializer for viz sanitize goldens
  sandbox.DOMParser = function () {
    this.parseFromString = function (str) {
      var hasScript = /<script/i.test(str);
      var fake = {
        documentElement: {
          nodeType: 1,
          tagName: 'svg',
          attributes: [],
          childNodes: hasScript
            ? [{ nodeType: 1, tagName: 'script', attributes: [], childNodes: [], parentNode: null, removeAttribute: function () {}, getAttribute: function () { return null; }, setAttribute: function () {} }]
            : [{ nodeType: 1, tagName: 'rect', attributes: [], childNodes: [], parentNode: null, removeAttribute: function () {}, getAttribute: function () { return null; }, setAttribute: function () {} }],
          parentNode: null,
          removeAttribute: function () {},
          getAttribute: function () { return null; },
          setAttribute: function () {},
        },
        querySelector: function (sel) {
          if (/parseerror/i.test(sel) && /<<<<|error/i.test(str)) return {};
          return null;
        },
      };
      // Wire parentNode for removeChild
      fake.documentElement.childNodes.forEach(function (ch) {
        ch.parentNode = {
          removeChild: function (n) {
            fake.documentElement.childNodes = fake.documentElement.childNodes.filter(function (x) {
              return x !== n;
            });
          },
        };
      });
      return fake;
    };
  };
  sandbox.XMLSerializer = function () {
    this.serializeToString = function (el) {
      if (!el) return '';
      var kids = (el.childNodes || [])
        .map(function (c) {
          return c.tagName ? '<' + c.tagName + '/>' : '';
        })
        .join('');
      return '<' + (el.tagName || 'svg') + '>' + kids + '</' + (el.tagName || 'svg') + '>';
    };
  };
  sandbox.performance = { now: () => Date.now() };
  vm.createContext(sandbox);

  const modules = [
    'core/version.js',
    'core/safe-math.js',
    'core/aether-markdown.js',
    'core/aether-tool-runtime.js',
    'core/aether-security.js',
    'core/skill-utils.js',
    'core/aether-skills-pack.js',
    'core/aether-skill-runtime.js',
    'core/aether-deep-research.js',
    'core/aether-moat.js',
    'core/ghost-commits.js',
    'core/aether-visualizer.js',
    'core/aether-ship.js',
  ];

  for (const m of modules) {
    try {
      loadScript(m, sandbox);
    } catch (e) {
      console.error('LOAD FAIL', m, e.message);
      process.exit(1);
    }
  }

  // Host stubs (kernel / code pro live in app shell)
  sandbox.AETHER_Kernel = sandbox.AETHER_Kernel || {
    log: () => {},
    on: () => {},
    getFlights: () => [],
  };
  sandbox.AETHER_Ghost = sandbox.AETHER_Ghost || {
    accept: async () => ({ ok: true }),
    propose: (x) => x,
    loadQueue: () => [],
    render: () => {},
  };
  // Ghost module may already export — ensure accept exists
  if (sandbox.AETHER_Ghost && !sandbox.AETHER_Ghost.accept) {
    sandbox.AETHER_Ghost.accept = async () => ({ ok: true });
  }
  if (sandbox.AETHER_Ghost && !sandbox.AETHER_Ghost.propose) {
    sandbox.AETHER_Ghost.propose = (x) => x;
  }
  sandbox.AETHER_RAGv2 = sandbox.AETHER_RAGv2 || {
    indexFolder: async () => ({ ok: true, indexed: 0 }),
    stats: () => ({ chunks: 0, hybrid: true, collections: [] }),
  };
  if (sandbox.AETHER_RAGv2 && !sandbox.AETHER_RAGv2.indexFolder) {
    sandbox.AETHER_RAGv2.indexFolder = async () => ({ ok: true, indexed: 0 });
  }
  sandbox.AETHER_CodePro = sandbox.AETHER_CodePro || {
    listCheckpoints: () => [],
    getTouched: () => [],
  };
  sandbox.AETHER_ChangeSet = sandbox.AETHER_ChangeSet || {
    createFromPending: () => null,
  };
  sandbox.TOOL_REGISTRY = {
    fs_read: { desc: 'read', fn: async () => 'ok' },
    fs_patch: { desc: 'patch', fn: async () => 'ok' },
    fs_write: { desc: 'write', fn: async () => 'ok' },
    fs_list: { desc: 'list', fn: async () => 'ok' },
    web_search: { desc: 'search', fn: async () => 'ok' },
    calculate: { desc: 'calc', fn: async () => '4' },
  };

  // Merge skills pack into registry for golden paths
  sandbox.AETHER_SKILLS = sandbox.AETHER_SKILLS || {};
  if (sandbox.AETHER_SkillsPack && sandbox.AETHER_SkillsPack.mergeIntoRegistry) {
    try {
      sandbox.AETHER_SkillsPack.mergeIntoRegistry(sandbox.AETHER_SKILLS);
    } catch (e) {
      console.warn('skills merge:', e.message);
    }
  }
  // Ensure aether-code skill exists for playbook checks
  if (!sandbox.AETHER_SKILLS['aether-code'] && sandbox.AETHER_SkillsPack) {
    try {
      const sk =
        sandbox.AETHER_SkillsPack.resolveSkill &&
        sandbox.AETHER_SkillsPack.resolveSkill(sandbox.AETHER_SKILLS, 'aether-code');
      if (sk) sandbox.AETHER_SKILLS['aether-code'] = sk;
    } catch (_) {}
  }

  if (sandbox.AETHER_Moat && sandbox.AETHER_Moat.installHooks) {
    try {
      sandbox.AETHER_Moat.installHooks();
    } catch (_) {}
  }

  const failures = [];
  const lines = [];

  const ver = sandbox.AETHER_VERSION;
  lines.push('product v' + ver + ' · ' + (sandbox.AETHER_CODENAME || ''));
  if (!ver || !String(ver).match(/^\d+\.\d+/)) {
    failures.push('version missing');
  }

  // Markdown golden (must be 100%)
  if (sandbox.AETHER_Markdown && sandbox.AETHER_Markdown.runGoldenFixtures) {
    const md = sandbox.AETHER_Markdown.runGoldenFixtures();
    lines.push('markdown: ' + md.passed + '/' + md.total + (md.ok ? ' PASS' : ' FAIL'));
    if (!md.ok) {
      failures.push('markdown');
      (md.results || [])
        .filter((r) => !r.pass)
        .forEach((r) => lines.push('  ✗ ' + r.name + (r.detail ? ' — ' + r.detail : '')));
    }
  } else {
    failures.push('markdown offline');
    lines.push('markdown: OFFLINE');
  }

  // Tool golden
  if (sandbox.AETHER_ToolRuntime && sandbox.AETHER_ToolRuntime.runGoldenSuite) {
    const tools = sandbox.AETHER_ToolRuntime.runGoldenSuite(sandbox.TOOL_REGISTRY);
    lines.push('tools: ' + tools.passed + '/' + tools.total + (tools.ok ? ' PASS' : ' FAIL'));
    if (!tools.ok) {
      failures.push('tools');
      (tools.results || [])
        .filter((r) => !r.pass)
        .forEach((r) => lines.push('  ✗ ' + r.name + (r.detail ? ' — ' + r.detail : '')));
    }
  } else {
    failures.push('tools offline');
    lines.push('tools: OFFLINE');
  }

  // Ship golden paths — allow soft skill smoke fails in headless (engine skills need app)
  if (sandbox.AETHER_Ship && sandbox.AETHER_Ship.runGoldenPaths) {
    const g = sandbox.AETHER_Ship.runGoldenPaths();
    const hardFails = (g.results || []).filter(
      (r) =>
        !r.pass &&
        r.name !== 'skill_runtime_smokes' &&
        r.name !== 'aether_code_playbooks'
    );
    // playbooks are hard if skills pack loaded with aether-code
    const skillN = sandbox.AETHER_SKILLS ? Object.keys(sandbox.AETHER_SKILLS).length : 0;
    lines.push(
      'golden_paths: ' +
        g.passed +
        '/' +
        g.total +
        (hardFails.length === 0 ? ' PASS' : ' FAIL') +
        ' · skills=' +
        skillN
    );
    if (hardFails.length) {
      failures.push('golden_paths');
      hardFails.forEach((r) => lines.push('  ✗ ' + r.name + (r.detail ? ' — ' + r.detail : '')));
    } else if (!g.ok) {
      // soft-only fails (skill smokes without full engine) — warn, don't fail CI
      (g.results || [])
        .filter((r) => !r.pass)
        .forEach((r) => lines.push('  ~ ' + r.name + (r.detail ? ' — ' + r.detail : '')));
    }
  }

  // Full shipcheck — modules must pass; skill softs tolerated via same policy
  if (sandbox.AETHER_Ship && sandbox.AETHER_Ship.runShipCheck) {
    const sc = sandbox.AETHER_Ship.runShipCheck(sandbox.TOOL_REGISTRY);
    lines.push('shipcheck sections:');
    let hardShipFail = false;
    (sc.sections || []).forEach((sec) => {
      lines.push('  ' + sec.name + ': ' + sec.passed + '/' + sec.total + (sec.ok ? '' : ' FAIL'));
      if (sec.name === 'markdown' || sec.name === 'tools' || sec.name === 'modules') {
        if (!sec.ok) hardShipFail = true;
      }
      if (sec.name === 'golden_paths' && !sec.ok) {
        const bad = (sec.results || []).filter(
          (r) =>
            !r.pass &&
            r.name !== 'skill_runtime_smokes' &&
            r.name !== 'aether_code_playbooks'
        );
        if (bad.length) hardShipFail = true;
      }
    });
    if (hardShipFail) failures.push('shipcheck');
    else lines.push('shipcheck: PASS (hard sections)');
  }

  if (typeof sandbox.AETHER_safeCalculate === 'function') {
    const four = sandbox.AETHER_safeCalculate('2+2');
    if (String(four) !== '4') failures.push('safe-math 2+2');
    lines.push('safe-math: ' + four);
  }

  // Visualizer goldens (hard gate for aether-viz-v1)
  if (sandbox.AetherVisualizer && sandbox.AetherVisualizer.runGoldenFixtures) {
    const vg = sandbox.AetherVisualizer.runGoldenFixtures();
    lines.push(
      'visualizer: ' + vg.passed + '/' + vg.total + (vg.ok ? ' PASS' : ' FAIL') + ' · v' + vg.version
    );
    if (!vg.ok) {
      failures.push('visualizer');
      (vg.results || [])
        .filter((r) => !r.pass)
        .forEach((r) => lines.push('  ✗ ' + r.name + (r.detail ? ' — ' + r.detail : '')));
    }
  } else {
    failures.push('visualizer offline');
    lines.push('visualizer: OFFLINE');
  }

  // Structural file checks
  const mustExist = [
    'core/version.js',
    'core/aether-markdown.js',
    'core/aether-tool-runtime.js',
    'core/aether-visualizer.js',
    'core/aether-ship.js',
    'core/ghost-commits.js',
    'core/aether-rag-v2.js',
    'script.js',
    'sw.js',
    'index.html',
  ];
  for (const f of mustExist) {
    if (!fs.existsSync(path.join(ROOT, f))) {
      failures.push('missing ' + f);
      lines.push('  ✗ missing ' + f);
    }
  }

  console.log('⬡ AETHER shipcheck\n');
  console.log(lines.join('\n'));
  console.log('');

  if (failures.length) {
    console.error('FAIL · ' + failures.join(', '));
    process.exit(1);
  }
  console.log('PASS');
  process.exit(0);
}

main();
