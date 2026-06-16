/* Blocking theme init — include inline in <head> before CSS to prevent FOUC */
(function () {
  try {
    var stored = localStorage.getItem('pypath-theme');
    if (stored === 'dark' || stored === 'light') {
      document.documentElement.setAttribute('data-theme', stored);
      return;
    }
    if (stored === 'system' && window.matchMedia) {
      document.documentElement.setAttribute(
        'data-theme',
        window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      );
    }
  } catch (e) { /* ignore */ }
})();
