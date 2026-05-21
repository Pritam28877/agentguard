/* =========================================================================
   AgentGuard Demo — per-scene animations driven by IntersectionObserver
   Each scene plays its animation ONCE when it enters viewport.
   ========================================================================= */

(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Top progress rail ---------- */
  const progressFill = document.getElementById('scroll-progress');
  function updateProgress() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
    progressFill.style.width = pct + '%';
  }
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);
  updateProgress();

  /* ---------- Helper: animate counter ---------- */
  function counter(el, target, duration = 1200) {
    if (reduceMotion) { el.textContent = target.toLocaleString(); return; }
    const start = performance.now();
    const ease = x => 1 - Math.pow(1 - x, 3);
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      el.textContent = Math.round(target * ease(t)).toLocaleString();
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- Helper: type into terminal ---------- */
  function typeInto(el, lines, opts = {}) {
    const { typeSpeed = 18, lineDelay = 220 } = opts;
    return new Promise(resolve => {
      let i = 0;
      function nextLine() {
        if (i >= lines.length) { resolve(); return; }
        const { html, instant } = lines[i++];
        if (instant) {
          const span = document.createElement('span');
          span.innerHTML = html + '\n';
          el.appendChild(span);
          el.scrollTop = el.scrollHeight;
          setTimeout(nextLine, lineDelay);
          return;
        }
        // Type out char by char
        const span = document.createElement('span');
        el.appendChild(span);
        let j = 0;
        function nextChar() {
          if (j >= html.length) {
            el.appendChild(document.createTextNode('\n'));
            el.scrollTop = el.scrollHeight;
            setTimeout(nextLine, lineDelay);
            return;
          }
          // Honor HTML tags as atomic units to avoid breaking <span>...</span>
          if (html[j] === '<') {
            const close = html.indexOf('>', j);
            if (close !== -1) {
              span.innerHTML = html.slice(0, close + 1);
              j = close + 1;
            } else {
              j++;
            }
          } else {
            j++;
          }
          span.innerHTML = html.slice(0, j);
          el.scrollTop = el.scrollHeight;
          setTimeout(nextChar, typeSpeed);
        }
        nextChar();
      }
      nextLine();
    });
  }

  /* ---------- Once-per-scene observer ---------- */
  const sceneObservers = new Map();
  function onceWhenVisible(id, callback) {
    const el = document.getElementById(id);
    if (!el) return;
    if (reduceMotion) { callback(el); return; }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          callback(el);
          io.unobserve(el);
        }
      });
    }, { threshold: 0.25 });
    io.observe(el);
    sceneObservers.set(id, io);
  }

  /* ====================================================================
     UX SCENE 1 — TERMINAL: install + analyze
     ==================================================================== */
  onceWhenVisible('ux-1', () => {
    const term = document.getElementById('ux-term-1');
    if (!term) return;
    typeInto(term, [
      { html: '<span class="dim">$</span> <span class="prompt">pip install</span> agentguard' },
      { html: '<span class="ok">✓</span> agentguard 0.1.0 installed (47 dependencies)', instant: true },
      { html: '' , instant: true },
      { html: '<span class="dim">$</span> <span class="prompt">agentguard analyze</span> \\\n  --brd ./docs/refund-agent.md \\\n  --agent ./agents/refund/' },
      { html: '<span class="dim">[14:02:01]</span> reading spec · 4 sections, 312 lines', instant: true },
      { html: '<span class="dim">[14:02:08]</span> parsing agent source · 12 files, 1,847 lines', instant: true },
      { html: '<span class="dim">[14:02:14]</span> extracting behavior model · claude-sonnet · prompt-cached', instant: true },
      { html: '<span class="dim">[14:02:47]</span> <span class="ok">✓</span> 4 intents · 3 tools · 5 entities · 5 rules', instant: true },
      { html: '<span class="dim">[14:02:48]</span> wrote agentguard/model.yml · confidence 0.94', instant: true },
      { html: '', instant: true },
      { html: '<span class="lbl">→</span> next: <span class="prompt">agentguard explore</span> <span class="caret"></span>', instant: true },
    ]);
  });

  /* ====================================================================
     UX SCENE 2 — ABM chips stagger in
     ==================================================================== */
  onceWhenVisible('ux-2', () => {
    document.querySelectorAll('#ux-abm .abm-chip').forEach(chip => {
      const d = parseInt(chip.dataset.delay || '0', 10);
      setTimeout(() => chip.classList.add('in'), d);
    });
  });

  /* ====================================================================
     UX SCENE 3 — Exploration dashboard
     ==================================================================== */
  onceWhenVisible('ux-3', () => {
    const fill = document.getElementById('run-fill');
    const count = document.getElementById('run-count');
    const time = document.getElementById('run-time');
    const feed = document.getElementById('run-feed');
    const sPass = document.getElementById('rs-pass');
    const sFail = document.getElementById('rs-fail');
    const sClusters = document.getElementById('rs-clusters');
    const sScore = document.getElementById('rs-score');

    let i = 0;
    const total = 214;
    let pass = 0, fail = 0;
    const start = Date.now();

    const passNames = [
      'happy_path · 11 calls',
      'approval_above_threshold',
      'partial_refund_request',
      'duplicate_request_detected',
      'cross_tool_state_sync',
      'channel_lookup_by_email',
      'webhook_first_delivery',
      'idempotent_retry_after_429',
    ];
    const failNames = [
      'dup_refund_timeout_after_success',
      'dup_refund_high_latency',
      'threshold_off_by_unit_cents',
      'wrong_customer_email_collision',
      'pii_in_external_channel',
      'duplicate_webhook_double_action',
      'cross_tenant_ticket_resolve',
    ];

    function fmt(n) { const m = String(Math.floor(n/60)).padStart(2,'0'); const s = String(n%60).padStart(2,'0'); return m+':'+s; }
    function tick() {
      i++;
      const isFail = Math.random() < 0.21;
      if (isFail) fail++; else pass++;

      const pct = (i / total) * 100;
      fill.style.width = pct.toFixed(1) + '%';
      count.textContent = i + ' / ' + total + ' scenarios · 8 workers';
      sPass.textContent = pass.toLocaleString();
      sFail.textContent = fail.toLocaleString();
      if (i > 30) sClusters.textContent = Math.min(4, Math.ceil(fail / 11)).toString();
      if (i > 60) sScore.textContent = Math.min(96, Math.round(60 + fail * 1.6)).toString();

      const t = Math.floor((Date.now() - start) / 1000);
      time.textContent = '0:' + String(t).padStart(2,'0');

      const line = document.createElement('div');
      line.className = 'run-line';
      const sigLabels = ['SCN-' + (1200 + i).toString()];
      const name = isFail ? failNames[Math.floor(Math.random()*failNames.length)]
                          : passNames[Math.floor(Math.random()*passNames.length)];
      line.innerHTML =
        '<span class="t">[0:' + String(t).padStart(2,'0') + ']</span>' +
        '<span class="b">' + sigLabels[0] + '</span>' +
        '<span class="s ' + (isFail ? 'fail' : 'pass') + '">' + (isFail ? 'FAIL' : 'PASS') + '</span>' +
        '<span class="b">' + name + '</span>';
      feed.appendChild(line);
      while (feed.children.length > 12) feed.removeChild(feed.firstChild);

      if (i < total) {
        const delay = 35 + Math.random() * 80;
        setTimeout(tick, delay);
      }
    }
    setTimeout(tick, 300);
  });

  /* ====================================================================
     UX SCENE 4 — Cluster causes (bar fills + pct counters)
     ==================================================================== */
  onceWhenVisible('ux-4', () => {
    document.querySelectorAll('#ux-4 .cause').forEach((row, idx) => {
      setTimeout(() => {
        const pctEl = row.querySelector('.pct');
        const fillEl = row.querySelector('.bar-fill');
        const target = parseInt(pctEl.dataset.pct, 10);
        counter({ set textContent(v){ pctEl.textContent = v + '%'; } }, target, 1400);
        requestAnimationFrame(() => { fillEl.style.width = (parseInt(fillEl.dataset.fill, 10)) + '%'; });
      }, idx * 220);
    });
  });

  /* ====================================================================
     UX SCENE 5 — PR mockup (no extra animation; section reveal is enough)
     ==================================================================== */

  /* ====================================================================
     ENGINE SCENE 1 — Spec ingest: tokens stagger in
     ==================================================================== */
  onceWhenVisible('eng-1', () => {
    document.querySelectorAll('#extractor-pane .tok').forEach(tok => {
      const d = parseInt(tok.dataset.d || '0', 10);
      setTimeout(() => tok.classList.add('in'), d);
    });
  });

  /* ====================================================================
     ENGINE SCENE 2 — ABM graph: nodes + edges
     ==================================================================== */
  onceWhenVisible('eng-2', () => {
    document.querySelectorAll('#graph-stage .graph-node').forEach(n => {
      const d = parseInt(n.dataset.d || '0', 10);
      setTimeout(() => n.classList.add('in'), d);
    });
    // Stagger edge draw via inline animation-delay
    document.querySelectorAll('#graph-stage .graph-edge').forEach(e => {
      const d = parseInt(e.dataset.d || '0', 10);
      e.style.animationDelay = d + 'ms';
    });
  });

  /* ====================================================================
     ENGINE SCENE 3 — Synthesis: counters + canvas explosion
     ==================================================================== */
  onceWhenVisible('eng-3', () => {
    // Axis tick counters
    document.querySelectorAll('#eng-3 .synth-axis .count').forEach((el, idx) => {
      const n = parseInt(el.dataset.n, 10);
      setTimeout(() => counter(el, n, 700), idx * 100);
    });

    // Footer counters
    setTimeout(() => {
      counter(document.getElementById('synth-gen'), 8427, 1800);
      counter(document.getElementById('synth-uniq'), 214, 1800);
      counter(document.getElementById('synth-dropped'), 8213, 1800);
    }, 600);

    // Canvas: explosion of dots collapsing into a tight cluster
    const cv = document.getElementById('synth-canvas');
    if (!cv || reduceMotion) return;
    const ctx = cv.getContext('2d');
    let W, H, dpr;
    const dots = [];
    const css = getComputedStyle(document.documentElement);
    function resize() {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = r.width * dpr; cv.height = r.height * dpr;
      cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
      W = cv.width; H = cv.height;
      init();
    }
    function init() {
      dots.length = 0;
      const N = 600;
      for (let i = 0; i < N; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * Math.min(W, H) * 0.5;
        dots.push({
          x: W/2 + Math.cos(a) * r * 1.4,
          y: H/2 + Math.sin(a) * r * 0.9,
          tx: 0, ty: 0,
          critical: Math.random() < 0.04,
        });
      }
      // Targets in 6 tight clusters
      dots.forEach((d, i) => {
        const c = i % 6;
        const cx = W * (0.18 + 0.13 * c + (c % 2 ? 0.04 : 0));
        const cy = H * (c < 3 ? 0.35 : 0.65);
        const rr = (10 + Math.random() * 18) * dpr;
        const a = Math.random() * Math.PI * 2;
        d.tx = cx + Math.cos(a) * rr;
        d.ty = cy + Math.sin(a) * rr;
      });
    }
    function read() {
      return {
        INK: css.getPropertyValue('--ink').trim() || '#0a0a0a',
        ACCENT: css.getPropertyValue('--accent').trim() || '#ff3b2f',
        LINE: css.getPropertyValue('--line').trim() || '#e6e5e0',
        BG: css.getPropertyValue('--bg-2').trim() || '#fff',
      };
    }
    let raf = null;
    function frame() {
      const { INK, ACCENT, LINE, BG } = read();
      ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.globalAlpha = .35;
      const step = 36 * dpr;
      for (let x = 0; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      ctx.globalAlpha = 1;
      let moving = false;
      dots.forEach(d => {
        d.x += (d.tx - d.x) * 0.055;
        d.y += (d.ty - d.y) * 0.055;
        if (Math.abs(d.tx - d.x) > 0.5) moving = true;
        ctx.fillStyle = d.critical ? ACCENT : INK;
        ctx.globalAlpha = .85;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 1.6 * dpr, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    resize();
    raf = requestAnimationFrame(frame);

    // Periodically re-scatter to keep the animation alive
    setInterval(() => {
      dots.forEach(d => {
        d.x = W/2 + (Math.random() - 0.5) * W;
        d.y = H/2 + (Math.random() - 0.5) * H;
      });
    }, 5200);
  });

  /* ====================================================================
     ENGINE SCENE 4 — Workers + clones (already CSS-animated; cycle states)
     ==================================================================== */
  onceWhenVisible('eng-4', () => {
    const workers = document.querySelectorAll('#eng-4 .worker');
    if (reduceMotion) return;
    setInterval(() => {
      workers.forEach(w => {
        // Randomly cycle one worker between busy/idle
        if (Math.random() < 0.18) {
          w.classList.toggle('busy');
          w.classList.toggle('idle');
          const stateEl = w.querySelector('.state');
          if (w.classList.contains('idle')) {
            stateEl.textContent = 'idle';
          } else {
            const sid = 1200 + Math.floor(Math.random() * 200);
            stateEl.textContent = 'scenario ' + sid;
          }
        }
      });
    }, 1100);
  });

  /* ====================================================================
     ENGINE SCENE 5 — Clustering canvas (loop)
     ==================================================================== */
  onceWhenVisible('eng-5', () => {
    const cv = document.getElementById('cluster-anim');
    if (!cv || reduceMotion) return;
    const ctx = cv.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    let W, H, dpr;
    let points = []; let centers = [];
    let phase = 0; let phaseStart = performance.now();

    function read() {
      return {
        INK: css.getPropertyValue('--ink').trim() || '#0a0a0a',
        ACCENT: css.getPropertyValue('--accent').trim() || '#ff3b2f',
        MUTED: css.getPropertyValue('--muted').trim() || '#6b6b6b',
        LINE: css.getPropertyValue('--line').trim() || '#e6e5e0',
        BG: css.getPropertyValue('--bg-2').trim() || '#fff',
      };
    }
    function resize() {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = r.width * dpr; cv.height = r.height * dpr;
      cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
      W = cv.width; H = cv.height;
      init();
    }
    function init() {
      points = []; centers = [];
      const C = 9;
      for (let i = 0; i < C; i++) {
        centers.push({
          x: W * (0.14 + 0.72 * Math.random()),
          y: H * (0.18 + 0.64 * Math.random()),
          n: 0,
        });
      }
      const N = 600;
      for (let i = 0; i < N; i++) {
        const c = i % C;
        centers[c].n++;
        const cc = centers[c];
        const rr = (8 + Math.random() * 22) * dpr;
        const a = Math.random() * Math.PI * 2;
        points.push({
          x: Math.random() * W, y: Math.random() * H,
          tx: cc.x + Math.cos(a) * rr,
          ty: cc.y + Math.sin(a) * rr,
          cluster: c,
          crit: c === 0 || c === 3,
        });
      }
      phase = 0; phaseStart = performance.now();
    }
    function draw(now) {
      const t = (now - phaseStart) / 1000;
      const { INK, ACCENT, MUTED, LINE, BG } = read();
      ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.globalAlpha = .4;
      const step = 36 * dpr;
      for (let x = 0; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      ctx.globalAlpha = 1;
      points.forEach(p => {
        if (phase < 2) {
          p.x += (p.tx - p.x) * 0.05;
          p.y += (p.ty - p.y) * 0.05;
        }
        ctx.fillStyle = p.crit ? ACCENT : INK;
        ctx.globalAlpha = .85;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.7 * dpr, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      if (phase >= 1) {
        centers.forEach((c, i) => {
          const crit = (i === 0 || i === 3);
          ctx.strokeStyle = crit ? ACCENT : INK;
          ctx.lineWidth = 1 * dpr;
          ctx.setLineDash([4 * dpr, 4 * dpr]);
          ctx.beginPath();
          ctx.arc(c.x, c.y, 34 * dpr, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = crit ? ACCENT : MUTED;
          ctx.font = (10.5 * dpr) + 'px Geist Mono, monospace';
          ctx.fillText('#' + String(i + 1).padStart(2, '0') + ' · ' + c.n, c.x + 40 * dpr, c.y + 4 * dpr);
        });
      }
      if (phase === 0 && t > 2.2) { phase = 1; phaseStart = now; }
      if (phase === 1 && t > 3.0) { phase = 2; phaseStart = now; }
      if (phase === 2 && t > 4.0) { init(); }
      requestAnimationFrame(draw);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    resize();
    requestAnimationFrame(draw);
  });

  /* ====================================================================
     ENGINE SCENE 6 — Root cause ranker
     ==================================================================== */
  onceWhenVisible('eng-6', () => {
    document.querySelectorAll('#ranker .hyp').forEach((h, idx) => {
      setTimeout(() => {
        const scoreEl = h.querySelector('.score');
        const fillEl = h.querySelector('.hyp-bar-fill');
        const target = parseInt(scoreEl.dataset.s, 10);
        counter({ set textContent(v){ scoreEl.textContent = v + '%'; } }, target, 1200);
        requestAnimationFrame(() => { fillEl.style.width = (parseInt(fillEl.dataset.fill, 10)) + '%'; });
      }, idx * 280);
    });
  });

})();
