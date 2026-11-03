/* Exhibit B: FX options pricer.
 * Garman-Kohlhagen closed form vs a multithreaded Monte Carlo (Web Workers),
 * with antithetic variates, streamed partial sums and a convergence plot. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  if (!$('#fx')) return;

  /* ----------------------------- presets (illustrative market inputs) ----------------------------- */
  const PAIRS = {
    'EUR/USD': { S: 1.085, K: 1.1, v: 7.5, T: 0.5, rd: 4.25, rf: 2.75 },
    'USD/INR': { S: 84.1, K: 85, v: 4.5, T: 0.5, rd: 6.5, rf: 4.25 },
    'GBP/USD': { S: 1.27, K: 1.28, v: 8.0, T: 0.25, rd: 4.25, rf: 4.5 },
    'USD/JPY': { S: 150, K: 152, v: 10, T: 1, rd: 0.5, rf: 4.25 },
  };
  const pairSel = $('#fx-pair');
  pairSel.innerHTML = Object.keys(PAIRS).map(p => `<option>${p}</option>`).join('');
  const F = { S: $('#fx-S'), K: $('#fx-K'), v: $('#fx-v'), T: $('#fx-T'), rd: $('#fx-rd'), rf: $('#fx-rf') };
  const loadPair = () => { const p = PAIRS[pairSel.value]; Object.keys(F).forEach(k => F[k].value = p[k]); };
  pairSel.addEventListener('change', () => { loadPair(); stale(); });
  loadPair();

  const cores = navigator.hardwareConcurrency || 4;
  const thSel = $('#fx-th');
  [1, 2, 4, 8, 16].filter(n => n === 1 || n <= Math.max(2, cores)).forEach(n => thSel.add(new Option(n + (n === 1 ? ' thread' : ' threads'), n)));
  thSel.value = String(Math.min(4, Math.max(2, cores)));
  $('#fx-cores').textContent = `${cores} logical cores detected`;

  /* ----------------------------- Garman-Kohlhagen ----------------------------- */
  const npdf = x => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  function ncdf(x) { // Abramowitz-Stegun 26.2.17, |err| < 7.5e-8
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const y = 1 - npdf(x) * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return x >= 0 ? y : 1 - y;
  }
  function gk(p) {
    const { S, K, v, T, rd, rf, call } = p, sq = v * Math.sqrt(T);
    const d1 = (Math.log(S / K) + (rd - rf + 0.5 * v * v) * T) / sq, d2 = d1 - sq;
    const df = Math.exp(-rd * T), ff = Math.exp(-rf * T);
    const price = call ? S * ff * ncdf(d1) - K * df * ncdf(d2) : K * df * ncdf(-d2) - S * ff * ncdf(-d1);
    return { price, delta: call ? ff * ncdf(d1) : -ff * ncdf(-d1), gamma: ff * npdf(d1) / (S * sq), vega: S * ff * npdf(d1) * Math.sqrt(T) / 100 };
  }

  /* ----------------------------- worker source ----------------------------- */
  const WORKER = `
  onmessage = function (e) {
    var d = e.data, S = d.S, K = d.K, v = d.v, T = d.T, rd = d.rd, rf = d.rf, call = d.call;
    var pairs = d.n >> 1, chunk = d.chunk >> 1, s = d.seed >>> 0 || 1;
    var drift = (rd - rf - 0.5 * v * v) * T, vol = v * Math.sqrt(T);
    var lo = Math.log(S) + drift - 4.5 * vol, hi = Math.log(S) + drift + 4.5 * vol, B = 72;
    var hist = new Float64Array(B), sum = 0, sum2 = 0, t0 = performance.now();
    function u() { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) + 0.5) / 4294967296; }
    function pay(x) { return call ? (x > K ? x - K : 0) : (K > x ? K - x : 0); }
    for (var i = 0; i < pairs; i++) {
      var r = Math.sqrt(-2 * Math.log(u())), z = r * Math.cos(6.283185307179586 * u());
      var a = drift + vol * z, b = drift - vol * z;
      var sa = S * Math.exp(a), sb = S * Math.exp(b);
      var p = 0.5 * (pay(sa) + pay(sb));
      sum += p; sum2 += p * p;
      if ((i & 15) === 0) { var k = ((Math.log(S) + a - lo) / (hi - lo) * B) | 0; if (k >= 0 && k < B) hist[k]++; }
      if ((i + 1) % chunk === 0 && i + 1 < pairs) postMessage({ type: 'p', pairs: i + 1, sum: sum, sum2: sum2, ms: performance.now() - t0 });
    }
    postMessage({ type: 'd', pairs: pairs, sum: sum, sum2: sum2, ms: performance.now() - t0, hist: Array.prototype.slice.call(hist), lo: lo, hi: hi });
  };`;
  const workerURL = URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' }));

  /* ----------------------------- state & helpers ----------------------------- */
  let running = false, workers = [], ws = [], conv = [], hist = null, histRange = null, params = null, ref = null, t0 = 0, isStale = false;
  const fmtN = n => Math.round(n).toLocaleString('en-US');
  const dp = () => (params && params.S >= 10 ? 4 : 6);
  const status = t => { $('#fx-status').textContent = t; };
  function stale() { if (!running) { isStale = true; status('Inputs changed. Run again.'); } }
  Object.values(F).forEach(i => { i.addEventListener('input', stale); i.addEventListener('keydown', e => e.key === 'Enter' && run()); });
  $('#fx-type').addEventListener('change', stale);

  function readParams() {
    const num = k => parseFloat(String(F[k].value).replace(',', '.'));
    const p = { S: num('S'), K: num('K'), v: num('v') / 100, T: num('T'), rd: num('rd') / 100, rf: num('rf') / 100, call: $('#fx-type').value === 'call' };
    const ok = p.S > 0 && p.K > 0 && p.v > 0 && p.v < 3 && p.T > 0 && p.T <= 30 && isFinite(p.rd) && isFinite(p.rf);
    return ok ? p : null;
  }

  /* ----------------------------- run ----------------------------- */
  function run() {
    if (running) return;
    const p = readParams();
    if (!p) { status('Check the inputs.'); return; }
    params = p; ref = gk(p); isStale = false;
    const N = +$('#fx-N').value, T = +thSel.value, per = Math.floor(N / T / 2) * 2;
    running = true; conv = []; hist = null; t0 = performance.now();
    $('#fx-run').disabled = true; status(`Running ${fmtN(per * T)} paths on ${T} thread${T > 1 ? 's' : ''}...`);
    ws = Array.from({ length: T }, () => ({ pairs: 0, total: per / 2, sum: 0, sum2: 0, ms: 0, done: false }));
    $('#r-gk').textContent = ref.price.toFixed(dp());
    $('#r-greeks').textContent = `${ref.delta.toFixed(4)} / ${ref.gamma.toFixed(4)} / ${ref.vega.toFixed(dp())}`;
    newPaths();
    const seed0 = (Math.random() * 2 ** 31) | 0;
    workers = ws.map((w, i) => {
      const wk = new Worker(workerURL);
      wk.onmessage = e => onMsg(i, e.data);
      wk.postMessage({ ...p, n: per, chunk: Math.max(20000, per / 40) | 0, seed: (seed0 + i * 2654435761) >>> 0 });
      return wk;
    });
    requestAnimationFrame(frame);
  }
  function merged() {
    let pairs = 0, sum = 0, sum2 = 0;
    ws.forEach(w => { pairs += w.pairs; sum += w.sum; sum2 += w.sum2; });
    if (!pairs) return null;
    const df = Math.exp(-params.rd * params.T), mean = sum / pairs;
    const varP = Math.max(0, sum2 / pairs - mean * mean);
    return { paths: pairs * 2, price: df * mean, se: df * Math.sqrt(varP / pairs) };
  }
  function onMsg(i, m) {
    const w = ws[i]; w.pairs = m.pairs; w.sum = m.sum; w.sum2 = m.sum2; w.ms = m.ms;
    const r = merged(); if (r) conv.push(r);
    if (m.type === 'd') {
      w.done = true; workers[i].terminate();
      if (!hist) { hist = new Float64Array(m.hist.length); histRange = [m.lo, m.hi]; }
      m.hist.forEach((v, k) => hist[k] += v);
      if (ws.every(x => x.done)) finish();
    }
  }
  function finish() {
    running = false; $('#fx-run').disabled = false;
    const r = merged(), el = (performance.now() - t0) / 1000;
    $('#r-mc').textContent = r.price.toFixed(dp());
    $('#r-ci').textContent = `± ${(1.96 * r.se).toFixed(dp())}  [${(r.price - 1.96 * r.se).toFixed(dp())}, ${(r.price + 1.96 * r.se).toFixed(dp())}]`;
    const err = Math.abs(r.price - ref.price), inCI = err <= 1.96 * r.se;
    $('#r-err').textContent = `${err.toExponential(2)}  (${(err / Math.max(ref.price, 1e-12) * 100).toFixed(3)}%, ${inCI ? 'inside' : 'outside'} 95% CI)`;
    $('#r-tp').textContent = `${(r.paths / el / 1e6).toFixed(1)}M paths/sec, ${Math.round(el * 1000)} ms wall`;
    status(`Done. ${fmtN(r.paths)} paths.`);
    draw(); drawConv();
  }

  /* ----------------------------- worker bars ----------------------------- */
  function renderWorkers() {
    const W = innerWidth < 720 ? 14 : 30;
    $('#fx-workers').innerHTML = ws.map((w, i) => {
      const f = w.total ? w.pairs / w.total : 0, k = Math.round(f * W);
      return `<div class="l row fx-w${w.done ? ' done' : ''}"><span>W${i + 1} <span class="bar">${'█'.repeat(k)}<span class="dim">${'░'.repeat(W - k)}</span></span></span>` +
        `<span>${fmtN(w.pairs * 2)} paths &nbsp;${Math.round(w.ms)} ms</span></div>`;
    }).join('');
  }
  function frame() {
    renderWorkers();
    const r = merged();
    if (r && running) { $('#r-mc').textContent = r.price.toFixed(dp()); $('#r-ci').textContent = `± ${(1.96 * r.se).toFixed(dp())}`; }
    draw(); drawConv();
    if (running) requestAnimationFrame(frame); else { renderWorkers(); window.rebuildGutters && window.rebuildGutters(); }
  }

  /* ----------------------------- sample paths + terminal histogram ----------------------------- */
  let paths = [], drawStart = 0;
  function newPaths() {
    const p = params, steps = 64, n = 70, dt = p.T / steps, sq = p.v * Math.sqrt(dt), mu = (p.rd - p.rf - 0.5 * p.v * p.v) * dt;
    paths = [];
    for (let j = 0; j < n; j++) {
      let x = Math.log(p.S); const a = [p.S];
      for (let t = 0; t < steps; t++) {
        const z = Math.sqrt(-2 * Math.log(Math.random() || 1e-12)) * Math.cos(2 * Math.PI * Math.random());
        x += mu + sq * z; a.push(Math.exp(x));
      }
      paths.push(a);
    }
    drawStart = performance.now();
  }
  function sizeCanvas(cv) {
    const w = cv.clientWidth, h = cv.clientHeight, d = devicePixelRatio || 1;
    if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
    const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
    g.font = '10px "IBM Plex Mono", monospace'; g.textBaseline = 'middle';
    return [g, w, h];
  }
  function draw() {
    if (!params) return;
    const [g, w, h] = sizeCanvas($('#fx-paths'));
    const histW = Math.min(150, w * 0.22), pw = w - histW - 56, padT = 10, padB = 16;
    const drift = (params.rd - params.rf - 0.5 * params.v * params.v) * params.T, vol = params.v * Math.sqrt(params.T);
    const yLo = params.S * Math.exp(drift - 3 * vol), yHi = params.S * Math.exp(drift + 3 * vol);
    const Y = s => padT + (1 - (Math.log(s) - Math.log(yLo)) / (Math.log(yHi) - Math.log(yLo))) * (h - padT - padB);
    // axis labels
    g.fillStyle = '#7d7d7d';
    [yLo, params.S, yHi].forEach(s => g.fillText(s.toFixed(params.S >= 10 ? 2 : 4), 0, Y(s)));
    g.fillText('t = 0', 56, h - 5); g.fillText(`T = ${params.T}y`, 56 + pw - 50, h - 5);
    // strike
    g.strokeStyle = '#b15d00'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(56, Y(params.K)); g.lineTo(56 + pw + histW, Y(params.K)); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#ffb35c'; g.fillText('K ' + params.K, 56 + pw + 4, Y(params.K) - 8);
    // paths, drawn progressively
    const prog = Math.min(1, (performance.now() - drawStart) / 900);
    paths.forEach(a => {
      const n = Math.max(1, Math.floor((a.length - 1) * prog)), end = a[a.length - 1];
      const itm = params.call ? end > params.K : end < params.K;
      g.strokeStyle = itm ? 'rgba(255,179,92,.55)' : 'rgba(236,236,236,.22)'; g.lineWidth = 1;
      g.beginPath();
      for (let t = 0; t <= n; t++) { const x = 56 + (t / (a.length - 1)) * pw, y = Y(Math.min(yHi, Math.max(yLo, a[t]))); t ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    });
    g.strokeStyle = '#3a3a3a'; g.beginPath(); g.moveTo(56 + pw, padT); g.lineTo(56 + pw, h - padB); g.stroke();
    // terminal histogram from all simulated paths
    if (hist && histRange) {
      const mx = Math.max(...hist), B = hist.length;
      for (let k = 0; k < B; k++) {
        const sMid = Math.exp(histRange[0] + (k + 0.5) / B * (histRange[1] - histRange[0]));
        if (sMid < yLo || sMid > yHi) continue;
        const y0 = Y(Math.exp(histRange[0] + (k + 1) / B * (histRange[1] - histRange[0])));
        const y1 = Y(Math.exp(histRange[0] + k / B * (histRange[1] - histRange[0])));
        const itm = params.call ? sMid > params.K : sMid < params.K;
        g.fillStyle = itm ? '#ffb35c' : '#cfcfcf';
        g.fillRect(56 + pw + 2, y0, (hist[k] / mx) * (histW - 6), Math.max(1, y1 - y0 - 1));
      }
    }
  }

  /* ----------------------------- convergence ----------------------------- */
  function drawConv() {
    if (!params || !ref) return;
    const [g, w, h] = sizeCanvas($('#fx-conv'));
    const L = 56, R = w - 8, T = 8, Bm = h - 16;
    const N = +$('#fx-N').value, x0 = Math.log10(1e4), x1 = Math.log10(N);
    const span = Math.max(ref.price * 0.04, ...conv.slice(0, 3).map(c => Math.abs(c.price - ref.price) + 2 * c.se), 1e-9);
    const yLo = ref.price - span, yHi = ref.price + span;
    const X = n => L + (Math.log10(Math.max(n, 1e4)) - x0) / (x1 - x0 || 1) * (R - L);
    const Y = v => T + (1 - (v - yLo) / (yHi - yLo)) * (Bm - T);
    g.fillStyle = '#7d7d7d';
    g.fillText(yHi.toFixed(dp()), 0, Y(yHi)); g.fillText(yLo.toFixed(dp()), 0, Y(yLo));
    for (let e = Math.ceil(x0); e <= x1; e++) { const x = X(10 ** e); g.fillText('1e' + e, x - 8, h - 5); g.fillStyle = '#222'; g.fillRect(x, T, 1, Bm - T); g.fillStyle = '#7d7d7d'; }
    g.strokeStyle = '#b15d00'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(L, Y(ref.price)); g.lineTo(R, Y(ref.price)); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#ffb35c'; g.fillText('GK ' + ref.price.toFixed(dp()), R - 110, Y(ref.price) - 9);
    const pts = conv.filter(c => c.paths >= 1e4);
    if (pts.length > 1) {
      g.fillStyle = 'rgba(236,236,236,.12)'; g.beginPath();
      pts.forEach((c, i) => { const x = X(c.paths), y = Y(Math.min(yHi, c.price + 1.96 * c.se)); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      [...pts].reverse().forEach(c => g.lineTo(X(c.paths), Y(Math.max(yLo, c.price - 1.96 * c.se))));
      g.fill();
      g.strokeStyle = '#ececec'; g.lineWidth = 1.3; g.beginPath();
      pts.forEach((c, i) => { const x = X(c.paths), y = Y(Math.min(yHi, Math.max(yLo, c.price))); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
    }
  }

  $('#fx-run').addEventListener('click', run);
  $('#fx-N').addEventListener('change', stale);
  thSel.addEventListener('change', stale);
  window.addEventListener('resize', () => { draw(); drawConv(); });
  // run once when the exhibit first scrolls into view
  let auto = false;
  new IntersectionObserver(e => { if (e[0].isIntersecting && !auto) { auto = true; setTimeout(run, 400); } }, { rootMargin: '0px 0px -20% 0px' }).observe($('#fx-paths'));
  // keep the path animation moving while it draws
  (function tick() { if (params && !running && performance.now() - drawStart < 1000) draw(); requestAnimationFrame(tick); })();
})();
