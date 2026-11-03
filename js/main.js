/* Adway Aghor — portfolio. Plain JS, no dependencies. */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ------------------------------------------------------------------
   * Line markers: a dash in the margin for every visual line of every
   * .l element, per column. Side-by-side lines share one dash.
   * ------------------------------------------------------------------ */
  function buildGutters() {
    const lh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lh')) || 28;
    $$('.col').forEach(col => {
      let g = col.querySelector(':scope > .gutter');
      if (!g) { g = document.createElement('div'); g.className = 'gutter'; col.prepend(g); }
      const top0 = col.getBoundingClientRect().top;
      const frag = document.createDocumentFragment(), seen = new Set();
      $$('.l', col).forEach(el => {
        if (el.offsetParent === null) return;          // hidden (collapsed record)
        if (el.parentElement.closest('.l, .noguide')) return;
        if (el.closest('.col') !== col) return;          // belongs to a nested column
        const r = el.getBoundingClientRect();
        const lines = Math.max(1, Math.round(r.height / lh));
        for (let i = 0; i < lines; i++) {
          const top = Math.round(r.top - top0 + i * lh);
          if (seen.has(top)) continue;
          seen.add(top);
          const t = document.createElement('i');
          t.textContent = '-';
          t.style.top = top + 'px';
          frag.appendChild(t);
        }
      });
      g.replaceChildren(frag);
    });
  }
  window.rebuildGutters = buildGutters;
  let gt; const queueGutters = () => { clearTimeout(gt); gt = setTimeout(buildGutters, 60); };
  window.queueGutters = queueGutters;
  window.addEventListener('resize', queueGutters);
  document.fonts && document.fonts.ready.then(buildGutters);

  /* ------------------------------------------------------------------ Record toggles */
  $$('.rec').forEach(rec => {
    rec.querySelector('.btn').addEventListener('click', () => {
      rec.dataset.open = rec.dataset.open === 'true' ? 'false' : 'true';
      buildGutters();
    });
  });

  /* ------------------------------------------------------------------ Top bar: clock + active section */
  const clock = $('#clock');
  const tick = () => {
    const t = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false });
    clock.textContent = `Pune ${t} IST`;
  };
  tick(); setInterval(tick, 1000);
  const navLinks = $$('.tb-nav a');
  const sections = navLinks.map(a => $(a.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window) {
    const seenNow = new Map();
    const nio = new IntersectionObserver(es => {
      es.forEach(e => seenNow.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0));
      let best = null, bv = 0;
      seenNow.forEach((v, k) => { if (v > bv) { bv = v; best = k; } });
      navLinks.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + best));
    }, { threshold: [0, .15, .3, .5], rootMargin: '-44px 0px -35% 0px' });
    sections.forEach(s => nio.observe(s));
  }

  /* ------------------------------------------------------------------ Contents board: live values + tape */
  $('#bd-date').textContent = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const live = window.__live = window.__live || {};
  function refreshBoard() {
    if (live.hands != null) $('#bd-hands').textContent = live.hands.toLocaleString('en-US');
    if (live.fx) $('#bd-fx').textContent = live.fx;
    if (live.rag) $('#bd-rag').textContent = live.rag;
    const items = [
      `Arena: ${(live.hands || 0).toLocaleString('en-US')} hands dealt${live.leader ? ', leader ' + live.leader : ''}`,
      live.fxLong ? `FX: ${live.fxLong}` : 'FX: Garman-Kohlhagen vs Monte Carlo',
      live.ragLong ? `Router: ${live.ragLong}` : 'Router: naive / tree / graph / SQL / temporal',
      'Open to new-grad roles',
    ];
    const tape = $('#tape'), txt = items.join('   ◆   ') + '   ◆   ';
    if (tape.dataset.t !== txt && !tape.dataset.lock) { tape.textContent = txt; tape.dataset.t = txt; }
  }
  // the tape restarts its animation when text changes, so only refresh it once per loop
  $('#tape').addEventListener('animationiteration', () => { delete $('#tape').dataset.lock; refreshBoard(); $('#tape').dataset.lock = 1; });
  refreshBoard(); $('#tape').dataset.lock = 1;
  setInterval(() => {
    if (live.hands != null) $('#bd-hands').textContent = live.hands.toLocaleString('en-US');
    if (live.fx) $('#bd-fx').textContent = live.fx;
    if (live.rag) $('#bd-rag').textContent = live.rag;
  }, 500);

  /* ------------------------------------------------------------------ Works index */
  const WORKS = [
    ['Poker Bot', 'Game AI', '2026', 'In development', 'A no-limit hold\'em bot. Exhibit A is its test harness: a from-scratch engine, 7-card evaluator and opponent field.', 'C++, JavaScript, Monte Carlo equity', '#arena', ''],
    ['FX Options Pricer', 'Quant', '2026', 'Built at FinIQ', 'Prices FX options by Monte Carlo and checks them against the Garman-Kohlhagen closed form; also Black-Scholes and stochastic volatility. Multithreaded in C++. A browser port runs in Exhibit B.', 'C++, std::thread, Monte Carlo', '#fx', ''],
    ['Multi-RAG Router', 'Agentic AI', '2026', 'Team project', 'Five retrieval strategies behind one interface: naive vector RAG, tree RAG over a page index, Microsoft GraphRAG, SQL + RAG (our own design) and a temporal knowledge-graph RAG. A query router picks the right one per prompt. A live demo runs in Exhibit C.', 'Python, LLMs, GraphRAG, SQL, knowledge graphs', '#rag', ''],
    ['Firearm Detection', 'Computer vision', '2025', 'Shipped', 'CCTV-based weapon detection with Faster R-CNN, built during an academic internship at NUS, Singapore. Preprocessing, training, evaluation and inference pipeline.', 'PyTorch, Faster R-CNN', 'https://github.com/adwayaghor/cctv_weapon_detection', ''],
    ['ReliefLink', 'Mobile', '2025', '4th, national', 'Disaster management and relief app connecting citizens and NGOs: verified donations through secure payment gateways and real-time crisis information. 4th place at the AlphaByte national hackathon (GDGC PCCOE).', 'Flutter, Firebase', 'https://github.com/adwayaghor/relieflink', ''],
    ['CESA Anantya App', 'Mobile', '2025', 'Production', 'College event app: registration, marketing, ticket generation and administration, run for a live event.', 'Flutter, Firebase', '', ''],
    ['IR Cell Platform', 'Mobile', '2025', 'Production', 'Event and internship registration, alumni connect, QR attendance, biometric and RFID support, admin dashboards. Deployed for PCCOE\'s International Relations Cell.', 'Flutter, Riverpod, Firebase', 'https://github.com/adwayaghor/ircell', ''],
    ['NFC Verification', 'Security', '2025', 'Prototype', 'Secure NFC authentication using cryptographic challenge-response.', 'NFC, cryptography', '', ''],
    ['Club Management Suite', 'Product', '2024', 'Shipped', 'Club showcase, event coordination tools and dashboards for student organizations.', 'Flutter', 'https://drive.google.com/file/d/1pC9yAHw-9_SphNj0f2ash1Ad7XuQbi0s/view?usp=drive_link', ''],
    ['Intent Chatbot', 'NLP', '2024', 'Shipped', 'Intent-classification chatbot with a bag-of-words model served over Flask.', 'Python, Flask, NLTK', 'https://github.com/adwayaghor/flask-chatbot', ''],
  ];
  const works = $('#works-list');
  if (works) {
    works.innerHTML = '<div class="w hd"><span>No.</span><span>Title</span><span>Domain</span><span>Year</span></div>' +
      WORKS.map((w, i) => `<div class="w" data-i="${i}" tabindex="0"><span class="n">${String(i + 1).padStart(2, '0')}</span><span>${w[0]}</span><span>${w[1]}</span><span>${w[2]}</span></div>`).join('');
    const show = i => {
      const w = WORKS[i];
      $$('.w', works).forEach(e => e.classList.toggle('sel', e.dataset.i == i));
      $('#ro-title').textContent = `${String(i + 1).padStart(2, '0')}. ${w[0]}`;
      $('#ro-status').textContent = w[3];
      $('#ro-desc').textContent = w[4] + (w[7] ? ` (${w[7]}.)` : '');
      $('#ro-stack').textContent = 'Stack: ' + w[5];
      $('#ro-link').innerHTML = w[6]
        ? `<a class="ul" href="${w[6]}" ${w[6][0] === '#' ? '' : 'target="_blank" rel="noopener"'}>${w[6][0] === '#' ? 'Open the exhibit ↓' : 'Open source ↗'}</a>`
        : '<span class="dim">Source available on request</span>';
      queueGutters();
    };
    $$('.w[data-i]', works).forEach(e => {
      e.addEventListener('mouseenter', () => show(+e.dataset.i));
      e.addEventListener('focus', () => show(+e.dataset.i));
      e.addEventListener('click', () => { show(+e.dataset.i); const l = WORKS[+e.dataset.i][6]; if (l && l[0] === '#') location.hash = l; });
    });
    show(0);
  }

  /* ------------------------------------------------------------------ Contact form (EmailJS REST) */
  const form = $('#form');
  if (form) form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const fd = new FormData(form), st = $('#formstatus');
    let bad = false;
    $$('.field', form).forEach(f => f.classList.remove('err'));
    ['name', 'email', 'message'].forEach(k => {
      const v = (fd.get(k) || '').trim();
      if (!v || (k === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v))) { bad = true; form.elements[k].closest('.field').classList.add('err'); }
    });
    if (bad) { st.textContent = 'Incomplete particulars.'; return; }
    st.textContent = 'Transmitting...'; $('#send').disabled = true;
    const message = `[${fd.get('kind')}]${fd.get('org') ? ' (' + fd.get('org').trim() + ')' : ''}\n\n${fd.get('message').trim()}`;
    try {
      const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: 'service_p6550vh', template_id: 'template_bfqmk4l', user_id: 'v7ilZljiL5w65TgZg',
          template_params: { name: fd.get('name').trim(), email: fd.get('email').trim(), message },
        }),
      });
      if (!res.ok) throw new Error(res.status);
      form.reset(); st.textContent = 'Received. A reply will follow.';
    } catch (e) {
      st.textContent = 'Transmission failed. Use LinkedIn below.';
    } finally { $('#send').disabled = false; }
  });


  /* ------------------------------------------------------------------
   * Typed reveal: each line types itself in as it scrolls into view,
   * staggered top to bottom. Visual blocks fade in.
   * ------------------------------------------------------------------ */
  if (document.documentElement.classList.contains('anim') && 'IntersectionObserver' in window) {
    const lines = $$('.l, .works .w').filter(el => !el.parentElement.closest('.l'));
    const fades = $$('.board, .table-wrap, .grid, .fx-canvas, .rag-canvas');
    lines.forEach(el => el.classList.add('rv'));
    fades.forEach(el => el.classList.add('rv-fade'));
    let batch = [], flush = null;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { batch.push(e.target); io.unobserve(e.target); } });
      clearTimeout(flush);
      flush = setTimeout(() => {
        batch.sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return ra.top - rb.top || ra.left - rb.left; });
        batch.forEach((el, i) => {
          if (el.classList.contains('rv-fade')) { setTimeout(() => el.classList.add('in'), i * 40); return; }
          const len = Math.max(4, Math.min(70, (el.textContent || '').trim().length));
          el.style.setProperty('--st', len);
          el.style.setProperty('--dur', (0.12 + len * 0.009).toFixed(2) + 's');
          el.style.setProperty('--dl', Math.min(i * 0.045, 1.4).toFixed(2) + 's');
          el.classList.add('in');
          el.addEventListener('animationend', () => { el.classList.toggle('rv', false); el.classList.toggle('in', false); }, { once: true });
        });
        batch = [];
      }, 30);
    }, { rootMargin: '0px 0px -6% 0px' });
    lines.concat(fades).forEach(el => io.observe(el));
  }

  window.addEventListener('load', buildGutters);
  buildGutters();
})();
