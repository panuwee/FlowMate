/* Same-origin content adapter. FlowMate App owns global navigation and auth UI. */
(function () {
  'use strict';
  const page = location.pathname.endsWith('/Activity-Automation.html') ? 'activity-automation' : 'control-center';
  const params = new URLSearchParams(location.search);
  const localDemo = params.get('demo') === '1' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (window.parent === window && !localDemo) {
    const target = new URL('./index.html', location.href);
    params.delete('embedded');
    const query = params.toString();
    target.hash = page + (query || location.hash ? '/' + encodeURIComponent((query ? '?' + query : '') + location.hash) : '');
    location.replace(target.href);
    return;
  }
  document.documentElement.dataset.operationsContent = 'true';
  function appearance() {
    try {
      const theme = window.parent !== window ? window.parent.document.documentElement.dataset.theme : localStorage.getItem('flowmate:appearance:v1');
      document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
    } catch (_) { document.documentElement.dataset.theme = 'light'; }
  }
  appearance();
  if (window.parent === window) return;
  try {
    const observer = new MutationObserver(appearance);
    observer.observe(window.parent.document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
    function syncAddress() {
      // Reject unexpected embedding contexts; never rewrite another product's route.
      if (!window.parent.location.hash.startsWith('#' + page)) return;
      const query = new URLSearchParams(location.search);
      query.delete('embedded');
      const tail = (query.toString() ? '?' + query : '') + location.hash;
      const hash = '#' + page + (tail ? '/' + encodeURIComponent(tail) : '');
      if (window.parent.location.hash !== hash) {
        window.parent.history.replaceState(window.parent.history.state, '', window.parent.location.pathname + window.parent.location.search + hash);
      }
    }
    for (const method of ['pushState', 'replaceState']) {
      const original = history[method].bind(history);
      history[method] = function (...args) { original(...args); syncAddress(); };
    }
    window.addEventListener('popstate', syncAddress);
    window.addEventListener('hashchange', syncAddress);
    document.addEventListener('DOMContentLoaded', () => {
      // Links back to FlowMate must leave the content frame, not nest another app.
      document.querySelectorAll('a[href="./"]').forEach(link => link.target = '_top');
    }, { once: true });
  } catch (_) { /* Standalone fallback retains its own authorization checks. */ }
})();
