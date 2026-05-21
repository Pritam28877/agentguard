/* =========================================================================
   AgentGuard — Product UI Prototype
   Hash routing + interactive elements for the clickable demo.
   ========================================================================= */

(() => {
  'use strict';

  /* ---------- Welcome modal (first visit) ---------- */
  const welcome = document.getElementById('welcome');
  const welcomeClose = document.getElementById('welcome-close');
  try {
    if (!sessionStorage.getItem('agentguard.welcomed')) {
      welcome.classList.add('show');
    }
  } catch (_) {}
  welcomeClose?.addEventListener('click', () => {
    welcome.classList.remove('show');
    try { sessionStorage.setItem('agentguard.welcomed', '1'); } catch (_) {}
  });
  welcome?.addEventListener('click', e => {
    if (e.target === welcome) {
      welcome.classList.remove('show');
      try { sessionStorage.setItem('agentguard.welcomed', '1'); } catch (_) {}
    }
  });
  // ESC to close
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') welcome.classList.remove('show');
  });

  /* ---------- Hash routing ---------- */
  const VIEWS = ['home', 'runs', 'clusters', 'cluster', 'trace', 'model', 'policies', 'ci'];
  const NAV_VIEWS = new Set(['home', 'runs', 'clusters', 'trace', 'model', 'policies', 'ci']);

  function show(view) {
    if (!VIEWS.includes(view)) view = 'home';
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById('view-' + view);
    if (el) el.classList.add('active');

    // Highlight sidebar
    document.querySelectorAll('.nav-item[data-view]').forEach(n => n.classList.remove('active'));
    let navTarget = view;
    // Detail views inherit the parent group highlight
    if (view === 'cluster') navTarget = 'clusters';
    const navEl = document.querySelector('.nav-item[data-view="' + navTarget + '"]');
    if (navEl) navEl.classList.add('active');

    // Scroll main to top on view change
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function currentView() {
    return (location.hash || '#home').replace('#', '');
  }
  show(currentView());
  window.addEventListener('hashchange', () => show(currentView()));

  /* ---------- data-go links: in-app navigation ---------- */
  document.body.addEventListener('click', e => {
    const goEl = e.target.closest('[data-go]');
    if (goEl) {
      e.preventDefault();
      const target = goEl.dataset.go;
      if (target) {
        location.hash = target;
      }
    }
  });

  /* ---------- Risk gauge: animate stroke-dasharray on load ---------- */
  const gauge = document.getElementById('gauge-arc');
  if (gauge) {
    requestAnimationFrame(() => {
      gauge.style.transition = 'stroke-dasharray 1.4s cubic-bezier(.16,1,.3,1)';
      gauge.setAttribute('stroke-dasharray', '92 100');
    });
  }

  /* ---------- Tabs (Home > Active failure clusters) ---------- */
  document.querySelectorAll('.tabs').forEach(group => {
    group.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        group.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
      });
    });
  });

  /* ---------- Toggle switches ---------- */
  document.querySelectorAll('.toggle').forEach(t => {
    t.addEventListener('click', () => {
      t.classList.toggle('on');
      toast(t.classList.contains('on') ? '✓ Enabled' : 'Disabled');
    });
  });

  /* ---------- Trace event selection ---------- */
  document.querySelectorAll('.trace-event').forEach(ev => {
    ev.addEventListener('click', () => {
      document.querySelectorAll('.trace-event').forEach(e => e.classList.remove('selected'));
      ev.classList.add('selected');
    });
  });

  /* ---------- Cmd+K opens fake search ---------- */
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      toast('⌘K · search not wired in prototype', { accent: true });
    }
  });
  document.querySelector('.search-pill')?.addEventListener('click', () => {
    toast('⌘K · search not wired in prototype', { accent: true });
  });

  /* ---------- New-run button → simulated run ---------- */
  document.querySelectorAll('button').forEach(btn => {
    const txt = btn.textContent.trim();
    if (txt.includes('New run') || txt.includes('Run exploration')) {
      btn.addEventListener('click', () => {
        toast('Run R-1843 queued · 8 workers spinning up', { accent: true });
      });
    }
    if (txt.includes('Save & re-run')) {
      btn.addEventListener('click', () => {
        toast('Model saved · re-exploring 214 scenarios', { accent: true });
      });
    }
    if (txt === 'Suppress') {
      btn.addEventListener('click', () => {
        toast('Cluster suppressed for next 7 days');
      });
    }
    if (txt === 'Disconnect' || txt === 'Discard changes') {
      btn.addEventListener('click', () => {
        toast('Prototype only — no-op');
      });
    }
  });

  /* ---------- Cmd+/ to jump views ---------- */
  document.addEventListener('keydown', e => {
    if (e.key >= '1' && e.key <= '7' && (e.metaKey || e.altKey)) {
      e.preventDefault();
      const i = parseInt(e.key, 10) - 1;
      const target = ['home', 'runs', 'clusters', 'trace', 'model', 'policies', 'ci'][i];
      if (target) location.hash = target;
    }
  });

  /* ---------- Toast ---------- */
  let toastTimer = null;
  function toast(msg, opts = {}) {
    const el = document.getElementById('toast');
    if (!el) return;
    if (opts.accent) {
      el.innerHTML = '<span class="accent">●</span> ' + msg;
    } else {
      el.textContent = msg;
    }
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  /* ---------- Theme toggle ---------- */
  // The base script.js wires the toggle for the landing page. The product
  // page shares the same DOM hook, so it already works. Just ensure the
  // .theme-ready class arrives post-paint here too.
  requestAnimationFrame(() => {
    document.documentElement.classList.add('theme-ready');
    document.body.classList.add('theme-ready');
  });

  /* ---------- Project / Org switcher (prototype-only popover) ---------- */
  document.querySelectorAll('.app-switcher .crumb').forEach(c => {
    c.addEventListener('click', () => toast('Project switcher coming in v0.2'));
  });

  /* ---------- Avatar menu ---------- */
  document.querySelector('.avatar')?.addEventListener('click', () => {
    toast('Account menu coming soon');
  });

  /* ---------- Notification icon ---------- */
  document.querySelectorAll('.icon-btn').forEach(b => {
    if (!b.classList.contains('theme-toggle')) {
      b.addEventListener('click', () => toast('2 new alerts · 2 critical clusters', { accent: true }));
    }
  });

  /* ---------- Welcome toast on first nav inside app ---------- */
  let firstNav = true;
  window.addEventListener('hashchange', () => {
    if (firstNav) {
      firstNav = false;
      setTimeout(() => toast('Tip: ⌘1-7 jumps between views'), 500);
    }
  });

})();
