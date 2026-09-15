/* Blocking theme init — include inline in <head> before CSS to prevent FOUC */
(function () {
  try {
    var stored = localStorage.getItem('pypath-theme');
    if (stored === 'dark' || stored === 'light') {
      document.documentElement.setAttribute('data-theme', stored);
    } else if (stored === 'system' && window.matchMedia) {
      document.documentElement.setAttribute(
        'data-theme',
        window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      );
    }
    // Python for Data pages wear their course's colours (pypath-theme.css,
    // html[data-course="data"]). Set here so the first paint is already right.
    if (/^\/data(\.html$|\/)/.test(location.pathname)) {
      document.documentElement.setAttribute('data-course', 'data');
    }
    if (sessionStorage.getItem('pypath-nav') === '1') {
      document.documentElement.classList.add('page-from-nav');
    }
  } catch (e) { /* ignore */ }
})();
