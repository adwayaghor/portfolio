/* Adway Aghor — portfolio. Plain JS, no dependencies. */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ------------------------------------------------------------------
   * Line-number gutter: one number per visual line of every .l element,
   * continuing across sections, like a numbered legal document.
   * ------------------------------------------------------------------ */
  function buildGutters() {
    let n = 0;
    const lh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lh')) || 28;
    $$('.col').forEach(col => {
      let g = col.querySelector(':scope > .gutter');
      if (!g) { g = document.createElement('div'); g.className = 'gutter'; col.prepend(g); }
      const top0 = col.getBoundingClientRect().top;
      const frag = document.createDocumentFragment();
      $$('.l', col).forEach(el => {
        if (el.offsetParent === null) return;           // hidden (collapsed record)
        if (el.parentElement.closest('.l')) return;      // nested
        const r = el.getBoundingClientRect();
        const lines = Math.max(1, Math.round(r.height / lh));
        for (let i = 0; i < lines; i++) {
          const t = document.createElement('i');
          t.textContent = ++n;
          t.style.top = (r.top - top0 + i * lh) + 'px';
          frag.appendChild(t);
        }
      });
      g.replaceChildren(frag);
    });
  }
  window.rebuildGutters = buildGutters;
  let gt; const queueGutters = () => { clearTimeout(gt); gt = setTimeout(buildGutters, 60); };
  window.addEventListener('resize', queueGutters);
  document.fonts && document.fonts.ready.then(buildGutters);

  /* ------------------------------------------------------------------ Record toggles */
  $$('.rec').forEach(rec => {
    rec.querySelector('.btn').addEventListener('click', () => {
      rec.dataset.open = rec.dataset.open === 'true' ? 'false' : 'true';
      buildGutters();
    });
  });

  /* ------------------------------------------------------------------ Dot-matrix map */
  const PLACES = [
    { name: 'PUNE', lat: 18.52, lon: 73.86, note: 'BASE' },
    { name: 'NASHIK', lat: 20.0, lon: 73.79, note: 'CYBER POLICE', dy: -1 },
    { name: 'SINGAPORE', lat: 1.35, lon: 103.82, note: 'NUS' },
  ];
  function drawMap(t) {
    const cv = $('#map'); if (!cv || !window.WORLD_MAP) return;
    const rows = window.WORLD_MAP.slice(0, 54), H = rows.length, W = rows[0].length;
    const cw = cv.clientWidth, step = cw / W, ch = Math.round(H * step);
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(cw * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); cv.style.height = ch + 'px'; }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    const r = Math.max(0.7, step * 0.2);
    const toXY = (lat, lon) => [((lon + 170) / 340) * (W - 1) * step + step / 2, ((78 - lat) / 134) * 59 * step + step / 2];
    const pts = PLACES.map(p => toXY(p.lat, p.lon));
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      if (rows[j][i] !== '1') continue;
      const x = i * step + step / 2, y = j * step + step / 2;
      // a slow wave radiating from Pune
      const d = Math.hypot(x - pts[0][0], y - pts[0][1]) / step;
      const wave = Math.max(0, Math.cos((d - t / 90) / 3)) ** 12;
      g.fillStyle = `rgba(17,17,17,${0.16 + wave * 0.45})`;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    // arc Pune -> Singapore
    const [a, b] = [pts[0], pts[2]];
    g.strokeStyle = '#111'; g.lineWidth = 1; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(a[0], a[1]);
    g.quadraticCurveTo((a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 10 * step, b[0], b[1]); g.stroke(); g.setLineDash([]);
    g.font = `500 ${Math.max(9, step * 1.6)}px "IBM Plex Mono", monospace`;
    PLACES.forEach((p, k) => {
      const [x, y] = pts[k];
      const pulse = (t / 1400 + k * 0.3) % 1;
      g.strokeStyle = `rgba(17,17,17,${1 - pulse})`;
      g.beginPath(); g.arc(x, y, 3 + pulse * step * 3, 0, 7); g.stroke();
      g.fillStyle = '#111'; g.fillRect(x - 3, y - 3, 6, 6);
      if (k === 1) return;
      const label = p.name + (k === 0 ? ' / NASHIK' : '') + '  ' + (k === 0 ? 'BASE' : p.note);
      const tw = g.measureText(label).width;
      const lx = k === 0 ? x - tw - 14 : x + 12, ly = y + (k === 0 ? -8 : 14);
      g.fillStyle = '#111'; g.fillRect(lx - 5, ly - 11, tw + 10, 16);
      g.fillStyle = '#fff'; g.fillText(label, lx, ly + 1);
    });
  }
  let mapVisible = true;
  const mapEl = $('#map');
  if (mapEl && 'IntersectionObserver' in window) new IntersectionObserver(e => { mapVisible = e[0].isIntersecting; }).observe(mapEl);
  (function loop(t) { if (mapVisible) drawMap(t); requestAnimationFrame(loop); })(0);

  /* ------------------------------------------------------------------ Works index */
  const WORKS = [
    ['SentinelAI', 'LLM security', '2026', 'In progress', 'Edge-deployed security proxy for enterprise AI chatbots. Detects and blocks prompt injection and jailbreaks, including indirect injection, before the model executes. Unified detection, filtering and policy layer; design target under 100 ms added latency.', 'Python, LLM security, edge deployment', '', 'B.Tech final-year project'],
    ['Poker Bot', 'Game AI', '2026', 'In development', 'A no-limit hold\'em bot. The arena in Exhibit B is its test harness: a from-scratch engine, 7-card evaluator, and opponent field.', 'C++, JavaScript, Monte Carlo equity', '#arena', ''],
    ['RouteRAG', 'Agentic AI', '2026', 'Group, G4', 'Comparative analysis of retrieval-augmented generation techniques, with an LLM-as-judge router that picks a RAG strategy per query.', 'Python, LLMs, vector search', '', 'Agentic AI course, with A. Atre and A. Bhujang'],
    ['LiTracer', 'NLP', '2026', 'Prototype', 'Literary authorship verification. Compares a disputed text against an author\'s style using a local LLM.', 'Python, Streamlit, Ollama (Qwen3 8B)', '', ''],
    ['Lit2Comic', 'Generative AI', '2026', 'In progress', 'AI-assisted adaptation of literary text into comic panels: scene segmentation, scripting and image generation.', 'Python, LLMs, image generation', '', 'English MDM project'],
    ['Incident Coordination Net', 'Distributed sys', '2026', 'Mini project', 'Disaster-resilient incident coordination network that keeps nodes coordinating through partial failures.', 'Distributed systems', 'https://github.com/adwayaghor/dsminiproject', 'With G. Shende'],
    ['Firearm Detection', 'Computer vision', '2025', 'Shipped', 'CCTV-based weapon detection with Faster R-CNN, built during an academic internship at NUS, Singapore. Preprocessing, training, evaluation and inference pipeline.', 'PyTorch, Faster R-CNN', 'https://github.com/adwayaghor/cctv_weapon_detection', ''],
    ['ReliefLink', 'Mobile', '2025', '4th, national', 'Disaster management and relief app connecting citizens and NGOs: verified donations through secure payment gateways and real-time crisis information. 4th place at the AlphaByte national hackathon (GDGC PCCOE).', 'Flutter, Firebase', 'https://github.com/adwayaghor/relieflink', ''],
    ['CESA Anantya App', 'Mobile', '2025', 'Production', 'End-to-end event app for CESA\'s Anantya: registration, attendance tracking and marketing, built and run for a live college event.', 'Flutter, Firebase', '', ''],
    ['IR Cell Platform', 'Mobile', '2025', 'Production', 'Event and internship registration, alumni connect, QR attendance, biometric and RFID support, admin dashboards. Deployed for PCCOE\'s International Relations Cell.', 'Flutter, Riverpod, Firebase', 'https://github.com/adwayaghor/ircell', ''],
    ['NFC Verification', 'Security', '2025', 'Prototype', 'Secure NFC authentication using cryptographic challenge-response.', 'NFC, cryptography', '', ''],
    ['Club Management Suite', 'Product', '2024', 'Shipped', 'Club showcase, event coordination tools and dashboards for student organizations.', 'Flutter', 'https://drive.google.com/file/d/1pC9yAHw-9_SphNj0f2ash1Ad7XuQbi0s/view?usp=drive_link', ''],
    ['Intent Chatbot', 'NLP', '2024', 'Shipped', 'Intent-classification chatbot with a bag-of-words model served over Flask.', 'Python, Flask, NLTK', 'https://github.com/adwayaghor/flask-chatbot', ''],
  ];
  const works = $('#works');
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
        ? `<a class="ul" href="${w[6]}" ${w[6][0] === '#' ? '' : 'target="_blank" rel="noopener"'}>${w[6][0] === '#' ? 'Open in Exhibit B ↓' : 'Open source ↗'}</a>`
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
   * staggered top to bottom. Visuals (map, tables, trace) fade in.
   * ------------------------------------------------------------------ */
  if (document.documentElement.classList.contains('anim') && 'IntersectionObserver' in window) {
    const lines = $$('.l, .works .w').filter(el => !el.parentElement.closest('.l'));
    const fades = $$('.map-wrap, .table-wrap, .trace, .grid');
    lines.forEach(el => el.classList.add('rv'));
    fades.forEach(el => el.classList.add('rv-fade'));
    let batch = [], flush = null;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { batch.push(e.target); io.unobserve(e.target); } });
      clearTimeout(flush);
      flush = setTimeout(() => {
        batch.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        batch.forEach((el, i) => {
          if (el.classList.contains('rv-fade')) { setTimeout(() => el.classList.add('in'), i * 40); return; }
          const len = Math.max(4, Math.min(70, (el.textContent || '').trim().length));
          el.style.setProperty('--st', len);
          el.style.setProperty('--dur', (0.12 + len * 0.009).toFixed(2) + 's');
          el.style.setProperty('--dl', Math.min(i * 0.055, 1.6).toFixed(2) + 's');
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
