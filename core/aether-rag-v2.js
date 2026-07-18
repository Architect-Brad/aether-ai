/**
 * AETHER RAG v2 — hybrid BM25 + vector, smart chunking, collections, citations, IndexedDB
 *
 * Zero-backend. Browser-native. Compatible with existing RAG usage patterns.
 *
 * Public API (window.AETHER_RAGv2):
 *   addText(text, meta) / addFile(path, content, meta)
 *   search(query, opts) → { hits, citations, contextBlock }
 *   chunk(text, opts) → chunks[]
 *   listCollections() / clear(collection)
 *   reindexFromLegacy(docs[])
 *   stats()
 */
(function (g) {
  'use strict';

  var IDB_NAME = 'aether_rag_v2';
  var IDB_VER = 1;
  var STORE = 'chunks';
  var MAX_CHUNKS = 4000;
  var VEC_DIM = 384;
  var DEFAULT_TOP_K = 6;
  var RRF_K = 60;

  var STOPWORDS = {
    a: 1, an: 1, and: 1, are: 1, as: 1, at: 1, be: 1, but: 1, by: 1, for: 1,
    if: 1, in: 1, into: 1, is: 1, it: 1, no: 1, not: 1, of: 1, on: 1, or: 1,
    the: 1, to: 1, was: 1, will: 1, with: 1, i: 1, you: 1, he: 1, she: 1,
    we: 1, me: 1, my: 1, am: 1, have: 1, do: 1, can: 1, may: 1, this: 1, that: 1,
  };

  var _ready = null;
  var _mem = []; // in-memory cache of chunk records
  var _bm25 = null;
  var _dirty = false;
  var _settings = {
    hybrid: true,
    topK: DEFAULT_TOP_K,
    bm25Weight: 1,
    vectorWeight: 1,
    minScore: 0.01,
    citeInPrompt: true,
  };

  // ─── tokenization / BM25 ───────────────────────────────────

  function stem(w) {
    if (w.length < 3) return w;
    if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
    if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
    if (w.endsWith('ly') && w.length > 4) return w.slice(0, -2);
    if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
    return w;
  }

  function tokenize(t) {
    return String(t || '')
      .toLowerCase()
      .split(/[^\w'#./-]+/)
      .filter(function (w) {
        return w.length > 2 && !STOPWORDS[w];
      })
      .map(stem);
  }

  function BM25Index(k1, b) {
    this.k1 = k1 == null ? 1.5 : k1;
    this.b = b == null ? 0.75 : b;
    this.docs = []; // chunk ids
    this.texts = [];
    this.docFreqs = [];
    this.docLengths = [];
    this.termDocFreq = Object.create(null);
    this.totalDocs = 0;
    this._totalTokens = 0;
    this.avgDocLength = 0;
  }

  BM25Index.prototype.add = function (id, text) {
    var tokens = tokenize(text);
    var freq = Object.create(null);
    for (var i = 0; i < tokens.length; i++) {
      freq[tokens[i]] = (freq[tokens[i]] || 0) + 1;
    }
    this.docs.push(id);
    this.texts.push(text);
    this.docFreqs.push(freq);
    this.docLengths.push(tokens.length);
    this.totalDocs++;
    this._totalTokens += tokens.length;
    this.avgDocLength = this._totalTokens / this.totalDocs;
    for (var t in freq) {
      this.termDocFreq[t] = (this.termDocFreq[t] || 0) + 1;
    }
  };

  BM25Index.prototype.search = function (query, topK) {
    topK = topK || DEFAULT_TOP_K;
    var qt = tokenize(query);
    if (!qt.length || !this.totalDocs) return [];
    var scores = [];
    var avg = this.avgDocLength || 1;
    var k1 = this.k1,
      b = this.b;
    for (var i = 0; i < this.totalDocs; i++) {
      var s = 0;
      for (var j = 0; j < qt.length; j++) {
        var t = qt[j];
        var tf = this.docFreqs[i][t] || 0;
        if (!tf) continue;
        var df = this.termDocFreq[t] || 0;
        var idf = Math.log((this.totalDocs - df + 0.5) / (df + 0.5) + 1);
        s +=
          idf *
          ((tf * (k1 + 1)) /
            (tf + k1 * (1 - b + (b * this.docLengths[i]) / avg)));
      }
      if (s > 0) scores.push({ id: this.docs[i], text: this.texts[i], score: s, ranker: 'bm25' });
    }
    scores.sort(function (a, b) {
      return b.score - a.score;
    });
    return scores.slice(0, topK);
  };

  // ─── hashing embed (384-d, no CDN required) ────────────────

  function textToEmbedding(text) {
    var vec = new Float32Array(VEC_DIM);
    var words = String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s_./-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    for (var i = 0; i < words.length; i++) {
      var t = words[i];
      var h = 2166136261;
      for (var j = 0; j < t.length; j++) {
        h ^= t.charCodeAt(j);
        h = Math.imul(h, 16777619);
      }
      vec[Math.abs(h) % VEC_DIM] += 1;
      // bigrams for slight structure
      if (i + 1 < words.length) {
        var t2 = t + '_' + words[i + 1];
        var h2 = 2166136261;
        for (var k = 0; k < t2.length; k++) {
          h2 ^= t2.charCodeAt(k);
          h2 = Math.imul(h2, 16777619);
        }
        vec[Math.abs(h2) % VEC_DIM] += 0.5;
      }
    }
    var norm = 0;
    for (var n = 0; n < VEC_DIM; n++) norm += vec[n] * vec[n];
    norm = Math.sqrt(norm) || 1;
    var out = new Array(VEC_DIM);
    for (var m = 0; m < VEC_DIM; m++) out[m] = vec[m] / norm;
    return out;
  }

  function cosine(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  // ─── smart chunking ────────────────────────────────────────

  /**
   * Structure-aware chunker:
   * - Prefer markdown headings / code fences as boundaries
   * - Target ~chunkSize chars with overlap
   * - Keep fence blocks intact when possible
   */
  function chunkText(text, opts) {
    opts = opts || {};
    var chunkSize = opts.chunkSize || 1200;
    var overlap = opts.overlap != null ? opts.overlap : 150;
    var source = opts.source || opts.path || '';
    var collection = opts.collection || 'default';
    text = String(text || '').replace(/\r\n/g, '\n');
    if (!text.trim()) return [];

    // Split into structural blocks
    var blocks = [];
    var fenceRe = /(^|\n)(```[\s\S]*?\n```)/g;
    var last = 0;
    var m;
    var plain = text;
    // Extract fences as atomic blocks by walking lines
    var lines = text.split('\n');
    var buf = [];
    var inFence = false;
    function flushBuf() {
      if (!buf.length) return;
      var b = buf.join('\n');
      if (b.trim()) blocks.push(b);
      buf = [];
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/^```/.test(line)) {
        if (!inFence) {
          flushBuf();
          inFence = true;
          buf = [line];
        } else {
          buf.push(line);
          flushBuf();
          inFence = false;
        }
        continue;
      }
      if (!inFence && /^(#{1,6}\s|#{1,6}\t)/.test(line) && buf.length) {
        flushBuf();
      }
      buf.push(line);
    }
    flushBuf();

    var chunks = [];
    var acc = '';
    var chunkIndex = 0;

    function pushChunk(body) {
      body = String(body || '').trim();
      if (!body) return;
      var id =
        'c_' +
        hashStr(collection + '|' + source + '|' + chunkIndex + '|' + body.slice(0, 80));
      chunks.push({
        id: id,
        text: body,
        source: source,
        collection: collection,
        index: chunkIndex++,
        chars: body.length,
        meta: opts.meta || {},
      });
    }

    for (var b = 0; b < blocks.length; b++) {
      var block = blocks[b];
      // Large fence / block — slice with overlap
      if (block.length > chunkSize * 1.4) {
        if (acc.trim()) {
          pushChunk(acc);
          acc = '';
        }
        for (var pos = 0; pos < block.length; pos += chunkSize - overlap) {
          pushChunk(block.slice(pos, pos + chunkSize));
        }
        continue;
      }
      if (acc.length + block.length + 1 > chunkSize && acc.trim()) {
        pushChunk(acc);
        // overlap tail
        acc = acc.slice(Math.max(0, acc.length - overlap)) + '\n' + block;
      } else {
        acc = acc ? acc + '\n' + block : block;
      }
    }
    if (acc.trim()) pushChunk(acc);

    // Prefix path header for retrieval context (stored separately in displayText)
    chunks.forEach(function (c) {
      var header = '';
      if (source) header += '[File: ' + source + ']';
      if (collection && collection !== 'default') header += ' [Collection: ' + collection + ']';
      if (c.index != null) header += ' [Chunk: ' + c.index + ']';
      c.displayText = (header ? header + '\n' : '') + c.text;
      c.embedding = textToEmbedding(c.displayText);
    });

    return chunks;
  }

  function hashStr(s) {
    var h = 2166136261;
    s = String(s);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  // ─── IndexedDB ─────────────────────────────────────────────

  function openDB() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      var req = indexedDB.open(IDB_NAME, IDB_VER);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var os = db.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('collection', 'collection', { unique: false });
          os.createIndex('source', 'source', { unique: false });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error || new Error('IDB open failed'));
      };
    });
  }

  function idbPutAll(records) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        var os = tx.objectStore(STORE);
        for (var i = 0; i < records.length; i++) os.put(records[i]);
        tx.oncomplete = function () {
          resolve(true);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  function idbGetAll() {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).getAll();
        req.onsuccess = function () {
          resolve(req.result || []);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  function idbClear(collection) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        var os = tx.objectStore(STORE);
        if (!collection) {
          os.clear();
          tx.oncomplete = function () {
            resolve(true);
          };
          tx.onerror = function () {
            reject(tx.error);
          };
          return;
        }
        var idx = os.index('collection');
        var req = idx.openCursor(IDBKeyRange.only(collection));
        req.onsuccess = function () {
          var cursor = req.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
        tx.oncomplete = function () {
          resolve(true);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  // ─── index rebuild ─────────────────────────────────────────

  function rebuildBM25() {
    _bm25 = new BM25Index();
    for (var i = 0; i < _mem.length; i++) {
      var c = _mem[i];
      _bm25.add(c.id, c.displayText || c.text);
    }
  }

  function loadSettings() {
    try {
      var s = JSON.parse(localStorage.getItem('aether_rag_v2_settings') || '{}');
      Object.assign(_settings, s);
    } catch (e) {}
  }

  function saveSettings() {
    try {
      localStorage.setItem('aether_rag_v2_settings', JSON.stringify(_settings));
    } catch (e) {}
  }

  function ensureReady() {
    if (_ready) return _ready;
    loadSettings();
    _ready = idbGetAll()
      .then(function (rows) {
        _mem = rows || [];
        // Cap
        if (_mem.length > MAX_CHUNKS) {
          _mem = _mem.slice(_mem.length - MAX_CHUNKS);
        }
        rebuildBM25();
        // One-time migrate legacy BM25 localStorage docs
        try {
          var legacy = localStorage.getItem('aether_rag_docs');
          var migrated = localStorage.getItem('aether_rag_v2_migrated');
          if (legacy && !migrated && (!_mem || !_mem.length)) {
            var docs = JSON.parse(legacy);
            if (Array.isArray(docs) && docs.length) {
              return reindexFromLegacy(docs).then(function () {
                localStorage.setItem('aether_rag_v2_migrated', '1');
                return true;
              });
            }
          }
        } catch (e) {}
        return true;
      })
      .catch(function (e) {
        console.warn('[RAG v2] IDB load failed, memory-only:', e && e.message);
        _mem = _mem || [];
        rebuildBM25();
        // fallback: load legacy into memory
        try {
          var legacy = localStorage.getItem('aether_rag_docs');
          if (legacy) {
            JSON.parse(legacy).forEach(function (d) {
              addTextSync(d, { collection: 'default', source: 'legacy' });
            });
          }
        } catch (e2) {}
        return true;
      });
    return _ready;
  }

  function addTextSync(text, meta) {
    meta = meta || {};
    var chunks = chunkText(text, meta);
    var byId = Object.create(null);
    _mem.forEach(function (c) {
      byId[c.id] = c;
    });
    chunks.forEach(function (c) {
      c.t = Date.now();
      byId[c.id] = c;
    });
    _mem = Object.keys(byId).map(function (k) {
      return byId[k];
    });
    if (_mem.length > MAX_CHUNKS) {
      _mem.sort(function (a, b) {
        return (a.t || 0) - (b.t || 0);
      });
      _mem = _mem.slice(_mem.length - MAX_CHUNKS);
    }
    rebuildBM25();
    _dirty = true;
    return chunks;
  }

  async function persist() {
    if (!_dirty) return;
    try {
      await idbPutAll(_mem);
      _dirty = false;
    } catch (e) {
      // Fallback localStorage sample (last 80 display texts for legacy compat)
      try {
        var docs = _mem.slice(-200).map(function (c) {
          return c.displayText || c.text;
        });
        localStorage.setItem('aether_rag_docs', JSON.stringify(docs));
      } catch (e2) {}
    }
  }

  async function addText(text, meta) {
    await ensureReady();
    var chunks = addTextSync(text, meta || {});
    await persist();
    return chunks;
  }

  async function addFile(path, content, meta) {
    meta = meta || {};
    meta.source = path || meta.source || '';
    meta.collection = meta.collection || 'project';
    return addText(content, meta);
  }

  /**
   * Index a linked project folder (File System Access API handle) into RAG.
   * @param {FileSystemDirectoryHandle} rootHandle
   * @param {object} opts { collection, maxFiles, maxBytes, onProgress }
   */
  async function indexFolder(rootHandle, opts) {
    opts = opts || {};
    if (!rootHandle) throw new Error('No folder handle');
    await ensureReady();
    var collection = opts.collection || 'project';
    var maxFiles = opts.maxFiles || 200;
    var maxBytes = opts.maxBytes || 400000; // ~400KB per file
    var onProgress = opts.onProgress || function () {};
    var skipRe = opts.skipRe || /(^|\/)(node_modules|\.git|dist|build|\.next|vendor|__pycache__|\.venv|venv)(\/|$)/i;
    var allowExt = opts.allowExt || /\.(js|ts|tsx|jsx|mjs|cjs|py|rs|go|java|kt|md|txt|json|yml|yaml|toml|css|html|htm|svg|sh|bash|sql|graphql|vue|svelte|rb|php|c|cpp|h|hpp|cs|swift|r|ipynb)$/i;

    var files = [];
    async function walk(dirHandle, prefix) {
      if (files.length >= maxFiles) return;
      var it = dirHandle.entries();
      for await (var ent of it) {
        if (files.length >= maxFiles) break;
        var name = ent[0];
        var handle = ent[1];
        var rel = prefix ? prefix + '/' + name : name;
        if (skipRe.test(rel)) continue;
        if (handle.kind === 'directory') {
          await walk(handle, rel);
        } else if (handle.kind === 'file') {
          if (!allowExt.test(name) && !allowExt.test(rel)) continue;
          files.push({ path: rel, handle: handle });
        }
      }
    }
    await walk(rootHandle, '');

    var indexed = 0;
    var skipped = 0;
    var errors = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      try {
        var file = await f.handle.getFile();
        if (file.size > maxBytes) {
          skipped++;
          onProgress({ i: i + 1, total: files.length, path: f.path, status: 'skip-size' });
          continue;
        }
        var text = await file.text();
        if (!text || !String(text).trim()) {
          skipped++;
          continue;
        }
        await addFile(f.path, text, { collection: collection, source: f.path });
        indexed++;
        onProgress({ i: i + 1, total: files.length, path: f.path, status: 'ok' });
      } catch (e) {
        skipped++;
        errors.push({ path: f.path, error: e.message || String(e) });
        onProgress({ i: i + 1, total: files.length, path: f.path, status: 'err' });
      }
    }
    return {
      ok: true,
      indexed: indexed,
      skipped: skipped,
      scanned: files.length,
      collection: collection,
      errors: errors.slice(0, 20),
      stats: stats(),
    };
  }

  async function reindexFromLegacy(docs) {
    await ensureReady();
    var all = [];
    (docs || []).forEach(function (d) {
      all = all.concat(addTextSync(d, { collection: 'default', source: 'legacy' }));
    });
    await persist();
    return all.length;
  }

  // ─── hybrid search + RRF ───────────────────────────────────

  function vectorSearch(query, topK, collection) {
    var qv = textToEmbedding(query);
    var hits = [];
    for (var i = 0; i < _mem.length; i++) {
      var c = _mem[i];
      if (collection && c.collection !== collection && collection !== '*') continue;
      var emb = c.embedding;
      if (!emb || !emb.length) emb = textToEmbedding(c.displayText || c.text);
      var score = cosine(qv, emb);
      if (score > 0.01) {
        hits.push({
          id: c.id,
          text: c.displayText || c.text,
          score: score,
          ranker: 'vector',
          source: c.source,
          collection: c.collection,
          index: c.index,
        });
      }
    }
    hits.sort(function (a, b) {
      return b.score - a.score;
    });
    return hits.slice(0, topK);
  }

  function rrfFuse(lists, topK) {
    var scores = Object.create(null);
    var docs = Object.create(null);
    lists.forEach(function (list) {
      list.forEach(function (hit, rank) {
        var id = hit.id || hashStr(hit.text);
        scores[id] = (scores[id] || 0) + 1 / (RRF_K + rank + 1);
        if (!docs[id]) docs[id] = hit;
        else {
          // merge meta
          docs[id].bm25Score = docs[id].bm25Score || (hit.ranker === 'bm25' ? hit.score : docs[id].score);
          docs[id].vectorScore =
            docs[id].vectorScore || (hit.ranker === 'vector' ? hit.score : undefined);
        }
        if (hit.ranker === 'bm25') docs[id].bm25Score = hit.score;
        if (hit.ranker === 'vector') docs[id].vectorScore = hit.score;
      });
    });
    var fused = Object.keys(scores).map(function (id) {
      var h = docs[id];
      return {
        id: id,
        text: h.text,
        score: scores[id],
        bm25Score: h.bm25Score,
        vectorScore: h.vectorScore,
        source: h.source,
        collection: h.collection,
        index: h.index,
        ranker: 'hybrid',
      };
    });
    fused.sort(function (a, b) {
      return b.score - a.score;
    });
    return fused.slice(0, topK);
  }

  async function search(query, opts) {
    await ensureReady();
    opts = opts || {};
    var topK = opts.topK || _settings.topK || DEFAULT_TOP_K;
    var collection = opts.collection || null; // null = all
    var hybrid = opts.hybrid != null ? opts.hybrid : _settings.hybrid;

    if (!query || !String(query).trim()) {
      return { hits: [], citations: [], contextBlock: '' };
    }

    // BM25
    var bm25Hits = (_bm25 && _bm25.search(query, topK * 2)) || [];
    // Attach meta from mem
    var byId = Object.create(null);
    _mem.forEach(function (c) {
      byId[c.id] = c;
    });
    bm25Hits = bm25Hits
      .map(function (h) {
        var c = byId[h.id];
        if (collection && c && c.collection !== collection && collection !== '*') return null;
        return {
          id: h.id,
          text: h.text,
          score: h.score,
          ranker: 'bm25',
          source: c && c.source,
          collection: c && c.collection,
          index: c && c.index,
        };
      })
      .filter(Boolean);

    var hits;
    if (hybrid) {
      var vecHits = vectorSearch(query, topK * 2, collection || '*');
      hits = rrfFuse([bm25Hits, vecHits], topK);
    } else {
      hits = bm25Hits.slice(0, topK);
    }

    // Build citations
    var citations = hits.map(function (h, i) {
      return {
        n: i + 1,
        id: h.id,
        source: h.source || 'memory',
        collection: h.collection || 'default',
        chunk: h.index != null ? h.index : i,
        score: h.score,
        snippet: String(h.text || '')
          .replace(/^\[[^\]]+\](\s*\[[^\]]+\])*\s*/g, '')
          .slice(0, 160),
      };
    });

    var contextBlock = '';
    if (hits.length) {
      contextBlock =
        '# RAG v2 CONTEXT (cite as [n])\n' +
        hits
          .map(function (h, i) {
            var label = h.source ? h.source : 'doc';
            if (h.index != null) label += '#' + h.index;
            return (
              '[' +
              (i + 1) +
              '] (' +
              label +
              ', score=' +
              (h.score || 0).toFixed(4) +
              ')\n' +
              String(h.text || '').slice(0, 900)
            );
          })
          .join('\n\n') +
        '\n\nWhen you use a source, add an inline citation like [1] or [2].';
    }

    // last search for UI
    g.__AETHER_LAST_RAG = { query: query, citations: citations, hits: hits, t: Date.now() };

    return { hits: hits, citations: citations, contextBlock: contextBlock };
  }

  function renderCitationsHTML(citations) {
    if (!citations || !citations.length) return '';
    return (
      '<div class="rag-citations" aria-label="Sources">' +
      '<div class="rag-citations-hdr">Sources</div>' +
      citations
        .map(function (c) {
          return (
            '<div class="rag-cite" data-n="' +
            c.n +
            '">' +
            '<span class="rag-cite-n">[' +
            c.n +
            ']</span> ' +
            '<span class="rag-cite-src">' +
            esc(c.source) +
            (c.chunk != null ? '#' + c.chunk : '') +
            '</span> ' +
            '<span class="rag-cite-snip">' +
            esc(c.snippet) +
            '</span>' +
            '</div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  async function clear(collection) {
    await ensureReady();
    if (!collection) {
      _mem = [];
      rebuildBM25();
      try {
        await idbClear();
      } catch (e) {}
      try {
        localStorage.removeItem('aether_rag_docs');
      } catch (e2) {}
    } else {
      _mem = _mem.filter(function (c) {
        return c.collection !== collection;
      });
      rebuildBM25();
      try {
        await idbClear(collection);
      } catch (e3) {}
      await persist();
    }
    return true;
  }

  function listCollections() {
    var map = Object.create(null);
    _mem.forEach(function (c) {
      var k = c.collection || 'default';
      map[k] = (map[k] || 0) + 1;
    });
    return Object.keys(map).map(function (k) {
      return { id: k, chunks: map[k] };
    });
  }

  function stats() {
    return {
      chunks: _mem.length,
      collections: listCollections(),
      settings: Object.assign({}, _settings),
      hybrid: !!_settings.hybrid,
    };
  }

  function setSettings(partial) {
    Object.assign(_settings, partial || {});
    saveSettings();
    return _settings;
  }

  // Bridge: drop-in helpers mimicking legacy RAG + vector APIs
  var legacyFacade = {
    addDocument: function (text) {
      addTextSync(text, { collection: 'default', source: 'chat' });
      persist();
    },
    search: function (query, topK) {
      // sync fallback — only BM25 (async search preferred)
      if (!_bm25) rebuildBM25();
      var hits = (_bm25 && _bm25.search(query, topK || 3)) || [];
      return hits.map(function (h) {
        return { text: h.text, score: h.score };
      });
    },
    save: function () {
      persist();
      // also write legacy mirror
      try {
        var docs = _mem.slice(-300).map(function (c) {
          return c.displayText || c.text;
        });
        localStorage.setItem('aether_rag_docs', JSON.stringify(docs));
      } catch (e) {}
    },
    load: function () {},
    get docs() {
      return _mem.map(function (c) {
        return c.displayText || c.text;
      });
    },
    get totalDocs() {
      return _mem.length;
    },
  };

  g.AETHER_RAGv2 = {
    ready: ensureReady,
    addText: addText,
    addFile: addFile,
    indexFolder: indexFolder,
    chunk: chunkText,
    search: search,
    clear: clear,
    listCollections: listCollections,
    stats: stats,
    setSettings: setSettings,
    getSettings: function () {
      return Object.assign({}, _settings);
    },
    renderCitationsHTML: renderCitationsHTML,
    reindexFromLegacy: reindexFromLegacy,
    textToEmbedding: textToEmbedding,
    legacyFacade: legacyFacade,
    // expose for tests
    _mem: function () {
      return _mem;
    },
  };

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      ensureReady().catch(function () {});
    });
  } else {
    ensureReady().catch(function () {});
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
