#!/usr/bin/env node
/**
 * AETHER empty-catch lint.
 *
 * Not a style rule: most empty catches here are deliberate best-effort UI work.
 * This flags only the dangerous pattern that caused the drCallModel / fsGetHandle
 * bugs — an empty catch wrapped around a call to a name that is not declared
 * anywhere in the codebase, so a ReferenceError is swallowed silently.
 *
 * Usage: node scripts/lint-catches.mjs
 * Exit 0 when clean, 1 when a possibly-undefined call is hidden by an empty catch.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const BUILTINS = new Set([
  'window', 'globalThis', 'self', 'document', 'navigator', 'location', 'history',
  'localStorage', 'sessionStorage', 'console', 'JSON', 'Math', 'Date', 'Array',
  'Object', 'String', 'Number', 'Boolean', 'RegExp', 'Error', 'TypeError',
  'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol', 'Proxy', 'Reflect',
  'Intl', 'BigInt', 'fetch', 'setTimeout', 'clearTimeout', 'setInterval',
  'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask',
  'atob', 'btoa', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURI',
  'decodeURI', 'encodeURIComponent', 'decodeURIComponent', 'TextEncoder',
  'TextDecoder', 'Uint8Array', 'Uint8ClampedArray', 'ArrayBuffer', 'URL',
  'URLSearchParams', 'performance', 'crypto', 'alert', 'confirm', 'prompt',
  'matchMedia', 'addEventListener', 'removeEventListener', 'structuredClone',
  'AbortController', 'Blob', 'File', 'FileReader', 'CustomEvent', 'Event',
  'MutationObserver', 'IntersectionObserver', 'ResizeObserver', 'DOMParser',
  'XMLSerializer', 'Node', 'Element', 'HTMLElement', 'Image', 'Audio',
  'require', 'module', 'exports', 'process', 'Buffer', 'global',
  // CDN globals, guarded at their call sites; Web APIs.
  'renderMathInElement', 'Chart', 'Notification', 'getComputedStyle',
]);

const KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof',
  'new', 'await', 'throw', 'else', 'do', 'try', 'delete', 'void', 'yield',
  'in', 'of', 'instanceof', 'case', 'break', 'continue', 'class', 'super',
  'this', 'get', 'set', 'async',
]);

function sourceFiles() {
  const out = ['script.js', 'discovery-skill.js', 'documents-supremacy.js'];
  for (const f of fs.readdirSync(path.join(ROOT, 'core'))) {
    if (f.endsWith('.js')) out.push('core/' + f);
  }
  return out.filter((f) => fs.existsSync(path.join(ROOT, f)));
}

const files = sourceFiles();
const sources = new Map(files.map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));

// Every name declared or assigned anywhere is considered defined. Member
// assignments (g.AETHER_X = …) are handled by the AETHER_ prefix below.
const symbols = new Set(BUILTINS);
for (const src of sources.values()) {
  const decl = /\b(?:function|var|let|const|class)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = decl.exec(src))) symbols.add(m[1]);
  const assign = /(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*=(?!=)/g;
  while ((m = assign.exec(src))) symbols.add(m[1]);
  const globals = /\b(?:window|globalThis|g)\.(AETHER_[A-Za-z0-9_]+)\s*=/g;
  while ((m = globals.exec(src))) symbols.add(m[1]);
  // Function parameters and arrow params are local definitions, not missing globals.
  const params = /(?:function\s*[A-Za-z_$][\w$]*\s*|\bfunction\s*)\(([^)]*)\)|(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*=>/g;
  while ((m = params.exec(src))) {
    const raw = m[1] || m[2] || m[3] || '';
    raw.split(',').forEach((part) => {
      const hit = part.trim().match(/[A-Za-z_$][\w$]*/);
      if (hit) symbols.add(hit[0]);
    });
  }
}

// Empty catch: body may contain only whitespace/comments.
const EMPTY_CATCH = /catch\s*(?:\([^)]*\))?\s*\{((?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n]*)*)\}/g;

function tryBodyBefore(src, catchIndex) {
  // Walk back from `catch` over whitespace to the closing brace of its try block.
  let i = catchIndex - 1;
  while (i >= 0 && /\s/.test(src[i])) i--;
  if (src[i] !== '}') return null;
  let depth = 1;
  i--;
  while (i >= 0 && depth > 0) {
    if (src[i] === '}') depth++;
    else if (src[i] === '{') depth--;
    i--;
  }
  if (depth !== 0) return null;
  const open = i + 1;
  const before = src.slice(Math.max(0, open - 12), open).replace(/\s+$/, '');
  if (!/try$/.test(before)) return null; // else/catch chain, not a try block
  return { body: src.slice(open, catchIndex), line: src.slice(0, open).split('\n').length };
}

/** Blank out strings, templates and comments so prose is never read as code. */
function stripLiterals(code) {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];
    if (ch === '/' && next === '/') {
      while (i < code.length && code[i] !== '\n') out += ' ', i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      out += '  ';
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
        out += code[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += '  ';
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      out += ' ';
      i++;
      while (i < code.length) {
        if (code[i] === '\\') {
          out += '  ';
          i += 2;
          continue;
        }
        if (code[i] === quote) {
          out += ' ';
          i++;
          break;
        }
        out += code[i] === '\n' ? '\n' : ' ';
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

const findings = [];
let emptyTotal = 0;

for (const [file, src] of sources) {
  EMPTY_CATCH.lastIndex = 0;
  let m;
  while ((m = EMPTY_CATCH.exec(src))) {
    emptyTotal++;
    const info = tryBodyBefore(src, m.index);
    if (!info) continue;
    const code = stripLiterals(info.body);
    const calls = /(?<![\.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
    let c;
    while ((c = calls.exec(code))) {
      const name = c[1];
      if (KEYWORDS.has(name) || symbols.has(name)) continue;
      if (/^AETHER_/.test(name) && !symbols.has(name)) continue; // guarded global
      const line = src.slice(0, m.index).split('\n').length;
      findings.push(`${file}:${line}: empty catch hides possibly undefined ${name}()`);
    }
  }
}

console.log(`⬡ AETHER empty-catch lint · ${emptyTotal} empty catches · ${symbols.size} known names`);
if (findings.length) {
  findings.forEach((f) => console.log('  ✗ ' + f));
  console.error(`FAIL · ${findings.length} suspicious empty catch(es)`);
  process.exit(1);
}
console.log('PASS · no empty catch hides an undefined call');
process.exit(0);
