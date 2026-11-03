/* Exhibit B: a from-scratch six-max no-limit hold'em arena.
 * Engine, 7-card evaluator, Monte Carlo equity, six bot styles. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  if (!$('#felt')) return;

  /* ============================ cards & evaluator ============================ */
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const SUITS = ['♠', '♥', '♦', '♣'];
  const rk = c => c >> 2, su = c => c & 3;
  const rnd = Math.random;

  function shuffled(excl) {
    const d = [];
    for (let c = 0; c < 52; c++) if (!excl || !excl.has(c)) d.push(c);
    for (let i = d.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [d[i], d[j]] = [d[j], d[i]]; }
    return d;
  }
  function straightHigh(mask) {
    for (let h = 12; h >= 4; h--) if (((mask >> (h - 4)) & 31) === 31) return h;
    if ((mask & 0b1000000001111) === 0b1000000001111) return 3; // wheel A-2-3-4-5
    return -1;
  }
  const topBits = (mask, k) => { const o = []; for (let r = 12; r >= 0 && o.length < k; r--) if (mask & (1 << r)) o.push(r); return o; };
  const pack = (cat, ks) => { let v = cat; for (let i = 0; i < 5; i++) v = v * 16 + (ks[i] || 0); return v; };

  // Returns a comparable score; higher is better. Category = floor(score / 16^5).
  function eval7(cards) {
    const cnt = new Array(13).fill(0), sc = [0, 0, 0, 0], sm = [0, 0, 0, 0];
    let mask = 0;
    for (const c of cards) { const r = rk(c), s = su(c); cnt[r]++; sc[s]++; sm[s] |= 1 << r; mask |= 1 << r; }
    let fs = -1; for (let s = 0; s < 4; s++) if (sc[s] >= 5) fs = s;
    if (fs >= 0) { const h = straightHigh(sm[fs]); if (h >= 0) return pack(8, [h]); }
    const quads = [], trips = [], pairs = [];
    for (let r = 12; r >= 0; r--) { if (cnt[r] === 4) quads.push(r); else if (cnt[r] === 3) trips.push(r); else if (cnt[r] === 2) pairs.push(r); }
    if (quads.length) return pack(7, [quads[0], topBits(mask & ~(1 << quads[0]), 1)[0]]);
    if (trips.length && (trips.length > 1 || pairs.length)) {
      const p = Math.max(trips[1] ?? -1, pairs[0] ?? -1);
      return pack(6, [trips[0], p]);
    }
    if (fs >= 0) return pack(5, topBits(sm[fs], 5));
    const sh = straightHigh(mask); if (sh >= 0) return pack(4, [sh]);
    if (trips.length) return pack(3, [trips[0], ...topBits(mask & ~(1 << trips[0]), 2)]);
    if (pairs.length >= 2) return pack(2, [pairs[0], pairs[1], topBits(mask & ~(1 << pairs[0]) & ~(1 << pairs[1]), 1)[0]]);
    if (pairs.length) return pack(1, [pairs[0], ...topBits(mask & ~(1 << pairs[0]), 3)]);
    return pack(0, topBits(mask, 5));
  }
  const CAT = 16 ** 5;
  const CAT_NAMES = ['high card', 'pair', 'two pair', 'trips', 'straight', 'flush', 'full house', 'quads', 'straight flush'];

  /* Hero equity vs one random hand, Monte Carlo. */
  function heroEquity(hole, board, iters) {
    const known = new Set([...hole, ...board]);
    let w = 0;
    for (let k = 0; k < iters; k++) {
      const d = shuffled(known);
      const opp = [d[0], d[1]], b = board.concat(d.slice(2, 2 + 5 - board.length));
      const a = eval7(hole.concat(b)), o = eval7(opp.concat(b));
      w += a > o ? 1 : a === o ? 0.5 : 0;
    }
    return w / iters;
  }
  /* Exact-information equity for display: every hole card known. */
  function tableEquity(holes, live, board, iters) {
    const known = new Set(board); holes.forEach(h => h.forEach(c => known.add(c)));
    const eq = holes.map(() => 0);
    const idx = live.map((v, i) => v ? i : -1).filter(i => i >= 0);
    if (idx.length === 1) { eq[idx[0]] = 1; return eq; }
    const n = board.length === 5 ? 1 : iters;
    for (let k = 0; k < n; k++) {
      const d = board.length === 5 ? [] : shuffled(known);
      const b = board.concat(d.slice(0, 5 - board.length));
      let best = -1, win = [];
      for (const i of idx) { const v = eval7(holes[i].concat(b)); if (v > best) { best = v; win = [i]; } else if (v === best) win.push(i); }
      win.forEach(i => eq[i] += 1 / win.length);
    }
    return eq.map(v => v / n);
  }
  /* Chen formula, mapped to an approximate heads-up equity. */
  function preflopHU(h) {
    let [a, b] = [rk(h[0]), rk(h[1])]; if (b > a) [a, b] = [b, a];
    const base = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 10][a];
    let s = a === b ? Math.max(5, base * 2) : base;
    if (su(h[0]) === su(h[1])) s += 2;
    const gap = a - b - 1;
    if (a !== b) { s -= [0, 1, 2, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5][Math.max(0, gap)]; if (gap <= 1 && a < 10) s += 1; }
    return Math.min(0.86, Math.max(0.3, 0.3 + (s / 20) * 0.56));
  }
  const FAST_POST = [0.32, 0.56, 0.72, 0.8, 0.86, 0.89, 0.94, 0.985, 1];
  function fastStrength(hole, board) {
    if (!board.length) return preflopHU(hole);
    const v = eval7(hole.concat(board)), cat = Math.floor(v / CAT);
    let s = FAST_POST[cat];
    if (cat === 1) { // pair: is it made with a hole card, and how high?
      const pr = Math.floor(v / 16 ** 4) % 16, topBoard = Math.max(...board.map(rk));
      if (!hole.some(c => rk(c) === pr)) s = 0.36; else if (pr >= topBoard) s = 0.66;
    }
    return s;
  }

  /* ============================ bots ============================ */
  const BOTS = [
    { id: 'ADWAY.BOT', style: 'equity-driven', loose: 0.0, aggr: 0.55, bluff: 0.07, call: 0.0, ours: true },
    { id: 'NASH', style: 'tight-aggressive', loose: -0.06, aggr: 0.7, bluff: 0.04, call: -0.03 },
    { id: 'MONTE', style: 'random', random: true },
    { id: 'TILT', style: 'loose-aggressive', loose: 0.12, aggr: 0.8, bluff: 0.2, call: 0.06 },
    { id: 'GTO-LITE', style: 'balanced mix', loose: 0.0, aggr: 0.5, bluff: 0.11, call: 0.0 },
    { id: 'STATION', style: 'calling station', loose: 0.14, aggr: 0.08, bluff: 0.0, call: 0.2 },
  ];
  const N = BOTS.length, SB = 50, BB = 100, START = 10000;

  function decide(bot, x, mc) {
    const { toCall, pot, stack } = x;
    const sizeBet = f => Math.round((x.curBet + Math.max(x.minRaise, pot * f)) / 50) * 50;
    if (bot.random) {
      const r = rnd();
      if (toCall === 0) return r < 0.6 ? { a: 'x' } : { a: 'b', to: sizeBet(0.4 + rnd() * 0.8) };
      return r < 0.33 ? { a: 'f' } : r < 0.85 || x.raises >= 3 ? { a: 'c' } : { a: 'r', to: sizeBet(0.7) };
    }
    const hu = mc && x.board.length ? heroEquity(x.hole, x.board, 90) : fastStrength(x.hole, x.board);
    const s = Math.pow(hu, 1 + 0.35 * (x.nOpp - 1));
    const want = s + bot.loose * (x.board.length ? 0.5 : 1);
    if (toCall === 0) {
      if (want > 0.6 && rnd() < bot.aggr + (want - 0.6)) return { a: 'b', to: sizeBet(0.45 + rnd() * 0.55) };
      if (rnd() < bot.bluff) return { a: 'b', to: sizeBet(0.5) };
      return { a: 'x' };
    }
    const odds = toCall / (pot + toCall);
    if (want > 0.7 && x.raises < 4 && rnd() < bot.aggr) return { a: 'r', to: sizeBet(0.6 + rnd() * 0.6) };
    if (want + bot.call > odds + 0.1 || toCall <= stack * 0.01) return { a: 'c' };
    if (x.raises < 3 && rnd() < bot.bluff * 0.4) return { a: 'r', to: sizeBet(0.8) };
    return { a: 'f' };
  }

  /* ============================ engine ============================ */
  // Plays one hand to completion and returns the event log (each event carries a snapshot).
  function playHand(dealer, mc) {
    const deck = shuffled();
    const holes = BOTS.map((_, i) => [deck[i], deck[i + N]]);
    const fullBoard = deck.slice(2 * N, 2 * N + 5);
    const stack = new Array(N).fill(START), contrib = new Array(N).fill(0), bet = new Array(N).fill(0);
    const folded = new Array(N).fill(false), allin = new Array(N).fill(false);
    let boardN = 0, street = 0;
    const ev = [];
    const live = () => folded.map(f => !f);
    const nLive = () => folded.filter(f => !f).length;
    const snap = e => {
      e.stack = stack.slice(); e.bet = bet.slice(); e.folded = folded.slice();
      e.pot = contrib.reduce((a, b) => a + b, 0); e.boardN = boardN; e.street = street; ev.push(e);
    };
    const put = (i, amt) => {
      amt = Math.min(amt, stack[i]); stack[i] -= amt; contrib[i] += amt; bet[i] += amt;
      if (stack[i] === 0) allin[i] = true; return amt;
    };
    const sb = (dealer + 1) % N, bb = (dealer + 2) % N;
    snap({ t: 'deal' });
    put(sb, SB); snap({ t: 'act', seat: sb, a: 'b', amt: SB });
    put(bb, BB); snap({ t: 'act', seat: bb, a: 'b', amt: BB });

    for (street = 0; street < 4; street++) {
      if (street > 0) { boardN = [0, 3, 4, 5][street]; bet.fill(0); snap({ t: 'street' }); }
      if (nLive() < 2) break;
      const canAct = () => BOTS.map((_, i) => !folded[i] && !allin[i]);
      if (canAct().filter(Boolean).length < 2 && Math.max(...bet) <= Math.max(...bet.filter((_, i) => canAct()[i]), 0)) continue;
      let curBet = street === 0 ? BB : 0, minRaise = BB, raises = 0;
      let pending = new Set(canAct().map((v, i) => v ? i : -1).filter(i => i >= 0));
      let i = street === 0 ? (bb + 1) % N : (dealer + 1) % N, guard = 0;
      while (pending.size && nLive() > 1 && guard++ < 200) {
        if (pending.has(i)) {
          pending.delete(i);
          const toCall = curBet - bet[i];
          const board = fullBoard.slice(0, boardN);
          const x = { hole: holes[i], board, pot: contrib.reduce((a, b) => a + b, 0), toCall, curBet, minRaise, stack: stack[i], raises, nOpp: nLive() - 1 };
          let d = decide(BOTS[i], x, mc);
          if (d.a === 'f' && toCall === 0) d = { a: 'x' };
          if (d.a === 'x' && toCall > 0) d = { a: 'c' };
          if (d.a === 'b' && curBet > 0) d.a = 'r';
          if (d.a === 'r' && curBet === 0) d.a = 'b';
          if (d.a === 'f') { folded[i] = true; snap({ t: 'act', seat: i, a: 'F' }); }
          else if (d.a === 'x') snap({ t: 'act', seat: i, a: 'X' });
          else if (d.a === 'c') { const p = put(i, toCall); snap({ t: 'act', seat: i, a: allin[i] ? 'A' : 'C', amt: p }); }
          else {
            let to = Math.max(d.to, curBet + minRaise);
            const p = put(i, to - bet[i]); to = bet[i];
            if (to > curBet) { minRaise = Math.max(minRaise, to - curBet); curBet = to; raises++; pending = new Set(canAct().map((v, k) => v && k !== i ? k : -1).filter(k => k >= 0)); }
            snap({ t: 'act', seat: i, a: allin[i] ? 'A' : d.a === 'b' ? 'B' : 'R', amt: p, to });
          }
        }
        i = (i + 1) % N;
      }
      if (nLive() < 2) break;
    }
    // award (equal starting stacks => no side pots needed)
    const pot = contrib.reduce((a, b) => a + b, 0);
    const board = fullBoard;
    let winners, shown = false, best = -1;
    if (nLive() === 1) winners = [folded.indexOf(false)];
    else {
      shown = true; boardN = 5; street = 4; winners = [];
      live().forEach((v, i) => { if (!v) return; const s = eval7(holes[i].concat(board)); if (s > best) { best = s; winners = [i]; } else if (s === best) winners.push(i); });
    }
    const share = Math.floor(pot / winners.length);
    winners.forEach(w => stack[w] += share);
    const net = stack.map(s => s - START);
    snap({ t: 'win', winners, shown, cat: shown ? CAT_NAMES[Math.floor(best / CAT)] : null, share });
    return { ev, holes, board, net, dealer };
  }

  /* ============================ stats & background tables ============================ */
  const stats = { hands: 0, net: new Array(N).fill(0) };
  const record = h => { stats.hands++; h.net.forEach((v, i) => stats.net[i] += v); };
  let bgDealer = 0, hpsWindow = [];
  function background() {
    const t0 = performance.now(); let k = 0;
    while (performance.now() - t0 < 7) { record(playHand(bgDealer = (bgDealer + 1) % N, false)); k++; }
    const now = performance.now(); hpsWindow.push([now, k]);
    while (hpsWindow.length && now - hpsWindow[0][0] > 2000) hpsWindow.shift();
  }
  function renderStats() {
    const span = hpsWindow.length > 1 ? (hpsWindow[hpsWindow.length - 1][0] - hpsWindow[0][0]) / 1000 : 1;
    const hps = hpsWindow.reduce((a, b) => a + b[1], 0) / Math.max(span, 0.25);
    $('#hands').textContent = stats.hands.toLocaleString('en-US');
    $('#hps').textContent = Math.round(hps).toLocaleString('en-US');
    const order = BOTS.map((b, i) => i).sort((a, b) => stats.net[b] - stats.net[a]);
    const maxAbs = Math.max(1, ...stats.net.map(Math.abs));
    $('#standings').innerHTML = order.map((i, r) => {
      const n = stats.net[i], bb100 = stats.hands ? (n / BB) / stats.hands * 100 : 0;
      const w = Math.round(Math.abs(n) / maxAbs * 60);
      return `<div class="stand${BOTS[i].ours ? ' ours' : ''}"><span>${r + 1}. S${i + 1} ${BOTS[i].id} <span class="dim">/ ${BOTS[i].style}</span></span>` +
        `<span>${n < 0 ? '' : '+'}${n.toLocaleString('en-US')}</span><span>${bb100 >= 0 ? '+' : ''}${bb100.toFixed(1)}</span></div>`;
    }).join('');
  }

  /* grid of mini tables */
  const grid = $('#grid'), COLS = 16, ROWS = 6;
  let selTable = 0, gridSeats = Array.from({ length: COLS * ROWS }, () => ({ hot: (rnd() * 6) | 0, live: 6 }));
  function drawGrid() {
    const w = grid.clientWidth, h = grid.clientHeight, dpr = devicePixelRatio || 1;
    if (grid.width !== Math.round(w * dpr)) { grid.width = Math.round(w * dpr); grid.height = Math.round(h * dpr); }
    const g = grid.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const cw = w / COLS, ch = h / ROWS, rx = Math.min(cw * 0.36, 18), ry = Math.min(ch * 0.24, 10);
    for (let k = 0; k < COLS * ROWS; k++) {
      const cx = (k % COLS + 0.5) * cw, cy = ((k / COLS | 0) + 0.5) * ch, t = gridSeats[k];
      if (k === selTable) { g.fillStyle = '#ececec'; g.fillRect(cx - cw / 2 + 2, cy - ch / 2 + 3, cw - 4, ch - 6); }
      const ink = k === selTable ? '#0b0b0b' : '#d8d8d8';
      g.strokeStyle = ink; g.lineWidth = 1.1;
      g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 7); g.stroke();
      // chips in the middle
      g.fillStyle = ink; const chips = 1 + (k * 7 + t.hot) % 4;
      for (let c = 0; c < chips; c++) g.fillRect(cx - chips * 1.5 + c * 3, cy - 1.5, 2, 3);
      for (let s = 0; s < 6; s++) {
        if (s >= t.live) continue;
        const a = (s / 6) * Math.PI * 2 - Math.PI / 2;
        const px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * ry;
        g.beginPath(); g.arc(px, py, s === t.hot ? 2.6 : 1.3, 0, 7); g.fill();
      }
    }
  }
  setInterval(() => {
    for (let k = 0; k < 14; k++) {
      const t = gridSeats[(rnd() * gridSeats.length) | 0];
      t.hot = (t.hot + 1) % 6; if (rnd() < 0.15) t.live = t.live <= 2 ? 6 : t.live - 1;
    }
  }, 120);
  grid.addEventListener('click', e => {
    const r = grid.getBoundingClientRect();
    selTable = ((e.clientY - r.top) / (r.height / ROWS) | 0) * COLS + ((e.clientX - r.left) / (r.width / COLS) | 0);
    newHand(); play();
  });

  /* ============================ featured table renderer ============================ */
  const POS = [[50, 9], [84, 20], [90, 72], [50, 90], [16, 72], [12, 20]];
  const POS_M = [[50, 8], [84, 22], [84, 72], [50, 91], [16, 72], [16, 22]];
  const seatsEl = $('#seats'), boardEl = $('#board'), potEl = $('#pot');
  const cardHTML = (c, cls = '') => c == null ? `<div class="card empty ${cls}"></div>` :
    `<div class="card ${cls} ${su(c) === 1 || su(c) === 2 ? 'red' : ''}"><span>${RANKS[rk(c)]}</span><span>${SUITS[su(c)]}</span></div>`;
  const ACT_WORD = { b: 'blind', X: 'check', C: 'call', B: 'bet', R: 'raise', A: 'all-in', F: 'fold' };

  let hand = null, step = 0, speed = 4, paused = false, timer = null, handNo = 0, dealer = 0, eqCache = null;
  function newHand() {
    dealer = (dealer + 1) % N; handNo++;
    hand = playHand(dealer, true); step = 0; eqCache = {};
    $('#tblno').textContent = String((selTable * 97 + 1201) % 9999).padStart(4, '0');
  }
  function equityAt(e) {
    const key = e.boardN + ':' + e.folded.join('');
    if (!eqCache[key]) eqCache[key] = tableEquity(hand.holes, e.folded.map(f => !f), hand.board.slice(0, e.boardN), 220);
    return eqCache[key];
  }
  function render() {
    const e = hand.ev[step], mobile = innerWidth < 720, P = mobile ? POS_M : POS;
    const eq = equityAt(e), last = e.t === 'act' ? e.seat : -1, end = e.t === 'win';
    $('#handinfo').textContent = `Hand ${String(handNo).padStart(6, '0')}, blinds 50/100`;
    $('#street').textContent = end ? (e.shown ? 'Showdown: ' + e.cat : 'Uncontested') : ['Preflop', 'Flop', 'Turn', 'River', 'Showdown'][e.street];
    boardEl.innerHTML = [0, 1, 2, 3, 4].map(k => cardHTML(k < e.boardN ? hand.board[k] : null, k < e.boardN && k >= (hand.ev[step - 1]?.boardN ?? 0) ? 'flip' : '')).join('');
    potEl.textContent = 'Pot ' + e.pot.toLocaleString('en-US');
    seatsEl.innerHTML = BOTS.map((b, i) => {
      const act = [...hand.ev.slice(0, step + 1)].reverse().find(x => x.t === 'act' && x.seat === i && x.street === e.street);
      let lbl = e.folded[i] ? 'fold' : act ? ACT_WORD[act.a] + (act.amt && act.a !== 'F' && act.a !== 'X' ? ' ' + (act.to || act.amt).toLocaleString('en-US') : '') : '';
      const won = end && e.winners.includes(i);
      if (won) lbl = 'wins ' + e.share.toLocaleString('en-US');
      const pct = e.folded[i] ? '--' : Math.round(eq[i] * 100) + '%';
      return `<div class="seat${e.folded[i] ? ' folded' : ''}${i === last ? ' turn' : ''}${b.ours ? ' ours' : ''}${won ? ' win' : ''}" style="left:${P[i][0]}%;top:${P[i][1]}%">` +
        `<div class="hole">${cardHTML(hand.holes[i][0], 'sm' + (e.folded[i] ? ' dead' : ''))}${cardHTML(hand.holes[i][1], 'sm' + (e.folded[i] ? ' dead' : ''))}</div>` +
        `<span class="nm">S${i + 1} ${b.id}${i === hand.dealer ? '<span class="btnd">D</span>' : ''}</span><br>` +
        `<span>${e.stack[i].toLocaleString('en-US')} &nbsp;${pct}</span>` +
        `<span class="eq"><i style="width:${e.folded[i] ? 0 : eq[i] * 100}%"></i></span><span class="act">${lbl}</span></div>`;
    }).join('');
    renderTimeline();
  }
  function renderTimeline() {
    const total = hand.ev.length - 1, X = k => (k / total) * 100;
    const upto = hand.ev.slice(0, step + 1);
    const streetMarks = [['Pre', 0]];
    hand.ev.forEach((e, k) => { if (e.t === 'street' && k <= step) streetMarks.push([['', 'Flop', 'Turn', 'River'][e.street], k]); });
    if (hand.ev[step].t === 'win') streetMarks.push(['Show', total]);
    let html = `<div class="tl-row"><span>Street</span><div class="tl-track"><div class="line" style="width:${X(step)}%"></div>` +
      streetMarks.map(([n, k]) => `<span class="st" style="left:${Math.max(3, Math.min(97, X(k)))}%">${n}</span>`).join('') + '</div></div>';
    BOTS.forEach((b, i) => {
      const mine = upto.map((e, k) => [e, k]).filter(([e]) => e.t === 'act' && e.seat === i);
      const foldAt = mine.find(([e]) => e.a === 'F');
      const endX = foldAt ? X(foldAt[1]) : X(step);
      const marks = mine.map(([e, k]) => `<span class="m" style="left:${Math.max(1, X(k))}%">${e.a}</span>`).join('');
      const win = hand.ev[step].t === 'win' && hand.ev[step].winners.includes(i) ? `<span class="m W" style="left:99%">W</span>` : '';
      html += `<div class="tl-row${foldAt ? ' dim' : ''}"><span>S${i + 1} ${b.id}</span><div class="tl-track"><div class="line" style="width:${endX}%"></div>${marks}${win}</div></div>`;
    });
    $('#timeline').innerHTML = html;
  }
  function advance() {
    if (step < hand.ev.length - 1) { step++; render(); return true; }
    return false;
  }
  function play() {
    clearTimeout(timer);
    if (paused) return;
    const atEnd = step >= hand.ev.length - 1;
    const next = hand.ev[step + 1];
    const delay = (atEnd ? 5200 : next && next.t === 'street' ? 2400 : 1500) / speed;
    timer = setTimeout(() => {
      if (!advance()) { record(hand); newHand(); render(); }
      play();
    }, Math.max(50, delay));
  }

  document.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => {
    speed = +b.dataset.s; document.querySelectorAll('[data-s]').forEach(x => x.classList.toggle('on', x === b)); play();
  }));
  document.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => {
    const c = b.dataset.c;
    if (c === 'pause') { paused = !paused; $('#pausebtn').textContent = paused ? '[play]' : '[pause]'; play(); }
    if (c === 'step') { paused = true; $('#pausebtn').textContent = '[play]'; if (!advance()) { record(hand); newHand(); render(); } play(); }
    if (c === 'restart') { step = 0; render(); play(); }
  }));

  /* run only while the arena is on screen */
  let visible = false;
  new IntersectionObserver(e => { visible = e[0].isIntersecting; }, { rootMargin: '200px' }).observe($('#exhibits'));
  setInterval(() => { if (visible && !document.hidden) background(); }, 40);
  setInterval(() => { if (visible) renderStats(); }, 500);
  (function gl() { if (visible) drawGrid(); setTimeout(() => requestAnimationFrame(gl), 90); })();

  // seed the standings so the leaderboard is meaningful on arrival
  for (let k = 0; k < 400; k++) record(playHand(k % N, false));
  newHand(); render(); renderStats(); play();
  window.addEventListener('resize', () => hand && render());
  window.__poker = { eval7, playHand, tableEquity };
})();
