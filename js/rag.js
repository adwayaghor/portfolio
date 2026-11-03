/* Exhibit C: Multi-RAG router.
 * Five retrieval strategies behind one interface; a router picks one per query.
 * In the browser, a keyword/feature classifier stands in for the router, and each
 * retriever's pipeline is animated on a canvas. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  if (!$('#rag')) return;

  const TECH = {
    naive: { name: 'Naive RAG', color: '#e9e6df', sub: 'Vector top-k',
      steps: ['Embed the query', 'Cosine search over the chunk index', 'Take the top-k chunks', 'Stuff them into the prompt', 'Generate the answer'] },
    tree: { name: 'Tree RAG', color: '#7fd18b', sub: 'Page index traversal',
      steps: ['Load the document page index (a table-of-contents tree)', 'Read node summaries at each level', 'Descend into the most relevant branch', 'Fetch the leaf pages', 'Generate with page citations'] },
    graph: { name: 'GraphRAG', color: '#b49cff', sub: 'Microsoft, community summaries',
      steps: ['Entities and relations extracted at index time', 'Communities detected and summarised per level', 'Map: score each community summary against the query', 'Reduce: merge the partial answers', 'Generate a corpus-wide answer'] },
    sql: { name: 'SQL + RAG', color: '#6cb6ff', sub: 'Text-to-SQL with retrieved schema',
      steps: ['Retrieve relevant tables and column docs', 'Generate SQL from the schema context', 'Validate and run the query', 'Retrieve text context for the returned rows', 'Generate a grounded answer'] },
    temporal: { name: 'Temporal KG RAG', color: '#ff8a70', sub: 'Time-scoped knowledge graph',
      steps: ['Extract entities and time expressions', 'Resolve the query time window', 'Select edges valid in that window', 'Expand the neighbourhood and rank facts', 'Generate an answer with dates'] },
  };
  const KEYS = Object.keys(TECH);

  /* ----------------------------- router stand-in ----------------------------- */
  const RULES = [
    // [technique, weight, regex, label]
    ['sql', 1.6, /\b(how many|count|total|sum|average|avg|mean|median|highest|lowest|top\s*\d+|top (five|ten|three)|five|ten|most|least|rank(ed|ing)?|per (month|year|quarter|team)|spend|revenue|amount|number of|percentage|share)\b/g, 'aggregate / ranking'],
    ['sql', 0.6, /\b(q[1-4]|quarter|fy\d*|table|rows?|vendors?|orders?|invoices?|sales)\b/g, 'tabular entities'],
    ['temporal', 1.5, /\b(before|after|since|until|prior to|as of|at the time|former|previous(ly)?|used to|changed?|evolv\w*|history|timeline|over time|between \d{4} and \d{4})\b/g, 'time-scoped'],
    ['temporal', 0.9, /\b(19|20)\d{2}\b/g, 'explicit year'],
    ['temporal', 0.5, /\b(who (was|led|ran|headed)|when did)\b/g, 'state at a time'],
    ['graph', 1.5, /\b(themes?|overall|across (all|the)|main (topics|issues|ideas)|patterns?|trends?|big picture|common|recurring|relationships? between|how .* (relate|connect))\b/g, 'corpus-wide'],
    ['graph', 0.5, /\b(all|every|entire|whole)\b/g, 'global scope'],
    ['tree', 1.5, /\b(section|chapter|clause|appendix|page \d+|table of contents|annex|paragraph|subsection)\b/g, 'structural reference'],
    ['tree', 0.9, /\b(annual report|10-k|10k|manual|handbook|contract|filing|whitepaper|paper|policy document|prospectus)\b/g, 'long document'],
    ['naive', 1.0, /\b(what is|what's|define|definition|meaning of|where (is|can)|how do i|does .* (support|allow))\b/g, 'direct lookup'],
  ];
  function route(q) {
    const s = q.toLowerCase(), raw = { naive: 0.8, tree: 0, graph: 0, sql: 0, temporal: 0 }, feats = new Set();
    RULES.forEach(([t, w, re, label]) => { const m = s.match(re); if (m) { raw[t] += w * Math.min(2, m.length); feats.add(label); } });
    if (s.split(/\s+/).length <= 7 && !feats.size) feats.add('short factual');
    const ex = KEYS.map(k => Math.exp(raw[k] / 0.95)), Z = ex.reduce((a, b) => a + b, 0);
    const p = {}; KEYS.forEach((k, i) => p[k] = ex[i] / Z);
    const best = KEYS.reduce((a, b) => p[b] > p[a] ? b : a);
    return { p, best, feats: [...feats] };
  }
  window.__route = route;

  /* ----------------------------- UI: samples, scores, steps ----------------------------- */
  const SAMPLES = [
    'Which five vendors had the highest total spend in Q3?',
    'Who led the payments team before the 2024 reorg?',
    'What are the main themes across all customer complaints?',
    'In the annual report, what does section 7 say about liquidity risk?',
    'What is the refund window for annual plans?',
    'How did the leave policy change between 2023 and 2025?',
  ];
  const samplesEl = $('#rag-samples');
  samplesEl.innerHTML = SAMPLES.map((q, i) => `<div class="l rs" data-i="${i}" tabindex="0">${q}</div>`).join('');
  $('#rag-scores').innerHTML = KEYS.map(k =>
    `<div class="l sc" data-k="${k}"><span>${TECH[k].name}</span><span class="bar"><i style="background:${TECH[k].color};width:0"></i></span><span>0.00</span></div>`).join('');

  let cur = null, stepIdx = -1, stepTimer = null, t0 = 0, auto = true, autoTimer = null, sampleIdx = 0;
  const input = $('#rag-q');

  function go(q, fromUser) {
    q = (q || '').trim(); if (!q) return;
    if (fromUser) { auto = false; clearTimeout(autoTimer); }
    input.value = q;
    const r = route(q);
    document.querySelectorAll('.rs').forEach(e => e.classList.toggle('on', e.textContent === q));
    KEYS.forEach(k => {
      const row = document.querySelector(`.sc[data-k="${k}"]`);
      row.classList.toggle('win', k === r.best);
      row.querySelector('i').style.width = (r.p[k] * 100).toFixed(1) + '%';
      row.lastElementChild.textContent = r.p[k].toFixed(2);
    });
    const T = TECH[r.best];
    $('#rag-feat').textContent = r.feats.length ? 'Signals: ' + r.feats.join(', ') : '';
    $('#rag-decision').innerHTML = `Routed to <b style="color:${T.color}">${T.name}</b> &nbsp;<span class="dim">p = ${r.p[r.best].toFixed(2)}</span>`;
    $('#rag-vtitle').innerHTML = `<span style="color:${T.color}">■</span> ${T.name}`;
    $('#rag-vsub').textContent = T.sub;
    const live = window.__live = window.__live || {};
    live.rag = 'last: ' + T.name; live.ragLong = `"${q.length > 46 ? q.slice(0, 44) + '…' : q}" → ${T.name}`;
    cur = r.best; t0 = performance.now(); stepIdx = -1; scene = makeScene(cur);
    $('#rag-steps').innerHTML = T.steps.map((s, i) => `<div class="l step" data-i="${i}"><span>${String(i + 1).padStart(2, '0')}</span><span>${s}</span></div>`).join('');
    clearInterval(stepTimer);
    const adv = () => {
      stepIdx++;
      document.querySelectorAll('.step').forEach((e, i) => { e.classList.toggle('on', i <= stepIdx); e.classList.toggle('cur', i === stepIdx); });
      if (stepIdx >= T.steps.length - 1) clearInterval(stepTimer);
    };
    adv(); stepTimer = setInterval(adv, 850);
    window.queueGutters && window.queueGutters();
    if (auto) { clearTimeout(autoTimer); autoTimer = setTimeout(() => { if (auto && visible) { sampleIdx = (sampleIdx + 1) % SAMPLES.length; go(SAMPLES[sampleIdx]); } else auto && (pendingAuto = true); }, 7600); }
  }
  let pendingAuto = false;
  samplesEl.addEventListener('click', e => { const t = e.target.closest('.rs'); if (t) go(t.textContent, true); });
  samplesEl.addEventListener('keydown', e => { const t = e.target.closest('.rs'); if (t && e.key === 'Enter') go(t.textContent, true); });
  $('#rag-go').addEventListener('click', () => go(input.value, true));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') go(input.value, true); });
  input.addEventListener('focus', () => { auto = false; clearTimeout(autoTimer); });

  /* ----------------------------- scenes ----------------------------- */
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let scene = null;
  function makeScene(kind) {
    seed = 7 + KEYS.indexOf(kind) * 101;
    if (kind === 'naive') {
      const pts = Array.from({ length: 140 }, (_, i) => ({ x: rnd(), y: rnd(), id: i }));
      const q = { x: 0.42 + rnd() * 0.1, y: 0.45 + rnd() * 0.1 };
      const near = [...pts].sort((a, b) => Math.hypot(a.x - q.x, a.y - q.y) - Math.hypot(b.x - q.x, b.y - q.y)).slice(0, 5);
      return { pts, q, near };
    }
    if (kind === 'graph') {
      const centers = [[0.22, 0.3], [0.7, 0.25], [0.3, 0.75], [0.75, 0.72]], nodes = [], edges = [];
      centers.forEach((c, k) => { for (let i = 0; i < 11; i++) { const a = rnd() * 6.28, r = 0.04 + rnd() * 0.13; nodes.push({ x: c[0] + Math.cos(a) * r, y: c[1] + Math.sin(a) * r * 1.2, c: k }); } });
      nodes.forEach((n, i) => nodes.forEach((m, j) => { if (j > i && ((n.c === m.c && rnd() < 0.22) || (n.c !== m.c && rnd() < 0.012))) edges.push([i, j]); }));
      return { centers, nodes, edges, scores: [0.82, 0.41, 0.67, 0.23] };
    }
    return {};
  }

  /* ----------------------------- drawing ----------------------------- */
  const cv = $('#rag-canvas');
  function size() {
    const w = cv.clientWidth, h = cv.clientHeight, d = devicePixelRatio || 1;
    if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
    const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
    g.font = '10px "IBM Plex Mono", monospace'; g.textBaseline = 'middle';
    return [g, w, h];
  }
  const ease = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  const DIM = '#2c313c', MID = '#5d6474', INK = '#e9e6df';

  function box(g, x, y, w, h, stroke, fill, label, col) {
    if (fill) { g.fillStyle = fill; g.fillRect(x, y, w, h); }
    g.strokeStyle = stroke; g.lineWidth = 1; g.strokeRect(x + .5, y + .5, w - 1, h - 1);
    if (label) { g.fillStyle = col || INK; g.fillText(label, x + 6, y + h / 2); }
  }

  function drawNaive(g, w, h, s, el, C) {
    const P = p => [20 + p.x * (w * 0.62 - 40), 16 + p.y * (h - 32)];
    s.pts.forEach(p => { const [x, y] = P(p); g.fillStyle = MID; g.fillRect(x - 1.5, y - 1.5, 3, 3); });
    const [qx, qy] = P(s.q);
    if (stepIdx >= 0) { // query point
      g.fillStyle = C; g.beginPath(); g.moveTo(qx, qy - 7); g.lineTo(qx + 7, qy); g.lineTo(qx, qy + 7); g.lineTo(qx - 7, qy); g.fill();
      g.fillText('query', qx + 10, qy - 10);
    }
    if (stepIdx >= 1) {
      const r = ease((el - 850) / 900) * 0.2 * (w * 0.62);
      g.strokeStyle = 'rgba(233,230,223,.25)'; g.beginPath(); g.arc(qx, qy, r, 0, 7); g.stroke();
    }
    if (stepIdx >= 2) s.near.forEach((p, i) => {
      const [x, y] = P(p); g.strokeStyle = C; g.globalAlpha = 0.7; g.beginPath(); g.moveTo(qx, qy); g.lineTo(x, y); g.stroke(); g.globalAlpha = 1;
      g.fillStyle = C; g.fillRect(x - 3, y - 3, 6, 6);
    });
    const bx = w * 0.66, bw = w * 0.32;
    g.fillStyle = MID; g.fillText('context window', bx, 14);
    s.near.forEach((p, i) => {
      const k = stepIdx >= 3 ? ease((el - 2550 - i * 120) / 500) : 0;
      const sim = (1 - Math.hypot(p.x - s.q.x, p.y - s.q.y) * 2.2).toFixed(2);
      box(g, bx, 30 + i * 34, bw, 26, k ? C : DIM, k ? 'rgba(233,230,223,.06)' : null, k ? `chunk #${p.id}  cos ${sim}` : '', INK);
    });
    if (stepIdx >= 4) box(g, bx, 30 + 5 * 34 + 10, bw, 30, C, C, 'answer', '#0d0f13');
  }

  function drawTree(g, w, h, el, C) {
    const levels = [['Document'], ['Ch 1', 'Ch 2', 'Ch 3', 'Ch 4'], ['7.1', '7.2', '7.3'], ['p.41', 'p.42', 'p.43', 'p.44']];
    const path = [0, 2, 1, 1]; // Document > Ch 3 > 7.2 > p.42
    const ys = [26, h * 0.32, h * 0.58, h * 0.84];
    const pos = levels.map((L, d) => L.map((_, i) => (i + 1) / (L.length + 1) * w));
    // edges: everything under the chosen path's parent is drawn
    for (let d = 1; d < levels.length; d++) {
      const px = pos[d - 1][path[d - 1]];
      levels[d].forEach((_, i) => {
        const on = stepIdx >= d && i === path[d];
        g.strokeStyle = on ? C : DIM; g.lineWidth = on ? 1.6 : 1;
        g.beginPath(); g.moveTo(px, ys[d - 1] + 12); g.bezierCurveTo(px, (ys[d - 1] + ys[d]) / 2, pos[d][i], (ys[d - 1] + ys[d]) / 2, pos[d][i], ys[d] - 12); g.stroke();
      });
    }
    levels.forEach((L, d) => L.map((lab, i) => {
      const on = (d === 0 && stepIdx >= 0) || (stepIdx >= d && i === path[d]);
      const reading = stepIdx === 1 && d === 1;
      const bw = Math.max(50, lab.length * 8 + 16), x = pos[d][i] - bw / 2;
      box(g, x, ys[d] - 12, bw, 24, on ? C : reading ? MID : DIM, on ? (d === levels.length - 1 && stepIdx >= 3 ? C : 'rgba(127,209,139,.08)') : null, lab, on && d === levels.length - 1 && stepIdx >= 3 ? '#0d0f13' : on ? INK : MID);
    }));
    g.fillStyle = MID; g.fillText('reasoning over the index, not similarity', 8, h - 8);
  }

  function drawGraph(g, w, h, s, el, C, now) {
    const P = n => [n.x * w, n.y * h];
    const hues = ['#b49cff', '#7fd18b', '#6cb6ff', '#ff8a70'];
    if (stepIdx >= 1) s.centers.forEach((c, k) => {
      g.strokeStyle = hues[k]; g.globalAlpha = 0.35; g.setLineDash([3, 4]);
      g.beginPath(); g.ellipse(c[0] * w, c[1] * h, 0.2 * w, 0.21 * h, 0, 0, 7); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    });
    s.edges.forEach(([a, b]) => { const [x1, y1] = P(s.nodes[a]), [x2, y2] = P(s.nodes[b]); g.strokeStyle = DIM; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); });
    s.nodes.forEach(n => { const [x, y] = P(n); g.fillStyle = stepIdx >= 1 ? hues[n.c] : MID; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); });
    if (stepIdx >= 2) s.centers.forEach((c, k) => {
      const x = c[0] * w, y = c[1] * h - 0.24 * h, sc = s.scores[k] * ease((el - 1700) / 700);
      g.fillStyle = hues[k]; g.fillText(`community ${k + 1}  ${sc.toFixed(2)}`, x - 50, Math.max(10, y));
    });
    if (stepIdx >= 3) {
      const ax = w * 0.5, ay = h * 0.5, k = ease((el - 2550) / 700);
      s.centers.forEach((c, i) => {
        if (s.scores[i] < 0.4) return;
        g.strokeStyle = C; g.globalAlpha = 0.8; g.beginPath(); g.moveTo(c[0] * w, c[1] * h); g.lineTo(c[0] * w + (ax - c[0] * w) * k, c[1] * h + (ay - c[1] * h) * k); g.stroke(); g.globalAlpha = 1;
      });
      if (stepIdx >= 4) { box(g, ax - 44, ay - 13, 88, 26, C, C, 'answer', '#0d0f13'); }
    }
  }

  const SQL = ["SELECT v.name, SUM(i.amount) AS spend", "FROM invoices i JOIN vendors v ON v.id = i.vendor_id", "WHERE i.date BETWEEN '2025-07-01' AND '2025-09-30'", "GROUP BY v.name ORDER BY spend DESC LIMIT 5;"];
  function drawSQL(g, w, h, el, C) {
    const tables = [['vendors', ['id', 'name', 'region']], ['invoices', ['id', 'vendor_id', 'amount', 'date']], ['departments', ['id', 'name', 'head']]];
    const tw = Math.min(150, w / 3.6);
    tables.forEach(([n, cols], i) => {
      const x = 10 + i * (tw + 16), on = stepIdx >= 0 && i < 2;
      box(g, x, 8, tw, 20, on ? C : DIM, on ? C : null, n, on ? '#0d0f13' : MID);
      cols.forEach((c, j) => { g.fillStyle = on ? INK : MID; g.fillText(c, x + 8, 38 + j * 15); });
    });
    if (stepIdx >= 1) {
      const chars = Math.floor((el - 850) / 14);
      let left = chars;
      SQL.forEach((line, i) => { if (left <= 0) return; g.fillStyle = C; g.fillText(line.slice(0, left), 10, 112 + i * 16); left -= line.length; });
    }
    if (stepIdx >= 2) {
      const rows = [['vendor_a', '4,820,000'], ['vendor_b', '3,915,500'], ['vendor_c', '2,760,250'], ['vendor_d', '2,104,900'], ['vendor_e', '1,998,000']];
      const y0 = 190, rw = Math.min(w - 20, 300);
      g.fillStyle = MID; g.fillText('name', 14, y0); g.fillText('spend', 14 + rw * 0.6, y0);
      rows.forEach((r, i) => {
        if (ease((el - 1700 - i * 110) / 300) <= 0) return;
        g.fillStyle = INK; g.fillText(r[0], 14, y0 + 18 + i * 17); g.fillText(r[1], 14 + rw * 0.6, y0 + 18 + i * 17);
      });
      g.strokeStyle = DIM; g.strokeRect(8.5, y0 - 10.5, rw, 108);
      g.fillStyle = MID; g.fillText('sample rows', rw - 70, y0 + 108);
    }
    if (stepIdx >= 3) box(g, w - Math.min(170, w * 0.36) - 8, 200, Math.min(170, w * 0.36), 26, C, null, '+ contract notes', C);
    if (stepIdx >= 4) box(g, w - Math.min(170, w * 0.36) - 8, 240, Math.min(170, w * 0.36), 30, C, C, 'answer', '#0d0f13');
  }

  function drawTemporal(g, w, h, el, C) {
    const y0 = 2019, y1 = 2027, L = 20, R = w - 20;
    const X = y => L + (y - y0) / (y1 - y0) * (R - L);
    g.strokeStyle = MID; g.beginPath(); g.moveTo(L, h - 26); g.lineTo(R, h - 26); g.stroke();
    for (let y = y0; y <= y1; y++) { g.fillStyle = MID; g.fillText(String(y), X(y) - 14, h - 12); g.fillRect(X(y), h - 30, 1, 8); }
    const facts = [['A  leads  payments', 2019.2, 2024.3], ['B  leads  payments', 2024.3, 2027], ['A  member  risk', 2024.3, 2027], ['C  reports_to  A', 2020.5, 2024.3], ['payments  part_of  ops', 2019, 2027]];
    const win = [2019, 2024.3];
    if (stepIdx >= 1) {
      const k = ease((el - 850) / 600);
      g.fillStyle = 'rgba(255,138,112,.08)'; g.fillRect(X(win[0]), 6, (X(win[1]) - X(win[0])) * k, h - 36);
      g.strokeStyle = C; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(X(win[1]), 6); g.lineTo(X(win[1]), h - 30); g.stroke(); g.setLineDash([]);
      g.fillStyle = C; g.fillText('query window', X(win[0]) + 6, h - 40);
    }
    facts.forEach((f, i) => {
      const y = 40 + i * ((h - 90) / facts.length), valid = f[1] < win[1] && f[2] > win[0];
      const hit = stepIdx >= 2 && valid, rank = stepIdx >= 3 && i === 0;
      g.fillStyle = hit ? (rank ? C : 'rgba(255,138,112,.45)') : DIM;
      g.fillRect(X(f[1]), y, X(f[2]) - X(f[1]), rank ? 10 : 6);
      g.fillStyle = hit ? INK : MID; g.fillText(f[0], X(f[1]) + 4, y - 7);
    });
    if (stepIdx >= 4) box(g, R - 150, h - 72, 150, 28, C, C, 'answer: A, 2019-2024', '#0d0f13');
  }

  function frame(now) {
    if (cur && visible) {
      const [g, w, h] = size(), el = now - t0, C = TECH[cur].color;
      if (cur === 'naive') drawNaive(g, w, h, scene, el, C);
      else if (cur === 'tree') drawTree(g, w, h, el, C);
      else if (cur === 'graph') drawGraph(g, w, h, scene, el, C, now);
      else if (cur === 'sql') drawSQL(g, w, h, el, C);
      else drawTemporal(g, w, h, el, C);
    }
    requestAnimationFrame(frame);
  }

  let visible = false, started = false;
  new IntersectionObserver(e => {
    visible = e[0].isIntersecting;
    if (visible && !started) { started = true; go(SAMPLES[0]); }
    if (visible && pendingAuto && auto) { pendingAuto = false; sampleIdx = (sampleIdx + 1) % SAMPLES.length; go(SAMPLES[sampleIdx]); }
  }, { rootMargin: '0px 0px -15% 0px' }).observe(cv);
  requestAnimationFrame(frame);
})();
