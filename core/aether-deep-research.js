/**
 * AETHER Deep Research v3 — multi-angle, grounded, citable
 * Copyright (C) 2026 The Architect · GPL-3.0-or-later
 *
 * Pure research engine (no DOM). Host supplies search/model/RAG/scrape.
 *
 * Pipeline phases:
 *   plan → search(+rag) → scrape? → discourse? → analyze → gapfill? → report → iterate?
 *
 * Load after skill-utils / rag-v2 (optional).
 */
(function (g) {
  'use strict';

  var VERSION = '3.0';

  var DEFAULTS = {
    depth: 'standard',
    width: 'broad',
    criticality: 'important',
    format: 'report',
    language: 'auto',
    sourceType: 'web+deep',
    maxSources: 6,
    maxPages: 6,
    selfCritique: true,
    clarify: true,
    useRag: true,
    useX: true,
    gapFill: true,
    includeCitations: true,
    includeTimeline: true,
  };

  var FORMAT_INSTR = {
    report:
      'Format as a comprehensive research report with: Executive Summary, Key Findings, Detailed Analysis, Counterpoints/Limitations, Sources, Conclusion.',
    memo:
      'Format as a concise executive memo: Purpose, Summary (≤8 bullets), Implications, Recommendations, Open Questions.',
    bullets:
      'Format as a dense bullet-point brief: major claims, evidence tags, takeaways. Prefer fragments over prose.',
    debate:
      'Format as a structured debate: Thesis, Pro arguments with evidence, Con arguments with evidence, Synthesis, Confidence.',
    tutorial:
      'Format as a learning guide: What & Why, Core concepts, Worked examples, Pitfalls, Further reading.',
    brief:
      'Format as a 1-page intelligence brief: Bottom line up front (BLUF), 5 facts, 3 risks, 2 unknowns, sources.',
  };

  var LANG_NAMES = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    zh: 'Chinese',
    ja: 'Japanese',
    pt: 'Portuguese',
    auto: null,
  };

  // ── Config ─────────────────────────────────────────────────

  function mergeSettings(raw) {
    var s = Object.assign({}, DEFAULTS, raw || {});
    // Derive maxPages from depth if not set intentionally
    var depthPages = { surface: 3, standard: 6, deep: 9, exhaustive: 12 };
    if (!raw || raw.maxPages == null) {
      s.maxPages = depthPages[s.depth] || 6;
    }
    s.maxSources = Math.max(2, Math.min(16, parseInt(s.maxSources, 10) || 6));
    s.maxPages = Math.max(2, Math.min(16, parseInt(s.maxPages, 10) || 6));
    return s;
  }

  function yearTokens() {
    var y = new Date().getFullYear();
    return { y: y, y1: y - 1, y2: y - 2, label: String(y) };
  }

  // ── Query planning ─────────────────────────────────────────

  /**
   * Build multi-angle search queries without a model (fast, deterministic).
   */
  function buildAngleQueries(topic, settings) {
    settings = mergeSettings(settings);
    var t = String(topic || '').trim();
    var yrs = yearTokens();
    var q = [t];
    var depth = settings.depth;
    var width = settings.width;

    // Core angles
    q.push(t + ' overview explained');
    q.push(t + ' ' + yrs.y + ' OR ' + yrs.y1);

    if (depth === 'standard' || depth === 'deep' || depth === 'exhaustive') {
      q.push(t + ' evidence data statistics');
      q.push(t + ' limitations risks criticism');
    }
    if (depth === 'deep' || depth === 'exhaustive') {
      q.push(t + ' case study examples');
      q.push(t + ' comparison alternatives');
      q.push(t + ' expert analysis research paper');
    }
    if (depth === 'exhaustive') {
      q.push(t + ' history timeline evolution');
      q.push(t + ' future outlook forecast ' + yrs.y);
      q.push(t + ' regulatory policy implications');
      q.push(t + ' counterargument debate');
    }

    if (width === 'broad' || width === 'comprehensive') {
      q.push(t + ' related industries impact');
    }
    if (width === 'comprehensive') {
      q.push(t + ' interdisciplinary cross-domain');
    }
    if (width === 'focused') {
      // Keep only first few + recency
      q = [t, t + ' ' + yrs.y, t + ' facts evidence'];
    }

    // Dedupe preserve order
    var seen = {};
    var out = [];
    for (var i = 0; i < q.length; i++) {
      var k = q[i].toLowerCase();
      if (seen[k]) continue;
      seen[k] = 1;
      out.push(q[i]);
    }
    return out.slice(0, settings.maxPages);
  }

  /**
   * Parse model plan JSON array; fall back to structured default plan.
   */
  function parsePlanJson(text) {
    if (!text) return null;
    var raw = String(text);
    // skill-utils soft parse if available
    if (g.AETHER_SkillUtils && g.AETHER_SkillUtils.softParseSpec) {
      // softParseSpec wants objects; try array extract first
    }
    var m = raw.match(/\[[\s\S]*\]/);
    if (!m) return null;
    try {
      var arr = JSON.parse(m[0]);
      if (!Array.isArray(arr) || !arr.length) return null;
      return arr
        .filter(function (s) {
          return s && (s.type || s.label);
        })
        .map(function (s) {
          return {
            type: String(s.type || 'search').toLowerCase(),
            label: s.label || s.type || 'Step',
            detail: s.detail || s.description || '',
            queries: Array.isArray(s.queries) ? s.queries : null,
          };
        });
    } catch (e) {
      return null;
    }
  }

  /**
   * Default plan skeleton based on settings + available capabilities.
   */
  function buildDefaultPlan(topic, settings, caps) {
    settings = mergeSettings(settings);
    caps = caps || {};
    var steps = [];
    var angles = buildAngleQueries(topic, settings);

    if (settings.useRag && caps.hasRag) {
      steps.push({
        type: 'rag',
        label: 'Query Knowledge Base',
        detail: 'Retrieve relevant chunks from AETHER RAG v2',
      });
    }

    steps.push({
      type: 'search',
      label: 'Multi-angle Web Search',
      detail: angles.length + ' angle queries · ' + (settings.depth || 'standard') + ' depth',
      queries: angles,
    });

    if (settings.useX && caps.hasX) {
      steps.push({
        type: 'discourse',
        label: 'Current Discourse',
        detail: 'Recent public conversation / X signals',
      });
    }

    if (settings.sourceType === 'web+deep' && (caps.hasScrape || caps.hasFirecrawl)) {
      steps.push({
        type: 'scrape',
        label: 'Deep-Read Key Sources',
        detail: 'Extract full content from top URLs (up to ' + Math.min(4, settings.maxSources) + ')',
      });
    }

    steps.push({
      type: 'analyze',
      label: 'Cross-Source Analysis',
      detail: 'Facts, contradictions, confidence, knowledge gaps',
    });

    if (settings.gapFill !== false && (settings.depth === 'deep' || settings.depth === 'exhaustive' || settings.criticality === 'critical')) {
      steps.push({
        type: 'gapfill',
        label: 'Gap-Fill Search',
        detail: 'Targeted follow-up queries for open questions',
      });
    }

    steps.push({
      type: 'report',
      label: 'Compose ' + ((settings.format || 'report').charAt(0).toUpperCase() + (settings.format || 'report').slice(1)),
      detail: FORMAT_INSTR[settings.format] ? 'Format: ' + settings.format : 'Structured output',
    });

    if (settings.selfCritique !== false) {
      steps.push({
        type: 'iterate',
        label: 'Self-Critique & Refine',
        detail: 'Peer-review draft for weak claims and gaps',
      });
    }

    return steps;
  }

  function planPrompt(topic, settings, caps) {
    settings = mergeSettings(settings);
    var types = ['search', 'analyze', 'report'];
    if (settings.useRag && caps && caps.hasRag) types.unshift('rag');
    if (settings.sourceType === 'web+deep') types.splice(1, 0, 'scrape');
    if (settings.useX && caps && caps.hasX) types.splice(1, 0, 'discourse');
    if (settings.gapFill !== false) types.splice(types.indexOf('report'), 0, 'gapfill');
    if (settings.selfCritique !== false) types.push('iterate');

    return (
      'You are AETHER Deep Research planner v3.\n' +
      'Topic: "' +
      topic +
      '"\n' +
      'Depth: ' +
      settings.depth +
      ' | Width: ' +
      settings.width +
      ' | Criticality: ' +
      settings.criticality +
      ' | Format: ' +
      settings.format +
      '\n' +
      'Allowed step types: ' +
      types.join(', ') +
      '\n' +
      'Return ONLY a JSON array of 4–8 steps. Each: {"type":"...","label":"...","detail":"...","queries":["optional search queries"]}.\n' +
      'For type=search include 3–6 diverse "queries" covering angles (facts, criticism, recent, examples).\n' +
      'No markdown fences. No commentary.'
    );
  }

  // ── Source ledger ──────────────────────────────────────────

  function createLedger() {
    return { sources: [], notes: [], ragHits: [], gaps: [], queries: [] };
  }

  function addSource(ledger, src) {
    if (!ledger || !src) return;
    var url = src.url || '';
    // dedupe by url or title
    for (var i = 0; i < ledger.sources.length; i++) {
      if (url && ledger.sources[i].url === url) {
        if (src.snippet && (!ledger.sources[i].snippet || src.snippet.length > ledger.sources[i].snippet.length)) {
          ledger.sources[i].snippet = src.snippet;
        }
        return;
      }
    }
    ledger.sources.push({
      id: ledger.sources.length + 1,
      url: url,
      title: src.title || '',
      snippet: (src.snippet || '').slice(0, 500),
      query: src.query || '',
      tier: src.tier || scoreSourceTier(url, src.snippet || ''),
      kind: src.kind || 'web',
    });
  }

  function scoreSourceTier(url, text) {
    var u = String(url || '').toLowerCase();
    var t = String(text || '').toLowerCase();
    if (/arxiv\.org|nature\.com|science\.org|nih\.gov|who\.int|edu\/|ac\.uk|pubmed|doi\.org/.test(u)) return 'primary';
    if (/reuters|bloomberg|ft\.com|wsj|economist|bbc\.|nytimes|apnews|gov\//.test(u)) return 'institutional';
    if (/wikipedia|medium\.com|substack|blog/.test(u)) return 'secondary';
    if (/twitter\.com|x\.com|reddit\.com/.test(u)) return 'discourse';
    if (t.length > 400) return 'secondary';
    return 'web';
  }

  function extractUrls(text) {
    if (!text) return [];
    var m = String(text).match(/https?:\/\/[^\s)\]}"'<>]+/g) || [];
    var out = [];
    var seen = {};
    for (var i = 0; i < m.length; i++) {
      var u = m[i].replace(/[.,;:!?]+$/, '');
      if (u.length > 200 || seen[u]) continue;
      // skip junk
      if (/example\.com|localhost|0\.0\.0\.0/.test(u)) continue;
      seen[u] = 1;
      out.push(u);
    }
    return out;
  }

  function ingestSearchResult(ledger, query, resultText) {
    if (!ledger) return;
    ledger.queries.push(query);
    var text = String(resultText || '');
    var urls = extractUrls(text);
    // Try to split by common search result separators
    var chunks = text.split(/\n(?=\S)/);
    if (chunks.length < 2) chunks = [text];
    for (var i = 0; i < Math.min(chunks.length, 8); i++) {
      var c = chunks[i].trim();
      if (c.length < 40) continue;
      var cu = extractUrls(c);
      addSource(ledger, {
        url: cu[0] || urls[i] || '',
        snippet: c.slice(0, 400),
        query: query,
        kind: 'web',
      });
    }
    // leftover urls
    for (var j = 0; j < urls.length; j++) {
      addSource(ledger, { url: urls[j], query: query, kind: 'web', snippet: '' });
    }
  }

  function citationsMarkdown(ledger, limit) {
    if (!ledger || !ledger.sources.length) return '';
    limit = limit || 20;
    var lines = ['## Sources & Citations', ''];
    var sorted = ledger.sources.slice().sort(function (a, b) {
      var rank = { primary: 0, institutional: 1, secondary: 2, web: 3, discourse: 4, rag: 1 };
      return (rank[a.tier] || 5) - (rank[b.tier] || 5);
    });
    for (var i = 0; i < Math.min(sorted.length, limit); i++) {
      var s = sorted[i];
      var label = s.title || s.url || s.snippet.slice(0, 60) || 'Source ' + s.id;
      var link = s.url ? ' — ' + s.url : '';
      lines.push(
        '- **[' +
          s.id +
          ']** (' +
          (s.tier || 'web') +
          (s.kind && s.kind !== 'web' ? '/' + s.kind : '') +
          ') ' +
          label +
          link
      );
      if (s.snippet && s.snippet.length > 20 && !s.url) {
        lines.push('  > ' + s.snippet.slice(0, 140).replace(/\n/g, ' '));
      }
    }
    if (ledger.gaps && ledger.gaps.length) {
      lines.push('', '## Open Questions / Gaps', '');
      ledger.gaps.forEach(function (g0) {
        lines.push('- ' + g0);
      });
    }
    return lines.join('\n');
  }

  // ── Prompts ────────────────────────────────────────────────

  function systemContext(settings) {
    settings = mergeSettings(settings);
    var lang = LANG_NAMES[settings.language];
    var langInstr = lang ? '\nWrite the entire response in ' + lang + '.' : '';
    var formatInstr = FORMAT_INSTR[settings.format] || FORMAT_INSTR.report;
    return (
      langInstr +
      '\n' +
      formatInstr +
      '\nDepth: ' +
      settings.depth +
      ' | Width: ' +
      settings.width +
      ' | Criticality: ' +
      settings.criticality +
      '\n' +
      'Cite sources inline as [n] when a source list is provided. Flag uncertainty: (unverified), (disputed), (estimate).' +
      (settings.criticality === 'critical'
        ? '\nEnd with "## ⬡ Confidence Assessment" (score 1–10) and key caveats.'
        : '')
    );
  }

  function analyzePrompt(topic, contextBlock, settings) {
    return (
      systemContext(settings) +
      '\n\nYou are analysing multi-source research on: "' +
      topic +
      '"\n\n' +
      contextBlock +
      '\n\nProduce a structured analysis:\n' +
      '1. Key facts (with confidence high/med/low)\n' +
      '2. Agreements across sources\n' +
      '3. Contradictions / disputes\n' +
      '4. Knowledge gaps (list as bullet questions)\n' +
      '5. Source quality notes\n' +
      '6. Bottom-line synthesis (5 bullets)\n' +
      'End with a line: GAPS: question1 | question2 | question3'
    );
  }

  function reportPrompt(topic, analysis, extras, settings, citationsBlock) {
    return (
      systemContext(settings) +
      '\n\nWrite the final deliverable on: "' +
      topic +
      '"\n\n## Analysis\n' +
      (analysis || '').slice(0, 5000) +
      (extras ? '\n\n## Additional material\n' + String(extras).slice(0, 3500) : '') +
      (citationsBlock
        ? '\n\n## Available sources (cite as [n])\n' + citationsBlock.slice(0, 2500)
        : '') +
      '\n\nSynthesise into one coherent piece. Prefer evidence over rhetoric. Use markdown.'
    );
  }

  function critiquePrompt(topic, draft) {
    return (
      'You are a critical research peer-reviewer for AETHER Deep Research v3.\n' +
      'Topic: "' +
      topic +
      '"\n\n## Draft\n' +
      String(draft || '').slice(0, 5000) +
      '\n\nList concrete issues:\n' +
      '1) Missing evidence 2) Overclaimed statements 3) Structure 4) Possible factual errors 5) Better questions.\n' +
      'Be specific and actionable. Bullet list only.'
    );
  }

  function refinePrompt(topic, draft, critique, settings) {
    return (
      systemContext(settings) +
      '\n\nRevise the draft for "' +
      topic +
      '" using the peer review. Address every critique point.\n\n## Draft\n' +
      String(draft || '').slice(0, 4000) +
      '\n\n## Peer Review\n' +
      String(critique || '').slice(0, 2000) +
      '\n\nProduce the improved final version.'
    );
  }

  function gapQueriesFromAnalysis(analysisText, topic, maxN) {
    maxN = maxN || 3;
    var text = String(analysisText || '');
    var gaps = [];
    var m = text.match(/GAPS:\s*([^\n]+)/i);
    if (m) {
      gaps = m[1]
        .split('|')
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
    }
    if (gaps.length < maxN) {
      var bullets = text.match(/(?:^|\n)\s*[-*]\s+(.+(?:\?|gap|unknown|unclear|missing).+)/gi) || [];
      bullets.forEach(function (b) {
        var clean = b.replace(/^[\s\-*]+/, '').trim();
        if (clean && gaps.indexOf(clean) === -1) gaps.push(clean);
      });
    }
    if (!gaps.length) {
      gaps = [
        topic + ' unresolved questions',
        topic + ' missing data limitations',
        topic + ' contradictory evidence',
      ];
    }
    return gaps.slice(0, maxN).map(function (g0) {
      // If already a full query-ish string, use it; else prefix topic
      if (g0.length > 80 || g0.toLowerCase().indexOf(String(topic).toLowerCase().slice(0, 12)) >= 0) return g0;
      return topic + ' ' + g0;
    });
  }

  function parseGapsLine(analysisText) {
    var text = String(analysisText || '');
    var m = text.match(/GAPS:\s*([^\n]+)/i);
    if (!m) return [];
    return m[1]
      .split('|')
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  // ── RAG helper (optional host) ─────────────────────────────

  async function retrieveRag(topic, topK) {
    topK = topK || 6;
    var hits = [];
    try {
      if (g.AETHER_RAGv2 && typeof g.AETHER_RAGv2.search === 'function') {
        var r = await g.AETHER_RAGv2.search(topic, { topK: topK, hybrid: true });
        if (r && r.hits) hits = r.hits;
        else if (Array.isArray(r)) hits = r;
      } else if (g.RAG && typeof g.RAG.search === 'function') {
        hits = g.RAG.search(topic, topK) || [];
      }
    } catch (e) {}
    return hits;
  }

  function formatRagHits(hits) {
    if (!hits || !hits.length) return '';
    return hits
      .map(function (h, i) {
        var src = h.source || h.path || h.id || 'doc';
        var snip = h.text || h.snippet || h.content || '';
        return '### RAG [' + (i + 1) + '] `' + src + '`\n' + String(snip).slice(0, 800);
      })
      .join('\n\n');
  }

  function ingestRagHits(ledger, hits) {
    if (!ledger || !hits) return;
    hits.forEach(function (h) {
      ledger.ragHits.push(h);
      addSource(ledger, {
        url: '',
        title: h.source || h.path || 'RAG chunk',
        snippet: h.text || h.snippet || h.content || '',
        tier: 'primary',
        kind: 'rag',
      });
    });
  }

  // ── Capability probe ───────────────────────────────────────

  function detectCapabilities(hooks) {
    hooks = hooks || g.hooksConfig || {};
    var hasSearch = !!(hooks.tavily || hooks.brave || hooks.serper || hooks.tavilyKey || hooks.braveKey || hooks.serperKey);
    var hasFirecrawl = !!(hooks.firecrawlKey || hooks.firecrawl);
    var hasX = !!(hooks.xBearer || hooks.twitterBearer || hooks.xKey || g.TOOL_REGISTRY && g.TOOL_REGISTRY.x_search);
    var hasRag = false;
    try {
      if (g.AETHER_RAGv2) hasRag = true;
      else if (g.RAG && (g.RAG.totalDocs > 0 || typeof g.RAG.search === 'function')) hasRag = true;
    } catch (e) {}
    return {
      hasSearch: hasSearch,
      hasFirecrawl: hasFirecrawl,
      hasScrape: hasFirecrawl || !!(g.TOOL_REGISTRY && (g.TOOL_REGISTRY.scrape || g.TOOL_REGISTRY.firecrawl_scrape)),
      hasX: hasX,
      hasRag: hasRag,
    };
  }

  // ── Time estimate ──────────────────────────────────────────

  function estimateMinutes(settings, stepCount) {
    settings = mergeSettings(settings);
    var base = { surface: 1, standard: 2, deep: 4, exhaustive: 7 };
    var m = base[settings.depth] || 2;
    if (settings.selfCritique) m += 1;
    if (settings.gapFill && (settings.depth === 'deep' || settings.depth === 'exhaustive')) m += 1;
    if (stepCount) m = Math.max(m, Math.ceil(stepCount * 0.6));
    return m;
  }

  // ── Public API ─────────────────────────────────────────────

  g.AETHER_DeepResearch = {
    version: VERSION,
    DEFAULTS: DEFAULTS,
    FORMAT_INSTR: FORMAT_INSTR,
    mergeSettings: mergeSettings,
    yearTokens: yearTokens,
    buildAngleQueries: buildAngleQueries,
    parsePlanJson: parsePlanJson,
    buildDefaultPlan: buildDefaultPlan,
    planPrompt: planPrompt,
    createLedger: createLedger,
    addSource: addSource,
    extractUrls: extractUrls,
    ingestSearchResult: ingestSearchResult,
    citationsMarkdown: citationsMarkdown,
    scoreSourceTier: scoreSourceTier,
    systemContext: systemContext,
    analyzePrompt: analyzePrompt,
    reportPrompt: reportPrompt,
    critiquePrompt: critiquePrompt,
    refinePrompt: refinePrompt,
    gapQueriesFromAnalysis: gapQueriesFromAnalysis,
    parseGapsLine: parseGapsLine,
    retrieveRag: retrieveRag,
    formatRagHits: formatRagHits,
    ingestRagHits: ingestRagHits,
    detectCapabilities: detectCapabilities,
    estimateMinutes: estimateMinutes,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
