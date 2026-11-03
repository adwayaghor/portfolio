/* Exhibit C: an illustrative SentinelAI message trace (client / edge proxy / model). */
(function () {
  'use strict';
  const msgs = document.getElementById('msgs');
  if (!msgs) return;
  const inner = document.createElement('div'); inner.className = 'msgs-inner'; msgs.appendChild(inner);
  const X = [100 / 6, 50, 500 / 6];

  // [ms, kind, a, b, label, cls]  kind: s=send, r=reply(dashed), k=scan box at lane a, d=divider
  const SCENARIOS = [
    { name: 'benign', steps: [
      [0, 's', 0, 1, 'PROMPT "SUMMARIZE THE Q3 VENDOR REPORT"'],
      [1, 'k', 1, 0, 'SCAN  INJ .03  JB .01  PII 0', 'ok'],
      [7, 's', 1, 2, 'FORWARD, POLICY: ALLOW'],
      [612, 'r', 2, 1, 'COMPLETION 412 TOK  605 MS'],
      [614, 'k', 1, 0, 'OUTPUT FILTER  PASS', 'ok'],
      [617, 's', 1, 0, 'RESPONSE 200'],
      [617, 'd', 0, 0, 'END REQUEST: ALLOWED, ADDED 10 MS'],
    ], added: 10 },
    { name: 'direct', steps: [
      [0, 's', 0, 1, 'PROMPT "IGNORE ALL PREVIOUS INSTRUCTIONS..."'],
      [1, 'k', 1, 0, 'SCAN  INJ .97  JAILBREAK PATTERN', 'bad'],
      [6, 's', 1, 0, '403 POLICY: PROMPT_INJECTION', 'bad'],
      [6, 'd', 0, 0, 'END REQUEST: BLOCKED PRE-EXECUTION. MODEL NEVER CALLED.'],
    ], added: 6 },
    { name: 'indirect', steps: [
      [0, 's', 0, 1, 'PROMPT "SUMMARIZE THE ATTACHED EMAIL"'],
      [1, 'k', 1, 0, 'SCAN PROMPT  INJ .02', 'ok'],
      [3, 'k', 1, 0, 'SCAN ATTACHMENT  HIDDEN INSTRUCTION AT L.41', 'bad'],
      [9, 'k', 1, 0, 'STRIP SPAN, QUARANTINE, LOG', 'ok'],
      [11, 's', 1, 2, 'FORWARD SANITIZED CONTEXT'],
      [540, 'r', 2, 1, 'COMPLETION 288 TOK  529 MS'],
      [543, 'k', 1, 0, 'OUTPUT FILTER  NO EXFIL URLS', 'ok'],
      [546, 's', 1, 0, 'RESPONSE 200 + ADVISORY'],
      [546, 'd', 0, 0, 'END REQUEST: SANITIZED, ADDED 17 MS'],
    ], added: 17 },
    { name: 'pii', steps: [
      [0, 's', 0, 1, 'PROMPT "DRAFT A MAIL TO R. RAO, PAN ABCDE1234F"'],
      [1, 'k', 1, 0, 'SCAN  INJ .01  PII: GOV ID', 'bad'],
      [4, 'k', 1, 0, 'REDACT  PAN -> [ID_1]', 'ok'],
      [5, 's', 1, 2, 'FORWARD REDACTED'],
      [431, 'r', 2, 1, 'COMPLETION 190 TOK  426 MS'],
      [433, 's', 1, 0, 'RESPONSE 200, [ID_1] RESTORED'],
      [433, 'd', 0, 0, 'END REQUEST: REDACTED, ADDED 7 MS'],
    ], added: 7 },
  ];

  let sc = 0, st = 0, req = 1, paused = false, timer;
  const fmt = ms => '+' + (ms / 1000).toFixed(3);
  function add(stepDef) {
    const [ms, kind, a, b, label, cls] = stepDef;
    const m = document.createElement('div');
    m.className = 'msg' + (kind === 'd' ? ' div' : '');
    if (kind === 'd') m.innerHTML = `<span class="lbl">${label}</span>`;
    else if (kind === 'k') m.innerHTML = `<span class="ts">${fmt(ms)}</span><span class="box" style="left:${X[a]}%"></span>` +
      `<span class="lbl ${cls || ''}" style="left:calc(${X[a]}% + 10px);transform:none;top:6px">${label}</span>`;
    else {
      const l = Math.min(X[a], X[b]), w = Math.abs(X[a] - X[b]);
      m.innerHTML = `<span class="ts">${fmt(ms)}</span><span class="arrow ${kind === 'r' ? 'dash' : ''} ${b > a ? 'r' : 'lft'}" style="left:${l}%;width:${w}%"></span>` +
        `<span class="lbl ${cls || ''}" style="left:${l + w / 2}%">${label}</span>`;
    }
    inner.appendChild(m);
    while (inner.children.length > 14) inner.firstChild.remove();
  }
  function tick() {
    clearTimeout(timer);
    if (paused) return;
    const s = SCENARIOS[sc];
    add(s.steps[st]);
    document.getElementById('tr-req').textContent = 'Request ' + String(req).padStart(4, '0') + ', ' + s.name;
    document.getElementById('tr-meta').textContent = 'Added latency: ' + (st === s.steps.length - 1 ? s.added : '..') + ' ms';
    st++;
    let wait = 900;
    if (st >= s.steps.length) { st = 0; sc = (sc + 1) % SCENARIOS.length; req++; wait = 2000; }
    timer = setTimeout(tick, wait);
  }
  const btn = document.getElementById('tracepause');
  btn.addEventListener('click', () => { paused = !paused; btn.textContent = paused ? '[play]' : '[pause]'; tick(); });
  let started = false;
  new IntersectionObserver(e => { if (e[0].isIntersecting && !started) { started = true; tick(); } }).observe(msgs);
})();
