/* =========================================================================
   AgentGuard — Landing interactions
   - Custom cursor with magnetic links
   - CSS-3D Rubik's cube generator (27 cubelets, 6 axes labeled)
   - Canvas scenario-clustering animation (8000 -> 214)
   - Reveal-on-scroll
   - Animated counters
   - Waitlist form
   ========================================================================= */

(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = window.matchMedia('(hover: none)').matches;

  /* ---------- Theme: detect, persist, toggle ---------- */
  const THEME_KEY = 'agentguard.theme';
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)');

  function applyTheme(theme, persist) {
    document.documentElement.setAttribute('data-theme', theme);
    if (persist) {
      try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
    }
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  }

  // Theme was already set inline in <head> to avoid FOUC. Now wire the toggle.
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
    });
  }

  // Follow system preference if user hasn't picked one.
  sysDark.addEventListener?.('change', e => {
    try {
      if (!localStorage.getItem(THEME_KEY)) {
        applyTheme(e.matches ? 'dark' : 'light', false);
      }
    } catch (_) {}
  });

  // Enable smooth color transitions only AFTER first paint, to avoid flashes.
  requestAnimationFrame(() => {
    document.documentElement.classList.add('theme-ready');
    document.body.classList.add('theme-ready');
  });

  /* ---------- Custom cursor ---------- */
  const cursor = document.querySelector('.cursor');
  const dot = document.querySelector('.cursor-dot');

  if (!isTouch && cursor && dot) {
    let tx = 0, ty = 0, cx = 0, cy = 0, dx = 0, dy = 0;
    document.addEventListener('mousemove', e => {
      tx = e.clientX; ty = e.clientY;
      dx = tx; dy = ty;
    });

    const tick = () => {
      cx += (tx - cx) * 0.18;
      cy += (ty - cy) * 0.18;
      cursor.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
      dot.style.transform = `translate(${dx}px, ${dy}px) translate(-50%, -50%)`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const hoverables = document.querySelectorAll('a, button, [data-magnetic], input, .fail, .stage, .ch');
    hoverables.forEach(el => {
      el.addEventListener('mouseenter', () => cursor.classList.add('hover'));
      el.addEventListener('mouseleave', () => cursor.classList.remove('hover'));
    });

    // Magnetic effect
    document.querySelectorAll('[data-magnetic]').forEach(el => {
      el.addEventListener('mousemove', e => {
        const r = el.getBoundingClientRect();
        const mx = e.clientX - (r.left + r.width / 2);
        const my = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${mx * 0.18}px, ${my * 0.28}px)`;
      });
      el.addEventListener('mouseleave', () => { el.style.transform = ''; });
    });
  }

  /* ---------- Rubik's cube (CSS 3D) ---------- */
  const cubeRoot = document.getElementById('cube');
  const cubeStage = document.querySelector('.cube-stage');
  if (cubeRoot) {
    const AXES = {
      front:  { cls: '' },
      back:   { cls: 'f-ink' },
      right:  { cls: 'f-accent' },
      left:   { cls: 'f-soft' },
      top:    { cls: 'f-ink' },
      bottom: { cls: '' },
    };
    const VARIANTS = {
      front:  ['direct', 'vague', 'multi', 'hostile', 'polite', 'inject', 'contra', 'partial', 'long'],
      back:   ['t+0ms', 't+50', 't+200', 't+500', 't+1s', 't+5s', 't+30s', 'race', 'delay'],
      right:  ['200', '429', '500', 'timeout', 'after✓', 'malformed', 'stale', 'partial', 'flap'],
      left:   ['exact', 'similar', 'dup-email', 'archived', 'cross-t', 'deleted', 'merged', 'alias', 'unknown'],
      top:    ['clean', 'missing', 'duplicate', 'stale', 'cross-t', 'archived', 'corrupt', 'null', 'sparse'],
      bottom: ['none', 'inject', 'leak', 'pii', 'exfil', 'jailbreak', 'spam', 'replay', 'spoof'],
    };

    // Wrap the cube in a parallax-tilt layer so mouse-driven tilt composes
    // with the inner continuous-spin animation without overriding it.
    const tilt = document.createElement('div');
    tilt.className = 'cube-tilt';
    cubeRoot.parentNode.insertBefore(tilt, cubeRoot);
    tilt.appendChild(cubeRoot);

    // Cubelet data — store grid coords so we can compute slice membership later.
    const cubelets = [];
    const baseTransform = (x, y, z) =>
      `translate3d(calc(${x} * var(--step)), calc(${y} * var(--step)), calc(${z} * var(--step)))`;

    let idx = 0;
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const el = document.createElement('div');
          el.className = 'cubelet';
          el.style.transform = baseTransform(x, y, z);

          const faces = [
            { key: 'front',  visible: z === 1 },
            { key: 'back',   visible: z === -1 },
            { key: 'right',  visible: x === 1 },
            { key: 'left',   visible: x === -1 },
            { key: 'top',    visible: y === -1 },
            { key: 'bottom', visible: y === 1 },
          ];
          faces.forEach(f => {
            const face = document.createElement('div');
            face.className = `face ${f.key}`;
            if (f.visible) {
              const axis = AXES[f.key];
              if (axis.cls) face.classList.add(axis.cls);
              const variant = VARIANTS[f.key][idx % VARIANTS[f.key].length];
              face.innerHTML = `<span>${variant}</span>`;
            } else {
              face.style.background = 'var(--bg)';
              face.style.opacity = '0.4';
            }
            el.appendChild(face);
          });

          cubeRoot.appendChild(el);
          cubelets.push({ el, x, y, z });
          idx++;
        }
      }
    }

    /* ---------- Slice rotation engine ----------
       rotateSlice('y', -1, 90)
         → rotates the top layer 90° around Y, snaps back after a hold.
       The rotation is applied per-cubelet: rotation FIRST, then translate,
       so each cubelet ends up in the layer's rotated position with the
       correct face orientation. All cubelets in the slice get the same
       transform composition, so they move as a coherent layer. */

    const sliceLock = { busy: false };

    function setTransition(el, ms) {
      el.style.transition = `transform ${ms}ms cubic-bezier(.2,.7,.2,1)`;
    }

    function applyRotated(c, axis, deg) {
      const rot = axis === 'x' ? `rotateX(${deg}deg)` :
                  axis === 'y' ? `rotateY(${deg}deg)` :
                                `rotateZ(${deg}deg)`;
      c.el.style.transform = `${rot} ${baseTransform(c.x, c.y, c.z)}`;
    }

    function applyBase(c) {
      c.el.style.transform = baseTransform(c.x, c.y, c.z);
    }

    function rotateSlice(axis, layer, deg, ms = 600) {
      return new Promise(resolve => {
        const targets = cubelets.filter(c => c[axis] === layer);
        targets.forEach(c => {
          setTransition(c.el, ms);
          applyRotated(c, axis, deg);
        });
        // Halo the rotating slice with an accent outline mid-turn for emphasis.
        targets.forEach(c => {
          c.el.querySelectorAll('.face').forEach(f => {
            f.style.boxShadow = 'inset 0 0 0 1.5px var(--accent)';
          });
        });
        setTimeout(() => {
          targets.forEach(c => {
            c.el.querySelectorAll('.face').forEach(f => { f.style.boxShadow = ''; });
          });
          resolve(targets);
        }, ms);
      });
    }

    function resetSlice(targets, ms = 500) {
      return new Promise(resolve => {
        targets.forEach(c => {
          setTransition(c.el, ms);
          applyBase(c);
        });
        setTimeout(resolve, ms);
      });
    }

    async function turn(axis, layer, deg, hold = 700, snap = 500) {
      if (sliceLock.busy) return;
      sliceLock.busy = true;
      const targets = await rotateSlice(axis, layer, deg, 600);
      await new Promise(r => setTimeout(r, hold));
      await resetSlice(targets, snap);
      sliceLock.busy = false;
    }

    function randomMove() {
      const axis = ['x', 'y', 'z'][Math.floor(Math.random() * 3)];
      const layer = [-1, 0, 1][Math.floor(Math.random() * 3)];
      const deg = Math.random() > 0.5 ? 90 : -90;
      return { axis, layer, deg };
    }

    async function scramble(count = 5) {
      if (sliceLock.busy) return;
      sliceLock.busy = true;
      cubeRoot.classList.add('scrambling');
      const tempTargets = [];
      for (let i = 0; i < count; i++) {
        const m = randomMove();
        const targets = cubelets.filter(c => c[m.axis] === m.layer);
        targets.forEach(c => {
          setTransition(c.el, 240);
          applyRotated(c, m.axis, m.deg);
        });
        tempTargets.push(targets);
        await new Promise(r => setTimeout(r, 280));
        // Snap this slice back quickly before the next move begins.
        targets.forEach(c => {
          setTransition(c.el, 180);
          applyBase(c);
        });
        await new Promise(r => setTimeout(r, 180));
      }
      cubeRoot.classList.remove('scrambling');
      sliceLock.busy = false;
    }

    /* ---------- Periodic slice turns ---------- */
    if (!reduceMotion) {
      const tick = async () => {
        const m = randomMove();
        await turn(m.axis, m.layer, m.deg);
      };
      setTimeout(tick, 1800);
      setInterval(tick, 4200);
    }

    /* ---------- Click to scramble ---------- */
    cubeRoot.style.pointerEvents = 'auto';
    cubeRoot.addEventListener('click', () => {
      if (reduceMotion) return;
      scramble(5);
    });

    /* ---------- Mouse parallax tilt ---------- */
    if (!isTouch && cubeStage && !reduceMotion) {
      let raf = null;
      let tx = 0, ty = 0, cx = 0, cy = 0;

      cubeStage.addEventListener('mousemove', e => {
        const r = cubeStage.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;   // -0.5 .. 0.5
        const py = (e.clientY - r.top) / r.height - 0.5;
        tx = -py * 18;  // tilt forward/back
        ty = px * 22;   // tilt left/right
        if (!raf) raf = requestAnimationFrame(tilt_tick);
      });
      cubeStage.addEventListener('mouseleave', () => {
        tx = 0; ty = 0;
        if (!raf) raf = requestAnimationFrame(tilt_tick);
      });

      function tilt_tick() {
        cx += (tx - cx) * 0.08;
        cy += (ty - cy) * 0.08;
        tilt.style.setProperty('--tilt-x', cx.toFixed(2) + 'deg');
        tilt.style.setProperty('--tilt-y', cy.toFixed(2) + 'deg');
        if (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05) {
          raf = requestAnimationFrame(tilt_tick);
        } else {
          raf = null;
        }
      }
    }

    /* ---------- Ambient pulse on outer faces (preserved from before) ---------- */
    if (!reduceMotion) {
      const labeled = Array.from(cubeRoot.querySelectorAll('.face'))
        .filter(f => f.firstChild && f.firstChild.nodeName === 'SPAN');
      setInterval(() => {
        if (sliceLock.busy) return; // don't compete with slice rotations
        for (let i = 0; i < 2; i++) {
          const f = labeled[Math.floor(Math.random() * labeled.length)];
          if (!f) continue;
          const original = f.style.boxShadow;
          f.style.transition = 'box-shadow .5s cubic-bezier(.2,.7,.2,1)';
          f.style.boxShadow = 'inset 0 0 0 2px var(--accent)';
          setTimeout(() => { f.style.boxShadow = original || ''; }, 720);
        }
      }, 2600);
    }
  }

  /* ---------- Canvas: scenario clustering 8000 -> 214 ---------- */
  const canvas = document.getElementById('cluster-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let W, H, dpr;
    let points = [];
    let centers = [];
    let phase = 0;  // 0=spawn, 1=cluster, 2=hold, then loop
    let phaseStart = performance.now();

    // Read CSS vars per-frame so theme toggles propagate live.
    function readColors() {
      const css = getComputedStyle(document.documentElement);
      return {
        INK: (css.getPropertyValue('--ink').trim() || '#0a0a0a'),
        ACCENT: (css.getPropertyValue('--accent').trim() || '#ff3b2f'),
        MUTED: (css.getPropertyValue('--muted').trim() || '#6b6b6b'),
        SURFACE: (css.getPropertyValue('--bg-2').trim() || '#ffffff'),
        LINE: (css.getPropertyValue('--line').trim() || '#e6e5e0'),
      };
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.width = rect.width * dpr;
      H = canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      init();
    }

    function init() {
      // Spawn 600 dots (visual stand-in for 8,000+; performance & legibility).
      points = [];
      const N = 600;
      const CLUSTERS = 9;
      centers = [];
      for (let c = 0; c < CLUSTERS; c++) {
        centers.push({
          x: W * (0.12 + 0.76 * Math.random()),
          y: H * (0.18 + 0.64 * Math.random()),
          n: 0,
        });
      }
      for (let i = 0; i < N; i++) {
        const c = i % CLUSTERS;
        centers[c].n++;
        points.push({
          x: Math.random() * W,
          y: Math.random() * H,
          tx: 0, ty: 0,
          cluster: c,
          critical: c === 0 || c === 3, // a couple of "critical" clusters get tinted red
        });
      }
      // Assign target positions tight around each cluster center.
      points.forEach(p => {
        const c = centers[p.cluster];
        const r = (10 + Math.random() * 22) * dpr;
        const a = Math.random() * Math.PI * 2;
        p.tx = c.x + Math.cos(a) * r;
        p.ty = c.y + Math.sin(a) * r;
      });
      phase = 0;
      phaseStart = performance.now();
    }

    function draw(now) {
      const t = (now - phaseStart) / 1000;
      const { INK, ACCENT, MUTED, SURFACE, LINE } = readColors();

      ctx.fillStyle = SURFACE;
      ctx.fillRect(0, 0, W, H);

      // subtle grid background
      ctx.strokeStyle = LINE;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      const step = 40 * dpr;
      for (let x = 0; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      ctx.globalAlpha = 1;

      // Movement & rendering
      let easing;
      if (phase === 0) easing = Math.min(1, t / 1.6);
      else if (phase === 1) easing = 1;
      else easing = 1;

      points.forEach(p => {
        if (phase === 0 || phase === 1) {
          p.x += (p.tx - p.x) * 0.06;
          p.y += (p.ty - p.y) * 0.06;
        }
        const color = p.critical ? ACCENT : INK;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.8 * dpr, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // Cluster rings + labels (only after settle)
      if (phase >= 1) {
        centers.forEach((c, i) => {
          ctx.strokeStyle = (i === 0 || i === 3) ? ACCENT : INK;
          ctx.lineWidth = 1 * dpr;
          ctx.setLineDash([4 * dpr, 4 * dpr]);
          ctx.beginPath();
          ctx.arc(c.x, c.y, 36 * dpr, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = (i === 0 || i === 3) ? ACCENT : MUTED;
          ctx.font = `${10 * dpr}px JetBrains Mono, monospace`;
          ctx.fillText(`#${String(i + 1).padStart(2, '0')} · ${c.n}`, c.x + 42 * dpr, c.y + 4 * dpr);
        });
      }

      // Header label
      ctx.fillStyle = MUTED;
      ctx.font = `${10 * dpr}px JetBrains Mono, monospace`;
      ctx.fillText('SCENARIOS → CLUSTERS', 14 * dpr, 22 * dpr);
      ctx.fillStyle = INK;
      ctx.font = `${11 * dpr}px JetBrains Mono, monospace`;
      ctx.fillText(`${points.length * 14}+ generated → ${points.length} distinct → 9 clusters`, 14 * dpr, 40 * dpr);

      // Phase transitions
      if (phase === 0 && t > 2.2) { phase = 1; phaseStart = now; }
      if (phase === 1 && t > 3.4) { phase = 2; phaseStart = now; }
      if (phase === 2 && t > 4.0) { init(); }

      requestAnimationFrame(draw);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    requestAnimationFrame(draw);
  }

  /* ---------- Reveal on scroll ---------- */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in'));
  }

  /* ---------- Animated counters ---------- */
  const counters = document.querySelectorAll('[data-count]');
  const animateCounter = el => {
    const target = parseInt(el.getAttribute('data-count'), 10) || 0;
    const dur = 1600;
    const start = performance.now();
    const ease = x => 1 - Math.pow(1 - x, 3);
    function step(now) {
      const t = Math.min(1, (now - start) / dur);
      const v = Math.round(target * ease(t));
      el.textContent = v.toLocaleString();
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  };
  if ('IntersectionObserver' in window) {
    const cio = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          animateCounter(e.target);
          cio.unobserve(e.target);
        }
      });
    }, { threshold: 0.4 });
    counters.forEach(c => cio.observe(c));
  } else {
    counters.forEach(animateCounter);
  }

  /* ---------- Waitlist form ---------- */
  const form = document.getElementById('wl-form');
  const thanks = document.getElementById('wl-thanks');
  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const input = form.querySelector('input[type="email"]');
      const email = (input.value || '').trim();
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!ok) {
        input.style.borderColor = 'var(--accent)';
        input.focus();
        return;
      }
      // Local persistence — replace with real endpoint when backend exists.
      try {
        const list = JSON.parse(localStorage.getItem('agentguard.waitlist') || '[]');
        list.push({ email, ts: Date.now() });
        localStorage.setItem('agentguard.waitlist', JSON.stringify(list));
      } catch (_) {}
      form.style.opacity = '0.4';
      form.style.pointerEvents = 'none';
      thanks.classList.add('show');
      thanks.textContent = `✓ ${email} — you're on the list. We'll email when invites open.`;
    });
  }

  /* ---------- Terminal cursor blink (already styled but keep consistent) ---------- */
  const term = document.getElementById('exec-terminal');
  if (term && !reduceMotion) {
    const caret = term.querySelector('.caret');
    if (caret) {
      let on = true;
      setInterval(() => {
        on = !on;
        caret.style.opacity = on ? '1' : '0';
      }, 520);
    }
  }

})();
